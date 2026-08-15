"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type ComboboxOption = {
  value: string;
  /** Primary line — what the admin scans for. */
  label: string;
  /** Secondary line under the label (route, date, etc.). */
  description?: string;
  /** Right-aligned badge (seat counts, prices). */
  meta?: string;
  /** Extra words that should match the search but aren't worth showing. */
  keywords?: string;
  disabled?: boolean;
};

/**
 * Type-to-filter replacement for a `<select>` whose option list grows without
 * bound (every flight, every fare product). A native select forces the admin
 * to scroll a single-line list that gets slower with every flight added; this
 * lets them type "kb401", "pbh", or "5 sep" and land on the row directly.
 *
 * The submitted value still rides on a real (visually hidden) `<select>` so
 * server actions read it exactly as before and `required` is still enforced
 * by the browser — the popup is presentation only.
 */
export function Combobox({
  name,
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Type to filter…",
  noResultsLabel = "No matches — try a flight number, route, or date",
  required,
  disabled,
  id,
  className = "",
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  noResultsLabel?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const autoId = useId();
  const triggerId = id ?? autoId;
  const listId = `${autoId}-list`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const tokens = useMemo(
    () => query.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [query],
  );

  const filtered = useMemo(() => {
    if (tokens.length === 0) return options;
    return options.filter((o) => {
      const hay =
        `${o.label} ${o.description ?? ""} ${o.meta ?? ""} ${o.keywords ?? ""}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [options, tokens]);

  // Close on outside click / Escape, same as DatePicker.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Opening always starts from a clean search with the current selection
  // highlighted, so re-opening never inherits the last query. Done during
  // render (React's documented "adjust state when a value changes" pattern)
  // rather than in an effect, so the popup never paints a stale query first.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      const index = options.findIndex((o) => o.value === value);
      setActiveIndex(index >= 0 ? index : 0);
    }
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function select(option: ComboboxOption) {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function move(delta: number) {
    if (filtered.length === 0) return;
    setActiveIndex((i) => {
      let next = i;
      // Step over disabled rows rather than parking the highlight on one.
      for (let step = 0; step < filtered.length; step += 1) {
        next = (next + delta + filtered.length) % filtered.length;
        if (!filtered[next]?.disabled) break;
      }
      return next;
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(Math.max(0, filtered.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = filtered[activeIndex];
      if (option) select(option);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`.trim()}>
      {/* Carries the value into the form and keeps native `required`
          validation working — only the selected option needs to exist. */}
      <select
        name={name}
        value={value}
        required={required}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden
        className="sr-only"
      >
        <option value="" />
        {value ? <option value={value}>{selected?.label ?? value}</option> : null}
      </select>

      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full min-w-0 items-center justify-between gap-3 border-0 border-b bg-transparent py-2.5 text-left outline-none transition disabled:cursor-not-allowed disabled:opacity-60 ${
          open ? "border-accent" : "border-line hover:border-accent/60"
        }`}
      >
        <span className="min-w-0 flex-1">
          {selected ? (
            <>
              <span className="block truncate text-sm font-medium text-foreground">
                {selected.label}
              </span>
              {selected.description ? (
                <span className="block truncate text-xs text-muted">
                  {selected.description}
                </span>
              ) : null}
            </>
          ) : (
            <span className="block truncate text-sm text-muted">
              {placeholder}
            </span>
          )}
        </span>
        {selected?.meta ? (
          <span className="shrink-0 text-xs font-medium text-accent">
            {selected.meta}
          </span>
        ) : null}
        <ChevronGlyph
          className={`shrink-0 text-muted transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="absolute inset-x-0 top-[calc(100%+0.4rem)] z-50 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
          <div className="border-b border-line p-2">
            <div className="flex items-center gap-2 rounded-xl bg-background px-3 py-2">
              <SearchGlyph className="shrink-0 text-muted" />
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={
                  filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined
                }
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  // Refiltering reorders the list, so the old highlight would
                  // point at an unrelated row — always restart from the top.
                  setActiveIndex(0);
                }}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                className="w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    setActiveIndex(0);
                    inputRef.current?.focus();
                  }}
                  className="shrink-0 rounded-full px-1.5 text-muted transition hover:text-foreground"
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">
              {noResultsLabel}
            </p>
          ) : (
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              className="max-h-72 overflow-y-auto py-1"
            >
              {filtered.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = index === activeIndex;
                return (
                  <li
                    key={option.value || `__empty-${index}`}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => select(option)}
                    className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 transition ${
                      option.disabled
                        ? "cursor-not-allowed opacity-50"
                        : isActive
                          ? "bg-accent/10"
                          : ""
                    }`}
                  >
                    <span
                      className={`mt-0.5 shrink-0 text-accent ${isSelected ? "" : "invisible"}`}
                      aria-hidden
                    >
                      <CheckGlyph />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-sm ${isSelected ? "font-semibold text-accent-deep" : "font-medium text-foreground"}`}
                      >
                        <Highlight text={option.label} tokens={tokens} />
                      </span>
                      {option.description ? (
                        <span className="block truncate text-xs text-muted">
                          <Highlight
                            text={option.description}
                            tokens={tokens}
                          />
                        </span>
                      ) : null}
                    </span>
                    {option.meta ? (
                      <span className="shrink-0 whitespace-nowrap pt-0.5 text-xs font-medium text-muted">
                        {option.meta}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {options.length > 8 ? (
            <p className="border-t border-line bg-background/60 px-3 py-2 text-[11px] text-muted">
              {filtered.length} of {options.length} · ↑↓ to move, Enter to
              select, Esc to close
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Wraps each search term in the option text so matches are scannable. */
function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  if (tokens.length === 0 || !text) return <>{text}</>;
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        // split() with one capture group puts the matched text at odd indices.
        i % 2 === 1 ? (
          <mark key={i} className="bg-accent/20 text-inherit">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function ChevronGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="m5 13 4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SearchGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="m16 16 4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}