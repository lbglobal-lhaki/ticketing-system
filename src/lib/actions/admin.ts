"use server";

import { requireAdmin } from "@/lib/adminAuth";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordDeletion } from "@/lib/audit/deletionLog";
import { prisma } from "@/lib/db";
import {
  fareTemplateForCabin,
  totalSeatsFromReleases,
} from "@/lib/fares/templates";
import { flightFormSchema, parseFareReleasesFromForm } from "@/lib/validation";
import { z } from "zod";


function parseDateTimeLocal(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid date/time");
  }
  return d;
}

function redirectFormError(message: string): never {
  redirect(`/admin?tab=form&error=${encodeURIComponent(message)}`);
}

/** "" / self-id / missing => no pairing. */
function parseReturnLegFlightId(
  formData: FormData,
  selfId?: string,
): string | null {
  const raw = String(formData.get("returnLegFlightId") ?? "").trim();
  if (!raw || raw === selfId) return null;
  return raw;
}

export async function createFlightAction(formData: FormData) {
  await requireAdmin();

  const parsed = flightFormSchema.safeParse({
    airline: formData.get("airline"),
    flightNumber: formData.get("flightNumber"),
    origin: formData.get("origin"),
    destination: formData.get("destination"),
    departureAt: formData.get("departureAt"),
    arrivalAt: formData.get("arrivalAt"),
    cabinClass: formData.get("cabinClass"),
  });

  if (!parsed.success) {
    redirectFormError(parsed.error.issues[0]?.message ?? "Invalid flight");
  }

  const data = parsed.data;
  if (data.origin === data.destination) {
    redirectFormError("From and To must be different");
  }

  let departureAt: Date;
  let arrivalAt: Date;
  try {
    departureAt = parseDateTimeLocal(data.departureAt);
    arrivalAt = parseDateTimeLocal(data.arrivalAt);
  } catch {
    redirectFormError("Invalid departure or arrival time");
  }

  if (arrivalAt <= departureAt) {
    redirectFormError("Arrival must be after departure");
  }

  let releases;
  try {
    releases = parseFareReleasesFromForm(formData);
  } catch (e) {
    redirectFormError(e instanceof Error ? e.message : "Invalid fare releases");
  }

  const totals = {
    totalSeats: totalSeatsFromReleases(releases),
    remainingSeats: releases.reduce((s, r) => s + r.remainingSeats, 0),
  };

  const returnLegFlightId = parseReturnLegFlightId(formData);

  await prisma.flight.create({
    data: {
      airline: data.airline,
      flightNumber: data.flightNumber.toUpperCase(),
      origin: data.origin,
      destination: data.destination,
      departureAt,
      arrivalAt,
      cabinClass: data.cabinClass,
      currency: "AUD",
      totalSeats: totals.totalSeats,
      remainingSeats: totals.remainingSeats,
      active: true,
      returnLegFlightId,
      fareReleases: {
        create: releases.map((r) => ({
          name: r.name,
          sortOrder: r.sortOrder,
          totalSeats: r.totalSeats,
          remainingSeats: r.remainingSeats,
          priceCents: r.priceCents,
          roundTripPriceCents: r.roundTripPriceCents,
          active: true,
        })),
      },
    },
  });

  revalidatePath("/admin");
  revalidatePath("/flights");
  redirect("/admin?tab=flights&saved=added");
}

