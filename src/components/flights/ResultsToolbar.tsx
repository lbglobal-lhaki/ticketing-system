"use client";

export type SortKey =
  | "relevant"
  | "lowest_fare"
  | "earliest"
  | "shortest";

export type TripFilter = "all" | "round_trip" | "one_way";

type ResultsToolbarProps = {
  count: number;
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
  lowestFareCents: number | null;
};

export function ResultsToolbar({
  count,
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
  lowestFareCents,
}: ResultsToolbarProps) {
  const activeFilterCount =
    (nonstopOnly ? 1 : 0) + (tripFilter !== "all" ? 1 : 0);

  return (
    <div className="border-b border-line bg-surface/80">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6">
        {showTripFilter ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Trip type
            </p>
            <div
              className="inline-flex w-full rounded-full border border-line bg-white p-1 text-sm font-medium sm:w-auto"
              role="group"
              aria-label="Filter by trip type"
            >
              {(
                [
                  { id: "all", label: "All", count: roundTripCount + oneWayCount },
                  {
                    id: "round_trip",
                    label: "Round trip",
                    count: roundTripCount,
                  },
                  { id: "one_way", label: "One way", count: oneWayCount },
                ] as const
              ).map((opt) => {
                const active = tripFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onTripFilterChange(opt.id)}
                    className={`min-h-10 flex-1 rounded-full px-3 py-2 transition sm:flex-none sm:px-4 ${
                      active
                        ? "bg-accent-deep text-white"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                    <span
                      className={`ml-1.5 text-xs ${
                        active ? "text-white/80" : "text-muted"
                      }`}
                    >
                      {opt.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm sm:gap-x-4">
            <p className="font-semibold text-foreground">
              {count} {count === 1 ? "Flight" : "Flights"} Found
            </p>
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-1.5 font-medium text-accent transition hover:text-accent-deep"
              title="Fare calendar view coming soon"
            >
              <CalendarIcon />
              <span className="hidden min-[380px]:inline">Fare Calendar</span>
              <span className="min-[380px]:hidden">Calendar</span>
            </button>
            {lowestFareCents != null ? (
              <span className="inline-flex items-center gap-1.5 text-muted">
                <span
                  className="inline-block size-0 border-x-[5px] border-b-[8px] border-x-transparent border-b-accent"
                  aria-hidden
                />
                <span className="hidden sm:inline">Lowest Fares</span>
                <span className="sm:hidden">Lowest</span>
              </span>
            ) : null}
          </div>

          <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-3">
            <label className="col-span-1 min-w-0 text-sm text-muted sm:inline-flex sm:items-center sm:gap-2">
              <span className="mb-1 block text-xs sm:mb-0 sm:sr-only">
                Currency
              </span>
              <select
                defaultValue="AUD"
                className="min-h-11 w-full min-w-0 rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium text-foreground outline-none transition focus:border-accent sm:w-auto"
              >
                <option value="AUD">AUD</option>
              </select>
            </label>

            <div className="relative col-span-1 min-w-0">
              <button
                type="button"
                onClick={onToggleFilters}
                className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition sm:w-auto ${
                  filtersOpen || activeFilterCount > 0
                    ? "border-accent bg-white text-accent-deep"
                    : "border-line bg-white text-foreground hover:border-accent"
                }`}
              >
                <FilterIcon />
                Filters
                {activeFilterCount > 0 ? (
                  <span className="badge-info px-1.5 text-[10px] font-bold">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
              {filtersOpen ? (
                <>
                  <button
                    type="button"
                    aria-label="Close filters"
                    className="fixed inset-0 z-10 cursor-default bg-transparent"
                    onClick={onToggleFilters}
                  />
                  <div className="absolute right-0 z-20 mt-2 w-[min(100vw-2rem,16rem)] space-y-3 rounded-xl border border-line bg-white p-3 shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
                    <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={nonstopOnly}
                        onChange={(e) => onNonstopOnlyChange(e.target.checked)}
                        className="size-4 accent-[var(--accent)]"
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
                            { id: "all", label: "All tickets" },
                            { id: "round_trip", label: "Round trip only" },
                            { id: "one_way", label: "One way only" },
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
                              className="size-4 accent-[var(--accent)]"
                            />
                            {opt.label}
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>

            <label className="col-span-2 min-w-0 text-sm text-muted sm:inline-flex sm:items-center sm:gap-2">
              <span className="mb-1 block text-xs sm:mb-0 sm:whitespace-nowrap">
                Sort by
              </span>
              <select
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value as SortKey)}
                className="min-h-11 w-full min-w-0 rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium text-foreground outline-none transition focus:border-accent sm:max-w-[12rem]"
              >
                <option value="relevant">Most Relevant</option>
                <option value="lowest_fare">Lowest Fare</option>
                <option value="earliest">Earliest</option>
                <option value="shortest">Shortest</option>
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M3 10h18M8 3v4M16 3v4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6h16M7 12h10M10 18h4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
