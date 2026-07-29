"use server";

import { requireAdmin } from "@/lib/adminAuth";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  bankHoldExpiresAt,
  makeAccessToken,
  makeBookingRef,
  makeInvoiceNumber,
  makeTicketNumber,
} from "@/lib/branding";
import { prisma } from "@/lib/db";
import {
  buildRouteLabel,
  defaultEndorsementText,
  defaultFareCalculationLine,
  defaultInvoiceIdentity,
} from "@/lib/documents/invoiceFields";
import {
  sendBankTransferBundle,
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
  passengerName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  passengerPhone: z.string().trim().max(40).optional().or(z.literal("")),
  passportNumber: z.string().trim().max(40).optional().or(z.literal("")),
  nationality: z.string().trim().max(60).optional().or(z.literal("")),
  seatsBooked: z.coerce.number().int().min(1).max(9),
  paymentMethod: z.enum(["cash", "card", "bank_transfer"]),
});

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
    passengerName: formData.get("passengerName"),
    email: formData.get("email"),
    passengerPhone: formData.get("passengerPhone") || "",
    passportNumber: formData.get("passportNumber") || "",
    nationality: formData.get("nationality") || "",
    seatsBooked: formData.get("seatsBooked") || "1",
    paymentMethod: formData.get("paymentMethod"),
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

  try {
    const flight = await prisma.flight.findFirst({
      where: { id: data.flightId, active: true },
      include: { fareReleases: { orderBy: { sortOrder: "asc" } } },
    });
    if (!flight) throw new Error("Flight not found");

    const outboundCurrent = getCurrentFareRelease(flight.fareReleases);
    if (!outboundCurrent || outboundCurrent.priceCents <= 0) {
      throw new Error("Current fare release is not priced");
    }

    let returnFlight = null;
    let returnCurrent = null;
    if (data.returnFlightId) {
      returnFlight = await prisma.flight.findFirst({
        where: { id: data.returnFlightId, active: true },
        include: { fareReleases: { orderBy: { sortOrder: "asc" } } },
      });
      if (!returnFlight) throw new Error("Return flight not found");
      returnCurrent = getCurrentFareRelease(returnFlight.fareReleases);
      if (!returnCurrent || returnCurrent.priceCents <= 0) {
        throw new Error("Return fare is not priced");
      }
    }

    const outboundPrice = await priceFlight(flight);
    const returnPrice = returnFlight ? await priceFlight(returnFlight) : null;
    if (!outboundPrice.farePriced) throw new Error("Outbound fare unavailable");
    if (returnFlight && returnPrice && !returnPrice.farePriced) {
      throw new Error("Return fare unavailable");
    }

    const fareCents =
      (outboundPrice.displayPriceCents +
        (returnPrice?.displayPriceCents ?? 0)) *
      data.seatsBooked;

    const paidUpfront = data.paymentMethod !== "bank_transfer";
    const fee =
      data.paymentMethod === "card"
        ? calculateCardServiceFee(fareCents)
        : { fareCents, serviceFeeCents: 0, totalCents: fareCents };

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
          fareReleaseName: outboundCurrent.name,
          returnFlightId: returnFlight?.id,
          returnFareReleaseId: returnCurrent?.id,
          tripType: returnFlight ? "round_trip" : "one_way",
          passengerName: data.passengerName,
          email: data.email,
          passengerPhone: data.passengerPhone || "",
          passportNumber: data.passportNumber || "",
          nationality: data.nationality || "",
          seatsBooked: data.seatsBooked,
          amountPaidCents: fee.totalCents,
          serviceFeeCents: fee.serviceFeeCents,
          paymentMethod: data.paymentMethod,
          source: "walk_in",
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
          airfareCents: fee.fareCents,
          airportTaxesCents: 0,
          extraBaggageCents: 0,
          travelInsuranceCents: 0,
          otherChargesCents: 0,
          gstRateBps: 1000,
          gstIncluded: true,
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
            fareCents: fee.fareCents,
          }),
          currency: "AUD",
          bankAccountName: !paidUpfront ? bank?.accountName : null,
          bankBsb: !paidUpfront ? bank?.bsb : null,
          bankAccountNumber: !paidUpfront ? bank?.accountNumber : null,
          bankReference: !paidUpfront ? bookingRef : null,
          customerName: data.passengerName,
          customerEmail: data.email,
          customerPhone: data.passengerPhone || "",
          notes: paidUpfront
            ? `Walk-in booking · paid by ${data.paymentMethod}`
            : "Walk-in booking · awaiting bank transfer (48h hold)",
          dueAt: holdExpiresAt,
          paidAt: paidUpfront ? new Date() : null,
          markedPaidByAdmin: paidUpfront,
        },
      });

      return { booking, invoice };
    });

    try {
      if (paidUpfront) {
        await sendBookingConfirmationBundle(created.booking.id);
      } else {
        await sendBankTransferBundle(created.booking.id);
      }
    } catch (err) {
      console.error("walk-in email failed", err);
    }

    revalidatePath("/admin");
    redirect(
      `/admin?tab=bookings&saved=walk-in&ref=${encodeURIComponent(created.booking.bookingRef)}`,
    );
  } catch (error) {
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

  try {
    await sendBookingConfirmationBundle(id);
  } catch (err) {
    console.error("mark booking paid email failed", err);
  }

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
