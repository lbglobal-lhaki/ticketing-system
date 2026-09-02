/**
 * Card processing surcharge passed through to the customer.
 * Update to match your actual Stripe rate — AU surcharging rules require this
 * to not exceed your real cost of acceptance.
 */
export const CARD_SERVICE_FEE_RATE = 0.022;

/** Exclusive GST rate in basis points (1000 = 10%). */
export const GST_RATE_BPS = 1000;

export type CatalogueFareRef = {
  fareProductCode?: string | null;
  fareProductName?: string | null;
};

/**
 * Saver / Early Bird is sold at the advertised amount. Exclusive 10% GST is
 * only added on Standard (and other non-promotional) catalogue fares.
 */
export function isPromotionalCatalogueFare(input: CatalogueFareRef): boolean {
  const code = (input.fareProductCode ?? "").trim().toLowerCase();
  if (code === "saver") return true;
  const name = (input.fareProductName ?? "").trim().toLowerCase();
  return name === "saver";
}

/** True when checkout / invoice should add 10% GST on top of the fare. */
export function exclusiveGstAppliesToFare(input: CatalogueFareRef): boolean {
  return !isPromotionalCatalogueFare(input);
}

export function catalogueGstInvoiceFields(input: CatalogueFareRef): {
  gstRateBps: number;
  gstIncluded: boolean;
} {
  if (exclusiveGstAppliesToFare(input)) {
    return { gstRateBps: GST_RATE_BPS, gstIncluded: false };
  }
  return { gstRateBps: 0, gstIncluded: false };
}

export function exclusiveGstCents(amountCents: number, includeGst: boolean) {
  if (!includeGst) return 0;
  return Math.round((Math.max(0, amountCents) * GST_RATE_BPS) / 10_000);
}

export type CardFeeOptions = {
  /** When false, skip exclusive GST (promo fare or admin walk-in). Default true. */
  includeGst?: boolean;
};

/**
 * Card checkout total: fare + card surcharge, optionally + exclusive 10% GST
 * on that subtotal (GST added on top — not included in the fare).
 */
export function calculateCardServiceFee(
  fareCents: number,
  options: CardFeeOptions = {},
) {
  const includeGst = options.includeGst !== false;
  const safeFare = Math.max(0, Math.round(fareCents));
  const serviceFeeCents = Math.round(safeFare * CARD_SERVICE_FEE_RATE);
  const taxableCents = safeFare + serviceFeeCents;
  const gstCents = includeGst
    ? Math.round((taxableCents * GST_RATE_BPS) / 10_000)
    : 0;
  return {
    fareCents: safeFare,
    serviceFeeCents,
    gstCents,
    taxableCents,
    totalCents: taxableCents + gstCents,
    ratePercent: 2.2,
    rateLabel: "2.2%",
    gstRatePercent: includeGst ? GST_RATE_BPS / 100 : 0,
    gstRateLabel: `${GST_RATE_BPS / 100}%`,
    includeGst,
  };
}
