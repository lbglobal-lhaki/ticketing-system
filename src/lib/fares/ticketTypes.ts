import { cabinLabel, parseCabin } from "@/lib/fares/templates";
import type { FareProduct } from "@/lib/fares/products";
import type { FareReleaseRow } from "@/lib/fares/current";
import {
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
      const inStock = r.remainingSeats > 0;
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
        ],
        nameChangeBullets: [],
        noShowBullets: [],
        loyaltyBullets: [],
        notes: "",
      };
    });
}

/** Same-named ticket type on the return leg, else the next sellable one. */
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
      r.name.trim().toLowerCase() === outbound.name.trim().toLowerCase(),
  );
  if (named) return named;
  const sameOrder = releases.find(
    (r) =>
      r.active &&
      parseCabin(r.cabinClass) === cabin &&
      r.sortOrder === outbound.sortOrder,
  );
  return sameOrder ?? null;
}
