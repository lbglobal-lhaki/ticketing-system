/**
 * One-off maintenance script — wipes every existing Flight (and any
 * bookings/invoices still attached to them, recorded to DeletedRecord first,
 * same as the admin "Delete flight" action) and replaces them with the fixed
 * monthly PBH⇄PER charter schedule:
 *
 *   Outbound KB920  PBH→PER  22nd of month, dep 09:00, arr 00:25 (+1 day)
 *   Return   KB921  PER→PBH  23rd of month, dep 01:25, arr 10:35
 *
 * Repeated every month from Oct 2026 through Dec 2027 inclusive, for both
 * economy and business cabins. Each outbound leg's `returnLegFlightId` is
 * set to its matching return leg so the site can offer a one-click
 * "Round trip" fare without a separate manual return search.
 *
 * Run with: npx tsx scripts/reseedCharterSchedule.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  fareTemplateForCabin,
  totalSeatsFromReleases,
} from "../src/lib/fares/templates";

if (
  process.env.NODE_ENV === "production" &&
  process.env.ALLOW_SEED !== "1"
) {
  throw new Error(
    "Refusing to reseed production without ALLOW_SEED=1 (destroys bookings/invoices).",
  );
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const CABINS = ["economy", "business"] as const;
const START = { year: 2026, month: 10 }; // October 2026 (1-indexed month)
const END = { year: 2027, month: 12 }; // December 2027 inclusive

function monthsInRange() {
  const months: { year: number; month: number }[] = [];
  let y = START.year;
  let m = START.month;
  while (y < END.year || (y === END.year && m <= END.month)) {
    months.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

/** Clock times are treated as-is (matches how the admin datetime-local form stores them). */
function utc(year: number, month: number, day: number, hour: number, minute: number) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
}

async function deleteAllFlights() {
  const flights = await prisma.flight.findMany({ include: { fareReleases: true } });
  if (flights.length === 0) return;

  const bookings = await prisma.booking.findMany({
    where: {
      OR: [
        { flightId: { in: flights.map((f) => f.id) } },
        { returnFlightId: { in: flights.map((f) => f.id) } },
      ],
    },
    include: { invoice: true },
  });

  await prisma.$transaction(
    async (tx) => {
      for (const booking of bookings) {
        if (booking.invoice) {
          await tx.deletedRecord.create({
            data: {
              entityType: "invoice",
              entityId: booking.invoice.id,
              label: booking.invoice.invoiceNumber,
              summary: "Deleted during charter schedule reseed",
              snapshot: JSON.parse(
                JSON.stringify(booking.invoice, (_k, v) =>
                  v === undefined ? null : v,
                ),
              ),
              deletedBy: "system:reseed",
            },
          });
        }
        await tx.deletedRecord.create({
          data: {
            entityType: "booking",
            entityId: booking.id,
            label: booking.bookingRef,
            summary: `${booking.passengerName} · deleted during charter schedule reseed`,
            snapshot: JSON.parse(
              JSON.stringify(booking, (_k, v) => (v === undefined ? null : v)),
            ),
            deletedBy: "system:reseed",
          },
        });
      }

      for (const flight of flights) {
        await tx.deletedRecord.create({
          data: {
            entityType: "flight",
            entityId: flight.id,
            label: `${flight.airline} ${flight.flightNumber}`,
            summary: `${flight.origin} → ${flight.destination} · deleted during charter schedule reseed`,
            snapshot: JSON.parse(
              JSON.stringify(flight, (_k, v) => (v === undefined ? null : v)),
            ),
            deletedBy: "system:reseed",
          },
        });
      }

      if (bookings.length) {
        await tx.booking.deleteMany({
          where: { id: { in: bookings.map((b) => b.id) } },
        });
      }
      await tx.demandEvent.deleteMany({});
      await tx.priceQuote.deleteMany({});
      // Clear self-referencing pairs before delete so the FK never blocks it.
      await tx.flight.updateMany({ data: { returnLegFlightId: null } });
      await tx.flight.deleteMany({});
    },
    { maxWait: 20_000, timeout: 60_000 },
  );

  console.log(
    `Deleted ${flights.length} flights, ${bookings.length} bookings (audit-logged).`,
  );
}

async function main() {
  await deleteAllFlights();

  const months = monthsInRange();
  let pairsCreated = 0;

  for (const { year, month } of months) {
    for (const cabinClass of CABINS) {
      const template = fareTemplateForCabin(cabinClass);
      const releases = template.map((t) => ({
        name: t.name,
        sortOrder: t.sortOrder,
        totalSeats: t.totalSeats,
        remainingSeats: t.totalSeats,
        priceCents: 0,
        active: true,
      }));
      const totalSeats = totalSeatsFromReleases(releases);

      const outbound = await prisma.flight.create({
        data: {
          airline: "Drukair",
          flightNumber: "KB920",
          origin: "PBH",
          destination: "PER",
          departureAt: utc(year, month, 22, 9, 0),
          arrivalAt: utc(year, month, 23, 0, 25),
          cabinClass,
          currency: "AUD",
          totalSeats,
          remainingSeats: totalSeats,
          active: true,
          fareReleases: { create: releases },
        },
      });

      const returnLeg = await prisma.flight.create({
        data: {
          airline: "Drukair",
          flightNumber: "KB921",
          origin: "PER",
          destination: "PBH",
          departureAt: utc(year, month, 23, 1, 25),
          arrivalAt: utc(year, month, 23, 10, 35),
          cabinClass,
          currency: "AUD",
          totalSeats,
          remainingSeats: totalSeats,
          active: true,
          fareReleases: { create: releases },
        },
      });

      await prisma.flight.update({
        where: { id: outbound.id },
        data: { returnLegFlightId: returnLeg.id },
      });

      pairsCreated += 1;
    }
  }

  console.log(
    `Seeded ${pairsCreated} PBH⇄PER charter pairs (${pairsCreated * 2} flights) across ${months.length} months (${START.month}/${START.year} → ${END.month}/${END.year}), economy + business, prices left at 0 for admin to set.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
