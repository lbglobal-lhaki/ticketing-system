"use server";

import { requireAdmin } from "@/lib/adminAuth";

import { isRedirectError } from "next/dist/client/components/redirect-error";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import {
  bankHoldExpiresAt,
  makeAccessToken,
  makeBookingRef,
  makeInvoiceNumber,
  makeTicketNumber,
} from "@/lib/branding";
import { recordDeletion } from "@/lib/audit/deletionLog";
import { prisma } from "@/lib/db";
import {
  buildRouteLabel,
  defaultEndorsementText,
  defaultFareCalculationLine,
  defaultInvoiceIdentity,
} from "@/lib/documents/invoiceFields";
import {
  sendBookingConfirmationBundle,
} from "@/lib/email/bookingMail";
import { getCurrentFareRelease } from "@/lib/fares/current";
import {
  getBankTransferDetails,
  isBankTransferConfigured,
} from "@/lib/payments/bank";
import { calculateCardServiceFee } from "@/lib/payments/fees";
import { priceFlight } from "@/lib/pricing/service";
import { z } from "zod";


const walkInSchema = z.object({
  flightId: z.string().min(1),
  returnFlightId: z.string().optional().or(z.literal("")),
  fareProductId: z.string().optional().or(z.literal("")),
  passengerName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  passengerPhone: z.string().trim().max(40).optional().or(z.literal("")),
  passportNumber: z.string().trim().max(40).optional().or(z.literal("")),
  nationality: z.string().trim().max(60).optional().or(z.literal("")),
  seatsBooked: z.coerce.number().int().min(1).max(9),
  paymentMethod: z.enum(["cash", "card", "bank_transfer"]),
  extraBaggageKg: z.coerce.number().int().min(0).max(500).default(0),
  extraBaggageAud: z.coerce.number().min(0).max(100000).default(0),
  bookingSource: z.enum(["walk_in", "online"]).default("walk_in"),
  customPriceAud: z.string().trim().optional().or(z.literal("")),
});

const CUSTOM_FLIGHT_VALUE = "__custom__";

const customFlightSchema = z.object({
  airline: z.string().trim().min(2).max(80),
  flightNumber: z.string().trim().min(2).max(16),
  origin: z.string().trim().length(3).transform((v) => v.toUpperCase()),
  destination: z.string().trim().length(3).transform((v) => v.toUpperCase()),
  departureAt: z.string().min(1),
  arrivalAt: z.string().min(1),
  cabinClass: z.enum(["economy", "business"]),
  priceAud: z.coerce.number().min(0).max(100000),
});

/**
 * Resolves the flightId a walk-in leg should book against. If the admin
 * picked "Custom flight (not in system)", parses the inline fields and
 * creates a one-off, hidden Flight row (sized exactly to `seats`, priced at
 * the admin-entered amount) so the rest of the booking flow — pricing,
 * seat decrement, invoice — works exactly like any other flight.
 */
async function resolveLegFlightId(
  formData: FormData,
  prefix: "outbound" | "return",
  selectedId: string,
  seats: number,
): Promise<string> {
  if (selectedId !== CUSTOM_FLIGHT_VALUE) return selectedId;

  const parsed = customFlightSchema.safeParse({
    airline: formData.get(`${prefix}CustomAirline`),
    flightNumber: formData.get(`${prefix}CustomFlightNumber`),
    origin: formData.get(`${prefix}CustomOrigin`),
    destination: formData.get(`${prefix}CustomDestination`),
    departureAt: formData.get(`${prefix}CustomDepartureAt`),
    arrivalAt: formData.get(`${prefix}CustomArrivalAt`),
    cabinClass: formData.get(`${prefix}CustomCabinClass`),
    priceAud: formData.get(`${prefix}CustomPriceAud`) || "0",
  });
  if (!parsed.success) {
    throw new Error(
      `Custom ${prefix} flight: ${parsed.error.issues[0]?.message ?? "invalid details"}`,
    );
  }
  const data = parsed.data;
  if (data.origin === data.destination) {
    throw new Error(`Custom ${prefix} flight: From and To must be different`);
  }
  const departureAt = new Date(data.departureAt);
  const arrivalAt = new Date(data.arrivalAt);
  if (Number.isNaN(departureAt.getTime()) || Number.isNaN(arrivalAt.getTime())) {
    throw new Error(`Custom ${prefix} flight: invalid departure or arrival time`);
  }
  if (arrivalAt <= departureAt) {
    throw new Error(`Custom ${prefix} flight: arrival must be after departure`);
  }
  if (data.priceAud <= 0) {
    throw new Error(`Custom ${prefix} flight: enter a price above $0`);
  }

  const flight = await prisma.flight.create({
    data: {
      airline: data.airline,
      flightNumber: data.flightNumber.toUpperCase(),
      origin: data.origin,
      destination: data.destination,
      departureAt,
      arrivalAt,
      cabinClass: data.cabinClass,
      currency: "AUD",
      totalSeats: seats,
      remainingSeats: seats,
      // Hidden from public search/results — only reachable via this booking.
      active: false,
      fareReleases: {
        create: {
          name: "Walk-in fare",
          sortOrder: 1,
          totalSeats: seats,
          remainingSeats: seats,
          priceCents: Math.round(data.priceAud * 100),
          active: true,
        },
      },
    },
  });
  return flight.id;
}

