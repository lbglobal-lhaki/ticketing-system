import {
  CABIN_CLASSES,
  fareTemplateForCabin,
  parseCabin,
  type CabinClassValue,
} from "@/lib/fares/templates";

/**
 * Pricing coverage for the admin Flights tab.
 *
 * Bulk pricing writes one amount across every flight sharing a cabin + tier
 * name, and its only feedback is a one-shot "applied to N releases" flash.
 * After a couple of runs there is no way to tell which buckets are done, which
 * are still $0, and which ended up with different amounts. This rolls the fare
 * releases already on the page into one row per bucket so that is answerable
 * at a glance.
 */

export type TripPriceMode = "one_way" | "round_trip";

export type CoverageStatus =
  /** No releases with this cabin + name exist on any flight. */
  | "empty"
  /** Every release priced, all at the same amount. */
  | "complete"
  /** Some priced, some still $0. */
  | "partial"
  /** Nothing priced yet. */
  | "unpriced"
  /** All priced, but the amounts disagree. */
  | "mixed";

export type CoverageRow = {
  key: string;
  cabinClass: CabinClassValue;
  name: string;
  /** Releases matching this bucket across every flight passed in. */
  total: number;
  priced: number;
  unpriced: number;
  status: CoverageStatus;
  /** The shared amount when every priced release agrees; null otherwise. */
  amountCents: number | null;
  /** How many different non-zero amounts are in play. */
  distinctAmounts: number;
  /** True for tier names that are not part of the cabin's template. */
  isCustom: boolean;
};

type ReleaseLike = {
  cabinClass: string;
  name: string;
  priceCents: number;
  roundTripPriceCents: number;
};

type FlightLike = { fareReleases: ReleaseLike[] };

function bucketKey(cabin: string, name: string) {
  return `${cabin}:${name}`;
}

function statusFor(total: number, priced: number, distinct: number): CoverageStatus {
  if (total === 0) return "empty";
  if (priced === 0) return "unpriced";
  if (priced < total) return "partial";
  return distinct > 1 ? "mixed" : "complete";
}

/**
 * Rows come from the cabin templates first, in template order, so a bucket
 * nobody has priced yet still shows up instead of being invisible. Tier names
 * found on flights but absent from the templates are returned separately so
 * they are not silently dropped either.
 */
export function buildPricingCoverage(
  flights: FlightLike[],
  mode: TripPriceMode,
): { standard: CoverageRow[]; other: CoverageRow[] } {
  const centsOf = (r: ReleaseLike) =>
    mode === "round_trip" ? r.roundTripPriceCents : r.priceCents;

  // key -> tally. Amounts are counted so "mixed" can report how many differ.
  const tally = new Map<
    string,
    { cabinClass: CabinClassValue; name: string; total: number; amounts: Map<number, number> }
  >();

  for (const flight of flights) {
    for (const release of flight.fareReleases) {
      const cabinClass = parseCabin(release.cabinClass);
      const key = bucketKey(cabinClass, release.name);
      const entry =
        tally.get(key) ??
        { cabinClass, name: release.name, total: 0, amounts: new Map<number, number>() };
      entry.total += 1;
      // 0 means "not priced yet" everywhere else in the app, so it is tracked
      // as absence rather than as an amount.
      const cents = centsOf(release);
      if (cents > 0) {
        entry.amounts.set(cents, (entry.amounts.get(cents) ?? 0) + 1);
      }
      tally.set(key, entry);
    }
  }

  const toRow = (
    key: string,
    cabinClass: CabinClassValue,
    name: string,
    isCustom: boolean,
  ): CoverageRow => {
    const entry = tally.get(key);
    const total = entry?.total ?? 0;
    const amounts = entry?.amounts ?? new Map<number, number>();
    const priced = [...amounts.values()].reduce((sum, n) => sum + n, 0);
    const distinctAmounts = amounts.size;
    return {
      key,
      cabinClass,
      name,
      total,
      priced,
      unpriced: total - priced,
      status: statusFor(total, priced, distinctAmounts),
      amountCents: distinctAmounts === 1 ? [...amounts.keys()][0]! : null,
      distinctAmounts,
      isCustom,
    };
  };

  const standard: CoverageRow[] = [];
  const templateKeys = new Set<string>();
  for (const cabin of CABIN_CLASSES) {
    for (const tier of fareTemplateForCabin(cabin)) {
      const key = bucketKey(cabin, tier.name);
      templateKeys.add(key);
      standard.push(toRow(key, cabin, tier.name, false));
    }
  }

  const other: CoverageRow[] = [];
  for (const [key, entry] of tally) {
    if (templateKeys.has(key)) continue;
    other.push(toRow(key, entry.cabinClass, entry.name, true));
  }
  other.sort((a, b) =>
    a.cabinClass === b.cabinClass
      ? a.name.localeCompare(b.name)
      : a.cabinClass.localeCompare(b.cabinClass),
  );

  return { standard, other };
}
