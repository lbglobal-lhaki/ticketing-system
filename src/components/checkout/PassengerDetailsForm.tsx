"use client";

import { useState } from "react";
import { savePassengerDetailsAction } from "@/lib/actions/passengers";
import {
  CHILD_FARE_RATE,
  INFANT_FARE_RATE,
  childFareCents,
  infantFareCents,
  passengerTypeLabel,
  type PassengerType,
  type TravellerDraft,
} from "@/lib/booking/passengers";
import { formatAud } from "@/lib/pricing";
import { SubmitButton } from "@/components/SubmitButton";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-line bg-white px-3.5 py-3 text-sm text-foreground outline-none transition focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/35";

type Slot = {
  index: number;
  type: PassengerType;
  initial?: TravellerDraft;
};

type PassengerDetailsFormProps = {
  quoteId: string;
  maxSeats: number;
  adults: number;
  children: number;
  infants: number;
  unitAdultFareCents: number;
  /** Legacy quotes without party mix still allow seat count. */
  legacySeatPicker?: boolean;
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
  error?: string | null;
};

function buildSlots(
  adults: number,
  children: number,
  infants: number,
  initialTravellers?: TravellerDraft[],
  legacyInitial?: PassengerDetailsFormProps["initial"],
): Slot[] {
  const slots: Slot[] = [];
  let i = 0;
  for (let a = 0; a < adults; a += 1, i += 1) {
    slots.push({
      index: i,
      type: "adult",
      initial: initialTravellers?.[i] ?? (i === 0 && legacyInitial
        ? {
            passengerType: "adult",
            title: legacyInitial.title || "",
            firstName: legacyInitial.firstName || "",
            lastName: legacyInitial.lastName || "",
            passportNumber: legacyInitial.passportNumber || "",
            nationality: legacyInitial.nationality || "",
            email: legacyInitial.email || "",
            phone: legacyInitial.phone || "",
          }
        : undefined),
    });
  }
  for (let c = 0; c < children; c += 1, i += 1) {
    slots.push({
      index: i,
      type: "child",
      initial: initialTravellers?.[i],
    });
  }
  for (let inf = 0; inf < infants; inf += 1, i += 1) {
    slots.push({
      index: i,
      type: "infant",
      initial: initialTravellers?.[i],
    });
  }
  return slots;
}

