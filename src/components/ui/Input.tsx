"use client";

import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/components/ui/cn";

/** Shared shell styling so Input, Textarea, Select and the date trigger match. */
export const controlShell =
  "w-full rounded-control border border-line bg-surface text-sm text-foreground " +
  "placeholder:text-muted/70 transition-colors " +
  "hover:border-muted/50 " +
  "focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/30 " +
  "disabled:cursor-not-allowed disabled:bg-background disabled:text-muted";

export const controlPadding = "min-h-10 px-3 py-2.5";

export const controlInvalid =
  "border-accent-red/70 focus-visible:border-accent-red focus-visible:outline-accent-red/25";

export type FormFieldProps = {
  label: ReactNode;
  /** Renders the asterisk and is forwarded to the control as `required`. */
  required?: boolean;
  helper?: ReactNode;
  error?: ReactNode;
  className?: string;
  /** id of the control this label describes. */
  htmlFor: string;
  describedById?: string;
  children: ReactNode;
};

/**
 * Label + control + helper/error, wired for screen readers.
 *
 * The asterisk is `aria-hidden` — required-ness is announced by the control's
 * own `required` attribute rather than by reading punctuation aloud.
 */
export function FormField({
  label,
  required,
  helper,
  error,
  className,
  htmlFor,
  describedById,
  children,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium uppercase tracking-[0.08em] text-muted"
      >
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-accent-red">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p
          id={describedById}
          className="text-xs font-medium text-accent-red"
        >
          {error}
        </p>
      ) : helper ? (
        <p id={describedById} className="text-xs text-muted">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  /** Static text rendered inside the control, e.g. a currency symbol. */
  prefix?: ReactNode;
  suffix?: ReactNode;
  wrapperClassName?: string;
};

export function Input({
  label,
  helper,
  error,
  iconLeft,
  iconRight,
  prefix,
  suffix,
  wrapperClassName,
  className,
  id,
  required,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = helper || error ? `${inputId}-msg` : undefined;

  const control = (
    <div className="relative flex items-center">
      {iconLeft ? (
        <span className="pointer-events-none absolute left-3 grid size-4 place-items-center text-muted">
          {iconLeft}
        </span>
      ) : null}
      {prefix ? (
        <span className="pointer-events-none absolute left-3 text-sm text-muted">
          {prefix}
        </span>
      ) : null}
      <input
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={messageId}
        className={cn(
          controlShell,
          controlPadding,
          (iconLeft || prefix) && "pl-9",
          (iconRight || suffix) && "pr-9",
          error && controlInvalid,
          className,
        )}
        {...rest}
      />
      {iconRight ? (
        <span className="pointer-events-none absolute right-3 grid size-4 place-items-center text-muted">
          {iconRight}
        </span>
      ) : null}
      {suffix ? (
        <span className="pointer-events-none absolute right-3 text-sm text-muted">
          {suffix}
        </span>
      ) : null}
    </div>
  );

  if (!label) {
    return <div className={wrapperClassName}>{control}</div>;
  }

  return (
    <FormField
      label={label}
      required={required}
      helper={helper}
      error={error}
      htmlFor={inputId}
      describedById={messageId}
      className={wrapperClassName}
    >
      {control}
    </FormField>
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
  wrapperClassName?: string;
};

export function Textarea({
  label,
  helper,
  error,
  wrapperClassName,
  className,
  id,
  required,
  ...rest
}: TextareaProps) {
  const generatedId = useId();
  const areaId = id ?? generatedId;
  const messageId = helper || error ? `${areaId}-msg` : undefined;

  const control = (
    <textarea
      id={areaId}
      required={required}
      aria-invalid={error ? true : undefined}
      aria-describedby={messageId}
      className={cn(
        controlShell,
        "resize-y px-3 py-2.5",
        error && controlInvalid,
        className,
      )}
      {...rest}
    />
  );

  if (!label) return <div className={wrapperClassName}>{control}</div>;

  return (
    <FormField
      label={label}
      required={required}
      helper={helper}
      error={error}
      htmlFor={areaId}
      describedById={messageId}
      className={wrapperClassName}
    >
      {control}
    </FormField>
  );
}
