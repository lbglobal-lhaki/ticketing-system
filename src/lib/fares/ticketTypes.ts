import { cabinLabel, parseCabin } from "@/lib/fares/templates";
import type { FareProduct } from "@/lib/fares/products";
import { fareIsOpenForSale, type FareReleaseRow } from "@/lib/fares/current";
import {
  infantBaggageBullets,
  resolveBaggageAllowance,
  type TicketTypeBaggageAllocationRow,
} from "@/lib/fares/baggageAllowance";

function mealForCabin(cabin: string) {
  return cabin === "business" ? "Business meal included" : "Meal included";
}

/** Turn this flight's ticket types into the fare cards customers pick from. */
export function buildTicketTypeFareProducts(input: {
  cabinClass: "economy" | "business";
  releases: FareReleaseRow[];
  available: boolean;
  allocations?: TicketTypeBaggageAllocationRow[];
}): FareProduct[] {
  const cabin = parseCabin(input.cabinClass);
  const allocations = input.allocations ?? [];

  return input.releases
    .filter((r) => r.active && parseCabin(r.cabinClass) === cabin)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => {
      const priced = r.priceCents > 0 || r.roundTripPriceCents > 0;
      const inStock = r.remainingSeats > 0 && !r.salesClosed;
      const bag = resolveBaggageAllowance(allocations, cabin, r.name);
      return {
        id: r.id,
        code: `ticket:${r.id}`,
        name: r.name,
        cabinLabel: cabinLabel(cabin),
        priceCents: r.priceCents,
        roundTripPriceCents: r.roundTripPriceCents,
        tagline: inStock
          ? `${r.remainingSeats} seat${r.remainingSeats === 1 ? "" : "s"} left`
          : "Sold out",
        recommended: false,
        mostPopular: false,
        available: input.available && priced && inStock,
        highlights: {
          flightChange: "As per fare rules",
          refund: "As per fare rules",
          baggage: bag.checkedLabel,
          cabinBaggage: bag.cabinBagLabel,
          seatSelection: "Standard seat selection",
          meal: mealForCabin(cabin),
        },
        perkLines: [],
        change: { permitted: false, feeLabel: null, bullets: [] },
        refund: { permitted: false, feeLabel: null, bullets: [] },
        baggageBullets: [
          `Checked baggage ${bag.checkedLabel}`,
          `Carry-on (hand luggage) ${bag.cabinBagLabel}`,
          ...infantBaggageBullets(),
        ],
        nameChangeBullets: [],
        noShowBullets: [],
        loyaltyBullets: [],
        notes: "",
      };
    });
}

function sameTicketName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Same-named ticket type on the return leg, if that type still has seats.
 * Round-trip occupies a physical seat on both flights — a sold-out one-way
 * bucket cannot be sold as round-trip, and we do not fall back to a different
 * leftover ticket type.
 */
export function matchingReturnRelease(
  releases: FareReleaseRow[],
  outbound: FareReleaseRow,
  cabinClass: string,
): FareReleaseRow | null {
  const cabin = parseCabin(cabinClass);
  const named = releases.find(
    (r) =>
      r.active &&
      parseCabin(r.cabinClass) === cabin &&
      sameTicketName(r.name, outbound.name),
  );
  if (named) return fareIsOpenForSale(named) ? named : null;
  const sameOrder = releases.find(
    (r) =>
      r.active &&
      parseCabin(r.cabinClass) === cabin &&
      r.sortOrder === outbound.sortOrder &&
      fareIsOpenForSale(r),
  );
  return sameOrder ?? null;
}

/** True when this ticket type can be sold as a round-trip (seats on both legs). */
export function roundTripTicketTypeAvailable(
  outbound: FareReleaseRow,
  returnReleases: FareReleaseRow[],
  cabinClass: string,
) {
  if (!fareIsOpenForSale(outbound)) return false;
  if (outbound.roundTripPriceCents <= 0) return false;
  return matchingReturnRelease(returnReleases, outbound, cabinClass) != null;
}
