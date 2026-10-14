import { prisma } from "@/lib/db";
import {
  DEFAULT_CARGO_WEIGHT_OPTIONS,
  type CargoWeightOptionRow,
} from "@/lib/cargo/weightOptions";

function toRow(row: {
  id: string;
  code: string;
  name: string;
  description: string;
  kind: CargoWeightOptionRow["kind"];
  minKg: number;
  maxKg: number | null;
  chargeableKg: number;
  priceCents: number;
  origins: string[];
  sortOrder: number;
  active: boolean;
  updatedAt: Date;
}): CargoWeightOptionRow {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    kind: row.kind,
    minKg: row.minKg,
    maxKg: row.maxKg,
    chargeableKg: row.chargeableKg,
    priceCents: row.priceCents,
    origins: row.origins,
    sortOrder: row.sortOrder,
    active: row.active,
    updatedAt: row.updatedAt.toISOString(),
  };
}

let ensurePromise: Promise<void> | null = null;

/** Seed the published tariff once. Existing rows are never overwritten. */
export async function ensureCargoWeightOptions() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const existing = await prisma.cargoWeightOption.count();
      if (existing > 0) return;
      await prisma.cargoWeightOption.createMany({
        data: DEFAULT_CARGO_WEIGHT_OPTIONS.map((row) => ({
          code: row.code,
          name: row.name,
          description: row.description,
          kind: row.kind,
          minKg: row.minKg,
          maxKg: row.maxKg,
          chargeableKg: row.chargeableKg,
          priceCents: row.priceCents,
          origins: row.origins,
          sortOrder: row.sortOrder,
          active: row.active,
        })),
      });
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  await ensurePromise;
}

export async function listCargoWeightOptionsAdmin(): Promise<
  CargoWeightOptionRow[]
> {
  await ensureCargoWeightOptions();
  const rows = await prisma.cargoWeightOption.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toRow);
}

export async function listSellableCargoWeightOptions(): Promise<
  CargoWeightOptionRow[]
> {
  await ensureCargoWeightOptions();
  const rows = await prisma.cargoWeightOption.findMany({
    where: { active: true, priceCents: { gt: 0 } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toRow);
}
