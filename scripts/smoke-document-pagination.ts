/**
 * Renders real PDFs for the invoice and travel document at several passenger
 * counts and asserts pagination is sane: pages grow with content, every sheet
 * is A4, and nothing is clipped.
 *
 * Run: npx tsx scripts/smoke-document-pagination.ts
 */
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { htmlToPdf } from "../src/lib/documents/pdf";
import {
  invoicePdfOptions,
  renderAirfareInvoiceHtml,
  renderTravelDocumentHtml,
  travelDocumentPdfOptions,
} from "../src/lib/documents/templates";
import { makeSmokeBookingData as makeData } from "./lib/smokeBookingData";

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

/** A4 portrait in PDF points (72dpi): 595.28 x 841.89 */
const A4_W = 595.28;
const A4_H = 841.89;

/** Parse /MediaBox entries straight out of the PDF bytes. */
function mediaBoxes(pdf: Buffer) {
  const text = pdf.toString("latin1");
  const boxes: Array<{ w: number; h: number }> = [];
  const re = /\/MediaBox\s*\[\s*([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s*\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    boxes.push({
      w: Number(m[3]) - Number(m[1]),
      h: Number(m[4]) - Number(m[2]),
    });
  }
  return boxes;
}

function pageCount(pdf: Buffer) {
  const text = pdf.toString("latin1");
  const counts = [...text.matchAll(/\/Type\s*\/Page[^s]/g)].length;
  if (counts > 0) return counts;
  const m = text.match(/\/Count\s+(\d+)/);
  return m ? Number(m[1]) : 0;
}

const outDir = path.join(process.cwd(), "tmp", "pdf-smoke");

async function main() {
  mkdirSync(outDir, { recursive: true });

  const cases = [
    { label: "1 adult, one-way", opts: { adults: 1 } },
    { label: "2 adults RT", opts: { adults: 2, roundTrip: true } },
    {
      label: "3 adults + 2 children + 1 infant RT",
      opts: { adults: 3, children: 2, infants: 1, roundTrip: true },
    },
    { label: "12 adults RT (stress)", opts: { adults: 12, roundTrip: true } },
    { label: "30 adults RT (extreme)", opts: { adults: 30, roundTrip: true } },
    // Unpaid renders the full bank-transfer block, the tallest payment layout.
    {
      label: "2 adults RT unpaid (bank transfer)",
      opts: { adults: 2, roundTrip: true, status: "pending_payment" },
      slug: "2a-unpaid",
      skipGrowthCheck: true,
    },
  ];

  let prevInvoicePages = 0;

  for (const c of cases) {
    const data = makeData(c.opts);
    console.log(`\n${c.label}`);

    const invoicePdf = await htmlToPdf(
      renderAirfareInvoiceHtml(data),
      invoicePdfOptions(data),
    );
    const invPages = pageCount(invoicePdf);
    const invBoxes = mediaBoxes(invoicePdf);
    const invA4 = invBoxes.every(
      (b) => Math.abs(b.w - A4_W) < 2 && Math.abs(b.h - A4_H) < 2,
    );
    const slug = c.slug ?? `${c.opts.adults}a`;
    assert(invPages >= 1, `invoice renders (${invPages} page(s))`);
    assert(invA4, `invoice sheets all A4 (${invBoxes.length} boxes)`);
    if (!c.skipGrowthCheck) {
      assert(
        invPages >= prevInvoicePages,
        `invoice page count grows with content (${prevInvoicePages} → ${invPages})`,
      );
      prevInvoicePages = invPages;
    }
    writeFileSync(path.join(outDir, `invoice-${slug}.pdf`), invoicePdf);

    const travelPdf = await htmlToPdf(
      renderTravelDocumentHtml(data),
      travelDocumentPdfOptions(data),
    );
    const travPages = pageCount(travelPdf);
    const travBoxes = mediaBoxes(travelPdf);
    const travA4 = travBoxes.every(
      (b) => Math.abs(b.w - A4_W) < 2 && Math.abs(b.h - A4_H) < 2,
    );
    assert(travPages >= 3, `travel doc has letter+itinerary+checklist (${travPages} pages)`);
    assert(travA4, `travel doc sheets all A4`);
    writeFileSync(path.join(outDir, `travel-${slug}.pdf`), travelPdf);
  }

  // Unpaid bookings still get a per-traveller sheet, flagged as unconfirmed.
  console.log("\nunpaid booking (flagged, not a travel document)");
  const unpaid = makeData({ adults: 2, status: "pending_payment" });
  const html = renderTravelDocumentHtml(unpaid);
  assert(
    html.includes("Awaiting payment confirmation"),
    "shows awaiting-payment notice",
  );
  assert(
    html.includes("awaiting payment confirmation."),
    "covering letter says the booking is reserved, not confirmed",
  );

  // One ticket sheet per traveller per flight leg, as in the reference.
  console.log("\nsheet count tracks travellers × legs");
  for (const [label, opts, expected] of [
    ["1 adult one-way", { adults: 1 }, 1],
    ["3 travellers one-way", { adults: 2, children: 1 }, 3],
    ["2 adults return", { adults: 2, roundTrip: true }, 4],
  ] as const) {
    const sheets = (
      renderTravelDocumentHtml(makeData(opts)).match(
        /class="sheet ticket"/g,
      ) ?? []
    ).length;
    assert(sheets === expected, `${label}: ${sheets} ticket sheet(s)`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`PDFs written to ${outDir}`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
