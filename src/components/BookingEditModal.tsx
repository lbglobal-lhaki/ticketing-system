"use client";

import { useEffect, useState } from "react";
import { MoneyInput } from "@/components/MoneyInput";
import { SubmitButton } from "@/components/SubmitButton";
import { updateBookingAction } from "@/lib/actions/walkIn";
import { formatAud } from "@/lib/pricing";

export type EditablePassenger = {
  fullName: string;
  email: string;
  phone: string;
  passportNumber: string;
  nationality: string;
  ticketNumber: string;
};

export type EditableBooking = {
  id: string;
  bookingRef: string;
  ticketNumber: string;
  passengerName: string;
  email: string;
  passengerPhone: string;
  passportNumber: string;
  nationality: string;
  seatsBooked: number;
  extraBaggageKg: number;
  fareReleaseName: string;
  amountPaidCents: number;
  status: string;
  paymentMethod: string | null;
  flightLabel: string;
  /** Extra travellers only (primary is the booking contact fields). */
  passengers: EditablePassenger[];
};

const fieldClass =
  "w-full border-0 border-b border-line bg-transparent py-3 text-sm text-foreground outline-none transition focus:border-accent";

function emptyExtra(): EditablePassenger {
  return {
    fullName: "",
    email: "",
    phone: "",
    passportNumber: "",
    nationality: "",
    ticketNumber: "",
  };
}

function initialExtras(booking: EditableBooking): EditablePassenger[] {
  // Prefer stored BookingPassenger extras (skip primary at index 0).
  const storedExtras =
    booking.passengers.length > 0 ? booking.passengers.slice(1) : [];
  if (storedExtras.length > 0) return storedExtras;
  // Older bookings may only have seatsBooked with no named extras yet.
  const needed = Math.max(0, booking.seatsBooked - 1);
  return Array.from({ length: needed }, emptyExtra);
}

