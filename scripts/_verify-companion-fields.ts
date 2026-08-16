/**
 * TEMPORARY verification harness for the "remove companion email/phone" change.
 * Delete after use.
 *
 *   npx tsx scripts/_verify-companion-fields.ts seed
 *   npx tsx scripts/_verify-companion-fields.ts assert <seedJsonPath>
 *   npx tsx scripts/_verify-companion-fields.ts cleanup <seedJsonPath>
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  makeAccessToken,
  makeBookingRef,
  makeInvoiceNumber,
  makeTicketNumber,
} from "../src/lib/branding";
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

function client() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 20_000,
  });
  return { pool, prisma: new PrismaClient({ adapter: new PrismaPg(pool) }) };
}

async function seed() {
  const { pool, prisma } = client();
  const seats = 20;
  const stamp = String(Date.now()).slice(-4);

  const flight = await prisma.flight.create({
    data: {
      airline: "VERIFY AIR",
      flightNumber: `VF${stamp}`,
      origin: "PER",
      destination: "PBH",
      departureAt: new Date(Date.now() + 21 * 864e5),
      arrivalAt: new Date(Date.now() + 21 * 864e5 + 8 * 3600e3),
      currency: "AUD",
      totalSeats: seats,
      remainingSeats: seats,
      active: false, // never shown publicly
      fareReleases: {
        create: {
          cabinClass: "economy",
          name: "Verify Release",
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
  const fareReleaseId = flight.fareReleases[0]!.id;

  const tickets = [0, 1, 2, 3].map(() => makeTicketNumber());
  const bookingRef = makeBookingRef();
  const amount = 100_000 + 100_000 + 60_000 + 15_000;
  const seatsBooked = 3;

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
      fareReleaseName: "Verify Release",
      tripType: "one_way",
      passengerName: "Verify Primary",
      email: "verify.primary@example.com",
      passengerPhone: "0400000001",
      seatsBooked,
      amountPaidCents: amount,
      paymentMethod: "cash",
      source: "walk_in",
      status: "confirmed",
      bookingRef,
      ticketNumber: tickets[0]!,
      accessToken: makeAccessToken(),
      passengers: {
        create: [
          {
            sortOrder: 0,
            fullName: "Verify Primary",
            email: "verify.primary@example.com",
            phone: "0400000001",
            passengerType: "adult",
            priceCents: 0,
            allocatesSeat: true,
            ticketNumber: tickets[0]!,
          },
          {
            sortOrder: 1,
            fullName: "Verify Extra Adult",
            email: "companion.adult@example.com",
            phone: "0400000002",
            passportNumber: "EA111",
            passengerType: "adult",
            priceCents: 0,
            allocatesSeat: true,
            ticketNumber: tickets[1]!,
          },
          {
            sortOrder: 2,
            fullName: "Verify Child",
            email: "companion.child@example.com",
            phone: "0400000003",
            passportNumber: "CH111",
            passengerType: "child",
            priceCents: 60_000,
            allocatesSeat: true,
            ticketNumber: tickets[2]!,
          },
          {
            sortOrder: 3,
            fullName: "Verify Infant",
            email: "companion.infant@example.com",
            phone: "0400000004",
            passportNumber: "IN111",
            passengerType: "infant",
            priceCents: 15_000,
            allocatesSeat: false,
            ticketNumber: tickets[3]!,
          },
        ],
      },
      invoice: {
        create: {
          invoiceNumber: makeInvoiceNumber(),
          paymentMethod: "cash",
          status: "paid",
          amountCents: amount,
          fareCents: amount,
          airfareCents: amount,
          currency: "AUD",
          customerName: "Verify Primary",
          customerEmail: "verify.primary@example.com",
          accountNumber: "V",
          businessTpn: "V",
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

  console.log(
    JSON.stringify({
      flightId: flight.id,
      flightNumber: flight.flightNumber,
      bookingId: booking.id,
      bookingRef: booking.bookingRef,
    }),
  );

  await prisma.$disconnect();
  await pool.end();
}

async function assertAll(seedPath: string) {
  const seedInfo = JSON.parse(readFileSync(seedPath, "utf8"));
  const { pool, prisma } = client();

  console.log("\n== A) Existing booking edited + saved with no changes ==");
  const edited = await prisma.booking.findUniqueOrThrow({
    where: { id: seedInfo.bookingId },
    include: { passengers: { orderBy: { sortOrder: "asc" } } },
  });
  assert(edited.passengers.length === 4, "still 4 passengers after save");
  const byName = Object.fromEntries(
    edited.passengers.map((p) => [p.fullName, p]),
  );
  assert(
    byName["Verify Extra Adult"]?.email === "companion.adult@example.com",
    `extra adult email preserved → "${byName["Verify Extra Adult"]?.email}"`,
  );
  assert(
    byName["Verify Extra Adult"]?.phone === "0400000002",
    `extra adult phone preserved → "${byName["Verify Extra Adult"]?.phone}"`,
  );
  assert(
    byName["Verify Child"]?.email === "companion.child@example.com",
    `child email preserved → "${byName["Verify Child"]?.email}"`,
  );
  assert(
    byName["Verify Child"]?.phone === "0400000003",
    `child phone preserved → "${byName["Verify Child"]?.phone}"`,
  );
  assert(
    byName["Verify Infant"]?.email === "companion.infant@example.com",
    `infant email preserved → "${byName["Verify Infant"]?.email}"`,
  );
  assert(
    byName["Verify Infant"]?.phone === "0400000004",
    `infant phone preserved → "${byName["Verify Infant"]?.phone}"`,
  );
  assert(
    byName["Verify Child"]?.priceCents === 60_000 &&
      byName["Verify Infant"]?.priceCents === 15_000,
    "child/infant prices survived the save",
  );
  assert(
    byName["Verify Child"]?.passportNumber === "CH111",
    "child passport survived the save",
  );

  console.log("\n== B) Walk-in booking created through the admin form ==");
  const walkIn = await prisma.booking.findFirst({
    where: { passengerName: "Walkin Primary" },
    orderBy: { createdAt: "desc" },
    include: { passengers: { orderBy: { sortOrder: "asc" } }, invoice: true },
  });
  assert(!!walkIn, "walk-in booking was created (no validation error)");
  if (walkIn) {
    assert(walkIn.passengers.length === 4, `4 passengers → ${walkIn.passengers.length}`);
    const types = walkIn.passengers.map((p) => p.passengerType).join(",");
    assert(types === "adult,adult,child,infant", `passenger types → ${types}`);
    assert(walkIn.seatsBooked === 3, `seatsBooked = 3 (infant no seat) → ${walkIn.seatsBooked}`);
    assert(
      walkIn.passengers[0]?.email === "walkin.primary@example.com",
      "primary still stores its email",
    );
    assert(
      walkIn.passengers.slice(1).every((p) => p.email === "" && p.phone === ""),
      "companions stored with empty contact fields",
    );
    assert(
      walkIn.passengers[2]?.priceCents === 45_000 &&
        walkIn.passengers[3]?.priceCents === 12_000,
      `child $450 / infant $120 → ${walkIn.passengers[2]?.priceCents}/${walkIn.passengers[3]?.priceCents}`,
    );

    const doc = await loadBookingDocumentData(walkIn.id);
    assert(!!doc, "document data loads");
    const travel = renderTravelDocumentHtml(doc!);
    const invoice = renderAirfareInvoiceHtml(doc!);
    for (const n of [
      "Walkin Primary",
      "Walkin Extra Adult",
      "Walkin Child",
      "Walkin Infant",
    ]) {
      assert(travel.includes(n), `e-ticket lists ${n}`);
      assert(invoice.includes(n), `invoice lists ${n}`);
    }
    assert(travel.includes("Infant (no seat)"), "e-ticket marks infant no-seat");
    assert(invoice.includes("no seat"), "invoice marks infant no-seat");
    assert(!!walkIn.invoice, "invoice record created");
  }

  console.log(`\n== RESULT: ${passed} passed, ${failed} failed ==\n`);
  await prisma.$disconnect();
  await pool.end();
  if (failed > 0) process.exit(1);
}

async function cleanup(seedPath: string) {
  const seedInfo = JSON.parse(readFileSync(seedPath, "utf8"));
  const { pool, prisma } = client();

  const walkIns = await prisma.booking.findMany({
    where: { passengerName: "Walkin Primary" },
    select: { id: true, flightId: true },
  });
  for (const b of walkIns) {
    await prisma.booking.delete({ where: { id: b.id } }).catch(() => {});
    await prisma.flight.delete({ where: { id: b.flightId } }).catch(() => {});
    console.log(`deleted walk-in booking ${b.id} + its custom flight`);
  }

  await prisma.booking
    .delete({ where: { id: seedInfo.bookingId } })
    .catch(() => {});
  await prisma.flight.delete({ where: { id: seedInfo.flightId } }).catch(() => {});
  console.log(`deleted seeded booking ${seedInfo.bookingId} + flight ${seedInfo.flightNumber}`);

  const leftover = await prisma.flight.count({
    where: { airline: { in: ["VERIFY AIR", "WALKIN AIR"] } },
  });
  console.log(`leftover verify flights: ${leftover}`);

  await prisma.$disconnect();
  await pool.end();
}

const [mode, arg] = process.argv.slice(2);
const run =
  mode === "seed"
    ? seed()
    : mode === "assert"
      ? assertAll(arg!)
      : mode === "cleanup"
        ? cleanup(arg!)
        : Promise.reject(new Error("usage: seed | assert <json> | cleanup <json>"));

run.catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
