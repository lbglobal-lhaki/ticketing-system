/**
 * Clear cached invoice PDFs and verify the current invoice template renders
 * for existing bookings (multi-page A4 with header/footer).
 *
 * Run: npx tsx scripts/backfill-invoice-template.ts
 */
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { loadBookingDocumentData } from "../src/lib/email/bookingMail";
import { renderAirfareInvoiceHtml } from "../src/lib/documents/airfareInvoice";

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 20_000,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const cleared = await prisma.invoice.updateMany({
    where: {
      OR: [{ pdfBlobUrl: { not: null } }, { pdfBlobPathname: { not: null } }],
    },
    data: { pdfBlobUrl: null, pdfBlobPathname: null },
  });
  console.log(`Cleared ${cleared.count} cached invoice PDF pointer(s)`);

  const bookings = await prisma.booking.findMany({
    where: { invoice: { isNot: null } },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      bookingRef: true,
      seatsBooked: true,
      _count: { select: { passengers: true } },
    },
  });

  let ok = 0;
  let fail = 0;
  for (const b of bookings) {
    const data = await loadBookingDocumentData(b.id);
    if (!data?.invoice) {
      console.log(`✗ ${b.bookingRef}: no invoice document data`);
      fail += 1;
      continue;
    }
    const html = renderAirfareInvoiceHtml(data);
    const pages = (html.match(/class="page"/g) || []).length;
    const headers = (html.match(/class="header-img"|class="topbar-fallback"/g) || [])
      .length;
    const footers = (html.match(/class="footer"/g) || []).length;
    const hasItems = html.includes("table") && html.includes("Item");
    const good =
      pages >= 1 && headers === pages && footers === pages && hasItems;
    console.log(
      `${good ? "✓" : "✗"} ${b.bookingRef} · pax=${data.passengers.length} seats=${b.seatsBooked} · pages=${pages} hdr=${headers} ftr=${footers}`,
    );
    if (good) ok += 1;
    else fail += 1;
  }

  console.log(`\nVerified ${ok} invoice(s), ${fail} failed`);
  await prisma.$disconnect();
  await pool.end();
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
