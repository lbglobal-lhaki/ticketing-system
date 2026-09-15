import { buildCharterFareProducts } from "@/lib/fares/charter";
import { getCurrentFareRelease, type FareReleaseRow } from "@/lib/fares/current";
import type { FareProduct } from "@/lib/fares/products";
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
  return charterCabinPrice(input.charterCents, input.seats);
}

export function parsePricingSource(
  raw: unknown,
): FlightPricingSource {
  return raw === "ticket_types" ? "ticket_types" : "charter";
}

/** Fare cards the customer sees — charter catalogue or this flight's tickets. */
export async function fareProductsForCustomer(input: {
  pricingSource: FlightPricingSource | string;
  cabinClass: CabinClassValue;
  releases: FareReleaseRow[];
  available: boolean;
}): Promise<FareProduct[]> {
  if (input.pricingSource === "ticket_types") {
    return buildTicketTypeFareProducts({
      cabinClass: input.cabinClass,
      releases: input.releases,
      available: input.available,
    });
  }
  return buildCharterFareProducts({
    cabinClass: input.cabinClass,
    available: input.available,
  });
}
