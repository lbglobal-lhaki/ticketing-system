"use client";

import { useState } from "react";
import { savePassengerDetailsAction } from "@/lib/actions/passengers";
import { SubmitButton } from "@/components/SubmitButton";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-line bg-white px-3.5 py-3 text-sm text-foreground outline-none transition focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/35";

type PassengerDetailsFormProps = {
  quoteId: string;
  maxSeats: number;
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
  error?: string | null;
};

export function PassengerDetailsForm({
  quoteId,
  maxSeats,
  initial,
  error,
}: PassengerDetailsFormProps) {
  const [open, setOpen] = useState(true);
  const [noSplitName, setNoSplitName] = useState(false);
  const seatMax = Math.min(9, Math.max(1, maxSeats));

  return (
    <form action={savePassengerDetailsAction} className="space-y-5">
      <input type="hidden" name="quoteId" value={quoteId} />

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {/* Passenger card */}
      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_8px_28px_rgba(15, 23, 42,0.06)]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="theme-banner flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-white sm:px-5"
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold tracking-wide">PASSENGER 1</span>
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold">
              Adult
            </span>
          </span>
          <span className={`text-lg transition ${open ? "" : "rotate-180"}`} aria-hidden>
            ▴
          </span>
        </button>

        {open ? (
          <div className="space-y-8 px-4 py-5 sm:px-5 sm:py-6">
            <div>
              <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold text-accent-deep">
                Personal Information
              </h2>
              <p className="mt-1.5 text-sm text-muted">
                Passenger name must be filled as shown on passport.
              </p>

              <div className="mt-5 grid gap-4">
                <label className="block text-sm">
                  <span className="font-medium text-foreground">Title</span>
                  <select
                    name="title"
                    required
                    defaultValue={initial?.title || ""}
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
                  </select>
                </label>

                {noSplitName ? (
                  <label className="block text-sm">
                    <span className="font-medium text-foreground">
                      Full name (As in Passport)
                    </span>
                    <input
                      name="firstName"
                      required
                      defaultValue={
                        [initial?.firstName, initial?.lastName]
                          .filter(Boolean)
                          .join(" ") || initial?.firstName
                      }
                      className={fieldClass}
                    />
                    <input type="hidden" name="lastName" value="—" />
                  </label>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="font-medium text-foreground">
                        First and Middle Name (As in Passport)
                      </span>
                      <input
                        name="firstName"
                        required
                        defaultValue={initial?.firstName}
                        className={fieldClass}
                        autoComplete="given-name"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="font-medium text-foreground">
                        Last Name (As in Passport)
                      </span>
                      <input
                        name="lastName"
                        required
                        defaultValue={initial?.lastName}
                        className={fieldClass}
                        autoComplete="family-name"
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
                      name="passportNumber"
                      defaultValue={initial?.passportNumber}
                      className={fieldClass}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-foreground">
                      Nationality
                    </span>
                    <input
                      name="nationality"
                      defaultValue={initial?.nationality}
                      className={fieldClass}
                      placeholder="e.g. Australian"
                    />
                  </label>
                </div>

                <label className="block text-sm sm:max-w-xs">
                  <span className="font-medium text-foreground">
                    Number of seats
                  </span>
                  <select
                    name="seatsBooked"
                    defaultValue={String(
                      Math.min(seatMax, initial?.seatsBooked || 1),
                    )}
                    className={fieldClass}
                  >
                    {Array.from({ length: seatMax }, (_, i) => i + 1).map(
                      (n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>
            </div>

          </div>
        ) : null}
      </section>

      {/* Contact */}
      <section className="rounded-2xl border border-line bg-white p-4 shadow-[0_8px_28px_rgba(15, 23, 42,0.06)] sm:p-5">
        <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold text-accent-deep">
          Contact Information
        </h2>
        <div className="mt-4 grid gap-4">
          <label className="block text-sm">
            <span className="font-medium text-foreground">Mobile Number</span>
            <input
              name="phone"
              type="tel"
              required
              defaultValue={initial?.phone}
              className={fieldClass}
              placeholder="+61 …"
              autoComplete="tel"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">Email</span>
            <input
              name="email"
              type="email"
              required
              defaultValue={initial?.email}
              className={fieldClass}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>
        </div>
      </section>

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
