"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "@/components/Spinner";
import { cn } from "@/components/ui/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * Flat, calm buttons for the admin console.
 *
 * Deliberately does NOT use the `bg-accent-deep` / `bg-accent` utilities: the
 * global stylesheet rewrites those into gradient pills. Colours come from the
 * same tokens (`--accent`, `--accent-deep`, `--accent-red`) via arbitrary
 * `[background-color:var(--token)]` values, so no new hues are introduced and
 * nothing depends on the marketing overrides.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  // `btn-grad` paints --grad-cta / --grad-hover from globals.css.
  primary: "btn-grad text-white border border-transparent",
  secondary:
    "text-foreground bg-surface border border-line hover:border-accent/60 hover:bg-background",
  outline:
    "text-accent bg-transparent border border-accent/45 hover:border-accent hover:bg-accent/8",
  ghost:
    "text-muted bg-transparent border border-transparent hover:bg-line/50 hover:text-foreground",
  destructive:
    "text-white [background-image:var(--grad-badge-promo)] hover:opacity-90 border border-transparent shadow-[0_2px_8px_rgba(220,38,38,0.22)]",
};

const SIZES: Record<ButtonSize, string> = {
  // min-h keeps every control at or above the 40px touch target.
  sm: "min-h-10 gap-1.5 px-3 text-xs",
  md: "min-h-10 gap-2 px-4 text-sm",
  lg: "min-h-12 gap-2 px-5 text-sm",
};

export type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button without changing its width. */
  loading?: boolean;
  loadingLabel?: ReactNode;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
};

export function Button({
  children,
  variant = "secondary",
  size = "md",
  loading = false,
  loadingLabel,
  iconLeft,
  iconRight,
  fullWidth,
  className,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-control font-medium",
        "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner className="size-3.5 shrink-0" />
          {loadingLabel ?? children}
        </>
      ) : (
        <>
          {iconLeft ? <span className="shrink-0">{iconLeft}</span> : null}
          {children}
          {iconRight ? <span className="shrink-0">{iconRight}</span> : null}
        </>
      )}
    </button>
  );
}

export type IconButtonProps = Omit<ButtonProps, "children" | "fullWidth"> & {
  /** Required — an icon-only control has no visible text to name it. */
  label: string;
  icon: ReactNode;
};

export function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "md",
  className,
  ...rest
}: IconButtonProps) {
  return (
    <Button
      variant={variant}
      size={size}
      aria-label={label}
      title={label}
      className={cn("aspect-square !px-0", size === "sm" ? "w-10" : "w-10", className)}
      {...rest}
    >
      <span className="grid size-4 place-items-center">{icon}</span>
    </Button>
  );
}
