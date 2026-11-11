import { prisma } from "@/lib/db";
import { restoreFareAndFlight } from "@/lib/booking/inventory";
import {
  assessSeatReturn,
  bookingsOverCapacity,
  canCancelBooking,
  invoiceStatusAfterCancellation,
  seatReturnStatusOnCancel,
  wasBookedOverCapacity,
  type CancellationReasonCode,
  type SectorAssessment,
  type SectorInventory,
} from "@/lib/booking/cancellationPolicy";
import { loadBookingDocumentData } from "@/lib/email/bookingMail";
import { bookingCancelledEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type Db = typeof prisma | Tx;

export class BookingCancellationError extends Error {}

const LIVE_STATUSES = ["pending_payment", "confirmed"] as const;

export type CancelBookingInput = {
  bookingId: string;
  reason: CancellationReasonCode;
  note: string;
  cancelledBy: string;
};

/**
 * Cancels a booking. Seats are deliberately NOT returned here — the booking
 * enters the seat-review queue (Cancellations tab) so an admin can check the
 * flight is not oversold before anything goes back on sale.
 *
 * Concurrency: the status flip is a compare-and-set on the status read at the
 * start of the transaction, so two admins cancelling the same booking at once
 * cannot both succeed.
 */
export async function cancelBooking(input: CancelBookingInput) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: input.bookingId },
      include: { invoice: true },
    });
    if (!booking) throw new BookingCancellationError("Booking not found.");
    if (booking.status === "cancelled") {
      throw new BookingCancellationError(
        `Booking ${booking.bookingRef} is already cancelled.`,
      );
    }
    if (!canCancelBooking(booking.status)) {
      throw new BookingCancellationError(
        `Booking ${booking.bookingRef} cannot be cancelled from status "${booking.status}".`,
      );
    }

    const flipped = await tx.booking.updateMany({
      where: { id: booking.id, status: booking.status },
      data: {
        status: "cancelled",
        holdExpiresAt: null,
        cancelledAt: new Date(),
        cancelledBy: input.cancelledBy,
        cancellationReason: input.reason,
        cancellationNote: input.note,
        cancellationEmailSentAt: null,
        seatReturnStatus: seatReturnStatusOnCancel(booking.status),
        seatsReturnedOutbound: 0,
        seatsReturnedReturn: 0,
        seatReturnDecidedAt: null,
        seatReturnDecidedBy: "",
        seatReturnNote: "",
      },
    });
    if (flipped.count !== 1) {
      throw new BookingCancellationError(
        `Booking ${booking.bookingRef} was changed by someone else. Refresh and try again.`,
      );
    }

    if (booking.invoice) {
      const nextStatus = invoiceStatusAfterCancellation(booking.invoice.status);
      if (nextStatus !== booking.invoice.status) {
        await tx.invoice.update({
          where: { id: booking.invoice.id },
          data: { status: nextStatus },
        });
      }
    }

    return {
      bookingRef: booking.bookingRef,
      seatReviewPending: seatReturnStatusOnCancel(booking.status) === "pending",
    };
  });
}

/* ------------------------------------------------------------ seat review */

/** Seats held by live bookings on each flight, counting both legs. */
async function liveSeatsByFlight(db: Db, flightIds: string[]) {
  const ids = Array.from(new Set(flightIds));
  const totals = new Map<string, number>(ids.map((id) => [id, 0]));
  if (ids.length === 0) return totals;
  const [outbound, inbound] = await Promise.all([
    db.booking.groupBy({
      by: ["flightId"],
      where: { flightId: { in: ids }, status: { in: [...LIVE_STATUSES] } },
      _sum: { seatsBooked: true },
    }),
    db.booking.groupBy({
      by: ["returnFlightId"],
      where: {
        returnFlightId: { in: ids },
        status: { in: [...LIVE_STATUSES] },
      },
      _sum: { seatsBooked: true },
    }),
  ]);
  for (const row of outbound) {
    totals.set(row.flightId, (totals.get(row.flightId) ?? 0) + (row._sum.seatsBooked ?? 0));
  }
  for (const row of inbound) {
    if (!row.returnFlightId) continue;
    totals.set(
      row.returnFlightId,
      (totals.get(row.returnFlightId) ?? 0) + (row._sum.seatsBooked ?? 0),
    );
  }
  return totals;
}

