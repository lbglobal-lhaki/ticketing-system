import { prisma } from "@/lib/db";
import { resolveDocumentPassengers } from "@/lib/documents/resolvePassengers";
import type { BookingDocumentData } from "@/lib/documents/templates";
import {
  renderAirfareInvoiceHtml,
  renderTravelDocumentHtml,
  travelDocumentPdfOptions,
} from "@/lib/documents/templates";
import { getOrCreateInvoicePdf } from "@/lib/documents/invoiceBlob";
import { htmlToPdf } from "@/lib/documents/pdf";
import {
  bankTransferEmail,
  eTicketEmail,
  invoiceReceiptEmail,
} from "@/lib/email/templates";
import { sendEmail, type EmailAttachment } from "@/lib/email/send";

async function travelDocAttachment(
  data: BookingDocumentData,
): Promise<EmailAttachment> {
  const html = renderTravelDocumentHtml(data);
  try {
    return {
      filename: `E-Ticket-Itinerary-${data.bookingRef}.pdf`,
      content: await htmlToPdf(html, travelDocumentPdfOptions(data)),
      contentType: "application/pdf",
    };
  } catch (error) {
    console.error("[email] travel doc PDF failed; attaching HTML", error);
    return {
      filename: `E-Ticket-Itinerary-${data.bookingRef}.html`,
      content: html,
      contentType: "text/html",
    };
  }
}

async function invoiceAttachment(
  data: BookingDocumentData,
): Promise<EmailAttachment> {
  const invoiceNumber = data.invoice!.invoiceNumber;
  try {
    return {
      filename: `Airfare-Invoice-${invoiceNumber}.pdf`,
      // Always regenerate so existing bookings pick up the current template
      // (multi-page layout, party mix, etc.) instead of a stale Blob PDF.
      content: await getOrCreateInvoicePdf(data, { forceRefresh: true }),
      contentType: "application/pdf",
    };
  } catch (error) {
    console.error("[email] invoice PDF failed; attaching HTML", error);
    return {
      filename: `Airfare-Invoice-${invoiceNumber}.html`,
      content: renderAirfareInvoiceHtml(data),
      contentType: "text/html",
    };
  }
}

export async function loadBookingDocumentData(
  bookingId: string,
): Promise<BookingDocumentData | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      flight: true,
      returnFlight: true,
      invoice: true,
      quote: true,
      passengers: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!booking) return null;

  const quote = booking.quote;
  const passengers = resolveDocumentPassengers({
    booking: {
      passengerName: booking.passengerName,
      email: booking.email,
      passengerPhone: booking.passengerPhone,
      passportNumber: booking.passportNumber,
      nationality: booking.nationality,
      ticketNumber: booking.ticketNumber,
      seatsBooked: booking.seatsBooked,
    },
    stored: booking.passengers.map((p) => ({
      fullName: p.fullName,
      email: p.email,
      phone: p.phone,
      passportNumber: p.passportNumber,
      nationality: p.nationality,
      ticketNumber: p.ticketNumber,
      passengerType: p.passengerType,
      priceCents: p.priceCents,
      allocatesSeat: p.allocatesSeat,
    })),
    quote: quote
      ? {
          unitAdultFareCents: quote.unitAdultFareCents,
          adultCount: quote.adultCount,
          childCount: quote.childCount,
          infantCount: quote.infantCount,
          travellersDraft: quote.travellersDraft,
        }
      : null,
  });

  return {
    bookingRef: booking.bookingRef,
    ticketNumber: booking.ticketNumber,
    accessToken: booking.accessToken,
    createdAt: booking.createdAt,
    status: booking.status,
    passengerName: booking.passengerName,
    email: booking.email,
    passengerPhone: booking.passengerPhone,
    passportNumber: booking.passportNumber,
    nationality: booking.nationality,
    passengers,
    seatsBooked: booking.seatsBooked,
    fareReleaseName: booking.fareReleaseName,
    fareProductName: booking.fareProductName,
    paymentMethod: booking.paymentMethod,
    holdExpiresAt: booking.holdExpiresAt,
    amountPaidCents: booking.amountPaidCents,
    serviceFeeCents: booking.serviceFeeCents,
    tripType: booking.tripType,
    stripePaymentIntentId: booking.invoice?.stripePaymentIntentId,
    flight: booking.flight,
    returnFlight: booking.returnFlight,
    invoice: booking.invoice
      ? {
          invoiceNumber: booking.invoice.invoiceNumber,
          amountCents: booking.invoice.amountCents,
          fareCents: booking.invoice.fareCents,
          serviceFeeCents: booking.invoice.serviceFeeCents,
          airfareCents: booking.invoice.airfareCents,
          airportTaxesCents: booking.invoice.airportTaxesCents,
          extraBaggageCents: booking.invoice.extraBaggageCents,
          travelInsuranceCents: booking.invoice.travelInsuranceCents,
          otherChargesCents: booking.invoice.otherChargesCents,
          gstRateBps: booking.invoice.gstRateBps,
          gstIncluded: booking.invoice.gstIncluded,
          gstOverrideCents: booking.invoice.gstOverrideCents,
          accountNumber: booking.invoice.accountNumber,
          businessTpn: booking.invoice.businessTpn,
          routeLabel: booking.invoice.routeLabel,
          seatLabel: booking.invoice.seatLabel,
          nameRef: booking.invoice.nameRef,
          endorsementText: booking.invoice.endorsementText,
          fareCalculationLine: booking.invoice.fareCalculationLine,
          status: booking.invoice.status,
          dueAt: booking.invoice.dueAt,
          createdAt: booking.invoice.createdAt,
          bankAccountName: booking.invoice.bankAccountName,
          bankBsb: booking.invoice.bankBsb,
          bankAccountNumber: booking.invoice.bankAccountNumber,
          bankReference: booking.invoice.bankReference,
          customerPhone: booking.invoice.customerPhone,
          stripePaymentIntentId: booking.invoice.stripePaymentIntentId,
          notes: booking.invoice.notes,
        }
      : null,
  };
}

