"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchForm } from "@/components/SearchForm";
import { airportCity, airportLabel, type AirportOption } from "@/lib/format";
import { formatSearchDateRange } from "@/lib/flights/results";

type SearchSummaryBarProps = {
  origin: string;
  destination: string;
  date: string;
  returnDate?: string;
  tripType: "one_way" | "round_trip";
  passengers?: number;
  cabinClass?: "economy" | "business";
  allTickets?: boolean;
  title?: string;
  airports: AirportOption[];
  searchParams?: Record<string, string>;
};

function buildResultsHref(
  base: Record<string, string>,
  allTickets: boolean,
) {
  const params = new URLSearchParams(base);
  if (allTickets) params.set("allTickets", "1");
  else params.delete("allTickets");
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

export function SearchSummaryBar({
  origin,
  destination,
  date,
  returnDate,
  tripType,
  passengers = 1,
  cabinClass = "economy",
  allTickets = false,
  title,
  airports,
  searchParams,
}: SearchSummaryBarProps) {
  const [modifyOpen, setModifyOpen] = useState(false);
  const cabinLabel = cabinClass === "business" ? "Business" : "Economy";

  const baseParams = useMemo(() => {
    if (searchParams) return searchParams;
    const params: Record<string, string> = {
      origin,
      destination,
      date,
      tripType,
      passengers: String(passengers),
      cabinClass,
    };
    if (returnDate) params.returnDate = returnDate;
    return params;
  }, [
    searchParams,
    origin,
    destination,
    date,
    tripType,
    passengers,
    cabinClass,
    returnDate,
  ]);

  // Catalogue mode is unfiltered; restore prior search when leaving it.
  const viewAllHref = "/?allTickets=1";
  const filterByDateHref = buildResultsHref(baseParams, false);

  return (
    <section
      className={`results-banner theme-banner relative px-3 pb-5 pt-4 sm:px-6 sm:pb-7 sm:pt-6 ${
        modifyOpen ? "overflow-visible z-20" : "overflow-hidden"
      }`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 12% 20%, rgba(255,255,255,0.18), transparent 42%),
            radial-gradient(ellipse at 88% 80%, rgba(220, 38, 38,0.35), transparent 48%)
          `,
        }}
      />
      <div className="relative mx-auto w-full max-w-6xl">
        {title ? (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/80 sm:mb-3">
            {title}
          </p>
        ) : null}

        <div className="results-rise glass-panel relative z-10 overflow-visible rounded-2xl shadow-[0_16px_40px_rgba(15,23,42,0.22)]">
          {!modifyOpen ? (
            <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5">
              <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm text-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2">
                {allTickets ? (
                  <>
                    <p className="font-semibold text-foreground">
                      All routes · All dates · All cabins
                    </p>
                    <span className="hidden h-4 w-px bg-line sm:block" aria-hidden />
                    <p className="text-muted">Full ticket catalogue</p>
                  </>
                ) : (
                  <>
                    <p className="flex min-w-0 items-center gap-2 font-semibold">
                      <span
                        className="inline-flex shrink-0 items-center rounded-md bg-accent/12 px-2 py-0.5 text-xs font-bold tracking-wide text-accent-deep"
                        title={airportLabel(origin)}
                      >
                        {origin}
                      </span>
                      <span className="truncate">{airportCity(origin)}</span>
                      <span className="shrink-0 text-accent" aria-hidden>
                        {tripType === "round_trip" ? "⇄" : "→"}
                      </span>
                      <span
                        className="inline-flex shrink-0 items-center rounded-md bg-accent/12 px-2 py-0.5 text-xs font-bold tracking-wide text-accent-deep"
                        title={airportLabel(destination)}
                      >
                        {destination}
                      </span>
                      <span className="truncate">{airportCity(destination)}</span>
                    </p>
                    <span className="hidden h-4 w-px bg-line sm:block" aria-hidden />
                    <p className="min-w-0 text-muted">
                      <span className="font-medium text-foreground">
                        {formatSearchDateRange(date, returnDate, tripType)}
                      </span>
                    </p>
                    <span className="hidden h-4 w-px bg-line sm:block" aria-hidden />
                    <p className="text-muted">
                      <span className="font-medium text-foreground">
                        {tripType === "round_trip" ? "Round trip" : "One way"}
                      </span>
                    </p>
                    <span className="hidden h-4 w-px bg-line sm:block" aria-hidden />
                    <p className="text-muted">
                      <span className="font-medium text-foreground">
                        {passengers}
                      </span>{" "}
                      / {cabinLabel}
                    </p>
                  </>
                )}
              </div>
              <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <Link
                  href={allTickets ? filterByDateHref : viewAllHref}
                  className="btn-secondary inline-flex min-h-11 w-full items-center justify-center px-5 py-2 text-sm sm:w-auto"
                >
                  {allTickets ? "Filter by date" : "View all tickets"}
                </Link>
                <button
                  type="button"
                  onClick={() => setModifyOpen(true)}
                  className="btn-secondary min-h-11 w-full px-5 py-2 text-sm sm:w-auto"
                >
                  Modify search
                </button>
              </div>
            </div>
          ) : (
            <div className="px-4 py-4 sm:px-5 sm:py-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-accent-deep">
                  Modify search
                </p>
                <button
                  type="button"
                  onClick={() => setModifyOpen(false)}
                  className="text-sm font-medium text-muted transition hover:text-foreground"
                >
                  Close
                </button>
              </div>
              <SearchForm
                variant="panel"
                airports={airports}
                initialValues={{
                  origin,
                  destination,
                  date,
                  returnDate,
                  tripType,
                  passengers,
                  cabinClass,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
