import { renderAirfareInvoiceHtml as renderAirfareInvoiceHtmlImpl } from "@/lib/documents/airfareInvoice";
import { renderTravelDocumentHtml as renderTravelDocumentHtmlImpl } from "@/lib/documents/travelDocument";
import {
  pdfFooterTemplate,
  pdfHeaderTemplate,
  pdfPageMargin,
} from "@/lib/documents/documentChrome";
import type { HtmlToPdfOptions } from "@/lib/documents/pdf";

export type BookingDocumentPassenger = {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  passportNumber?: string | null;
  nationality?: string | null;
  ticketNumber: string;
  returnTicketNumber?: string | null;
  bookingRef?: string | null;
  passengerType?: "adult" | "child" | "infant" | string;
  dateOfBirth?: Date | string | null;
  priceCents?: number;
  allocatesSeat?: boolean;
};

export type BookingDocumentData = {
  bookingRef: string;
  ticketNumber: string;
  accessToken: string;
  createdAt: Date;
  status: string;
  passengerName: string;
  email: string;
  passengerPhone?: string | null;
  passportNumber?: string | null;
  nationality?: string | null;
  /** All named travellers (primary first). Falls back to passengerName when empty. */
  passengers: BookingDocumentPassenger[];
  seatsBooked: number;
  /** Extra checked bags purchased with the booking (piece count). */
  extraBaggageKg?: number;
  fareReleaseName: string;
  fareProductName?: string;
  paymentMethod: string | null;
  holdExpiresAt?: Date | null;
  amountPaidCents: number;
  serviceFeeCents: number;
  tripType: string;
  stripePaymentIntentId?: string | null;
  flight: {
    airline: string;
    flightNumber: string;
    origin: string;
    destination: string;
    departureAt: Date;
    arrivalAt: Date;
    cabinClass: string;
  };
  returnFlight?: {
    airline: string;
    flightNumber: string;
    origin: string;
    destination: string;
    departureAt: Date;
    arrivalAt: Date;
    cabinClass: string;
  } | null;
  invoice?: {
    invoiceNumber: string;
    amountCents: number;
    fareCents: number;
    serviceFeeCents: number;
    airfareCents: number;
    airportTaxesCents: number;
    extraBaggageCents: number;
    travelInsuranceCents: number;
    otherChargesCents: number;
    gstRateBps: number;
    gstIncluded: boolean;
    gstOverrideCents?: number;
    accountNumber: string;
    businessTpn: string;
    routeLabel: string;
    seatLabel: string;
    nameRef: string;
    endorsementText: string;
    fareCalculationLine: string;
    status: string;
    dueAt: Date | null;
    createdAt: Date;
    bankAccountName: string | null;
    bankBsb: string | null;
    bankAccountNumber: string | null;
    bankReference: string | null;
    customerPhone?: string | null;
    customerEmail?: string | null;
    stripePaymentIntentId?: string | null;
    notes?: string | null;
  } | null;
};

export function renderTravelDocumentHtml(data: BookingDocumentData) {
  return renderTravelDocumentHtmlImpl(data);
}

export function renderAirfareInvoiceHtml(data: BookingDocumentData) {
  return renderAirfareInvoiceHtmlImpl(data);
}

/**
 * PDF options for the airfare invoice — brand header and contact footer are
 * painted into the reserved @page margin box on every sheet.
 */
export function invoicePdfOptions(data: BookingDocumentData): HtmlToPdfOptions {
  return {
    headerTemplate: pdfHeaderTemplate(),
    footerTemplate: pdfFooterTemplate({
      reference: data.invoice?.invoiceNumber || data.bookingRef,
    }),
    margin: pdfPageMargin(),
  };
}

/**
 * PDF options for the travel document / e-ticket.
 *
 * Deliberately empty: the reference document prints the brand band and contact
 * strip on the covering letter only, while Chromium's `displayHeaderFooter`
 * repeats a margin-box template on every sheet. The template therefore lays its
 * own chrome out inline, and passing no header/footer here lets
 * `preferCSSPageSize` honour `@page { margin: 0 }` so the charter banner can
 * bleed to both paper edges.
 */
export function travelDocumentPdfOptions(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  data: BookingDocumentData,
): HtmlToPdfOptions {
  return {};
}

/** @deprecated alias — travel document combo */
export function renderETicketHtml(data: BookingDocumentData) {
  return renderTravelDocumentHtml(data);
}

/** @deprecated alias — airfare invoice */
export function renderTaxInvoiceHtml(data: BookingDocumentData) {
  return renderAirfareInvoiceHtml(data);
}
