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

type FareReleasePriceFields = {
  id: string;
  name: string;
  sortOrder: number;
  totalSeats: number;
  remainingSeats: number;
  priceCents: number;
  roundTripPriceCents: number;
  active: boolean;
};

/**
 * Fixed admin price for the current fare release (no demand/scarcity uplift).
 * Online checkout with a charter product still overrides to catalogue price.
 * Pass tripType "round_trip" to use roundTripPriceCents (per leg).
 */
export async function priceFlight(
  flight: {
    id: string;
    remainingSeats: number;
    totalSeats: number;
    fareReleases?: FareReleasePriceFields[];
  },
  options?: { tripType?: "one_way" | "round_trip" },
): Promise<FlightPriceResult> {
  const releases =
    flight.fareReleases ??
    (await prisma.fareRelease.findMany({
      where: { flightId: flight.id },
      orderBy: { sortOrder: "asc" },
    }));

  const current = getCurrentFareRelease(releases);
  const isRoundTrip = options?.tripType === "round_trip";
  const basePriceCents = current
    ? isRoundTrip
      ? current.roundTripPriceCents
      : current.priceCents
    : 0;
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

/** Split a round-trip package total across outbound / return for invoices. */
export function splitRoundTripPackageCents(totalCents: number): {
  outboundCents: number;
  returnCents: number;
} {
  const outboundCents = Math.floor(totalCents / 2);
  return { outboundCents, returnCents: totalCents - outboundCents };
}
