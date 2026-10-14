import {
  BUSINESS_FARE_TEMPLATE,
  ECONOMY_FARE_TEMPLATE,
  cabinLabel,
  parseCabin,
  type CabinClassValue,
} from "@/lib/fares/templates";

export type TicketTypeChoice = {
  cabinClass: CabinClassValue;
  name: string;
  key: string;
};

export type TicketTypeBaggageAllocationRow = {
  cabinClass: CabinClassValue;
  ticketTypeName: string;
  ticketTypeKey: string;
  cargoWeightOptionId: string;
  includedKg: number;
  cabinBaggageKg: number;
};

export type BaggageAllowance = {
  includedKg: number;
  cabinBaggageKg: number;
  checkedLabel: string;
  cabinBagLabel: string;
  piecesLabel: string;
  docLabel: string;
};

export function normalizeTicketTypeName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function displayTicketTypeName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export function ticketTypeKey(cabin: string, name: string) {
  return `${parseCabin(cabin)}:${normalizeTicketTypeName(name)}`;
}

export function parseTicketTypeKey(value: string): TicketTypeChoice | null {
  const trimmed = value.trim();
  const sep = trimmed.indexOf(":");
  if (sep < 1) return null;
  const cabin = parseCabin(trimmed.slice(0, sep));
  const name = displayTicketTypeName(trimmed.slice(sep + 1));
  if (!name) return null;
  return { cabinClass: cabin, name, key: ticketTypeKey(cabin, name) };
}

export function optionAllowanceKg(option: {
  kind: "fixed" | "per_kg";
  chargeableKg: number;
  minKg: number;
}) {
  if (option.kind === "fixed") {
    return Math.max(0, option.chargeableKg || option.minKg || 0);
  }
  return Math.max(0, option.minKg);
}

/** Every passenger ticket includes this carry-on / hand luggage allowance. */
export const CARRY_ON_KG = 7;
export const CARRY_ON_LABEL = `${CARRY_ON_KG} kg`;
export const CARRY_ON_NAME = "Carry-on (hand luggage)";

export function cabinBagKgForCabin(_cabin?: string) {
  return CARRY_ON_KG;
}

export function defaultIncludedKgForCabin(cabin: string) {
  return parseCabin(cabin) === "business" ? 40 : 23;
}

export function kgLabel(kg: number) {
  return `${kg} kg`;
}

export function piecesLabel(kg: number) {
  return kg > 0 ? `1 × ${kg}kg` : "—";
}

export function allowanceFromKg(
  includedKg: number,
  cabinBaggageKg: number,
): BaggageAllowance {
  const kg = Math.max(0, Math.floor(includedKg));
  const cabinKg = Math.max(0, Math.floor(cabinBaggageKg));
  return {
    includedKg: kg,
    cabinBaggageKg: cabinKg,
    checkedLabel: kgLabel(kg),
    cabinBagLabel: kgLabel(cabinKg),
    piecesLabel: piecesLabel(kg),
    docLabel: kg > 0 ? kgLabel(kg) : "—",
  };
}

export function fallbackAllowance(cabin: string): BaggageAllowance {
  return allowanceFromKg(
    defaultIncludedKgForCabin(cabin),
    cabinBagKgForCabin(cabin),
  );
}

export function resolveBaggageAllowance(
  allocations: TicketTypeBaggageAllocationRow[],
  cabin: string,
  ticketTypeName: string,
): BaggageAllowance {
  const key = normalizeTicketTypeName(ticketTypeName);
  const wanted = parseCabin(cabin);
  const hit = allocations.find(
    (row) =>
      parseCabin(row.cabinClass) === wanted && row.ticketTypeKey === key,
  );
  if (hit && hit.includedKg > 0) {
    return allowanceFromKg(hit.includedKg, CARRY_ON_KG);
  }
  return fallbackAllowance(cabin);
}

export function baggageSummaryLine(checkedLabel: string) {
  return `${checkedLabel} checked · ${CARRY_ON_LABEL} carry-on`;
}

export function snapshotFromAllowance(allowance: BaggageAllowance) {
  return {
    includedBaggageKg: allowance.includedKg,
    includedBaggageLabel: allowance.docLabel,
  };
}

const TEMPLATE_CHOICES: TicketTypeChoice[] = [
  ...ECONOMY_FARE_TEMPLATE.map((t) => ({
    cabinClass: t.cabinClass,
    name: t.name,
    key: ticketTypeKey(t.cabinClass, t.name),
  })),
  ...BUSINESS_FARE_TEMPLATE.map((t) => ({
    cabinClass: t.cabinClass,
    name: t.name,
    key: ticketTypeKey(t.cabinClass, t.name),
  })),
];

/** Templates plus any extra names already used on flights. */
export function ticketTypeChoicesFromNames(
  names: { cabinClass: string; name: string }[],
): TicketTypeChoice[] {
  const seen = new Set(TEMPLATE_CHOICES.map((c) => c.key));
  const extra: TicketTypeChoice[] = [];
  for (const row of names) {
    const name = displayTicketTypeName(row.name);
    if (!name) continue;
    const cabin = parseCabin(row.cabinClass);
    const key = ticketTypeKey(cabin, name);
    if (seen.has(key)) continue;
    seen.add(key);
    extra.push({ cabinClass: cabin, name, key });
  }
  extra.sort((a, b) => {
    if (a.cabinClass !== b.cabinClass) {
      return a.cabinClass === "economy" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  return [...TEMPLATE_CHOICES, ...extra];
}

export function ticketTypeChoiceLabel(choice: TicketTypeChoice) {
  return `${choice.name} · ${cabinLabel(choice.cabinClass)}`;
}
