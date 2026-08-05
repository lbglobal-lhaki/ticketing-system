import { expireQuoteIfNeeded } from "@/lib/booking/confirmBooking";
import { prisma } from "@/lib/db";
import { getSessionId } from "@/lib/session";

export type CheckoutQuoteState = {
  quote: NonNullable<Awaited<ReturnType<typeof loadQuoteRecord>>>;
  owned: boolean;
  expired: boolean;
  used: boolean;
  isRound: boolean;
  maxSeats: number;
  available: boolean;
};

async function loadQuoteRecord(quoteId: string) {
  return prisma.priceQuote.findUnique({
    where: { id: quoteId },
    include: { flight: true, returnFlight: true },
  });
}

export async function getCheckoutQuoteState(
  quoteId: string,
): Promise<CheckoutQuoteState | null> {
  await expireQuoteIfNeeded(quoteId);
  const quote = await loadQuoteRecord(quoteId);
  if (!quote) return null;

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
  const outboundAvail = quote.flight.remainingSeats + held;
  const returnAvail = quote.returnFlight
    ? quote.returnFlight.remainingSeats + held
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
  };
}
