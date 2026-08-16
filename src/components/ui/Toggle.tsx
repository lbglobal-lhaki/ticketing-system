"use client";

import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { CheckIcon } from "@/components/ui/icons";

/*
 * Checkbox / Radio / Switch.
 *
 * All three keep a real `<input>` underneath — visually hidden with `sr-only`
 * (focusable, unlike `display:none`) and styled through `peer-*`. The submitted
 * name/value and the browser's own checked semantics are therefore untouched;
 * only the painted box changes.
 */

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
  description?: ReactNode;
  wrapperClassName?: string;
};

const boxBase =
  "grid size-[18px] shrink-0 place-items-center border transition-colors " +
  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent " +
  "peer-disabled:opacity-50";

const rowBase =
  "flex min-h-10 cursor-pointer items-start gap-3 py-1 " +
  "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60";

export function Checkbox({
  label,
  description,
  wrapperClassName,
  className,
  id,
  ...rest
}: BaseProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className={wrapperClassName}>
      <label htmlFor={inputId} className={rowBase}>
        <span className="flex h-6 items-center">
          <input
            id={inputId}
            type="checkbox"
            className={cn("peer sr-only", className)}
            {...rest}
          />
          <span
            aria-hidden
            className={cn(
              boxBase,
              "rounded-[4px] border-line bg-surface",
              "peer-checked:border-transparent peer-checked:[background-color:var(--accent-deep)] peer-checked:text-white",
            )}
          >
            <CheckIcon className="size-3 opacity-0 peer-checked:opacity-100" />
          </span>
        </span>
        <span className="min-w-0 py-0.5">
          <span className="block text-sm text-foreground">{label}</span>
          {description ? (
            <span className="mt-0.5 block text-xs text-muted">{description}</span>
          ) : null}
        </span>
      </label>
    </div>
  );
}

export function Radio({
  label,
  description,
  wrapperClassName,
  className,
  id,
  ...rest
}: BaseProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className={wrapperClassName}>
      <label htmlFor={inputId} className={rowBase}>
        <span className="flex h-6 items-center">
          <input
            id={inputId}
            type="radio"
            className={cn("peer sr-only", className)}
            {...rest}
          />
          <span
            aria-hidden
            className={cn(
              boxBase,
              "rounded-full border-line bg-surface",
              "peer-checked:border-[6px] peer-checked:[border-color:var(--accent-deep)]",
            )}
          />
        </span>
        <span className="min-w-0 py-0.5">
          <span className="block text-sm text-foreground">{label}</span>
          {description ? (
            <span className="mt-0.5 block text-xs text-muted">{description}</span>
          ) : null}
        </span>
      </label>
    </div>
  );
}

/**
 * Switch — a checkbox wearing a different coat. Same input, same submitted
 * value, so it can replace a boolean checkbox without touching the form.
 */
export function Switch({
  label,
  description,
  wrapperClassName,
  className,
  id,
  ...rest
}: BaseProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className={wrapperClassName}>
      <label
        htmlFor={inputId}
        className="flex min-h-10 cursor-pointer items-start justify-between gap-4 py-1 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
      >
        <span className="min-w-0 py-0.5">
          <span className="block text-sm text-foreground">{label}</span>
          {description ? (
            <span className="mt-0.5 block text-xs text-muted">{description}</span>
          ) : null}
        </span>
        <span className="flex h-6 shrink-0 items-center">
          <input
            id={inputId}
            type="checkbox"
            role="switch"
            className={cn("peer sr-only", className)}
            {...rest}
          />
          <span
            aria-hidden
            className={cn(
              "relative h-5 w-9 rounded-full border border-line bg-line/70 transition-colors",
              "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
              "peer-checked:border-transparent peer-checked:[background-color:var(--accent-deep)]",
              "after:absolute after:left-0.5 after:top-0.5 after:size-3.5 after:rounded-full",
              "after:bg-surface after:shadow-ui-sm after:transition-transform",
              "peer-checked:after:translate-x-4",
            )}
          />
        </span>
      </label>
    </div>
  );
}
