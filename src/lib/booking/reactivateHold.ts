import { bankHoldExpiresAt } from "@/lib/branding";
import { decrementFareAndFlight } from "@/lib/booking/inventory";
import { prisma } from "@/lib/db";
import { occupiedSeatsForFlight } from "@/lib/seats/occupancy";
import { seatsToReclaim } from "@/lib/booking/cancellationPolicy";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export function bookingNeedsSeatReclaim(status: string) {
  return status === "hold_expired" || status === "cancelled";
}

/**
 * Re-open a bank-transfer booking whose 48h hold lapsed (invoice cancelled,
 * seats returned to the pool). Used when a late payment arrives.
 *
 * Reclaims fare inventory if still available. Map seats that another live
 * booking already took are cleared so two passengers are not assigned the
 * same seat.
 */
export async function reclaimExpiredBookingHold(
  tx: Tx,
  bookingId: string,
  options: { markPaid: boolean },
) {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { invoice: true, passengers: true },
  });
  if (!booking) throw new Error("Booking not found");

  if (bookingNeedsSeatReclaim(booking.status)) {
    // Take back exactly what went back to sale — a cancelled booking whose
    // seats were never returned (review pending / not returned) still holds them.
    const reclaim = seatsToReclaim({
      status: booking.status,
      seatsBooked: booking.seatsBooked,
      hasReturnLeg: Boolean(booking.returnFlightId),
      seatReturnStatus: booking.seatReturnStatus,
      seatsReturnedOutbound: booking.seatsReturnedOutbound,
      seatsReturnedReturn: booking.seatsReturnedReturn,
    });
    if (reclaim.outbound + reclaim.inbound > 0 && !booking.fareReleaseId) {
      throw new Error(
        "Cannot reactivate — this booking has no fare release to hold seats against",
      );
    }
    try {
      const fareIds = [
        booking.fareReleaseId,
        booking.returnFareReleaseId,
      ].filter((id): id is string => Boolean(id));
      const fares = await tx.fareRelease.findMany({
        where: { id: { in: fareIds } },
        select: { id: true, salesClosed: true },
      });
      const closed = new Set(
        fares.filter((f) => f.salesClosed).map((f) => f.id),
      );
      // Closed fares never returned these seats, so they must not be taken again.
      if (
        booking.fareReleaseId &&
        reclaim.outbound > 0 &&
        !closed.has(booking.fareReleaseId)
      ) {
        await decrementFareAndFlight(
          tx,
          booking.flightId,
          booking.fareReleaseId,
          reclaim.outbound,
        );
      }
      if (
        booking.returnFlightId &&
        booking.returnFareReleaseId &&
        reclaim.inbound > 0 &&
        !closed.has(booking.returnFareReleaseId)
      ) {
        await decrementFareAndFlight(
          tx,
          booking.returnFlightId,
          booking.returnFareReleaseId,
          reclaim.inbound,
        );
      }
    } catch {
      throw new Error(
        "Cannot reactivate — those seats have been sold. Create a new booking for the customer.",
      );
    }
    await clearConflictingMapSeats(tx, booking);
  }

  // A cancelled booking whose money was already received goes straight back
  // to confirmed; it must not be dropped onto an unpaid 48h hold.
  const alreadyPaid = booking.invoice
    ? booking.invoice.status === "paid"
    : booking.paymentMethod === "card" || booking.paymentMethod === "cash";
  const clearCancellation = {
    cancelledAt: null,
    cancelledBy: "",
    cancellationReason: "",
    cancellationNote: "",
    cancellationEmailSentAt: null,
    seatReturnStatus: "not_applicable",
    seatsReturnedOutbound: 0,
    seatsReturnedReturn: 0,
    seatReturnDecidedAt: null,
    seatReturnDecidedBy: "",
    seatReturnNote: "",
  };

  if (alreadyPaid && !options.markPaid) {
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: "confirmed", holdExpiresAt: null, ...clearCancellation },
    });
    return;
  }

  if (options.markPaid) {
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: "confirmed", holdExpiresAt: null, ...clearCancellation },
    });
    if (booking.invoice) {
      await tx.invoice.update({
        where: { id: booking.invoice.id },
        data: {
          status: "paid",
          paidAt: booking.invoice.paidAt ?? new Date(),
          markedPaidByAdmin: true,
          pdfBlobUrl: null,
          pdfBlobPathname: null,
        },
      });
    }
    return;
  }

  await tx.booking.update({
    where: { id: booking.id },
    data: {
      status: "pending_payment",
      holdExpiresAt: bankHoldExpiresAt(new Date(), 48),
      ...clearCancellation,
    },
  });
  if (booking.invoice) {
    await tx.invoice.update({
      where: { id: booking.invoice.id },
      data: {
        status: "unpaid",
        paidAt: null,
        markedPaidByAdmin: true,
        pdfBlobUrl: null,
        pdfBlobPathname: null,
      },
    });
  }
}

async function clearConflictingMapSeats(
  tx: Tx,
  booking: {
    id: string;
    flightId: string;
    returnFlightId: string | null;
    passengers: Array<{
      id: string;
      seatOutbound: string;
      seatReturn: string;
    }>;
  },
) {
  const takenOutbound = await occupiedSeatsForFlight(
    { flightId: booking.flightId, leg: "outbound", exceptBookingId: booking.id },
    tx,
  );
  const takenReturn =
    booking.returnFlightId
      ? await occupiedSeatsForFlight(
          {
            flightId: booking.returnFlightId,
            leg: "return",
            exceptBookingId: booking.id,
          },
          tx,
        )
      : new Set<string>();

  for (const pax of booking.passengers) {
    const outbound = (pax.seatOutbound || "").trim().toUpperCase();
    const back = (pax.seatReturn || "").trim().toUpperCase();
    const nextOutbound =
      outbound && takenOutbound.has(outbound) ? "" : pax.seatOutbound;
    const nextReturn = back && takenReturn.has(back) ? "" : pax.seatReturn;
    if (nextOutbound === pax.seatOutbound && nextReturn === pax.seatReturn) {
      continue;
    }
    await tx.bookingPassenger.update({
      where: { id: pax.id },
      data: { seatOutbound: nextOutbound, seatReturn: nextReturn },
    });
  }
}
