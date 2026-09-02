import { bankHoldExpiresAt } from "@/lib/branding";
import { decrementFareAndFlight } from "@/lib/booking/inventory";
import { prisma } from "@/lib/db";
import { occupiedSeatsForFlight } from "@/lib/seats/occupancy";

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
    if (!booking.fareReleaseId) {
      throw new Error(
        "Cannot reactivate — this booking has no fare release to hold seats against",
      );
    }
    try {
      await decrementFareAndFlight(
        tx,
        booking.flightId,
        booking.fareReleaseId,
        booking.seatsBooked,
      );
      if (booking.returnFlightId && booking.returnFareReleaseId) {
        await decrementFareAndFlight(
          tx,
          booking.returnFlightId,
          booking.returnFareReleaseId,
          booking.seatsBooked,
        );
      }
    } catch {
      throw new Error(
        "Cannot reactivate — those seats have been sold. Create a new booking for the customer.",
      );
    }
    await clearConflictingMapSeats(tx, booking);
  }

  if (options.markPaid) {
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: "confirmed", holdExpiresAt: null },
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
    return;
  }

  await tx.booking.update({
    where: { id: booking.id },
    data: {
      status: "pending_payment",
      holdExpiresAt: bankHoldExpiresAt(new Date(), 48),
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
