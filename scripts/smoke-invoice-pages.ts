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

/*
 * The invoice used to paginate itself, emitting one `.page` wrapper (each with
 * its own `.header-img` / `.footer`) per sheet. Chrome now lives in Chromium's
 * @page margin box and the content simply flows, so counting those wrappers
 * measured nothing — this asserts what the HTML can actually still prove.
 * Real sheet counts are covered by scripts/smoke-document-pagination.ts, which
 * renders PDFs and reads their MediaBoxes.
 */
let failed = 0;

function check(cond: unknown, msg: string) {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failed += 1;
}

for (const n of [1, 2, 6, 10]) {
  const data = makeData(n);
  const html = renderAirfareInvoiceHtml(data);

  const listed = data.passengers.filter((p) =>
    html.includes(p.fullName),
  ).length;
  check(listed === n, `${n} adults → all ${n} traveller(s) listed (${listed})`);

  const adultLines = (html.match(/Airfare — Adult —/g) || []).length;
  // A lone traveller collapses to a single "Airfare" line, as on the reference.
  check(
    n === 1 ? adultLines === 0 : adultLines === n,
    `${n} adults → ${n === 1 ? "single airfare line" : `${n} per-adult line(s)`} (${adultLines})`,
  );

  // Self-pagination is gone; a stray wrapper would mean it crept back in.
  check(
    !html.includes('class="page"'),
    `${n} adults → no hand-rolled page wrappers`,
  );
}

if (failed) process.exit(1);
console.log("\ninvoice HTML structure OK");
