import type Stripe from "stripe";
import { confirmBooking } from "@/lib/booking/confirmBooking";
import { passengerDraftFromQuote } from "@/lib/checkout/passengerDraft";
import { prisma } from "@/lib/db";
import { calculateCardServiceFee } from "@/lib/payments/fees";
import {
  refundPaymentIntent,
  retrievePaymentIntent,
} from "@/lib/payments/stripe";

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
 * Never refunds when a booking/invoice for this PI already exists.
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
  });
  if (!quote) {
    return { ok: false, error: "Quote is no longer available" };
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
    return {
      ok: false,
      error: "Passenger details are incomplete — return to checkout and try again.",
    };
  }

  const fareCents = quote.quotedPriceCents * seatsBooked;
  const { totalCents, serviceFeeCents } = calculateCardServiceFee(fareCents);

  if (intent.amount !== totalCents) {
    // Wrong amount and not yet fulfilled — refund once.
    try {
      await refundPaymentIntent({
        paymentIntentId: intent.id,
        idempotencyKey: `refund-mismatch-${intent.id}`,
      });
    } catch (refundError) {
      console.error("mismatch auto-refund failed", refundError);
    }
    return {
      ok: false,
      error:
        "Payment amount did not match the quote — your card was refunded. Please try again.",
      refunded: true,
    };
  }

  // Re-check after Stripe round-trip — webhook/client may have raced.
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

  // Another request may have fulfilled while we were confirming — never refund
  // a PI that already has a booking.
  const afterFail = await findBookingByPaymentIntent(intent.id);
  if (afterFail) {
    return { ok: true, booking: afterFail, alreadyFulfilled: true };
  }

  // Unique constraint race on stripePaymentIntentId
  if (/Unique constraint|stripePaymentIntentId/i.test(result.error)) {
    const byUnique = await findBookingByPaymentIntent(intent.id);
    if (byUnique) {
      return { ok: true, booking: byUnique, alreadyFulfilled: true };
    }
  }

  try {
    await refundPaymentIntent({
      paymentIntentId: intent.id,
      idempotencyKey: `refund-${intent.id}`,
      amountCents: totalCents,
    });
  } catch (refundError) {
    console.error("auto-refund failed", refundError);
    return {
      ok: false,
      error: `${result.error}. Card was charged (${intent.id}) but booking failed — contact support; refund may need manual processing.`,
    };
  }

  return {
    ok: false,
    error: `${result.error}. Your card charge was automatically refunded.`,
    refunded: true,
  };
}
