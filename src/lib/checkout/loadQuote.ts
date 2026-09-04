import { expireQuoteIfNeeded } from "@/lib/booking/confirmBooking";
import { flightPayloadFromRow } from "@/lib/cargo/capacity";
import { prisma } from "@/lib/db";
import { getSiteSettings, seatRatesFrom } from "@/lib/settings";
import type { SeatRates } from "@/lib/seats/catalog";
import { getSessionId } from "@/lib/session";

export type CheckoutQuoteState = {
  quote: NonNullable<Awaited<ReturnType<typeof loadQuoteRecord>>>;
  owned: boolean;
  expired: boolean;
  used: boolean;
  isRound: boolean;
  maxSeats: number;
  available: boolean;
  /** Admin-set seat surcharges — all zero means seat choice is free. */
  seatRates: SeatRates;
};

async function loadQuoteRecord(quoteId: string) {
  return prisma.priceQuote.findUnique({
    where: { id: quoteId },
    // Cabin comes off the held fare release — a flight sells both cabins.
    include: {
      flight: true,
      returnFlight: true,
      fareRelease: { select: { cabinClass: true } },
    },
  });
}

export async function getCheckoutQuoteState(
  quoteId: string,
): Promise<CheckoutQuoteState | null> {
  await expireQuoteIfNeeded(quoteId);
  const quote = await loadQuoteRecord(quoteId);
  if (!quote) return null;

  const settings = await getSiteSettings();
  const sessionId = await getSessionId();
  const owned = quote.sessionId === sessionId;
  const expired =
    quote.status === "expired" ||
    (quote.status === "active" && quote.expiresAt <= new Date());
  const used = quote.status === "used";
  const isRound = quote.tripType === "round_trip" && Boolean(quote.returnFlight);
  // Soft-held seats are already removed from remainingSeats — add them back
  // so this quote can still complete checkout.
  const held = quote.inventoryHeld ? Math.max(0, quote.heldSeats || 0) : 0;
  // Seats are capped by the cabin pool *and* by what is left of the payload
  // once booked cargo is deducted — the two share one weight budget.
  const seatsOn = (flight: typeof quote.flight) =>
    Math.min(
      flight.remainingSeats,
      flightPayloadFromRow(flight, settings.passengerPayloadKg)
        .seatsLeftByPayload,
    ) + held;
  const outboundAvail = seatsOn(quote.flight);
  const returnAvail = quote.returnFlight
    ? seatsOn(quote.returnFlight)
    : outboundAvail;
  const maxSeats = isRound
    ? Math.min(outboundAvail, returnAvail)
    : outboundAvail;

  return {
    quote,
    owned,
    expired,
    used,
    isRound,
    maxSeats: Math.max(0, maxSeats),
    available: owned && !expired && !used && (maxSeats > 0 || held > 0),
    seatRates: seatRatesFrom(settings),
  };
}
