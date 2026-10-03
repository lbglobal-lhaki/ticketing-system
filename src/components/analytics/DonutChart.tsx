"use client";

import { useId } from "react";
import { cn } from "@/components/ui/cn";

export type ChartSlice = {
  label: string;
  value: number;
  color: string;
};

export const SEAT_CHART = {
  economyBooked: "#2563eb",
  economyOpen: "#bfdbfe",
  businessBooked: "#1e3a8a",
  businessOpen: "#c7d2fe",
  empty: "#e2e8f0",
} as const;

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function wedgePath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
) {
  if (endDeg - startDeg >= 359.999) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  }
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y} Z`;
}

function donutArcPath(
  cx: number,
  cy: number,
  r: number,
  inner: number,
  startDeg: number,
  endDeg: number,
) {
  const full = endDeg - startDeg >= 359.999;
  if (full) {
    return [
      `M ${cx} ${cy - r}`,
      `A ${r} ${r} 0 1 1 ${cx} ${cy + r}`,
      `A ${r} ${r} 0 1 1 ${cx} ${cy - r}`,
      `M ${cx} ${cy - inner}`,
      `A ${inner} ${inner} 0 1 0 ${cx} ${cy + inner}`,
      `A ${inner} ${inner} 0 1 0 ${cx} ${cy - inner}`,
      "Z",
    ].join(" ");
  }
  const outerStart = polar(cx, cy, r, startDeg);
  const outerEnd = polar(cx, cy, r, endDeg);
  const innerEnd = polar(cx, cy, inner, endDeg);
  const innerStart = polar(cx, cy, inner, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${r} ${r} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${inner} ${inner} 0 ${large} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

export function DonutChart({
  slices,
  title,
  centerValue,
  centerLabel,
  size = 148,
  variant = "donut",
  legend = true,
  className,
}: {
  slices: ChartSlice[];
  title: string;
  centerValue?: string;
  centerLabel?: string;
  size?: number;
  variant?: "donut" | "pie";
  legend?: boolean;
  className?: string;
}) {
  const uid = useId();
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 4;
  const inner = variant === "donut" ? radius * 0.62 : 0;

  const drawn =
    total <= 0
      ? [{ label: "None", value: 1, color: SEAT_CHART.empty }]
      : slices.filter((s) => s.value > 0);

  let cursor = 0;
  const wedges = drawn.map((s, index) => {
    const sweep = (s.value / (total <= 0 ? 1 : total)) * 360;
    const start = cursor;
    const end = cursor + sweep;
    cursor = end;
    const d =
      variant === "pie"
        ? wedgePath(cx, cy, radius, start, end)
        : donutArcPath(cx, cy, radius, inner, start, end);
    return { ...s, d, start, end, key: `${uid}-${index}` };
  });

  const summary = slices
    .map((s) => `${s.label} ${s.value}`)
    .join(", ");

  return (
    <figure className={cn("flex flex-col items-center gap-3", className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-labelledby={`${uid}-title`}
        aria-describedby={`${uid}-desc`}
      >
        <title id={`${uid}-title`}>{title}</title>
        <desc id={`${uid}-desc`}>{summary || "No seats"}</desc>
        {wedges.map((w) => (
          <path key={w.key} d={w.d} fill={w.color} />
        ))}
        {variant === "donut" ? (
          <text
            x={cx}
            y={centerLabel ? cy - 6 : cy + 5}
            textAnchor="middle"
            className="fill-foreground"
            style={{
              fontFamily: "var(--font-syne), ui-sans-serif",
              fontSize: size > 130 ? 22 : 16,
              fontWeight: 700,
            }}
          >
            {centerValue ?? (total > 0 ? String(total) : "0")}
          </text>
        ) : null}
        {variant === "donut" && centerLabel ? (
          <text
            x={cx}
            y={cy + 14}
            textAnchor="middle"
            className="fill-muted"
            style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em" }}
          >
            {centerLabel.toUpperCase()}
          </text>
        ) : null}
      </svg>
      {legend ? (
        <figcaption className="w-full space-y-1.5">
          {slices.map((s) => (
            <div
              key={s.label}
              className="flex items-center justify-between gap-3 text-xs"
            >
              <span className="inline-flex items-center gap-2 text-muted">
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: s.color }}
                  aria-hidden
                />
                {s.label}
              </span>
              <span className="tabular-nums font-semibold text-foreground">
                {s.value}
              </span>
            </div>
          ))}
        </figcaption>
      ) : null}
    </figure>
  );
}
