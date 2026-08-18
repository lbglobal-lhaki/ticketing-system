"use client";

import { MoneyInput } from "@/components/MoneyInput";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import {
  CHILD_FARE_RATE,
  INFANT_FARE_RATE,
  passengerTypeLabel,
  type PassengerType,
} from "@/lib/booking/passengers";
import { formatAud } from "@/lib/pricing";

/**
 * Companions carry no contact details — email/phone are collected once on the
 * primary passenger.
 */
export type CompanionDraft = {
  fullName: string;
  passportNumber: string;
  nationality: string;
  priceAud: string;
  ticketNumber?: string;
  /** YYYY-MM-DD. Required for child/infant. */
  dateOfBirth?: string;
};

const fieldClass =
  "w-full min-w-0 border-0 border-b border-line bg-transparent py-2 text-sm text-foreground outline-none transition focus:border-accent";

export function emptyCompanion(priceAud = "0.00"): CompanionDraft {
  return {
    fullName: "",
    passportNumber: "",
    nationality: "",
    priceAud,
    dateOfBirth: "",
  };
}

type Props = {
  type: PassengerType;
  /** Form field prefix: extra | child | infant */
  prefix: "extra" | "child" | "infant";
  items: CompanionDraft[];
  onChange: (next: CompanionDraft[]) => void;
  canChangeCount: boolean;
  max?: number;
  description: string;
  /**
   * "edit" — admin types a price (legacy / custom bookings).
   * "auto" — child 75% / infant 10% of the adult fare; shown read-only.
   */
  priceMode?: "edit" | "auto";
  /** AUD string used when priceMode is "auto". */
  autoPriceAud?: string;
};

export function PassengerGroupFields({
  type,
  prefix,
  items,
  onChange,
  canChangeCount,
  max = 8,
  description,
  priceMode = "edit",
  autoPriceAud,
}: Props) {
  const label = passengerTypeLabel(type);
  // "Child" does not pluralise by adding an s — the group heading read "CHILDS".
  const pluralLabel = type === "child" ? "Children" : `${label}s`;
  const needsPrice = type === "child" || type === "infant";
  const needsDob = type === "child" || type === "infant";
  const namePrefix = `${prefix}Passenger`;

  function update(index: number, patch: Partial<CompanionDraft>) {
    const next = [...items];
    next[index] = { ...next[index]!, ...patch };
    onChange(next);
  }

  function setCount(n: number) {
    const count = Math.min(max, Math.max(0, n));
    if (count === items.length) return;
    if (count < items.length) {
      onChange(items.slice(0, count));
      return;
    }
    onChange([
      ...items,
      ...Array.from({ length: count - items.length }, () => emptyCompanion()),
    ]);
  }

  return (
    <div className="space-y-3 border border-line bg-white/50 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            {pluralLabel}
          </p>
          <p className="mt-1 text-sm text-muted">{description}</p>
          <p className="mt-1 text-sm text-muted">
            Contact details (email and phone) come from the primary passenger.
          </p>
        </div>
        {canChangeCount ? (
          <label className="space-y-1 text-sm">
            <span className="text-xs uppercase tracking-[0.12em] text-muted">
              How many
            </span>
            <input
              type="number"
              min={0}
              max={max}
              value={items.length}
              onChange={(e) => setCount(Number(e.target.value) || 0)}
              className={fieldClass}
            />
          </label>
        ) : null}
      </div>

      {canChangeCount && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCount(items.length + 1)}
            disabled={items.length >= max}
            className="border border-line bg-white px-3 py-2 text-sm font-medium text-accent transition hover:border-accent disabled:opacity-50"
          >
            Add {label.toLowerCase()}
          </button>
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => setCount(items.length - 1)}
              className="border border-line bg-white px-3 py-2 text-sm font-medium text-muted transition hover:text-red-700"
            >
              Remove last
            </button>
          )}
        </div>
      )}

      {items.map((pax, i) => (
        <div
          key={`${prefix}-${i}-${pax.ticketNumber || "new"}`}
          className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2"
        >
          <p className="sm:col-span-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            {label} {i + 1}
            {pax.ticketNumber ? (
              <span className="ml-2 font-normal normal-case tracking-normal text-muted">
                · ticket {pax.ticketNumber}
              </span>
            ) : null}
          </p>
          <label className="space-y-1 text-sm">
            <span className="text-xs uppercase tracking-[0.12em] text-muted">
              Full name
            </span>
            <input
              name={`${namePrefix}Name`}
              required
              value={pax.fullName}
              onChange={(e) => update(i, { fullName: e.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs uppercase tracking-[0.12em] text-muted">
              Passport
            </span>
            <input
              name={`${namePrefix}Passport`}
              value={pax.passportNumber}
              onChange={(e) => update(i, { passportNumber: e.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs uppercase tracking-[0.12em] text-muted">
              Nationality
            </span>
            <input
              name={`${namePrefix}Nationality`}
              value={pax.nationality}
              onChange={(e) => update(i, { nationality: e.target.value })}
              className={fieldClass}
            />
          </label>
          {needsDob ? (
            <DateTimePicker
              name={`${namePrefix}DateOfBirth`}
              label="Date of birth"
              required
              showTime={false}
              value={pax.dateOfBirth || ""}
              max={new Date().toLocaleDateString("en-CA")}
              onChange={(next) => update(i, { dateOfBirth: next })}
              placeholder="Select date of birth"
              helper={
                type === "infant"
                  ? "Under 1 year on the departure date."
                  : "1–10 years old on the departure date."
              }
            />
          ) : null}
          {needsPrice && priceMode === "auto" ? (
            <div className="space-y-1 text-sm">
              <span className="text-xs uppercase tracking-[0.12em] text-muted">
                {label} price (AUD)
              </span>
              <input
                type="hidden"
                name={`${namePrefix}PriceAud`}
                value={autoPriceAud || "0.00"}
              />
              <p className="py-2 font-medium text-foreground">
                {autoPriceAud && Number(autoPriceAud) > 0
                  ? formatAud(Math.round(Number(autoPriceAud) * 100))
                  : "—"}
              </p>
              <span className="block text-xs text-muted">
                {type === "infant"
                  ? `${Math.round(INFANT_FARE_RATE * 100)}% of the adult fare · automatic`
                  : `${Math.round(CHILD_FARE_RATE * 100)}% of the adult fare · automatic`}
              </span>
            </div>
          ) : needsPrice ? (
            <label className="space-y-1 text-sm">
              <span className="text-xs uppercase tracking-[0.12em] text-muted">
                {label} price (AUD)
              </span>
              <MoneyInput
                name={`${namePrefix}PriceAud`}
                required
                value={pax.priceAud}
                onChange={(e) => update(i, { priceAud: e.target.value })}
                className={fieldClass}
              />
            </label>
          ) : null}
        </div>
      ))}
    </div>
  );
}
