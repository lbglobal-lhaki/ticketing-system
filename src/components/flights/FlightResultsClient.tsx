"use client";

import { useMemo, useState } from "react";
import { DateStrip } from "@/components/flights/DateStrip";
import {
  CABIN_COLUMN_CLASS,
  FlightResultCard,
} from "@/components/flights/FlightResultCard";
import {
  ResultsToolbar,
  type SortKey,
  type TripFilter,
} from "@/components/flights/ResultsToolbar";
import { SearchSummaryBar } from "@/components/flights/SearchSummaryBar";
import type { DateStripDay, FlightResultRow } from "@/lib/flights/results";
import { airportCity, type AirportOption } from "@/lib/format";

type FlightResultsClientProps = {
  origin: string;
  destination: string;
  date: string;
  returnDate?: string;
  tripType: "one_way" | "round_trip";
  passengers?: number;
  adults?: number;
  children?: number;
  infants?: number;
  cabinClass?: "economy" | "business";
  allTickets?: boolean;
  title?: string;
  summaryTitle?: string;
  dayFares: DateStripDay[];
  baseParams: Record<string, string>;
  flights: FlightResultRow[];
  airports: AirportOption[];
  outboundSummary?: string | null;
  /** Date used by the strip highlight / navigation. */
  stripDate?: string;
  dateParam?: "date" | "returnDate";
  /** Prefer round-trip filter / sort when customer searched round trip. */
  preferRoundTrip?: boolean;
  /** The picked day has no flights, so the list holds nearby dates instead. */
  showingNearbyDates?: boolean;
};

