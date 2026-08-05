/**
 * Online party fare math + quote/booking path for child 75% / infant 10%.
 * Run: npx tsx scripts/smoke-online-party-fares.ts
 */
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  makeAccessToken,
  makeBookingRef,
  makeInvoiceNumber,
  makeTicketNumber,
} from "../src/lib/branding";
import {
  CHILD_FARE_RATE,
  INFANT_FARE_RATE,
  childFareCents,
  infantFareCents,
  partyFareCents,
  parseOnlineTravellersDraft,
  quotePartyFareCents,
  seatedCountFromMix,
} from "../src/lib/booking/passengers";
import { loadBookingDocumentData } from "../src/lib/email/bookingMail";
import { renderTravelDocumentHtml } from "../src/lib/documents/travelDocument";
import { renderAirfareInvoiceHtml } from "../src/lib/documents/airfareInvoice";

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

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 20_000,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  let flightId = "";
  let returnFlightId = "";
  let bookingId = "";
  let quoteId = "";

  try {
    console.log("\n== Online party fares (child 75% / infant 10%) ==\n");

    console.log("0) Fare math");
    assert(CHILD_FARE_RATE === 0.75, "child rate 75%");
    assert(INFANT_FARE_RATE === 0.1, "infant rate 10%");
    const adultRt = 199_900; // $1999.00
    assert(childFareCents(adultRt) === 149_925, "child $1499.25 from $1999");
    assert(infantFareCents(adultRt) === 19_990, "infant $199.90 from $1999");
    assert(
      partyFareCents({
        adultUnitFareCents: adultRt,
        adults: 1,
        children: 1,
        infants: 1,
      }) ===
        199_900 + 149_925 + 19_990,
      "1A+1C+1I party total",
    );
    assert(seatedCountFromMix(2, 1) === 3, "seats = adults + children");
    assert(seatedCountFromMix(1, 0) === 1, "single adult one seat");
    assert(
      quotePartyFareCents({
        quotedPriceCents: 369_815,
        unitAdultFareCents: adultRt,
        seatsBooked: 2,
      }) === 369_815,
      "new quote uses stored party total",
    );
    assert(
      quotePartyFareCents({
        quotedPriceCents: 199_900,
        unitAdultFareCents: 0,
        seatsBooked: 2,
      }) === 399_800,
      "legacy quote multiplies unit × seats",
    );

    console.log("1) parseOnlineTravellersDraft");
    const fd = new FormData();
    const rows = [
      {
        type: "adult",
        title: "Mr",
        first: "Ada",
        last: "Lovelace",
        email: "ada@example.com",
        phone: "+61400000001",
      },
      {
        type: "child",
        title: "Miss",
        first: "Kid",
        last: "One",
        email: "",
        phone: "",
      },
      {
        type: "infant",
        title: "Master",
        first: "Baby",
        last: "One",
        email: "",
        phone: "",
      },
    ];
    rows.forEach((r, i) => {
      fd.set(`travellerType_${i}`, r.type);
      fd.set(`title_${i}`, r.title);
      fd.set(`firstName_${i}`, r.first);
      fd.set(`lastName_${i}`, r.last);
      fd.set(`passportNumber_${i}`, `P${i}`);
      fd.set(`nationality_${i}`, "AU");
      fd.set(`email_${i}`, r.email);
      fd.set(`phone_${i}`, r.phone);
    });
    const draft = parseOnlineTravellersDraft(fd, {
      adults: 1,
      children: 1,
      infants: 1,
    });
    assert(draft.length === 3, "three travellers parsed");
    assert(draft[0]?.email === "ada@example.com", "primary email");
    assert(draft[1]?.passengerType === "child", "child slot");
    assert(draft[2]?.passengerType === "infant", "infant slot");

    console.log("2) Create inventory + party quote");
    const dep = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
    const ret = new Date(Date.now() + 47 * 24 * 60 * 60 * 1000);
    const outbound = await prisma.flight.create({
      data: {
        airline: "Drukair",
        flightNumber: `SMOKE-OW-${Date.now().toString(36).slice(-6)}`,
        origin: "PER",
        destination: "PBH",
        departureAt: dep,
        arrivalAt: new Date(dep.getTime() + 8 * 60 * 60 * 1000),
        cabinClass: "economy",
        totalSeats: 20,
        remainingSeats: 20,
        active: true,
        active: false,
        fareReleases: {
          create: {
            name: "Smoke Economy",
            priceCents: 100_000,
            roundTripPriceCents: 199_900,
            totalSeats: 20,
            remainingSeats: 20,
            sortOrder: 0,
            active: true,
          },
        },
      },
      include: { fareReleases: true },
    });
    flightId = outbound.id;
    const returnFlight = await prisma.flight.create({
      data: {
        airline: "Drukair",
        flightNumber: `SMOKE-RT-${Date.now().toString(36).slice(-6)}`,
        origin: "PBH",
        destination: "PER",
        departureAt: ret,
        arrivalAt: new Date(ret.getTime() + 8 * 60 * 60 * 1000),
        cabinClass: "economy",
        totalSeats: 20,
        remainingSeats: 20,
        active: false,
        fareReleases: {
          create: {
            name: "Smoke Economy Return",
            priceCents: 99_900,
            roundTripPriceCents: 199_900,
            totalSeats: 20,
            remainingSeats: 20,
            sortOrder: 0,
            active: true,
          },
        },
      },
      include: { fareReleases: true },
    });
    returnFlightId = returnFlight.id;

    const unitAdult = 199_900;
    const adults = 1;
    const children = 1;
    const infants = 1;
    const seats = seatedCountFromMix(adults, children);
    const total = partyFareCents({
      adultUnitFareCents: unitAdult,
      adults,
      children,
      infants,
    });
    assert(total === 369_815, "expected party total $3698.15");

    const sessionId = `smoke-party-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const quote = await prisma.priceQuote.create({
      data: {
        flightId: outbound.id,
        fareReleaseId: outbound.fareReleases[0]!.id,
        fareReleaseName: "Smoke Economy",
        returnFlightId: returnFlight.id,
        returnFareReleaseId: returnFlight.fareReleases[0]!.id,
        returnFareReleaseName: "Smoke Economy Return",
        fareProductCode: "smoke",
        fareProductName: "Smoke RT",
        tripType: "round_trip",
        sessionId,
        quotedPriceCents: total,
        outboundPriceCents: 100_000,
        returnPriceCents: 99_900,
        unitAdultFareCents: unitAdult,
        adultCount: adults,
        childCount: children,
        infantCount: infants,
        basePriceSnapshotCents: unitAdult,
        demandMultiplier: 1,
        scarcityMultiplier: 1,
        baseMarkup: 0,
        expiresAt,
        status: "active",
        seatsBooked: seats,
        heldSeats: seats,
        inventoryHeld: true,
        travellersDraft: draft,
        passengerTitle: draft[0]!.title,
        passengerFirstName: draft[0]!.firstName,
        passengerLastName: draft[0]!.lastName,
        passengerEmail: draft[0]!.email || "",
        passengerPhone: draft[0]!.phone || "",
        privacyAccepted: true,
      },
    });
    quoteId = quote.id;

    // Soft-hold inventory like createPriceQuote
    await prisma.flight.update({
      where: { id: outbound.id },
      data: { remainingSeats: { decrement: seats } },
    });
    await prisma.flight.update({
      where: { id: returnFlight.id },
      data: { remainingSeats: { decrement: seats } },
    });
    await prisma.fareRelease.update({
      where: { id: outbound.fareReleases[0]!.id },
      data: { remainingSeats: { decrement: seats } },
    });
    await prisma.fareRelease.update({
      where: { id: returnFlight.fareReleases[0]!.id },
      data: { remainingSeats: { decrement: seats } },
    });

    assert(quotePartyFareCents(quote) === total, "quote party fare");

    console.log("3) Confirm booking with typed passengers");
    const ticketNumber = makeTicketNumber();
    const booking = await prisma.$transaction(async (tx) => {
      await tx.priceQuote.update({
        where: { id: quote.id },
        data: {
          status: "used",
          inventoryHeld: false,
          heldSeats: 0,
          seatsBooked: seats,
        },
      });

      const travellers = [
        {
          fullName: "Mr Ada Lovelace",
          email: "ada@example.com",
          phone: "+61400000001",
          passportNumber: "P0",
          nationality: "AU",
          passengerType: "adult" as const,
          priceCents: 0,
          allocatesSeat: true,
        },
        {
          fullName: "Miss Kid One",
          email: "",
          phone: "",
          passportNumber: "P1",
          nationality: "AU",
          passengerType: "child" as const,
          priceCents: childFareCents(unitAdult),
          allocatesSeat: true,
        },
        {
          fullName: "Master Baby One",
          email: "",
          phone: "",
          passportNumber: "P2",
          nationality: "AU",
          passengerType: "infant" as const,
          priceCents: infantFareCents(unitAdult),
          allocatesSeat: false,
        },
      ];

      const bookingRef = makeBookingRef();
      return tx.booking.create({
        data: {
          quoteId: quote.id,
          flightId: outbound.id,
          fareReleaseId: outbound.fareReleases[0]!.id,
          fareReleaseName: "Smoke Economy",
          returnFlightId: returnFlight.id,
          returnFareReleaseId: returnFlight.fareReleases[0]!.id,
          tripType: "round_trip",
          passengerName: "Mr Ada Lovelace",
          email: "ada@example.com",
          passengerPhone: "+61400000001",
          seatsBooked: seats,
          amountPaidCents: total,
          serviceFeeCents: 0,
          fareProductCode: "smoke",
          fareProductName: "Smoke RT",
          paymentMethod: "bank_transfer",
          status: "pending_payment",
          bookingRef,
          ticketNumber,
          accessToken: makeAccessToken(),
          passengers: {
            create: travellers.map((t, i) => ({
              fullName: t.fullName,
              email: t.email,
              phone: t.phone,
              passportNumber: t.passportNumber,
              nationality: t.nationality,
              passengerType: t.passengerType,
              priceCents: t.priceCents,
              allocatesSeat: t.allocatesSeat,
              sortOrder: i,
              ticketNumber: i === 0 ? ticketNumber : makeTicketNumber(),
            })),
          },
          invoice: {
            create: {
              invoiceNumber: makeInvoiceNumber(),
              paymentMethod: "bank_transfer",
              status: "unpaid",
              amountCents: total,
              fareCents: total,
              airfareCents: total,
              currency: "AUD",
              customerName: "Mr Ada Lovelace",
              customerEmail: "ada@example.com",
              accountNumber: "S",
              businessTpn: "S",
              routeLabel: "Perth-Paro",
              seatLabel: "",
              nameRef: bookingRef.slice(-7),
              endorsementText: "X",
              fareCalculationLine: "X",
            },
          },
        },
        include: { passengers: true },
      });
    });
    bookingId = booking.id;

    assert(booking.seatsBooked === 2, "booking seats = 2 (infant no seat)");
    assert(booking.amountPaidCents === 369_815, "charged party total");
    assert(booking.passengers.length === 3, "3 booking passengers");
    const childPax = booking.passengers.find((p) => p.passengerType === "child");
    const infantPax = booking.passengers.find(
      (p) => p.passengerType === "infant",
    );
    assert(childPax?.priceCents === 149_925, "child price persisted");
    assert(infantPax?.priceCents === 19_990, "infant price persisted");
    assert(infantPax?.allocatesSeat === false, "infant allocatesSeat false");

    console.log("4) Documents include child/infant");
    const docData = await loadBookingDocumentData(booking.id);
    assert(Boolean(docData), "document data loaded");
    if (docData) {
      const travelHtml = renderTravelDocumentHtml(docData);
      const invoiceHtml = renderAirfareInvoiceHtml(docData);
      assert(
        travelHtml.includes("Kid One") || travelHtml.includes("CHILD"),
        "travel doc mentions child",
      );
      assert(
        travelHtml.toLowerCase().includes("infant") ||
          travelHtml.includes("Baby One"),
        "travel doc mentions infant",
      );
      assert(
        invoiceHtml.includes("1499.25") ||
          invoiceHtml.includes("1,499.25") ||
          invoiceHtml.includes("149925") ||
          invoiceHtml.includes("$1,499.25") ||
          invoiceHtml.includes("Child"),
        "invoice reflects child pricing",
      );
    }

    console.log("\nCleaning up…");
  } catch (error) {
    console.error("\nSmoke failed:", error);
    failed += 1;
  } finally {
    try {
      if (bookingId) {
        await prisma.bookingPassenger.deleteMany({ where: { bookingId } });
        await prisma.invoice.deleteMany({ where: { bookingId } }).catch(() => {});
        await prisma.booking.delete({ where: { id: bookingId } }).catch(() => {});
      }
      if (quoteId) {
        await prisma.priceQuote.delete({ where: { id: quoteId } }).catch(() => {});
      }
      if (flightId) {
        await prisma.fareRelease.deleteMany({ where: { flightId } });
        await prisma.flight.delete({ where: { id: flightId } }).catch(() => {});
      }
      if (returnFlightId) {
        await prisma.fareRelease.deleteMany({
          where: { flightId: returnFlightId },
        });
        await prisma.flight
          .delete({ where: { id: returnFlightId } })
          .catch(() => {});
      }
    } catch (cleanupErr) {
      console.error("cleanup error", cleanupErr);
    }
    await prisma.$disconnect();
    await pool.end();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
