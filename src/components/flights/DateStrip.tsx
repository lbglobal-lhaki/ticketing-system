"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatStripDay, type DateStripDay } from "@/lib/flights/results";
import { formatAud } from "@/lib/pricing";

type DateStripProps = {
  selectedDate: string;
  dayFares: DateStripDay[];
  baseParams: Record<string, string>;
  /** Which query param the strip updates (`date` or `returnDate`). */
  dateParam?: "date" | "returnDate";
};

function useVisibleDayCount() {
  const [count, setCount] = useState(7);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 380) setCount(3);
      else if (w < 640) setCount(4);
      else if (w < 900) setCount(5);
      else setCount(7);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return count;
}

export function DateStrip({
  selectedDate,
  dayFares,
  baseParams,
  dateParam = "date",
}: DateStripProps) {
  const dayCount = useVisibleDayCount();
  const [windowStart, setWindowStart] = useState(0);

  useEffect(() => {
    const idx = dayFares.findIndex((d) => d.date === selectedDate);
    if (idx < 0) {
      setWindowStart(0);
      return;
    }
    setWindowStart(
      Math.max(0, Math.min(idx - Math.floor(dayCount / 2), Math.max(0, dayFares.length - dayCount))),
    );
  }, [selectedDate, dayFares, dayCount]);

  const visible = useMemo(
    () => dayFares.slice(windowStart, windowStart + dayCount),
    [dayFares, windowStart, dayCount],
  );

  const canPrev = windowStart > 0;
  const canNext = windowStart + dayCount < dayFares.length;

  function hrefFor(date: string) {
    const params = new URLSearchParams(baseParams);
    params.set(dateParam, date);
    return `/?${params.toString()}`;
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-3 sm:px-6">
      <div className="flex items-stretch rounded-xl border border-line bg-white shadow-[0_6px_20px_rgba(15,23,42,0.05)]">
        <button
          type="button"
          aria-label="Previous dates"
          disabled={!canPrev}
          onClick={() => setWindowStart((v) => Math.max(0, v - 1))}
          className="flex w-9 shrink-0 items-center justify-center text-2xl text-foreground transition hover:text-accent-red disabled:opacity-25 sm:w-11"
        >
          ‹
        </button>
        <div
          className="grid min-w-0 flex-1 grid-flow-col"
          style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}
        >
          {visible.map((day, i) => {
            const label = formatStripDay(day.date);
            const isSelected = day.date === selectedDate;
            const hasFlights = day.lowestFareCents != null;
            return (
              <Link
                key={day.date}
                href={hrefFor(day.date)}
                aria-current={isSelected ? "date" : undefined}
                className={`relative flex min-h-[6.25rem] flex-col items-center justify-center gap-1 px-1 py-3 text-center transition ${
                  isSelected
                    ? "z-10 -my-px rounded-lg border-2 border-accent-red bg-white"
                    : `hover:bg-background ${i > 0 ? "border-l border-line" : ""}`
                }`}
              >
                <span
                  className={`leading-none ${
                    isSelected
                      ? "text-xl font-bold text-accent-deep"
                      : "text-base font-semibold text-muted"
                  }`}
                >
                  {label.dayNumber}
                </span>
                <span
                  className={`text-xs sm:text-sm ${
                    isSelected ? "font-bold text-accent-deep" : "text-muted"
                  }`}
                >
                  <span className="hidden md:inline">{label.weekdayLong}</span>
                  <span className="md:hidden">{label.weekday}</span>
                </span>
                <PlaneGlyph crossed={!hasFlights} />
                {hasFlights ? (
                  <span className="max-w-full truncate text-[10px] font-semibold text-accent-deep sm:text-xs">
                    {formatAud(day.lowestFareCents!)}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
        <button
          type="button"
          aria-label="Next dates"
          disabled={!canNext}
          onClick={() =>
            setWindowStart((v) =>
              Math.min(Math.max(0, dayFares.length - dayCount), v + 1),
            )
          }
          className="flex w-9 shrink-0 items-center justify-center text-2xl text-foreground transition hover:text-accent-red disabled:opacity-25 sm:w-11"
        >
          ›
        </button>
      </div>
    </div>
  );
}

function PlaneGlyph({ crossed }: { crossed: boolean }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      aria-label={crossed ? "No flights" : "Flights available"}
      className={crossed ? "text-accent-red/45" : "text-accent-red"}
    >
      <path
        d="M21 15.5v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0v5l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-5l8 2.5Z"
        fill="currentColor"
        transform="rotate(90 12 12)"
      />
      {crossed ? (
        <path d="M4 20 20 4" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
      ) : null}
      {crossed ? (
        <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}