type LiveBooking = {
  id: string;
  bookingRef: string;
  passengerName: string;
  seatsBooked: number;
  createdAt: Date;
  status: string;
};

/** Live bookings on each flight (either leg), oldest first. */
async function liveBookingsByFlight(db: Db, flightIds: string[]) {
  const ids = Array.from(new Set(flightIds));
  const byFlight = new Map<string, LiveBooking[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return byFlight;
  const rows = await db.booking.findMany({
    where: {
      status: { in: [...LIVE_STATUSES] },
      OR: [{ flightId: { in: ids } }, { returnFlightId: { in: ids } }],
    },
    select: {
      id: true,
      bookingRef: true,
      passengerName: true,
      seatsBooked: true,
      createdAt: true,
      status: true,
      flightId: true,
      returnFlightId: true,
    },
    orderBy: { createdAt: "asc" },
  });
  for (const row of rows) {
    const { flightId, returnFlightId, ...booking } = row;
    byFlight.get(flightId)?.push(booking);
    if (returnFlightId) byFlight.get(returnFlightId)?.push(booking);
  }
  return byFlight;
}

const reviewInclude = {
  flight: true,
  returnFlight: true,
  fareRelease: true,
  returnFareRelease: true,
  invoice: { select: { status: true } },
} as const;

type ReviewBooking = NonNullable<
  Awaited<
    ReturnType<
      typeof prisma.booking.findFirst<{ include: typeof reviewInclude }>
    >
  >
>;

export type SeatReviewSector = {
  leg: "outbound" | "return";
  flightNumber: string;
  route: string;
  departureAt: string;
  fareName: string;
  inventory: SectorInventory;
  assessment: SectorAssessment;
  /** Seats actually handed back (decided bookings only). */
  seatsReturned: number;
  /** This booking was taken after the flight was already full. */
  bookedOverCapacity: boolean;
};

function sectorsFor(
  booking: ReviewBooking,
  live: Map<string, number>,
  liveBookings?: Map<string, LiveBooking[]>,
): SeatReviewSector[] {
  const legs = [
    {
      leg: "outbound" as const,
      flight: booking.flight,
      fare: booking.fareRelease,
      returned: booking.seatsReturnedOutbound,
    },
    ...(booking.returnFlight
      ? [
          {
            leg: "return" as const,
            flight: booking.returnFlight,
            fare: booking.returnFareRelease,
            returned: booking.seatsReturnedReturn,
          },
        ]
      : []),
  ];
  return legs.map(({ leg, flight, fare, returned }) => {
    const inventory: SectorInventory = {
      seatsBooked: booking.seatsBooked,
      flightTotalSeats: flight.totalSeats,
      flightRemainingSeats: flight.remainingSeats,
      liveSeatsSold: live.get(flight.id) ?? 0,
      fare: fare
        ? {
            name: fare.name,
            totalSeats: fare.totalSeats,
            remainingSeats: fare.remainingSeats,
            salesClosed: fare.salesClosed,
          }
        : null,
    };
    return {
      leg,
      flightNumber: flight.flightNumber,
      route: `${flight.origin} → ${flight.destination}`,
      departureAt: flight.departureAt.toISOString(),
      fareName: fare?.name ?? "",
      inventory,
      assessment: assessSeatReturn(inventory),
      seatsReturned: returned,
      bookedOverCapacity: wasBookedOverCapacity({
        totalSeats: flight.totalSeats,
        seatsBooked: booking.seatsBooked,
        seatsHeldBefore: (liveBookings?.get(flight.id) ?? [])
          .filter((b) => b.createdAt < booking.createdAt)
          .reduce((sum, b) => sum + b.seatsBooked, 0),
      }),
    };
  });
}

export type SeatReviewRow = {
  id: string;
  bookingRef: string;
  passengerName: string;
  email: string;
  seatsBooked: number;
  bookedAt: string;
  cancelledAt: string | null;
  cancelledBy: string;
  cancellationReason: string;
  cancellationEmailSentAt: string | null;
  invoiceStatus: string | null;
  seatReturnStatus: string;
  seatReturnDecidedAt: string | null;
  seatReturnDecidedBy: string;
  seatReturnNote: string;
  sectors: SeatReviewSector[];
};

/** Every cancelled booking, with live seat-return assessments per sector. */
export async function loadSeatReviewQueue(): Promise<SeatReviewRow[]> {
  const bookings = await prisma.booking.findMany({
    where: { status: "cancelled" },
    include: reviewInclude,
    orderBy: [{ cancelledAt: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  const flightIds = bookings.flatMap((b) => [
    b.flightId,
    ...(b.returnFlightId ? [b.returnFlightId] : []),
  ]);
  const [live, liveBookings] = await Promise.all([
    liveSeatsByFlight(prisma, flightIds),
    liveBookingsByFlight(prisma, flightIds),
  ]);
  return bookings.map((b) => ({
    id: b.id,
    bookingRef: b.bookingRef,
    passengerName: b.passengerName,
    email: b.email,
    seatsBooked: b.seatsBooked,
    bookedAt: b.createdAt.toISOString(),
    cancelledAt: b.cancelledAt?.toISOString() ?? null,
    cancelledBy: b.cancelledBy,
    cancellationReason: b.cancellationReason,
    cancellationEmailSentAt: b.cancellationEmailSentAt?.toISOString() ?? null,
    invoiceStatus: b.invoice?.status ?? null,
    seatReturnStatus: b.seatReturnStatus,
    seatReturnDecidedAt: b.seatReturnDecidedAt?.toISOString() ?? null,
    seatReturnDecidedBy: b.seatReturnDecidedBy,
    seatReturnNote: b.seatReturnNote,
    sectors: sectorsFor(b, live, liveBookings),
  }));
}

export type OverbookedFlight = {
  id: string;
  flightNumber: string;
  route: string;
  departureAt: string;
  totalSeats: number;
  liveSeatsSold: number;
  oversoldBy: number;
  /** Live bookings made after the aircraft was already full, oldest first. */
  bookingsOverCapacity: Array<{
    id: string;
    bookingRef: string;
    passengerName: string;
    seatsBooked: number;
    seatsOverCapacity: number;
    createdAt: string;
    status: string;
  }>;
};

/** Flights (not deleted) whose live bookings exceed the aircraft's seats. */
export async function loadOverbookedFlights(): Promise<OverbookedFlight[]> {
  const flights = await prisma.flight.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      flightNumber: true,
      origin: true,
      destination: true,
      departureAt: true,
      totalSeats: true,
    },
  });
  const live = await liveSeatsByFlight(
    prisma,
    flights.map((f) => f.id),
  );
  const over = flights.filter((f) => (live.get(f.id) ?? 0) > f.totalSeats);
  if (over.length === 0) return [];
  const liveBookings = await liveBookingsByFlight(
    prisma,
    over.map((f) => f.id),
  );
  return over
    .sort((a, b) => a.departureAt.getTime() - b.departureAt.getTime())
    .map((f) => {
      const sold = live.get(f.id) ?? 0;
      return {
        id: f.id,
        flightNumber: f.flightNumber,
        route: `${f.origin} → ${f.destination}`,
        departureAt: f.departureAt.toISOString(),
        totalSeats: f.totalSeats,
        liveSeatsSold: sold,
        oversoldBy: sold - f.totalSeats,
        bookingsOverCapacity: bookingsOverCapacity(
          f.totalSeats,
          liveBookings.get(f.id) ?? [],
        ).map((b) => ({
          id: b.id,
          bookingRef: b.bookingRef,
          passengerName: b.passengerName,
          seatsBooked: b.seatsBooked,
          seatsOverCapacity: b.seatsOverCapacity,
          createdAt: b.createdAt.toISOString(),
          status: b.status,
        })),
      };
    });
}

export type SeatDecisionInput = {
  bookingId: string;
  decision: "return" | "keep";
  /** Seats to return per sector (ignored for "keep"). */
  outbound: number;
  inbound: number;
  note: string;
  decidedBy: string;
};

/**
 * Records the admin's seat decision for a cancelled booking.
 *
 * "return" hands back the requested seats, re-checked against live inventory
 * inside the transaction so a stale screen cannot oversell the flight.
 * "keep" leaves inventory untouched (e.g. the booking was taken on a full
 * flight and those seats never existed).
 */
export async function decideSeatReturn(input: SeatDecisionInput) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: input.bookingId },
      include: reviewInclude,
    });
    if (!booking) throw new BookingCancellationError("Booking not found.");
    if (booking.status !== "cancelled" || booking.seatReturnStatus !== "pending") {
      throw new BookingCancellationError(
        `Booking ${booking.bookingRef} is not awaiting a seat decision.`,
      );
    }

    let outbound = 0;
    let inbound = 0;
    if (input.decision === "return") {
      const live = await liveSeatsByFlight(tx, [
        booking.flightId,
        ...(booking.returnFlightId ? [booking.returnFlightId] : []),
      ]);
      const sectors = sectorsFor(booking, live);
      const requested = { outbound: input.outbound, return: input.inbound };
      for (const sector of sectors) {
        const want = requested[sector.leg];
        if (!Number.isInteger(want) || want < 0) {
          throw new BookingCancellationError("Seat counts must be whole numbers.");
        }
        if (want > sector.assessment.returnable) {
          throw new BookingCancellationError(
            `Only ${sector.assessment.returnable} seat${sector.assessment.returnable === 1 ? "" : "s"} can go back on ${sector.flightNumber} right now. Refresh to see the latest availability.`,
          );
        }
      }
      outbound = input.outbound;
      inbound = booking.returnFlightId ? input.inbound : 0;
      if (outbound + inbound < 1) {
        throw new BookingCancellationError(
          'Choose at least one seat to return, or use "Don\'t return seats".',
        );
      }
    }

    const claimed = await tx.booking.updateMany({
      where: { id: booking.id, status: "cancelled", seatReturnStatus: "pending" },
      data: {
        seatReturnStatus: input.decision === "return" ? "returned" : "not_returned",
        seatsReturnedOutbound: outbound,
        seatsReturnedReturn: inbound,
        seatReturnDecidedAt: new Date(),
        seatReturnDecidedBy: input.decidedBy,
        seatReturnNote: input.note,
      },
    });
    if (claimed.count !== 1) {
      throw new BookingCancellationError(
        `Booking ${booking.bookingRef} was decided by someone else. Refresh to see it.`,
      );
    }

    if (outbound > 0) {
      await restoreFareAndFlight(tx, booking.flightId, booking.fareReleaseId, outbound);
    }
    if (inbound > 0 && booking.returnFlightId) {
      await restoreFareAndFlight(
        tx,
        booking.returnFlightId,
        booking.returnFareReleaseId,
        inbound,
      );
    }

    return { bookingRef: booking.bookingRef, outbound, inbound };
  });
}

/* ------------------------------------------------------------------ email */

/**
 * Emails the customer that their booking is cancelled. Runs after the
 * cancellation has committed — a mail outage must never roll a cancellation
 * back — and records the delivery time for the audit trail.
 */
export async function sendBookingCancelledEmail(
  bookingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      status: true,
      cancellationReason: true,
      cancellationNote: true,
      invoice: { select: { status: true } },
    },
  });
  if (!booking) return { ok: false, error: "Booking not found." };
  if (booking.status !== "cancelled") {
    return {
      ok: false,
      error: "Only cancelled bookings can be sent a cancellation email.",
    };
  }

  const data = await loadBookingDocumentData(bookingId);
  if (!data) return { ok: false, error: "Booking not found." };

  const mail = bookingCancelledEmail(data, {
    reason: booking.cancellationReason,
    note: booking.cancellationNote,
    wasPaid: booking.invoice?.status === "paid",
  });
  const result = await sendEmail({
    to: data.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    mailbox: "ticketing",
  });
  if (!result.ok) return { ok: false, error: result.error };

  await prisma.booking.update({
    where: { id: bookingId },
    data: { cancellationEmailSentAt: new Date() },
  });
  return { ok: true };
}
