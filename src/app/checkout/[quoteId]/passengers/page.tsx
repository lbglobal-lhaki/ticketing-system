import Link from "next/link";
import { notFound } from "next/navigation";
import { FlightSummarySidebar } from "@/components/checkout/FlightSummarySidebar";
import { PassengerDetailsForm } from "@/components/checkout/PassengerDetailsForm";
import { QuoteBlockedMessage } from "@/components/checkout/CheckoutShell";
import type { TravellerDraft } from "@/lib/booking/passengers";
import { getCheckoutQuoteState } from "@/lib/checkout/loadQuote";

export default async function PassengerDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ quoteId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { quoteId } = await params;
  const { error } = await searchParams;
  const state = await getCheckoutQuoteState(quoteId);
  if (!state) notFound();

  const q = state.quote;
  const changeHref = q.returnFlightId
    ? `/flights/trip?outboundId=${q.flightId}&returnId=${q.returnFlightId}&adults=${q.adultCount}&children=${q.childCount}&infants=${q.infantCount}`
    : `/flights/${q.flightId}?adults=${q.adultCount}&children=${q.childCount}&infants=${q.infantCount}`;

  const isPartyQuote = q.unitAdultFareCents > 0;
  const adults = isPartyQuote ? Math.max(1, q.adultCount || 1) : 1;
  const children = isPartyQuote ? Math.max(0, q.childCount || 0) : 0;
  const infants = isPartyQuote ? Math.max(0, q.infantCount || 0) : 0;
  const draftList = Array.isArray(q.travellersDraft)
    ? (q.travellersDraft as TravellerDraft[])
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
            PASSENGER DETAILS
          </h1>
        </div>

        {!state.available ? (
          <QuoteBlockedMessage state={state} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.85fr)] lg:items-start lg:gap-8">
            <div className="order-2 lg:order-1">
              <PassengerDetailsForm
                quoteId={quoteId}
                maxSeats={state.maxSeats}
                adults={adults}
                children={children}
                infants={infants}
                unitAdultFareCents={q.unitAdultFareCents || q.quotedPriceCents}
                legacySeatPicker={!isPartyQuote}
                error={error ? decodeURIComponent(error) : null}
                initialTravellers={draftList}
                initial={{
                  title: q.passengerTitle || undefined,
                  firstName: q.passengerFirstName || undefined,
                  lastName:
                    q.passengerLastName === "—"
                      ? undefined
                      : q.passengerLastName || undefined,
                  email: q.passengerEmail || undefined,
                  phone: q.passengerPhone || undefined,
                  passportNumber: q.passportNumber || undefined,
                  nationality: q.nationality || undefined,
                  seatsBooked: q.seatsBooked || 1,
                }}
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