export function PassengerDetailsForm({
  quoteId,
  maxSeats,
  adults,
  children,
  infants,
  unitAdultFareCents,
  legacySeatPicker = false,
  initial,
  initialTravellers,
  error,
}: PassengerDetailsFormProps) {
  const slots = buildSlots(adults, children, infants, initialTravellers, initial);
  const seatMax = Math.min(9, Math.max(1, maxSeats));
  const childUnit = childFareCents(unitAdultFareCents);
  const infantUnit = infantFareCents(unitAdultFareCents);

  return (
    <form action={savePassengerDetailsAction} className="space-y-5">
      <input type="hidden" name="quoteId" value={quoteId} />

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {!legacySeatPicker && unitAdultFareCents > 0 ? (
        <div className="rounded-2xl border border-line bg-white px-4 py-3 text-sm text-muted sm:px-5">
          <p className="font-medium text-foreground">Party fare</p>
          <p className="mt-1">
            Adult {formatAud(unitAdultFareCents)} · Child{" "}
            {formatAud(childUnit)} ({Math.round(CHILD_FARE_RATE * 100)}%) ·
            Infant {formatAud(infantUnit)} (
            {Math.round(INFANT_FARE_RATE * 100)}%, no seat)
          </p>
        </div>
      ) : null}

      {slots.map((slot) => (
        <TravellerCard key={slot.index} slot={slot} isPrimary={slot.index === 0} />
      ))}

      {legacySeatPicker ? (
        <section className="rounded-2xl border border-line bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.06)] sm:p-5">
          <label className="block text-sm sm:max-w-xs">
            <span className="font-medium text-foreground">Number of seats</span>
            <select
              name="seatsBooked"
              defaultValue={String(
                Math.min(seatMax, initial?.seatsBooked || 1),
              )}
              className={fieldClass}
            >
              {Array.from({ length: seatMax }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : (
        <input
          type="hidden"
          name="seatsBooked"
          value={String(adults + children)}
        />
      )}

      <label className="flex items-start gap-3 text-sm text-muted">
        <input
          type="checkbox"
          name="privacyAccepted"
          required
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
        </span>
      </label>

      <div className="flex justify-end">
        <SubmitButton
          pendingLabel="Saving…"
          className="btn-cta min-h-12 px-10 text-sm disabled:cursor-not-allowed disabled:opacity-70"
        >
          Continue
        </SubmitButton>
      </div>
    </form>
  );
}

function TravellerCard({
  slot,
  isPrimary,
}: {
  slot: Slot;
  isPrimary: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [noSplitName, setNoSplitName] = useState(
    slot.initial?.lastName === "—",
  );
  const label = passengerTypeLabel(slot.type);
  const i = slot.index;
  const init = slot.initial;

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
      <input type="hidden" name={`travellerType_${i}`} value={slot.type} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="theme-banner flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-white sm:px-5"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold tracking-wide">
            PASSENGER {i + 1}
          </span>
          <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold">
            {label}
            {slot.type === "infant" ? " · no seat" : ""}
          </span>
        </span>
        <span className={`text-lg transition ${open ? "" : "rotate-180"}`} aria-hidden>
          ▴
        </span>
      </button>

      <div
        className={`space-y-6 px-4 py-5 sm:px-5 sm:py-6 ${open ? "" : "hidden"}`}
      >
          <div>
            <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold text-accent-deep">
              Personal Information
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              Name must match the passport
              {slot.type === "infant"
                ? ". Infants travel without a seat."
                : "."}
            </p>

            <div className="mt-5 grid gap-4">
              <label className="block text-sm">
                <span className="font-medium text-foreground">Title</span>
                <select
                  name={`title_${i}`}
                  required
                  defaultValue={init?.title || ""}
                  className={fieldClass}
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
                  {slot.type !== "adult" ? (
                    <option value="Master">Master</option>
                  ) : null}
                </select>
              </label>

              {noSplitName ? (
                <label className="block text-sm">
                  <span className="font-medium text-foreground">
                    Full name (As in Passport)
                  </span>
                  <input
                    name={`firstName_${i}`}
                    required
                    defaultValue={
                      [init?.firstName, init?.lastName]
                        .filter((p) => p && p !== "—")
                        .join(" ") || init?.firstName
                    }
                    className={fieldClass}
                  />
                  <input type="hidden" name={`lastName_${i}`} value="—" />
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
                      defaultValue={init?.firstName}
                      className={fieldClass}
                      autoComplete={isPrimary ? "given-name" : "off"}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-foreground">
                      Last Name (As in Passport)
                    </span>
                    <input
                      name={`lastName_${i}`}
                      required
                      defaultValue={init?.lastName === "—" ? "" : init?.lastName}
                      className={fieldClass}
                      autoComplete={isPrimary ? "family-name" : "off"}
                    />
                  </label>
                </div>
              )}

              <label className="inline-flex items-start gap-2.5 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={noSplitName}
                  onChange={(e) => setNoSplitName(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  I do not have a first name or a last name on my passport.
                </span>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-foreground">
                    Passport number
                  </span>
                  <input
                    name={`passportNumber_${i}`}
                    defaultValue={init?.passportNumber}
                    className={fieldClass}
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-foreground">Nationality</span>
                  <input
                    name={`nationality_${i}`}
                    defaultValue={init?.nationality}
                    className={fieldClass}
                    placeholder="e.g. Australian"
                  />
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
                  <span className="font-medium text-foreground">
                    Mobile Number
                  </span>
                  <input
                    name={`phone_${i}`}
                    type="tel"
                    required
                    defaultValue={init?.phone}
                    className={fieldClass}
                    placeholder="+61 …"
                    autoComplete="tel"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-foreground">Email</span>
                  <input
                    name={`email_${i}`}
                    type="email"
                    required
                    defaultValue={init?.email}
                    className={fieldClass}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
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
