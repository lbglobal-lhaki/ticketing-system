import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { fareTemplateForCabin } from "../src/lib/fares/templates";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database");
}

if (
  process.env.NODE_ENV === "production" &&
  process.env.ALLOW_SEED !== "1"
) {
  throw new Error(
    "Refusing to seed production without ALLOW_SEED=1 (destroys bookings/invoices).",
  );
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function daysFromNow(days: number, hourUTC = 2): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUTC, 0, 0, 0);
  return d;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

/** Drukair charter demo: Perth ⇄ Paro (business cabin). */
async function main() {
  await prisma.invoice.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.priceQuote.deleteMany();
  await prisma.demandEvent.deleteMany();
  await prisma.fareRelease.deleteMany();
  await prisma.flight.deleteMany();
  await prisma.pricingConfig.deleteMany();

  // Legacy PricingConfig row kept for schema compatibility (unused by app).
  await prisma.pricingConfig.create({
    data: {
      name: "default",
      baseMarkup: 0,
      demandWindowMinutes: 45,
      quoteTtlMinutes: 15,
      maxUplift: 0,
      demandBands: [{ maxScore: 9999, multiplier: 1 }],
      scarcityBands: [{ maxRatio: 1, multiplier: 1 }],
    },
  });

  // Inventory buckets — prices are fixed admin values (charter catalogue may override online).
  // Keep release prices > 0 so createPriceQuote gates pass.
  const businessReleasePrices = [129_900, 159_900, 189_900];
  const economyReleasePrices = [89_900, 109_900, 129_900];

  // 20 schedules × 2 cabins = 40 flights, spread over ~3 months, alternating
  // direction, with varied departure hours for realistic search testing.
  const DEPARTURE_HOURS = [1, 2, 3, 5, 6, 7, 9, 11, 14, 22];
  const SCHEDULE_COUNT = 20;

  const schedules = Array.from({ length: SCHEDULE_COUNT }, (_, i) => {
    const outbound = i % 2 === 0;
    const dayOffset = 3 + i * 4; // every ~4 days, out to ~80 days ahead
    const hour = DEPARTURE_HOURS[i % DEPARTURE_HOURS.length];
    return {
      airline: "Drukair",
      flightNumber: `KB${500 + i}`,
      origin: outbound ? "PER" : "PBH",
      destination: outbound ? "PBH" : "PER",
      departureAt: daysFromNow(dayOffset, hour),
      durationHours: 9.5,
    };
  });

  const cabins = ["economy", "business"] as const;
  let created = 0;

  for (const schedule of schedules) {
    // One flight per departure carrying every cabin's buckets — cabins are
    // fare releases on the same aircraft, not separate flights.
    const releases = cabins.flatMap((cabinClass) => {
      const releasePrices =
        cabinClass === "business" ? businessReleasePrices : economyReleasePrices;
      return fareTemplateForCabin(cabinClass).map((t, i) => ({
        cabinClass,
        name: t.name,
        sortOrder: t.sortOrder,
        totalSeats: t.totalSeats,
        remainingSeats: t.totalSeats,
        priceCents: releasePrices[i] ?? releasePrices[0],
        active: true,
      }));
    });
    const totalSeats = releases.reduce((s, r) => s + r.totalSeats, 0);

    await prisma.flight.create({
      data: {
        airline: schedule.airline,
        flightNumber: schedule.flightNumber,
        origin: schedule.origin,
        destination: schedule.destination,
        departureAt: schedule.departureAt,
        arrivalAt: addHours(schedule.departureAt, schedule.durationHours),
        currency: "AUD",
        totalSeats,
        remainingSeats: totalSeats,
        active: true,
        fareReleases: { create: releases },
      },
    });
    created += 1;
  }

  console.log(
    `Seeded ${created} Drukair PER⇄PBH flights (KB500–KB${500 + SCHEDULE_COUNT - 1}), each selling economy + business`,
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
