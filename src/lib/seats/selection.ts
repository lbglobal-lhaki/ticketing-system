import { allocatesSeat, type TravellerDraft } from "@/lib/booking/passengers";
import {
  getSeat,
  seatFeeCents,
  type SeatCabin,
} from "@/lib/seats/catalog";

export function parseCabinClass(raw: string | null | undefined): SeatCabin {
  return raw === "business" ? "business" : "economy";
}

export function seatedTravellers(draft: TravellerDraft[]) {
  return draft.filter((t) => allocatesSeat(t.passengerType));
}

export function travellersFromDraft(raw: unknown): TravellerDraft[] {
  return Array.isArray(raw) ? (raw as TravellerDraft[]) : [];
}

export function quoteIsRoundTrip(quote: {
  tripType?: string | null;
  returnFlightId?: string | null;
}) {
  return quote.tripType === "round_trip" && Boolean(quote.returnFlightId);
}

export function passengerSeatFields(
  t: TravellerDraft | undefined,
  cabin: SeatCabin,
  roundTrip: boolean,
) {
  if (!t || !allocatesSeat(t.passengerType)) {
    return { seatOutbound: "", seatReturn: "", seatFeeCents: 0 };
  }
  const outbound = (t.seatOutbound || "").trim().toUpperCase();
  const back = (t.seatReturn || "").trim().toUpperCase();
  let cents = 0;
  if (outbound) {
    const seat = getSeat(outbound);
    if (seat) cents += seatFeeCents(seat, cabin);
  }
  if (roundTrip && back) {
    const seat = getSeat(back);
    if (seat) cents += seatFeeCents(seat, cabin);
  }
  return {
    seatOutbound: outbound,
    seatReturn: roundTrip ? back : "",
    seatFeeCents: cents,
  };
}

export function quoteSeatFeeCents(
  draft: TravellerDraft[],
  cabin: SeatCabin,
  roundTrip: boolean,
) {
  return seatedTravellers(draft).reduce(
    (sum, t) => sum + passengerSeatFields(t, cabin, roundTrip).seatFeeCents,
    0,
  );
}

export function quoteSeatFeeFromQuote(quote: {
  travellersDraft: unknown;
  fareRelease?: { cabinClass?: string | null } | null;
  tripType?: string | null;
  returnFlightId?: string | null;
}) {
  return quoteSeatFeeCents(
    travellersFromDraft(quote.travellersDraft),
    parseCabinClass(quote.fareRelease?.cabinClass),
    quoteIsRoundTrip(quote),
  );
}

export function seatAssignmentLabel(
  draft: TravellerDraft[],
  roundTrip: boolean,
) {
  return seatedTravellers(draft)
    .map((t) => {
      const out = (t.seatOutbound || "").trim().toUpperCase();
      if (!out) return "";
      if (!roundTrip) return out;
      const back = (t.seatReturn || "").trim().toUpperCase();
      return back ? `${out}/${back}` : out;
    })
    .filter(Boolean)
    .join(", ");
}

export function seatsSelectionComplete(
  draft: TravellerDraft[],
  roundTrip: boolean,
) {
  const seated = seatedTravellers(draft);
  if (seated.length === 0) return false;
  return seated.every((t) => {
    if (!getSeat(t.seatOutbound || "")) return false;
    if (roundTrip && !getSeat(t.seatReturn || "")) return false;
    return true;
  });
}

export function collectChosenSeats(
  draft: TravellerDraft[],
  leg: "outbound" | "return",
) {
  const key = leg === "outbound" ? "seatOutbound" : "seatReturn";
  return seatedTravellers(draft)
    .map((t) => (t[key] || "").trim().toUpperCase())
    .filter(Boolean);
}

export function validateSeatPicks(input: {
  draft: TravellerDraft[];
  cabin: SeatCabin;
  roundTrip: boolean;
  takenOutbound: Set<string>;
  takenReturn: Set<string>;
}): string | null {
  const seated = seatedTravellers(input.draft);
  if (seated.length === 0) return "No seated passengers to assign";

  const out = new Set<string>();
  const ret = new Set<string>();

  for (const t of seated) {
    const who = `${t.firstName} ${t.lastName}`.trim() || "Passenger";
    const outbound = (t.seatOutbound || "").trim().toUpperCase();
    const outboundSeat = getSeat(outbound);
    if (!outboundSeat) return `${who}: choose an outbound seat`;
    if (outboundSeat.cabin !== input.cabin) {
      return `${who}: ${outbound} is not in ${input.cabin} class`;
    }
    if (input.takenOutbound.has(outbound)) {
      return `${outbound} is no longer available on the outbound flight`;
    }
    if (out.has(outbound)) return `${outbound} is assigned to two passengers`;
    out.add(outbound);

    if (!input.roundTrip) continue;
    const back = (t.seatReturn || "").trim().toUpperCase();
    const returnSeat = getSeat(back);
    if (!returnSeat) return `${who}: choose a return seat`;
    if (returnSeat.cabin !== input.cabin) {
      return `${who}: ${back} is not in ${input.cabin} class`;
    }
    if (input.takenReturn.has(back)) {
      return `${back} is no longer available on the return flight`;
    }
    if (ret.has(back)) return `${back} is assigned to two passengers`;
    ret.add(back);
  }
  return null;
}
