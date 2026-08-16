import { prisma } from "@/lib/db";

export type FareReleaseRow = {
  id: string;
  cabinClass: string;
  name: string;
  sortOrder: number;
  totalSeats: number;
  remainingSeats: number;
  priceCents: number;
  roundTripPriceCents: number;
  active: boolean;
};

/**
 * Next sellable fare release: earliest sortOrder with seats left and a price
 * set. Always scoped to one cabin — a flight now carries business and economy
 * buckets side by side, and business tiers must never be handed to an economy
 * booking (or vice versa) just because they sort earlier.
 *
 * `roundTrip` looks at the round-trip price instead, so a release priced only
 * for return travel isn't skipped over on a round-trip search.
 */
export function getCurrentFareRelease(
  releases: FareReleaseRow[],
  cabinClass: string,
  opts?: { roundTrip?: boolean },
): FareReleaseRow | null {
  const wanted = cabinClass === "business" ? "business" : "economy";
  const priceOf = (r: FareReleaseRow) =>
    opts?.roundTrip ? r.roundTripPriceCents : r.priceCents;

  const sorted = releases
    .filter((r) => r.active && r.cabinClass === wanted)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    sorted.find((r) => r.remainingSeats > 0 && priceOf(r) > 0) ??
    sorted.find((r) => r.remainingSeats > 0) ??
    null
  );
}

export async function getFlightWithFares(flightId: string) {
  return prisma.flight.findFirst({
    where: { id: flightId, active: true },
    include: {
      fareReleases: { orderBy: { sortOrder: "asc" } },
    },
  });
}

export function syncSeatTotals(releases: { totalSeats: number; remainingSeats: number }[]) {
  return {
    totalSeats: releases.reduce((s, r) => s + r.totalSeats, 0),
    remainingSeats: releases.reduce((s, r) => s + r.remainingSeats, 0),
  };
}