async function decrementSeats(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  flightId: string,
  fareReleaseId: string,
  seats: number,
) {
  const fareUpdated = await tx.fareRelease.updateMany({
    where: { id: fareReleaseId, remainingSeats: { gte: seats } },
    data: { remainingSeats: { decrement: seats } },
  });
  if (fareUpdated.count !== 1) {
    throw new Error("Not enough seats in this fare release");
  }
  const flightUpdated = await tx.flight.updateMany({
    where: { id: flightId, remainingSeats: { gte: seats } },
    data: { remainingSeats: { decrement: seats } },
  });
  if (flightUpdated.count !== 1) {
    throw new Error("Not enough seats remaining");
  }
}

export async function createWalkInBookingAction(formData: FormData) {
  await requireAdmin();

  const parsed = walkInSchema.safeParse({
    flightId: formData.get("flightId"),
    returnFlightId: formData.get("returnFlightId") || "",
    fareProductId: formData.get("fareProductId") || "",
    passengerName: formData.get("passengerName"),
    email: formData.get("email"),
    passengerPhone: formData.get("passengerPhone") || "",
    passportNumber: formData.get("passportNumber") || "",
    nationality: formData.get("nationality") || "",
    seatsBooked: formData.get("seatsBooked") || "1",
    paymentMethod: formData.get("paymentMethod"),
    extraBaggageKg: formData.get("extraBaggageKg") || "0",
    extraBaggageAud: formData.get("extraBaggageAud") || "0",
    bookingSource: formData.get("bookingSource") || "walk_in",
    customPriceAud: formData.get("customPriceAud") || "",
  });

  if (!parsed.success) {
    redirect(
      `/admin?tab=bookings&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid walk-in form")}`,
    );
  }

  const data = parsed.data;
  if (data.paymentMethod === "bank_transfer" && !isBankTransferConfigured()) {
    redirect(
      "/admin?tab=bookings&error=Bank+details+not+configured+for+walk-in+bank+transfer",
    );
  }

  // Admin-entered custom total airfare — optional. When set, it fully
  // replaces whatever the system would otherwise charge (the flight's fare
  // release price, or a selected fare tier override), for this booking only.
  const customPriceRaw = data.customPriceAud?.trim();
  let customTotalCents: number | null = null;
  if (customPriceRaw) {
    const amount = Number(customPriceRaw);
    if (!Number.isFinite(amount) || amount < 0) {
      redirect(
        `/admin?tab=bookings&error=${encodeURIComponent(
          "Custom price must be a valid amount ($0 or more)",
        )}`,
      );
    }
    customTotalCents = Math.round(amount * 100);
  }

  try {
    const flightId = await resolveLegFlightId(
      formData,
      "outbound",
      data.flightId,
      data.seatsBooked,
    );
    const returnFlightId = data.returnFlightId
      ? await resolveLegFlightId(
          formData,
          "return",
          data.returnFlightId,
          data.seatsBooked,
        )
      : "";

    const flight = await prisma.flight.findFirst({
      where: { id: flightId },
      include: { fareReleases: { orderBy: { sortOrder: "asc" } } },
    });
    if (!flight) throw new Error("Flight not found");

    // A fare-tier override charges its own catalogue price, and a custom
    // admin price replaces the total outright — in either case the flight's
    // own fare release only needs to exist (to decrement seats against), it
    // doesn't need to be priced itself.
    const usingFareOverride = Boolean(data.fareProductId);
    const usingCustomPrice = customTotalCents !== null;
    const skipsSystemFarePricing = usingFareOverride || usingCustomPrice;

    const outboundCurrent = getCurrentFareRelease(flight.fareReleases);
    if (!outboundCurrent) {
      throw new Error("Outbound flight has no active fare release");
    }
    if (!skipsSystemFarePricing && outboundCurrent.priceCents <= 0) {
      throw new Error(
        "Current fare release is not priced — set a price in Flights, pick a fare tier override, or enter a custom price below",
      );
    }

    let returnFlight = null;
    let returnCurrent = null;
    if (returnFlightId) {
      returnFlight = await prisma.flight.findFirst({
        where: { id: returnFlightId },
        include: { fareReleases: { orderBy: { sortOrder: "asc" } } },
      });
      if (!returnFlight) throw new Error("Return flight not found");
      returnCurrent = getCurrentFareRelease(returnFlight.fareReleases);
      if (!returnCurrent) {
        throw new Error("Return flight has no active fare release");
      }
      if (!skipsSystemFarePricing && returnCurrent.priceCents <= 0) {
        throw new Error(
          "Return fare is not priced — set a price in Flights, pick a fare tier override, or enter a custom price below",
        );
      }
    }

    let outboundLegCents = 0;
    let returnLegCents = 0;
    if (!skipsSystemFarePricing) {
      const outboundPrice = await priceFlight(flight);
      const returnPrice = returnFlight ? await priceFlight(returnFlight) : null;
      if (!outboundPrice.farePriced) {
        throw new Error("Outbound fare unavailable");
      }
      if (returnFlight && returnPrice && !returnPrice.farePriced) {
        throw new Error("Return fare unavailable");
      }
      outboundLegCents = outboundPrice.displayPriceCents;
      returnLegCents = returnPrice?.displayPriceCents ?? 0;
    }

    // Optional fare-tier override — admin can charge a specific charter
    // catalogue price (Saver / Flexi / …) instead of the flight's current
    // fare-release price, same as the online checkout allows.
    let fareProductCode = "";
    let fareProductName = "";
    let outboundReleaseName = outboundCurrent.name;
    if (data.fareProductId) {
      const product = await prisma.charterFareProduct.findFirst({
        where: { id: data.fareProductId, active: true },
      });
      if (!product) throw new Error("Selected fare tier is unavailable");
      if (product.cabinClass !== flight.cabinClass) {
        throw new Error("Selected fare tier does not match the outbound cabin");
      }
      if (returnFlight && returnFlight.cabinClass !== product.cabinClass) {
        throw new Error("Selected fare tier does not match the return cabin");
      }
      fareProductCode = product.code;
      fareProductName = product.name;
      outboundReleaseName = product.name;
      outboundLegCents = product.priceCents;
      if (returnFlight) {
        returnLegCents = product.priceCents;
      }
    }

    // Custom price wins over everything above — it's a flat total for the
    // whole booking (all seats/legs included), not a per-leg or per-seat rate.
    if (usingCustomPrice && !usingFareOverride) {
      outboundReleaseName = "Custom price (admin-set)";
    }

    const flightFareCents = usingCustomPrice
      ? (customTotalCents as number)
      : (outboundLegCents + returnLegCents) * data.seatsBooked;
    const baggageCents = Math.round(data.extraBaggageAud * 100);
    const chargeableSubtotalCents = flightFareCents + baggageCents;

    const paidUpfront = data.paymentMethod !== "bank_transfer";
    const fee =
      data.paymentMethod === "card"
        ? calculateCardServiceFee(chargeableSubtotalCents, {
            includeGst: false,
          })
        : {
            fareCents: chargeableSubtotalCents,
            serviceFeeCents: 0,
            gstCents: 0,
            totalCents: chargeableSubtotalCents,
          };

    const bank = getBankTransferDetails();
    const holdExpiresAt = paidUpfront
      ? null
      : bankHoldExpiresAt(new Date(), 48);

    const created = await prisma.$transaction(async (tx) => {
      await decrementSeats(
        tx,
        flight.id,
        outboundCurrent.id,
        data.seatsBooked,
      );
      if (returnFlight && returnCurrent) {
        await decrementSeats(
          tx,
          returnFlight.id,
          returnCurrent.id,
          data.seatsBooked,
        );
      }

      const bookingRef = makeBookingRef();
      const booking = await tx.booking.create({
        data: {
          quoteId: null,
          flightId: flight.id,
          fareReleaseId: outboundCurrent.id,
          fareReleaseName: outboundReleaseName,
          returnFlightId: returnFlight?.id,
          returnFareReleaseId: returnCurrent?.id,
          tripType: returnFlight ? "round_trip" : "one_way",
          fareProductCode,
          fareProductName,
          extraBaggageKg: data.extraBaggageKg,
          passengerName: data.passengerName,
          email: data.email,
          passengerPhone: data.passengerPhone || "",
          passportNumber: data.passportNumber || "",
          nationality: data.nationality || "",
          seatsBooked: data.seatsBooked,
          amountPaidCents: fee.totalCents,
          serviceFeeCents: fee.serviceFeeCents,
          paymentMethod: data.paymentMethod,
          source: data.bookingSource,
          status: paidUpfront ? "confirmed" : "pending_payment",
          bookingRef,
          ticketNumber: makeTicketNumber(),
          accessToken: makeAccessToken(),
          holdExpiresAt,
        },
      });

      const identity = defaultInvoiceIdentity();
      const tripType = returnFlight ? "round_trip" : "one_way";
      const routeLabel = buildRouteLabel({
        origin: flight.origin,
        destination: flight.destination,
        tripType,
      });
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber: makeInvoiceNumber(),
          bookingId: booking.id,
          paymentMethod: data.paymentMethod,
          status: paidUpfront ? "paid" : "unpaid",
          amountCents: fee.totalCents,
          fareCents: fee.fareCents,
          serviceFeeCents: fee.serviceFeeCents,
          airfareCents: flightFareCents,
          airportTaxesCents: 0,
          extraBaggageCents: baggageCents,
          travelInsuranceCents: 0,
          otherChargesCents: 0,
          gstRateBps: 0,
          gstIncluded: false,
          accountNumber: identity.accountNumber,
          businessTpn: identity.businessTpn,
          routeLabel,
          seatLabel: "",
          nameRef: bookingRef.slice(-7),
          endorsementText: defaultEndorsementText(),
          fareCalculationLine: defaultFareCalculationLine({
            origin: flight.origin,
            destination: flight.destination,
            tripType,
            fareCents: flightFareCents,
          }),
          currency: "AUD",
          bankAccountName: !paidUpfront ? bank?.accountName : null,
          bankBsb: !paidUpfront ? bank?.bsb : null,
          bankAccountNumber: !paidUpfront ? bank?.accountNumber : null,
          bankReference: !paidUpfront ? bookingRef : null,
          customerName: data.passengerName,
          customerEmail: data.email,
          customerPhone: data.passengerPhone || "",
          notes:
            (paidUpfront
              ? `Walk-in booking · paid by ${data.paymentMethod}`
              : "Walk-in booking · awaiting bank transfer (48h hold)") +
            (usingCustomPrice ? " · custom admin-set price" : ""),
          dueAt: holdExpiresAt,
          paidAt: paidUpfront ? new Date() : null,
          markedPaidByAdmin: paidUpfront,
        },
      });

      return { booking, invoice };
    });

    // Do not auto-email travel docs / invoices on walk-in create — admins
    // often need to edit the documents first, then send from the Invoices tab.
    revalidatePath("/admin");
    redirect(
      `/admin?tab=bookings&saved=walk-in&ref=${encodeURIComponent(created.booking.bookingRef)}`,
    );
  } catch (error) {
    // Next.js implements redirect() by throwing — must rethrow so the
    // navigation isn't swallowed and shown as "NEXT_REDIRECT" in the UI.
    if (isRedirectError(error)) throw error;
    redirect(
      `/admin?tab=bookings&error=${encodeURIComponent(
        error instanceof Error ? error.message : "Walk-in booking failed",
      )}`,
    );
  }
}

