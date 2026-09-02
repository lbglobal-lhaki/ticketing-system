"use client";

import Link from "next/link";
import { useActionState } from "react";
import { payWithBankTransferAction } from "@/lib/actions/payment";
import { formatAud } from "@/lib/pricing";

type BankCheckoutFormProps = {
  quoteId: string;
  maxSeats: number;
  partyFareCents: number;
  seatFeeCents?: number;
  gstCents: number;
  paymentProofEmail: string;
  initialPassenger: {
    passengerName: string;
    email: string;
    passengerPhone?: string;
    passportNumber?: string;
    nationality?: string;
    seatsBooked?: number;
  };
  bankPreview: {
    bankName: string;
    accountName: string;
    bsb: string;
    accountNumber: string;
    swiftCode: string;
    bankAddress: string;
  };
};

export function BankCheckoutForm({
  quoteId,
  maxSeats,
  partyFareCents,
  seatFeeCents = 0,
  gstCents,
  paymentProofEmail,
  initialPassenger,
  bankPreview,
}: BankCheckoutFormProps) {
  const [state, action, pending] = useActionState(
    payWithBankTransferAction,
    null,
  );

  const seatsBooked = Math.min(
    Math.max(1, initialPassenger.seatsBooked ?? 1),
    Math.min(9, Math.max(1, maxSeats || initialPassenger.seatsBooked || 1)),
  );
  const totalCents = partyFareCents + seatFeeCents + gstCents;

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="quoteId" value={quoteId} />
      <input
        type="hidden"
        name="passengerName"
        value={initialPassenger.passengerName}
      />
      <input type="hidden" name="email" value={initialPassenger.email} />
      <input
        type="hidden"
        name="passengerPhone"
        value={initialPassenger.passengerPhone ?? ""}
      />
      <input
        type="hidden"
        name="passportNumber"
        value={initialPassenger.passportNumber ?? ""}
      />
      <input
        type="hidden"
        name="nationality"
        value={initialPassenger.nationality ?? ""}
      />
      <input type="hidden" name="seatsBooked" value={seatsBooked} />

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Bank transfer
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight">
          Request an invoice
        </h2>
        <p className="mt-2 text-sm text-muted">
          You are not charged online. We create an unpaid invoice with our bank
          details, hold your seats for 48 hours, and confirm the booking after
          your transfer is verified.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-surface/60 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Passenger details
            </p>
            <p className="mt-2 font-semibold text-foreground">
              {initialPassenger.passengerName}
            </p>
            <p className="mt-1 break-all text-sm text-muted">
              {initialPassenger.email}
            </p>
            {initialPassenger.passengerPhone ? (
              <p className="mt-1 text-sm text-muted">
                {initialPassenger.passengerPhone}
              </p>
            ) : null}
            <p className="mt-3 text-sm text-muted">
              {seatsBooked} seat{seatsBooked === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Link
              href={`/checkout/${quoteId}/passengers`}
              className="text-sm font-semibold text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              Edit details
            </Link>
            <Link
              href={`/checkout/${quoteId}/seats`}
              className="text-sm font-semibold text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              Change seats
            </Link>
          </div>
        </div>
        <div className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted">Ticket fare</span>
            <span className="font-medium">{formatAud(partyFareCents)}</span>
          </div>
          {seatFeeCents > 0 ? (
            <div className="flex justify-between gap-4">
              <span className="text-muted">Seat selection</span>
              <span className="font-medium">{formatAud(seatFeeCents)}</span>
            </div>
          ) : null}
          {gstCents > 0 ? (
            <div className="flex justify-between gap-4">
              <span className="text-muted">GST (10%)</span>
              <span className="font-medium">{formatAud(gstCents)}</span>
            </div>
          ) : null}
          <div className="flex items-end justify-between gap-4 pt-2">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">
              Amount due
            </p>
            <p className="font-[family-name:var(--font-syne)] text-3xl font-semibold">
              {formatAud(totalCents)}
            </p>
          </div>
          {gstCents > 0 ? (
            <p className="text-xs text-muted">
              GST (10%) is added on this fare
              {seatFeeCents > 0 ? " and seat extras" : ""}. Promotional Saver
              fares stay at the advertised amount.
            </p>
          ) : (
            <p className="text-xs text-muted">
              This promotional fare is charged at the advertised amount; GST is
              not added at checkout.
            </p>
          )}
        </div>
      </div>

      <dl className="grid gap-2 rounded-2xl border border-line bg-surface/60 p-5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Bank</dt>
          <dd className="font-medium">{bankPreview.bankName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Account name</dt>
          <dd className="font-medium">{bankPreview.accountName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">BSB</dt>
          <dd className="font-medium">{bankPreview.bsb}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Account</dt>
          <dd className="font-medium">{bankPreview.accountNumber}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Swift</dt>
          <dd className="font-medium">{bankPreview.swiftCode}</dd>
        </div>
        <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
          <dt className="shrink-0 text-muted">Bank address</dt>
          <dd className="font-medium sm:text-right">{bankPreview.bankAddress}</dd>
        </div>
      </dl>

      <div className="rounded-2xl border border-accent/25 bg-[linear-gradient(135deg,rgba(37,99,235,0.08),rgba(220,38,38,0.06))] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-deep">
          Transaction instructions
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-foreground">
          <li>
            Request your unpaid invoice below — no online payment is taken.
          </li>
          <li>
            Transfer the outstanding amount using your booking reference as the
            payment description.
          </li>
          <li>
            Email a screenshot of the successful transfer to{" "}
            <a
              href={`mailto:${paymentProofEmail}`}
              className="font-semibold text-accent underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              {paymentProofEmail}
            </a>{" "}
            so we can confirm your booking.
          </li>
        </ol>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Seats stay on hold for 48 hours. If payment is not verified in that
          window, the hold ends and you will need to book again.
        </p>
      </div>

      {state?.error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="btn-cta w-full rounded-xl py-3.5 text-sm tracking-wide"
      >
        {pending
          ? "Creating unpaid invoice…"
          : `Get unpaid invoice · ${formatAud(totalCents)}`}
      </button>
      <p className="-mt-4 text-center text-xs text-muted">
        Next you’ll be able to view the invoice online and email it to yourself.
      </p>

      <p className="text-sm text-muted">
        Prefer card?{" "}
        <Link
          href={`/checkout/${quoteId}/card`}
          className="font-medium text-accent underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          Pay by card
        </Link>
      </p>
    </form>
  );
}
