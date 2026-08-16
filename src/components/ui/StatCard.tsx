import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { TrendDownIcon, TrendUpIcon } from "@/components/ui/icons";

export type StatCardProps = {
  label: ReactNode;
  value: ReactNode;
  /** Small line under the value — context, not a second metric. */
  hint?: ReactNode;
  icon?: ReactNode;
  delta?: {
    value: ReactNode;
    /** `up` is not automatically good — pass the reading you want. */
    direction: "up" | "down";
    tone?: "positive" | "negative" | "neutral";
  };
  className?: string;
};

/**
 * Hero metric tile. Uses the existing semantic colours only: `--success` for
 * positive deltas, `--accent-red` for negative, muted grey otherwise.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  delta,
  className,
}: StatCardProps) {
  const tone = delta?.tone ?? (delta?.direction === "up" ? "positive" : "negative");
  const toneClass =
    tone === "positive"
      ? "[color:var(--success)]"
      : tone === "negative"
        ? "text-accent-red"
        : "text-muted";

  return (
    <div
      className={cn(
        "rounded-card border border-line bg-surface p-5 shadow-ui-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
          {label}
        </p>
        {icon ? (
          <span className="grid size-8 shrink-0 place-items-center rounded-control bg-accent/8 text-accent">
            <span className="grid size-4 place-items-center">{icon}</span>
          </span>
        ) : null}
      </div>

      <p className="mt-3 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </p>

      {delta || hint ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {delta ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-medium",
                toneClass,
              )}
            >
              {delta.direction === "up" ? (
                <TrendUpIcon className="size-3.5" />
              ) : (
                <TrendDownIcon className="size-3.5" />
              )}
              {delta.value}
            </span>
          ) : null}
          {hint ? <span className="text-xs text-muted">{hint}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
