"use client";

import type { ReactNode } from "react";
import { SearchGlyph } from "@/components/admin/Combobox";

export type FilterChip = {
  value: string;
  label: string;
  count?: number;
};

/**
 * Search box + status chips that sits above a long admin list. Every list on
 * the dashboard previously had to be found by scrolling; this narrows it by
 * free text and by status without a round trip to the server.
 */
export function ListFilterBar({
  query,
  onQueryChange,
  placeholder = "Search…",
  chips,
  activeChip,
  onChipChange,
  resultCount,
  totalCount,
  itemLabel = "result",
  itemLabelPlural,
  children,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder?: string;
  chips?: FilterChip[];
  activeChip?: string;
  onChipChange?: (value: string) => void;
  resultCount: number;
  totalCount: number;
  itemLabel?: string;
  /** Only needed when the plural isn't just `itemLabel` + "s". */
  itemLabelPlural?: string;
  children?: ReactNode;
}) {
  const narrowed = resultCount !== totalCount;
  const noun = totalCount === 1 ? itemLabel : (itemLabelPlural ?? `${itemLabel}s`);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2 border-b border-line bg-transparent py-2 lg:max-w-sm">
          <SearchGlyph className="shrink-0 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={placeholder}
            className="w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              className="shrink-0 rounded-full px-1.5 text-muted transition hover:text-foreground"
              aria-label="Clear search"
            >
              ×
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {chips && onChipChange ? (
            <div className="inline-flex flex-wrap gap-1 rounded-full border border-line bg-white p-1">
              {chips.map((chip) => {
                const active = chip.value === activeChip;
                return (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => onChipChange(chip.value)}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                      active
                        ? "bg-accent-deep text-white"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    {chip.label}
                    {typeof chip.count === "number" ? (
                      <span
                        className={`ml-1.5 text-xs ${active ? "text-white/70" : "text-muted/70"}`}
                      >
                        {chip.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          {children}
        </div>
      </div>

      <p className="text-xs text-muted">
        {narrowed ? (
          <>
            Showing{" "}
            <span className="font-semibold text-foreground">{resultCount}</span>{" "}
            of {totalCount} {noun}
          </>
        ) : (
          <>
            <span className="font-semibold text-foreground">{totalCount}</span>{" "}
            {noun}
          </>
        )}
      </p>
    </div>
  );
}

/** Shared empty state for when a search/filter combination matches nothing. */
export function NoMatches({
  onReset,
  label = "Nothing matches that search.",
}: {
  onReset: () => void;
  label?: string;
}) {
  return (
    <div className="border border-dashed border-line bg-surface/70 px-6 py-12 text-center">
      <p className="text-sm text-muted">{label}</p>
      <button
        type="button"
        onClick={onReset}
        className="mt-4 border border-line px-4 py-2 text-sm font-medium transition hover:border-accent"
      >
        Clear filters
      </button>
    </div>
  );
}