export function FlightResultsClient({
  origin,
  destination,
  date,
  returnDate,
  tripType,
  passengers = 1,
  adults = 1,
  children = 0,
  infants = 0,
  cabinClass = "economy",
  allTickets = false,
  summaryTitle,
  dayFares,
  baseParams,
  flights,
  airports,
  outboundSummary,
  stripDate,
  dateParam = "date",
  preferRoundTrip = false,
  showingNearbyDates = false,
}: FlightResultsClientProps) {
  const [sortBy, setSortBy] = useState<SortKey>(
    preferRoundTrip || allTickets ? "relevant" : "relevant",
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [nonstopOnly, setNonstopOnly] = useState(false);
  const [tripFilter, setTripFilter] = useState<TripFilter>(() => {
    if (allTickets) return "all";
    if (preferRoundTrip) return "round_trip";
    return "all";
  });

  const roundTripCount = useMemo(
    () => flights.filter((f) => f.roundTripAvailable).length,
    [flights],
  );
  const oneWayCount = useMemo(
    () => flights.filter((f) => !f.roundTripAvailable).length,
    [flights],
  );

  const globalLowestFareCents = useMemo(() => {
    const prices = flights
      .flatMap((f) => [f.economy, f.business])
      .filter((f) => f?.farePriced)
      .map((f) => f!.displayPriceCents);
    return prices.length ? Math.min(...prices) : null;
  }, [flights]);

  const visible = useMemo(() => {
    let list = [...flights];
    if (nonstopOnly) list = list.filter((f) => f.stops === 0);
    if (tripFilter === "round_trip") {
      list = list.filter((f) => f.roundTripAvailable);
    } else if (tripFilter === "one_way") {
      list = list.filter((f) => !f.roundTripAvailable);
    }

    list.sort((a, b) => {
      // Keep paired round-trips easy to find when browsing "all" / relevant.
      if (sortBy === "relevant" && (allTickets || preferRoundTrip)) {
        if (a.roundTripAvailable !== b.roundTripAvailable) {
          return a.roundTripAvailable ? -1 : 1;
        }
      }
      if (sortBy === "lowest_fare") {
        const ap = a.lowestFareCents ?? Number.POSITIVE_INFINITY;
        const bp = b.lowestFareCents ?? Number.POSITIVE_INFINITY;
        return ap - bp;
      }
      if (sortBy === "earliest") {
        return (
          new Date(a.departureAt).getTime() - new Date(b.departureAt).getTime()
        );
      }
      if (sortBy === "shortest") {
        return a.durationMinutes - b.durationMinutes;
      }
      return (
        new Date(a.departureAt).getTime() - new Date(b.departureAt).getTime()
      );
    });
    return list;
  }, [flights, nonstopOnly, tripFilter, sortBy, allTickets, preferRoundTrip]);

  const filteredLowestFareCents = useMemo(() => {
    const prices = visible
      .flatMap((f) => [f.economy, f.business])
      .filter((f) => f?.farePriced)
      .map((f) => f!.displayPriceCents);
    return prices.length ? Math.min(...prices) : globalLowestFareCents;
  }, [visible, globalLowestFareCents]);

  // Hide trip filter on the dedicated "choose return" step — every card is a return.
  const showTripFilter = !outboundSummary;
  const isReturnStep = dateParam === "returnDate";
  const legFrom = isReturnStep ? destination : origin;
  const legTo = isReturnStep ? origin : destination;
  const flightDates = useMemo(
    () => dayFares.filter((d) => d.lowestFareCents != null).map((d) => d.date),
    [dayFares],
  );

  return (
    <main className="page-shell space-y-4 bg-background pb-10 pb-safe sm:space-y-5">
      <SearchSummaryBar
        origin={origin}
        destination={destination}
        date={date}
        returnDate={returnDate}
        tripType={tripType}
        passengers={passengers}
        adults={adults}
        children={children}
        infants={infants}
        cabinClass={cabinClass}
        allTickets={allTickets}
        title={summaryTitle}
        airports={airports}
        searchParams={baseParams}
        fromPriceCents={filteredLowestFareCents}
        flightDates={isReturnStep ? undefined : flightDates}
      />

      <TravelNotice />

      {outboundSummary && !allTickets ? (
        <div className="mx-auto w-full max-w-6xl px-3 sm:px-6">
          <div className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-muted">
            <p className="font-semibold text-foreground">Outbound selected</p>
            <p className="mt-1 break-words">{outboundSummary}</p>
          </div>
        </div>
      ) : null}

      <ResultsToolbar
        heading={
          allTickets
            ? "All Flights"
            : isReturnStep
              ? "Return Flight"
              : "Departing Flight"
        }
        routeLabel={
          allTickets
            ? "Every route and date"
            : `${airportCity(legFrom)} (${legFrom}) - ${airportCity(legTo)} (${legTo})`
        }
        sortBy={sortBy}
        onSortChange={setSortBy}
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen((v) => !v)}
        nonstopOnly={nonstopOnly}
        onNonstopOnlyChange={setNonstopOnly}
        tripFilter={tripFilter}
        onTripFilterChange={setTripFilter}
        showTripFilter={showTripFilter}
        roundTripCount={roundTripCount}
        oneWayCount={oneWayCount}
      />

      {!allTickets ? (
        <DateStrip
          selectedDate={stripDate ?? date}
          dayFares={dayFares}
          baseParams={baseParams}
          dateParam={dateParam}
        />
      ) : (
        <p className="mx-auto w-full max-w-6xl px-3 text-sm text-muted sm:px-6">
          Showing every active flight across all routes, cabins and departure
          dates. Use <span className="font-medium text-foreground">Filters</span>{" "}
          to show only round trips or one-ways.
        </p>
      )}

      <div className="mx-auto w-full max-w-6xl px-3 sm:px-6">
        {showingNearbyDates && !allTickets ? (
          <div
            role="status"
            className="mb-3 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          >
            <span aria-hidden className="font-bold">!</span>
            <p>
              <span className="font-semibold">
                No flights on {selectedDayLabel(stripDate ?? date)}.
              </span>{" "}
              Showing the nearest available{" "}
              {visible.length === 1 ? "flight" : "flights"} instead — check
              the date on each one, or pick a day with a plane icon above.
            </p>
          </div>
        ) : null}
        <div className="mb-3 flex items-end justify-between gap-3">
          <p className="pb-1 text-sm font-semibold text-accent-deep">
            {showingNearbyDates && !allTickets
              ? "Nearby flights"
              : "Number of flights"}{" "}
            <span className="font-bold text-foreground">{visible.length}</span>
          </p>
          <div className="hidden lg:flex">
            {(["economy", "business"] as const).map((cabin) => {
              const active = cabinClass === cabin;
              return (
                <span
                  key={cabin}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-t-lg border py-2.5 text-xs font-bold uppercase tracking-[0.1em] ${CABIN_COLUMN_CLASS} ${
                    active
                      ? "border-accent-deep bg-accent-deep text-white"
                      : "border-accent-deep/70 bg-white text-accent-deep"
                  }`}
                >
                  {cabin === "economy" ? "Economy" : "Business"}
                  <InfoDot />
                </span>
              );
            })}
          </div>
        </div>
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center shadow-[0_8px_28px_rgba(15,23,42,0.05)]">
            <p className="font-[family-name:var(--font-syne)] text-xl font-semibold">
              No flights found
            </p>
            <p className="mt-2 text-sm text-muted">
              {tripFilter === "round_trip"
                ? "No round-trip pairs on this list — try All tickets, or another date."
                : tripFilter === "one_way"
                  ? "No one-way-only flights match — try Round trip or All."
                  : "Try another date on the strip above, or modify your search."}
            </p>
            {tripFilter !== "all" && showTripFilter ? (
              <button
                type="button"
                onClick={() => setTripFilter("all")}
                className="mt-4 text-sm font-semibold text-accent-deep hover:underline"
              >
                Clear trip type filter
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {visible.map((flight) => (
              <FlightResultCard
                key={flight.key}
                flight={flight}
                globalLowestFareCents={filteredLowestFareCents}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function selectedDayLabel(iso: string) {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00.000Z`));
}

function TravelNotice() {
  const [open, setOpen] = useState(true);
  return (
    <div className="mx-auto w-full max-w-6xl px-3 sm:px-6">
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="relative bg-[linear-gradient(180deg,#5b9bd5_0%,#a9cdec_55%,#e8f2fb_100%)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_20%_100%,rgba(255,255,255,0.95),transparent_55%),radial-gradient(ellipse_at_70%_110%,rgba(255,255,255,0.9),transparent_50%)]"
          />
          <div className="relative flex items-start gap-4 px-4 py-4 sm:px-6 sm:py-5">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border-[3px] border-accent-red bg-accent-deep text-lg font-bold text-white">
              i
            </span>
            <p
              className={`min-w-0 flex-1 text-sm font-medium leading-relaxed text-foreground sm:text-base ${
                open ? "" : "truncate"
              }`}
            >
              It is our guest&apos;s responsibility to ensure they meet the
              travel criteria and have all appropriate approval and documents.
            </p>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? "Collapse notice" : "Expand notice"}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-white/70 text-foreground transition hover:bg-white"
            >
              <span aria-hidden className={`text-xs transition ${open ? "" : "rotate-180"}`}>
                ▲
              </span>
            </button>
          </div>
        </div>
        {open ? (
          <p className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-xs font-semibold text-foreground sm:px-6">
            <span className="inline-flex size-4 items-center justify-center rounded-full bg-muted/30 text-[10px] text-white">
              i
            </span>
            All fares are shown in Australian dollars (AUD).
          </p>
        ) : null}
      </div>
    </div>
  );
}

function InfoDot() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z" />
    </svg>
  );
}
