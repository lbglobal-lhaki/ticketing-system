import { prisma } from "@/lib/db";
import {
  DEFAULT_CARGO_WEIGHT_OPTIONS,
  type CargoWeightOptionRow,
} from "@/lib/cargo/weightOptions";
import { parseCabin } from "@/lib/fares/templates";
import { ensureTicketTypeBaggageDefaults } from "@/lib/fares/baggageAllowance.server";

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
  sellAsCargo: boolean;
  updatedAt: Date;
  ticketAllocations?: {
    cabinClass: string;
    ticketTypeName: string;
  }[];
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
    sellAsCargo: row.sellAsCargo,
    ticketTypes: (row.ticketAllocations ?? []).map((a) => ({
      cabinClass: parseCabin(a.cabinClass),
      name: a.ticketTypeName,
    })),
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
          sellAsCargo: row.sellAsCargo,
        })),
      });
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  await ensurePromise;
}

const allocationSelect = {
  ticketAllocations: {
    select: { cabinClass: true, ticketTypeName: true },
    orderBy: [{ cabinClass: "asc" as const }, { ticketTypeName: "asc" as const }],
  },
};

export async function listCargoWeightOptionsAdmin(): Promise<
  CargoWeightOptionRow[]
> {
  await ensureCargoWeightOptions();
  await ensureTicketTypeBaggageDefaults();
  const rows = await prisma.cargoWeightOption.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: allocationSelect,
  });
  return rows.map(toRow);
}

export async function listSellableCargoWeightOptions(): Promise<
  CargoWeightOptionRow[]
> {
  await ensureCargoWeightOptions();
  const rows = await prisma.cargoWeightOption.findMany({
    where: { active: true, sellAsCargo: true, priceCents: { gt: 0 } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: allocationSelect,
  });
  return rows.map(toRow);
}
