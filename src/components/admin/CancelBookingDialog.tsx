"use client";

import { useId, useState, type RefObject } from "react";
import { cancelBookingAction } from "@/lib/actions/cancelBooking";
import {
  CANCELLATION_NOTE_MAX,
  CANCELLATION_REASONS,
  seatReturnStatusOnCancel,
} from "@/lib/booking/cancellationPolicy";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Toggle";
import { Button, buttonClasses } from "@/components/ui/Button";
import { SubmitButton } from "@/components/SubmitButton";

export type CancelBookingTarget = {
  id: string;
  bookingRef: string;
  passengerName: string;
  email: string;
  status: string;
  seatsBooked: number;
  route: string;
  invoiceStatus: string | null;
};

/**
 * Confirmation dialog for cancelling a booking.
 *
 * Spells out the consequences before the admin commits (seats held for
 * review, invoice outcome, customer email), requires a reason for the audit trail,
 * and defaults to notifying the customer. Keyboard: focus is trapped, Escape
 * or "Keep booking" closes without changes, and focus returns to the row's
 * actions button.
 */
export function CancelBookingDialog({
  booking,
  onClose,
  returnFocusRef,
}: {
  booking: CancelBookingTarget;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(Boolean(booking.email));
  const consequencesId = useId();

  const holdsSeats = seatReturnStatusOnCancel(booking.status) === "pending";
  const paid = booking.invoiceStatus === "paid";
  const noteRequired = reason === "other";
  const remaining = CANCELLATION_NOTE_MAX - note.length;

  return (
    <Modal
      onClose={onClose}
      size="md"
      returnFocusRef={returnFocusRef}
      title={`Cancel booking ${booking.bookingRef}?`}
      description={`${booking.passengerName} · ${booking.route}`}
    >
      <form
        action={cancelBookingAction}
        className="space-y-5"
        aria-describedby={consequencesId}
      >
        <input type="hidden" name="id" value={booking.id} />

        <div
          id={consequencesId}
          className="rounded-card border border-accent-red/25 bg-accent-red/5 px-4 py-3 text-sm text-foreground"
        >
          <p className="font-medium">This will:</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5">
            <li>Mark the booking as cancelled and void its e-ticket.</li>
            <li>
              {holdsSeats
                ? `Keep its ${booking.seatsBooked} seat${booking.seatsBooked === 1 ? "" : "s"} counted as sold. An admin decides on the Cancellations tab whether they go back on sale.`
                : "Not change seat availability — this hold already expired and released its seats."}
            </li>
            <li>
              {paid
                ? "Keep the invoice as paid. Any refund is handled separately under the fare conditions."
                : booking.invoiceStatus
                  ? "Void the unpaid invoice."
                  : "Leave invoicing unchanged (no invoice on file)."}
            </li>
          </ul>
          <p className="mt-2 text-xs text-muted">
            You can reactivate the booking later if the seats are still
            available.
          </p>
        </div>

        <Select
          name="reason"
          label="Reason"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          helper="Recorded on the booking for the audit trail."
        >
          <option value="" disabled>
            Select a reason…
          </option>
          {CANCELLATION_REASONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.label}
            </option>
          ))}
        </Select>

        <Textarea
          name="note"
          label={noteRequired ? "Note to customer" : "Note to customer (optional)"}
          required={noteRequired}
          rows={3}
          maxLength={CANCELLATION_NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          helper={
            <span aria-live="polite">
              {notify
                ? "Included in the cancellation email."
                : "Saved on the booking; included if you email the customer later."}{" "}
              {remaining} characters left.
            </span>
          }
        />

        <Checkbox
          name="notifyCustomer"
          checked={notify}
          disabled={!booking.email}
          onChange={(e) => setNotify(e.target.checked)}
          label="Email the customer that their booking is cancelled"
          description={
            booking.email
              ? `Sent from the ticketing mailbox to ${booking.email}.`
              : "No email address on this booking."
          }
        />

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Keep booking
          </Button>
          <SubmitButton
            className={buttonClasses("destructive", "md")}
            pendingLabel="Cancelling…"
          >
            {notify ? "Cancel booking and email customer" : "Cancel booking"}
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