export async function updateFlightAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin?tab=form&error=Missing+flight");

  const parsed = flightFormSchema.safeParse({
    airline: formData.get("airline"),
    flightNumber: formData.get("flightNumber"),
    origin: formData.get("origin"),
    destination: formData.get("destination"),
    departureAt: formData.get("departureAt"),
    arrivalAt: formData.get("arrivalAt"),
    cabinClass: formData.get("cabinClass"),
  });

  if (!parsed.success) {
    redirectFormError(parsed.error.issues[0]?.message ?? "Invalid flight");
  }

  const data = parsed.data;
  let departureAt: Date;
  let arrivalAt: Date;
  try {
    departureAt = parseDateTimeLocal(data.departureAt);
    arrivalAt = parseDateTimeLocal(data.arrivalAt);
  } catch {
    redirectFormError("Invalid departure or arrival time");
  }

  let releases;
  try {
    releases = parseFareReleasesFromForm(formData);
  } catch (e) {
    redirectFormError(e instanceof Error ? e.message : "Invalid fare releases");
  }

  const totals = {
    totalSeats: totalSeatsFromReleases(releases),
    remainingSeats: releases.reduce((s, r) => s + r.remainingSeats, 0),
  };

  const returnLegFlightId = parseReturnLegFlightId(formData, id);

  await prisma.$transaction(async (tx) => {
    await tx.fareRelease.deleteMany({ where: { flightId: id } });
    await tx.flight.update({
      where: { id },
      data: {
        airline: data.airline,
        flightNumber: data.flightNumber.toUpperCase(),
        origin: data.origin,
        destination: data.destination,
        departureAt,
        arrivalAt,
        cabinClass: data.cabinClass,
        totalSeats: totals.totalSeats,
        remainingSeats: totals.remainingSeats,
        active: true,
        returnLegFlightId,
        fareReleases: {
          create: releases.map((r) => ({
            name: r.name,
            sortOrder: r.sortOrder,
            totalSeats: r.totalSeats,
            remainingSeats: r.remainingSeats,
            priceCents: r.priceCents,
            roundTripPriceCents: r.roundTripPriceCents,
            active: true,
          })),
        },
      },
    });
  });

  revalidatePath("/admin");
  revalidatePath("/flights");
  redirect("/admin?tab=flights&saved=updated");
}

/** Quick price update for one fare release (one-way or round-trip). */
export async function updateFarePriceAction(formData: FormData) {
  await requireAdmin();

  const parsed = z
    .object({
      id: z.string().min(1),
      priceAud: z.coerce.number().min(0),
      priceKind: z.enum(["one_way", "round_trip"]).default("one_way"),
    })
    .safeParse({
      id: formData.get("id"),
      priceAud: formData.get("priceAud"),
      priceKind: formData.get("priceKind") || "one_way",
    });

  if (!parsed.success) {
    redirect(
      `/admin?tab=flights&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid price")}`,
    );
  }

  const priceCents = Math.round(parsed.data.priceAud * 100);
  await prisma.fareRelease.update({
    where: { id: parsed.data.id },
    data:
      parsed.data.priceKind === "round_trip"
        ? { roundTripPriceCents: priceCents }
        : { priceCents },
  });

  revalidatePath("/admin");
  revalidatePath("/flights");
  redirect("/admin?tab=flights&saved=price");
}

/**
 * Sets one price across every flight that shares a fare-tier name — e.g. set
 * "Early Bird" business once and it applies to all 30 business flights in
 * the schedule, instead of opening each flight individually. Scope can be
 * narrowed to only flights still missing a price (the common "finish
 * pricing the reseeded schedule" case) or forced onto every match.
 */
export async function bulkUpdateFareTierPriceAction(formData: FormData) {
  await requireAdmin();

  const parsed = z
    .object({
      cabinClass: z.enum(["economy", "business"]),
      tierName: z.string().min(1),
      priceAud: z.coerce.number().min(0),
      onlyUnpriced: z.coerce.boolean().default(false),
      priceKind: z.enum(["one_way", "round_trip"]).default("one_way"),
    })
    .safeParse({
      cabinClass: formData.get("cabinClass"),
      tierName: formData.get("tierName"),
      priceAud: formData.get("priceAud"),
      onlyUnpriced: formData.get("onlyUnpriced") === "true",
      priceKind: formData.get("priceKind") || "one_way",
    });

  if (!parsed.success) {
    redirect(
      `/admin?tab=flights&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid bulk price")}`,
    );
  }

  const { cabinClass, tierName, priceAud, onlyUnpriced, priceKind } =
    parsed.data;
  const priceCents = Math.round(priceAud * 100);
  const isRoundTrip = priceKind === "round_trip";

  const result = await prisma.fareRelease.updateMany({
    where: {
      name: tierName,
      flight: { cabinClass },
      ...(onlyUnpriced
        ? isRoundTrip
          ? { roundTripPriceCents: 0 }
          : { priceCents: 0 }
        : {}),
    },
    data: isRoundTrip
      ? { roundTripPriceCents: priceCents }
      : { priceCents },
  });

  revalidatePath("/admin");
  revalidatePath("/flights");
  redirect(
    `/admin?tab=flights&saved=bulk-price&count=${result.count}`,
  );
}

