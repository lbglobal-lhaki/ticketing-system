/**
 * Walk-in RT pricing: adult package once × adults (not sum of both legs × adults).
 * Run: npx tsx scripts/smoke-walkin-rt-pricing.ts
 */
import {
  resolveAdultLegFares,
  splitRoundTripPackageCents,
} from "../src/lib/pricing/service";
import { partyFareCents } from "../src/lib/booking/passengers";
import { renderAirfareInvoiceHtml } from "../src/lib/documents/airfareInvoice";
import type { BookingDocumentData } from "../src/lib/documents/templates";

let passed = 0;
let failed = 0;

function assert(cond: unknown, msg: string) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${msg}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${msg}`);
  }
}

const PACKAGE = 199_900; // $1999.00

console.log("\nresolveAdultLegFares (system / paired RT package)");
{
  const legs = resolveAdultLegFares({
    isRoundTrip: true,
    outboundOneWayCents: 150_000,
    outboundRoundTripCents: PACKAGE,
    returnOneWayCents: 150_000,
    returnRoundTripCents: PACKAGE, // same package mirrored on return leg
  });
  assert(legs.unitAdultCents === PACKAGE, `unit adult = $${PACKAGE / 100}`);
  assert(
    legs.outboundLegCents + legs.returnLegCents === PACKAGE,
    "leg split sums to package",
  );

  const twoAdults = legs.unitAdultCents * 2;
  assert(twoAdults === 399_800, "2 adults = $3998 (not $7996)");
  assert(twoAdults !== (PACKAGE + PACKAGE) * 2, "not the old double-count");
}

console.log("\nresolveAdultLegFares (custom per-leg walk-in)");
{
  const legs = resolveAdultLegFares({
    isRoundTrip: true,
    outboundOneWayCents: 120_000,
    outboundRoundTripCents: 120_000,
    returnOneWayCents: 130_000,
    returnRoundTripCents: 130_000,
    customPerLeg: true,
  });
  assert(legs.unitAdultCents === 250_000, "custom RT sums both directions");
}

console.log("\none-way");
{
  const legs = resolveAdultLegFares({
    isRoundTrip: false,
    outboundOneWayCents: PACKAGE,
    outboundRoundTripCents: 0,
  });
  assert(legs.unitAdultCents === PACKAGE, "OW unit = one-way price");
  assert(legs.unitAdultCents * 2 === 399_800, "2 adults OW = $3998");
}

console.log("\ncharter product path parity");
{
  const split = splitRoundTripPackageCents(PACKAGE);
  const unit = split.outboundCents + split.returnCents;
  assert(unit === PACKAGE, "charter split reconstitutes package");
  assert(unit * 2 === 399_800, "charter × 2 adults = $3998");
}

console.log("\nparty fare helper");
{
  const total = partyFareCents({
    adultUnitFareCents: PACKAGE,
    adults: 2,
    children: 0,
    infants: 0,
  });
  assert(total === 399_800, "partyFareCents 2 adults");
}

console.log("\ninvoice line items for 2 adults @ $1999 RT");
{
  const airfareCents = PACKAGE * 2;
  const data = {
    bookingRef: "LBG-TEST",
    ticketNumber: "T1",
    accessToken: "x",
    createdAt: new Date(),
    status: "confirmed",
    seatsBooked: 2,
    fareReleaseName: "Economy",
    paymentMethod: "cash",
    amountPaidCents: airfareCents,
    serviceFeeCents: 0,
    tripType: "round_trip",
    passengerName: "A One",
    email: "a@example.com",
    passengers: [
      {
        fullName: "A One",
        email: "a@example.com",
        phone: "",
        passportNumber: "",
        nationality: "",
        ticketNumber: "T1",
        passengerType: "adult",
        priceCents: PACKAGE,
        allocatesSeat: true,
      },
      {
        fullName: "B Two",
        email: "",
        phone: "",
        passportNumber: "",
        nationality: "",
        ticketNumber: "T2",
        passengerType: "adult",
        priceCents: PACKAGE,
        allocatesSeat: true,
      },
    ],
    flight: {
      airline: "Drukair",
      flightNumber: "KB123",
      origin: "PER",
      destination: "PBH",
      departureAt: new Date("2026-09-01T02:00:00Z"),
      arrivalAt: new Date("2026-09-01T10:00:00Z"),
      cabinClass: "economy",
    },
    returnFlight: {
      airline: "Drukair",
      flightNumber: "KB124",
      origin: "PBH",
      destination: "PER",
      departureAt: new Date("2026-09-10T02:00:00Z"),
      arrivalAt: new Date("2026-09-10T10:00:00Z"),
      cabinClass: "economy",
    },
    invoice: {
      invoiceNumber: "INV-1",
      amountCents: airfareCents,
      fareCents: airfareCents,
      serviceFeeCents: 0,
      airfareCents,
      airportTaxesCents: 0,
      extraBaggageCents: 0,
      travelInsuranceCents: 0,
      otherChargesCents: 0,
      gstRateBps: 0,
      gstIncluded: false,
      gstOverrideCents: 0,
      accountNumber: "1",
      businessTpn: "1",
      routeLabel: "PER-PBH",
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
      customerName: "A One",
      customerEmail: "a@example.com",
      customerPhone: "",
      customerAddress: "",
      pdfBlobUrl: null,
    },
  } as BookingDocumentData;

  const html = renderAirfareInvoiceHtml(data);
  assert(html.includes("Airfare — Adult — A One"), "adult 1 line present");
  assert(html.includes("Airfare — Adult — B Two"), "adult 2 line present");
  assert(!html.includes("7,996") && !html.includes("$7996"), "invoice not $7996");
  assert(html.includes("$1,999") || html.includes("$1999"), "shows $1999 unit fare");
  assert(html.includes("$3,998") || html.includes("$3998"), "shows $3998 total");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
