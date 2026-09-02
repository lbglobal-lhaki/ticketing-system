import { airportTzAbbr } from "@/lib/datetime";

const AIRPORTS: Record<string, string> = {
  PER: "Perth",
  PBH: "Paro",
  SYD: "Sydney",
  MEL: "Melbourne",
  BNE: "Brisbane",
  ADL: "Adelaide",
  CNS: "Cairns",
  AKL: "Auckland",
  SIN: "Singapore",
  LHR: "London Heathrow",
  LAX: "Los Angeles",
};

export type AirportOption = {
  code: string;
  city: string;
  label: string;
};

export function airportCity(code: string): string {
  return AIRPORTS[code] ?? code;
}

export function airportLabel(code: string): string {
  return AIRPORTS[code] ? `${code} — ${AIRPORTS[code]}` : code;
}

export function toAirportOption(code: string): AirportOption {
  const normalized = code.toUpperCase();
  return {
    code: normalized,
    city: airportCity(normalized),
    label: airportLabel(normalized),
  };
}

export function buildAirportOptions(codes: string[]): AirportOption[] {
  const unique = [...new Set(codes.map((c) => c.toUpperCase()))];
  return unique
    .map(toAirportOption)
    .sort((a, b) => a.city.localeCompare(b.city) || a.code.localeCompare(b.code));
}

export function formatFlightTime(date: Date, airportCode?: string): string {
  const formatted = new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date);
  if (!airportCode) return formatted;
  return `${formatted} ${airportTzAbbr(airportCode, date)}`;
}

export function cabinLabel(cabin: string): string {
  return cabin.replaceAll("_", " ");
}
