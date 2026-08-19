/**
 * Refresh Extra Baggage quantity on existing invoices without changing layout,
 * line amounts, GST, identity, or other invoice fields.
 *
 * Invoice HTML/PDF is rendered live from Booking.extraBaggageKg. This script:
 *  - reports bookings that have extra bags / extra-baggage charges
 *  - clears cached Blob PDFs so the next download/email uses the current qty
 *
 * Run: npx tsx scripts/backfill-extra-baggage-qty.ts
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

  const rows = await prisma.invoice.findMany({
    where: {
      OR: [
        { extraBaggageCents: { gt: 0 } },
        { booking: { extraBaggageKg: { gt: 0 } } },
      ],
    },
    select: {
      id: true,
      bookingId: true,
      invoiceNumber: true,
      extraBaggageCents: true,
      pdfBlobUrl: true,
      pdfBlobPathname: true,
      booking: {
        select: {
          bookingRef: true,
          extraBaggageKg: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Found ${rows.length} invoice(s) with extra baggage`);

  let cleared = 0;
  let verified = 0;
  let failed = 0;

  for (const row of rows) {
    const bags = row.booking.extraBaggageKg;
    const cents = row.extraBaggageCents;
    const cached = Boolean(row.pdfBlobUrl || row.pdfBlobPathname);

    if (cached) {
      await prisma.invoice.update({
        where: { id: row.id },
        data: { pdfBlobUrl: null, pdfBlobPathname: null },
      });
      cleared += 1;
    }

    const data = await loadBookingDocumentData(row.bookingId);
    if (!data?.invoice) {
      console.log(`✗ ${row.booking.bookingRef} ${row.invoiceNumber}: no document data`);
      failed += 1;
      continue;
    }

    const html = renderAirfareInvoiceHtml(data);
    const extraLine = html.match(
      /<td>Extra Baggage<\/td>\s*<td class="num">(\d+)<\/td>/,
    );
    const qty = extraLine ? Number(extraLine[1]) : null;
    const expectedQty = cents > 0 ? Math.max(1, Math.floor(bags || 0)) : null;
    const ok = cents <= 0 || qty === expectedQty;

    console.log(
      `${ok ? "✓" : "✗"} ${row.booking.bookingRef} ${row.invoiceNumber}` +
        ` · bags=${bags} charge=${(cents / 100).toFixed(2)}` +
        ` · renderedQty=${qty ?? "none"}` +
        `${cached ? " · cache cleared" : ""}`,
    );
    if (ok) verified += 1;
    else failed += 1;
  }

  console.log(
    `\nCleared ${cleared} cached PDF(s). Verified ${verified}, failed ${failed}.`,
  );

  await prisma.$disconnect();
  await pool.end();
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
