"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { StripePaymentFields } from "@/components/StripePaymentFields";
import { payWithCardAction } from "@/lib/actions/payment";
import { calculateCardServiceFee } from "@/lib/payments/fees";
import { formatAud } from "@/lib/pricing";

const fieldClass =
  "w-full border-0 border-b border-line bg-transparent py-3 text-sm text-foreground outline-none transition focus-visible:border-accent focus-visible:shadow-[0_2px_0_0_var(--accent)]";

const AU_STATES = [
  "ACT",
  "NSW",
  "NT",
  "QLD",
  "SA",
  "TAS",
  "VIC",
  "WA",
] as const;

type CardCheckoutFormProps = {
  quoteId: string;
  maxSeats: number;
  /** Total airfare for the party (or legacy unit×seats already applied). */
  partyFareCents: number;
  initialPassenger: {
    passengerName: string;
    email: string;
    passengerPhone?: string;
    passportNumber?: string;
    nationality?: string;
    seatsBooked?: number;
  };
  stripe: {
    publishableKey: string;
    clientSecret: string | null;
    error?: string | null;
  };
};

function splitPassengerName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { givenName: "", familyName: "" };
  if (parts.length === 1) return { givenName: parts[0], familyName: "" };
  return {
    givenName: parts[0],
    familyName: parts.slice(1).join(" "),
  };
}

