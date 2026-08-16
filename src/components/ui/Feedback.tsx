import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/** Shimmerless placeholder — a soft pulse, disabled under reduced motion. */
export function Skeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-control bg-line/70", className)}
    />
  );
}

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/**
 * Shown where a list or panel has nothing in it — says what belongs here and
 * offers the action that fills it, rather than leaving a blank region.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-dashed border-line bg-surface/60 px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <span className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-accent/8 text-accent">
          <span className="grid size-5 place-items-center">{icon}</span>
        </span>
      ) : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint ? (
        <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{hint}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export type AlertTone = "info" | "success" | "danger";

const ALERT_TONES: Record<AlertTone, string> = {
  info: "border-accent/25 bg-accent/8 text-accent",
  success:
    "border-[color:var(--success)]/25 bg-[color:var(--success)]/8 [color:var(--success)]",
  danger: "border-accent-red/25 bg-accent-red/8 text-accent-red",
};

/**
 * Inline status banner. Wraps whatever message the server produced — the copy
 * is passed through untouched.
 */
export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: AlertTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      role="status"
      className={cn(
        "rounded-card border px-4 py-3 text-sm font-medium",
        ALERT_TONES[tone],
        className,
      )}
    >
      {children}
    </p>
  );
}
