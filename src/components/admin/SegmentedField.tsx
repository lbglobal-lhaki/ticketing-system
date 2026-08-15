"use client";

import { useState } from "react";

export type SegmentOption = {
  value: string;
  label: string;
  /** Explanation shown under the group while this segment is the active one. */
  hint?: string;
};

/**
 * Pill group for the short, fixed-choice fields (cabin, payment method,
 * booking source, status). A `<select>` hides two or three options behind an
 * open-scroll-click; here every choice is visible and picking one is a single
 * click. Backed by real radios, so form submission, keyboard arrow-key
 * navigation, and `required` all work natively — same approach as
 * GstModeFields, generalised.
 *
 * Controlled (pass `value` + `onChange`) or uncontrolled (pass `defaultValue`).
 */
export function SegmentedField({
  name,
  label,
  options,
  value: controlledValue,
  defaultValue,
  onChange,
  required,
  className = "",
  showHint = true,
}: {
  name: string;
  label?: string;
  options: SegmentOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  className?: string;
  showHint?: boolean;
}) {
  const [internal, setInternal] = useState(
    defaultValue ?? options[0]?.value ?? "",
  );
  const value = controlledValue ?? internal;
  const activeHint = options.find((o) => o.value === value)?.hint;

  function pick(next: string) {
    if (controlledValue === undefined) setInternal(next);
    onChange?.(next);
  }

  return (
    <fieldset className={`space-y-2 ${className}`.trim()}>
      {label ? (
        <legend className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
          {label}
        </legend>
      ) : null}
      <div className="inline-flex flex-wrap gap-1 rounded-full border border-line bg-white p-1">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <label
              key={option.value}
              className={`cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition focus-within:ring-2 focus-within:ring-accent/40 ${
                active
                  ? "bg-accent-deep text-white"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={active}
                required={required}
                onChange={() => pick(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
      {showHint && activeHint ? (
        <p className="text-xs text-muted">{activeHint}</p>
      ) : null}
    </fieldset>
  );
}