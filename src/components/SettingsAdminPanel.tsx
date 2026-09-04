"use client";

import { MoneyInput } from "@/components/MoneyInput";
import { SubmitButton } from "@/components/SubmitButton";
import { FieldError, labeledControlClass } from "@/components/forms/FieldError";
import { useStickyAction } from "@/components/forms/useStickyAction";
import { updateSiteSettingsAction } from "@/lib/actions/settings";
import { formatKg } from "@/lib/cargo/capacity";
import { formatAud } from "@/lib/pricing";

export type AdminSiteSettings = {
  seatWindowCents: number;
  seatExitRowCents: number;
  seatStandardCents: number;
  cargoRatePerKgCents: number;
  cargoMinChargeCents: number;
  defaultPayloadKg: number;
  passengerPayloadKg: number;
};

const fieldClass =
  "w-full border-0 border-b border-line bg-transparent py-3 text-sm text-foreground outline-none transition focus:border-accent";

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-ui-sm">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function MoneyField({
  name,
  label,
  hint,
  cents,
  error,
}: {
  name: string;
  label: string;
  hint?: string;
  cents: number;
  error?: string;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-xs uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <MoneyInput
        name={name}
        defaultValue={(cents / 100).toFixed(2)}
        data-field-key={name}
        aria-invalid={error ? true : undefined}
        className={labeledControlClass(fieldClass, error)}
      />
      {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      <FieldError error={error} />
    </label>
  );
}

function NumberField({
  name,
  label,
  hint,
  value,
  min,
  max,
  error,
}: {
  name: string;
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  error?: string;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-xs uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <input
        name={name}
        type="number"
        min={min}
        max={max}
        defaultValue={value}
        data-field-key={name}
        aria-invalid={error ? true : undefined}
        className={labeledControlClass(fieldClass, error)}
      />
      {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      <FieldError error={error} />
    </label>
  );
}

export function SettingsAdminPanel({
  settings,
}: {
  settings: AdminSiteSettings;
}) {
  const sticky = useStickyAction(updateSiteSettingsAction);
  const err = (key: string) => sticky.fieldErrors[key];

  const seatsFree =
    settings.seatWindowCents <= 0 &&
    settings.seatExitRowCents <= 0 &&
    settings.seatStandardCents <= 0;
  const maxPassengers = Math.floor(
    settings.defaultPayloadKg / Math.max(1, settings.passengerPayloadKg),
  );

  return (
    <form onSubmit={sticky.onSubmit} className="space-y-5">
      <Card
        title="Seat selection pricing"
        description={
          seatsFree
            ? "Seat choice is currently free — customers pick any seat with no surcharge and no prices are shown anywhere in checkout. Enter an amount to start charging."
            : "These surcharges apply to economy seats only; business fares always include seat choice. Window and exit-row amounts stack on a seat that is both."
        }
      >
        <MoneyField
          name="seatWindowAud"
          label="Window seat (A / F)"
          cents={settings.seatWindowCents}
          error={err("seatWindowAud")}
        />
        <MoneyField
          name="seatExitRowAud"
          label="Exit row (12 / 14)"
          hint="Extra legroom"
          cents={settings.seatExitRowCents}
          error={err("seatExitRowAud")}
        />
        <MoneyField
          name="seatStandardAud"
          label="Any other economy seat"
          hint="Leave at $0.00 to keep standard seats free"
          cents={settings.seatStandardCents}
          error={err("seatStandardAud")}
        />
        <div className="rounded-card border border-line bg-background p-4 text-sm text-muted">
          <p className="font-medium text-foreground">Right now</p>
          <p className="mt-1">
            {seatsFree
              ? "No seat prices are shown in checkout."
              : `Window ${formatAud(settings.seatWindowCents)} · Exit row ${formatAud(
                  settings.seatExitRowCents,
                )} · Standard ${formatAud(settings.seatStandardCents)}`}
          </p>
        </div>
      </Card>

      <Card
        title="Payload and capacity"
        description="Passengers and cargo share one weight budget per departure. Each seated passenger is costed at the per-passenger weight below, and whatever is left is sellable as cargo. Override the payload on individual flights in Add / Edit."
      >
        <NumberField
          name="defaultPayloadKg"
          label="Default payload (kg)"
          hint="Applied to new flights"
          value={settings.defaultPayloadKg}
          min={0}
          max={200_000}
          error={err("defaultPayloadKg")}
        />
        <NumberField
          name="passengerPayloadKg"
          label="Weight per passenger (kg)"
          hint="Body + checked baggage + cabin baggage"
          value={settings.passengerPayloadKg}
          min={1}
          max={500}
          error={err("passengerPayloadKg")}
        />
        <div className="rounded-card border border-line bg-background p-4 text-sm text-muted sm:col-span-2">
          <p className="font-medium text-foreground">
            {formatKg(settings.defaultPayloadKg)} ÷{" "}
            {formatKg(settings.passengerPayloadKg)} per passenger ={" "}
            {maxPassengers} seats on an empty aircraft
          </p>
          <p className="mt-1">
            Every seat sold removes {formatKg(settings.passengerPayloadKg)} of
            sellable cargo, and every kilogram of cargo booked removes seats.
            Sectors with a higher payload — Perth, for example — carry more
            passengers, so set those flights individually.
          </p>
        </div>
      </Card>

      <Card
        title="Cargo rates"
        description="Shown as an estimate on the public cargo booking form and stored against each booking. Leave the rate at $0.00 to keep quoting offline — no prices appear to customers."
      >
        <MoneyField
          name="cargoRatePerKgAud"
          label="Rate per kg"
          cents={settings.cargoRatePerKgCents}
          error={err("cargoRatePerKgAud")}
        />
        <MoneyField
          name="cargoMinChargeAud"
          label="Minimum charge"
          hint="Applied when the per-kg total falls below it"
          cents={settings.cargoMinChargeCents}
          error={err("cargoMinChargeAud")}
        />
      </Card>

      {sticky.formError ? (
        <p
          role="alert"
          className="rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {sticky.formError}
        </p>
      ) : null}

      <div className="flex justify-end">
        <SubmitButton
          pending={sticky.pending}
          pendingLabel="Saving…"
          className="btn-grad min-h-11 rounded-control px-6 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-70"
        >
          Save settings
        </SubmitButton>
      </div>
    </form>
  );
}
