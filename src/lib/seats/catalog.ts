import layout from "@/lib/seats/a320neo.json";

export type SeatCabin = "business" | "economy";

export type SeatHotspot = {
  id: string;
  row: number;
  letter: string;
  cabin: SeatCabin;
  x: number;
  y: number;
  w: number;
  h: number;
};

export const A320NEO_GRAPHIC = "/seats/drukair-a320neo.jpg";
export const A320NEO_SEATS = layout.seats as SeatHotspot[];

const BY_ID = new Map(A320NEO_SEATS.map((s) => [s.id, s]));

export function getSeat(id: string): SeatHotspot | undefined {
  return BY_ID.get(id.trim().toUpperCase());
}

export const WINDOW_LETTERS = new Set(["A", "F"]);
export const EXIT_ROWS = new Set([12, 14]);

/**
 * Seat surcharges are set by ops in Admin → Settings, not hardcoded here.
 * Callers that have not loaded settings get `FREE_SEAT_RATES`, so seat
 * selection costs nothing until a price is entered.
 */
export type SeatRates = {
  /** Economy window seats (A / F). */
  windowCents: number;
  /** Economy exit rows 12 and 14 (extra legroom). */
  exitRowCents: number;
  /** Every other economy seat. */
  standardCents: number;
};

export const FREE_SEAT_RATES: SeatRates = {
  windowCents: 0,
  exitRowCents: 0,
  standardCents: 0,
};

export function seatRatesAreFree(rates: SeatRates) {
  return (
    rates.windowCents <= 0 &&
    rates.exitRowCents <= 0 &&
    rates.standardCents <= 0
  );
}

export function isWindowSeat(seat: Pick<SeatHotspot, "letter">) {
  return WINDOW_LETTERS.has(seat.letter);
}

export function isExitRowSeat(seat: Pick<SeatHotspot, "row" | "cabin">) {
  return seat.cabin === "economy" && EXIT_ROWS.has(seat.row);
}

/** Business fares include seat choice; economy is priced from `rates`. */
export function seatFeeCents(
  seat: SeatHotspot,
  bookedCabin: SeatCabin,
  rates: SeatRates = FREE_SEAT_RATES,
): number {
  if (seat.cabin !== bookedCabin) return 0;
  if (bookedCabin === "business") return 0;
  const window = isWindowSeat(seat);
  const exitRow = isExitRowSeat(seat);
  let cents = 0;
  if (window) cents += Math.max(0, rates.windowCents);
  if (exitRow) cents += Math.max(0, rates.exitRowCents);
  if (!window && !exitRow) cents += Math.max(0, rates.standardCents);
  return cents;
}

export function seatFeeCentsForId(
  id: string,
  bookedCabin: SeatCabin,
  rates: SeatRates = FREE_SEAT_RATES,
) {
  const seat = getSeat(id);
  if (!seat) return 0;
  return seatFeeCents(seat, bookedCabin, rates);
}

export function seatsSelectableForCabin(cabin: SeatCabin) {
  return A320NEO_SEATS.filter((s) => s.cabin === cabin);
}

export function seatFeeLabel(
  seat: SeatHotspot,
  bookedCabin: SeatCabin,
  rates: SeatRates = FREE_SEAT_RATES,
) {
  const cents = seatFeeCents(seat, bookedCabin, rates);
  if (cents <= 0) return "Included";
  const bits: string[] = [];
  if (isWindowSeat(seat)) bits.push("window");
  if (isExitRowSeat(seat)) bits.push("exit row");
  return bits.length > 0 ? bits.join(" + ") : "standard";
}
