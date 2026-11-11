/**
 * Pure rules for admin booking cancellation — no database access, so they
 * can be unit tested and imported by client components.
 */

export const CANCELLATION_REASONS = [
  {
    code: "customer_request",
    label: "Customer requested cancellation",
    customerText: "at your request",
  },
  {
    code: "payment_not_received",
    label: "Payment not received",
    customerText: "because we did not receive payment for it",
  },
  {
    code: "duplicate",
    label: "Duplicate booking",
    customerText: "because it duplicated another booking made for you",
  },
  {
    code: "schedule_change",
    label: "Flight schedule change",
    customerText: "because of a change to the flight schedule",
  },
  {
    code: "documents",
    label: "Travel documents not provided",
    customerText:
      "because the required travel documents were not provided",
  },
  {
    code: "other",
    label: "Other",
    customerText: "",
  },
] as const;

export type CancellationReasonCode =
  (typeof CANCELLATION_REASONS)[number]["code"];

/** Longest internal note on a seat-return decision. */
export const SEAT_DECISION_NOTE_MAX = 500;

/** Longest note the admin can send to the customer. */
export const CANCELLATION_NOTE_MAX = 1000;

export function isCancellationReason(
  value: string,
): value is CancellationReasonCode {
  return CANCELLATION_REASONS.some((r) => r.code === value);
}

export function cancellationReasonLabel(code: string) {
  return CANCELLATION_REASONS.find((r) => r.code === code)?.label ?? "";
}

/** Customer-facing clause, e.g. "at your request". Empty for unknown/other. */
export function cancellationReasonCustomerText(code: string) {
  return CANCELLATION_REASONS.find((r) => r.code === code)?.customerText ?? "";
}

/** Statuses an admin may cancel from. */
export function canCancelBooking(status: string) {
  return (
    status === "pending_payment" ||
    status === "confirmed" ||
    status === "hold_expired"
  );
}

/* ------------------------------------------------------------ seat review */

export type SeatReturnStatus =
  | "pending"
  | "returned"
  | "not_returned"
  | "not_applicable";

/**
 * Seat-review state a cancellation starts in. Cancelling never returns seats
 * on its own: bookings that still hold seats wait for an admin decision on the
 * Cancellations tab. Expired holds already went back to the pool when they
 * lapsed, so there is nothing to decide.
 */
export function seatReturnStatusOnCancel(status: string): SeatReturnStatus {
  return status === "pending_payment" || status === "confirmed"
    ? "pending"
    : "not_applicable";
}

export function seatReturnStatusLabel(status: string) {
  switch (status) {
    case "pending":
      return "Awaiting review";
    case "returned":
      return "Seats returned";
    case "not_returned":
      return "Seats not returned";
    default:
      return "No seats held";
  }
}

/**
 * Seats a reactivation must take back out of inventory, per sector — exactly
 * what was handed back, never more:
 *  - expired hold: the whole booking went back automatically;
 *  - cancelled, seats returned: only the seats the admin returned;
 *  - cancelled, review pending / not returned: nothing — inventory still
 *    counts them as sold;
 *  - cancelled from an expired hold ("not_applicable"): the whole booking.
 */
export function seatsToReclaim(booking: {
  status: string;
  seatsBooked: number;
  hasReturnLeg: boolean;
  seatReturnStatus: string;
  seatsReturnedOutbound: number;
  seatsReturnedReturn: number;
}) {
  const whole = {
    outbound: booking.seatsBooked,
    inbound: booking.hasReturnLeg ? booking.seatsBooked : 0,
  };
  if (booking.status === "hold_expired") return whole;
  if (booking.status !== "cancelled") return { outbound: 0, inbound: 0 };
  switch (booking.seatReturnStatus) {
    case "returned":
      return {
        outbound: booking.seatsReturnedOutbound,
        inbound: booking.hasReturnLeg ? booking.seatsReturnedReturn : 0,
      };
    case "not_applicable":
      return whole;
    default:
      return { outbound: 0, inbound: 0 };
  }
}

/**
 * Bookings that were taken after the aircraft was already full.
 *
 * Walks the bookings holding seats on a flight in the order they were made
 * and flags each one whose seats land beyond `totalSeats`. Seat releases are
 * not time-stamped, so this is judged against the bookings holding seats now —
 * the practical answer to "which bookings were sold seats that did not exist".
 */
