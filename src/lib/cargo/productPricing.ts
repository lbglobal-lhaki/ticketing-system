export type CargoProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  ratePerKgCents: number;
  minChargeCents: number;
  handlingCents: number;
  sortOrder: number;
  active: boolean;
  updatedAt: string;
};

export function slugifyCargoName(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "cargo";
}

export function cargoProductQuoteCents(
  weightKg: number,
  product: {
    ratePerKgCents: number;
    minChargeCents: number;
    handlingCents: number;
  },
) {
  const kg = Number.isFinite(weightKg) ? Math.max(0, Math.floor(weightKg)) : 0;
  const weightCharge = kg * Math.max(0, product.ratePerKgCents);
  const floored = Math.max(weightCharge, Math.max(0, product.minChargeCents));
  return floored + Math.max(0, product.handlingCents);
}

export function cargoProductIsPriced(product: {
  ratePerKgCents: number;
  minChargeCents: number;
  handlingCents: number;
}) {
  return (
    product.ratePerKgCents > 0 ||
    product.minChargeCents > 0 ||
    product.handlingCents > 0
  );
}
