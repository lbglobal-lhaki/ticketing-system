import { formatAud } from "@/lib/pricing";
import {
  formatDocDateTime,
  getBrand,
} from "@/lib/branding";
import { formatFlightDateTime, airportTzAbbr } from "@/lib/datetime";
import { withAccessToken } from "@/lib/documentAccess";
import type { BookingDocumentData } from "@/lib/documents/templates";
import { emailLogoImgHtml } from "@/lib/email/inlineLogo";
import {
  formatSpecialAssistance,
  hasSpecialAssistance,
} from "@/lib/booking/specialAssistance";
import {
  CARRY_ON_LABEL,
  partyBaggageSummaryLine,
  partyHasInfant,
} from "@/lib/fares/baggageAllowance";
import { formatTerminal } from "@/lib/flights/terminals";
import { cancellationReasonCustomerText } from "@/lib/booking/cancellationPolicy";

type DocFlight = BookingDocumentData["flight"];

/** "PBH Terminal 1 → PER Terminal 1" for one sector. */
function terminalLine(flight: DocFlight) {
  return `${flight.origin} Terminal ${formatTerminal(flight.departureTerminal)} → ${flight.destination} Terminal ${formatTerminal(flight.arrivalTerminal)}`;
}

function departureLine(flight: DocFlight) {
  return `${formatFlightDateTime(flight.departureAt)} ${airportTzAbbr(flight.origin, flight.departureAt)}`;
}

function baggageEmailLine(data: BookingDocumentData) {
  const checked =
    data.includedBaggageLabel?.trim() ||
    (data.includedBaggageKg ? `${data.includedBaggageKg} kg` : "");
  const hasInfant = partyHasInfant(data.passengers);
  if (!checked) {
    return hasInfant
      ? partyBaggageSummaryLine(CARRY_ON_LABEL, true)
      : `${CARRY_ON_LABEL} carry-on`;
  }
  return partyBaggageSummaryLine(checked, hasInfant);
}

function specialAssistanceEmailHtml(data: BookingDocumentData) {
  if (!hasSpecialAssistance(data.specialAssistance)) return "";
  return `<p><strong>Special assistance:</strong> ${esc(formatSpecialAssistance(data.specialAssistance))}</p>`;
}

function specialAssistanceEmailText(data: BookingDocumentData) {
  if (!hasSpecialAssistance(data.specialAssistance)) return "";
  return `Special assistance: ${formatSpecialAssistance(data.specialAssistance)}\n`;
}

