import { getBrand } from "@/lib/branding";

const CITY: Record<string, string> = {
  PBH: "Paro",
  PER: "Perth",
  SYD: "Sydney",
  MEL: "Melbourne",
  BNE: "Brisbane",
  SIN: "Singapore",
};

export function cityName(code: string) {
  return CITY[code.toUpperCase()] ?? code.toUpperCase();
}

export function buildRouteLabel(input: {
  origin: string;
  destination: string;
  tripType: "one_way" | "round_trip" | string;
}) {
  const from = cityName(input.origin);
  const to = cityName(input.destination);
  if (input.tripType === "round_trip") {
    return `${from}-${to}-${from}`;
  }
  return `${from}-${to}`;
}

export function invoiceLineSubtotal(lines: {
  airfareCents: number;
  airportTaxesCents: number;
  extraBaggageCents: number;
  travelInsuranceCents: number;
  otherChargesCents: number;
}) {
  return (
    lines.airfareCents +
    lines.airportTaxesCents +
    lines.extraBaggageCents +
    lines.travelInsuranceCents +
    lines.otherChargesCents
  );
}

/** GST portion of a GST-inclusive amount (bps, e.g. 1000 = 10%). */
export function gstIncludedPortion(amountCents: number, gstRateBps: number) {
  if (amountCents <= 0 || gstRateBps <= 0) return 0;
  return Math.round((amountCents * gstRateBps) / (10_000 + gstRateBps));
}

export function gstExclusiveAmount(amountCents: number, gstRateBps: number) {
  if (amountCents <= 0 || gstRateBps <= 0) return 0;
  return Math.round((amountCents * gstRateBps) / 10_000);
}

export function computeInvoiceTotals(input: {
  airfareCents: number;
  airportTaxesCents: number;
  extraBaggageCents: number;
  travelInsuranceCents: number;
  otherChargesCents: number;
  serviceFeeCents?: number;
  gstRateBps?: number;
  gstIncluded?: boolean;
}) {
  const lines = invoiceLineSubtotal(input);
  const serviceFeeCents = input.serviceFeeCents ?? 0;
  const gstRateBps = input.gstRateBps ?? 1000;
  const gstIncluded = input.gstIncluded ?? true;

  const gstCents = gstIncluded
    ? gstIncludedPortion(lines, gstRateBps)
    : gstExclusiveAmount(lines, gstRateBps);

  const subtotalCents = gstIncluded ? lines - gstCents : lines;
  const amountCents = gstIncluded
    ? lines + serviceFeeCents
    : lines + gstCents + serviceFeeCents;

  return {
    linesCents: lines,
    subtotalCents,
    gstCents,
    serviceFeeCents,
    amountCents,
    gstRateBps,
    gstIncluded,
  };
}

export function defaultInvoiceIdentity() {
  const brand = getBrand();
  return {
    accountNumber: brand.invoiceAccountNumber,
    businessTpn: brand.invoiceBusinessTpn,
  };
}

export function displayTicketCode(ticketNumber: string) {
  const cleaned = ticketNumber.replace(/^ET-/i, "").replace(/\D/g, "");
  if (cleaned.length >= 5) return `LBG${cleaned.slice(-5)}`;
  return ticketNumber;
}

export function defaultFareCalculationLine(input: {
  origin: string;
  destination: string;
  tripType: string;
  fareCents: number;
}) {
  const route =
    input.tripType === "round_trip"
      ? `${input.origin}${input.destination}${input.origin}`
      : `${input.origin}${input.destination}`;
  const aud = (input.fareCents / 100).toFixed(2);
  return `${route} ${aud}AUD END`;
}

export function defaultEndorsementText() {
  return "NON-TRANSFERABLE / SUBJECT TO FARE RULES";
}

export function defaultBaggageLabel(cabinClass: string, fareProductName?: string) {
  if (cabinClass === "business") return "2 PIECES (32kg each)";
  if (fareProductName?.toLowerCase().includes("flexi")) return "2 PIECES (23kg each)";
  if (fareProductName?.toLowerCase().includes("full")) return "2 PIECES (23kg each)";
  return "1 PIECE (23kg)";
}

/**
 * Flat white line-icons for the footer contact badges (phone/website/email).
 * Plain SVG instead of emoji — emoji glyphs render as full-color pictures in
 * Chrome's PDF export and look out of place inside a solid brand-colour badge.
 */
export const ICON_PHONE =
  '<svg viewBox="0 0 20 20" width="12" height="12" fill="white"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h1.148a1.5 1.5 0 0 1 1.465 1.175l.716 3.223a1.5 1.5 0 0 1-.54 1.435l-.822.822a11.03 11.03 0 0 0 4.994 4.994l.822-.822a1.5 1.5 0 0 1 1.435-.54l3.223.716A1.5 1.5 0 0 1 18 15.352V16.5a1.5 1.5 0 0 1-1.5 1.5h-1.25C7.545 18 2 12.455 2 5.75V4.5z"/></svg>';

export const ICON_GLOBE =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><line x1="3" y1="12" x2="21" y2="12"/></svg>';

export const ICON_MAIL =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" stroke-width="1.6" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';
