/**
 * Passengers and cargo share one structural payload budget per departure.
 *
 *   payloadKg      = what the aircraft can lift on that sector (per flight)
 *   perPassengerKg = body + checked + cabin baggage, costed per seated pax
 *
 *   usedKg      = seatsSold × perPassengerKg + cargoBookedKg
 *   availableKg = payloadKg − usedKg
 *
 * So selling a seat removes `perPassengerKg` of sellable cargo, and selling
 * cargo removes seats. That is also why the passenger cap differs by sector:
 * 13 000 kg out of Paro is 130 seats, while Perth's 14 000 kg is 140 — the
 * limit is the payload, not the cabin, so it lives on the Flight row.
 */

/** A320neo charter default — Paro sector. Perth flights are set higher. */
export const DEFAULT_PAYLOAD_KG = 13_000;
/** Per seated passenger: body + checked baggage + cabin baggage. */
export const DEFAULT_PASSENGER_PAYLOAD_KG = 100;

export type PayloadInput = {
  /** Structural payload for the sector (kg). */
  payloadKg: number;
  /** Weight budget per seated passenger (kg). */
  perPassengerKg: number;
  /** Seats already sold or held. */
  seatsSold: number;
  /** Cargo weight already committed (kg). */
  cargoBookedKg: number;
  /** Seats still in the fare pools — the cabin-side limit. */
  remainingSeats?: number;
};

export type PayloadBreakdown = {
  payloadKg: number;
  perPassengerKg: number;
  seatsSold: number;
  /** Payload consumed by passengers already booked. */
  passengerKg: number;
  cargoBookedKg: number;
  usedKg: number;
  /** Cargo weight still sellable. */
  availableKg: number;
  /** Seats the payload allows in total, ignoring the cabin. */
  maxPassengers: number;
  /** Extra passengers the remaining payload allows. */
  seatsLeftByPayload: number;
  /** Seats actually sellable — the tighter of cabin pool and payload. */
  bookableSeats: number;
  /** 0–100, for capacity bars. */
  usedPct: number;
  /** True when payload, not empty seats, is what stops the next sale. */
  payloadLimited: boolean;
};

function toInt(value: number, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

export function flightPayload(input: PayloadInput): PayloadBreakdown {
  const payloadKg = toInt(input.payloadKg, DEFAULT_PAYLOAD_KG);
  const perPassengerKg = Math.max(
    1,
    toInt(input.perPassengerKg, DEFAULT_PASSENGER_PAYLOAD_KG),
  );
  const seatsSold = toInt(input.seatsSold);
  const cargoBookedKg = toInt(input.cargoBookedKg);

  const passengerKg = seatsSold * perPassengerKg;
  const usedKg = passengerKg + cargoBookedKg;
  const availableKg = Math.max(0, payloadKg - usedKg);

  const maxPassengers = Math.floor(payloadKg / perPassengerKg);
  const seatsLeftByPayload = Math.floor(availableKg / perPassengerKg);
  const remainingSeats =
    input.remainingSeats == null
      ? seatsLeftByPayload
      : toInt(input.remainingSeats);

  return {
    payloadKg,
    perPassengerKg,
    seatsSold,
    passengerKg,
    cargoBookedKg,
    usedKg,
    availableKg,
    maxPassengers,
    seatsLeftByPayload,
    bookableSeats: Math.min(remainingSeats, seatsLeftByPayload),
    usedPct: payloadKg > 0 ? Math.min(100, Math.round((usedKg / payloadKg) * 100)) : 0,
    payloadLimited: seatsLeftByPayload < remainingSeats,
  };
}

/** Payload breakdown straight off a Flight row. */
export function flightPayloadFromRow(
  flight: {
    totalSeats: number;
    remainingSeats: number;
    cargoPayloadKg: number;
    cargoBookedKg: number;
  },
  perPassengerKg: number,
): PayloadBreakdown {
  return flightPayload({
    payloadKg: flight.cargoPayloadKg,
    perPassengerKg,
    seatsSold: Math.max(0, flight.totalSeats - flight.remainingSeats),
    cargoBookedKg: flight.cargoBookedKg,
    remainingSeats: flight.remainingSeats,
  });
}

/** Cargo charge for a weight, honouring the minimum. 0 rate = quote offline. */
export function cargoQuoteCents(
  weightKg: number,
  rates: { cargoRatePerKgCents: number; cargoMinChargeCents: number },
): number {
  const kg = toInt(weightKg);
  const perKg = toInt(rates.cargoRatePerKgCents);
  if (kg <= 0 || perKg <= 0) return 0;
  return Math.max(kg * perKg, toInt(rates.cargoMinChargeCents));
}

export function formatKg(kg: number): string {
  return `${toInt(kg).toLocaleString("en-AU")} kg`;
}
