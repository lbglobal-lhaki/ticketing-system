"use client";

import { useMemo, useState } from "react";
import { savePassengerDetailsAction } from "@/lib/actions/passengers";
import { FieldError, labeledControlClass } from "@/components/forms/FieldError";
import { useStickyAction } from "@/components/forms/useStickyAction";
import {
  ADULT_AGE_HINT,
  CHILD_AGE_HINT,
  INFANT_AGE_HINT,
  childFareCents,
  infantFareCents,
  partyFareCents,
  passengerTypeLabel,
  type PassengerType,
  type TravellerDraft,
} from "@/lib/booking/passengers";
import { formatAud } from "@/lib/pricing";
import { SubmitButton } from "@/components/SubmitButton";
import { DateTimePicker } from "@/components/ui/DateTimePicker";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-line bg-white px-3.5 py-3 text-sm text-foreground outline-none transition focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/35";

type DraftRow = TravellerDraft & { key: string };

type PassengerDetailsFormProps = {
  quoteId: string;
  maxSeats: number;
  adults: number;
  children: number;
  infants: number;
  unitAdultFareCents: number;
  initial?: {
    title?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    passportNumber?: string;
    nationality?: string;
    seatsBooked?: number;
  };
  initialTravellers?: TravellerDraft[];
  /** Outbound departure — child/infant age is calculated on this date. */
  ageOnIso?: string;
  error?: string | null;
};

let keySeq = 0;
function nextKey(prefix: string) {
  keySeq += 1;
  return `${prefix}-${keySeq}-${Math.random().toString(36).slice(2, 7)}`;
}

function emptyDraft(type: PassengerType): DraftRow {
  return {
    key: nextKey(type),
    passengerType: type,
    title: "",
    firstName: "",
    lastName: "",
    passportNumber: "",
    nationality: "",
    email: "",
    phone: "",
    dateOfBirth: "",
  };
}

function seedRows(
  type: PassengerType,
  count: number,
  from: TravellerDraft[] | undefined,
  fallbackPrimary?: PassengerDetailsFormProps["initial"],
): DraftRow[] {
  const typed = (from ?? []).filter((t) => t.passengerType === type);
  const rows: DraftRow[] = [];
  for (let i = 0; i < count; i += 1) {
    const src =
      typed[i] ??
      (type === "adult" && i === 0 && fallbackPrimary
        ? {
            passengerType: "adult" as const,
            title: fallbackPrimary.title || "",
            firstName: fallbackPrimary.firstName || "",
            lastName: fallbackPrimary.lastName || "",
            passportNumber: fallbackPrimary.passportNumber || "",
            nationality: fallbackPrimary.nationality || "",
            email: fallbackPrimary.email || "",
            phone: fallbackPrimary.phone || "",
          }
        : null);
    rows.push(
      src
        ? {
            key: nextKey(type),
            passengerType: type,
            title: src.title || "",
            firstName: src.firstName || "",
            lastName: src.lastName || "",
            passportNumber: src.passportNumber || "",
            nationality: src.nationality || "",
            email: src.email || "",
            phone: src.phone || "",
            dateOfBirth: src.dateOfBirth || "",
          }
        : emptyDraft(type),
    );
  }
  return rows;
}

function resizeRows(rows: DraftRow[], count: number, type: PassengerType) {
  const n = Math.max(0, count);
  if (n === rows.length) return rows;
  if (n < rows.length) return rows.slice(0, n);
  return [
    ...rows,
    ...Array.from({ length: n - rows.length }, () => emptyDraft(type)),
  ];
}

