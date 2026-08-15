import type { BookingDocumentData } from "../../src/lib/documents/templates";

export type SmokePartyOptions = {
  adults: number;
  children?: number;
  infants?: number;
  roundTrip?: boolean;
  /** Booking status; anything other than "confirmed" renders as unpaid. */
  status?: string;
};

/** Realistic BookingDocumentData for document-rendering smoke tests. */
export function makeSmokeBookingData(
  opts: SmokePartyOptions,
): BookingDocumentData {
  const unit = 199_900;
  const children = opts.children ?? 0;
  const infants = opts.infants ?? 0;

  const passengers = [
    ...Array.from({ length: opts.adults }, (_, i) => ({
      fullName: `Adult Passenger Longname ${i + 1}`,
      email: i === 0 ? "a@example.com" : "",
      phone: "",
      passportNumber: `P${1000000 + i}`,
      nationality: "Bhutanese",
      ticketNumber: `TKT${100000 + i}`,
      passengerType: "adult" as const,
      priceCents: unit,
      allocatesSeat: true,
    })),
    ...Array.from({ length: children }, (_, i) => ({
      fullName: `Child Passenger ${i + 1}`,
      email: "",
      phone: "",
      passportNumber: `C${2000000 + i}`,
      nationality: "Bhutanese",
      ticketNumber: `TKT${200000 + i}`,
      passengerType: "child" as const,
      priceCents: Math.round(unit * 0.75),
      allocatesSeat: true,
    })),
    ...Array.from({ length: infants }, (_, i) => ({
      fullName: `Infant Passenger ${i + 1}`,
      email: "",
      phone: "",
      passportNumber: "",
      nationality: "Bhutanese",
      ticketNumber: `TKT${300000 + i}`,
      passengerType: "infant" as const,
      priceCents: Math.round(unit * 0.1),
      allocatesSeat: false,
    })),
  ];

  const airfareCents =
    unit * opts.adults +
    Math.round(unit * 0.75) * children +
    Math.round(unit * 0.1) * infants;
  const confirmed = (opts.status ?? "confirmed") === "confirmed";

  return {
    bookingRef: "LBG-20260901-TESTREF01",
    ticketNumber: "TKT100000",
    accessToken: "tok",
    createdAt: new Date("2026-08-15T02:00:00Z"),
    status: opts.status ?? "confirmed",
    passengerName: passengers[0]!.fullName,
    email: "a@example.com",
    passengerPhone: "+61400000000",
    passportNumber: "P1000000",
    nationality: "Bhutanese",
    passengers,
    seatsBooked: opts.adults + children,
    fareReleaseName: "Economy Saver",
    fareProductName: "Economy Saver",
    paymentMethod: "bank_transfer",
    amountPaidCents: airfareCents,
    serviceFeeCents: 0,
    tripType: opts.roundTrip ? "round_trip" : "one_way",
    flight: {
      airline: "Drukair",
      flightNumber: "KB123",
      origin: "PER",
      destination: "PBH",
      departureAt: new Date("2026-09-01T02:00:00Z"),
      arrivalAt: new Date("2026-09-01T10:00:00Z"),
      cabinClass: "economy",
    },
    returnFlight: opts.roundTrip
      ? {
          airline: "Drukair",
          flightNumber: "KB124",
          origin: "PBH",
          destination: "PER",
          departureAt: new Date("2026-09-10T02:00:00Z"),
          arrivalAt: new Date("2026-09-10T10:00:00Z"),
          cabinClass: "economy",
        }
      : null,
    invoice: {
      invoiceNumber: "INV-20260815-0001",
      amountCents: airfareCents,
      fareCents: airfareCents,
      serviceFeeCents: 0,
      airfareCents,
      airportTaxesCents: 0,
      extraBaggageCents: 5000,
      travelInsuranceCents: 0,
      otherChargesCents: 0,
      gstRateBps: 1000,
      gstIncluded: false,
      gstOverrideCents: 0,
      accountNumber: "123456",
      businessTpn: "LAC00357",
      routeLabel: "Perth-Paro",
      seatLabel: "",
      nameRef: "TESTREF",
      endorsementText: "NON-TRANSFERABLE / SUBJECT TO FARE RULES",
      fareCalculationLine: "PERPBH 1999.00AUD END",
      status: confirmed ? "paid" : "unpaid",
      dueAt: null,
      createdAt: new Date("2026-08-15T02:00:00Z"),
      bankAccountName: "L&B Global",
      bankBsb: "062-000",
      bankAccountNumber: "1234 5678",
      bankReference: "INV-20260815-0001",
      customerName: passengers[0]!.fullName,
      customerEmail: "a@example.com",
      customerPhone: "+61400000000",
      customerAddress: "",
      notes: "",
      stripePaymentIntentId: null,
      markedPaidByAdmin: false,
      sentAt: null,
      paidAt: confirmed ? new Date("2026-08-15T03:00:00Z") : null,
      pdfBlobUrl: null,
    },
  } as unknown as BookingDocumentData;
}
