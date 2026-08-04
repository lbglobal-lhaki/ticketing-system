"use client";

import { forwardRef } from "react";

type MoneyInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode"
>;

/**
 * Currency input built for fast admin data entry — plain `type="number"`
 * fields are fiddly to type into (spinner arrows steal clicks, browsers
 * fight the caret on decimals, and you can't just tap-and-overwrite).
 *
 * This renders a `$` affix and a text field with a numeric keyboard on
 * mobile, selects everything on focus so a single click replaces the whole
 * value, and strips anything that isn't a valid amount as you type. Submits
 * as a normal string value under the same `name`, so every server action
 * that currently does `z.coerce.number()` on these fields keeps working
 * unchanged.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  function MoneyInput(
    { className, onFocus, onChange, ...props },
    ref,
  ) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-sm font-medium text-muted">
          $
        </span>
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          onFocus={(e) => {
            e.currentTarget.select();
            onFocus?.(e);
          }}
          onChange={(e) => {
            const cleaned = e.target.value
              .replace(/[^0-9.]/g, "")
              .replace(/(\..*)\./g, "$1")
              .replace(/^(\d*\.\d{0,2}).*$/, "$1");
            e.target.value = cleaned;
            onChange?.(e);
          }}
          className={`${className ?? ""} pl-6`}
          {...props}
        />
      </div>
    );
  },
);
