"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { cn } from "@/components/ui/cn";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarIcon,
  ClockIcon,
} from "@/components/ui/icons";
import { FormField, controlPadding, controlShell } from "@/components/ui/Input";

/*
 * Drop-in replacement for `<input type="datetime-local">` and `<input type="date">`.
 *
 * VALUE FORMAT — this is the whole ballgame.
 *
 *   showTime (default) — `YYYY-MM-DDTHH:mm`, paired with a hidden
 *     `tzOffsetMinutes` and parsed server-side by `parseDateTimeLocal()`.
 *   showTime={false}  — `YYYY-MM-DD`, what `<input type="date">` submitted
 *     and what `parseDateOfBirth()` expects.
 *
 * Anything else (ISO with `Z`, a Date, a timestamp) throws server side.
 * `formatValue`/`parseValue` below are the only places that format, and they
 * are deliberately string-based so no Date/UTC conversion can creep in.
 *
 * The submitted field is a real focusable input carrying `name` and `required`
 * — the same pattern `admin/Combobox` uses for its hidden `<select>` — so the
 * browser's native required-blocking behaves exactly as it did before.
 */

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

type Parts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
};

/** `YYYY-MM-DDTHH:mm` or `YYYY-MM-DD` → parts, or null when empty/unparseable. */
export function parseValue(value: string | undefined | null): Parts | null {
  if (!value) return null;
  const raw = value.trim();
  const dt = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/,
  );
  if (dt) {
    return {
      year: Number(dt[1]),
      month: Number(dt[2]),
      day: Number(dt[3]),
      hour: Number(dt[4]),
      minute: Number(dt[5]),
    };
  }
  const d = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!d) return null;
  return {
    year: Number(d[1]),
    month: Number(d[2]),
    day: Number(d[3]),
    hour: 0,
    minute: 0,
  };
}

