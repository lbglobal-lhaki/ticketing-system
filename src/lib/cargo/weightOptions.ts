import { formatAud } from "@/lib/pricing";

export type CargoWeightKind = "fixed" | "per_kg";

export type CargoTicketAllocation = {
  cabinClass: "economy" | "business";
  name: string;
};

export type CargoWeightOptionRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  kind: CargoWeightKind;
  minKg: number;
  maxKg: number | null;
  chargeableKg: number;
  priceCents: number;
  origins: string[];
  sortOrder: number;
  active: boolean;
  sellAsCargo: boolean;
  ticketTypes: CargoTicketAllocation[];
  updatedAt: string;
};

/**
 * Client tariff (AUD). Fixed bands are a locked total; per-kg bands charge
 * the listed rate on the kilograms the customer enters inside that band.
 *
 * Origins default empty = sold on every departure. Admin then turns a band
 * off for Perth or Paro when that sector cannot take it.
 */
export const DEFAULT_CARGO_WEIGHT_OPTIONS: Omit<
  CargoWeightOptionRow,
  "id" | "updatedAt"
>[] = [
  {
    code: "documents",
    name: "Documents",
    description: "Below 500 g",
    kind: "fixed",
    minKg: 0,
    maxKg: 0,
    chargeableKg: 1,
    priceCents: 3554,
    origins: [],
    sortOrder: 1,
    active: true,
    sellAsCargo: true,
    ticketTypes: [],
  },
  {
    code: "kg-5",
    name: "5 kg",
    description: "Fixed rate for a 5 kg consignment",
    kind: "fixed",
    minKg: 5,
    maxKg: 5,
    chargeableKg: 5,
    priceCents: 11848,
    origins: [],
    sortOrder: 2,
    active: true,
    sellAsCargo: true,
    ticketTypes: [],
  },
  {
    code: "kg-10",
    name: "10 kg",
    description: "Fixed rate for a 10 kg consignment",
    kind: "fixed",
    minKg: 10,
    maxKg: 10,
    chargeableKg: 10,
    priceCents: 19994,
    origins: [],
    sortOrder: 3,
    active: true,
    sellAsCargo: true,
    ticketTypes: [],
  },
  {
    code: "kg-20",
    name: "20 kg",
    description: "Fixed rate for a 20 kg consignment",
    kind: "fixed",
    minKg: 20,
    maxKg: 20,
    chargeableKg: 20,
    priceCents: 33323,
    origins: [],
    sortOrder: 4,
    active: true,
    sellAsCargo: true,
    ticketTypes: [],
  },
  {
    code: "kg-30",
    name: "30 kg",
    description: "Fixed rate for a 30 kg consignment",
    kind: "fixed",
    minKg: 30,
    maxKg: 30,
    chargeableKg: 30,
    priceCents: 44430,
    origins: [],
    sortOrder: 5,
    active: true,
    sellAsCargo: true,
    ticketTypes: [],
  },
  {
    code: "kg-45",
    name: "45 kg",
    description: "Fixed rate for a 45 kg consignment",
    kind: "fixed",
    minKg: 45,
    maxKg: 45,
    chargeableKg: 45,
    priceCents: 54057,
    origins: [],
    sortOrder: 6,
    active: true,
    sellAsCargo: true,
    ticketTypes: [],
  },
  {
    code: "kg-100-plus",
    name: "100 kg+",
    description: "Per kilogram from 100 kg up to 299 kg",
    kind: "per_kg",
    minKg: 100,
    maxKg: 299,
    chargeableKg: 0,
    priceCents: 2962,
    origins: [],
    sortOrder: 7,
    active: true,
    sellAsCargo: true,
    ticketTypes: [],
  },
  {
    code: "kg-300-plus",
    name: "300 kg+",
    description: "Per kilogram from 300 kg up to 499 kg",
    kind: "per_kg",
    minKg: 300,
    maxKg: 499,
    chargeableKg: 0,
    priceCents: 2073,
    origins: [],
    sortOrder: 8,
    active: true,
    sellAsCargo: true,
    ticketTypes: [],
  },
  {
    code: "kg-500-plus",
    name: "500 kg+",
    description: "Per kilogram from 500 kg up to 999 kg",
    kind: "per_kg",
    minKg: 500,
    maxKg: 999,
    chargeableKg: 0,
    priceCents: 1600,
    origins: [],
    sortOrder: 9,
    active: true,
    sellAsCargo: true,
    ticketTypes: [],
  },
  {
    code: "kg-1000-plus",
    name: "1,000 kg+",
    description: "Per kilogram from 1,000 kg",
    kind: "per_kg",
    minKg: 1000,
    maxKg: null,
    chargeableKg: 0,
    priceCents: 1200,
    origins: [],
    sortOrder: 10,
    active: true,
    sellAsCargo: true,
    ticketTypes: [],
  },
];

