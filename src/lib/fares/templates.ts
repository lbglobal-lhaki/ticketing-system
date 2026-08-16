export const CABIN_CLASSES = ["business", "economy"] as const;
export type CabinClassValue = (typeof CABIN_CLASSES)[number];

export function isCabinClass(value: unknown): value is CabinClassValue {
  return value === "business" || value === "economy";
}

export function parseCabin(value: unknown): CabinClassValue {
  return value === "business" ? "business" : "economy";
}

export function cabinLabel(cabin: CabinClassValue | string) {
  return cabin === "business" ? "Business" : "Economy";
}

export type FareReleaseTemplate = {
  cabinClass: CabinClassValue;
  name: string;
  totalSeats: number;
  sortOrder: number;
};

/**
 * Default seat splits for one aircraft.
 *
 * Cabins are sold from the same departure, so these add up to the airframe:
 * 20 business + 120 economy = 140 seats. Prices are left at 0 for the admin.
 */
export const BUSINESS_FARE_TEMPLATE: FareReleaseTemplate[] = [
  { cabinClass: "business", name: "Early Bird", totalSeats: 5, sortOrder: 1 },
  { cabinClass: "business", name: "Business Standard", totalSeats: 10, sortOrder: 2 },
  { cabinClass: "business", name: "Final Release", totalSeats: 5, sortOrder: 3 },
];

export const ECONOMY_FARE_TEMPLATE: FareReleaseTemplate[] = [
  { cabinClass: "economy", name: "Early Bird", totalSeats: 20, sortOrder: 1 },
  { cabinClass: "economy", name: "Economy Standard", totalSeats: 70, sortOrder: 2 },
  { cabinClass: "economy", name: "Final Release", totalSeats: 30, sortOrder: 3 },
];

export function fareTemplateForCabin(cabin: string): FareReleaseTemplate[] {
  if (cabin === "business") return BUSINESS_FARE_TEMPLATE.map((t) => ({ ...t }));
  return ECONOMY_FARE_TEMPLATE.map((t) => ({ ...t }));
}

/** Every cabin's releases for a brand-new flight, business first. */
export function defaultFlightFareTemplate(): FareReleaseTemplate[] {
  return CABIN_CLASSES.flatMap((cabin) => fareTemplateForCabin(cabin));
}

export function totalSeatsFromReleases(
  releases: { totalSeats: number }[],
): number {
  return releases.reduce((sum, r) => sum + r.totalSeats, 0);
}

/** Per-cabin seat totals — the flight's own totals are the sum of these. */
export function seatsByCabin<
  T extends { cabinClass: string; totalSeats: number; remainingSeats: number },
>(releases: T[]) {
  const empty = () => ({ totalSeats: 0, remainingSeats: 0 });
  const out: Record<CabinClassValue, { totalSeats: number; remainingSeats: number }> = {
    business: empty(),
    economy: empty(),
  };
  for (const r of releases) {
    const bucket = out[parseCabin(r.cabinClass)];
    bucket.totalSeats += r.totalSeats;
    bucket.remainingSeats += r.remainingSeats;
  }
  return out;
}

/** Cabins this flight actually sells (has at least one release for). */
export function cabinsOnFlight(
  releases: { cabinClass: string }[],
): CabinClassValue[] {
  const seen = new Set(releases.map((r) => parseCabin(r.cabinClass)));
  return CABIN_CLASSES.filter((c) => seen.has(c));
}
