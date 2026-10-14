import { prisma } from "@/lib/db";
import {
  BUSINESS_FARE_TEMPLATE,
  ECONOMY_FARE_TEMPLATE,
  parseCabin,
  type CabinClassValue,
} from "@/lib/fares/templates";
import {
  allowanceFromKg,
  cabinBagKgForCabin,
  fallbackAllowance,
  normalizeTicketTypeName,
  optionAllowanceKg,
  parseTicketTypeKey,
  resolveBaggageAllowance,
  snapshotFromAllowance,
  type BaggageAllowance,
  type TicketTypeBaggageAllocationRow,
  type TicketTypeChoice,
} from "@/lib/fares/baggageAllowance";

const PAX_23 = {
  code: "pax-23",
  name: "23 kg",
  description: "Included checked baggage",
  kind: "fixed" as const,
  minKg: 23,
  maxKg: 23,
  chargeableKg: 23,
  priceCents: 0,
  origins: [] as string[],
  sortOrder: 100,
  active: true,
  sellAsCargo: false,
};

const PAX_40 = {
  code: "pax-40",
  name: "40 kg",
  description: "Included checked baggage",
  kind: "fixed" as const,
  minKg: 40,
  maxKg: 40,
  chargeableKg: 40,
  priceCents: 0,
  origins: [] as string[],
  sortOrder: 101,
  active: true,
  sellAsCargo: false,
};

function toAllocation(row: {
  cabinClass: string;
  ticketTypeName: string;
  ticketTypeKey: string;
  cargoWeightOptionId: string;
  includedKg: number;
  cabinBaggageKg: number;
}): TicketTypeBaggageAllocationRow {
  return {
    cabinClass: parseCabin(row.cabinClass),
    ticketTypeName: row.ticketTypeName,
    ticketTypeKey: row.ticketTypeKey,
    cargoWeightOptionId: row.cargoWeightOptionId,
    includedKg: row.includedKg,
    cabinBaggageKg: row.cabinBaggageKg,
  };
}

let ensurePromise: Promise<void> | null = null;

/** Passenger-only 23/40 kg bands + default ticket-type map, once. */
export async function ensureTicketTypeBaggageDefaults() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const existing = await prisma.cargoWeightOption.findMany({
        where: { code: { in: [PAX_23.code, PAX_40.code] } },
        select: { id: true, code: true },
      });
      const have = new Set(existing.map((r) => r.code));
      if (!have.has(PAX_23.code)) {
        await prisma.cargoWeightOption.create({ data: PAX_23 });
      }
      if (!have.has(PAX_40.code)) {
        await prisma.cargoWeightOption.create({ data: PAX_40 });
      }

      const allocated = await prisma.ticketTypeBaggageAllocation.count();
      if (allocated > 0) return;

      const options = await prisma.cargoWeightOption.findMany({
        where: { code: { in: [PAX_23.code, PAX_40.code] } },
        select: { id: true, code: true, chargeableKg: true, minKg: true, kind: true },
      });
      const byCode = new Map(options.map((o) => [o.code, o]));
      const eco = byCode.get(PAX_23.code);
      const biz = byCode.get(PAX_40.code);
      if (!eco || !biz) return;

      const rows = [
        ...ECONOMY_FARE_TEMPLATE.map((t) => ({
          cabinClass: t.cabinClass,
          ticketTypeName: t.name,
          ticketTypeKey: normalizeTicketTypeName(t.name),
          cargoWeightOptionId: eco.id,
          includedKg: optionAllowanceKg(eco),
          cabinBaggageKg: cabinBagKgForCabin(t.cabinClass),
        })),
        ...BUSINESS_FARE_TEMPLATE.map((t) => ({
          cabinClass: t.cabinClass,
          ticketTypeName: t.name,
          ticketTypeKey: normalizeTicketTypeName(t.name),
          cargoWeightOptionId: biz.id,
          includedKg: optionAllowanceKg(biz),
          cabinBaggageKg: cabinBagKgForCabin(t.cabinClass),
        })),
      ];
      await prisma.ticketTypeBaggageAllocation.createMany({ data: rows });
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  await ensurePromise;
}

export async function listTicketTypeBaggageAllocations(): Promise<
  TicketTypeBaggageAllocationRow[]
> {
  await ensureTicketTypeBaggageDefaults();
  const rows = await prisma.ticketTypeBaggageAllocation.findMany();
  return rows.map(toAllocation);
}

export async function resolveLiveBaggageAllowance(
  cabin: string,
  ticketTypeName: string,
): Promise<BaggageAllowance> {
  const allocations = await listTicketTypeBaggageAllocations();
  return resolveBaggageAllowance(allocations, cabin, ticketTypeName);
}

export async function baggageSnapshotForTicket(
  cabin: string,
  ticketTypeName: string,
) {
  if (!ticketTypeName.trim()) {
    return snapshotFromAllowance(fallbackAllowance(cabin));
  }
  return snapshotFromAllowance(
    await resolveLiveBaggageAllowance(cabin, ticketTypeName),
  );
}

export async function replaceAllocationsForOption(input: {
  optionId: string;
  includedKg: number;
  picks: TicketTypeChoice[];
}) {
  const includedKg = Math.max(0, Math.floor(input.includedKg));
  await prisma.$transaction(async (tx) => {
    await tx.ticketTypeBaggageAllocation.deleteMany({
      where: { cargoWeightOptionId: input.optionId },
    });
    for (const pick of input.picks) {
      const cabin = parseCabin(pick.cabinClass) as CabinClassValue;
      const key = normalizeTicketTypeName(pick.name);
      if (!key) continue;
      await tx.ticketTypeBaggageAllocation.upsert({
        where: {
          cabinClass_ticketTypeKey: {
            cabinClass: cabin,
            ticketTypeKey: key,
          },
        },
        create: {
          cabinClass: cabin,
          ticketTypeName: pick.name.trim(),
          ticketTypeKey: key,
          cargoWeightOptionId: input.optionId,
          includedKg,
          cabinBaggageKg: cabinBagKgForCabin(cabin),
        },
        update: {
          ticketTypeName: pick.name.trim(),
          cargoWeightOptionId: input.optionId,
          includedKg,
          cabinBaggageKg: cabinBagKgForCabin(cabin),
        },
      });
    }
  });
}

export { parseTicketTypeKey, allowanceFromKg };