export function PassengerDetailsForm({
  quoteId,
  maxSeats,
  adults: initialAdults,
  children: initialChildren,
  infants: initialInfants,
  unitAdultFareCents,
  initial,
  initialTravellers,
  ageOnIso,
  error: errorProp,
}: PassengerDetailsFormProps) {
  const sticky = useStickyAction(savePassengerDetailsAction);
  const fieldErrors = sticky.fieldErrors;
  const error = sticky.formError ?? errorProp;
  const seatCap = Math.min(9, Math.max(1, maxSeats));
  const unit = Math.max(0, unitAdultFareCents);
  const childUnit = childFareCents(unit);
  const infantUnit = infantFareCents(unit);

  const [adultRows, setAdultRows] = useState<DraftRow[]>(() =>
    seedRows(
      "adult",
      Math.max(1, initialAdults),
      initialTravellers,
      initial,
    ),
  );
  const [childRows, setChildRows] = useState<DraftRow[]>(() =>
    seedRows("child", Math.max(0, initialChildren), initialTravellers),
  );
  const [infantRows, setInfantRows] = useState<DraftRow[]>(() =>
    seedRows("infant", Math.max(0, initialInfants), initialTravellers),
  );

  const adults = adultRows.length;
  const childrenN = childRows.length;
  const infantsN = infantRows.length;
  const seated = adults + childrenN;
  const canAddSeated = seated < seatCap;

  const totalCents = useMemo(
    () =>
      partyFareCents({
        adultUnitFareCents: unit,
        adults,
        children: childrenN,
        infants: infantsN,
      }),
    [unit, adults, childrenN, infantsN],
  );

  const allRows = useMemo(() => {
    const list: Array<{ row: DraftRow; index: number; isPrimary: boolean }> =
      [];
    let i = 0;
    for (const row of adultRows) {
      list.push({ row, index: i, isPrimary: i === 0 });
      i += 1;
    }
    for (const row of childRows) {
      list.push({ row, index: i, isPrimary: false });
      i += 1;
    }
    for (const row of infantRows) {
      list.push({ row, index: i, isPrimary: false });
      i += 1;
    }
    return list;
  }, [adultRows, childRows, infantRows]);

  function setAdultCount(n: number) {
    const next = Math.min(Math.max(1, n), seatCap - childrenN);
    setAdultRows((rows) => resizeRows(rows, next, "adult"));
  }
  function setChildCount(n: number) {
    const next = Math.min(Math.max(0, n), seatCap - adults);
    setChildRows((rows) => resizeRows(rows, next, "child"));
  }
  function setInfantCount(n: number) {
    setInfantRows((rows) => resizeRows(rows, Math.min(9, Math.max(0, n)), "infant"));
  }

  function updateRow(type: PassengerType, key: string, patch: Partial<TravellerDraft>) {
    const apply = (rows: DraftRow[]) =>
      rows.map((r) => (r.key === key ? { ...r, ...patch } : r));
    if (type === "adult") setAdultRows(apply);
    else if (type === "child") setChildRows(apply);
    else setInfantRows(apply);
  }

  function removeRow(type: PassengerType, key: string) {
    if (type === "adult") {
      if (adultRows.length <= 1) return;
      setAdultRows((rows) => rows.filter((r) => r.key !== key));
      return;
    }
    if (type === "child") {
      setChildRows((rows) => rows.filter((r) => r.key !== key));
      return;
    }
    setInfantRows((rows) => rows.filter((r) => r.key !== key));
  }

  return (
    <form onSubmit={sticky.onSubmit} className="space-y-5">
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="adults" value={String(adults)} />
      <input type="hidden" name="children" value={String(childrenN)} />
      <input type="hidden" name="infants" value={String(infantsN)} />
      <input type="hidden" name="seatsBooked" value={String(seated)} />

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {/* Commercial party builder */}
      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_10px_32px_rgba(15,23,42,0.06)]">
        <div className="theme-banner px-4 py-4 text-white sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">
            Travellers
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-syne)] text-xl font-bold tracking-tight">
            Who’s flying?
          </h2>
          <p className="mt-1 text-sm text-white/85">
            Add adults, children, and infants. Fares update instantly.
          </p>
        </div>

        <div className="grid gap-0 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <PartyStepper
            label="Adult"
            hint={ADULT_AGE_HINT}
            priceLabel={formatAud(unit)}
            value={adults}
            min={1}
            max={Math.max(1, seatCap - childrenN)}
            onChange={setAdultCount}
          />
          <PartyStepper
            label="Child"
            hint={CHILD_AGE_HINT}
            priceLabel={formatAud(childUnit)}
            value={childrenN}
            min={0}
            max={Math.max(0, seatCap - adults)}
            onChange={setChildCount}
            disabled={!canAddSeated && childrenN === 0}
          />
          <PartyStepper
            label="Infant"
            hint={INFANT_AGE_HINT}
            priceLabel={formatAud(infantUnit)}
            value={infantsN}
            min={0}
            max={9}
            onChange={setInfantCount}
          />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line bg-surface/50 px-4 py-4 sm:px-5">
          <div className="text-sm text-muted">
            <p>
              <span className="font-medium text-foreground">{seated}</span> seat
              {seated === 1 ? "" : "s"} held
              {infantsN > 0
                ? ` · ${infantsN} infant${infantsN === 1 ? "" : "s"} (no seat)`
                : ""}
            </p>
            <p className="mt-0.5 text-xs">
              Up to {seatCap} seats available on this fare lock.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Trip total
            </p>
            <p className="font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight text-accent-deep">
              {formatAud(totalCents)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3 sm:px-5">
          <AddChip
            label="Add adult"
            disabled={!canAddSeated}
            onClick={() => setAdultCount(adults + 1)}
          />
          <AddChip
            label="Add child"
            disabled={!canAddSeated}
            onClick={() => setChildCount(childrenN + 1)}
          />
          <AddChip
            label="Add infant"
            disabled={infantsN >= 9}
            onClick={() => setInfantCount(infantsN + 1)}
          />
        </div>
      </section>

      {allRows.map(({ row, index, isPrimary }) => (
        <TravellerCard
          key={row.key}
          index={index}
          row={row}
          isPrimary={isPrimary}
          fareLabel={
            row.passengerType === "child"
              ? formatAud(childUnit)
              : row.passengerType === "infant"
                ? formatAud(infantUnit)
                : formatAud(unit)
          }
          canRemove={
            row.passengerType === "adult"
              ? adults > 1
              : true
          }
          onChange={(patch) => updateRow(row.passengerType, row.key, patch)}
          onRemove={() => removeRow(row.passengerType, row.key)}
          ageOnIso={ageOnIso}
          fieldErrors={fieldErrors}
        />
      ))}

      <label className="flex items-start gap-3 text-sm text-muted">
        <input
          type="checkbox"
          name="privacyAccepted"
          required
          data-field-key="privacyAccepted"
          aria-invalid={fieldErrors.privacyAccepted ? true : undefined}
          className="mt-1 size-4 accent-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        />
        <span>
          I understand and accept that my personal data will be processed in
          accordance with our{" "}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-accent underline-offset-2 hover:text-accent-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            Privacy Policy
          </a>
          .
          <FieldError error={fieldErrors.privacyAccepted} />
        </span>
      </label>

      <div className="flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-muted">
          Total for {adults + childrenN + infantsN} traveller
          {adults + childrenN + infantsN === 1 ? "" : "s"}:{" "}
          <span className="font-semibold text-foreground">
            {formatAud(totalCents)}
          </span>
        </p>
        <SubmitButton
          pending={sticky.pending}
          pendingLabel="Saving…"
          className="btn-cta min-h-12 px-10 text-sm disabled:cursor-not-allowed disabled:opacity-70"
        >
          Continue to payment
        </SubmitButton>
      </div>
    </form>
  );
}

