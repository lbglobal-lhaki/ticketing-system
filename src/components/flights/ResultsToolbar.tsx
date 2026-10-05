"use client";

import { useEffect, useRef, useState } from "react";

export type SortKey =
  | "relevant"
  | "lowest_fare"
  | "earliest"
  | "shortest";

export type TripFilter = "all" | "round_trip" | "one_way";

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "relevant", label: "Most Relevant" },
  { id: "lowest_fare", label: "Lowest Fare" },
  { id: "earliest", label: "Earliest Departure" },
  { id: "shortest", label: "Shortest Duration" },
];

type ResultsToolbarProps = {
  /** e.g. "Departing Flight" / "Return Flight". */
  heading: string;
  /** e.g. "Perth (PER) - Paro (PBH)". */
  routeLabel: string;
  sortBy: SortKey;
  onSortChange: (sort: SortKey) => void;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  nonstopOnly: boolean;
  onNonstopOnlyChange: (value: boolean) => void;
  tripFilter: TripFilter;
  onTripFilterChange: (value: TripFilter) => void;
  showTripFilter?: boolean;
  roundTripCount?: number;
  oneWayCount?: number;
};

export function ResultsToolbar({
  heading,
  routeLabel,
  sortBy,
  onSortChange,
  filtersOpen,
  onToggleFilters,
  nonstopOnly,
  onNonstopOnlyChange,
  tripFilter,
  onTripFilterChange,
  showTripFilter = true,
  roundTripCount = 0,
  oneWayCount = 0,
}: ResultsToolbarProps) {
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const activeFilterCount =
    (nonstopOnly ? 1 : 0) + (tripFilter !== "all" ? 1 : 0);

  useEffect(() => {
    if (!sortOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!sortRef.current?.contains(e.target as Node)) setSortOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSortOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [sortOpen]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <h2 className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-[family-name:var(--font-syne)] text-xl font-bold tracking-tight text-foreground">
          {heading}
        </span>
        <span className="text-sm font-semibold text-foreground/85 sm:text-base">
          {routeLabel}
        </span>
      </h2>

      <div className="flex items-center gap-3 self-end sm:self-auto">
        <div ref={sortRef} className="relative">
          <button
            type="button"
            onClick={() => setSortOpen((v) => !v)}
            aria-expanded={sortOpen}
            aria-haspopup="listbox"
            className="inline-flex min-h-10 items-center gap-2 px-2 text-sm font-semibold text-accent-deep transition hover:text-accent"
          >
            <SortIcon />
            Sort Flights
          </button>
          {sortOpen ? (
            <ul
              role="listbox"
              aria-label="Sort flights"
              className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-[0_12px_32px_rgba(15,23,42,0.12)]"
            >
              {SORT_OPTIONS.map((opt) => {
                const active = sortBy === opt.id;
                return (
                  <li key={opt.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        onSortChange(opt.id);
                        setSortOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition hover:bg-background ${
                        active ? "font-semibold text-accent-deep" : "text-foreground"
                      }`}
                    >
                      {opt.label}
                      {active ? <span aria-hidden>✓</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={onToggleFilters}
            aria-expanded={filtersOpen}
            className={`inline-flex min-h-10 items-center gap-2 rounded-md border px-4 text-sm font-semibold transition ${
              filtersOpen || activeFilterCount > 0
                ? "border-accent-red bg-accent-red text-white"
                : "border-accent-red text-accent-red hover:bg-accent-red/5"
            }`}
          >
            <FilterIcon />
            Filters
            {activeFilterCount > 0 ? (
              <span className="rounded-full bg-white px-1.5 text-[10px] font-bold text-accent-red">
                {activeFilterCount}
              </span>
            ) : (
              <span aria-hidden className="text-[10px]">▼</span>
            )}
          </button>
          {filtersOpen ? (
            <>
              <button
                type="button"
                aria-label="Close filters"
                className="fixed inset-0 z-10 cursor-default bg-transparent"
                onClick={onToggleFilters}
              />
              <div className="absolute right-0 z-20 mt-2 w-[min(100vw-2rem,16rem)] space-y-3 rounded-lg border border-line bg-white p-3 shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
                <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={nonstopOnly}
                    onChange={(e) => onNonstopOnlyChange(e.target.checked)}
                    className="size-4 accent-[var(--accent-deep)]"
                  />
                  Nonstop only
                </label>
                {showTripFilter ? (
                  <div className="space-y-1.5 border-t border-line pt-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                      Trip type
                    </p>
                    {(
                      [
                        { id: "all", label: "All tickets", count: roundTripCount + oneWayCount },
                        { id: "round_trip", label: "Round trip", count: roundTripCount },
                        { id: "one_way", label: "One way", count: oneWayCount },
                      ] as const
                    ).map((opt) => (
                      <label
                        key={opt.id}
                        className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-foreground"
                      >
                        <input
                          type="radio"
                          name="tripFilter"
                          checked={tripFilter === opt.id}
                          onChange={() => onTripFilterChange(opt.id)}
                          className="size-4 accent-[var(--accent-deep)]"
                        />
                        <span className="flex-1">{opt.label}</span>
                        <span className="text-xs text-muted">{opt.count}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SortIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6h16M4 12h10M4 18h5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h10M18 7h2M4 17h4M12 17h8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="16" cy="7" r="2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="10" cy="17" r="2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