export function CardCheckoutForm({
  quoteId,
  maxSeats,
  partyFareCents,
  initialPassenger,
  stripe,
}: CardCheckoutFormProps) {
  const passengerName = initialPassenger.passengerName.trim();
  const email = initialPassenger.email.trim();
  const passengerPhone = (initialPassenger.passengerPhone ?? "").trim();
  const passportNumber = (initialPassenger.passportNumber ?? "").trim();
  const nationality = (initialPassenger.nationality ?? "").trim();
  const seatsBooked = Math.min(
    Math.max(1, initialPassenger.seatsBooked ?? 1),
    Math.min(9, Math.max(1, maxSeats || initialPassenger.seatsBooked || 1)),
  );
  const [billingLine1, setBillingLine1] = useState("");
  const [billingLine2, setBillingLine2] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingState, setBillingState] = useState("NSW");
  const [billingPostal, setBillingPostal] = useState("");
  const [billingCountry, setBillingCountry] = useState("AU");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fareCents = partyFareCents;
  const fee = useMemo(() => calculateCardServiceFee(fareCents), [fareCents]);

  const passengerOk =
    passengerName.length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const billingOk =
    billingLine1.trim().length >= 3 &&
    billingCity.trim().length >= 2 &&
    billingPostal.trim().length >= 3 &&
    billingCountry.trim().length === 2;

  const names = splitPassengerName(passengerName);
  const billingContact = useMemo(
    () => ({
      givenName: names.givenName,
      familyName: names.familyName,
      email,
      phone: passengerPhone || undefined,
      addressLines: [billingLine1.trim(), billingLine2.trim()].filter(Boolean),
      city: billingCity.trim(),
      state: billingState.trim(),
      postalCode: billingPostal.trim(),
      countryCode: billingCountry.trim().toUpperCase() || "AU",
    }),
    [
      names.givenName,
      names.familyName,
      email,
      passengerPhone,
      billingLine1,
      billingLine2,
      billingCity,
      billingState,
      billingPostal,
      billingCountry,
    ],
  );

  const handleError = useCallback((message: string) => {
    setError(message || null);
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Card payment
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight">
          Pay securely with Stripe
        </h2>
        <p className="mt-2 text-sm text-muted">
          Your card details never touch our servers.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-surface/60 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Passenger details
            </p>
            <p className="mt-2 font-semibold text-foreground">{passengerName}</p>
            <p className="mt-1 break-all text-sm text-muted">{email}</p>
            {passengerPhone ? (
              <p className="mt-1 text-sm text-muted">{passengerPhone}</p>
            ) : null}
            <p className="mt-3 text-sm text-muted">
              {seatsBooked} seat{seatsBooked === 1 ? "" : "s"}
            </p>
          </div>
          <Link
            href={`/checkout/${quoteId}/passengers`}
            className="text-sm font-semibold text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            Edit details
          </Link>
        </div>
      </div>

      <div className="border border-line bg-white/80 p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Billing address
        </p>
        <p className="mt-1 text-sm text-muted">
          Used for card verification. Postcode is taken from here — you do not
          need to enter it again in the card form.
        </p>
        <div className="mt-5 grid gap-5">
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
              Street address
            </span>
            <input
              value={billingLine1}
              onChange={(e) => setBillingLine1(e.target.value)}
              className={fieldClass}
              placeholder="12 Example Street"
              autoComplete="billing address-line1"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
              Apartment / suite{" "}
              <span className="normal-case tracking-normal">(optional)</span>
            </span>
            <input
              value={billingLine2}
              onChange={(e) => setBillingLine2(e.target.value)}
              className={fieldClass}
              placeholder="Unit 4"
              autoComplete="billing address-line2"
            />
          </label>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                Suburb / city
              </span>
              <input
                value={billingCity}
                onChange={(e) => setBillingCity(e.target.value)}
                className={fieldClass}
                placeholder="Sydney"
                autoComplete="billing address-level2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                State
              </span>
              <select
                value={billingState}
                onChange={(e) => setBillingState(e.target.value)}
                className={fieldClass}
                autoComplete="billing address-level1"
              >
                {AU_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
                <option value="Other">Other / International</option>
              </select>
            </label>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                Postcode
              </span>
              <input
                value={billingPostal}
                onChange={(e) => setBillingPostal(e.target.value)}
                className={fieldClass}
                placeholder="2000"
                autoComplete="billing postal-code"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                Country
              </span>
              <select
                value={billingCountry}
                onChange={(e) => setBillingCountry(e.target.value)}
                className={fieldClass}
                autoComplete="billing country"
              >
                <option value="AU">Australia</option>
                <option value="BT">Bhutan</option>
                <option value="US">United States</option>
                <option value="GB">United Kingdom</option>
                <option value="NZ">New Zealand</option>
                <option value="SG">Singapore</option>
                <option value="IN">India</option>
                <option value="CA">Canada</option>
                <option value="JP">Japan</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="border border-line bg-surface/70 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Price breakdown
        </p>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Ticket fare</dt>
            <dd className="font-medium">{formatAud(fee.fareCents)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">
              Credit card fee{" "}
              <span className="text-foreground/70">({fee.rateLabel})</span>
            </dt>
            <dd className="font-medium">{formatAud(fee.serviceFeeCents)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">
              GST{" "}
              <span className="text-foreground/70">({fee.gstRateLabel})</span>
            </dt>
            <dd className="font-medium">{formatAud(fee.gstCents)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-line pt-3">
            <dt className="font-semibold text-foreground">Total due</dt>
            <dd className="font-[family-name:var(--font-syne)] text-2xl font-semibold">
              {formatAud(fee.totalCents)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">
          The credit card fee covers card processing for Visa, Mastercard, and
          digital wallets. GST ({fee.gstRateLabel}) is added on top of the fare
          and card fee — it is not included in those amounts.
        </p>
      </div>

      <div className="border border-line bg-white/80 p-5 sm:p-6">
        {stripe.clientSecret ? (
          <StripePaymentFields
            publishableKey={stripe.publishableKey}
            clientSecret={stripe.clientSecret}
            billingContact={billingContact}
            disabled={pending || !passengerOk || !billingOk}
            buttonLabel={
              pending ? "Processing…" : `Pay ${formatAud(fee.totalCents)}`
            }
            onError={handleError}
            onSuccess={async (paymentIntentId) => {
              if (!passengerOk) {
                setError("Enter a valid passenger name and email first");
                return;
              }
              if (!billingOk) {
                setError("Enter a complete billing address first");
                return;
              }
              startTransition(async () => {
                try {
                  const result = await payWithCardAction({
                    quoteId,
                    passengerName,
                    email,
                    passengerPhone,
                    passportNumber,
                    nationality,
                    seatsBooked,
                    paymentIntentId,
                  });
                  if (result?.error) setError(result.error);
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Payment failed unexpectedly",
                  );
                }
              });
            }}
          />
        ) : (
          <p className="text-sm text-red-700">
            {stripe.error ??
              "Card payments are temporarily unavailable. Please use bank transfer instead."}
          </p>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <p className="text-sm text-muted">
        Prefer invoice with no credit card fee?{" "}
        <Link
          href={`/checkout/${quoteId}/bank`}
          className="font-medium text-accent underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          Pay by bank transfer
        </Link>
      </p>
    </div>
  );
}
