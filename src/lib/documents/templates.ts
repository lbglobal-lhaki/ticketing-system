import { renderAirfareInvoiceHtml as renderAirfareInvoiceHtmlImpl } from "@/lib/documents/airfareInvoice";
import { renderTravelDocumentHtml as renderTravelDocumentHtmlImpl } from "@/lib/documents/travelDocument";

export type BookingDocumentPassenger = {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  passportNumber?: string | null;
  nationality?: string | null;
  ticketNumber: string;
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
  fareReleaseName: string;
  fareProductName?: string;
  paymentMethod: string | null;
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

/** @deprecated alias — travel document combo */
export function renderETicketHtml(data: BookingDocumentData) {
  return renderTravelDocumentHtml(data);
}

/** @deprecated alias — airfare invoice */
export function renderTaxInvoiceHtml(data: BookingDocumentData) {
  return renderAirfareInvoiceHtml(data);
}
