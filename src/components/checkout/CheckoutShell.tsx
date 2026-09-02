import Link from "next/link";
import { airportLabel, formatFlightTime } from "@/lib/format";
import { formatAud } from "@/lib/pricing";
import type { CheckoutQuoteState } from "@/lib/checkout/loadQuote";
import { quoteSeatFeeFromQuote } from "@/lib/seats/selection";

export function CheckoutShell({
  children,
  backHref,
  backLabel = "Back",
}: {
  children: React.ReactNode;
  backHref: string;
  backLabel?: string;
}) {
  return (
    <main className="page-shell relative overflow-x-clip pb-safe">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 12% 10%, rgba(37, 99, 235, 0.16), transparent 42%),
            radial-gradient(ellipse at 88% 80%, rgba(220, 38, 38, 0.08), transparent 40%),
            linear-gradient(165deg, #F8FAFC 0%, #FFFFFF 55%, #EEF2FF 100%)
          `,
        }}
      />
      <div className="relative mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-14">
        <Link
          href={backHref}
          className="inline-flex min-h-11 items-center text-sm text-muted underline decoration-line underline-offset-4 transition hover:text-foreground"
        >
          {backLabel}
        </Link>
        <div className="mt-6 sm:mt-8">{children}</div>
      </div>
    </main>
  );
}

export function QuoteSummaryCard({
  state,
  title,
}: {
  state: CheckoutQuoteState;
  title: string;
}) {
  const { quote, isRound } = state;
  const seatFeeCents = quoteSeatFeeFromQuote(quote);

  return (
    <aside className="min-w-0 rounded-2xl border border-line bg-surface/85 p-5 backdrop-blur-sm sm:rounded-none sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
        {isRound ? "Round trip" : "One way"} · locked fare
      </p>
      <h1 className="mt-3 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h1>

      <div className="mt-6 space-y-5 text-sm sm:mt-8">
        <div className="border-b border-line pb-5">
          <p className="text-xs uppercase tracking-[0.14em] text-muted">
            Outbound
          </p>
          <p className="mt-2 flex items-center gap-2 font-medium text-foreground">
            <img
              src="/drukair_logo.png"
              alt=""
              width={22}
              height={22}
              className="size-[22px] object-contain"
            />
            <span>
              {quote.flight.airline} {quote.flight.flightNumber}
            </span>
          </p>
          <p className="mt-1 break-words text-muted">
            {airportLabel(quote.flight.origin)} →{" "}
            {airportLabel(quote.flight.destination)}
          </p>
          <p className="mt-1 text-muted">
            {formatFlightTime(quote.flight.departureAt, quote.flight.origin)}
            {quote.fareReleaseName ? ` · ${quote.fareReleaseName}` : ""}
          </p>
          {isRound && (
            <p className="mt-2 font-medium">
              {formatAud(quote.outboundPriceCents)}
            </p>
          )}
        </div>

        {isRound && quote.returnFlight && (
          <div className="border-b border-line pb-5">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">
              Return
            </p>
            <p className="mt-2 flex items-center gap-2 font-medium text-foreground">
              <img
                src="/drukair_logo.png"
                alt=""
                width={22}
                height={22}
                className="size-[22px] object-contain"
              />
              <span>
                {quote.returnFlight.airline} {quote.returnFlight.flightNumber}
              </span>
            </p>
            <p className="mt-1 break-words text-muted">
              {airportLabel(quote.returnFlight.origin)} →{" "}
              {airportLabel(quote.returnFlight.destination)}
            </p>
            <p className="mt-1 text-muted">
              {formatFlightTime(
              quote.returnFlight.departureAt,
              quote.returnFlight.origin,
            )}
              {quote.returnFareReleaseName
                ? ` · ${quote.returnFareReleaseName}`
                : ""}
            </p>
            <p className="mt-2 font-medium">
              {formatAud(quote.returnPriceCents)}
            </p>
          </div>
        )}

        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-muted">
            {(quote.unitAdultFareCents ?? 0) > 0
              ? "Party total"
              : "Price per seat"}
          </p>
          <p className="mt-2 font-[family-name:var(--font-syne)] text-4xl font-semibold tracking-tight">
            {formatAud(quote.quotedPriceCents + seatFeeCents)}
          </p>
          {seatFeeCents > 0 ? (
            <p className="mt-2 text-sm text-muted">
              Includes {formatAud(seatFeeCents)} seat extras
            </p>
          ) : null}
          <p className="mt-2 text-sm text-muted">
            Lock expires {formatFlightTime(quote.expiresAt)}
          </p>
        </div>
      </div>
    </aside>
  );
}

export function QuoteBlockedMessage({
  state,
}: {
  state: CheckoutQuoteState;
}) {
  if (!state.owned) {
    return (
      <p className="text-sm text-red-700">
        This quote belongs to another browser session. Start a new search from
        this browser.
      </p>
    );
  }
  if (state.used) {
    return (
      <p className="text-sm text-amber-700">
        This quote was already used for a booking.
      </p>
    );
  }
  if (state.expired) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-700">
          This price lock has expired. Search again for a fresh quote.
        </p>
        <Link
          href="/"
          className="btn-cta px-4 py-2.5 text-sm"
        >
          Search again
        </Link>
      </div>
    );
  }
  if (state.maxSeats < 1) {
    return (
      <p className="text-sm text-red-700">
        No seats left on this fare. Please search again.
      </p>
    );
  }
  return null;
}
