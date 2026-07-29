export type PriceBreakdown = {
  basePriceCents: number;
  displayPriceCents: number;
  /** Always 0 — kept for quote snapshot compatibility. */
  baseMarkup: number;
  /** Always 1 — kept for quote snapshot compatibility. */
  demandMultiplier: number;
  /** Always 1 — kept for quote snapshot compatibility. */
  scarcityMultiplier: number;
  demandScore: number;
  remainingSeats: number;
  totalSeats: number;
};
