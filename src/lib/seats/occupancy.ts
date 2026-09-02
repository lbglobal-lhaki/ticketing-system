import { prisma } from "@/lib/db";
import { allocatesSeat, type TravellerDraft } from "@/lib/booking/passengers";

const LIVE_BOOKING = ["confirmed", "pending_payment"] as const;

function seatsFromDraft(draft: unknown, key: "seatOutbound" | "seatReturn") {
  if (!Array.isArray(draft)) return [] as string[];
  return (draft as TravellerDraft[])
    .filter((t) => allocatesSeat(t.passengerType))
    .map((t) => (t[key] || "").trim().toUpperCase())
    .filter(Boolean);
}

type OccupancyClient = {
  bookingPassenger: {
    findMany: (typeof prisma)["bookingPassenger"]["findMany"];
  };
  priceQuote: {
    findMany: (typeof prisma)["priceQuote"]["findMany"];
  };
};

export async function occupiedSeatsForFlight(
  input: {
    flightId: string;
    leg: "outbound" | "return";
    exceptQuoteId?: string;
    exceptBookingId?: string;
  },
  db: OccupancyClient = prisma,
) {
  const taken = new Set<string>();

  if (input.leg === "outbound") {
    const booked = await db.bookingPassenger.findMany({
      where: {
        allocatesSeat: true,
        seatOutbound: { not: "" },
        booking: {
          flightId: input.flightId,
          status: { in: [...LIVE_BOOKING] },
          ...(input.exceptBookingId
            ? { id: { not: input.exceptBookingId } }
            : {}),
        },
      },
      select: { seatOutbound: true },
    });
    for (const row of booked) {
      if (row.seatOutbound) taken.add(row.seatOutbound.toUpperCase());
    }
  } else {
    const booked = await db.bookingPassenger.findMany({
      where: {
        allocatesSeat: true,
        seatReturn: { not: "" },
        booking: {
          returnFlightId: input.flightId,
          status: { in: [...LIVE_BOOKING] },
          ...(input.exceptBookingId
            ? { id: { not: input.exceptBookingId } }
            : {}),
        },
      },
      select: { seatReturn: true },
    });
    for (const row of booked) {
      if (row.seatReturn) taken.add(row.seatReturn.toUpperCase());
    }
  }

  const quotes = await db.priceQuote.findMany({
    where: {
      status: "active",
      expiresAt: { gt: new Date() },
      id: input.exceptQuoteId ? { not: input.exceptQuoteId } : undefined,
      ...(input.leg === "outbound"
        ? { flightId: input.flightId }
        : { returnFlightId: input.flightId }),
    },
    select: { travellersDraft: true },
  });
  const seatField = input.leg === "outbound" ? "seatOutbound" : "seatReturn";
  for (const q of quotes) {
    for (const id of seatsFromDraft(q.travellersDraft, seatField)) {
      taken.add(id);
    }
  }
  return taken;
}
