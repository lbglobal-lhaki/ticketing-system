"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DatePicker } from "@/components/DatePicker";
import type { AirportOption } from "@/lib/format";

function defaultDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const fieldClass =
  "w-full min-w-0 max-w-full appearance-none border-0 border-b border-line bg-transparent px-0 py-3 text-base text-foreground outline-none transition focus-visible:border-accent focus-visible:shadow-[0_2px_0_0_var(--accent)]";

export type SearchFormValues = {
  origin?: string;
  destination?: string;
  date?: string;
  returnDate?: string;
  tripType?: "one_way" | "round_trip";
  passengers?: number;
  adults?: number;
  children?: number;
  infants?: number;
  cabinClass?: "economy" | "business";
};

export function SearchForm({
  error,
  variant = "default",
  airports,
  initialValues,
}: {
  error?: string;
  variant?: "default" | "hero" | "panel";
  airports: AirportOption[];
  initialValues?: SearchFormValues;
}) {
  const [tripType, setTripType] = useState<"one_way" | "round_trip">(
    initialValues?.tripType ?? "one_way",
  );
  const defaultOrigin =
    initialValues?.origin ??
    airports.find((a) => a.code === "PER")?.code ??
    airports[0]?.code ??
    "";
  const defaultDestination =
    initialValues?.destination ??
    airports.find((a) => a.code === "PBH" && a.code !== defaultOrigin)?.code ??
    airports.find((a) => a.code !== defaultOrigin)?.code ??
    "";

  const [origin, setOrigin] = useState(defaultOrigin);
  const [destination, setDestination] = useState(defaultDestination);
  const [departDate, setDepartDate] = useState(
    initialValues?.date ?? defaultDate(3),
  );
  const [returnDate, setReturnDate] = useState(
    initialValues?.returnDate ?? defaultDate(7),
  );
  const [adults, setAdults] = useState(
    Math.min(9, Math.max(1, initialValues?.adults ?? initialValues?.passengers ?? 1)),
  );
  const [children, setChildren] = useState(
    Math.min(8, Math.max(0, initialValues?.children ?? 0)),
  );
  const [infants, setInfants] = useState(
    Math.min(9, Math.max(0, initialValues?.infants ?? 0)),
  );
  const [cabinClass, setCabinClass] = useState<"economy" | "business">(
    initialValues?.cabinClass ?? "economy",
  );
  const [paxOpen, setPaxOpen] = useState(false);
  const paxRef = useRef<HTMLDivElement>(null);
  const seated = adults + children;
  const paxSummary = [
    `${adults} adult${adults === 1 ? "" : "s"}`,
    children > 0 ? `${children} child${children === 1 ? "" : "ren"}` : null,
    infants > 0 ? `${infants} infant${infants === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  useEffect(() => {
    if (tripType === "round_trip" && returnDate < departDate) {
      setReturnDate(departDate);
    }
  }, [tripType, departDate, returnDate]);

  const isHero = variant === "hero";
  const isPanel = variant === "panel";

  const destinationOptions = useMemo(
    () => airports.filter((a) => a.code !== origin),
    [airports, origin],
  );

  const originAirport = airports.find((a) => a.code === origin);
  const destinationAirport = airports.find((a) => a.code === destination);

  useEffect(() => {
    if (!paxOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!paxRef.current?.contains(e.target as Node)) setPaxOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPaxOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [paxOpen]);

  function swapAirports() {
    if (!destination) return;
    setOrigin(destination);
    setDestination(origin);
  }

  const cabinLabel =
    cabinClass === "business" ? "Business" : "Economy";

  if (isPanel) {
    return (
      <form id="search" action="/" method="get" className="relative z-40 space-y-4 overflow-visible">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line">
          <div className="flex gap-5" role="tablist" aria-label="Trip type">
            {(
              [
                ["round_trip", "Return"],
                ["one_way", "One-way"],
              ] as const
            ).map(([value, label]) => {
              const active = tripType === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTripType(value)}
                  className={`relative pb-3 text-sm font-semibold transition ${
                    active
                      ? "text-accent-deep"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {label}
                  {active ? (
                    <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-accent" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
        <input type="hidden" name="tripType" value={tripType} />

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {/* From / To — centered copy with padding clear of swap control */}
          <div className="relative grid grid-cols-1 overflow-hidden rounded-2xl border border-line bg-white sm:grid-cols-2">
            <label className="relative flex min-h-[5.5rem] min-w-0 cursor-pointer flex-col items-center justify-center px-4 py-3 pb-7 text-center focus-within:bg-[linear-gradient(180deg,rgba(37,99,235,0.05),transparent)] sm:border-r sm:border-line sm:pb-3 sm:pr-10">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                From
              </span>
              <div className="mt-1 flex max-w-full min-w-0 items-center justify-center gap-2">
                {origin ? (
                  <span className="shrink-0 rounded-md bg-accent/12 px-2 py-0.5 text-xs font-bold tracking-wide text-accent-deep">
                    {origin}
                  </span>
                ) : null}
                <span className="truncate text-sm font-semibold text-foreground">
                  {originAirport?.city ?? "Select city"}
                </span>
              </div>
              <select
                name="origin"
                required
                value={origin}
                aria-label="Origin"
                onChange={(e) => {
                  const next = e.target.value;
                  setOrigin(next);
                  if (next === destination) {
                    const fallback =
                      airports.find((a) => a.code !== next)?.code ?? "";
                    setDestination(fallback);
                  }
                }}
                className="absolute inset-0 z-[1] cursor-pointer opacity-0"
              >
                {airports.map((airport) => (
                  <option key={airport.code} value={airport.code}>
                    {airport.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={swapAirports}
              aria-label="Swap origin and destination"
              className="absolute left-1/2 top-1/2 z-20 inline-flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white text-accent-deep shadow-sm transition hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              <SwapIcon />
            </button>

            <label className="relative flex min-h-[5.5rem] min-w-0 cursor-pointer flex-col items-center justify-center border-t border-line px-4 py-3 pt-7 text-center focus-within:bg-[linear-gradient(0deg,rgba(37,99,235,0.05),transparent)] sm:border-t-0 sm:pt-3 sm:pl-10">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                To
              </span>
              <div className="mt-1 flex max-w-full min-w-0 items-center justify-center gap-2">
                {destination ? (
                  <span className="shrink-0 rounded-md bg-accent/12 px-2 py-0.5 text-xs font-bold tracking-wide text-accent-deep">
                    {destination}
                  </span>
                ) : null}
                <span className="truncate text-sm font-semibold text-foreground">
                  {destinationAirport?.city ?? "Select city"}
                </span>
              </div>
              <select
                name="destination"
                required
                value={destination}
                aria-label="Destination"
                onChange={(e) => setDestination(e.target.value)}
                className="absolute inset-0 z-[1] cursor-pointer opacity-0"
              >
                {destinationOptions.map((airport) => (
                  <option key={airport.code} value={airport.code}>
                    {airport.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Dates — custom themed calendar */}
          <div
            className={`grid overflow-visible rounded-2xl border border-line bg-white ${
              tripType === "round_trip"
                ? "grid-cols-1 sm:grid-cols-2"
                : "grid-cols-1"
            }`}
          >
            <DatePicker
              name="date"
              label="Depart"
              required
              value={departDate}
              onChange={setDepartDate}
              variant="card"
            />
            {tripType === "round_trip" ? (
              <div className="border-t border-line sm:border-l sm:border-t-0">
                <DatePicker
                  name="returnDate"
                  label="Return"
                  required
                  value={returnDate}
                  min={departDate}
                  onChange={setReturnDate}
                  variant="card"
                />
              </div>
            ) : null}
          </div>
        </div>

        {/* Passengers / Class — expands in-flow so it is never clipped */}
        <div ref={paxRef} className="relative z-30">
          <button
            type="button"
            onClick={() => setPaxOpen((v) => !v)}
            aria-expanded={paxOpen}
            className={`flex w-full items-center justify-between rounded-2xl border bg-white px-4 py-3 text-left transition ${
              paxOpen
                ? "border-accent ring-1 ring-accent/30"
                : "border-line hover:border-accent/50"
            }`}
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                Passengers / Class
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {paxSummary} / {cabinLabel}
              </p>
            </div>
            <span
              className={`text-muted transition ${paxOpen ? "rotate-180" : ""}`}
              aria-hidden
            >
              ▾
            </span>
          </button>

          {paxOpen ? (
            <div className="mt-2 rounded-2xl border border-line bg-white shadow-[0_18px_50px_rgba(15, 23, 42,0.16)]">
              <div className="grid gap-0 sm:grid-cols-2">
                <div className="space-y-3 border-b border-line p-4 sm:border-b-0 sm:border-r">
                  <p className="text-sm font-bold text-accent-deep">Class</p>
                  {(
                    [
                      ["economy", "Economy"],
                      ["business", "Business"],
                    ] as const
                  ).map(([value, label]) => {
                    const active = cabinClass === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setCabinClass(value)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm font-semibold transition ${
                          active
                            ? "border-accent bg-accent/8 text-accent-deep"
                            : "border-line text-foreground hover:border-accent/40"
                        }`}
                      >
                        <span
                          className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full border ${
                            active
                              ? "border-accent bg-accent"
                              : "border-line bg-white"
                          }`}
                        >
                          {active ? (
                            <span className="size-1.5 rounded-full bg-white" />
                          ) : null}
                        </span>
                        {label}
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-1 p-4">
                  <p className="mb-2 text-sm font-bold text-accent-deep">
                    Passengers
                  </p>
                  <PaxStepper
                    label="Adult"
                    hint="12+ years · full fare"
                    value={adults}
                    min={1}
                    max={Math.max(1, 9 - children)}
                    onChange={setAdults}
                  />
                  <PaxStepper
                    label="Child"
                    hint="2–11 years · 75% of adult fare · seat"
                    value={children}
                    min={0}
                    max={Math.max(0, 9 - adults)}
                    onChange={setChildren}
                  />
                  <PaxStepper
                    label="Infant"
                    hint="Under 2 · 10% of adult fare · no seat"
                    value={infants}
                    min={0}
                    max={9}
                    onChange={setInfants}
                  />
                  <p className="pt-3 text-xs text-muted">
                    Seats needed: {seated} (adults + children). Infants do not
                    take a seat.
                  </p>
                </div>
              </div>
              <div className="flex justify-end border-t border-line px-4 py-3">
                <button
                  type="button"
                  onClick={() => setPaxOpen(false)}
                  className="btn-cta px-6 py-2.5 text-sm"
                >
                  Confirm
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <input type="hidden" name="adults" value={String(adults)} />
        <input type="hidden" name="children" value={String(children)} />
        <input type="hidden" name="infants" value={String(infants)} />
        <input type="hidden" name="passengers" value={String(seated)} />
        <input type="hidden" name="cabinClass" value={cabinClass} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          {error ? (
            <p className="flex-1 text-sm text-red-700">
              {decodeURIComponent(error)}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={airports.length < 2}
            className="btn-cta inline-flex min-h-12 px-8 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            Search flights
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      id="search"
      action="/"
      method="get"
      className={
        isHero
          ? "glass-panel space-y-6 rounded-2xl p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)] sm:p-7"
          : "space-y-4 rounded-2xl border border-line bg-surface p-6"
      }
    >
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["one_way", "One way"],
            ["round_trip", "Round trip"],
          ] as const
        ).map(([value, label]) => {
          const active = tripType === value;
          return (
            <label
              key={value}
              className={`cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition ${
                active
                  ? "bg-accent-deep text-white"
                  : "bg-white text-muted hover:text-foreground"
              }`}
            >
              <input
                type="radio"
                name="tripType"
                value={value}
                checked={active}
                onChange={() => setTripType(value)}
                className="sr-only"
              />
              {label}
            </label>
          );
        })}
      </div>

      <div
        className={`grid gap-5 ${
          tripType === "round_trip"
            ? "sm:grid-cols-2 lg:grid-cols-5"
            : "sm:grid-cols-2 lg:grid-cols-4"
        }`}
      >
        <div className="space-y-1">
          <label
            htmlFor="origin"
            className="text-xs font-medium uppercase tracking-[0.14em] text-muted"
          >
            From
          </label>
          <select
            id="origin"
            name="origin"
            required
            value={origin}
            onChange={(e) => {
              const next = e.target.value;
              setOrigin(next);
              if (next === destination) {
                const fallback =
                  airports.find((a) => a.code !== next)?.code ?? "";
                setDestination(fallback);
              }
            }}
            className={fieldClass}
          >
            {airports.length === 0 ? (
              <option value="">No airports available</option>
            ) : (
              airports.map((airport) => (
                <option key={airport.code} value={airport.code}>
                  {airport.label}
                </option>
              ))
            )}
          </select>
        </div>
        <div className="space-y-1">
          <label
            htmlFor="destination"
            className="text-xs font-medium uppercase tracking-[0.14em] text-muted"
          >
            To
          </label>
          <select
            id="destination"
            name="destination"
            required
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className={fieldClass}
          >
            {destinationOptions.length === 0 ? (
              <option value="">No destinations available</option>
            ) : (
              destinationOptions.map((airport) => (
                <option key={airport.code} value={airport.code}>
                  {airport.label}
                </option>
              ))
            )}
          </select>
        </div>
        <div className="space-y-1">
          <DatePicker
            id="date"
            name="date"
            label="Depart"
            required
            value={departDate}
            onChange={setDepartDate}
            variant="field"
          />
        </div>
        {tripType === "round_trip" && (
          <div className="space-y-1">
            <DatePicker
              id="returnDate"
              name="returnDate"
              label="Return"
              required
              value={returnDate}
              min={departDate}
              onChange={setReturnDate}
              variant="field"
            />
          </div>
        )}
        <input type="hidden" name="adults" value={String(adults)} />
        <input type="hidden" name="children" value={String(children)} />
        <input type="hidden" name="infants" value={String(infants)} />
        <input type="hidden" name="passengers" value={String(seated)} />
        <input type="hidden" name="cabinClass" value={cabinClass} />
        <div className="flex items-end">
          <button
            type="submit"
            disabled={airports.length < 2}
            className="btn-cta w-full px-4 py-3.5 text-sm tracking-wide disabled:cursor-not-allowed disabled:opacity-50"
          >
            Search flights
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-700">{decodeURIComponent(error)}</p>
      )}
    </form>
  );
}

function PaxStepper({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-3">
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="inline-flex size-9 items-center justify-center rounded-lg bg-accent/10 text-lg font-semibold text-accent-deep transition hover:bg-accent/20 disabled:opacity-40"
        >
          −
        </button>
        <span className="w-6 text-center text-base font-bold text-foreground">
          {value}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="inline-flex size-9 items-center justify-center rounded-lg bg-accent/10 text-lg font-semibold text-accent-deep transition hover:bg-accent/20 disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

function SwapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 7h11l-2.5-2.5M17 17H6l2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
