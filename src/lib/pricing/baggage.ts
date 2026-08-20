/** Fixed extra-checked-bag price (AUD) charged on every booking. */
export const EXTRA_BAG_AUD = 120;
export const EXTRA_BAG_CENTS = 12_000;

export function extraBaggageCentsForBags(bags: number): number {
  const n = Math.min(20, Math.max(0, Math.floor(Number(bags) || 0)));
  return n * EXTRA_BAG_CENTS;
}
