import { buildCharterFareProducts } from "@/lib/fares/charter";
import { getCurrentFareRelease, type FareReleaseRow } from "@/lib/fares/current";
import type { FareProduct } from "@/lib/fares/products";
import { fareProductsForTripType } from "@/lib/fares/products";
import type { CabinClassValue } from "@/lib/fares/templates";
import { buildTicketTypeFareProducts } from "@/lib/fares/ticketTypes";

export type FlightPricingSource = "charter" | "ticket_types";

export type CabinPriceSnapshot = {
  basePriceCents: number;
  displayPriceCents: number;
  baseMarkup: number;
  demandMultiplier: number;
  scarcityMultiplier: number;
  demandScore: number;
  remainingSeats: number;
  totalSeats: number;
  fareReleaseId: string | null;
  fareReleaseName: string | null;
  farePriced: boolean;
};

const emptyMultipliers = {
  baseMarkup: 1,
  demandMultiplier: 1,
  scarcityMultiplier: 1,
  demandScore: 0,
};

/** Lowest sellable ticket-type price for this cabin on this departure. */
export function ticketTypeCabinPrice(
  releases: FareReleaseRow[],
  cabinClass: CabinClassValue,
  seats: { remainingSeats: number; totalSeats: number },
  isRoundTrip: boolean,
): CabinPriceSnapshot {
  const current = getCurrentFareRelease(releases, cabinClass, {
    roundTrip: isRoundTrip,
  });
  const cents = current
    ? isRoundTrip
      ? current.roundTripPriceCents
      : current.priceCents
    : 0;
  return {
    ...emptyMultipliers,
    basePriceCents: cents,
    displayPriceCents: cents,
    remainingSeats: seats.remainingSeats,
    totalSeats: seats.totalSeats,
    fareReleaseId: current?.id ?? null,
    fareReleaseName: current?.name ?? null,
    farePriced: cents > 0,
  };
}

export function charterCabinPrice(
  catalogCents: number | null | undefined,
  seats: { remainingSeats: number; totalSeats: number },
): CabinPriceSnapshot {
  const cents = catalogCents ?? 0;
  return {
    ...emptyMultipliers,
    basePriceCents: cents,
    displayPriceCents: cents,
    remainingSeats: seats.remainingSeats,
    totalSeats: seats.totalSeats,
    fareReleaseId: null,
    fareReleaseName: null,
    farePriced: cents > 0,
  };
}

export function cabinPriceForFlight(input: {
  pricingSource: FlightPricingSource | string;
  releases: FareReleaseRow[];
  cabinClass: CabinClassValue;
  seats: { remainingSeats: number; totalSeats: number };
  isRoundTrip: boolean;
  charterCents: number | null | undefined;
}): CabinPriceSnapshot {
  if (input.pricingSource === "ticket_types") {
    return ticketTypeCabinPrice(
      input.releases,
      input.cabinClass,
      input.seats,
      input.isRoundTrip,
    );
  }
  const charter = charterCabinPrice(input.charterCents, input.seats);
  if (charter.farePriced) return charter;
  // Charter catalogue has no price for this cabin/trip (typical: business
  // round-trip never filled in). Use the flight's ticket types instead of
  // hiding the cabin on search.
  return ticketTypeCabinPrice(
    input.releases,
    input.cabinClass,
    input.seats,
    input.isRoundTrip,
  );
}

export function parsePricingSource(
  raw: unknown,
): FlightPricingSource {
  return raw === "ticket_types" ? "ticket_types" : "charter";
}

export { fareProductsForTripType };

export async function customerFareProductSets(input: {
  pricingSource: FlightPricingSource | string;
  cabinClass: CabinClassValue;
  releases: FareReleaseRow[];
  available: boolean;
}): Promise<{ primary: FareProduct[]; fallback: FareProduct[] }> {
  const ticketTypes = buildTicketTypeFareProducts({
    cabinClass: input.cabinClass,
    releases: input.releases,
    available: input.available,
  });
  if (input.pricingSource === "ticket_types") {
    return { primary: ticketTypes, fallback: ticketTypes };
  }
  const charter = await buildCharterFareProducts({
    cabinClass: input.cabinClass,
    available: input.available,
  });
  return { primary: charter, fallback: ticketTypes };
}

/** Fare cards the customer sees — charter catalogue or this flight's tickets. */
export async function fareProductsForCustomer(input: {
  pricingSource: FlightPricingSource | string;
  cabinClass: CabinClassValue;
  releases: FareReleaseRow[];
  available: boolean;
}): Promise<FareProduct[]> {
  const sets = await customerFareProductSets(input);
  return sets.primary;
}
