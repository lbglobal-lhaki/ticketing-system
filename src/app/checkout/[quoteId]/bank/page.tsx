import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BankCheckoutForm } from "@/components/checkout/BankCheckoutForm";
import {
  CheckoutShell,
  QuoteBlockedMessage,
  QuoteSummaryCard,
} from "@/components/checkout/CheckoutShell";
import { quotePartyFareCents } from "@/lib/booking/passengers";
import { getCheckoutQuoteState } from "@/lib/checkout/loadQuote";
import { passengerDraftFromQuote } from "@/lib/checkout/passengerDraft";
import { getBrand } from "@/lib/branding";
import {
  exclusiveGstAppliesToFare,
  exclusiveGstCents,
} from "@/lib/payments/fees";
import {
  getBankTransferDetails,
  isBankTransferConfigured,
} from "@/lib/payments/bank";
import {
  quoteSeatFeeFromQuote,
  seatsSelectionComplete,
  travellersFromDraft,
} from "@/lib/seats/selection";

// Confirming a bank-transfer booking also generates a PDF invoice attachment
// via headless Chromium, which can take longer than the platform default.
export const maxDuration = 60;

export default async function BankCheckoutPage({
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
  if (
    state.available &&
    !seatsSelectionComplete(
      travellersFromDraft(state.quote.travellersDraft),
      state.isRound,
    )
  ) {
    redirect(`/checkout/${quoteId}/seats`);
  }

  if (!isBankTransferConfigured()) {
    redirect(`/checkout/${quoteId}`);
  }

  const bank = getBankTransferDetails();
  if (!bank) {
    redirect(`/checkout/${quoteId}`);
  }

  const brand = getBrand();
  const partyFareCents = quotePartyFareCents(state.quote);
  const seatFeeCents = quoteSeatFeeFromQuote(state.quote, state.seatRates);
  const gstCents = exclusiveGstCents(
    partyFareCents + seatFeeCents,
    exclusiveGstAppliesToFare(state.quote),
  );

  return (
    <CheckoutShell
      backHref={`/checkout/${quoteId}`}
      backLabel="Back to payment options"
    >
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
        <div className="order-2 lg:order-1">
          <QuoteSummaryCard state={state} title="Bank transfer" />
        </div>
        <div className="order-1 min-w-0 rounded-2xl border border-line bg-white/70 p-5 backdrop-blur-sm sm:rounded-none sm:p-8 lg:order-2">
          {!state.available ? (
            <QuoteBlockedMessage state={state} />
          ) : (
            <BankCheckoutForm
              quoteId={quoteId}
              maxSeats={state.maxSeats}
              partyFareCents={partyFareCents}
              seatFeeCents={seatFeeCents}
              gstCents={gstCents}
              paymentProofEmail={brand.paymentProofEmail}
              initialPassenger={draft}
              bankPreview={bank}
            />
          )}
          {state.available && (
            <p className="mt-6 text-center text-sm text-muted">
              <Link href={`/checkout/${quoteId}/card`} className="underline">
                Switch to card payment
              </Link>
            </p>
          )}
        </div>
      </div>
    </CheckoutShell>
  );
}