/** parts → `YYYY-MM-DDTHH:mm` or `YYYY-MM-DD`. */
export function formatValue(p: Parts, withTime = true): string {
  const date = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  if (!withTime) return date;
  return `${date}T${pad(p.hour)}:${pad(p.minute)}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

/** Monday-first weekday index (0-6) of the 1st of the month. */
function firstWeekdayIndex(year: number, month: number) {
  return (new Date(year, month - 1, 1).getDay() + 6) % 7;
}

function clampDay(year: number, month: number, day: number) {
  return Math.min(day, daysInMonth(year, month));
}

function humanLabel(p: Parts, showTime: boolean) {
  const date = new Date(p.year, p.month - 1, p.day, p.hour, p.minute);
  return date.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(showTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  });
}

export type DateTimePickerProps = {
  name: string;
  label?: React.ReactNode;
  /**
   * Initial value. Datetime: `YYYY-MM-DDTHH:mm`. Date-only: `YYYY-MM-DD`.
   * Ignored when `value` is set (controlled).
   */
  defaultValue?: string;
  /** Controlled value. Same formats as `defaultValue`. */
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  helper?: React.ReactNode;
  error?: React.ReactNode;
  /** False = calendar date only (date of birth). Default includes time. */
  showTime?: boolean;
  placeholder?: string;
  className?: string;
  wrapperClassName?: string;
  id?: string;
  /** Inclusive bounds as `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`. */
  min?: string;
  max?: string;
};

export function DateTimePicker({
  name,
  label,
  defaultValue = "",
  value: valueProp,
  onChange,
  required,
  helper,
  error,
  showTime = true,
  placeholder,
  className,
  wrapperClassName,
  id,
  min,
  max,
}: DateTimePickerProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const messageId = helper || error ? `${fieldId}-msg` : undefined;
  const gridId = `${fieldId}-grid`;
  const resolvedPlaceholder =
    placeholder ?? (showTime ? "Select date and time" : "Select date");

  const isControlled = valueProp !== undefined;
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const value = isControlled ? valueProp : uncontrolled;

  function setValue(next: string) {
    if (!isControlled) setUncontrolled(next);
    onChange?.(next);
  }

  const [open, setOpen] = useState(false);

  const parsed = useMemo(() => parseValue(value), [value]);
  const today = useMemo(() => new Date(), []);

  // Cursor = the day keyboard focus sits on; starts at the value or today.
  const [view, setView] = useState(() => {
    const p = parseValue(valueProp ?? defaultValue);
    return {
      year: p?.year ?? today.getFullYear(),
      month: p?.month ?? today.getMonth() + 1,
      day: p?.day ?? today.getDate(),
    };
  });

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const minParts = useMemo(() => parseValue(min), [min]);
  const maxParts = useMemo(() => parseValue(max), [max]);

  function outOfRange(year: number, month: number, day: number) {
    const stamp = year * 10000 + month * 100 + day;
    if (minParts) {
      const lo = minParts.year * 10000 + minParts.month * 100 + minParts.day;
      if (stamp < lo) return true;
    }
    if (maxParts) {
      const hi = maxParts.year * 10000 + maxParts.month * 100 + maxParts.day;
      if (stamp > hi) return true;
    }
    return false;
  }

  // Click-outside and Escape close the popover and return focus to the trigger.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) gridRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const p = parseValue(value);
    if (p) {
      setView({ year: p.year, month: p.month, day: p.day });
    }
    // Snap the calendar to the current value only when the popover opens —
    // including `value` here would yank the month back while browsing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function commit(next: Partial<Parts>) {
    const base: Parts = parsed ?? {
      year: view.year,
      month: view.month,
      day: view.day,
      hour: 0,
      minute: 0,
    };
    const merged = { ...base, ...next };
    merged.day = clampDay(merged.year, merged.month, merged.day);
    setValue(formatValue(merged, showTime));
  }

  function selectDay(day: number) {
    if (outOfRange(view.year, view.month, day)) return;
    setView((v) => ({ ...v, day }));
    commit({ year: view.year, month: view.month, day });
    if (!showTime) {
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  function shiftView(deltaMonths: number) {
    setView((v) => {
      const total = v.year * 12 + (v.month - 1) + deltaMonths;
      const year = Math.floor(total / 12);
      const month = (total % 12) + 1;
      return { year, month, day: clampDay(year, month, v.day) };
    });
  }

  function onGridKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (e.key in step) {
      e.preventDefault();
      const d = new Date(view.year, view.month - 1, view.day);
      d.setDate(d.getDate() + step[e.key]!);
      setView({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate(),
      });
      return;
    }
    if (e.key === "PageUp") {
      e.preventDefault();
      shiftView(-1);
      return;
    }
    if (e.key === "PageDown") {
      e.preventDefault();
      shiftView(1);
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setView((v) => ({
        ...v,
        day: e.key === "Home" ? 1 : daysInMonth(v.year, v.month),
      }));
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectDay(view.day);
      if (!showTime) {
        setOpen(false);
        triggerRef.current?.focus();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  const leading = firstWeekdayIndex(view.year, view.month);
  const total = daysInMonth(view.year, view.month);
  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const yearOptions = useMemo(() => {
    const nowYear = today.getFullYear();
    if (!showTime) {
      const lo = minParts?.year ?? nowYear - 120;
      const hi = maxParts?.year ?? nowYear;
      const start = Math.min(lo, view.year);
      const end = Math.max(hi, view.year);
      const years: number[] = [];
      for (let y = end; y >= start; y -= 1) years.push(y);
      return years;
    }
    const lo = minParts?.year ?? view.year - 5;
    const hi = maxParts?.year ?? view.year + 5;
    const start = Math.min(lo, view.year);
    const end = Math.max(hi, view.year);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [showTime, minParts, maxParts, view.year, today]);

  const control = (
    <div ref={rootRef} className={cn("relative", className)}>
      {/*
        The submitted field. Focusable (not `display:none`) so Chrome can focus
        it when `required` blocks submission — a visually hidden but focusable
        input, the same trick admin/Combobox uses for its <select>.
      */}
      <input
        type="text"
        name={name}
        value={value}
        required={required}
        readOnly
        tabIndex={-1}
        aria-hidden
        data-field-key={name}
        aria-invalid={error ? true : undefined}
        className="sr-only"
        onChange={() => {}}
      />

      <button
        ref={triggerRef}
        type="button"
        id={fieldId}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={messageId}
        className={cn(
          controlShell,
          controlPadding,
          // !rounded-full beats the unlayered `button { border-radius: 0 }`
          // reset in globals.css so this matches the pill SegmentedFields.
          "!rounded-full flex items-center justify-between gap-2 text-left",
          error && "border-accent-red/70",
        )}
      >
        <span className={cn(!parsed && "text-muted/70")}>
          {parsed ? humanLabel(parsed, showTime) : resolvedPlaceholder}
        </span>
        <CalendarIcon className="size-4 shrink-0 text-muted" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-label={typeof label === "string" ? label : "Choose a date"}
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-[19.5rem] rounded-modal border border-line bg-surface p-3 shadow-ui-lg"
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => shiftView(-1)}
              aria-label="Previous month"
              className="grid size-10 place-items-center !rounded-full text-muted transition-colors hover:bg-line/50 hover:text-foreground"
            >
              <ChevronLeftIcon className="size-4" />
            </button>

            <div className="flex items-center gap-1.5">
              <label className="sr-only" htmlFor={`${fieldId}-month`}>
                Month
              </label>
              <select
                id={`${fieldId}-month`}
                value={view.month}
                onChange={(e) =>
                  setView((v) => {
                    const month = Number(e.target.value);
                    return { ...v, month, day: clampDay(v.year, month, v.day) };
                  })
                }
                className="!rounded-full border border-line bg-surface px-2 py-1.5 text-sm"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor={`${fieldId}-year`}>
                Year
              </label>
              <select
                id={`${fieldId}-year`}
                value={view.year}
                onChange={(e) =>
                  setView((v) => {
                    const year = Number(e.target.value);
                    return { ...v, year, day: clampDay(year, v.month, v.day) };
                  })
                }
                className="!rounded-full border border-line bg-surface px-2 py-1.5 text-sm"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => shiftView(1)}
              aria-label="Next month"
              className="grid size-10 place-items-center !rounded-full text-muted transition-colors hover:bg-line/50 hover:text-foreground"
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((d) => (
              <span
                key={d}
                className="py-1 text-[0.65rem] font-medium uppercase tracking-wide text-muted"
              >
                {d}
              </span>
            ))}
          </div>

          <div
            ref={gridRef}
            id={gridId}
            role="grid"
            tabIndex={0}
            onKeyDown={onGridKeyDown}
            aria-label="Calendar"
            className="mt-0.5 grid grid-cols-7 gap-0.5 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {cells.map((day, i) => {
              if (day === null) return <span key={`pad-${i}`} />;
              const isSelected =
                parsed?.year === view.year &&
                parsed?.month === view.month &&
                parsed?.day === day;
              const isToday =
                today.getFullYear() === view.year &&
                today.getMonth() + 1 === view.month &&
                today.getDate() === day;
              const isCursor = view.day === day;
              const disabled = outOfRange(view.year, view.month, day);

              return (
                <button
                  key={day}
                  type="button"
                  role="gridcell"
                  tabIndex={-1}
                  disabled={disabled}
                  aria-selected={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  onClick={() => selectDay(day)}
                  className={cn(
                    "grid size-9 place-items-center !rounded-full text-sm transition-colors",
                    "disabled:cursor-not-allowed disabled:text-muted/40",
                    isSelected
                      ? "text-white [background-color:var(--accent-deep)]"
                      : "hover:bg-line/60",
                    !isSelected && isToday && "ring-1 ring-inset ring-accent/50",
                    !isSelected && isCursor && "bg-line/40",
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {showTime ? (
            <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
              <ClockIcon className="size-4 shrink-0 text-muted" />
              <label className="sr-only" htmlFor={`${fieldId}-hour`}>
                Hour
              </label>
              <select
                id={`${fieldId}-hour`}
                value={parsed?.hour ?? 0}
                onChange={(e) => commit({ hour: Number(e.target.value) })}
                className="!rounded-full border border-line bg-surface px-2 py-1.5 text-sm"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {pad(h)}
                  </option>
                ))}
              </select>
              <span className="text-muted">:</span>
              <label className="sr-only" htmlFor={`${fieldId}-minute`}>
                Minute
              </label>
              <select
                id={`${fieldId}-minute`}
                value={parsed?.minute ?? 0}
                onChange={(e) => commit({ minute: Number(e.target.value) })}
                className="!rounded-full border border-line bg-surface px-2 py-1.5 text-sm"
              >
                {Array.from({ length: 60 }, (_, m) => (
                  <option key={m} value={m}>
                    {pad(m)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className="ml-auto !rounded-full px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
              >
                Done
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (!label) return <div className={wrapperClassName}>{control}</div>;

  return (
    <FormField
      label={label}
      required={required}
      helper={helper}
      error={error}
      htmlFor={fieldId}
      describedById={messageId}
      className={wrapperClassName}
    >
      {control}
    </FormField>
  );
}
