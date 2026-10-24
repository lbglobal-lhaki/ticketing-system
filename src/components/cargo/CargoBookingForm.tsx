"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { CargoTermsAcceptance } from "@/components/cargo/CargoTermsAcceptance";
import { FieldError, labeledControlClass } from "@/components/forms/FieldError";
import { useStickyAction } from "@/components/forms/useStickyAction";
import { submitCargoBookingAction } from "@/lib/actions/cargoBooking";
import {
  CARGO_CLASSIFICATIONS,
  CARGO_DESCRIPTION_MAX,
  CARGO_HANDLING,
  CARGO_PACKAGING,
  CARGO_PAYMENT_METHODS,
  CARGO_RESTRICTED,
} from "@/lib/cargo/bookingForm";
import { formatKg } from "@/lib/cargo/capacity";
import { priceCargoCharges } from "@/lib/cargo/gst";
import { dualCargoPriceParts } from "@/lib/pricing";
import {
  optionFitsPayload,
  optionHoldKg,
  optionPriceParts,
  optionRangeLabel,
  optionSoldOnOrigin,
  quoteCargoWeightOption,
  type CargoWeightOptionRow,
} from "@/lib/cargo/weightOptions";

export type CargoFlightOption = {
  id: string;
  origin: string;
  route: string;
  departureLabel: string;
  flightNumber: string;
  availableKg: number;
  payloadKg: number;
  usedPct: number;
};

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-line bg-white px-3.5 py-3 text-sm text-foreground outline-none transition focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/35";

const checkboxClass =
  "mt-0.5 size-4 shrink-0 accent-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

function Section({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.06)] sm:p-7">
      <div className="flex items-start gap-3">
        <span className="theme-icon-chip inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-accent-deep">
          {step}
        </span>
        <div className="min-w-0">
          <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold text-accent-deep">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm text-muted">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  error,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block text-sm ${wide ? "sm:col-span-2" : ""}`}>
      <span className="font-medium text-foreground">
        {label}
        {required ? <span className="text-accent-red"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
      <FieldError error={error} />
    </label>
  );
}

function DualPrice({
  audCents,
  btnCents = 0,
  suffix = "",
  size = "card",
  align = "left",
}: {
  audCents: number;
  btnCents?: number;
  suffix?: string;
  size?: "card" | "total";
  align?: "left" | "right";
}) {
  const { aud, btn } = dualCargoPriceParts(audCents, btnCents, suffix);
  const audClass =
    size === "total"
      ? "block font-[family-name:var(--font-syne)] text-2xl font-bold leading-tight text-accent-deep"
      : "block font-[family-name:var(--font-syne)] text-sm font-bold leading-snug text-accent-deep";
  const btnClass =
    size === "total"
      ? "mt-0.5 block text-base font-semibold leading-snug text-accent-deep"
      : "mt-0.5 block text-xs font-semibold leading-snug text-accent-deep";

  return (
    <span
      className={`block min-w-0 ${align === "right" ? "text-right" : ""}`}
    >
      <span className={audClass}>{aud}</span>
      {btn ? <span className={btnClass}>{btn}</span> : null}
    </span>
  );
}

function CheckGroup({
  name,
  options,
  columns = 2,
}: {
  name: string;
  options: readonly string[];
  columns?: number;
}) {
  return (
    <div
      className={`mt-2 grid gap-2 ${columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
    >
      {options.map((option) => (
        <label
          key={option}
          className="flex items-start gap-2.5 rounded-lg border border-line px-3 py-2.5 text-sm text-foreground transition hover:border-accent/40"
        >
          <input
            type="checkbox"
            name={name}
            value={option}
            className={checkboxClass}
          />
          <span>{option}</span>
        </label>
      ))}
    </div>
  );
}

