import { renderAirfareInvoiceHtml } from "../src/lib/documents/airfareInvoice";
import type { BookingDocumentData } from "../src/lib/documents/templates";

function makeData(nAdults: number): BookingDocumentData {
  const unit = 199_900;
  const airfareCents = unit * nAdults;
  const passengers = Array.from({ length: nAdults }, (_, i) => ({
    fullName: `Passenger ${i + 1}`,
    email: i === 0 ? "a@example.com" : "",
    phone: "",
    passportNumber: "",
    nationality: "",
    ticketNumber: `T${i + 1}`,
    passengerType: "adult" as const,
    priceCents: unit,
    allocatesSeat: true,
  }));
  return {
    bookingRef: "LBG-TEST",
    ticketNumber: "T1",
    accessToken: "x",
    createdAt: new Date(),
    status: "confirmed",
    seatsBooked: nAdults,
    fareReleaseName: "Economy",
    paymentMethod: "cash",
    amountPaidCents: airfareCents,
    serviceFeeCents: 0,
    tripType: "round_trip",
    passengerName: passengers[0]!.fullName,
    email: "a@example.com",
    passengers,
    flight: {
      airline: "Drukair",
      flightNumber: "KB123",
      origin: "PER",
      destination: "PBH",
      departureAt: new Date("2026-09-01T02:00:00Z"),
      arrivalAt: new Date("2026-09-01T10:00:00Z"),
      cabinClass: "economy",
    },
    invoice: {
      invoiceNumber: "INV-1",
      amountCents: airfareCents,
      fareCents: airfareCents,
      serviceFeeCents: 0,
      airfareCents,
      airportTaxesCents: 0,
      extraBaggageCents: 5000,
      travelInsuranceCents: 0,
      otherChargesCents: 0,
      gstRateBps: 0,
      gstIncluded: false,
      gstOverrideCents: 0,
      accountNumber: "1",
      businessTpn: "1",
      routeLabel: "Perth-Paro",
      seatLabel: "",
      nameRef: "TEST",
      endorsementText: "",
      fareCalculationLine: "",
      status: "paid",
      dueAt: null,
      createdAt: new Date(),
      bankAccountName: null,
      bankBsb: null,
      bankAccountNumber: null,
      bankReference: null,
      customerName: passengers[0]!.fullName,
      customerEmail: "a@example.com",
      customerPhone: "",
      customerAddress: "",
      pdfBlobUrl: null,
      notes: "",
      stripePaymentIntentId: null,
      markedPaidByAdmin: false,
      sentAt: null,
      paidAt: null,
    },
  } as unknown as BookingDocumentData;
}

let failed = 0;
for (const n of [1, 2, 6, 10]) {
  const html = renderAirfareInvoiceHtml(makeData(n));
  const pages = (html.match(/class="page"/g) || []).length;
  const headers = (html.match(/class="header-img"/g) || []).length;
  const footers = (html.match(/class="footer"/g) || []).length;
  const ok =
    pages >= 1 &&
    headers === pages &&
    footers === pages &&
    (n < 6 ? pages === 1 : pages >= 2);
  console.log(
    `${ok ? "✓" : "✗"} ${n} adults → pages=${pages} headers=${headers} footers=${footers}`,
  );
  if (!ok) failed += 1;
}
if (failed) process.exit(1);
