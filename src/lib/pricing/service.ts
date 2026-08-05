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
 * Pass tripType "round_trip" to use roundTripPriceCents — the full adult
 * package total for the itinerary (same semantics as charter catalogue RT).
 * Callers must not sum outbound + return roundTripPriceCents.
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

/**
 * Resolve outbound/return leg cents for an adult seat.
 *
 * System / paired fare releases store roundTripPriceCents as the **full RT
 * package** (same as online search + charter). Custom walk-in legs are priced
 * per direction and must be summed via one-way amounts.
 */
export function resolveAdultLegFares(input: {
  isRoundTrip: boolean;
  outboundOneWayCents: number;
  outboundRoundTripCents: number;
  returnOneWayCents?: number;
  returnRoundTripCents?: number;
  /** True when either leg was created as an ad-hoc walk-in custom flight. */
  customPerLeg?: boolean;
}): { outboundLegCents: number; returnLegCents: number; unitAdultCents: number } {
  if (!input.isRoundTrip) {
    const outboundLegCents = Math.max(0, input.outboundOneWayCents);
    return {
      outboundLegCents,
      returnLegCents: 0,
      unitAdultCents: outboundLegCents,
    };
  }

  if (input.customPerLeg) {
    const outboundLegCents = Math.max(0, input.outboundOneWayCents);
    const returnLegCents = Math.max(0, input.returnOneWayCents ?? 0);
    return {
      outboundLegCents,
      returnLegCents,
      unitAdultCents: outboundLegCents + returnLegCents,
    };
  }

  const packageCents = Math.max(0, input.outboundRoundTripCents);
  const split = splitRoundTripPackageCents(packageCents);
  return {
    outboundLegCents: split.outboundCents,
    returnLegCents: split.returnCents,
    unitAdultCents: packageCents,
  };
}
