import type Stripe from "stripe";
import { confirmBooking } from "@/lib/booking/confirmBooking";
import { quotePartyFareCents } from "@/lib/booking/passengers";
import { passengerDraftFromQuote } from "@/lib/checkout/passengerDraft";
import { prisma } from "@/lib/db";
import { calculateCardServiceFee, exclusiveGstAppliesToFare } from "@/lib/payments/fees";
import {
  paymentIntentWasRefunded,
  retrievePaymentIntent,
} from "@/lib/payments/stripe";
import { CUSTOMER_SEAT_SELECTION_ENABLED } from "@/lib/seats/customerSeatSelection";
import { quoteSeatFeeFromQuote, seatsSelectionComplete, travellersFromDraft } from "@/lib/seats/selection";
import { getSeatRates } from "@/lib/settings";

export type CardFulfillmentResult =
  | {
      ok: true;
      booking: {
        id: string;
        accessToken: string;
        bookingRef: string;
      };
      alreadyFulfilled: boolean;
    }
  | { ok: false; error: string; refunded?: boolean };

const MANUAL_TICKET_MESSAGE =
  "Your card payment was received. Do not pay again — our team will issue your ticket. Refunds are processed manually by our accounts team.";

async function findBookingByPaymentIntent(paymentIntentId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { stripePaymentIntentId: paymentIntentId },
    select: {
      booking: {
        select: {
          id: true,
          accessToken: true,
          bookingRef: true,
        },
      },
    },
  });
  return invoice?.booking ?? null;
}

