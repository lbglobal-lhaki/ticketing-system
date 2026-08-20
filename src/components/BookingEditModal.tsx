"use client";

import { useEffect, useMemo, useState } from "react";
import { MoneyInput } from "@/components/MoneyInput";
import {
  PassengerGroupFields,
  type CompanionDraft,
} from "@/components/PassengerGroupFields";
import { SubmitButton } from "@/components/SubmitButton";
import { updateBookingAction } from "@/lib/actions/walkIn";
import { FieldError, labeledControlClass } from "@/components/forms/FieldError";
import { useStickyAction } from "@/components/forms/useStickyAction";
import { toDateTimeLocalValue } from "@/lib/datetime";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { formatAud } from "@/lib/pricing";
import { EXTRA_BAG_AUD, extraBaggageCentsForBags } from "@/lib/pricing/baggage";
import { childFareCents, infantFareCents, formatDateOfBirth } from "@/lib/booking/passengers";

export type EditablePassenger = {
  fullName: string;
  email: string;
  phone: string;
  passportNumber: string;
  nationality: string;
  ticketNumber: string;
  passengerType: "adult" | "child" | "infant";
  dateOfBirth: string | null;
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
    dateOfBirth: formatDateOfBirth(p.dateOfBirth),
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
  const [extraBags, setExtraBags] = useState(booking.extraBaggageKg);
  const sticky = useStickyAction(updateBookingAction);

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
  const adultUnitCents =
    booking.passengers.find(
      (p) => p.passengerType === "adult" && p.priceCents > 0,
    )?.priceCents ?? 0;
  const autoCompanionFares = adultUnitCents > 0;

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
          onSubmit={sticky.onSubmit}
          data-skip-busy
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
                  data-field-key="passengerName"
                  aria-invalid={sticky.fieldErrors.passengerName ? true : undefined}
                  className={labeledControlClass(
                    fieldClass,
                    sticky.fieldErrors.passengerName,
                  )}
                />
                <FieldError error={sticky.fieldErrors.passengerName} />
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
                  data-field-key="email"
                  aria-invalid={sticky.fieldErrors.email ? true : undefined}
                  className={labeledControlClass(
                    fieldClass,
                    sticky.fieldErrors.email,
                  )}
                />
                <FieldError error={sticky.fieldErrors.email} />
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
            fieldErrors={sticky.fieldErrors}
            description="Extra adults each get a seat."
          />
          <PassengerGroupFields
            type="child"
            prefix="child"
            items={children}
            onChange={setChildren}
            canChangeCount={canEditSeats}
            priceMode={autoCompanionFares ? "auto" : "edit"}
            autoPriceAud={(childFareCents(adultUnitCents) / 100).toFixed(2)}
            fieldErrors={sticky.fieldErrors}
            description="Children get a seat at 75% of the adult fare. Date of birth is required — 1–10 years old on the departure date."
          />
          <PassengerGroupFields
            type="infant"
            prefix="infant"
            items={infants}
            onChange={setInfants}
            canChangeCount={canEditSeats}
            priceMode={autoCompanionFares ? "auto" : "edit"}
            autoPriceAud={(infantFareCents(adultUnitCents) / 100).toFixed(2)}
            fieldErrors={sticky.fieldErrors}
            description="Infants get a ticket at 10% of the adult fare but no seat. Date of birth is required — under 1 year on the departure date."
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
                Extra bags
              </span>
              <input
                name="extraBaggageKg"
                type="number"
                min={0}
                max={20}
                value={extraBags}
                onChange={(e) =>
                  setExtraBags(
                    Math.min(20, Math.max(0, Number(e.target.value) || 0)),
                  )
                }
                className={fieldClass}
              />
              <span className="block text-xs text-muted">
                ${EXTRA_BAG_AUD.toFixed(2)} each
                {extraBags > 0
                  ? ` · ${formatAud(extraBaggageCentsForBags(extraBags))}`
                  : ""}
              </span>
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
              <DateTimePicker
                name="holdExpiresAt"
                label="Seat hold expires"
                required
                wrapperClassName="sm:col-span-2"
                defaultValue={
                  booking.holdExpiresAt
                    ? toDateTimeLocalValue(new Date(booking.holdExpiresAt))
                    : toDateTimeLocalValue(
                        new Date(Date.now() + 48 * 60 * 60 * 1000),
                      )
                }
                helper="Internal seat hold only — not written onto the invoice."
              />
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
                Extra bags are ${EXTRA_BAG_AUD.toFixed(2)} each. Changing the bag
                count updates the invoice baggage line and this total by that
                amount. Child (75%) and infant (10%) fares are applied from the
                adult fare automatically.
              </span>
            </label>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {sticky.formError ? (
              <p className="w-full text-sm font-medium text-accent-red" role="alert">
                {sticky.formError}
              </p>
            ) : null}
            <SubmitButton
              pending={sticky.pending}
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
