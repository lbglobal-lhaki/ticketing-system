import Link from "next/link";
import { removeCartItemAction } from "@/lib/actions/cart";
import { getActiveCartQuotes } from "@/lib/cart";
import { airportCity, formatFlightTime } from "@/lib/format";
import { formatAud } from "@/lib/pricing";
import { SubmitButton } from "@/components/SubmitButton";

type CartQuote = Awaited<ReturnType<typeof getActiveCartQuotes>>[number];

function CartItem({ quote }: { quote: CartQuote }) {
  const isRound = quote.tripType === "round_trip" && quote.returnFlight;
  const minutesLeft = Math.max(
    0,
    Math.round((quote.expiresAt.getTime() - Date.now()) / 60000),
  );

  return (
    <div className="mt-8">
      <article className="min-w-0 rounded-2xl border border-line bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)] sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              {isRound ? "Round trip" : "One way"}
            </p>
            <h2 className="mt-1 break-words font-[family-name:var(--font-syne)] text-lg font-semibold sm:text-xl">
              {airportCity(quote.flight.origin)} ({quote.flight.origin}) →{" "}
              {airportCity(quote.flight.destination)} ({quote.flight.destination})
            </h2>
          </div>
          <p className="shrink-0 font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight">
            {formatAud(quote.quotedPriceCents)}
          </p>
        </div>

        <div className="mt-4 space-y-3 text-sm text-muted">
          <div>
            <p className="font-medium text-foreground">Outbound</p>
            <p className="mt-0.5 break-words">
              {quote.flight.airline} {quote.flight.flightNumber} ·{" "}
              {formatFlightTime(quote.flight.departureAt, quote.flight.origin)}
              {quote.fareReleaseName ? ` · ${quote.fareReleaseName}` : ""}
            </p>
          </div>
          {isRound && quote.returnFlight ? (
            <div>
              <p className="font-medium text-foreground">Return</p>
              <p className="mt-0.5 break-words">
                {quote.returnFlight.airline} {quote.returnFlight.flightNumber} ·{" "}
                {formatFlightTime(
                  quote.returnFlight.departureAt,
                  quote.returnFlight.origin,
                )}
                {quote.returnFareReleaseName
                  ? ` · ${quote.returnFareReleaseName}`
                  : ""}
              </p>
            </div>
          ) : null}
          <p className="text-xs">
            Price held for about {minutesLeft} minute
            {minutesLeft === 1 ? "" : "s"}
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Link
            href={`/checkout/${quote.id}/passengers`}
            className="btn-cta min-h-11 px-5 py-2.5 text-sm"
          >
            Continue to passenger details
          </Link>
          <form action={removeCartItemAction} className="sm:inline">
            <input type="hidden" name="quoteId" value={quote.id} />
            <SubmitButton
              pendingLabel="Removing…"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-muted transition hover:border-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
            >
              Remove
            </SubmitButton>
          </form>
        </div>
      </article>
    </div>
  );
}

export default async function CartPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const params = await searchParams;
  const items = await getActiveCartQuotes();
  // Checkout is single-quote only — show the newest hold if anything slipped through.
  const quote = items[0] ?? null;

  return (
    <main className="page-shell bg-background pb-safe">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          Your cart
        </p>
        <h1 className="heading-gradient mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-4xl">
          Cart
        </h1>
        <p className="mt-2 text-sm text-muted">
          One fare at a time. Selecting a new fare replaces the hold below
          (about 15 minutes).
        </p>

        {params.saved === "removed" ? (
          <p className="mt-4 rounded-2xl border border-line bg-white px-4 py-3 text-sm text-accent-deep">
            Item removed from cart.
          </p>
        ) : null}
        {params.error ? (
          <p
            role="alert"
            className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {decodeURIComponent(params.error)}
          </p>
        ) : null}

        {!quote ? (
          <div className="mt-8 rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center">
            <p className="font-[family-name:var(--font-syne)] text-xl font-semibold">
              Your cart is empty
            </p>
            <p className="mt-2 text-sm text-muted">
              Search for a flight and select a fare to hold it here.
            </p>
            <Link
              href="/"
              className="btn-cta mt-6 min-h-11 px-5 py-3 text-sm"
            >
              Search flights
            </Link>
          </div>
        ) : (
          <CartItem quote={quote} />
        )}
      </div>
    </main>
  );
}
