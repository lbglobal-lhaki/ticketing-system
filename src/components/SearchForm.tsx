"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DatePicker } from "@/components/DatePicker";
import type { AirportOption } from "@/lib/format";
import {
  ADULT_AGE_HINT,
  CHILD_AGE_HINT,
  INFANT_AGE_HINT,
} from "@/lib/booking/passengers";

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
  flightDates,
}: {
  error?: string;
  variant?: "default" | "hero" | "panel";
  airports: AirportOption[];
  initialValues?: SearchFormValues;
  /** Departure dates (YYYY-MM-DD) that have flights — bolded in the calendar. */
  flightDates?: string[];
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
      <form id="search" action="/" method="get" className="relative z-40 space-y-5 overflow-visible">
        <div className="flex flex-wrap gap-6" role="radiogroup" aria-label="Trip type">
          {(
            [
              ["one_way", "One Way"],
              ["round_trip", "Round Trip"],
            ] as const
          ).map(([value, label]) => {
            const active = tripType === value;
            return (
              <label
                key={value}
                className="inline-flex cursor-pointer items-center gap-2.5 text-base font-semibold text-foreground"
              >
                <input
                  type="radio"
                  name="tripType"
                  value={value}
                  checked={active}
                  onChange={() => setTripType(value)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className={`inline-flex size-5 items-center justify-center rounded-full border-2 transition peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 ${
                    active ? "border-accent-deep" : "border-accent-deep/60"
                  }`}
                >
                  {active ? (
                    <span className="size-2.5 rounded-full bg-accent-deep" />
                  ) : null}
                </span>
                {label}
              </label>
            );
          })}
        </div>

        <div className="grid gap-6 rounded-xl border border-line p-4 sm:p-6 lg:grid-cols-3">
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-semibold text-accent-deep">
              Select your Flight
            </p>
            <div className="relative space-y-3">
              <AirportBox
                name="origin"
                label="From"
                icon={<TakeoffIcon />}
                value={origin}
                options={airports}
                onChange={(next) => {
                  setOrigin(next);
                  if (next === destination) {
                    setDestination(
                      airports.find((a) => a.code !== next)?.code ?? "",
                    );
                  }
                }}
                display={originAirport}
              />
              <AirportBox
                name="destination"
                label="To"
                icon={<LandingIcon />}
                value={destination}
                options={destinationOptions}
                onChange={setDestination}
                display={destinationAirport}
              />
              <button
                type="button"
                onClick={swapAirports}
                aria-label="Swap origin and destination"
                className="absolute right-3 top-1/2 z-10 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md border border-accent-deep/70 bg-white text-accent-deep shadow-sm transition hover:bg-accent-deep hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                <SwapVerticalIcon />
              </button>
            </div>
          </div>

          <div className="min-w-0 space-y-2">
            <p className="text-sm font-semibold text-accent-deep">
              Select your Date
            </p>
            <div className="space-y-3">
              <DatePicker
                name="date"
                label="Departure date"
                placeholder="Select Departure Date"
                required
                value={departDate}
                onChange={setDepartDate}
                highlightDates={flightDates}
                variant="box"
              />
              {tripType === "round_trip" ? (
                <DatePicker
                  name="returnDate"
                  label="Return date"
                  placeholder="Select Return Date"
                  required
                  value={returnDate}
                  min={departDate}
                  onChange={setReturnDate}
                  variant="box"
                />
              ) : null}
            </div>
          </div>

          <div ref={paxRef} className="relative min-w-0 space-y-2 self-start">
            <p className="text-sm font-semibold text-accent-deep">
              Select your Passenger
            </p>
            <button
              type="button"
              onClick={() => setPaxOpen((v) => !v)}
              aria-expanded={paxOpen}
              className={`flex min-h-14 w-full items-center gap-3 rounded-lg border bg-white px-4 text-left text-sm font-semibold text-foreground transition ${
                paxOpen
                  ? "border-accent-deep ring-1 ring-accent-deep/30"
                  : "border-line hover:border-accent-deep/60"
              }`}
            >
              <PersonIcon />
              <span className="min-w-0 flex-1 truncate">
                {paxSummary} · {cabinLabel}
              </span>
              <span
                aria-hidden
                className={`text-xs text-muted transition ${paxOpen ? "rotate-180" : ""}`}
              >
                ▼
              </span>
            </button>

            {paxOpen ? (
              <div className="absolute inset-x-0 top-full z-50 mt-2 min-w-[18rem] rounded-xl border border-line bg-white shadow-[0_18px_50px_rgba(15,23,42,0.18)] lg:left-auto lg:w-[20rem]">
                <div className="space-y-1 p-4">
                  <PaxStepper
                    label="Adult"
                    hint={ADULT_AGE_HINT}
                    value={adults}
                    min={1}
                    max={Math.max(1, 9 - children)}
                    onChange={setAdults}
                  />
                  <PaxStepper
                    label="Child"
                    hint={CHILD_AGE_HINT}
                    value={children}
                    min={0}
                    max={Math.max(0, 9 - adults)}
                    onChange={setChildren}
                  />
                  <PaxStepper
                    label="Infant"
                    hint={INFANT_AGE_HINT}
                    value={infants}
                    min={0}
                    max={9}
                    onChange={setInfants}
                  />
                  <p className="pt-2 text-xs text-muted">
                    Infants do not take a seat.
                  </p>
                </div>
                <div className="border-t border-line p-4">
                  <p className="mb-2 text-sm font-semibold text-accent-deep">
                    Class
                  </p>
                  <div className="grid grid-cols-2 gap-2">
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
                          aria-pressed={active}
                          className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
                            active
                              ? "border-accent-deep bg-accent-deep text-white"
                              : "border-line text-foreground hover:border-accent-deep/50"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex justify-end border-t border-line px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setPaxOpen(false)}
                    className="rounded-lg bg-accent-deep px-5 py-2 text-sm font-semibold text-white transition hover:bg-accent"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : null}
          </div>
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
            className="inline-flex min-h-12 items-center justify-center rounded-lg bg-accent-deep px-12 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(30,58,138,0.25)] transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Search Flight
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

function AirportBox({
  name,
  label,
  icon,
  value,
  options,
  onChange,
  display,
}: {
  name: string;
  label: string;
  icon: ReactNode;
  value: string;
  options: AirportOption[];
  onChange: (code: string) => void;
  display?: AirportOption;
}) {
  return (
    <label className="relative flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-line bg-white pl-4 pr-14 text-sm font-semibold text-foreground transition focus-within:border-accent-deep focus-within:ring-1 focus-within:ring-accent-deep/30 hover:border-accent-deep/60">
      <span className="text-accent-deep">{icon}</span>
      <span className="min-w-0 truncate">
        {display ? `${display.city} (${display.code})` : `Select ${label.toLowerCase()}`}
      </span>
      <select
        name={name}
        required
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((airport) => (
          <option key={airport.code} value={airport.code}>
            {airport.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TakeoffIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M2.5 19h19v2h-19v-2Zm19.57-9.36c-.21-.8-1.04-1.28-1.84-1.06L14.92 10l-6.9-6.43-1.93.51 4.14 7.17-4.97 1.33-1.97-1.54-1.45.39 2.59 4.49L21 11.49c.81-.23 1.28-1.05 1.07-1.85Z" />
    </svg>
  );
}

function LandingIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M2.5 19h19v2h-19v-2Zm7.18-5.73 4.35 1.16 5.31 1.42c.8.21 1.62-.26 1.84-1.06.21-.8-.26-1.62-1.06-1.84l-5.31-1.42-2.76-9.02L10.12 2v8.28L5.15 8.95l-.93-2.32-1.45-.39v5.17l1.6.43 5.31 1.43Z" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="text-accent-deep">
      <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.1 0-8 2.1-8 5v2h16v-2c0-2.9-3.9-5-8-5Z" />
    </svg>
  );
}

function SwapVerticalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 4v15m0 0-3.5-3.5M8 19l3.5-3.5M16 20V5m0 0-3.5 3.5M16 5l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
