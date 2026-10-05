"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
] as const;

function toIso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIso(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDisplay(iso: string) {
  const d = parseIso(iso);
  if (!d) return "Select date";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(d);
}

function buildCalendarDays(month: Date) {
  const first = startOfMonth(month);
  // Monday-first grid
  const weekday = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - weekday);

  const days: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    days.push(day);
  }
  return days;
}

type DatePickerProps = {
  name: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  required?: boolean;
  min?: string;
  /** Visual shell around the trigger (panel card, underline field, bordered box). */
  variant?: "card" | "field" | "box";
  className?: string;
  id?: string;
  /** Shown in the "box" trigger when no date is picked. */
  placeholder?: string;
  /** Dates (YYYY-MM-DD) with flights — bold in the grid, others muted. */
  highlightDates?: string[];
};

export function DatePicker({
  name,
  value,
  onChange,
  label,
  required,
  min,
  variant = "card",
  className = "",
  id,
  placeholder,
  highlightDates,
}: DatePickerProps) {
  const highlighted = useMemo(
    () => (highlightDates?.length ? new Set(highlightDates) : null),
    [highlightDates],
  );
  const autoId = useId();
  const triggerId = id ?? autoId;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => parseIso(value), [value]);
  const minDate = useMemo(() => parseIso(min ?? ""), [min]);
  const today = useMemo(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);

  const [viewMonth, setViewMonth] = useState(() =>
    startOfMonth(selected ?? today),
  );

  useEffect(() => {
    if (open) {
      setViewMonth(startOfMonth(selected ?? minDate ?? today));
    }
  }, [open, selected, minDate, today]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const days = useMemo(() => buildCalendarDays(viewMonth), [viewMonth]);
  const monthLabel = new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric",
  }).format(viewMonth);
  const yearOptions = useMemo(() => {
    const first = Math.min(today.getFullYear(), viewMonth.getFullYear());
    return Array.from({ length: 4 }, (_, i) => first + i);
  }, [today, viewMonth]);

  function pick(day: Date) {
    if (minDate && day < minDate) return;
    onChange(toIso(day));
    setOpen(false);
  }

  const trigger =
    variant === "box" ? (
      <button
        type="button"
        id={triggerId}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className={`flex min-h-14 w-full min-w-0 items-center gap-3 rounded-lg border bg-white px-4 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-deep/40 ${
          open
            ? "border-accent-deep ring-1 ring-accent-deep/30"
            : "border-line hover:border-accent-deep/60"
        } ${className}`}
      >
        <CalendarGlyph className="shrink-0 text-accent-deep" />
        <span
          className={value ? "font-semibold text-foreground" : "text-muted"}
        >
          {value ? formatDisplay(value) : (placeholder ?? label)}
        </span>
      </button>
    ) : variant === "card" ? (
      <button
        type="button"
        id={triggerId}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className={`relative flex min-h-[5.5rem] w-full min-w-0 flex-col items-center justify-center px-4 py-3 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
          open ? "bg-[linear-gradient(180deg,rgba(37,99,235,0.06),transparent)]" : ""
        } ${className}`}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          {label}
        </span>
        <span className="mt-1 flex items-center gap-2 text-sm font-semibold text-foreground">
          <CalendarGlyph className="text-accent" />
          {formatDisplay(value)}
        </span>
      </button>
    ) : (
      <button
        type="button"
        id={triggerId}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full min-w-0 items-center justify-between gap-3 border-0 border-b bg-transparent py-3 text-left text-base outline-none transition focus-visible:border-accent focus-visible:shadow-[0_2px_0_0_var(--accent)] ${
          open ? "border-accent" : "border-line hover:border-accent/60"
        } ${className}`}
      >
        <span className="font-medium text-foreground">{formatDisplay(value)}</span>
        <CalendarGlyph className="shrink-0 text-accent" />
      </button>
    );

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={value} required={required} />
      {variant === "field" ? (
        <label
          htmlFor={triggerId}
          className="mb-1 block text-xs font-medium uppercase tracking-[0.14em] text-muted"
        >
          {label}
        </label>
      ) : null}
      {trigger}

      {open ? (
        <div
          role="dialog"
          aria-label={`${label} calendar`}
          className="absolute left-0 top-[calc(100%+0.25rem)] z-50 w-[min(100vw-2rem,19rem)] overflow-hidden rounded-lg border border-line bg-white p-3 shadow-[0_18px_44px_rgba(15,23,42,0.18)]"
        >
          <div className="mb-3 flex items-center gap-2">
            <NavButton
              label="Previous month"
              onClick={() => setViewMonth((m) => addMonths(m, -1))}
            >
              ‹
            </NavButton>
            <select
              aria-label="Month"
              value={viewMonth.getMonth()}
              onChange={(e) =>
                setViewMonth(
                  new Date(viewMonth.getFullYear(), Number(e.target.value), 1),
                )
              }
              className="min-w-0 flex-1 rounded-md border border-line bg-white px-2 py-1.5 text-sm font-semibold text-foreground outline-none focus:border-accent-deep"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
            <select
              aria-label="Year"
              value={viewMonth.getFullYear()}
              onChange={(e) =>
                setViewMonth(
                  new Date(Number(e.target.value), viewMonth.getMonth(), 1),
                )
              }
              className="min-w-0 flex-1 rounded-md border border-line bg-white px-2 py-1.5 text-sm font-semibold text-foreground outline-none focus:border-accent-deep"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <NavButton
              label="Next month"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
            >
              ›
            </NavButton>
          </div>
          <p className="sr-only" aria-live="polite">
            {monthLabel}
          </p>

          <div className="grid grid-cols-7 border-b border-line pb-1">
            {WEEKDAYS.map((d) => (
              <span
                key={d}
                className="py-1 text-center text-[11px] font-bold tracking-[0.04em] text-accent-deep"
              >
                {d}
              </span>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-0.5">
            {days.map((day) => {
              const inMonth = day.getMonth() === viewMonth.getMonth();
              const iso = toIso(day);
              const isSelected = Boolean(selected && sameDay(day, selected));
              const isToday = sameDay(day, today);
              const disabled = Boolean(minDate && day < minDate);
              const hasFlight = highlighted?.has(iso) ?? false;

              return (
                <button
                  key={iso}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(day)}
                  aria-label={`${iso}${hasFlight ? " — flights available" : ""}`}
                  className={[
                    "inline-flex h-9 items-center justify-center rounded-sm text-sm transition",
                    disabled ? "cursor-not-allowed text-muted/30" : "hover:bg-accent-deep/10",
                    isSelected
                      ? "bg-accent-deep font-bold text-white hover:bg-accent-deep"
                      : isToday
                        ? "bg-accent/15 font-semibold text-accent-deep"
                        : hasFlight
                          ? "font-bold text-accent-deep"
                          : !inMonth || highlighted
                            ? "text-muted/55"
                            : "text-foreground",
                  ].join(" ")}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          {highlighted ? (
            <p className="mt-2 border-t border-line pt-2 text-[11px] text-muted">
              <span className="font-bold text-accent-deep">Bold</span> dates
              have flights.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function NavButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-xl font-semibold text-accent-deep transition hover:bg-accent-deep/10"
    >
      {children}
    </button>
  );
}

function CalendarGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      <rect
        x="3.5"
        y="5"
        width="17"
        height="15"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M3.5 9.5h17M8 3.5v3M16 3.5v3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
