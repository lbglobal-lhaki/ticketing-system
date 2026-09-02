import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  CheckoutShell,
  QuoteBlockedMessage,
  QuoteSummaryCard,
} from "@/components/checkout/CheckoutShell";
import { getCheckoutQuoteState } from "@/lib/checkout/loadQuote";
import { isBankTransferConfigured } from "@/lib/payments/bank";
import { getStripePublicConfig } from "@/lib/payments/stripe";
import { seatsSelectionComplete, travellersFromDraft } from "@/lib/seats/selection";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ quoteId: string }>;
}) {
  const { quoteId } = await params;
  const state = await getCheckoutQuoteState(quoteId);
  if (!state) notFound();

  if (
    state.available &&
    (!state.quote.passengerEmail || !state.quote.passengerFirstName)
  ) {
    redirect(`/checkout/${quoteId}/passengers`);
  }

  if (
    state.available &&
    !seatsSelectionComplete(
      travellersFromDraft(state.quote.travellersDraft),
      state.isRound,
    )
  ) {
    redirect(`/checkout/${quoteId}/seats`);
  }

  const stripe = getStripePublicConfig();
  const bankConfigured = isBankTransferConfigured();

  return (
    <CheckoutShell
      backHref={`/checkout/${quoteId}/seats`}
      backLabel="Back to seat selection"
    >
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
        <div className="order-2 lg:order-1">
          <QuoteSummaryCard state={state} title="Checkout" />
        </div>

        <div className="order-1 min-w-0 rounded-2xl border border-line bg-white/70 p-5 backdrop-blur-sm sm:rounded-none sm:p-8 lg:order-2">
          {!state.available ? (
            <QuoteBlockedMessage state={state} />
          ) : (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                  Step 1
                </p>
                <h2 className="heading-gradient mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight">
                  Choose how to pay
                </h2>
                <p className="mt-2 text-sm text-muted">
                  Card charges instantly. Bank transfer creates an unpaid
                  invoice for you to settle.
                </p>
              </div>

              <div className="grid gap-3">
                {stripe.configured ? (
                  <Link
                    href={`/checkout/${quoteId}/card`}
                    className="card-elevated rounded-2xl border border-line bg-surface/80 px-5 py-5 hover:border-accent/40"
                  >
                    <p className="font-[family-name:var(--font-syne)] text-lg font-semibold">
                      Pay by card
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Secure Stripe checkout · invoice marked paid automatically
                    </p>
                  </Link>
                ) : (
                  <div className="border border-line bg-surface/40 px-5 py-5 opacity-60">
                    <p className="font-semibold">Pay by card</p>
                    <p className="mt-1 text-sm text-muted">
                      Card payments are not configured yet
                    </p>
                  </div>
                )}

                {bankConfigured ? (
                  <Link
                    href={`/checkout/${quoteId}/bank`}
                    className="card-elevated rounded-2xl border border-line bg-surface/80 px-5 py-5 hover:border-accent/40"
                  >
                    <p className="font-[family-name:var(--font-syne)] text-lg font-semibold">
                      Bank transfer
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Unpaid invoice with bank details — pay by transfer, then
                      email a payment screenshot to confirm
                    </p>
                  </Link>
                ) : (
                  <div className="border border-line bg-surface/40 px-5 py-5 opacity-60">
                    <p className="font-semibold">Bank transfer</p>
                    <p className="mt-1 text-sm text-muted">
                      Bank details are not configured yet
                    </p>
                  </div>
                )}
              </div>

              {!stripe.configured && !bankConfigured && (
                <p className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  No payment methods are available. Ask admin to configure
                  Stripe or bank details.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </CheckoutShell>
  );
}
