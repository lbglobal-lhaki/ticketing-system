/**
 * Rigorous smoke tests for child / infant passengers.
 * Run: npx tsx scripts/smoke-child-infant.ts
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
import { restoreFareAndFlight } from "../src/lib/booking/inventory";
import {
  allocatesSeat,
  assertChildInfantAges,
  completedAgeYears,
  parseCompanionTravellers,
  parseDateOfBirth,
  passengerTypeFromAge,
  passengerTypeLabel,
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

function yearsAgoIso(years: number, extraDays = 20): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() - extraDays);
  return d.toISOString().slice(0, 10);
}

function childDob() {
  return yearsAgoIso(5);
}

function infantDob() {
  return yearsAgoIso(0, 120);
}

function formFromTravellers(groups: {
  extra?: Array<Record<string, string>>;
  child?: Array<Record<string, string>>;
  infant?: Array<Record<string, string>>;
}) {
  const fd = new FormData();
  for (const [prefix, rows] of Object.entries(groups)) {
    if (!rows) continue;
    for (const row of rows) {
      // Companions submit no email/phone — contact details are primary-only.
      fd.append(`${prefix}PassengerName`, row.name || "");
      fd.append(`${prefix}PassengerPassport`, row.passport || "");
      fd.append(`${prefix}PassengerNationality`, row.nationality || "");
      if (prefix === "child" || prefix === "infant") {
        fd.append(`${prefix}PassengerPriceAud`, row.price || "0");
        fd.append(
          `${prefix}PassengerDateOfBirth`,
          row.dob || (prefix === "infant" ? infantDob() : childDob()),
        );
      }
    }
  }
  return fd;
}

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 20_000,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  let flightId = "";
  let bookingId = "";

  try {
    console.log("\n== Child / infant passenger smoke ==\n");

    // --- Unit: parser ---
    console.log("0) parseCompanionTravellers");
    const parsed = parseCompanionTravellers(
      formFromTravellers({
        extra: [{ name: "Extra Adult" }],
        child: [
          {
            name: "Kid One",
            passport: "C111",
            price: "250.50",
            nationality: "AU",
          },
        ],
        infant: [
          { name: "Baby One", price: "50", passport: "I111" },
          { name: "Baby Two", price: "40.00" },
        ],
      }),
    );
    assert(parsed.adults.length === 1, "1 extra adult");
    assert(parsed.children.length === 1, "1 child");
    assert(parsed.infants.length === 2, "2 infants");
    assert(parsed.seatedCount === 2, "seatedCount = adults+children = 2");
    assert(parsed.childFareCents === 25050, "child fare $250.50");
    assert(parsed.infantFareCents === 9000, "infant fares $50+$40");
    assert(allocatesSeat("adult"), "adult allocates seat");
    assert(allocatesSeat("child"), "child allocates seat");
    assert(!allocatesSeat("infant"), "infant does not allocate seat");
    assert(passengerTypeLabel("infant") === "Infant", "label Infant");
    assert(parsed.children[0]?.dateOfBirth instanceof Date, "child dob parsed");
    assert(parsed.infants[0]?.dateOfBirth instanceof Date, "infant dob parsed");

    const ageOn = new Date("2026-08-18T12:00:00Z");
    assert(
      passengerTypeFromAge(
        completedAgeYears(parseDateOfBirth("2026-02-01"), ageOn),
      ) === "infant",
      "under 1 → infant",
    );
    assert(
      passengerTypeFromAge(
        completedAgeYears(parseDateOfBirth("2025-08-18"), ageOn),
      ) === "infant",
      "exactly 1 → infant",
    );
    assert(
      passengerTypeFromAge(
        completedAgeYears(parseDateOfBirth("2024-08-18"), ageOn),
      ) === "child",
      "exactly 2 → child",
    );
    assert(
      passengerTypeFromAge(
        completedAgeYears(parseDateOfBirth("2015-08-19"), ageOn),
      ) === "child",
      "10 years 364 days → child",
    );
    assert(
      passengerTypeFromAge(
        completedAgeYears(parseDateOfBirth("2015-08-18"), ageOn),
      ) === "child",
      "exactly 11 → child",
    );
    assert(
      passengerTypeFromAge(
        completedAgeYears(parseDateOfBirth("2014-08-18"), ageOn),
      ) === "adult",
      "exactly 12 → adult",
    );

    // Wrong type: 5-year-old cannot be an infant
    let wrongType = false;
    try {
      assertChildInfantAges(
        [
          {
            passengerType: "infant",
            dateOfBirth: parseDateOfBirth(childDob()),
            fullName: "Too Old Baby",
          },
        ],
        new Date(),
      );
    } catch {
      wrongType = true;
    }
    assert(wrongType, "5-year-old rejected as infant");

    // Reject bad child price
    let threw = false;
    try {
      parseCompanionTravellers(
        formFromTravellers({
          child: [{ name: "Bad Kid", price: "nope" }],
        }),
      );
    } catch {
      threw = true;
    }
    assert(threw, "invalid child price rejected");

    // --- Integration seed ---
    const seats = 20;
    const flight = await prisma.flight.create({
      data: {
        airline: "SMOKE AIR",
        flightNumber: `CI${String(Date.now()).slice(-4)}`,
        origin: "PER",
        destination: "PBH",
        departureAt: new Date(Date.now() + 10 * 864e5),
        arrivalAt: new Date(Date.now() + 10 * 864e5 + 8 * 3600e3),
        currency: "AUD",
        totalSeats: seats,
        remainingSeats: seats,
        active: false,
        fareReleases: {
          create: {
            cabinClass: "economy",
            name: "Smoke",
            sortOrder: 1,
            totalSeats: seats,
            remainingSeats: seats,
            priceCents: 100_000,
            roundTripPriceCents: 180_000,
            active: true,
          },
        },
      },
      include: { fareReleases: true },
    });
    flightId = flight.id;
    const fareReleaseId = flight.fareReleases[0]!.id;

    // Simulate walk-in create: 1 primary + 1 child + 1 infant
    // seatsBooked = 2, remaining should drop by 2
    console.log("\n1) Create booking with child (seat) + infant (no seat)");
    const adultFare = 100_000;
    const childPrice = 60_000;
    const infantPrice = 15_000;
    const seatsBooked = 2; // primary + child
    const airfare =
      adultFare * 1 + childPrice + infantPrice; /* custom-style breakdown */

    const tPrimary = makeTicketNumber();
    const tChild = makeTicketNumber();
    const tInfant = makeTicketNumber();
    const bookingRef = makeBookingRef();

    await prisma.flight.update({
      where: { id: flight.id },
      data: { remainingSeats: { decrement: seatsBooked } },
    });
    await prisma.fareRelease.update({
      where: { id: fareReleaseId },
      data: { remainingSeats: { decrement: seatsBooked } },
    });

    const booking = await prisma.booking.create({
      data: {
        flightId: flight.id,
        fareReleaseId,
        fareReleaseName: "Smoke",
        tripType: "one_way",
        passengerName: "Primary Adult",
        email: "primary@example.com",
        seatsBooked,
        amountPaidCents: airfare,
        paymentMethod: "cash",
        source: "walk_in",
        status: "confirmed",
        bookingRef,
        ticketNumber: tPrimary,
        accessToken: makeAccessToken(),
        passengers: {
          create: [
            {
              sortOrder: 0,
              fullName: "Primary Adult",
              email: "primary@example.com",
              passengerType: "adult",
              priceCents: 0,
              allocatesSeat: true,
              ticketNumber: tPrimary,
            },
            {
              sortOrder: 1,
              fullName: "Child Traveller",
              passportNumber: "CH123",
              passengerType: "child",
              priceCents: childPrice,
              allocatesSeat: true,
              ticketNumber: tChild,
            },
            {
              sortOrder: 2,
              fullName: "Infant Traveller",
              passportNumber: "IN123",
              passengerType: "infant",
              priceCents: infantPrice,
              allocatesSeat: false,
              ticketNumber: tInfant,
            },
          ],
        },
        invoice: {
          create: {
            invoiceNumber: makeInvoiceNumber(),
            paymentMethod: "cash",
            status: "paid",
            amountCents: airfare,
            fareCents: airfare,
            airfareCents: airfare,
            currency: "AUD",
            customerName: "Primary Adult",
            customerEmail: "primary@example.com",
            accountNumber: "S",
            businessTpn: "S",
            routeLabel: "Perth-Paro",
            seatLabel: "",
            nameRef: bookingRef.slice(-7),
            endorsementText: "X",
            fareCalculationLine: "X",
            paidAt: new Date(),
            markedPaidByAdmin: true,
          },
        },
      },
    });
    bookingId = booking.id;

    const afterCreate = await prisma.flight.findUniqueOrThrow({
      where: { id: flight.id },
    });
    assert(
      afterCreate.remainingSeats === seats - 2,
      `seats decremented by 2 (not 3) → ${afterCreate.remainingSeats}`,
    );

    const doc = await loadBookingDocumentData(booking.id);
    assert(!!doc, "document data loads");
    assert(doc!.passengers.length === 3, "3 travellers on document");
    assert(
      doc!.passengers[1]?.passengerType === "child" &&
        doc!.passengers[1]?.priceCents === childPrice,
      "child type + price on doc data",
    );
    assert(
      doc!.passengers[2]?.passengerType === "infant" &&
        doc!.passengers[2]?.allocatesSeat === false,
      "infant no-seat on doc data",
    );

    const travelHtml = renderTravelDocumentHtml(doc!);
    assert(
      travelHtml.includes("Child Traveller") && travelHtml.includes("Child"),
      "travel doc shows child",
    );
    assert(
      travelHtml.includes("Infant Traveller") &&
        travelHtml.includes("no seat"),
      "travel doc shows infant no-seat notice",
    );
    // Boarding pass block uses passenger name; infants should appear in notice not as normal pass name only
    assert(
      travelHtml.includes("Infant (no seat)"),
      "travel doc infant notice block",
    );

    const invoiceHtml = renderAirfareInvoiceHtml(doc!);
    assert(
      invoiceHtml.includes("Child") && invoiceHtml.includes("Infant"),
      "invoice lists child and infant types",
    );
    assert(
      invoiceHtml.includes("no seat"),
      "invoice marks infant as no seat",
    );

    // --- Edit: add second infant — seats unchanged ---
    console.log("\n2) Edit: add infant (no seat change)");
    await prisma.bookingPassenger.create({
      data: {
        bookingId: booking.id,
        sortOrder: 3,
        fullName: "Infant Two",
        passengerType: "infant",
        priceCents: 10_000,
        allocatesSeat: false,
        ticketNumber: makeTicketNumber(),
      },
    });
    // amount bump
    await prisma.booking.update({
      where: { id: booking.id },
      data: { amountPaidCents: airfare + 10_000 },
    });
    await prisma.invoice.update({
      where: { bookingId: booking.id },
      data: {
        amountCents: airfare + 10_000,
        airfareCents: airfare + 10_000,
        fareCents: airfare + 10_000,
        pdfBlobUrl: null,
      },
    });
    const seatsAfterInfant = await prisma.flight.findUniqueOrThrow({
      where: { id: flight.id },
    });
    assert(
      seatsAfterInfant.remainingSeats === seats - 2,
      "adding infant did not change flight seats",
    );
    const doc2 = await loadBookingDocumentData(booking.id);
    assert(doc2!.passengers.length === 4, "4 travellers after infant add");
    assert(
      doc2!.passengers.filter((p) => p.passengerType === "infant").length === 2,
      "2 infants",
    );

    // --- Edit: add child — seats +1 ---
    console.log("\n3) Edit: add child (seat +1)");
    await prisma.$transaction(async (tx) => {
      await tx.fareRelease.update({
        where: { id: fareReleaseId },
        data: { remainingSeats: { decrement: 1 } },
      });
      await tx.flight.update({
        where: { id: flight.id },
        data: { remainingSeats: { decrement: 1 } },
      });
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          seatsBooked: 3,
          amountPaidCents: airfare + 10_000 + 55_000,
        },
      });
      await tx.bookingPassenger.create({
        data: {
          bookingId: booking.id,
          sortOrder: 4,
          fullName: "Child Two",
          passengerType: "child",
          priceCents: 55_000,
          allocatesSeat: true,
          ticketNumber: makeTicketNumber(),
        },
      });
      await tx.invoice.update({
        where: { bookingId: booking.id },
        data: {
          amountCents: airfare + 10_000 + 55_000,
          airfareCents: airfare + 10_000 + 55_000,
          fareCents: airfare + 10_000 + 55_000,
          pdfBlobUrl: null,
        },
      });
    });
    const seatsAfterChild = await prisma.flight.findUniqueOrThrow({
      where: { id: flight.id },
    });
    assert(
      seatsAfterChild.remainingSeats === seats - 3,
      "adding child decremented seat",
    );
    const doc3 = await loadBookingDocumentData(booking.id);
    assert(doc3!.seatsBooked === 3, "seatsBooked = 3");
    assert(
      doc3!.passengers.filter((p) => p.passengerType === "child").length === 2,
      "2 children",
    );
    const travel3 = renderTravelDocumentHtml(doc3!);
    assert(travel3.includes("Child Two"), "travel doc has second child");

    // --- Sync-style replace via FormData path used by updateBookingAction ---
    console.log("\n4) Form sync: replace companions via parser counts");
    const syncParsed = parseCompanionTravellers(
      formFromTravellers({
        child: [{ name: "Only Child", price: "70" }],
        infant: [{ name: "Only Infant", price: "20" }],
      }),
    );
    assert(
      1 + syncParsed.seatedCount === 2,
      "edit seats would be primary+1 child = 2",
    );
    assert(syncParsed.infants[0]?.priceCents === 2000, "infant $20");

    // --- Delete restores 3 seats ---
    console.log("\n5) Delete booking restores seated count only");
    const beforeDelete = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    await prisma.$transaction(async (tx) => {
      await restoreFareAndFlight(
        tx,
        beforeDelete.flightId,
        beforeDelete.fareReleaseId,
        beforeDelete.seatsBooked,
      );
      await tx.booking.delete({ where: { id: booking.id } });
    });
    bookingId = "";
    const seatsRestored = await prisma.flight.findUniqueOrThrow({
      where: { id: flight.id },
      include: { fareReleases: true },
    });
    assert(
      seatsRestored.remainingSeats === seats,
      `flight seats fully restored to ${seats}`,
    );
    assert(
      seatsRestored.fareReleases[0]!.remainingSeats === seats,
      "fare release seats restored",
    );

    console.log(`\n== RESULT: ${passed} passed, ${failed} failed ==\n`);
  } finally {
    if (bookingId) {
      await prisma.booking.delete({ where: { id: bookingId } }).catch(() => {});
    }
    if (flightId) {
      await prisma.flight.delete({ where: { id: flightId } }).catch(() => {});
    }
    await prisma.$disconnect();
    await pool.end();
  }

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("SMOKE FATAL:", e);
  process.exit(1);
});
