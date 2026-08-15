/**
 * Renders the travel document to PDF and rasterises every sheet, so the layout
 * can be compared against the approved reference side by side.
 *
 * Usage: npx tsx scripts/preview-travel-doc.ts [adults] [scale]
 */
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { htmlToPdf } from "../src/lib/documents/pdf";
import { rasterizePdf } from "../src/lib/documents/pdfRaster";
import {
  renderTravelDocumentHtml,
  travelDocumentPdfOptions,
} from "../src/lib/documents/templates";
import { makeSmokeBookingData } from "./lib/smokeBookingData";

async function main() {
  const adults = Number(process.argv[2] || 1);
  const scale = Number(process.argv[3] || 1.6);
  const outDir = path.join(process.cwd(), "tmp", "travel-preview");
  mkdirSync(outDir, { recursive: true });

  const data = makeSmokeBookingData({ adults });
  // The reference document is a single-name, one-way booking.
  data.passengers = data.passengers.slice(0, adults);
  data.passengerName = data.passengers[0]!.fullName;

  const pdf = await htmlToPdf(
    renderTravelDocumentHtml(data),
    travelDocumentPdfOptions(data),
  );
  writeFileSync(path.join(outDir, "travel.pdf"), pdf);

  const pages = await rasterizePdf(pdf, { scale });
  pages.forEach((png, i) => {
    const out = path.join(outDir, `p${i + 1}.png`);
    writeFileSync(out, png);
    console.log(out);
  });
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