export const CARGO_FLIGHT_CATEGORIES: {
  origin: string;
  label: string;
  hint: string;
}[] = [
  {
    origin: "PER",
    label: "Perth departures",
    hint: "Australia → Bhutan. Higher payload, so the heavier bands stay on sale.",
  },
  {
    origin: "PBH",
    label: "Paro departures",
    hint: "Bhutan → Australia. Tighter payload — hide bands this sector cannot lift.",
  },
];

export function optionSoldOnOrigin(
  option: Pick<CargoWeightOptionRow, "origins">,
  origin: string,
) {
  if (option.origins.length === 0) return true;
  return option.origins.includes(origin);
}

/** Kilograms this booking will hold against the flight. */
export function optionHoldKg(
  option: Pick<CargoWeightOptionRow, "kind" | "chargeableKg" | "minKg">,
  enteredKg: number,
) {
  if (option.kind === "fixed") {
    return Math.max(1, option.chargeableKg || option.minKg || 1);
  }
  return Math.max(0, Math.floor(enteredKg));
}

export function optionFitsPayload(
  option: Pick<
    CargoWeightOptionRow,
    "kind" | "minKg" | "maxKg" | "chargeableKg"
  >,
  availableKg: number,
) {
  if (availableKg <= 0) return false;
  if (option.kind === "fixed") {
    return optionHoldKg(option, 0) <= availableKg;
  }
  return option.minKg <= availableKg;
}

export function optionsForFlight(
  options: CargoWeightOptionRow[],
  origin: string,
  availableKg: number,
) {
  return options.filter(
    (option) =>
      option.active &&
      option.priceCents > 0 &&
      optionSoldOnOrigin(option, origin) &&
      optionFitsPayload(option, availableKg),
  );
}

export function quoteCargoWeightOption(
  option: Pick<
    CargoWeightOptionRow,
    "kind" | "minKg" | "maxKg" | "priceCents" | "chargeableKg" | "name"
  >,
  enteredKg: number,
):
  | { ok: true; weightKg: number; quotedCents: number }
  | { ok: false; error: string } {
  if (option.priceCents <= 0) {
    return { ok: false, error: "That weight option is not priced yet" };
  }

  if (option.kind === "fixed") {
    return {
      ok: true,
      weightKg: optionHoldKg(option, 0),
      quotedCents: option.priceCents,
    };
  }

  const kg = Math.floor(enteredKg);
  if (!Number.isFinite(kg) || kg < option.minKg) {
    return {
      ok: false,
      error: `Enter at least ${option.minKg} kg for ${option.name}`,
    };
  }
  if (option.maxKg != null && kg > option.maxKg) {
    return {
      ok: false,
      error: `${option.name} covers up to ${option.maxKg} kg — pick the next band`,
    };
  }
  return {
    ok: true,
    weightKg: kg,
    quotedCents: kg * option.priceCents,
  };
}

export function optionPriceLabel(
  option: Pick<CargoWeightOptionRow, "kind" | "priceCents">,
) {
  return option.kind === "per_kg"
    ? `${formatAud(option.priceCents)} / kg`
    : formatAud(option.priceCents);
}

export function optionRangeLabel(
  option: Pick<CargoWeightOptionRow, "kind" | "minKg" | "maxKg" | "description">,
) {
  if (option.description) return option.description;
  if (option.kind === "fixed") {
    return option.minKg <= 0 ? "Documents" : `${option.minKg} kg`;
  }
  if (option.maxKg == null) return `From ${option.minKg} kg`;
  return `${option.minKg}–${option.maxKg} kg`;
}
