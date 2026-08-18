import { formatDocDateTime, getBrand } from "@/lib/branding";
import { releaseQuoteHold, restoreFareAndFlight } from "@/lib/booking/inventory";
import { formatAud } from "@/lib/pricing";
import type { BookingDocumentData } from "@/lib/documents/templates";
import { sendEmail } from "@/lib/email/send";
import { emailLogoImgHtml } from "@/lib/email/inlineLogo";
import { prisma } from "@/lib/db";
import { loadBookingDocumentData } from "@/lib/email/bookingMail";

export function holdExpiredEmail(data: BookingDocumentData) {
  const brand = getBrand();
  const subject = `Seat hold released – ${brand.shortName} booking ${data.bookingRef}`;
  const route = `${data.flight.origin} → ${data.flight.destination}`;

  const html = `
  <div style="font-family:Georgia,serif;color:#0F172A;line-height:1.55;max-width:640px">
    <p style="margin:0 0 12px">
      ${emailLogoImgHtml(brand.shortName)}
    </p>
    <p style="color:#2563EB;letter-spacing:0.12em;text-transform:uppercase;font-size:12px">${brand.airlineName}</p>
    <h1 style="font-size:24px;margin:8px 0 16px">Seat hold has ended</h1>
    <p>Dear ${data.passengerName},</p>
    <p>Your bank-transfer booking <strong>${data.bookingRef}</strong> was held pending payment.</p>
    <p>We have not received confirmation of payment, so the seats are <strong>no longer on hold</strong> and have been returned to the ticket pool.</p>
    <p><strong>Route:</strong> ${route}<br/>
    <strong>Departure:</strong> ${formatDocDateTime(data.flight.departureAt)}<br/>
    <strong>Amount that was due:</strong> ${formatAud(data.amountPaidCents)}</p>
    <p>To travel on this route, please start a new booking on our website. Fares and availability may have changed.</p>
    <p><a href="${brand.siteUrl}">Book again</a></p>
    <p>Kind regards,<br/>${brand.reservationsTeam}<br/>${brand.airlineName}</p>
  </div>`;

  const text = `Dear ${data.passengerName},

Your seat hold for ${data.bookingRef} (${route}) has expired without payment.
Seats are no longer reserved. Please book again at ${brand.siteUrl}.

Kind regards,
${brand.reservationsTeam}`;

  return { subject, html, text };
}

/** Expire unpaid bank-transfer holds past holdExpiresAt; restore inventory; email customer. */
export async function expireStaleBankHolds() {
  const now = new Date();
  const stale = await prisma.booking.findMany({
    where: {
      status: "pending_payment",
      paymentMethod: "bank_transfer",
      holdExpiresAt: { lte: now },
    },
    select: { id: true },
    take: 100,
  });

  const results: { bookingId: string; ok: boolean; error?: string }[] = [];

  for (const row of stale) {
    try {
      const booking = await prisma.$transaction(async (tx) => {
        const current = await tx.booking.findUnique({
          where: { id: row.id },
          include: { invoice: true },
        });
        if (
          !current ||
          current.status !== "pending_payment" ||
          current.paymentMethod !== "bank_transfer" ||
          !current.holdExpiresAt ||
          current.holdExpiresAt > now
        ) {
          return null;
        }

        await restoreFareAndFlight(
          tx,
          current.flightId,
          current.fareReleaseId,
          current.seatsBooked,
        );
        if (current.returnFlightId) {
          await restoreFareAndFlight(
            tx,
            current.returnFlightId,
            current.returnFareReleaseId,
            current.seatsBooked,
          );
        }

        if (current.invoice) {
          await tx.invoice.update({
            where: { id: current.invoice.id },
            data: { status: "cancelled" },
          });
        }

        return tx.booking.update({
          where: { id: current.id },
          data: {
            status: "hold_expired",
            holdExpiresAt: null,
          },
        });
      });

      if (!booking) {
        results.push({ bookingId: row.id, ok: true });
        continue;
      }

      const data = await loadBookingDocumentData(booking.id);
      if (data) {
        const mail = holdExpiredEmail(data);
        await sendEmail({
          to: data.email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          mailbox: "ticketing",
        });
      }

      results.push({ bookingId: row.id, ok: true });
    } catch (error) {
      results.push({
        bookingId: row.id,
        ok: false,
        error: error instanceof Error ? error.message : "expire failed",
      });
    }
  }

  return { processed: results.length, results };
}

/** Release soft-held seats on expired active quotes. */
export async function expireStaleQuotes() {
  const now = new Date();
  const stale = await prisma.priceQuote.findMany({
    where: {
      status: "active",
      expiresAt: { lte: now },
    },
    select: { id: true },
    take: 100,
  });

  let released = 0;
  for (const row of stale) {
    try {
      await releaseQuoteHold(row.id);
      released += 1;
    } catch (error) {
      console.error("expire quote hold failed", row.id, error);
    }
  }
  return { scanned: stale.length, released };
}

let lastAdminExpirySweepAt = 0;
const ADMIN_EXPIRY_SWEEP_INTERVAL_MS = 60_000;

/**
 * Best-effort hold-expiry sweep for the admin dashboard's page load. An
 * hourly cron (`/api/cron/expire-holds`) is the source of truth for this
 * cleanup, so re-running the full scan — up to 100 quotes + 100 bookings,
 * each its own DB transaction — on *every* admin page load is wasted work.
 * That matters in practice: every admin form submit redirects back to
 * `/admin`, so a burst of admin activity was firing this scan dozens of
 * times a minute, saturating the connection pool and causing sibling
 * transactions (e.g. `restoreFareAndFlight`) to time out waiting for a free
 * connection. Throttle it to once per minute per warm server instance —
 * still keeps things fresh for ops opening the dashboard, without hammering
 * the DB on every click.
 */
export async function expireStaleHoldsForAdminLoad() {
  const now = Date.now();
  if (now - lastAdminExpirySweepAt < ADMIN_EXPIRY_SWEEP_INTERVAL_MS) return;
  lastAdminExpirySweepAt = now;

  try {
    await expireStaleQuotes();
    await expireStaleBankHolds();
  } catch (err) {
    console.error("expire stale holds on admin load failed", err);
  }
}