export async function markBookingPaidAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin?tab=bookings&error=Missing+booking");

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { invoice: true },
  });
  if (!booking) redirect("/admin?tab=bookings&error=Booking+not+found");
  if (booking.status === "hold_expired" || booking.status === "cancelled") {
    redirect(
      "/admin?tab=bookings&error=Cannot+mark+paid+—+this+hold+already+expired+or+was+cancelled",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id },
      data: {
        status: "confirmed",
        holdExpiresAt: null,
      },
    });
    if (booking.invoice) {
      await tx.invoice.update({
        where: { id: booking.invoice.id },
        data: {
          status: "paid",
          paidAt: new Date(),
          markedPaidByAdmin: true,
          pdfBlobUrl: null,
          pdfBlobPathname: null,
        },
      });
    }
  });

  after(async () => {
    try {
      await sendBookingConfirmationBundle(id);
    } catch (err) {
      console.error("mark booking paid email failed", err);
    }
  });

  revalidatePath("/admin");
  redirect("/admin?tab=bookings&saved=booking-paid");
}

export async function markBookingUnpaidAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin?tab=bookings&error=Missing+booking");

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { invoice: true },
  });
  if (!booking?.invoice) {
    redirect("/admin?tab=bookings&error=Booking+or+invoice+not+found");
  }
  if (booking.paymentMethod !== "bank_transfer") {
    redirect(
      "/admin?tab=bookings&error=Only+bank+transfer+bookings+can+be+marked+unpaid",
    );
  }

  const holdExpiresAt =
    booking.holdExpiresAt && booking.holdExpiresAt > new Date()
      ? booking.holdExpiresAt
      : bankHoldExpiresAt(new Date(), 48);

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id },
      data: {
        status: "pending_payment",
        holdExpiresAt,
      },
    });
    await tx.invoice.update({
      where: { id: booking.invoice!.id },
      data: {
        status: "unpaid",
        paidAt: null,
        dueAt: holdExpiresAt,
        markedPaidByAdmin: true,
        pdfBlobUrl: null,
        pdfBlobPathname: null,
      },
    });
  });

  revalidatePath("/admin");
  redirect("/admin?tab=bookings&saved=booking-unpaid");
}