function metadataValue(
  metadata: Stripe.Metadata | null | undefined,
  key: string,
): string {
  const value = metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Idempotent card booking fulfillment from a succeeded PaymentIntent.
 * Safe to call from the checkout server action and from the Stripe webhook.
 *
 * Never refunds. A captured charge either issues a ticket or is left for ops
 * to ticket or refund by hand. Auto-refunds previously raced the booking
 * write and produced "refunded but ticket issued".
 */
export async function fulfillCardPayment(input: {
  paymentIntentId: string;
  /** Preferred quote id from the client form; metadata.quoteId is authoritative. */
  quoteId?: string;
  /** Preferred session from the browser cookie; metadata.sessionId used by webhooks. */
  sessionId?: string;
  seatsBooked?: number;
  passengerName?: string;
  email?: string;
  passengerPhone?: string;
  passportNumber?: string;
  nationality?: string;
}): Promise<CardFulfillmentResult> {
  const existing = await findBookingByPaymentIntent(input.paymentIntentId);
  if (existing) {
    return { ok: true, booking: existing, alreadyFulfilled: true };
  }

  let intent: Stripe.PaymentIntent;
  try {
    intent = await retrievePaymentIntent(input.paymentIntentId);
  } catch {
    return { ok: false, error: "Could not verify card payment" };
  }

  if (intent.status !== "succeeded") {
    return {
      ok: false,
      error: `Payment was not completed (status: ${intent.status}).`,
    };
  }
  if (paymentIntentWasRefunded(intent)) {
    console.error(
      "CARD_PAYMENT_ALREADY_REFUNDED",
      intent.id,
      "— not issuing a ticket; ops must handle this PaymentIntent by hand",
    );
    return {
      ok: false,
      error:
        "This card payment was refunded. If you still need a ticket, contact our team — do not pay again.",
    };
  }
  if (intent.currency !== "aud") {
    return { ok: false, error: "Payment currency mismatch — contact support." };
  }

  const metaQuoteId = metadataValue(intent.metadata, "quoteId");
  if (!metaQuoteId) {
    return {
      ok: false,
      error: "Payment is missing booking metadata — contact support.",
    };
  }
  if (input.quoteId && input.quoteId !== metaQuoteId) {
    return {
      ok: false,
      error: "Payment does not match this booking — contact support.",
    };
  }

  const quoteId = metaQuoteId;
  const metaSessionId = metadataValue(intent.metadata, "sessionId");
  const sessionId = (input.sessionId || metaSessionId).trim();
  if (!sessionId || sessionId === "anonymous") {
    return {
      ok: false,
      error: "Missing browser session — refresh and try again",
    };
  }

  const quote = await prisma.priceQuote.findUnique({
    where: { id: quoteId },
    include: { fareRelease: { select: { cabinClass: true } } },
  });
  if (!quote) {
    console.error("CARD_PAYMENT_NEEDS_MANUAL_TICKET", intent.id, quoteId, "quote missing");
    return { ok: false, error: MANUAL_TICKET_MESSAGE };
  }
  if (quote.sessionId !== sessionId) {
    return { ok: false, error: "Quote does not belong to this session" };
  }

  const draft = passengerDraftFromQuote(quote);
  const metaSeats = Number.parseInt(
    metadataValue(intent.metadata, "seatsBooked") || "",
    10,
  );
  const seatsBooked = Math.min(
    9,
    Math.max(
      1,
      input.seatsBooked ||
        (Number.isFinite(metaSeats) ? metaSeats : 0) ||
        draft.seatsBooked ||
        1,
    ),
  );

  const passengerName = (input.passengerName || draft.passengerName).trim();
  const email = (input.email || draft.email).trim();
  if (!passengerName || !email) {
    console.error(
      "CARD_PAYMENT_NEEDS_MANUAL_TICKET",
      intent.id,
      quoteId,
      "incomplete passenger details",
    );
    return { ok: false, error: MANUAL_TICKET_MESSAGE };
  }

  const fareCents = quotePartyFareCents(quote);
  const seatFeeCents = quoteSeatFeeFromQuote(quote, await getSeatRates());
  if (
    CUSTOMER_SEAT_SELECTION_ENABLED &&
    !seatsSelectionComplete(
      travellersFromDraft(quote.travellersDraft),
      quote.tripType === "round_trip" && Boolean(quote.returnFlightId),
    )
  ) {
    console.error(
      "CARD_PAYMENT_NEEDS_MANUAL_TICKET",
      intent.id,
      quoteId,
      "seats incomplete",
    );
    return { ok: false, error: MANUAL_TICKET_MESSAGE };
  }
  const includeGst = exclusiveGstAppliesToFare(quote);
  const { totalCents, serviceFeeCents } = calculateCardServiceFee(
    fareCents + seatFeeCents,
    { includeGst },
  );

  if (intent.amount !== totalCents) {
    console.error(
      "CARD_PAYMENT_AMOUNT_MISMATCH_NO_REFUND",
      intent.id,
      "charged",
      intent.amount,
      "quote",
      totalCents,
    );
    return { ok: false, error: MANUAL_TICKET_MESSAGE };
  }

  const raced = await findBookingByPaymentIntent(intent.id);
  if (raced) {
    return { ok: true, booking: raced, alreadyFulfilled: true };
  }

  const result = await confirmBooking({
    quoteId,
    sessionId,
    passengerName,
    email,
    passengerPhone: input.passengerPhone || draft.passengerPhone || "",
    passportNumber: input.passportNumber || draft.passportNumber || "",
    nationality: input.nationality || draft.nationality || "",
    seatsBooked,
    paymentMethod: "card",
    invoiceStatus: "paid",
    stripePaymentIntentId: intent.id,
    amountCentsOverride: totalCents,
    serviceFeeCents,
    paidCapture: true,
  });

  if (result.ok) {
    return {
      ok: true,
      booking: {
        id: result.booking.id,
        accessToken: result.booking.accessToken,
        bookingRef: result.booking.bookingRef,
      },
      alreadyFulfilled: false,
    };
  }

  const afterFail = await findBookingByPaymentIntent(intent.id);
  if (afterFail) {
    return { ok: true, booking: afterFail, alreadyFulfilled: true };
  }

  if (/Unique constraint|stripePaymentIntentId/i.test(result.error)) {
    const byUnique = await findBookingByPaymentIntent(intent.id);
    if (byUnique) {
      return { ok: true, booking: byUnique, alreadyFulfilled: true };
    }
  }

  console.error(
    "CARD_PAYMENT_NEEDS_MANUAL_TICKET",
    intent.id,
    quoteId,
    result.error,
  );
  return {
    ok: false,
    error: `${MANUAL_TICKET_MESSAGE} (ref ${intent.id})`,
  };
}