/**
 * Sends TWO separate emails from two separate mailboxes:
 *  - e-ticket / itinerary from ticketing@
 *  - tax invoice / receipt from accounts@ (only if an invoice exists)
 */
export async function sendBookingConfirmationBundle(bookingId: string) {
  const data = await loadBookingDocumentData(bookingId);
  if (!data) return { ok: false as const, error: "Booking not found" };
  if (data.status !== "confirmed") {
    return {
      ok: false as const,
      error: "Booking is not confirmed yet — pay first, then send confirmation",
    };
  }

  // Build both PDFs in parallel (shared warm Chromium) — used to take 2×
  // cold-start time when done serially on serverless.
  const ticketEmail = eTicketEmail(data);
  const receiptEmail = data.invoice ? invoiceReceiptEmail(data) : null;
  const [ticketAttachment, invoiceFile] = await Promise.all([
    travelDocAttachment(data),
    data.invoice ? invoiceAttachment(data) : Promise.resolve(null),
  ]);

  const [ticketResult, invoiceResult] = await Promise.all([
    sendEmail({
      to: data.email,
      subject: ticketEmail.subject,
      html: ticketEmail.html,
      text: ticketEmail.text,
      mailbox: "ticketing",
      attachments: [ticketAttachment],
    }),
    invoiceFile && receiptEmail && data.invoice
      ? sendEmail({
          to: data.email,
          subject: receiptEmail.subject,
          html: receiptEmail.html,
          text: receiptEmail.text,
          mailbox: "accounts",
          attachments: [invoiceFile],
        })
      : Promise.resolve(null),
  ]);

  if (invoiceResult?.ok && data.invoice) {
    await prisma.invoice.update({
      where: { invoiceNumber: data.invoice.invoiceNumber },
      data: { sentAt: new Date() },
    });
  }

  if (!ticketResult.ok) return ticketResult;
  if (invoiceResult && !invoiceResult.ok) {
    return {
      ok: false as const,
      error: `E-ticket sent, but invoice email failed: ${invoiceResult.error}`,
    };
  }
  return ticketResult;
}

export async function sendBankTransferBundle(bookingId: string) {
  const data = await loadBookingDocumentData(bookingId);
  if (!data) return { ok: false as const, error: "Booking not found" };
  if (!data.invoice) {
    return { ok: false as const, error: "Invoice not found" };
  }

  const email = bankTransferEmail(data);
  const invoiceFile = await invoiceAttachment(data);

  // Invoice only until payment is confirmed — do not attach boarding passes.
  const result = await sendEmail({
    to: data.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    mailbox: "accounts",
    attachments: [invoiceFile],
  });

  if (result.ok) {
    await prisma.invoice.update({
      where: { invoiceNumber: data.invoice.invoiceNumber },
      data: { sentAt: new Date() },
    });
  }

  return result;
}

/** Sends only the e-ticket / itinerary email (ticketing@) — independent of the invoice. */
export async function sendTravelDocumentEmail(bookingId: string) {
  const data = await loadBookingDocumentData(bookingId);
  if (!data) return { ok: false as const, error: "Booking not found" };
  if (data.status !== "confirmed") {
    return {
      ok: false as const,
      error:
        "Booking isn't confirmed yet — the travel document emails once payment is confirmed",
    };
  }

  const ticketEmail = eTicketEmail(data);
  const ticketAttachment = await travelDocAttachment(data);
  return sendEmail({
    to: data.email,
    subject: ticketEmail.subject,
    html: ticketEmail.html,
    text: ticketEmail.text,
    mailbox: "ticketing",
    attachments: [ticketAttachment],
  });
}

/** Sends only the airfare invoice / receipt email (accounts@) — independent of the travel document. */
export async function sendAirfareInvoiceEmail(bookingId: string) {
  const data = await loadBookingDocumentData(bookingId);
  if (!data) return { ok: false as const, error: "Booking not found" };
  if (!data.invoice) return { ok: false as const, error: "Invoice not found" };

  const email =
    data.status === "confirmed"
      ? invoiceReceiptEmail(data)
      : bankTransferEmail(data);
  const invoiceFile = await invoiceAttachment(data);
  const result = await sendEmail({
    to: data.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    mailbox: "accounts",
    attachments: [invoiceFile],
  });

  if (result.ok) {
    await prisma.invoice.update({
      where: { invoiceNumber: data.invoice.invoiceNumber },
      data: { sentAt: new Date() },
    });
  }

  return result;
}

/** Sends the right template for the booking/invoice state. */
export async function sendInvoiceEmailForBooking(bookingId: string) {
  const data = await loadBookingDocumentData(bookingId);
  if (!data) return { ok: false as const, error: "Booking not found" };

  if (data.status === "confirmed") {
    return sendBookingConfirmationBundle(bookingId);
  }
  if (data.paymentMethod === "bank_transfer") {
    return sendBankTransferBundle(bookingId);
  }
  return {
    ok: false as const,
    error: "No matching email template for this booking state",
  };
}
