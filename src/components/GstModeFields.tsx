"use client";

import { useState } from "react";

export type GstMode = "none" | "exclusive" | "inclusive";

export function resolveGstMode(input: {
  gstRateBps?: number | null;
  gstIncluded?: boolean | null;
}): GstMode {
  if ((input.gstRateBps ?? 0) <= 0) return "none";
  return input.gstIncluded ? "inclusive" : "exclusive";
}

export function gstModeToRates(mode: GstMode): {
  gstRateBps: number;
  gstIncluded: boolean;
} {
  if (mode === "none") return { gstRateBps: 0, gstIncluded: false };
  if (mode === "inclusive") return { gstRateBps: 1000, gstIncluded: true };
  return { gstRateBps: 1000, gstIncluded: false };
}

const btnClass = (active: boolean) =>
  `flex-1 cursor-pointer border px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.08em] transition ${
    active
      ? "border-accent-deep bg-accent-deep text-white"
      : "border-line bg-white text-muted hover:border-accent hover:text-foreground"
  }`;

export function GstModeFields({
  name = "gstMode",
  defaultMode = "none",
  className = "",
}: {
  name?: string;
  defaultMode?: GstMode;
  className?: string;
}) {
  const [mode, setMode] = useState<GstMode>(defaultMode);

  return (
    <fieldset className={`space-y-2 ${className}`.trim()}>
      <legend className="text-xs uppercase tracking-[0.12em] text-muted">
        GST (10%)
      </legend>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["none", "None"],
            ["exclusive", "Exclusive"],
            ["inclusive", "Inclusive"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className={btnClass(mode === value)}>
            <input
              type="radio"
              name={name}
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted">
        {mode === "exclusive"
          ? "Exclusive: 10% GST is added on top of the fare (and card fee if any)."
          : mode === "inclusive"
            ? "Inclusive: amounts already include GST; the GST portion is shown but not added again."
            : "None: no GST on this booking / invoice."}
      </p>
    </fieldset>
  );
}
