import { prisma } from "@/lib/db";
import { CARGO_CLASSIFICATIONS } from "@/lib/cargo/bookingForm";
import {
  cargoProductIsPriced,
  slugifyCargoName,
  type CargoProductRow,
} from "@/lib/cargo/productPricing";
import { getSiteSettings } from "@/lib/settings";

export type { CargoProductRow } from "@/lib/cargo/productPricing";
export {
  cargoProductIsPriced,
  cargoProductQuoteCents,
  slugifyCargoName,
} from "@/lib/cargo/productPricing";

function toRow(row: {
  id: string;
  name: string;
  slug: string;
  description: string;
  ratePerKgCents: number;
  minChargeCents: number;
  handlingCents: number;
  sortOrder: number;
  active: boolean;
  updatedAt: Date;
}): CargoProductRow {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    ratePerKgCents: row.ratePerKgCents,
    minChargeCents: row.minChargeCents,
    handlingCents: row.handlingCents,
    sortOrder: row.sortOrder,
    active: row.active,
    updatedAt: row.updatedAt.toISOString(),
  };
}

let ensurePromise: Promise<void> | null = null;

/** Seed the enquiry types as sellable products the first time the table is empty. */
export async function ensureCargoProducts() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const existing = await prisma.cargoProduct.count();
      if (existing > 0) return;
      const settings = await getSiteSettings();
      await prisma.cargoProduct.createMany({
        data: CARGO_CLASSIFICATIONS.map((name, index) => ({
          name,
          slug: slugifyCargoName(name),
          description: "",
          ratePerKgCents: settings.cargoRatePerKgCents,
          minChargeCents: settings.cargoMinChargeCents,
          handlingCents: 0,
          sortOrder: index + 1,
          active: true,
        })),
      });
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  await ensurePromise;
}

export async function listCargoProductsAdmin(): Promise<CargoProductRow[]> {
  await ensureCargoProducts();
  const rows = await prisma.cargoProduct.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toRow);
}

export async function listSellableCargoProducts(): Promise<CargoProductRow[]> {
  await ensureCargoProducts();
  const rows = await prisma.cargoProduct.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toRow).filter(cargoProductIsPriced);
}

/** One shop rate. Settings win; otherwise the first priced leftover type. */
export async function getCargoShopRates() {
  const settings = await getSiteSettings();
  if (settings.cargoRatePerKgCents > 0) {
    return {
      cargoRatePerKgCents: settings.cargoRatePerKgCents,
      cargoMinChargeCents: settings.cargoMinChargeCents,
    };
  }
  const product = await prisma.cargoProduct.findFirst({
    where: { active: true, ratePerKgCents: { gt: 0 } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { ratePerKgCents: true, minChargeCents: true },
  });
  return {
    cargoRatePerKgCents:
      product?.ratePerKgCents ?? settings.cargoRatePerKgCents,
    cargoMinChargeCents:
      product?.minChargeCents ?? settings.cargoMinChargeCents,
  };
}
