import { formatAud } from "@/lib/pricing";

export type FarePermitStatus = {
  permitted: boolean;
  feeLabel: string | null;
  bullets: string[];
};

export type FareProductTab = {
  id: string;
  label: string;
};

export type FareProduct = {
  id: string;
  code: string;
  name: string;
  cabinLabel: string;
  priceCents: number;
  /** Full round-trip package total (both legs). 0 = not priced. */
  roundTripPriceCents: number;
  tagline: string;
  recommended: boolean;
  mostPopular: boolean;
  available: boolean;
  highlights: {
    flightChange: string;
    refund: string;
    baggage: string;
    cabinBaggage: string;
    seatSelection: string;
    meal: string;
  };
  perkLines: string[];
  change: FarePermitStatus;
  refund: FarePermitStatus;
  baggageBullets: string[];
  nameChangeBullets: string[];
  noShowBullets: string[];
  loyaltyBullets: string[];
  notes: string;
};

export const FARE_DETAIL_TABS: FareProductTab[] = [
  { id: "change_refund", label: "Flight Change & Refund" },
  { id: "baggage", label: "Baggage" },
  { id: "inclusions", label: "Inclusions" },
  { id: "name_change", label: "Name Change" },
  { id: "no_show", label: "No Show" },
];

export function fareFooterNotes() {
  return [
    "Chartered flight fares shown are per passenger for Perth ⇄ Paro and exclude optional extras unless stated.",
    "Change and refund fees are quoted in AUD. Fare difference may apply when changing flights.",
    "Policies apply to unused tickets; partially used tickets are assessed case by case.",
  ];
}

export function formatFarePrice(cents: number) {
  return formatAud(cents);
}
