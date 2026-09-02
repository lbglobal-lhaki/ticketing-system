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

/** Extra AUD for economy window seats (A / F). */
export const WINDOW_SEAT_CENTS = 35_00;
/** Extra AUD for extra-legroom exit rows 12 and 14 (economy). */
export const EXIT_ROW_CENTS = 55_00;

export function isWindowSeat(seat: Pick<SeatHotspot, "letter">) {
  return WINDOW_LETTERS.has(seat.letter);
}

export function isExitRowSeat(seat: Pick<SeatHotspot, "row" | "cabin">) {
  return seat.cabin === "economy" && EXIT_ROWS.has(seat.row);
}

export function seatFeeCents(
  seat: SeatHotspot,
  bookedCabin: SeatCabin,
): number {
  if (seat.cabin !== bookedCabin) return 0;
  if (bookedCabin === "business") return 0;
  let cents = 0;
  if (isWindowSeat(seat)) cents += WINDOW_SEAT_CENTS;
  if (isExitRowSeat(seat)) cents += EXIT_ROW_CENTS;
  return cents;
}

export function seatFeeCentsForId(id: string, bookedCabin: SeatCabin) {
  const seat = getSeat(id);
  if (!seat) return 0;
  return seatFeeCents(seat, bookedCabin);
}

export function seatsSelectableForCabin(cabin: SeatCabin) {
  return A320NEO_SEATS.filter((s) => s.cabin === cabin);
}

export function seatFeeLabel(seat: SeatHotspot, bookedCabin: SeatCabin) {
  const cents = seatFeeCents(seat, bookedCabin);
  if (cents <= 0) return "Included";
  const bits: string[] = [];
  if (isWindowSeat(seat)) bits.push("window");
  if (isExitRowSeat(seat)) bits.push("exit row");
  return bits.join(" + ");
}
