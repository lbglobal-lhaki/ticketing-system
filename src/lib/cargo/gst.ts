import { GST_RATE_BPS } from "@/lib/payments/fees";

/** Exclusive Australian GST for taxable cargo charges (1000 bps = 10%). */
export const CARGO_GST_RATE_BPS = GST_RATE_BPS;

export type CargoMoneySnapshot = {
  /** GST-exclusive freight. */
  freightCents: number;
  gstCents: number;
  /** Grand total payable (freight + exclusive GST, or inclusive total). */
  totalCents: number;
  gstRateBps: number;
  gstIncluded: boolean;
};

function roundCents(value: number) {
  return Math.max(0, Math.round(value));
}

/** GST to add on top of a GST-exclusive amount. */
export function exclusiveGstCents(amountCents: number, gstRateBps: number) {
  const amount = roundCents(amountCents);
  if (amount <= 0 || gstRateBps <= 0) return 0;
  return Math.round((amount * gstRateBps) / 10_000);
}

/** GST already embedded in a GST-inclusive amount — never add this on top. */
export function includedGstCents(amountCents: number, gstRateBps: number) {
  const amount = roundCents(amountCents);
  if (amount <= 0 || gstRateBps <= 0) return 0;
  return Math.round((amount * gstRateBps) / (10_000 + gstRateBps));
}

/**
 * Price cargo catalogue charges.
 *
 * Default: published rates are GST-exclusive; 10% GST is added on top.
 * Inclusive mode extracts GST for disclosure and does not tax twice.
 * gstRateBps 0 = GST-free (international / configured exception).
 */
export function priceCargoCharges(input: {
  exclusiveCents: number;
  gstRateBps?: number;
  gstIncluded?: boolean;
}): CargoMoneySnapshot {
  const gstRateBps = Math.max(0, Math.round(input.gstRateBps ?? CARGO_GST_RATE_BPS));
  const gstIncluded = input.gstIncluded === true;
  const amount = roundCents(input.exclusiveCents);

  if (gstRateBps <= 0) {
    return {
      freightCents: amount,
      gstCents: 0,
      totalCents: amount,
      gstRateBps: 0,
      gstIncluded: false,
    };
  }

  if (gstIncluded) {
    const gstCents = includedGstCents(amount, gstRateBps);
    return {
      freightCents: amount - gstCents,
      gstCents,
      totalCents: amount,
      gstRateBps,
      gstIncluded: true,
    };
  }

  const gstCents = exclusiveGstCents(amount, gstRateBps);
  return {
    freightCents: amount,
    gstCents,
    totalCents: amount + gstCents,
    gstRateBps,
    gstIncluded: false,
  };
}

/**
 * Issued-invoice snapshot. Historical rows (freight/gst unset) keep the
 * original quoted total and do not invent a GST line.
 */
export function cargoMoneySnapshot(row: {
  quotedCents: number;
  freightCents?: number | null;
  gstCents?: number | null;
  gstRateBps?: number | null;
}): CargoMoneySnapshot {
  const totalCents = roundCents(row.quotedCents);
  const freightCents = roundCents(row.freightCents ?? 0);
  const gstCents = roundCents(row.gstCents ?? 0);
  const gstRateBps = Math.max(0, Math.round(row.gstRateBps ?? 0));

  if (freightCents > 0 || gstCents > 0) {
    return {
      freightCents: freightCents > 0 ? freightCents : Math.max(0, totalCents - gstCents),
      gstCents,
      totalCents: totalCents > 0 ? totalCents : freightCents + gstCents,
      gstRateBps,
      gstIncluded: false,
    };
  }

  return {
    freightCents: totalCents,
    gstCents: 0,
    totalCents,
    gstRateBps: 0,
    gstIncluded: false,
  };
}

/** Server-only override. `CARGO_GST_BPS=0` treats new cargo as GST-free. */
export function cargoGstRateBpsFromEnv() {
  const raw = process.env.CARGO_GST_BPS?.trim();
  if (!raw) return CARGO_GST_RATE_BPS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return CARGO_GST_RATE_BPS;
  return Math.round(parsed);
}
