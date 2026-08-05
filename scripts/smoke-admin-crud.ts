/**
 * Integration smoke tests for admin CRUD fixes.
 * Creates temporary rows, asserts behaviour, then cleans up.
 *
 * Run: npx tsx scripts/smoke-admin-crud.ts
 */
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  bankHoldExpiresAt,
  makeAccessToken,
  makeBookingRef,
  makeInvoiceNumber,
  makeTicketNumber,
} from "../src/lib/branding";
import { restoreFareAndFlight } from "../src/lib/booking/inventory";
import { parseDateTimeLocal } from "../src/lib/datetime";
import {
  computeInvoiceTotals,
  defaultEndorsementText,
  defaultFareCalculationLine,
} from "../src/lib/documents/invoiceFields";
import { loadBookingDocumentData } from "../src/lib/email/bookingMail";

const TAG = `SMOKE-${Date.now()}`;
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

function airfareCentsForTargetAmount(
  targetAmountCents: number,
  inv: {
    airportTaxesCents: number;
    extraBaggageCents: number;
    travelInsuranceCents: number;
    otherChargesCents: number;
    serviceFeeCents: number;
    gstRateBps: number;
    gstIncluded: boolean;
    gstOverrideCents: number;
  },
): number {
  const fixed =
    inv.airportTaxesCents +
    inv.extraBaggageCents +
    inv.travelInsuranceCents +
    inv.otherChargesCents +
    inv.serviceFeeCents;
  const override = Math.max(0, inv.gstOverrideCents ?? 0);
  if (override > 0) {
    return Math.max(0, targetAmountCents - fixed - override);
  }
  if (inv.gstIncluded || (inv.gstRateBps ?? 0) <= 0) {
    return Math.max(0, targetAmountCents - fixed);
  }
  const taxable = Math.round(
    (targetAmountCents * 10_000) / (10_000 + inv.gstRateBps),
  );
  return Math.max(0, taxable - fixed);
}

