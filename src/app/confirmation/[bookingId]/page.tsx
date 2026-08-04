import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceDeliveryActions } from "@/components/checkout/InvoiceDeliveryActions";
import { getBrand } from "@/lib/branding";
import { canAccessBooking, withAccessToken } from "@/lib/documentAccess";
import { prisma } from "@/lib/db";
import { airportLabel, formatFlightTime } from "@/lib/format";
import { formatAud } from "@/lib/pricing";
import { getBankTransferDetails } from "@/lib/payments/bank";

// Re-emailing the invoice generates a PDF attachment via headless Chromium,
// which can take longer than the platform default.
export const maxDuration = 60;

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ invoice?: string; emailed?: string; t?: string }>;
}) {
  const { bookingId } = await params;
  const query = await searchParams;
  const brand = getBrand();
  const bankDetails = getBankTransferDetails();
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { flight: true, returnFlight: true, invoice: true, quote: true },
  });
  if (!booking) notFound();

  const allowed = await canAccessBooking({
    accessToken: booking.accessToken,
    quoteSessionId: booking.quote?.sessionId,
    providedToken: query.t,
  });
  if (!allowed) notFound();

  const token = booking.accessToken;
  const eticketHref = withAccessToken(
    `/documents/eticket/${encodeURIComponent(booking.bookingRef)}`,
    token,
  );
  const invoiceHref = booking.invoice
    ? withAccessToken(
        `/documents/invoice/${encodeURIComponent(booking.invoice.invoiceNumber)}`,
        token,
      )
    : null;

  const isRound = booking.tripType === "round_trip" && booking.returnFlight;
  const invoice = booking.invoice;
  const unpaid = invoice?.status === "unpaid";
  const paid = invoice?.status === "paid" || booking.status === "confirmed";
  const justCreatedInvoice = query.invoice === "1";
  const initialEmailed =
    query.emailed === "1" ? true : query.emailed === "0" ? false : null;
  const showBankInvoiceActions =
    Boolean(invoice) &&
    booking.paymentMethod === "bank_transfer" &&
    unpaid;
  const fareOnlyCents =
    invoice?.fareCents ||
    (booking.quote
      ? booking.quote.quotedPriceCents * booking.seatsBooked
      : Math.max(0, booking.amountPaidCents - booking.serviceFeeCents));
  const cardServiceFeeCents =
    booking.paymentMethod === "card" ? booking.serviceFeeCents || 0 : 0;
  const cardGstCents =
    booking.paymentMethod === "card"
      ? Math.max(
          0,
          booking.amountPaidCents - fareOnlyCents - cardServiceFeeCents,
        )
      : 0;

  return (
    <main className="page-shell relative overflow-x-clip pb-safe">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 20% 0%, rgba(37, 99, 235, 0.16), transparent 40%),
            radial-gradient(ellipse at 90% 10%, rgba(220, 38, 38, 0.08), transparent 36%),
            linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)
          `,
        }}
      />

      <div className="relative mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="rounded-2xl border border-line bg-surface/90 p-5 backdrop-blur-sm sm:rounded-none sm:p-8">
          <div className="flex items-center gap-3">
            <img
              src={brand.logoPath}
              alt=""
              width={40}
              height={40}
              className="size-10 object-contain"
            />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              {brand.airlineName}
            </p>
          </div>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            {unpaid
              ? "Booking reserved · awaiting payment"
              : "Booking confirmed"}
          </p>
          {justCreatedInvoice && showBankInvoiceActions ? (
            <p className="mt-3 rounded-xl border border-accent/20 bg-[linear-gradient(135deg,rgba(37,99,235,0.08),rgba(220,38,38,0.06))] px-4 py-3 text-sm text-foreground">
              Your unpaid invoice is ready. View it below, or email it to{" "}
              <span className="font-semibold">{booking.email}</span>.
            </p>
          ) : null}
          <h1 className="heading-gradient mt-3 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-4xl">
            {booking.bookingRef}
          </h1>
          <p className="mt-2 text-sm text-muted">
            Ticket {booking.ticketNumber}
          </p>
          <p className="mt-3 text-muted">
            {booking.passengerName} · {booking.email}
          </p>
          <p className="mt-1 text-sm text-muted">
            {isRound ? "Round trip" : "One way"}
            {booking.paymentMethod === "card"
              ? " · Paid by credit card"
              : booking.paymentMethod === "bank_transfer"
                ? " · Bank transfer"
                : booking.paymentMethod === "cash"
                  ? " · Cash"
                  : ""}
            {booking.source === "walk_in" ? " · Walk-in" : ""}
          </p>

          <div className="mt-8 space-y-4 border-t border-line pt-6 text-sm">
            <div>
              <p className="text-muted">Outbound</p>
              <p className="mt-1 break-words font-medium text-foreground">
                {booking.flight.airline} {booking.flight.flightNumber}
              </p>
              <p className="mt-1 break-words text-muted">
                {airportLabel(booking.flight.origin)} →{" "}
                {airportLabel(booking.flight.destination)}
              </p>
              <p className="mt-1 text-muted">
                {formatFlightTime(booking.flight.departureAt)}
              </p>
            </div>
            {isRound && booking.returnFlight && (
              <div>
                <p className="text-muted">Return</p>
                <p className="mt-1 break-words font-medium text-foreground">
                  {booking.returnFlight.airline}{" "}
                  {booking.returnFlight.flightNumber}
                </p>
                <p className="mt-1 break-words text-muted">
                  {airportLabel(booking.returnFlight.origin)} →{" "}
                  {airportLabel(booking.returnFlight.destination)}
                </p>
                <p className="mt-1 text-muted">
                  {formatFlightTime(booking.returnFlight.departureAt)}
                </p>
              </div>
            )}
            <p>
              <span className="text-muted">Fare</span>{" "}
              {booking.fareReleaseName || "—"}
            </p>
            <p>
              <span className="text-muted">Seats</span> {booking.seatsBooked}
            </p>
            {cardServiceFeeCents > 0 || cardGstCents > 0 ? (
              <>
                <p>
                  <span className="text-muted">Ticket fare</span>{" "}
                  {formatAud(fareOnlyCents)}
                </p>
                {cardServiceFeeCents > 0 ? (
                  <p>
                    <span className="text-muted">Credit card fee (2.2%)</span>{" "}
                    {formatAud(cardServiceFeeCents)}
                  </p>
                ) : null}
                {cardGstCents > 0 ? (
                  <p>
                    <span className="text-muted">GST (10%)</span>{" "}
                    {formatAud(cardGstCents)}
                  </p>
                ) : null}
                <p>
                  <span className="text-muted">Total paid (AUD)</span>{" "}
                  {formatAud(booking.amountPaidCents)}
                </p>
              </>
            ) : (
              <p>
                <span className="text-muted">Amount (AUD)</span>{" "}
                {formatAud(booking.amountPaidCents)}
              </p>
            )}
          </div>

          {showBankInvoiceActions && invoice ? (
            <div className="mt-6 rounded-2xl border border-line bg-white/80 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Your unpaid invoice
              </p>
              <p className="mt-1 font-[family-name:var(--font-syne)] text-xl font-semibold">
                {invoice.invoiceNumber}
              </p>
              <p className="mt-2 text-sm text-muted">
                Outstanding{" "}
                <span className="font-semibold text-foreground">
                  {formatAud(invoice.amountCents)}
                </span>
              </p>
              <div className="mt-4">
                <InvoiceDeliveryActions
                  bookingId={booking.id}
                  invoiceNumber={invoice.invoiceNumber}
                  invoiceHref={invoiceHref!}
                  customerEmail={booking.email}
                  unpaid
                  initialEmailed={justCreatedInvoice ? initialEmailed : null}
                />
              </div>
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Link
                href={eticketHref}
                className={`${paid ? "btn-cta" : "btn-secondary"} min-h-11 px-4 py-2.5 text-sm`}
                target="_blank"
              >
                View travel document
              </Link>
              {invoiceHref ? (
                <Link
                  href={invoiceHref}
                  className="btn-secondary min-h-11 px-4 py-2.5 text-sm"
                  target="_blank"
                >
                  View airfare invoice
                </Link>
              ) : null}
            </div>
          )}

          {invoice && (
            <div className="mt-8 border border-line bg-white/70 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                    Invoice
                  </p>
                  <p className="mt-1 font-[family-name:var(--font-syne)] text-xl font-semibold">
                    {invoice.invoiceNumber}
                  </p>
                </div>
                <span
                  className={`text-xs font-semibold uppercase tracking-[0.14em] ${
                    paid ? "text-accent" : "text-amber-800"
                  }`}
                >
                  {invoice.status}
                </span>
              </div>

              <p className="mt-4 text-sm text-muted">
                Outstanding{" "}
                <span className="font-semibold text-foreground">
                  {formatAud(
                    invoice.status === "paid" ? 0 : invoice.amountCents,
                  )}
                </span>
              </p>

              {invoice.paymentMethod === "bank_transfer" && unpaid && (
                <dl className="mt-5 grid gap-3 border-t border-line pt-5 text-sm">
                  <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-4">
                    <dt className="shrink-0 text-muted">Account name</dt>
                    <dd className="min-w-0 break-words font-medium">
                      {invoice.bankAccountName}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-4">
                    <dt className="shrink-0 text-muted">BSB</dt>
                    <dd className="min-w-0 break-all font-medium">
                      {invoice.bankBsb}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-4">
                    <dt className="shrink-0 text-muted">Account number</dt>
                    <dd className="min-w-0 break-all font-medium">
                      {invoice.bankAccountNumber}
                    </dd>
                  </div>
                  {bankDetails?.swiftCode ? (
                    <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-4">
                      <dt className="shrink-0 text-muted">Swift code</dt>
                      <dd className="min-w-0 break-all font-medium">
                        {bankDetails.swiftCode}
                      </dd>
                    </div>
                  ) : null}
                  {bankDetails?.bankAddress ? (
                    <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-4">
                      <dt className="shrink-0 text-muted">Bank address</dt>
                      <dd className="min-w-0 break-words font-medium">
                        {bankDetails.bankAddress}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Payment reference</dt>
                    <dd className="font-semibold text-accent-deep">
                      {invoice.bankReference}
                    </dd>
                  </div>
                  {booking.holdExpiresAt ? (
                    <p className="mt-3 text-xs leading-relaxed text-muted">
                      Seats held until{" "}
                      {booking.holdExpiresAt.toLocaleString("en-AU")}. If
                      payment is not confirmed by then, the hold ends and seats
                      return to the ticket pool.
                    </p>
                  ) : null}

                  <div className="mt-5 rounded-xl border border-accent/20 bg-[linear-gradient(135deg,rgba(37,99,235,0.08),rgba(220,38,38,0.06))] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-deep">
                      Transaction instructions
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-foreground">
                      This invoice is unpaid — no card payment was taken. After
                      you transfer the funds, email a screenshot of the payment
                      to{" "}
                      <a
                        href={`mailto:${brand.paymentProofEmail}`}
                        className="font-semibold text-accent underline"
                      >
                        {brand.paymentProofEmail}
                      </a>{" "}
                      so we can confirm your booking and issue your e-ticket.
                    </p>
                  </div>
                </dl>
              )}

              {invoice.paymentMethod === "card" && paid && (
                <p className="mt-4 text-sm text-muted">
                  Paid securely via Stripe
                  {invoice.stripePaymentIntentId
                    ? ` · ${invoice.stripePaymentIntentId}`
                    : ""}
                </p>
              )}

              {!showBankInvoiceActions ? (
                <p className="mt-4 text-sm text-muted">
                  {unpaid
                    ? "Your unpaid airfare invoice email is sent when email is configured."
                    : "A confirmation email with your travel document and airfare invoice is sent when email is configured."}
                </p>
              ) : (
                <div className="mt-5">
                  {paid ? (
                    <Link
                      href={eticketHref}
                      className="btn-secondary min-h-11 px-4 py-2.5 text-sm"
                      target="_blank"
                    >
                      View travel document
                    </Link>
                  ) : (
                    <p className="text-sm text-muted">
                      Your e-ticket is issued after payment is confirmed.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <Link href="/" className="btn-cta mt-8 px-5 py-3 text-sm">
            Search again
          </Link>
        </div>
      </div>
    </main>
  );
}
