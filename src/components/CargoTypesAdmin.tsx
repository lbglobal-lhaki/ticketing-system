"use client";

import { MoneyInput } from "@/components/MoneyInput";
import { SubmitButton } from "@/components/SubmitButton";
import { FieldError, labeledControlClass } from "@/components/forms/FieldError";
import { useStickyAction } from "@/components/forms/useStickyAction";
import { updateCargoRatesAction } from "@/lib/actions/settings";
import { cargoQuoteCents } from "@/lib/cargo/capacity";
import { formatAud } from "@/lib/pricing";

const fieldClass =
  "w-full min-w-0 border-0 border-b border-line bg-transparent py-2 text-sm text-foreground outline-none transition focus:border-accent";

export function CargoTypesAdmin({
  rates,
}: {
  rates: { cargoRatePerKgCents: number; cargoMinChargeCents: number };
}) {
  const sticky = useStickyAction(updateCargoRatesAction);
  const example = cargoQuoteCents(10, rates);
  const live = rates.cargoRatePerKgCents > 0;

  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold tracking-tight">
          Cargo price
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          One rate for every booking. Customers describe the goods on the
          enquiry — personal effects, documents, and the rest — so you do not
          need separate types here.
        </p>
      </div>

      <form
        onSubmit={sticky.onSubmit}
        data-skip-busy
        className="space-y-4 rounded-2xl border border-line bg-white/80 p-4 sm:p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
              Rate per kg
            </span>
            <MoneyInput
              name="cargoRatePerKgAud"
              defaultValue={(rates.cargoRatePerKgCents / 100).toFixed(2)}
              className={labeledControlClass(
                fieldClass,
                sticky.fieldErrors.cargoRatePerKgAud,
              )}
            />
            <FieldError error={sticky.fieldErrors.cargoRatePerKgAud} />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
              Minimum charge
            </span>
            <MoneyInput
              name="cargoMinChargeAud"
              defaultValue={(rates.cargoMinChargeCents / 100).toFixed(2)}
              className={labeledControlClass(
                fieldClass,
                sticky.fieldErrors.cargoMinChargeAud,
              )}
            />
            <p className="mt-1 text-xs text-muted">
              Used when the per-kg total falls below this amount
            </p>
            <FieldError error={sticky.fieldErrors.cargoMinChargeAud} />
          </label>
        </div>

        <p className="text-sm text-muted">
          {live ? (
            <>
              Live on the website
              {example > 0 ? ` · 10 kg would be ${formatAud(example)}` : ""}.
            </>
          ) : (
            "Set a per-kg rate to start selling cargo."
          )}
        </p>

        {sticky.formError ? (
          <p className="text-sm text-red-700">{sticky.formError}</p>
        ) : null}

        <SubmitButton
          pending={sticky.pending}
          pendingLabel="Saving…"
          className="btn-cta min-h-10 px-5 text-sm"
        >
          Save cargo price
        </SubmitButton>
      </form>
    </section>
  );
}
