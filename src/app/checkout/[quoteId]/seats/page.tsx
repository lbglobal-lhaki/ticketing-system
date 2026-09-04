import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SeatSelectionForm } from "@/components/seats/SeatSelectionForm";
import { QuoteBlockedMessage } from "@/components/checkout/CheckoutShell";
import { FlightSummarySidebar } from "@/components/checkout/FlightSummarySidebar";
import type { TravellerDraft } from "@/lib/booking/passengers";
import { getCheckoutQuoteState } from "@/lib/checkout/loadQuote";
import { passengerDraftFromQuote } from "@/lib/checkout/passengerDraft";
import { occupiedSeatsForFlight } from "@/lib/seats/occupancy";
import { parseCabinClass } from "@/lib/seats/selection";
import { airportCity } from "@/lib/format";

export default async function SeatSelectionPage({
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

  const q = state.quote;
  const changeHref = `/checkout/${quoteId}/passengers`;
  const travellers = Array.isArray(q.travellersDraft)
    ? (q.travellersDraft as TravellerDraft[])
    : [];
  const cabin = parseCabinClass(q.fareRelease?.cabinClass);
  const roundTrip = state.isRound;
  const takenOutbound = [
    ...(await occupiedSeatsForFlight({
      flightId: q.flightId,
      leg: "outbound",
      exceptQuoteId: quoteId,
    })),
  ];
  const takenReturn =
    roundTrip && q.returnFlightId
      ? [
          ...(await occupiedSeatsForFlight({
            flightId: q.returnFlightId,
            leg: "return",
            exceptQuoteId: quoteId,
          })),
        ]
      : [];

  return (
    <main className="page-shell bg-background pb-safe">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href={changeHref}
            className="inline-flex size-10 items-center justify-center rounded-full border border-line text-lg text-muted transition hover:border-accent hover:text-foreground"
            aria-label="Back"
          >
            ←
          </Link>
          <h1 className="heading-gradient font-[family-name:var(--font-syne)] text-xl font-bold tracking-[0.04em] sm:text-2xl">
            SELECT SEATS
          </h1>
        </div>

        {!state.available ? (
          <QuoteBlockedMessage state={state} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.85fr)] lg:items-start lg:gap-8">
            <div className="order-2 lg:order-1">
              <SeatSelectionForm
                quoteId={quoteId}
                cabin={cabin}
                roundTrip={roundTrip}
                travellers={travellers}
                takenOutbound={takenOutbound}
                takenReturn={takenReturn}
                rates={state.seatRates}
                outboundLabel={`${airportCity(q.flight.origin)} → ${airportCity(q.flight.destination)}`}
                returnLabel={
                  q.returnFlight
                    ? `${airportCity(q.returnFlight.origin)} → ${airportCity(q.returnFlight.destination)}`
                    : undefined
                }
              />
            </div>
            <div className="order-1 lg:order-2">
              <FlightSummarySidebar state={state} changeHref={changeHref} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
