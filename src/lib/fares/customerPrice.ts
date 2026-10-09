import { getCurrentFareRelease, type FareReleaseRow } from "@/lib/fares/current";
import type { FareProduct } from "@/lib/fares/products";
import type { CabinClassValue } from "@/lib/fares/templates";
import { buildTicketTypeFareProducts } from "@/lib/fares/ticketTypes";

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

/** Fare cards the customer picks from — this flight's ticket types. */
export function fareProductsForCustomer(input: {
  cabinClass: CabinClassValue;
  releases: FareReleaseRow[];
  available: boolean;
}): FareProduct[] {
  return buildTicketTypeFareProducts(input);
}