export function CargoBookingForm({
  flights,
  weightOptions,
  gstRateBps,
}: {
  flights: CargoFlightOption[];
  weightOptions: CargoWeightOptionRow[];
  gstRateBps?: number;
}) {
  const sticky = useStickyAction(submitCargoBookingAction);
  const err = (key: string) => sticky.fieldErrors[key];
  const [requestId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `cargo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );

  const [flightId, setFlightId] = useState(flights[0]?.id ?? "");
  const [optionId, setOptionId] = useState("");
  const [actualKg, setActualKg] = useState("");
  const [insurance, setInsurance] = useState<"Yes" | "No">("No");

  const flight = useMemo(
    () => flights.find((f) => f.id === flightId),
    [flights, flightId],
  );

  const offered = useMemo(() => {
    if (!flight) return [];
    return weightOptions.filter(
      (option) =>
        optionSoldOnOrigin(option, flight.origin) &&
        optionFitsPayload(option, flight.availableKg),
    );
  }, [weightOptions, flight]);

  const selected = offered.find((o) => o.id === optionId) ?? null;
  const enteredKg = Number(actualKg) || 0;
  const quote = selected
    ? quoteCargoWeightOption(
        selected,
        selected.kind === "per_kg" ? enteredKg : selected.chargeableKg,
      )
    : null;
  const quoteMoney = quote?.ok
    ? priceCargoCharges({
        exclusiveCents: quote.quotedCents,
        gstRateBps,
      })
    : null;
  const quoteBtnMoney = quote?.ok
    ? priceCargoCharges({
        exclusiveCents: quote.quotedBtnCents,
        gstRateBps,
      })
    : null;
  const quoteCents = quoteMoney?.totalCents ?? 0;
  const quoteBtnCents = quoteBtnMoney?.totalCents ?? 0;
  const holdKg = selected
    ? optionHoldKg(selected, selected.kind === "per_kg" ? enteredKg : 0)
    : 0;
  const overCapacity = Boolean(
    flight && selected && holdKg > 0 && holdKg > flight.availableKg,
  );
  const priced = weightOptions.some((o) => o.active && o.priceCents > 0);

  if (!priced) {
    return (
      <div className="rounded-2xl border border-line bg-white p-8 text-center">
        <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold text-accent-deep">
          Cargo is not on sale yet
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Freight rates are being set. Email us and we will take the booking
          once the price is live.
        </p>
      </div>
    );
  }

  if (flights.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-white p-8 text-center">
        <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold text-accent-deep">
          No departures open for cargo right now
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Every scheduled flight is either full or not yet released. Email us and
          we will let you know as soon as space opens up.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={sticky.onSubmit} className="space-y-5">
      <input type="hidden" name="clientRequestId" value={requestId} />
      <Section
        step={1}
        title="Flight"
        description="Cargo shares the aircraft's payload with passengers, so space is confirmed against a specific departure."
      >
        <Field label="Departure" required error={err("flightId")} wide>
          <select
            name="flightId"
            value={flightId}
            onChange={(e) => {
              setFlightId(e.target.value);
              setOptionId("");
              setActualKg("");
            }}
            data-field-key="flightId"
            aria-invalid={err("flightId") ? true : undefined}
            className={labeledControlClass(fieldClass, err("flightId"))}
          >
            {flights.map((f) => (
              <option key={f.id} value={f.id}>
                {f.route} · {f.departureLabel} · {f.flightNumber} —{" "}
                {formatKg(f.availableKg)} available
              </option>
            ))}
          </select>
        </Field>

        {flight ? (
          <div className="sm:col-span-2">
            <div className="rounded-xl border border-line bg-background p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-foreground">
                  Cargo space left on {flight.flightNumber}
                </p>
                <p className="font-[family-name:var(--font-syne)] text-xl font-bold text-accent-deep">
                  {formatKg(flight.availableKg)}
                </p>
              </div>
              <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-line"
                role="img"
                aria-label={`${flight.usedPct}% of payload used`}
              >
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#2563EB_0%,#DC2626_100%)]"
                  style={{ width: `${flight.usedPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted">
                {flight.usedPct}% of the {formatKg(flight.payloadKg)} payload is
                taken by booked passengers and cargo.
              </p>
            </div>
          </div>
        ) : null}
      </Section>

      <Section
        step={2}
        title="Shipment details"
        description="Tell us what you are sending so we can plan loading and clearance."
      >
        <Field label="Number of packages" required error={err("pieces")}>
          <input
            name="pieces"
            type="number"
            min={1}
            max={500}
            defaultValue={1}
            required
            data-field-key="pieces"
            aria-invalid={err("pieces") ? true : undefined}
            className={labeledControlClass(fieldClass, err("pieces"))}
          />
        </Field>

        <div className="sm:col-span-2">
          <p className="text-sm font-medium text-foreground">
            Weight option
            <span className="text-accent-red"> *</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            {flight
              ? `Options that fit the ${formatKg(flight.availableKg)} left on this ${flight.origin === "PBH" ? "Paro" : "Perth"} departure.`
              : "Pick a departure first."}
          </p>
          <input type="hidden" name="weightOptionId" value={optionId} />
          {offered.length === 0 ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-950">
              No weight options fit this departure. Choose another flight.
            </p>
          ) : (
            <div className="mt-3 grid gap-2">
              {offered.map((option) => {
                const active = option.id === optionId;
                const price = optionPriceParts(option);
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    aria-label={`${option.name}. ${price.aud}${price.btn ? `. ${price.btn}` : ""}`}
                    onClick={() => {
                      setOptionId(option.id);
                      if (option.kind !== "per_kg") setActualKg("");
                    }}
                    className={`rounded-xl border px-4 py-3 text-left transition ${
                      active
                        ? "border-accent-deep bg-accent/5 shadow-[0_8px_24px_rgba(30,58,138,0.08)]"
                        : "border-line bg-white hover:border-accent/50"
                    }`}
                  >
                    <span className="flex min-w-0 items-start justify-between gap-4">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-foreground">
                          {option.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {optionRangeLabel(option)}
                        </span>
                      </span>
                      <DualPrice
                        audCents={option.priceCents}
                        btnCents={option.priceBtnCents}
                        suffix={option.kind === "per_kg" ? " / kg" : ""}
                        align="right"
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <FieldError error={err("weightOptionId")} />
        </div>

        {selected?.kind === "per_kg" ? (
          <Field
            label="Actual weight (kg)"
            required
            error={err("actualKg")}
            hint={
              selected.maxKg != null
                ? `Enter ${selected.minKg}–${selected.maxKg} kg`
                : `Enter at least ${selected.minKg} kg`
            }
            wide
          >
            <input
              name="actualKg"
              type="number"
              min={selected.minKg}
              max={
                flight
                  ? Math.min(
                      flight.availableKg,
                      selected.maxKg ?? flight.availableKg,
                    )
                  : selected.maxKg ?? undefined
              }
              value={actualKg}
              onChange={(e) => setActualKg(e.target.value)}
              required
              data-field-key="actualKg"
              aria-invalid={err("actualKg") ? true : undefined}
              className={labeledControlClass(fieldClass, err("actualKg"))}
            />
          </Field>
        ) : (
          <input type="hidden" name="actualKg" value="0" />
        )}

        {overCapacity && flight ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800 sm:col-span-2"
          >
            Only {formatKg(flight.availableKg)} is left on this departure. Choose
            a smaller option or another flight.
          </p>
        ) : null}

        {quoteMoney && quoteCents > 0 ? (
          <p className="rounded-lg border border-line bg-background px-3.5 py-2.5 text-sm text-foreground sm:col-span-2">
            <span className="block text-sm text-foreground">
              Total including GST
            </span>
            <DualPrice
              audCents={quoteCents}
              btnCents={quoteBtnCents}
              size="total"
            />
            <span className="mt-1 block text-xs text-muted">
              Freight excluding GST:{" "}
              {dualCargoPriceParts(
                quoteMoney.freightCents,
                quoteBtnMoney?.freightCents ?? 0,
              ).aud}
              {quoteBtnMoney && quoteBtnMoney.freightCents > 0
                ? ` · ${dualCargoPriceParts(quoteMoney.freightCents, quoteBtnMoney.freightCents).btn}`
                : ""}
              {quoteMoney.gstCents > 0
                ? `. GST (10%) is included in the total.`
                : ""}{" "}
              {selected
                ? selected.kind === "per_kg"
                  ? `${selected.name} is ${dualCargoPriceParts(selected.priceCents, selected.priceBtnCents).aud}${
                      selected.priceBtnCents > 0
                        ? ` / ${dualCargoPriceParts(selected.priceCents, selected.priceBtnCents).btn}`
                        : ""
                    } per kg for ${holdKg} kg (GST exclusive).`
                  : `${selected.name} is a locked GST-exclusive freight total.`
                : null}
            </span>
          </p>
        ) : null}

        <Field
          label="Dimensions (length × width × height)"
          hint="Per package, in centimetres — e.g. 60 × 40 × 40"
          error={err("dimensions")}
        >
          <input
            name="dimensions"
            data-field-key="dimensions"
            className={labeledControlClass(fieldClass, err("dimensions"))}
          />
        </Field>

        <Field
          label="Declared value (AUD)"
          hint="Used for customs and insurance"
          error={err("declaredValueAud")}
        >
          <input
            name="declaredValueAud"
            type="number"
            min={0}
            step="0.01"
            defaultValue={0}
            data-field-key="declaredValueAud"
            className={labeledControlClass(fieldClass, err("declaredValueAud"))}
          />
        </Field>

        <div className="sm:col-span-2">
          <p className="text-sm font-medium text-foreground">Type of goods</p>
          <p className="text-xs text-muted">Tick all that apply.</p>
          <CheckGroup name="classification" options={CARGO_CLASSIFICATIONS} />
        </div>

        <Field
          label="Description of goods"
          required
          error={err("description")}
          hint={`Be specific — customs relies on this. Up to ${CARGO_DESCRIPTION_MAX} characters.`}
          wide
        >
          <textarea
            name="description"
            rows={3}
            required
            maxLength={CARGO_DESCRIPTION_MAX}
            data-field-key="description"
            aria-invalid={err("description") ? true : undefined}
            className={labeledControlClass(fieldClass, err("description"))}
            placeholder="e.g. 3 cartons of handwoven textiles and 1 carton of packaged tea"
          />
        </Field>

        <Field label="Packaging type" error={err("packaging")}>
          <select
            name="packaging"
            defaultValue=""
            data-field-key="packaging"
            className={labeledControlClass(fieldClass, err("packaging"))}
          >
            <option value="">Select…</option>
            {CARGO_PACKAGING.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        <div className="sm:col-span-2">
          <p className="text-sm font-medium text-foreground">Special handling</p>
          <p className="text-xs text-muted">Leave blank if none applies.</p>
          <CheckGroup name="specialHandling" options={CARGO_HANDLING} columns={3} />
        </div>
      </Section>

      <Section
        step={3}
        title="Sender"
        description="The person or business dropping the cargo off."
      >
        <Field label="Full name" required error={err("senderName")}>
          <input
            name="senderName"
            required
            autoComplete="name"
            data-field-key="senderName"
            aria-invalid={err("senderName") ? true : undefined}
            className={labeledControlClass(fieldClass, err("senderName"))}
          />
        </Field>
        <Field label="Company name" hint="If applicable" error={err("senderCompany")}>
          <input
            name="senderCompany"
            autoComplete="organization"
            data-field-key="senderCompany"
            className={labeledControlClass(fieldClass, err("senderCompany"))}
          />
        </Field>
        <Field label="Address" required error={err("senderAddress")} wide>
          <input
            name="senderAddress"
            required
            autoComplete="street-address"
            data-field-key="senderAddress"
            aria-invalid={err("senderAddress") ? true : undefined}
            className={labeledControlClass(fieldClass, err("senderAddress"))}
          />
        </Field>
        <Field label="City" error={err("senderCity")}>
          <input
            name="senderCity"
            autoComplete="address-level2"
            data-field-key="senderCity"
            className={labeledControlClass(fieldClass, err("senderCity"))}
          />
        </Field>
        <Field label="Country" error={err("senderCountry")}>
          <input
            name="senderCountry"
            autoComplete="country-name"
            data-field-key="senderCountry"
            className={labeledControlClass(fieldClass, err("senderCountry"))}
          />
        </Field>
        <Field label="Phone number" required error={err("senderPhone")}>
          <input
            name="senderPhone"
            type="tel"
            required
            autoComplete="tel"
            data-field-key="senderPhone"
            aria-invalid={err("senderPhone") ? true : undefined}
            className={labeledControlClass(fieldClass, err("senderPhone"))}
          />
        </Field>
        <Field
          label="Email address"
          required
          hint="Your booking confirmation goes here"
          error={err("senderEmail")}
        >
          <input
            name="senderEmail"
            type="email"
            required
            autoComplete="email"
            data-field-key="senderEmail"
            aria-invalid={err("senderEmail") ? true : undefined}
            className={labeledControlClass(fieldClass, err("senderEmail"))}
          />
        </Field>
        <Field label="Passport / ID number" error={err("senderPassport")} wide>
          <input
            name="senderPassport"
            data-field-key="senderPassport"
            className={labeledControlClass(fieldClass, err("senderPassport"))}
          />
        </Field>
      </Section>

      <Section
        step={4}
        title="Receiver"
        description="Who collects the cargo at the destination."
      >
        <Field label="Full name" required error={err("receiverName")}>
          <input
            name="receiverName"
            required
            data-field-key="receiverName"
            aria-invalid={err("receiverName") ? true : undefined}
            className={labeledControlClass(fieldClass, err("receiverName"))}
          />
        </Field>
        <Field label="Company name" hint="If applicable" error={err("receiverCompany")}>
          <input
            name="receiverCompany"
            data-field-key="receiverCompany"
            className={labeledControlClass(fieldClass, err("receiverCompany"))}
          />
        </Field>
        <Field label="Delivery address" required error={err("receiverAddress")} wide>
          <input
            name="receiverAddress"
            required
            data-field-key="receiverAddress"
            aria-invalid={err("receiverAddress") ? true : undefined}
            className={labeledControlClass(fieldClass, err("receiverAddress"))}
          />
        </Field>
        <Field label="Phone number" required error={err("receiverPhone")}>
          <input
            name="receiverPhone"
            type="tel"
            required
            data-field-key="receiverPhone"
            aria-invalid={err("receiverPhone") ? true : undefined}
            className={labeledControlClass(fieldClass, err("receiverPhone"))}
          />
        </Field>
        <Field label="Email address" error={err("receiverEmail")}>
          <input
            name="receiverEmail"
            type="email"
            data-field-key="receiverEmail"
            aria-invalid={err("receiverEmail") ? true : undefined}
            className={labeledControlClass(fieldClass, err("receiverEmail"))}
          />
        </Field>
        <Field label="Passport / ID number" error={err("receiverPassport")}>
          <input
            name="receiverPassport"
            data-field-key="receiverPassport"
            className={labeledControlClass(fieldClass, err("receiverPassport"))}
          />
        </Field>
        <Field
          label="Relationship to sender"
          hint="e.g. family, customer, own business"
          error={err("relationship")}
        >
          <input
            name="relationship"
            data-field-key="relationship"
            className={labeledControlClass(fieldClass, err("relationship"))}
          />
        </Field>
      </Section>

      <Section
        step={5}
        title="Safety and biosecurity"
        description="Air cargo is subject to dangerous goods and quarantine rules in both countries."
      >
        <div className="sm:col-span-2">
          <p className="text-sm font-medium text-foreground">
            Does your shipment contain any of the following?
          </p>
          <p className="text-xs text-muted">
            Tick anything that applies. Leaving this blank declares none of them.
          </p>
          <CheckGroup name="restricted" options={CARGO_RESTRICTED} columns={2} />
        </div>

        <div className="sm:col-span-2">
          <label className="flex items-start gap-3 rounded-lg border border-line px-3.5 py-3 text-sm text-foreground">
            <input
              type="checkbox"
              name="biosecurityDeclared"
              required
              data-field-key="biosecurityDeclared"
              aria-invalid={err("biosecurityDeclared") ? true : undefined}
              className={checkboxClass}
            />
            <span>
              I declare this shipment contains no undeclared food, plant, seed,
              soil or animal material, and that everything listed above is
              accurate.
              <span className="text-accent-red"> *</span>
            </span>
          </label>
          <FieldError error={err("biosecurityDeclared")} />
        </div>
      </Section>

      <Section
        step={6}
        title="Payment"
        description="Submitting this form requests a booking. You will receive an invoice by email. The booking is officially confirmed only after payment is verified."
      >
        {quoteMoney && quoteCents > 0 ? (
          <div className="rounded-xl border border-line bg-background px-4 py-3 sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Amount due
            </p>
            <div className="mt-1">
              <DualPrice
                audCents={quoteCents}
                btnCents={quoteBtnCents}
                size="total"
              />
            </div>
            <p className="mt-1 text-xs text-muted">
              Freight excluding GST is shown above. GST (10%) is included in
              both totals when it applies.
              {selected
                ? ` · ${selected.name}${
                    selected.kind === "per_kg" && holdKg > 0
                      ? ` · ${formatKg(holdKg)}`
                      : ""
                  }`
                : ""}
            </p>
          </div>
        ) : null}

        <Field label="Preferred payment method" required error={err("paymentMethod")}>
          <select
            name="paymentMethod"
            defaultValue={CARGO_PAYMENT_METHODS[0]}
            required
            data-field-key="paymentMethod"
            aria-invalid={err("paymentMethod") ? true : undefined}
            className={labeledControlClass(fieldClass, err("paymentMethod"))}
          >
            {CARGO_PAYMENT_METHODS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Would you like cargo insurance?" error={err("insurance")}>
          <select
            name="insurance"
            value={insurance}
            onChange={(e) => setInsurance(e.target.value === "Yes" ? "Yes" : "No")}
            data-field-key="insurance"
            className={labeledControlClass(fieldClass, err("insurance"))}
          >
            <option value="No">No</option>
            <option value="Yes">Yes</option>
          </select>
        </Field>

        {insurance === "Yes" ? (
          <Field
            label="Amount to insure (AUD)"
            error={err("insuranceAmountAud")}
            wide
          >
            <input
              name="insuranceAmountAud"
              type="number"
              min={0}
              step="0.01"
              defaultValue={0}
              data-field-key="insuranceAmountAud"
              className={labeledControlClass(
                fieldClass,
                err("insuranceAmountAud"),
              )}
            />
          </Field>
        ) : null}

        <CargoTermsAcceptance
          error={err("termsAccepted")}
          checkboxClass={checkboxClass}
        />
      </Section>

      {sticky.formError ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {sticky.formError}
        </p>
      ) : null}

      <div className="flex flex-col items-center gap-3 pb-4">
        <SubmitButton
          pending={sticky.pending}
          pendingLabel="Submitting…"
          disabled={!selected || quoteCents <= 0 || overCapacity}
          className="btn-cta min-h-12 w-full px-10 text-sm disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
        >
          Submit booking request
        </SubmitButton>
        <p className="text-center text-xs text-muted">
          You get a booking reference straight away. An invoice will be emailed.
          Official confirmation follows once payment is verified.
        </p>
      </div>
    </form>
  );
}
