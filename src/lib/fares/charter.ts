import { prisma } from "@/lib/db";
import { CHARTER_FARE_DEFAULTS } from "@/lib/fares/charterDefaults";
import type { FareProduct } from "@/lib/fares/products";

type CharterRow = Awaited<
  ReturnType<typeof prisma.charterFareProduct.findMany>
>[number];

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

let ensurePromise: Promise<void> | null = null;
let catalogueCache: { at: number; rows: CharterRow[] } | null = null;
const CATALOGUE_TTL_MS = 30_000;

/** Seed Chaney's matrix once per process (skip if rows already exist). */
export async function ensureCharterFareProducts() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const existing = await prisma.charterFareProduct.count();
      if (existing >= CHARTER_FARE_DEFAULTS.length) return;

      for (const fare of CHARTER_FARE_DEFAULTS) {
        await prisma.charterFareProduct.upsert({
          where: { code: fare.code },
          create: {
            code: fare.code,
            name: fare.name,
            cabinClass: fare.cabinClass,
            sortOrder: fare.sortOrder,
            priceCents: fare.priceCents,
            tagline: fare.tagline,
            recommended: fare.recommended,
            mostPopular: fare.mostPopular,
            flightChangeLabel: fare.flightChangeLabel,
            refundLabel: fare.refundLabel,
            checkedBaggage: fare.checkedBaggage,
            cabinBaggage: fare.cabinBaggage,
            seatSelection: fare.seatSelection,
            mealLabel: fare.mealLabel,
            frequentFlyerLabel: fare.frequentFlyerLabel,
            priorityCheckIn: fare.priorityCheckIn,
            priorityBoarding: fare.priorityBoarding,
            changePermitted: fare.changePermitted,
            changeFeeLabel: fare.changeFeeLabel,
            refundPermitted: fare.refundPermitted,
            refundFeeLabel: fare.refundFeeLabel,
            perkLines: fare.perkLines,
            changeBullets: fare.changeBullets,
            refundBullets: fare.refundBullets,
            baggageBullets: fare.baggageBullets,
            nameChangeBullets: fare.nameChangeBullets,
            noShowBullets: fare.noShowBullets,
            loyaltyBullets: fare.loyaltyBullets,
            notes: fare.notes,
          },
          update: {},
        });
      }
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  await ensurePromise;
}

async function loadCatalogue(force = false): Promise<CharterRow[]> {
  await ensureCharterFareProducts();
  const now = Date.now();
  if (
    !force &&
    catalogueCache &&
    now - catalogueCache.at < CATALOGUE_TTL_MS
  ) {
    return catalogueCache.rows;
  }
  const rows = await prisma.charterFareProduct.findMany({
    orderBy: [{ cabinClass: "asc" }, { sortOrder: "asc" }],
  });
  catalogueCache = { at: now, rows };
  return rows;
}

/** Call after admin edits so customer pages see fresh prices. */
export function invalidateCharterFareCache() {
  catalogueCache = null;
}

export async function listCharterFareProducts(
  cabinClass?: "economy" | "business",
) {
  const rows = await loadCatalogue();
  return rows.filter(
    (r) => r.active && (!cabinClass || r.cabinClass === cabinClass),
  );
}

export async function listAllCharterFareProductsAdmin() {
  return loadCatalogue(true);
}

export async function getCharterFareByCode(code: string) {
  const rows = await listCharterFareProducts();
  return rows.find((r) => r.code === code) ?? null;
}

export async function getCharterCabinFromPrices() {
  const rows = await listCharterFareProducts();
  const minFor = (
    cabin: "economy" | "business",
    field: "priceCents" | "roundTripPriceCents",
  ) => {
    const priced = rows.filter((p) => p.cabinClass === cabin && p[field] > 0);
    if (priced.length === 0) return null;
    return Math.min(...priced.map((p) => p[field]));
  };
  return {
    economy: minFor("economy", "priceCents"),
    business: minFor("business", "priceCents"),
    economyRoundTrip: minFor("economy", "roundTripPriceCents"),
    businessRoundTrip: minFor("business", "roundTripPriceCents"),
  };
}

export async function getCharterCabinFromPrice(
  cabinClass: "economy" | "business",
) {
  const prices = await getCharterCabinFromPrices();
  return prices[cabinClass];
}

export function toUiFareProduct(
  row: CharterRow,
  available: boolean,
): FareProduct {
  const cabinLabel = row.cabinClass === "business" ? "Business" : "Economy";
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    cabinLabel,
    priceCents: row.priceCents,
    roundTripPriceCents: row.roundTripPriceCents,
    tagline: row.tagline,
    recommended: row.recommended,
    mostPopular: row.mostPopular,
    available: available && row.active && row.priceCents > 0,
    highlights: {
      flightChange: row.flightChangeLabel,
      refund: row.refundLabel,
      baggage: row.checkedBaggage,
      cabinBaggage: row.cabinBaggage,
      seatSelection: row.seatSelection,
      meal: row.mealLabel,
    },
    perkLines: asStringArray(row.perkLines),
    change: {
      permitted: row.changePermitted,
      feeLabel: row.changeFeeLabel || null,
      bullets: asStringArray(row.changeBullets),
    },
    refund: {
      permitted: row.refundPermitted,
      feeLabel: row.refundFeeLabel || null,
      bullets: asStringArray(row.refundBullets),
    },
    baggageBullets: asStringArray(row.baggageBullets),
    nameChangeBullets: asStringArray(row.nameChangeBullets),
    noShowBullets: asStringArray(row.noShowBullets),
    loyaltyBullets: asStringArray(row.loyaltyBullets),
    notes: row.notes,
  };
}

export async function buildCharterFareProducts(input: {
  cabinClass: "economy" | "business";
  available: boolean;
}): Promise<FareProduct[]> {
  const rows = await listCharterFareProducts(input.cabinClass);
  return rows.map((row) => toUiFareProduct(row, input.available));
}