export function BookingEditModal({
  booking,
  onClose,
}: {
  booking: EditableBooking;
  onClose: () => void;
}) {
  const canEditSeats =
    booking.status === "pending_payment" || booking.status === "confirmed";

  const [extras, setExtras] = useState<EditablePassenger[]>(() =>
    initialExtras(booking),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  function updateExtra(
    index: number,
    patch: Partial<EditablePassenger>,
  ) {
    setExtras((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, ...patch };
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-edit-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(96svh,720px)] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p
              id="booking-edit-title"
              className="font-[family-name:var(--font-syne)] text-xl font-semibold tracking-tight"
            >
              Edit booking
            </p>
            <p className="mt-1 text-sm text-muted">
              {booking.bookingRef} · {booking.ticketNumber}
            </p>
            <p className="mt-0.5 text-xs text-muted">{booking.flightLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-10 items-center justify-center border border-line text-xl text-muted transition hover:border-accent hover:text-foreground"
          >
            ×
          </button>
        </header>

        <form
          key={booking.id}
          action={updateBookingAction}
          className="space-y-4 overflow-y-auto px-4 py-4 sm:px-6"
        >
          <input type="hidden" name="id" value={booking.id} />

          <div className="space-y-3 border border-line bg-white/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Primary passenger (contact)
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Passenger name
                </span>
                <input
                  name="passengerName"
                  required
                  defaultValue={booking.passengerName}
                  className={fieldClass}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Email
                </span>
                <input
                  name="email"
                  type="email"
                  required
                  defaultValue={booking.email}
                  className={fieldClass}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Phone
                </span>
                <input
                  name="passengerPhone"
                  defaultValue={booking.passengerPhone}
                  className={fieldClass}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Passport
                </span>
                <input
                  name="passportNumber"
                  defaultValue={booking.passportNumber}
                  className={fieldClass}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Nationality
                </span>
                <input
                  name="nationality"
                  defaultValue={booking.nationality}
                  className={fieldClass}
                />
              </label>
            </div>
          </div>

          <div className="space-y-3 border border-line bg-white/50 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Extra passengers
                </p>
                <p className="mt-1 text-sm text-muted">
                  Each gets their own ticket on the travel document and is
                  listed on the invoice. Total seats = 1 + extras (max 9).
                </p>
              </div>
              {canEditSeats ? (
                <label className="space-y-1 text-sm">
                  <span className="text-xs uppercase tracking-[0.12em] text-muted">
                    How many extras
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={8}
                    value={extras.length}
                    onChange={(e) => {
                      const n = Math.min(
                        8,
                        Math.max(0, Number(e.target.value) || 0),
                      );
                      setExtras((prev) => {
                        if (n === prev.length) return prev;
                        if (n < prev.length) return prev.slice(0, n);
                        return [
                          ...prev,
                          ...Array.from({ length: n - prev.length }, () => ({
                            fullName: "",
                            email: "",
                            phone: "",
                            passportNumber: "",
                            nationality: "",
                            ticketNumber: "",
                          })),
                        ];
                      });
                    }}
                    className={fieldClass}
                  />
                </label>
              ) : (
                <p className="text-xs text-amber-800">
                  Passenger count locked on {booking.status.replaceAll("_", " ")}{" "}
                  bookings
                </p>
              )}
            </div>

            {canEditSeats && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setExtras((prev) =>
                      prev.length >= 8
                        ? prev
                        : [
                            ...prev,
                            {
                              fullName: "",
                              email: "",
                              phone: "",
                              passportNumber: "",
                              nationality: "",
                              ticketNumber: "",
                            },
                          ],
                    )
                  }
                  className="border border-line bg-white px-3 py-2 text-sm font-medium text-accent transition hover:border-accent"
                >
                  Add extra passenger
                </button>
                {extras.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExtras((prev) => prev.slice(0, -1))}
                    className="border border-line bg-white px-3 py-2 text-sm font-medium text-muted transition hover:text-red-700"
                  >
                    Remove last
                  </button>
                )}
              </div>
            )}

            <p className="text-sm text-muted">
              Seats for this booking:{" "}
              <span className="font-medium text-foreground">
                {1 + extras.length}
              </span>
            </p>

            {extras.map((pax, i) => (
              <div
                key={`extra-edit-${i}-${pax.ticketNumber || "new"}`}
                className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2"
              >
                <p className="sm:col-span-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Extra passenger {i + 1}
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
                    name="extraPassengerName"
                    required
                    value={pax.fullName}
                    onChange={(e) =>
                      updateExtra(i, { fullName: e.target.value })
                    }
                    className={fieldClass}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs uppercase tracking-[0.12em] text-muted">
                    Email
                  </span>
                  <input
                    name="extraPassengerEmail"
                    type="email"
                    value={pax.email}
                    onChange={(e) => updateExtra(i, { email: e.target.value })}
                    className={fieldClass}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs uppercase tracking-[0.12em] text-muted">
                    Phone
                  </span>
                  <input
                    name="extraPassengerPhone"
                    value={pax.phone}
                    onChange={(e) => updateExtra(i, { phone: e.target.value })}
                    className={fieldClass}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs uppercase tracking-[0.12em] text-muted">
                    Passport
                  </span>
                  <input
                    name="extraPassengerPassport"
                    value={pax.passportNumber}
                    onChange={(e) =>
                      updateExtra(i, { passportNumber: e.target.value })
                    }
                    className={fieldClass}
                  />
                </label>
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="text-xs uppercase tracking-[0.12em] text-muted">
                    Nationality
                  </span>
                  <input
                    name="extraPassengerNationality"
                    value={pax.nationality}
                    onChange={(e) =>
                      updateExtra(i, { nationality: e.target.value })
                    }
                    className={fieldClass}
                  />
                </label>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-xs uppercase tracking-[0.12em] text-muted">
                Extra baggage (kg)
              </span>
              <input
                name="extraBaggageKg"
                type="number"
                min={0}
                max={500}
                defaultValue={booking.extraBaggageKg}
                className={fieldClass}
              />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-xs uppercase tracking-[0.12em] text-muted">
                Fare / product label
              </span>
              <input
                name="fareReleaseName"
                defaultValue={booking.fareReleaseName}
                className={fieldClass}
              />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-xs uppercase tracking-[0.12em] text-muted">
                Amount (AUD) · currently {formatAud(booking.amountPaidCents)}
              </span>
              <MoneyInput
                name="amountAud"
                required
                defaultValue={(booking.amountPaidCents / 100).toFixed(2)}
                className={fieldClass}
              />
              <span className="block text-xs text-muted">
                Update the total to cover extra seats. Invoice / travel docs
                list every passenger after save.
              </span>
            </label>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <SubmitButton
              pendingLabel="Saving…"
              className="bg-accent-deep px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save booking
            </SubmitButton>
            <button
              type="button"
              onClick={onClose}
              className="border border-line px-4 py-2.5 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