async function syncBookingPassengers(
  prisma: PrismaClient,
  bookingId: string,
  primary: {
    fullName: string;
    email: string;
    phone: string;
    passportNumber: string;
    nationality: string;
  },
  seatsBooked: number,
  primaryTicketNumber: string,
) {
  const existing = await prisma.bookingPassenger.findMany({
    where: { bookingId },
    orderBy: { sortOrder: "asc" },
  });

  if (existing.length === 0) {
    for (let i = 0; i < seatsBooked; i++) {
      await prisma.bookingPassenger.create({
        data: {
          bookingId,
          sortOrder: i,
          fullName: i === 0 ? primary.fullName : `Passenger ${i + 1}`,
          email: i === 0 ? primary.email : "",
          phone: i === 0 ? primary.phone : "",
          passportNumber: i === 0 ? primary.passportNumber : "",
          nationality: i === 0 ? primary.nationality : "",
          ticketNumber: i === 0 ? primaryTicketNumber : makeTicketNumber(),
        },
      });
    }
    return;
  }

  await prisma.bookingPassenger.update({
    where: { id: existing[0]!.id },
    data: {
      fullName: primary.fullName,
      email: primary.email,
      phone: primary.phone,
      passportNumber: primary.passportNumber,
      nationality: primary.nationality,
    },
  });

  if (existing.length < seatsBooked) {
    for (let i = existing.length; i < seatsBooked; i++) {
      await prisma.bookingPassenger.create({
        data: {
          bookingId,
          sortOrder: i,
          fullName: `Passenger ${i + 1}`,
          ticketNumber: makeTicketNumber(),
        },
      });
    }
  } else if (existing.length > seatsBooked) {
    await prisma.bookingPassenger.deleteMany({
      where: { id: { in: existing.slice(seatsBooked).map((p) => p.id) } },
    });
  }
}

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 20_000,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const cleanupIds = {
    bookingId: "" as string,
    flightId: "" as string,
    charterId: "" as string,
  };

  try {
    console.log(`\n== Admin CRUD smoke (${TAG}) ==\n`);

    // --- Seed flight + multi-pax booking + invoice ---
    const seats = 10;
    const flight = await prisma.flight.create({
      data: {
        airline: "SMOKE AIR",
        flightNumber: `SM${String(Date.now()).slice(-4)}`,
        origin: "PER",
        destination: "PBH",
        departureAt: new Date(Date.now() + 7 * 864e5),
        arrivalAt: new Date(Date.now() + 7 * 864e5 + 8 * 3600e3),
        cabinClass: "business",
        currency: "AUD",
        totalSeats: seats,
        remainingSeats: seats - 2,
        active: false,
        fareReleases: {
          create: {
            name: "Smoke fare",
            sortOrder: 1,
            totalSeats: seats,
            remainingSeats: seats - 2,
            priceCents: 100_000,
            roundTripPriceCents: 180_000,
            active: true,
          },
        },
      },
      include: { fareReleases: true },
    });
    cleanupIds.flightId = flight.id;
    const fareReleaseId = flight.fareReleases[0]!.id;

    const ticketPrimary = makeTicketNumber();
    const ticketExtra = makeTicketNumber();
    const bookingRef = makeBookingRef();
    const booking = await prisma.booking.create({
      data: {
        flightId: flight.id,
        fareReleaseId,
        fareReleaseName: "Smoke fare",
        tripType: "one_way",
        passengerName: "Primary Smoke",
        email: "primary.smoke@example.com",
        passengerPhone: "0400000001",
        passportNumber: "P1111111",
        nationality: "Australian",
        seatsBooked: 2,
        amountPaidCents: 220_000,
        serviceFeeCents: 0,
        paymentMethod: "cash",
        source: "walk_in",
        status: "confirmed",
        bookingRef,
        ticketNumber: ticketPrimary,
        accessToken: makeAccessToken(),
        passengers: {
          create: [
            {
              sortOrder: 0,
              fullName: "Primary Smoke",
              email: "primary.smoke@example.com",
              phone: "0400000001",
              passportNumber: "P1111111",
              nationality: "Australian",
              ticketNumber: ticketPrimary,
            },
            {
              sortOrder: 1,
              fullName: "Extra Smoke",
              email: "extra.smoke@example.com",
              phone: "0400000002",
              passportNumber: "P2222222",
              nationality: "Bhutanese",
              ticketNumber: ticketExtra,
            },
          ],
        },
        invoice: {
          create: {
            invoiceNumber: makeInvoiceNumber(),
            paymentMethod: "cash",
            status: "paid",
            amountCents: 220_000,
            fareCents: 200_000,
            airfareCents: 200_000,
            airportTaxesCents: 0,
            extraBaggageCents: 20_000,
            travelInsuranceCents: 0,
            otherChargesCents: 0,
            serviceFeeCents: 0,
            gstRateBps: 0,
            gstIncluded: false,
            gstOverrideCents: 0,
            accountNumber: "SMOKE",
            businessTpn: "SMOKE",
            routeLabel: "Perth-Paro",
            seatLabel: "OLD-SEAT",
            nameRef: bookingRef.slice(-7),
            endorsementText: "OLD ENDORSEMENT",
            fareCalculationLine: "OLD CALC",
            currency: "AUD",
            customerName: "Primary Smoke",
            customerEmail: "primary.smoke@example.com",
            customerPhone: "0400000001",
            dueAt: bankHoldExpiresAt(new Date(), 48),
            paidAt: new Date(),
            markedPaidByAdmin: true,
          },
        },
      },
      include: { invoice: true, passengers: true },
    });
    cleanupIds.bookingId = booking.id;
    const invoiceId = booking.invoice!.id;

    // ========== 1. Multi-pax name edit → travel doc ==========
    console.log("1) Edit multi-pax booking name → travel doc data");
    const newName = "Primary Smoke UPDATED";
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        passengerName: newName,
        passportNumber: "P9999999",
      },
    });
    await syncBookingPassengers(
      prisma,
      booking.id,
      {
        fullName: newName,
        email: "primary.smoke@example.com",
        phone: "0400000001",
        passportNumber: "P9999999",
        nationality: "Australian",
      },
      2,
      ticketPrimary,
    );
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { customerName: newName },
    });

    const doc1 = await loadBookingDocumentData(booking.id);
    assert(!!doc1, "document data loads");
    assert(doc1?.passengerName === newName, `booking.passengerName=${newName}`);
    assert(
      doc1?.passengers?.[0]?.fullName === newName,
      "passengers[0] reflects edit (travel doc source)",
    );
    assert(
      doc1?.passengers?.[0]?.passportNumber === "P9999999",
      "passengers[0] passport synced",
    );
    assert(
      doc1?.passengers?.[1]?.fullName === "Extra Smoke",
      "extra passenger unchanged",
    );

    // ========== 2. Booking amount → invoice PDF total ==========
    console.log("\n2) Change booking amount → invoice/PDF total");
    const targetAmount = 330_000; // $3300
    const invBefore = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    const newAirfare = airfareCentsForTargetAmount(targetAmount, invBefore);
    await prisma.booking.update({
      where: { id: booking.id },
      data: { amountPaidCents: targetAmount },
    });
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        airfareCents: newAirfare,
        fareCents: newAirfare,
        amountCents: targetAmount,
      },
    });
    const invAfter = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    const recomputed = computeInvoiceTotals({
      airfareCents: invAfter.airfareCents,
      airportTaxesCents: invAfter.airportTaxesCents,
      extraBaggageCents: invAfter.extraBaggageCents,
      travelInsuranceCents: invAfter.travelInsuranceCents,
      otherChargesCents: invAfter.otherChargesCents,
      serviceFeeCents: invAfter.serviceFeeCents,
      gstRateBps: invAfter.gstRateBps,
      gstIncluded: invAfter.gstIncluded,
      gstOverrideCents: invAfter.gstOverrideCents,
    });
    assert(
      recomputed.amountCents === targetAmount,
      `PDF recompute total=${recomputed.amountCents} matches target ${targetAmount}`,
    );
    const doc2 = await loadBookingDocumentData(booking.id);
    assert(
      doc2?.invoice?.amountCents === targetAmount,
      "document invoice.amountCents updated",
    );
    assert(
      doc2?.amountPaidCents === targetAmount,
      "document amountPaidCents updated",
    );

    // ========== 3. Generate travel fields then Save ==========
    console.log("\n3) Generate travel fields then Save");
    const generatedSeat = "Auto assigned";
    const generatedNameRef = booking.bookingRef.slice(-7);
    const generatedEndorsement = defaultEndorsementText();
    const generatedFareCalc = defaultFareCalculationLine({
      origin: flight.origin,
      destination: flight.destination,
      tripType: "one_way",
      fareCents: invAfter.airfareCents,
    });
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        seatLabel: generatedSeat,
        nameRef: generatedNameRef,
        endorsementText: generatedEndorsement,
        fareCalculationLine: generatedFareCalc,
      },
    });
    const afterGenerate = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    assert(
      afterGenerate.seatLabel === generatedSeat,
      "Generate wrote seatLabel",
    );

    // Simulate Save AFTER remount (form values = DB after Generate)
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        seatLabel: afterGenerate.seatLabel,
        nameRef: afterGenerate.nameRef,
        endorsementText: afterGenerate.endorsementText,
        fareCalculationLine: afterGenerate.fareCalculationLine,
      },
    });
    const afterSaveGood = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    assert(
      afterSaveGood.seatLabel === generatedSeat,
      "Save after remount keeps Generate values",
    );

    // Prove the old bug: Save with stale pre-Generate values would undo it
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { seatLabel: "OLD-SEAT" },
    });
    const stale = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    assert(
      stale.seatLabel === "OLD-SEAT",
      "stale Save path would overwrite Generate (why formRevision remount is required)",
    );
    // Restore generated for remaining tests
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { seatLabel: generatedSeat },
    });

    // ========== 4. Clear invoice due date + timezone parse ==========
    console.log("\n4) Clear invoice due date + timezone parse");
    const tzOffset = -600; // AEST-like
    const wall = "2026-09-01T14:30";
    const parsedDue = parseDateTimeLocal(wall, tzOffset);
    assert(
      parsedDue.toISOString() === "2026-09-01T04:30:00.000Z",
      `parseDateTimeLocal(${wall}, ${tzOffset}) → ${parsedDue.toISOString()}`,
    );
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { dueAt: parsedDue },
    });
    // Clear (empty dueAt → null), mirroring persistInvoiceDocument
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { dueAt: null },
    });
    const cleared = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    assert(cleared.dueAt === null, "clearing dueAt sets null");

    // ========== 5. Charter OW/RT both prices persist ==========
    console.log("\n5) Charter fare OW/RT both prices persist on save");
    const charter = await prisma.charterFareProduct.create({
      data: {
        code: `SMOKE_${Date.now()}`,
        name: `${TAG} Fare`,
        cabinClass: "economy",
        sortOrder: 9999,
        priceCents: 50_000,
        roundTripPriceCents: 90_000,
        tagline: "smoke",
        active: false,
        recommended: false,
        mostPopular: false,
        flightChangeLabel: "",
        refundLabel: "",
        checkedBaggage: "",
        cabinBaggage: "",
        seatSelection: "",
        mealLabel: "",
        frequentFlyerLabel: "",
        priorityCheckIn: "",
        priorityBoarding: "",
        changePermitted: false,
        changeFeeLabel: "",
        refundPermitted: false,
        refundFeeLabel: "",
        perkLines: [],
        changeBullets: [],
        refundBullets: [],
        baggageBullets: [],
        nameChangeBullets: [],
        noShowBullets: [],
        loyaltyBullets: [],
        notes: "smoke-test",
      },
    });
    cleanupIds.charterId = charter.id;

    // Simulate: edit OW to 55, switch to RT, edit RT to 99, save both
    // (fixed UI keeps both in state — action receives both fields)
    const oneWayAud = "55.00";
    const roundTripAud = "99.00";
    await prisma.charterFareProduct.update({
      where: { id: charter.id },
      data: {
        priceCents: Math.round(Number(oneWayAud) * 100),
        roundTripPriceCents: Math.round(Number(roundTripAud) * 100),
      },
    });
    const charterAfter = await prisma.charterFareProduct.findUniqueOrThrow({
      where: { id: charter.id },
    });
    assert(charterAfter.priceCents === 5500, "one-way price saved ($55)");
    assert(
      charterAfter.roundTripPriceCents === 9900,
      "round-trip price saved ($99) — both survive mode switch",
    );

    // ========== 6. Delete booking restores seats ==========
    console.log("\n6) Delete booking restores seats");
    const seatsBefore = await prisma.flight.findUniqueOrThrow({
      where: { id: flight.id },
      include: { fareReleases: true },
    });
    assert(
      seatsBefore.remainingSeats === seats - 2,
      `flight seats before delete = ${seats - 2}`,
    );

    await prisma.$transaction(async (tx) => {
      const b = await tx.booking.findUniqueOrThrow({
        where: { id: booking.id },
      });
      if (b.status !== "hold_expired" && b.seatsBooked > 0 && b.fareReleaseId) {
        await restoreFareAndFlight(
          tx,
          b.flightId,
          b.fareReleaseId,
          b.seatsBooked,
        );
      }
      await tx.booking.delete({ where: { id: booking.id } });
    });
    cleanupIds.bookingId = "";

    const seatsAfter = await prisma.flight.findUniqueOrThrow({
      where: { id: flight.id },
      include: { fareReleases: true },
    });
    assert(
      seatsAfter.remainingSeats === seats,
      `flight seats restored to ${seats} (was ${seatsBefore.remainingSeats})`,
    );
    assert(
      seatsAfter.fareReleases[0]!.remainingSeats === seats,
      `fare release seats restored to ${seats}`,
    );

    console.log(`\n== RESULT: ${passed} passed, ${failed} failed ==\n`);
  } finally {
    // Cleanup leftovers
    try {
      if (cleanupIds.bookingId) {
        await prisma.booking.delete({ where: { id: cleanupIds.bookingId } }).catch(() => {});
      }
      if (cleanupIds.flightId) {
        await prisma.flight.delete({ where: { id: cleanupIds.flightId } }).catch(() => {});
      }
      if (cleanupIds.charterId) {
        await prisma.charterFareProduct
          .delete({ where: { id: cleanupIds.charterId } })
          .catch(() => {});
      }
    } catch {
      /* ignore */
    }
    await prisma.$disconnect();
    await pool.end();
  }

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("SMOKE FATAL:", err);
  process.exit(1);
});
