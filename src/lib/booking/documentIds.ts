/** IATA-style ticket: 888-2600000007, then 888-2600000008, … */
export const TICKET_AIRLINE_CODE = "888";
export const TICKET_START_SERIAL = 2_600_000_007;

/** Booking refs: LB8941, then LB8942, LB8943, … */
export const BOOKING_REF_PREFIX = "LB";
export const BOOKING_REF_START_SERIAL = 8941;

const TICKET_RE = /^888-(\d{10})$/;
const BOOKING_REF_RE = /^LB(\d+)$/;

type IdStore = {
  booking: {
    findMany: (args: {
      where: { bookingRef?: { startsWith: string }; ticketNumber?: { startsWith: string } };
      select: { bookingRef?: true; ticketNumber?: true };
    }) => Promise<Array<{ bookingRef?: string | null; ticketNumber?: string | null }>>;
  };
  bookingPassenger: {
    findMany: (args: {
      where: Record<string, unknown>;
      select: {
        ticketNumber?: true;
        returnTicketNumber?: true;
        bookingRef?: true;
      };
    }) => Promise<
      Array<{
        ticketNumber?: string | null;
        returnTicketNumber?: string | null;
        bookingRef?: string | null;
      }>
    >;
  };
};

export function formatTicketNumber(serial: number) {
  return `${TICKET_AIRLINE_CODE}-${String(serial).padStart(10, "0")}`;
}

export function parseTicketSerial(ticketNumber: string): number | null {
  const match = ticketNumber.trim().match(TICKET_RE);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

export function formatBookingRef(serial: number) {
  return `${BOOKING_REF_PREFIX}${serial}`;
}

export function parseBookingRefSerial(bookingRef: string): number | null {
  const match = bookingRef.trim().toUpperCase().match(BOOKING_REF_RE);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

async function nextTicketSerial(db: IdStore): Promise<number> {
  const [bookings, passengers] = await Promise.all([
    db.booking.findMany({
      where: { ticketNumber: { startsWith: `${TICKET_AIRLINE_CODE}-` } },
      select: { ticketNumber: true },
    }),
    db.bookingPassenger.findMany({
      where: {
        OR: [
          { ticketNumber: { startsWith: `${TICKET_AIRLINE_CODE}-` } },
          { returnTicketNumber: { startsWith: `${TICKET_AIRLINE_CODE}-` } },
        ],
      },
      select: { ticketNumber: true, returnTicketNumber: true },
    }),
  ]);
  let max = TICKET_START_SERIAL - 1;
  for (const row of bookings) {
    const serial = parseTicketSerial(row.ticketNumber ?? "");
    if (serial != null && serial > max) max = serial;
  }
  for (const row of passengers) {
    for (const value of [row.ticketNumber, row.returnTicketNumber]) {
      const serial = parseTicketSerial(value ?? "");
      if (serial != null && serial > max) max = serial;
    }
  }
  return max + 1;
}

export async function allocateTicketNumbers(
  db: IdStore,
  count: number,
): Promise<string[]> {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  const start = await nextTicketSerial(db);
  return Array.from({ length: n }, (_, i) => formatTicketNumber(start + i));
}

async function nextBookingRefSerial(db: IdStore): Promise<number> {
  const [bookings, passengers] = await Promise.all([
    db.booking.findMany({
      where: { bookingRef: { startsWith: BOOKING_REF_PREFIX } },
      select: { bookingRef: true },
    }),
    db.bookingPassenger.findMany({
      where: { bookingRef: { startsWith: BOOKING_REF_PREFIX } },
      select: { bookingRef: true },
    }),
  ]);
  let max = BOOKING_REF_START_SERIAL - 1;
  for (const row of [...bookings, ...passengers]) {
    const serial = parseBookingRefSerial(row.bookingRef ?? "");
    if (serial != null && serial > max) max = serial;
  }
  return max + 1;
}

export async function allocateBookingRefs(
  db: IdStore,
  count: number,
): Promise<string[]> {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  const start = await nextBookingRefSerial(db);
  return Array.from({ length: n }, (_, i) => formatBookingRef(start + i));
}

export async function allocateBookingRef(db: IdStore): Promise<string> {
  const [ref] = await allocateBookingRefs(db, 1);
  return ref!;
}

export async function allocatePassengerDocumentIds(
  db: IdStore,
  passengerCount: number,
  roundTrip: boolean,
) {
  const n = Math.max(0, Math.floor(passengerCount));
  const bookingRefs = await allocateBookingRefs(db, n);
  const tickets = await allocateTicketNumbers(db, roundTrip ? n * 2 : n);
  return {
    bookingRefs,
    outboundTickets: tickets.slice(0, n),
    returnTickets: roundTrip ? tickets.slice(n) : [],
  };
}

export function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ((error as { code?: unknown }).code === "P2002") return true;
  const msg = error instanceof Error ? error.message : String(error);
  return /unique constraint failed/i.test(msg);
}

export async function retryOnUniqueConflict<T>(
  fn: () => Promise<T>,
  attempts = 8,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (!isUniqueConstraintError(error) || i === attempts - 1) throw error;
    }
  }
  throw last;
}