export async function removeFlightAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin?error=Missing+flight");

  await prisma.flight.update({
    where: { id },
    data: { active: false },
  });

  revalidatePath("/admin");
  revalidatePath("/flights");
  redirect("/admin?tab=flights&saved=removed");
}

export async function restoreFlightAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin?error=Missing+flight");

  await prisma.flight.update({
    where: { id },
    data: { active: true },
  });

  revalidatePath("/admin");
  revalidatePath("/flights");
  redirect("/admin?tab=flights&saved=restored");
}

/**
 * Permanently deletes one or many flights (accepts one or many `id` fields —
 * powers both the row Delete button and bulk-select delete). Any bookings
 * still pointing at them (as the outbound or return leg) — and their
 * invoices — are deleted along with them; every one of those rows is
 * recorded on the admin Deleted tab first so nothing disappears without a
 * trace.
 */
export async function deleteFlightAction(formData: FormData) {
  await requireAdmin();
  const ids = Array.from(new Set(formData.getAll("id").map(String).filter(Boolean)));
  if (ids.length === 0) redirect("/admin?error=Missing+flight");

  const flights = await prisma.flight.findMany({
    where: { id: { in: ids } },
    include: { fareReleases: true },
  });
  if (flights.length === 0) {
    redirect("/admin?tab=flights&error=Flight(s)+not+found");
  }

  const bookings = await prisma.booking.findMany({
    where: { OR: [{ flightId: { in: ids } }, { returnFlightId: { in: ids } }] },
    include: {
      invoice: true,
      flight: { select: { airline: true, flightNumber: true } },
    },
  });

  await prisma.$transaction(
    async (tx) => {
      for (const booking of bookings) {
        if (booking.invoice) {
          await recordDeletion(
            {
              entityType: "invoice",
              entityId: booking.invoice.id,
              label: booking.invoice.invoiceNumber,
              summary: `Deleted together with flight ${booking.flight.airline} ${booking.flight.flightNumber}`,
              snapshot: booking.invoice,
            },
            tx,
          );
        }
        await recordDeletion(
          {
            entityType: "booking",
            entityId: booking.id,
            label: booking.bookingRef,
            summary: `${booking.passengerName} · deleted together with flight ${booking.flight.airline} ${booking.flight.flightNumber}`,
            snapshot: booking,
          },
          tx,
        );
      }

      for (const flight of flights) {
        const flightBookingCount = bookings.filter(
          (b) => b.flightId === flight.id || b.returnFlightId === flight.id,
        ).length;
        await recordDeletion(
          {
            entityType: "flight",
            entityId: flight.id,
            label: `${flight.airline} ${flight.flightNumber}`,
            summary: `${flight.origin} → ${flight.destination}${
              flightBookingCount
                ? ` · ${flightBookingCount} booking(s) removed with it`
                : ""
            }`,
            snapshot: flight,
          },
          tx,
        );
      }

      if (bookings.length) {
        // Cascades each booking's invoice via the Invoice.bookingId FK.
        await tx.booking.deleteMany({
          where: { id: { in: bookings.map((b) => b.id) } },
        });
      }
      await tx.demandEvent.deleteMany({ where: { flightId: { in: ids } } });
      await tx.priceQuote.deleteMany({
        where: { OR: [{ flightId: { in: ids } }, { returnFlightId: { in: ids } }] },
      });
      // Cascades fareReleases via the FareRelease.flightId FK; clears any
      // round-trip pairing pointing at these via onDelete: SetNull.
      await tx.flight.deleteMany({ where: { id: { in: ids } } });
    },
    { maxWait: 20_000, timeout: 60_000 },
  );

  revalidatePath("/admin");
  revalidatePath("/flights");
  redirect(
    `/admin?tab=flights&saved=${flights.length > 1 ? "flights-deleted" : "deleted"}`,
  );
}

export async function getDefaultFareTemplateAction(cabin: string) {
  return fareTemplateForCabin(cabin);
}