export function bookingsOverCapacity<
  T extends { seatsBooked: number; createdAt: Date | string },
>(totalSeats: number, bookings: T[]) {
  const ordered = [...bookings].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  let running = 0;
  const over: Array<T & { seatsOverCapacity: number }> = [];
  for (const booking of ordered) {
    const before = running;
    running += Math.max(0, booking.seatsBooked);
    if (running > totalSeats) {
      over.push({
        ...booking,
        seatsOverCapacity: Math.min(booking.seatsBooked, running - Math.max(totalSeats, before)),
      });
    }
  }
  return over;
}

/** Whether a booking made at `createdAt` pushed the flight past capacity. */
export function wasBookedOverCapacity(input: {
  totalSeats: number;
  seatsBooked: number;
  /** Seats held by live bookings made before this one. */
  seatsHeldBefore: number;
}) {
  return input.seatsHeldBefore + input.seatsBooked > input.totalSeats;
}

export type SectorInventory = {
  /** Seats this cancelled booking took on the sector. */
  seatsBooked: number;
  flightTotalSeats: number;
  flightRemainingSeats: number;
  /** Seats held by live (pending/confirmed) bookings on the flight, both legs. */
  liveSeatsSold: number;
  /** Null when the booking has no fare release on file. */
  fare: {
    name: string;
    totalSeats: number;
    remainingSeats: number;
    salesClosed: boolean;
  } | null;
};

export type SectorAssessment = {
  /** Most seats that can go back on sale without overselling the flight. */
  returnable: number;
  /** Live bookings beyond the aircraft's capacity (0 = not oversold). */
  oversoldBy: number;
  /** Plain-language reasons the full booking cannot go back, if any. */
  notes: string[];
};

/**
 * How many of a cancelled booking's seats can safely go back on sale.
 *
 * Each bound catches a different way the flight can already be over capacity:
 *  - live bookings alone already fill (or exceed) the aircraft — the booking
 *    was made when the seats were not really there;
 *  - the flight's counter has no room to take them back;
 *  - the ticket type's counter has no room, or the fare is closed (a closed
 *    fare must be reopened deliberately on the Flights tab first).
 */
export function assessSeatReturn(sector: SectorInventory): SectorAssessment {
  const notes: string[] = [];
  const seats = Math.max(0, sector.seatsBooked);
  const oversoldBy = Math.max(0, sector.liveSeatsSold - sector.flightTotalSeats);
  const capacityLeft = Math.max(
    0,
    sector.flightTotalSeats - sector.liveSeatsSold,
  );
  const flightRoom = Math.max(
    0,
    sector.flightTotalSeats - sector.flightRemainingSeats,
  );

  let returnable = Math.min(seats, capacityLeft, flightRoom);

  if (oversoldBy > 0) {
    notes.push(
      `Flight is oversold: ${sector.liveSeatsSold} seats held on a ${sector.flightTotalSeats}-seat flight (${oversoldBy} over).`,
    );
  } else if (capacityLeft < seats) {
    notes.push(
      `Live bookings already fill all but ${capacityLeft} of ${sector.flightTotalSeats} seats.`,
    );
  }
  if (flightRoom < seats) {
    notes.push(
      `Flight inventory can only take back ${flightRoom} seat${flightRoom === 1 ? "" : "s"}.`,
    );
  }

  if (sector.fare) {
    if (sector.fare.salesClosed) {
      returnable = 0;
      notes.push(
        `Ticket type "${sector.fare.name}" is closed for sale — reopen it on the Flights tab to return seats.`,
      );
    } else {
      const fareRoom = Math.max(
        0,
        sector.fare.totalSeats - sector.fare.remainingSeats,
      );
      if (fareRoom < returnable) {
        notes.push(
          `Ticket type "${sector.fare.name}" can only take back ${fareRoom} seat${fareRoom === 1 ? "" : "s"}.`,
        );
      }
      returnable = Math.min(returnable, fareRoom);
    }
  }

  return { returnable, oversoldBy, notes };
}

/**
 * Invoice status after cancellation. Money that was received stays "paid" —
 * refunds are a separate accounting step, and rewriting a paid invoice to
 * "cancelled" would misstate revenue.
 */
export function invoiceStatusAfterCancellation(status: string) {
  return status === "paid" ? "paid" : "cancelled";
}