function esc(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Travel document email — same shape as the tax-invoice mail so Gmail
 *  treats it as a business attachment, not a fake airline e-ticket. */
export function eTicketEmail(data: BookingDocumentData) {
  const brand = getBrand();
  const subject = `Travel document ${data.bookingRef} – ${brand.issuingAgent}`;
  const route = `${data.flight.origin} → ${data.flight.destination}${
    data.returnFlight
      ? ` · Return ${data.returnFlight.origin} → ${data.returnFlight.destination}`
      : ""
  }`;
  const travelUrl = withAccessToken(
    `${brand.siteUrl}/documents/eticket/${encodeURIComponent(data.bookingRef)}`,
    data.accessToken,
  );

  const html = `
  <div style="font-family:Georgia,serif;color:#0F172A;line-height:1.55;max-width:640px">
    <p style="margin:0 0 12px">
      ${emailLogoImgHtml(brand.shortName)}
    </p>
    <p style="color:#2563EB;letter-spacing:0.12em;text-transform:uppercase;font-size:12px">${esc(brand.issuingAgent)} Ticketing</p>
    <h1 style="font-size:24px;margin:8px 0 16px">Booking confirmed — travel document attached</h1>
    <p>Dear ${esc(data.passengerName)},</p>
    <p>Thank you for your payment. Your travel document for booking <strong>${esc(data.bookingRef)}</strong> is attached to this email.</p>
    <p><strong>Booking Reference:</strong> ${esc(data.bookingRef)}<br/>
    <strong>Route:</strong> ${esc(route)}<br/>
    <strong>Fare:</strong> ${esc(data.fareProductName || data.fareReleaseName || "—")}<br/>
    <strong>Included baggage:</strong> ${esc(baggageEmailLine(data))}<br/>
    <strong>Departure:</strong> ${esc(departureLine(data.flight))}<br/>
    <strong>Terminal:</strong> ${esc(terminalLine(data.flight))}${
      data.returnFlight
        ? `<br/>
    <strong>Return departure:</strong> ${esc(departureLine(data.returnFlight))}<br/>
    <strong>Return terminal:</strong> ${esc(terminalLine(data.returnFlight))}`
        : ""
    }</p>
    ${specialAssistanceEmailHtml(data)}
    <p><a href="${travelUrl}">View travel document online</a></p>
    ${
      data.invoice
        ? `<p>Your tax invoice / receipt is emailed separately by our accounts team.</p>`
        : ""
    }
    <p>Kind regards,<br/>Ticketing Team<br/>${esc(brand.issuingAgent)}</p>
  </div>`;

  const text = `Dear ${data.passengerName},

Thank you for your payment. Your travel document for booking ${data.bookingRef} is attached.

Booking Reference: ${data.bookingRef}
Route: ${route}
Fare: ${data.fareProductName || data.fareReleaseName || "—"}
Included baggage: ${baggageEmailLine(data)}
Departure: ${departureLine(data.flight)}
Terminal: ${terminalLine(data.flight)}
${
  data.returnFlight
    ? `Return departure: ${departureLine(data.returnFlight)}
Return terminal: ${terminalLine(data.returnFlight)}
`
    : ""
}${specialAssistanceEmailText(data)}

Travel document: ${travelUrl}
${data.invoice ? "Your tax invoice / receipt is emailed separately by our accounts team.\n" : ""}
Kind regards,
Ticketing Team
${brand.issuingAgent}`;

  return { subject, html, text, ticketUrl: travelUrl };
}

/** Sent from the accounts@ mailbox — paid tax invoice / receipt only. */
export function invoiceReceiptEmail(data: BookingDocumentData) {
  const brand = getBrand();
  const invoiceNumber = data.invoice?.invoiceNumber ?? data.bookingRef;
  const subject = `Tax Invoice / Receipt ${invoiceNumber} – ${brand.issuingAgent}`;
  const invoiceUrl = data.invoice
    ? withAccessToken(
        `${brand.siteUrl}/documents/invoice/${encodeURIComponent(data.invoice.invoiceNumber)}`,
        data.accessToken,
      )
    : brand.siteUrl;

  const html = `
  <div style="font-family:Georgia,serif;color:#0F172A;line-height:1.55;max-width:640px">
    <p style="margin:0 0 12px">
      ${emailLogoImgHtml(brand.shortName)}
    </p>
    <p style="color:#2563EB;letter-spacing:0.12em;text-transform:uppercase;font-size:12px">${esc(brand.issuingAgent)} Accounts</p>
    <h1 style="font-size:24px;margin:8px 0 16px">Payment received — tax invoice attached</h1>
    <p>Dear ${esc(data.passengerName)},</p>
    <p>Thank you for your payment. Your tax invoice / receipt for booking <strong>${esc(data.bookingRef)}</strong> is attached to this email.</p>
    <p><strong>Invoice Number:</strong> ${esc(invoiceNumber)}<br/>
    <strong>Total Paid:</strong> ${esc(formatAud(data.amountPaidCents))}</p>
    <p><a href="${invoiceUrl}">View invoice online</a></p>
    <p>Your travel document is emailed separately.</p>
    <p>Kind regards,<br/>Accounts Team<br/>${esc(brand.issuingAgent)}</p>
  </div>`;

  const text = `Dear ${data.passengerName},

Thank you for your payment. Your tax invoice / receipt for booking ${data.bookingRef} is attached.

Invoice Number: ${invoiceNumber}
Total Paid: ${formatAud(data.amountPaidCents)}

Invoice: ${invoiceUrl}

Your travel document is emailed separately.

Kind regards,
Accounts Team
${brand.issuingAgent}`;

  return { subject, html, text, invoiceUrl };
}

/**
 * "Your booking has been cancelled" — sent from the ticketing mailbox.
 *
 * Written to stay in the inbox: transactional subject with the booking
 * reference, no shouting or urgency words, a plain-text part that mirrors the
 * HTML, only first-party links, no attachments, and real contact details.
 */
export function bookingCancelledEmail(
  data: BookingDocumentData,
  opts: { reason: string; note: string; wasPaid: boolean },
) {
  const brand = getBrand();
  const subject = `Booking ${data.bookingRef} cancelled – ${brand.issuingAgent}`;
  const reasonText = cancellationReasonCustomerText(opts.reason);
  const sentence = `Your booking ${data.bookingRef} has been cancelled${
    reasonText ? ` ${reasonText}` : ""
  }.`;
  const note = opts.note.trim();
  const travellers = (data.passengers?.length
    ? data.passengers.map((p) => p.fullName)
    : [data.passengerName]
  ).filter(Boolean);
  const sectors = [
    data.flight,
    ...(data.returnFlight ? [data.returnFlight] : []),
  ].map(
    (f) =>
      `${f.flightNumber} ${f.origin} → ${f.destination}, ${departureLine(f)}`,
  );
  const paymentLine = opts.wasPaid
    ? "Any refund is assessed under the cancellation and refund conditions of your fare. Our team will contact you about it, or you can reply to this email."
    : "No payment was received for this booking, so there is nothing further for you to pay.";
  const contactLine = `${brand.agentPhonePrimary} | ${brand.agentPhoneSecondary} · ${brand.agentEmail} · ${brand.agentWebsite}`;

  const label =
    "font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#475569;margin:0 0 4px";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff">
  <div style="font-family:Georgia,serif;color:#0F172A;line-height:1.55;max-width:640px;padding:16px">
    <p style="margin:0 0 12px">
      ${emailLogoImgHtml(brand.shortName)}
    </p>
    <p style="color:#2563EB;letter-spacing:0.12em;text-transform:uppercase;font-size:12px">${esc(brand.issuingAgent)} Ticketing</p>
    <h1 style="font-size:24px;margin:8px 0 16px">Your booking has been cancelled</h1>
    <p>Dear ${esc(data.passengerName)},</p>
    <p>${esc(sentence)}</p>
    ${
      note
        ? `<p style="border-left:3px solid #CBD5E1;padding:4px 0 4px 12px;margin:16px 0;white-space:pre-line">${esc(note)}</p>`
        : ""
    }
    <p style="${label}">Booking reference</p>
    <p style="margin:0 0 12px"><strong>${esc(data.bookingRef)}</strong></p>
    <p style="${label}">Cancelled flight${sectors.length > 1 ? "s" : ""}</p>
    <p style="margin:0 0 12px">${sectors.map(esc).join("<br/>")}</p>
    <p style="${label}">Traveller${travellers.length > 1 ? "s" : ""}</p>
    <p style="margin:0 0 16px">${travellers.map(esc).join("<br/>")}</p>
    <p>Any e-ticket issued for this booking is no longer valid for travel.</p>
    <p>${esc(paymentLine)}</p>
    <p>If you did not expect this, or would like to book again, please contact us at <a href="mailto:${esc(brand.agentEmail)}">${esc(brand.agentEmail)}</a> or ${esc(brand.agentPhonePrimary)}.</p>
    <p>Kind regards,<br/>${esc(brand.reservationsTeam)}<br/>${esc(brand.issuingAgent)}</p>
    <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0 12px" />
    <p style="font-size:12px;color:#64748B;margin:0">${esc(contactLine)}<br/>
    You are receiving this service message because a flight booking was made with this email address.</p>
  </div>
</body>
</html>`;

  const text = `Dear ${data.passengerName},

${sentence}
${note ? `\n${note}\n` : ""}
Booking reference: ${data.bookingRef}
Cancelled flight${sectors.length > 1 ? "s" : ""}:
${sectors.map((s) => `  ${s}`).join("\n")}
Traveller${travellers.length > 1 ? "s" : ""}:
${travellers.map((t) => `  ${t}`).join("\n")}

Any e-ticket issued for this booking is no longer valid for travel.
${paymentLine}

If you did not expect this, or would like to book again, please contact us at ${brand.agentEmail} or ${brand.agentPhonePrimary}.

Kind regards,
${brand.reservationsTeam}
${brand.issuingAgent}

--
${contactLine}
You are receiving this service message because a flight booking was made with this email address.`;

  return { subject, html, text };
}

export function bankTransferEmail(data: BookingDocumentData) {
  const brand = getBrand();
  const subject = `Payment Required – ${brand.issuingAgent} Booking ${data.bookingRef}`;
  const route = `${data.flight.origin} → ${data.flight.destination}`;
  const amount = data.invoice?.amountCents ?? data.amountPaidCents;
  const reference = data.invoice?.bankReference || data.bookingRef;
  const invoiceUrl = data.invoice
    ? withAccessToken(
        `${brand.siteUrl}/documents/invoice/${encodeURIComponent(data.invoice.invoiceNumber)}`,
        data.accessToken,
      )
    : brand.siteUrl;
  const holdUntil = data.holdExpiresAt
    ? formatDocDateTime(data.holdExpiresAt)
    : null;

  const html = `
  <div style="font-family:Georgia,serif;color:#0F172A;line-height:1.55;max-width:640px">
    <p style="margin:0 0 12px">
      ${emailLogoImgHtml(brand.shortName)}
    </p>
    <p style="color:#2563EB;letter-spacing:0.12em;text-transform:uppercase;font-size:12px">${esc(brand.issuingAgent)}</p>
    <h1 style="font-size:24px;margin:8px 0 16px">Payment required</h1>
    <p>Dear ${esc(data.passengerName)},</p>
    <p>Thank you for choosing <strong>${esc(brand.issuingAgent)}</strong>.</p>
    <p>Your booking has been created and is currently <strong>Pending Payment</strong>.</p>
    <p>As you selected Bank Transfer, your airfare invoice containing our bank account details and payment instructions is attached / available online.</p>
    <h2 style="font-size:14px;letter-spacing:0.12em;text-transform:uppercase;color:#2563EB;border-bottom:1px solid #E2E8F0;padding-bottom:6px">Booking Summary</h2>
    <p><strong>Booking Reference:</strong> ${esc(data.bookingRef)}<br/>
    <strong>Route:</strong> ${esc(route)}<br/>
    <strong>Departure:</strong> ${esc(departureLine(data.flight))}<br/>
    <strong>Terminal:</strong> ${esc(terminalLine(data.flight))}<br/>
    <strong>Amount Due:</strong> ${esc(formatAud(amount))}</p>
    ${specialAssistanceEmailHtml(data)}
    <p>Please transfer the total amount using the reference:<br/><strong>${esc(reference)}</strong></p>
    <p><a href="${invoiceUrl}">View Airfare Invoice &amp; bank details</a></p>
    <h2 style="font-size:14px;letter-spacing:0.12em;text-transform:uppercase;color:#2563EB;border-bottom:1px solid #E2E8F0;padding-bottom:6px;margin-top:24px">Transaction instructions</h2>
    <p>No online payment was taken. After you complete the bank transfer, email a <strong>screenshot of the payment</strong> to <a href="mailto:${esc(brand.paymentProofEmail)}"><strong>${esc(brand.paymentProofEmail)}</strong></a> so we can confirm your booking and send your e-ticket.</p>
    ${
      holdUntil
        ? `<p>Your seats are held until <strong>${esc(holdUntil)}</strong>. Once payment has been received and verified, we will email your booking confirmation and electronic ticket.</p>
    <p>If payment is not confirmed before ${esc(holdUntil)}, the hold will be released, seats return to the ticket pool, and you will need to book again.</p>`
        : `<p>Once payment has been received and verified, we will email your booking confirmation and electronic ticket.</p>`
    }
    <p>Kind regards,<br/>${esc(brand.reservationsTeam)}<br/>${esc(brand.issuingAgent)}</p>
  </div>`;

  const text = `Dear ${data.passengerName},

Your ${brand.issuingAgent} booking ${data.bookingRef} is Pending Payment.

Route: ${route}
Departure: ${departureLine(data.flight)}
Terminal: ${terminalLine(data.flight)}
Amount Due: ${formatAud(amount)}
${specialAssistanceEmailText(data)}Payment reference: ${reference}

After transferring, email a payment screenshot to ${brand.paymentProofEmail} so we can confirm your booking.

Airfare invoice: ${invoiceUrl}

Kind regards,
${brand.reservationsTeam}
${brand.issuingAgent}`;

  return { subject, html, text, invoiceUrl };
}
