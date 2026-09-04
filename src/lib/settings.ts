import { prisma } from "@/lib/db";
import {
  DEFAULT_PASSENGER_PAYLOAD_KG,
  DEFAULT_PAYLOAD_KG,
} from "@/lib/cargo/capacity";
import type { SeatRates } from "@/lib/seats/catalog";

export type SiteSettings = {
  seatWindowCents: number;
  seatExitRowCents: number;
  seatStandardCents: number;
  cargoRatePerKgCents: number;
  cargoMinChargeCents: number;
  defaultPayloadKg: number;
  passengerPayloadKg: number;
};

/** Seat surcharges start at 0 — selection is free until ops prices it. */
export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  seatWindowCents: 0,
  seatExitRowCents: 0,
  seatStandardCents: 0,
  cargoRatePerKgCents: 0,
  cargoMinChargeCents: 0,
  defaultPayloadKg: DEFAULT_PAYLOAD_KG,
  passengerPayloadKg: DEFAULT_PASSENGER_PAYLOAD_KG,
};

export const SITE_SETTING_ID = "default";

/**
 * Reads the single settings row. Falls back to defaults when the row is
 * missing or the table has not been migrated yet, so a stale deploy renders
 * free seats rather than a 500.
 */
export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const row = await prisma.siteSetting.findUnique({
      where: { id: SITE_SETTING_ID },
    });
    if (!row) return { ...DEFAULT_SITE_SETTINGS };
    return {
      seatWindowCents: row.seatWindowCents,
      seatExitRowCents: row.seatExitRowCents,
      seatStandardCents: row.seatStandardCents,
      cargoRatePerKgCents: row.cargoRatePerKgCents,
      cargoMinChargeCents: row.cargoMinChargeCents,
      defaultPayloadKg: row.defaultPayloadKg,
      passengerPayloadKg: row.passengerPayloadKg,
    };
  } catch (error) {
    console.error("[settings] falling back to defaults", error);
    return { ...DEFAULT_SITE_SETTINGS };
  }
}

export function seatRatesFrom(settings: SiteSettings): SeatRates {
  return {
    windowCents: settings.seatWindowCents,
    exitRowCents: settings.seatExitRowCents,
    standardCents: settings.seatStandardCents,
  };
}

/** Seat rates for the current site settings — the common case at call sites. */
export async function getSeatRates(): Promise<SeatRates> {
  return seatRatesFrom(await getSiteSettings());
}
