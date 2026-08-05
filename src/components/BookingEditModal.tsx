"use client";

import { useEffect } from "react";
import { MoneyInput } from "@/components/MoneyInput";
import { SubmitButton } from "@/components/SubmitButton";
import { updateBookingAction } from "@/lib/actions/walkIn";
import { formatAud } from "@/lib/pricing";

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
};

const fieldClass =
  "w-full border-0 border-b border-line bg-transparent py-3 text-sm text-foreground outline-none transition focus:border-accent";

export function BookingEditModal({
  booking,
  onClose,
}: {
  booking: EditableBooking;
  onClose: () => void;
}) {
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

  const canEditSeats =
    booking.status === "pending_payment" || booking.status === "confirmed";

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
            <label className="space-y-1 text-sm">
              <span className="text-xs uppercase tracking-[0.12em] text-muted">
                Seats
              </span>
              <input
                name="seatsBooked"
                type="number"
                min={1}
                max={9}
                required
                defaultValue={booking.seatsBooked}
                disabled={!canEditSeats}
                className={fieldClass}
              />
              {!canEditSeats ? (
                <input type="hidden" name="seatsBooked" value={booking.seatsBooked} />
              ) : null}
            </label>
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
                Updates the booking total and invoice airfare so travel docs /
                invoices match. For other line items (taxes, baggage, GST), use
                the Invoices tab.
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