function PartyStepper({
  label,
  hint,
  priceLabel,
  value,
  min,
  max,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  priceLabel: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`px-4 py-4 sm:px-5 ${disabled ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-foreground">{label}</p>
          <p className="mt-0.5 text-xs text-muted">{hint}</p>
          <p className="mt-2 text-sm font-semibold text-accent-deep">
            {priceLabel}
          </p>
        </div>
        <div className="inline-flex items-center rounded-full border border-line bg-white">
          <button
            type="button"
            aria-label={`Fewer ${label.toLowerCase()}s`}
            disabled={value <= min}
            onClick={() => onChange(value - 1)}
            className="inline-flex size-9 items-center justify-center text-lg text-muted transition hover:text-foreground disabled:opacity-40"
          >
            −
          </button>
          <span className="min-w-8 text-center text-sm font-bold tabular-nums">
            {value}
          </span>
          <button
            type="button"
            aria-label={`More ${label.toLowerCase()}s`}
            disabled={value >= max}
            onClick={() => onChange(value + 1)}
            className="inline-flex size-9 items-center justify-center text-lg text-muted transition hover:text-foreground disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

function AddChip({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center rounded-full border border-accent/30 bg-accent/8 px-4 text-sm font-semibold text-accent-deep transition hover:border-accent hover:bg-accent/12 disabled:cursor-not-allowed disabled:opacity-40"
    >
      + {label}
    </button>
  );
}

function TravellerCard({
  index,
  row,
  isPrimary,
  fareLabel,
  canRemove,
  onChange,
  onRemove,
  ageOnIso,
  fieldErrors = {},
}: {
  index: number;
  row: DraftRow;
  isPrimary: boolean;
  fareLabel: string;
  canRemove: boolean;
  onChange: (patch: Partial<TravellerDraft>) => void;
  onRemove: () => void;
  ageOnIso?: string;
  fieldErrors?: Record<string, string>;
}) {
  const [open, setOpen] = useState(true);
  const [noSplitName, setNoSplitName] = useState(row.lastName === "—");
  const label = passengerTypeLabel(row.passengerType);
  const todayIso = new Date().toLocaleDateString("en-CA");
  const maxDob = [ageOnIso?.slice(0, 10), todayIso]
    .filter(Boolean)
    .sort()[0];
  const i = index;
  const err = (name: string) => fieldErrors[`${name}_${i}`];
  const hasCardError = Object.keys(fieldErrors).some((k) => k.endsWith(`_${i}`));
  const expanded = open || hasCardError;

  return (
    <section className="rounded-2xl border border-line bg-white shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
      <input type="hidden" name={`travellerType_${i}`} value={row.passengerType} />
      <div
        className={`theme-banner flex w-full items-center justify-between gap-3 px-4 py-3.5 text-white sm:px-5 ${
          expanded ? "rounded-t-2xl" : "rounded-2xl"
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm font-bold tracking-wide">
              PASSENGER {i + 1}
            </span>
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold">
              {label}
              {row.passengerType === "infant" ? " · no seat" : ""}
            </span>
            <span className="text-xs font-medium text-white/80">
              {fareLabel}
            </span>
          </span>
          <span
            className={`text-lg transition ${expanded ? "" : "rotate-180"}`}
            aria-hidden
          >
            ▴
          </span>
        </button>
        {canRemove && !isPrimary ? (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/25"
          >
            Remove
          </button>
        ) : null}
      </div>

      <div
        className={`space-y-6 px-4 py-5 sm:px-5 sm:py-6 ${expanded ? "" : "hidden"}`}
      >
        <div>
          <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold text-accent-deep">
            Personal Information
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            Name must match the passport
            {row.passengerType === "infant"
              ? ". Infants travel without a seat. Date of birth is required — under 1 year on the departure date."
              : row.passengerType === "child"
                ? ". Date of birth is required — must be 1–10 years old on the departure date."
                : "."}
          </p>

          <div className="mt-5 grid gap-4">
            <label className="block text-sm">
              <span className="font-medium text-foreground">Title</span>
              <select
                name={`title_${i}`}
                required
                value={row.title}
                data-field-key={`title_${i}`}
                aria-invalid={err("title") ? true : undefined}
                onChange={(e) => onChange({ title: e.target.value })}
                className={labeledControlClass(fieldClass, err("title"))}
              >
                <option value="" disabled>
                  Select
                </option>
                <option value="Mr">Mr</option>
                <option value="Mrs">Mrs</option>
                <option value="Ms">Ms</option>
                <option value="Miss">Miss</option>
                <option value="Mx">Mx</option>
                <option value="Dr">Dr</option>
                {row.passengerType !== "adult" ? (
                  <option value="Master">Master</option>
                ) : null}
              </select>
              <FieldError error={err("title")} />
            </label>

            {noSplitName ? (
              <label className="block text-sm">
                <span className="font-medium text-foreground">
                  Full name (As in Passport)
                </span>
                <input
                  name={`firstName_${i}`}
                  required
                  value={row.firstName}
                  data-field-key={`firstName_${i}`}
                  aria-invalid={err("firstName") ? true : undefined}
                  onChange={(e) => onChange({ firstName: e.target.value })}
                  className={labeledControlClass(fieldClass, err("firstName"))}
                />
                <input type="hidden" name={`lastName_${i}`} value="—" />
                <FieldError error={err("firstName")} />
              </label>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-foreground">
                    First and Middle Name (As in Passport)
                  </span>
                  <input
                    name={`firstName_${i}`}
                    required
                    value={row.firstName}
                    data-field-key={`firstName_${i}`}
                    aria-invalid={err("firstName") ? true : undefined}
                    onChange={(e) => onChange({ firstName: e.target.value })}
                    className={labeledControlClass(fieldClass, err("firstName"))}
                    autoComplete={isPrimary ? "given-name" : "off"}
                  />
                  <FieldError error={err("firstName")} />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-foreground">
                    Last Name (As in Passport)
                  </span>
                  <input
                    name={`lastName_${i}`}
                    required
                    value={row.lastName === "—" ? "" : row.lastName}
                    data-field-key={`lastName_${i}`}
                    aria-invalid={err("lastName") ? true : undefined}
                    onChange={(e) => onChange({ lastName: e.target.value })}
                    className={labeledControlClass(fieldClass, err("lastName"))}
                    autoComplete={isPrimary ? "family-name" : "off"}
                  />
                  <FieldError error={err("lastName")} />
                </label>
              </div>
            )}

            <label className="inline-flex items-start gap-2.5 text-sm text-muted">
              <input
                type="checkbox"
                checked={noSplitName}
                onChange={(e) => {
                  const on = e.target.checked;
                  setNoSplitName(on);
                  if (on) onChange({ lastName: "—" });
                  else if (row.lastName === "—") onChange({ lastName: "" });
                }}
                className="mt-1"
              />
              <span>
                I do not have a first name or a last name on my passport.
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              {(row.passengerType === "child" ||
                row.passengerType === "infant") && (
                <DateTimePicker
                  name={`dateOfBirth_${i}`}
                  label="Date of birth"
                  required
                  showTime={false}
                  value={row.dateOfBirth || ""}
                  max={maxDob}
                  error={err("dateOfBirth")}
                  onChange={(next) => onChange({ dateOfBirth: next })}
                  placeholder="Select date of birth"
                  wrapperClassName="sm:col-span-2"
                  helper={
                    err("dateOfBirth")
                      ? undefined
                      : row.passengerType === "infant"
                        ? "Must be under 1 year old on the departure date."
                        : "Must be 1–10 years old on the departure date."
                  }
                />
              )}
              <label className="block text-sm">
                <span className="font-medium text-foreground">
                  Passport number
                </span>
                <input
                  name={`passportNumber_${i}`}
                  value={row.passportNumber}
                  data-field-key={`passportNumber_${i}`}
                  aria-invalid={err("passportNumber") ? true : undefined}
                  onChange={(e) =>
                    onChange({ passportNumber: e.target.value })
                  }
                  className={labeledControlClass(fieldClass, err("passportNumber"))}
                />
                <FieldError error={err("passportNumber")} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-foreground">Nationality</span>
                <input
                  name={`nationality_${i}`}
                  value={row.nationality}
                  data-field-key={`nationality_${i}`}
                  aria-invalid={err("nationality") ? true : undefined}
                  onChange={(e) => onChange({ nationality: e.target.value })}
                  className={labeledControlClass(fieldClass, err("nationality"))}
                  placeholder="e.g. Australian"
                />
                <FieldError error={err("nationality")} />
              </label>
            </div>
          </div>
        </div>

        {isPrimary ? (
          <div>
            <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold text-accent-deep">
              Contact Information
            </h2>
            <p className="mt-1 text-sm text-muted">
              Booking confirmation is sent to this contact.
            </p>
            <div className="mt-4 grid gap-4">
              <label className="block text-sm">
                <span className="font-medium text-foreground">Mobile Number</span>
                <input
                  name={`phone_${i}`}
                  type="tel"
                  required
                  value={row.phone || ""}
                  data-field-key={`phone_${i}`}
                  aria-invalid={err("phone") ? true : undefined}
                  onChange={(e) => onChange({ phone: e.target.value })}
                  className={labeledControlClass(fieldClass, err("phone"))}
                  placeholder="+61 …"
                  autoComplete="tel"
                />
                <FieldError error={err("phone")} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-foreground">Email</span>
                <input
                  name={`email_${i}`}
                  type="email"
                  required
                  value={row.email || ""}
                  data-field-key={`email_${i}`}
                  aria-invalid={err("email") ? true : undefined}
                  onChange={(e) => onChange({ email: e.target.value })}
                  className={labeledControlClass(fieldClass, err("email"))}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
                <FieldError error={err("email")} />
              </label>
            </div>
          </div>
        ) : (
          <>
            <input type="hidden" name={`email_${i}`} value="" />
            <input type="hidden" name={`phone_${i}`} value="" />
          </>
        )}
      </div>
    </section>
  );
}
