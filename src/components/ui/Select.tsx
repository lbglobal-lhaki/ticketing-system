"use client";

import { useId, type ReactNode, type SelectHTMLAttributes } from "react";
import { cn } from "@/components/ui/cn";
import { ChevronDownIcon } from "@/components/ui/icons";
import { FormField, controlPadding, controlShell } from "@/components/ui/Input";

/**
 * Styled native `<select>`.
 *
 * Deliberately native rather than a custom listbox: it submits exactly what it
 * always did, and the platform already gives free keyboard navigation,
 * type-ahead and mobile pickers. `admin/Combobox` remains the answer for long,
 * searchable lists — it already implements the custom-panel pattern.
 */
export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
  wrapperClassName?: string;
};

export function Select({
  label,
  helper,
  error,
  wrapperClassName,
  className,
  id,
  required,
  children,
  ...rest
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const messageId = helper || error ? `${selectId}-msg` : undefined;

  const control = (
    <div className="relative flex items-center">
      <select
        id={selectId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={messageId}
        className={cn(
          controlShell,
          controlPadding,
          "appearance-none pr-9",
          error &&
            "border-accent-red/70 focus-visible:border-accent-red focus-visible:outline-accent-red/25",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3 size-4 text-muted" />
    </div>
  );

  if (!label) return <div className={wrapperClassName}>{control}</div>;

  return (
    <FormField
      label={label}
      required={required}
      helper={helper}
      error={error}
      htmlFor={selectId}
      describedById={messageId}
      className={wrapperClassName}
    >
      {control}
    </FormField>
  );
}
