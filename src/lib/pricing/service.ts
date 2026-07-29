import { getCurrentFareRelease } from "@/lib/fares/current";
import { prisma } from "@/lib/db";
import type { PriceBreakdown } from "@/lib/pricing/types";

/** Soft-hold / quote cart TTL — not related to dynamic pricing. */
export const QUOTE_TTL_MINUTES = 15;

export function getQuoteTtlMinutes() {
  return QUOTE_TTL_MINUTES;
}

export type FlightPriceResult = PriceBreakdown & {
  fareReleaseId: string | null;
  fareReleaseName: string | null;
  farePriced: boolean;
};

/**
 * Fixed admin price for the current fare release (no demand/scarcity uplift).
 * Online checkout with a charter product still overrides to catalogue price.
 */
export async function priceFlight(flight: {
  id: string;
  remainingSeats: number;
  totalSeats: number;
  fareReleases?: {
    id: string;
    name: string;
    sortOrder: number;
    totalSeats: number;
    remainingSeats: number;
    priceCents: number;
    active: boolean;
  }[];
}): Promise<FlightPriceResult> {
  const releases =
    flight.fareReleases ??
    (await prisma.fareRelease.findMany({
      where: { flightId: flight.id },
      orderBy: { sortOrder: "asc" },
    }));

  const current = getCurrentFareRelease(releases);
  const basePriceCents = current?.priceCents ?? 0;
  const farePriced = Boolean(current && basePriceCents > 0);

  return {
    basePriceCents,
    displayPriceCents: basePriceCents,
    baseMarkup: 0,
    demandMultiplier: 1,
    scarcityMultiplier: 1,
    demandScore: 0,
    remainingSeats: flight.remainingSeats,
    totalSeats: flight.totalSeats,
    fareReleaseId: current?.id ?? null,
    fareReleaseName: current?.name ?? null,
    farePriced,
  };
}
