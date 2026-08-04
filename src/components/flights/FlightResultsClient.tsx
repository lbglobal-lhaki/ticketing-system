"use client";

import { useMemo, useState } from "react";
import { DateStrip } from "@/components/flights/DateStrip";
import { FlightResultCard } from "@/components/flights/FlightResultCard";
import {
  ResultsToolbar,
  type SortKey,
  type TripFilter,
} from "@/components/flights/ResultsToolbar";
import { SearchSummaryBar } from "@/components/flights/SearchSummaryBar";
import type { DateStripDay, FlightResultRow } from "@/lib/flights/results";
import type { AirportOption } from "@/lib/format";

type FlightResultsClientProps = {
  origin: string;
  destination: string;
  date: string;
  returnDate?: string;
  tripType: "one_way" | "round_trip";
  passengers?: number;
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
};

export function FlightResultsClient({
  origin,
  destination,
  date,
  returnDate,
  tripType,
  passengers = 1,
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

  return (
    <main className="page-shell bg-background pb-safe">
      <SearchSummaryBar
        origin={origin}
        destination={destination}
        date={date}
        returnDate={returnDate}
        tripType={tripType}
        passengers={passengers}
        cabinClass={cabinClass}
        allTickets={allTickets}
        title={summaryTitle}
        airports={airports}
        searchParams={baseParams}
      />

      {!allTickets ? (
        <DateStrip
          selectedDate={stripDate ?? date}
          dayFares={dayFares}
          baseParams={baseParams}
          dateParam={dateParam}
        />
      ) : (
        <div className="border-b border-line bg-white">
          <div className="mx-auto w-full max-w-6xl px-4 py-3 text-sm text-muted sm:px-6">
            Showing every active flight across all routes, cabins, and departure
            dates. Use the{" "}
            <span className="font-medium text-foreground">Round trip</span> /{" "}
            <span className="font-medium text-foreground">One way</span> filter
            below to narrow the list, or{" "}
            <span className="font-medium text-foreground">Filter by date</span>{" "}
            to return to your search.
          </div>
        </div>
      )}

      {outboundSummary && !allTickets ? (
        <div className="border-b border-line bg-white">
          <div className="mx-auto w-full max-w-6xl px-4 py-3 text-sm text-muted sm:px-6">
            <p className="font-semibold text-foreground">Outbound selected</p>
            <p className="mt-1 break-words">{outboundSummary}</p>
          </div>
        </div>
      ) : null}

      <ResultsToolbar
        count={visible.length}
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
        lowestFareCents={filteredLowestFareCents}
      />

      <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-5">
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