/**
 * Permanently deletes a booking (and its invoice, via DB cascade) — both
 * are recorded on the admin Deleted tab first. Does not restore seat
 * inventory; that stays a separate, explicit decision for ops.
 */
/** Accepts one or many `id` fields — powers both the row Delete button and bulk-select delete. */
export async function deleteBookingAction(formData: FormData) {
  await requireAdmin();
  const ids = Array.from(new Set(formData.getAll("id").map(String).filter(Boolean)));
  if (ids.length === 0) redirect("/admin?tab=bookings&error=Missing+booking");

  const bookings = await prisma.booking.findMany({
    where: { id: { in: ids } },
    include: {
      invoice: true,
      flight: {
        select: {
          airline: true,
          flightNumber: true,
          origin: true,
          destination: true,
        },
      },
      returnFlight: {
        select: {
          airline: true,
          flightNumber: true,
          origin: true,
          destination: true,
        },
      },
    },
  });
  if (bookings.length === 0) {
    redirect("/admin?tab=bookings&error=Booking(s)+not+found");
  }

  await prisma.$transaction(
    async (tx) => {
      for (const booking of bookings) {
        if (booking.invoice) {
          await recordDeletion(
            {
              entityType: "invoice",
              entityId: booking.invoice.id,
              label: booking.invoice.invoiceNumber,
              summary: `Deleted together with booking ${booking.bookingRef}`,
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
            summary: `${booking.passengerName} · ${booking.flight.flightNumber} ${booking.flight.origin}→${booking.flight.destination}${
              booking.returnFlight
                ? ` · ${booking.returnFlight.flightNumber} ${booking.returnFlight.origin}→${booking.returnFlight.destination}`
                : ""
            }`,
            snapshot: booking,
          },
          tx,
        );
      }
      // Invoice.bookingId has onDelete: Cascade — deleting the bookings removes
      // their invoice rows automatically; we've already logged them above.
      await tx.booking.deleteMany({
        where: { id: { in: bookings.map((b) => b.id) } },
      });
    },
    { maxWait: 20_000, timeout: 60_000 },
  );

  revalidatePath("/admin");
  redirect(
    `/admin?tab=bookings&saved=${bookings.length > 1 ? "bookings-deleted" : "booking-deleted"}`,
  );
}
