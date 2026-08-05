import { prisma } from "@/lib/db";

export type FareReleaseRow = {
  id: string;
  name: string;
  sortOrder: number;
  totalSeats: number;
  remainingSeats: number;
  priceCents: number;
  roundTripPriceCents: number;
  active: boolean;
};

/** Next sellable fare release: earliest sortOrder with seats left and a price set. */
export function getCurrentFareRelease(
  releases: FareReleaseRow[],
): FareReleaseRow | null {
  const sorted = [...releases]
    .filter((r) => r.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    sorted.find((r) => r.remainingSeats > 0 && r.priceCents > 0) ??
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
