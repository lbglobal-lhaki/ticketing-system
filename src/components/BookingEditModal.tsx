"use client";

import { useEffect, useMemo, useState } from "react";
import { MoneyInput } from "@/components/MoneyInput";
import {
  PassengerGroupFields,
  type CompanionDraft,
} from "@/components/PassengerGroupFields";
import { SubmitButton } from "@/components/SubmitButton";
import { updateBookingAction } from "@/lib/actions/walkIn";
import { toDateTimeLocalValue } from "@/lib/datetime";
import { formatAud } from "@/lib/pricing";

export type EditablePassenger = {
  fullName: string;
  email: string;
  phone: string;
  passportNumber: string;
  nationality: string;
  ticketNumber: string;
  passengerType: "adult" | "child" | "infant";
  priceCents: number;
  allocatesSeat: boolean;
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
  holdExpiresAt: string | null;
  flightLabel: string;
  passengers: EditablePassenger[];
};

const fieldClass =
  "w-full border-0 border-b border-line bg-transparent py-3 text-sm text-foreground outline-none transition focus:border-accent";

function toDraft(p: EditablePassenger): CompanionDraft {
  return {
    fullName: p.fullName,
    passportNumber: p.passportNumber,
    nationality: p.nationality,
    priceAud: ((p.priceCents || 0) / 100).toFixed(2),
    ticketNumber: p.ticketNumber,
  };
}

function splitCompanions(passengers: EditablePassenger[]) {
  const rest = passengers.length > 0 ? passengers.slice(1) : [];
  return {
    adults: rest.filter((p) => p.passengerType === "adult").map(toDraft),
    children: rest.filter((p) => p.passengerType === "child").map(toDraft),
    infants: rest.filter((p) => p.passengerType === "infant").map(toDraft),
  };
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

  const initial = useMemo(
    () => splitCompanions(booking.passengers),
    [booking.passengers],
  );
  const [adults, setAdults] = useState<CompanionDraft[]>(initial.adults);
  const [children, setChildren] = useState<CompanionDraft[]>(initial.children);
  const [infants, setInfants] = useState<CompanionDraft[]>(initial.infants);

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

  const seated = 1 + adults.length + children.length;

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
          <input
            type="hidden"
            name="tzOffsetMinutes"
            value={new Date().getTimezoneOffset()}
          />

          <div className="space-y-3 border border-line bg-white/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Primary passenger (adult contact)
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

          {!canEditSeats ? (
            <p className="text-xs text-amber-800">
              Passenger count locked on {booking.status.replaceAll("_", " ")}{" "}
              bookings — details can still be edited.
            </p>
          ) : null}

          <PassengerGroupFields
            type="adult"
            prefix="extra"
            items={adults}
            onChange={setAdults}
            canChangeCount={canEditSeats}
            description="Extra adults each get a seat."
          />
          <PassengerGroupFields
            type="child"
            prefix="child"
            items={children}
            onChange={setChildren}
            canChangeCount={canEditSeats}
            description="Children get a seat and their own price."
          />
          <PassengerGroupFields
            type="infant"
            prefix="infant"
            items={infants}
            onChange={setInfants}
            canChangeCount={canEditSeats}
            description="Infants get a ticket and price but no seat."
          />

          <p className="text-sm text-muted">
            Seats (adults + children):{" "}
            <span className="font-medium text-foreground">{seated}</span>
            {infants.length > 0 ? (
              <>
                {" "}
                · Infants (no seat):{" "}
                <span className="font-medium text-foreground">
                  {infants.length}
                </span>
              </>
            ) : null}
          </p>

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
            {booking.status === "pending_payment" &&
            booking.paymentMethod === "bank_transfer" ? (
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Seat hold expires
                </span>
                <input
                  name="holdExpiresAt"
                  type="datetime-local"
                  required
                  defaultValue={
                    booking.holdExpiresAt
                      ? toDateTimeLocalValue(new Date(booking.holdExpiresAt))
                      : toDateTimeLocalValue(
                          new Date(Date.now() + 48 * 60 * 60 * 1000),
                        )
                  }
                  className={fieldClass}
                />
                <span className="block text-xs text-muted">
                  Internal seat hold only — not written onto the invoice.
                </span>
              </label>
            ) : null}
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
                Update the total to include child/infant prices. Travel docs and
                invoices list every traveller after save.
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
