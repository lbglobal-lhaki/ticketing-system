"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/Spinner";

type SubmitButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "children"
> & {
  children: ReactNode;
  /** Shown next to the spinner while submitting; defaults to the normal label. */
  pendingLabel?: ReactNode;
};

/**
 * Drop-in replacement for `<button type="submit">` inside a `<form action={...}>`.
 * Must be rendered as a descendant of that `<form>` — `useFormStatus` reads its
 * pending state from the nearest parent form.
 *
 * Disables itself and shows a spinner the instant the form starts submitting,
 * so a double-click (or a slow network round trip) can't fire the same server
 * action twice — e.g. sending an invoice email, marking a booking paid, or
 * creating a walk-in booking more than once.
 */
export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  className,
  ...rest
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className={className}
      {...rest}
    >
      {pending ? (
        <span className="inline-flex items-center justify-center gap-1.5">
          <Spinner className="size-3.5" />
          {pendingLabel ?? children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
