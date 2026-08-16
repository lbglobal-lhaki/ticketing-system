/**
 * Snapshots every table to a timestamped JSON file so a destructive change
 * (schema migration, wipe + reseed) can be reviewed or hand-restored later.
 *
 * Not a substitute for pg_dump — it captures rows, not sequences/indexes — but
 * it needs no Postgres client binaries and keeps the data readable.
 *
 * Run: npx tsx scripts/backup-db-json.ts [label]
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { prisma } from "../src/lib/db";

async function main() {
  const label = process.argv[2] || "backup";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(process.cwd(), "backups");
  mkdirSync(outDir, { recursive: true });

  const tables = {
    flights: () => prisma.flight.findMany(),
    fareReleases: () => prisma.fareRelease.findMany(),
    bookings: () => prisma.booking.findMany(),
    bookingPassengers: () => prisma.bookingPassenger.findMany(),
    invoices: () => prisma.invoice.findMany(),
    priceQuotes: () => prisma.priceQuote.findMany(),
    demandEvents: () => prisma.demandEvent.findMany(),
    charterFareProducts: () => prisma.charterFareProduct.findMany(),
    cargoSubmissions: () => prisma.cargoSubmission.findMany(),
    deletedRecords: () => prisma.deletedRecord.findMany(),
  };

  const dump: Record<string, unknown[]> = {};
  for (const [name, load] of Object.entries(tables)) {
    try {
      const rows = await load();
      dump[name] = rows;
      console.log(`  ${name}: ${rows.length}`);
    } catch (e) {
      console.warn(
        `  ! ${name}: skipped (${e instanceof Error ? e.message : String(e)})`,
      );
    }
  }

  const file = path.join(outDir, `${label}-${stamp}.json`);
  writeFileSync(file, JSON.stringify(dump, null, 2));
  console.log(`\nwrote ${file}`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
