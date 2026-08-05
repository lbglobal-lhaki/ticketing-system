/**
 * Backfill BookingPassenger rows for existing bookings and clear cached
 * invoice PDFs so the current invoice / e-ticket templates apply.
 *
 * Run: npx tsx scripts/backfill-booking-documents.ts
 */
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { makeTicketNumber } from "../src/lib/branding";
import {
  allocatesSeat,
  childFareCents,
  infantFareCents,
  travellerDisplayName,
  type TravellerDraft,
} from "../src/lib/booking/passengers";
import { resolveDocumentPassengers } from "../src/lib/documents/resolvePassengers";

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 20_000,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const bookings = await prisma.booking.findMany({
    include: {
      quote: true,
      invoice: { select: { id: true, invoiceNumber: true, pdfBlobUrl: true } },
      passengers: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });

  let createdRows = 0;
  let bookingsTouched = 0;
  let invoicesCleared = 0;

  for (const booking of bookings) {
    const resolved = resolveDocumentPassengers({
      booking: {
        passengerName: booking.passengerName,
        email: booking.email,
        passengerPhone: booking.passengerPhone,
        passportNumber: booking.passportNumber,
        nationality: booking.nationality,
        ticketNumber: booking.ticketNumber,
        seatsBooked: booking.seatsBooked,
      },
      stored: booking.passengers.map((p) => ({
        fullName: p.fullName,
        email: p.email,
        phone: p.phone,
        passportNumber: p.passportNumber,
        nationality: p.nationality,
        ticketNumber: p.ticketNumber,
        passengerType: p.passengerType,
        priceCents: p.priceCents,
        allocatesSeat: p.allocatesSeat,
      })),
      quote: booking.quote
        ? {
            unitAdultFareCents: booking.quote.unitAdultFareCents,
            adultCount: booking.quote.adultCount,
            childCount: booking.quote.childCount,
            infantCount: booking.quote.infantCount,
            travellersDraft: booking.quote.travellersDraft,
          }
        : null,
    });

    // Prefer quote draft types when filling missing DB rows.
    if (
      booking.quote &&
      booking.quote.unitAdultFareCents > 0 &&
      Array.isArray(booking.quote.travellersDraft)
    ) {
      const draft = booking.quote.travellersDraft as TravellerDraft[];
      const unit = booking.quote.unitAdultFareCents;
      for (let i = 0; i < resolved.length; i++) {
        const d = draft[i];
        if (!d) continue;
        if (!resolved[i]!.fullName || resolved[i]!.fullName.startsWith("Passenger") || resolved[i]!.fullName.startsWith("Child") || resolved[i]!.fullName.startsWith("Infant")) {
          const name = travellerDisplayName(d);
          if (name) resolved[i]!.fullName = name;
        }
        if (resolved[i]!.passengerType === "child" && !(resolved[i]!.priceCents > 0)) {
          resolved[i]!.priceCents = childFareCents(unit);
        }
        if (resolved[i]!.passengerType === "infant" && !(resolved[i]!.priceCents > 0)) {
          resolved[i]!.priceCents = infantFareCents(unit);
          resolved[i]!.allocatesSeat = false;
        }
      }
    }

    const needsPassengerSync =
      booking.passengers.length === 0 ||
      booking.passengers.length < resolved.length ||
      booking.passengers.some(
        (p, i) =>
          (resolved[i]?.passengerType &&
            p.passengerType !== resolved[i]?.passengerType) ||
          ((resolved[i]?.priceCents ?? 0) > 0 &&
            p.priceCents !== resolved[i]?.priceCents),
      );

    if (needsPassengerSync && resolved.length > 0) {
      // Keep existing ticket numbers where possible; mint unique ones for new rows.
      const usedTickets = new Set(
        booking.passengers.map((p) => p.ticketNumber).filter(Boolean),
      );
      usedTickets.add(booking.ticketNumber);

      await prisma.bookingPassenger.deleteMany({
        where: { bookingId: booking.id },
      });

      for (let i = 0; i < resolved.length; i++) {
        const p = resolved[i]!;
        let ticket = booking.passengers[i]?.ticketNumber || "";
        if (!ticket || (i > 0 && ticket === booking.ticketNumber && resolved.length > 1)) {
          // Primary keeps booking ticket; companions need unique tickets.
          if (i === 0) ticket = booking.ticketNumber;
          else {
            do {
              ticket = makeTicketNumber();
            } while (usedTickets.has(ticket));
          }
        }
        usedTickets.add(ticket);
        const type =
          (p.passengerType as "adult" | "child" | "infant") || "adult";
        await prisma.bookingPassenger.create({
          data: {
            bookingId: booking.id,
            sortOrder: i,
            fullName: p.fullName,
            email: p.email || "",
            phone: p.phone || "",
            passportNumber: p.passportNumber || "",
            nationality: p.nationality || "",
            passengerType: type,
            priceCents: p.priceCents || 0,
            allocatesSeat:
              p.allocatesSeat ?? allocatesSeat(type),
            ticketNumber: ticket,
          },
        });
        createdRows += 1;
      }
      bookingsTouched += 1;
      console.log(
        `  synced ${booking.bookingRef}: ${resolved.length} travellers (${resolved
          .map((p) => p.passengerType)
          .join(", ")})`,
      );
    }

    if (booking.invoice?.pdfBlobUrl || booking.invoice) {
      // Always clear cached PDF pointers so the next download uses the new template.
      if (booking.invoice) {
        await prisma.invoice.update({
          where: { id: booking.invoice.id },
          data: { pdfBlobUrl: null, pdfBlobPathname: null },
        });
        invoicesCleared += 1;
      }
    }
  }

  console.log("\nBackfill complete");
  console.log(`  bookings updated: ${bookingsTouched}`);
  console.log(`  passenger rows written: ${createdRows}`);
  console.log(`  invoice PDF caches cleared: ${invoicesCleared}`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
