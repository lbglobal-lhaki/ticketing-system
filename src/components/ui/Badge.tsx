import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Status pill. Tones map onto the palette that already exists — accent blue,
 * `--success` green, `--accent-red`, and neutral grey. Tinted backgrounds are
 * opacity modifiers of those same tokens, so no new hues appear.
 */
export type BadgeTone = "neutral" | "info" | "success" | "danger" | "warning";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-line bg-background text-muted",
  info: "border-accent/25 bg-accent/10 text-accent",
  success:
    "border-[color:var(--success)]/25 bg-[color:var(--success)]/10 [color:var(--success)]",
  danger: "border-accent-red/25 bg-accent-red/10 text-accent-red",
  // Amber is not in the palette; warning reuses the brand red at low emphasis.
  warning: "border-accent-red/20 bg-accent-red/5 text-accent-red",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
        "text-xs font-medium capitalize",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Small round counter for things like "3 filters active". */
export function CountBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-grid min-w-5 place-items-center rounded-full px-1.5 py-0.5",
        "text-[0.65rem] font-semibold leading-none text-white",
        "[background-color:var(--accent-deep)]",
        className,
      )}
    >
      {count}
    </span>
  );
}
