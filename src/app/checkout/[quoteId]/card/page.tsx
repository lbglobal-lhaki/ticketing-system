import { createHash } from "crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CardCheckoutForm } from "@/components/checkout/CardCheckoutForm";
import {
  CheckoutShell,
  QuoteBlockedMessage,
  QuoteSummaryCard,
} from "@/components/checkout/CheckoutShell";
import { getCheckoutQuoteState } from "@/lib/checkout/loadQuote";
import { passengerDraftFromQuote } from "@/lib/checkout/passengerDraft";
import { calculateCardServiceFee } from "@/lib/payments/fees";
import { createPaymentIntent, getStripePublicConfig } from "@/lib/payments/stripe";
import { getSessionId } from "@/lib/session";

// Confirming a card payment also generates PDF e-ticket/invoice attachments
// via headless Chromium, which can take longer than the platform default.
export const maxDuration = 60;

export default async function CardCheckoutPage({
  params,
}: {
  params: Promise<{ quoteId: string }>;
}) {
  const { quoteId } = await params;
  const state = await getCheckoutQuoteState(quoteId);
  if (!state) notFound();

  const draft = passengerDraftFromQuote(state.quote);
  if (state.available && !draft.complete) {
    redirect(`/checkout/${quoteId}/passengers`);
  }

  const stripe = getStripePublicConfig();
  if (!stripe.configured) {
    redirect(`/checkout/${quoteId}`);
  }

  let clientSecret: string | null = null;
  let paymentError: string | null = null;

  if (state.available) {
    const seatsBooked = Math.min(
      Math.max(1, draft.seatsBooked ?? 1),
      Math.min(9, Math.max(1, state.maxSeats)),
    );
    const fareCents = state.quote.quotedPriceCents * seatsBooked;
    const fee = calculateCardServiceFee(fareCents);
    const sessionId = await getSessionId();
    const idempotencyKey = createHash("sha256")
      .update(`pi:${quoteId}:${seatsBooked}:${fee.totalCents}:${sessionId}`)
      .digest("hex")
      .slice(0, 45);

    try {
      if (!sessionId || sessionId === "anonymous") {
        throw new Error("Missing browser session — refresh and try again");
      }
      const intent = await createPaymentIntent({
        amountCents: fee.totalCents,
        idempotencyKey,
        quoteId,
        sessionId,
        seatsBooked,
        description: `Flight booking ${draft.passengerName || quoteId}`,
        receiptEmail: draft.email,
      });
      clientSecret = intent.clientSecret;
    } catch (error) {
      paymentError =
        error instanceof Error
          ? error.message
          : "Could not start card payment";
    }
  }

  return (
    <CheckoutShell
      backHref={`/checkout/${quoteId}`}
      backLabel="Back to payment options"
    >
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
        <div className="order-2 lg:order-1">
          <QuoteSummaryCard state={state} title="Pay by card" />
        </div>
        <div className="order-1 min-w-0 rounded-2xl border border-line bg-white/70 p-5 backdrop-blur-sm sm:rounded-none sm:p-8 lg:order-2">
          {!state.available ? (
            <QuoteBlockedMessage state={state} />
          ) : (
            <CardCheckoutForm
              quoteId={quoteId}
              maxSeats={state.maxSeats}
              unitPriceCents={state.quote.quotedPriceCents}
              initialPassenger={draft}
              stripe={{
                publishableKey: stripe.publishableKey,
                clientSecret,
                error: paymentError,
              }}
            />
          )}
          {state.available && (
            <p className="mt-6 text-center text-sm text-muted">
              <Link href={`/checkout/${quoteId}/bank`} className="underline">
                Switch to bank transfer
              </Link>
            </p>
          )}
        </div>
      </div>
    </CheckoutShell>
  );
}
