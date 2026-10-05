"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchForm } from "@/components/SearchForm";
import { airportCity, type AirportOption } from "@/lib/format";
import { formatAud } from "@/lib/pricing";

type SearchSummaryBarProps = {
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
  airports: AirportOption[];
  searchParams?: Record<string, string>;
  /** Cheapest fare in the current results, shown on the right of the bar. */
  fromPriceCents?: number | null;
  /** Dates (YYYY-MM-DD) with flights, highlighted in the date picker. */
  flightDates?: string[];
};

function partyLabel(adults: number, children: number, infants: number) {
  return [
    `${adults} Adult${adults === 1 ? "" : "s"}`,
    children > 0 ? `${children} Child${children === 1 ? "" : "ren"}` : null,
    infants > 0 ? `${infants} Infant${infants === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function barDate(iso: string) {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00.000Z`));
}

function buildResultsHref(base: Record<string, string>, allTickets: boolean) {
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
  adults = 1,
  children = 0,
  infants = 0,
  cabinClass = "economy",
  allTickets = false,
  title,
  airports,
  searchParams,
  fromPriceCents = null,
  flightDates,
}: SearchSummaryBarProps) {
  const [modifyOpen, setModifyOpen] = useState(false);
  const adultsN = Math.max(1, adults);
  const childrenN = Math.max(0, children);
  const infantsN = Math.max(0, infants);

  const baseParams = useMemo(() => {
    if (searchParams) return searchParams;
    const params: Record<string, string> = {
      origin,
      destination,
      date,
      tripType,
      passengers: String(passengers),
      adults: String(adultsN),
      children: String(childrenN),
      infants: String(infantsN),
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
    adultsN,
    childrenN,
    infantsN,
    cabinClass,
    returnDate,
  ]);

  const toggleHref = allTickets
    ? buildResultsHref(baseParams, false)
    : "/?allTickets=1";

  const dates =
    tripType === "round_trip" && returnDate
      ? `${barDate(date)} – ${barDate(returnDate)}`
      : barDate(date);

  return (
    <section className="results-banner relative z-20 px-3 pt-4 sm:px-6 sm:pt-5">
      <div className="mx-auto w-full max-w-6xl">
        {title ? (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent-deep">
            {title}
          </p>
        ) : null}

        <div className="results-rise relative overflow-hidden rounded-xl bg-accent-deep text-white shadow-[0_14px_34px_rgba(30,58,138,0.28)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-3/4 bg-[url('/documents/eticket-assets/world-map-dots.png')] bg-cover bg-center opacity-20 mix-blend-screen"
          />
          <div className="relative flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-6 sm:py-5">
            <button
              type="button"
              onClick={() => setModifyOpen((v) => !v)}
              aria-expanded={modifyOpen}
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-white/80 px-5 text-sm font-semibold transition hover:bg-white hover:text-accent-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:self-auto"
            >
              {modifyOpen ? <CloseIcon /> : <SearchIcon />}
              {modifyOpen ? "Close" : "Search"}
            </button>

            <div className="min-w-0 flex-1">
              {allTickets ? (
                <>
                  <p className="text-base font-semibold sm:text-lg">
                    All routes · All dates · All cabins
                  </p>
                  <p className="mt-1 text-sm text-white/80">
                    Full ticket catalogue
                  </p>
                </>
              ) : (
                <>
                  <p className="truncate text-base font-semibold sm:text-lg">
                    {airportCity(origin)} ({origin}) -{" "}
                    {airportCity(destination)} ({destination})
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/85">
                    <span>{dates}</span>
                    <Divider />
                    <span>{partyLabel(adultsN, childrenN, infantsN)}</span>
                    <Divider />
                    <span>
                      {tripType === "round_trip" ? "Round Trip" : "One Way"}
                    </span>
                    <Divider />
                    <span>
                      {cabinClass === "business" ? "Business" : "Economy"}
                    </span>
                  </p>
                </>
              )}
              <Link
                href={toggleHref}
                className="mt-2 inline-block text-xs font-semibold text-white/80 underline-offset-4 transition hover:text-white hover:underline"
              >
                {allTickets ? "Back to my dates" : "View all tickets"}
              </Link>
            </div>

            <div className="shrink-0 border-t border-white/15 pt-3 text-left sm:border-0 sm:pt-0 sm:text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75">
                Fares from
              </p>
              <p className="mt-0.5 font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight">
                {fromPriceCents != null ? formatAud(fromPriceCents) : "—"}
                <span className="ml-1.5 text-sm font-semibold text-white/75">
                  AUD
                </span>
              </p>
            </div>
          </div>
        </div>

        {modifyOpen ? (
          <div className="results-rise relative mt-3 overflow-visible rounded-xl border border-line bg-white shadow-[0_18px_44px_rgba(15,23,42,0.14)]">
            <div className="theme-banner rounded-t-xl px-5 py-4 sm:px-7">
              <p className="font-[family-name:var(--font-syne)] text-xl font-semibold text-white sm:text-2xl">
                Book a Flight
              </p>
            </div>
            <div className="px-4 py-5 sm:px-7 sm:py-6">
              <SearchForm
                variant="panel"
                airports={airports}
                flightDates={flightDates}
                initialValues={{
                  origin,
                  destination,
                  date,
                  returnDate,
                  tripType,
                  passengers,
                  adults: adultsN,
                  children: childrenN,
                  infants: infantsN,
                  cabinClass,
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Divider() {
  return <span aria-hidden className="text-white/50">|</span>;
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
