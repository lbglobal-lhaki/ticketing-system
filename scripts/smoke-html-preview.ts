/**
 * The admin modal serves raw document HTML (not a PDF), so the brand band and
 * contact strip must still be visible on screen. The invoice paints them inline
 * as `.screen-chrome` copies of its @page margin box; the travel document lays
 * its chrome out inline for print as well (`.band` / `.foot`). This screenshots
 * the on-screen rendering so that parity can be checked.
 *
 * Run: npx tsx scripts/smoke-html-preview.ts
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { getPdfBrowser } from "../src/lib/documents/pdf";
import {
  renderAirfareInvoiceHtml,
  renderTravelDocumentHtml,
} from "../src/lib/documents/templates";
import { makeSmokeBookingData } from "./lib/smokeBookingData";

async function main() {
  const outDir = path.join(process.cwd(), "tmp", "html-preview");
  mkdirSync(outDir, { recursive: true });

  const data = makeSmokeBookingData({ adults: 2, roundTrip: true });
  const docs = [
    ["invoice", renderAirfareInvoiceHtml(data)],
    ["travel", renderTravelDocumentHtml(data)],
  ] as const;

  const browser = await getPdfBrowser();
  let failed = 0;

  for (const [name, html] of docs) {
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1200 });
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    // Brand band + contact strip must both be laid out on screen.
    const visible = await page.evaluate(() => {
      const els = Array.from(
        document.querySelectorAll(".screen-chrome, .band, .foot"),
      );
      return els.filter((el) => (el as HTMLElement).offsetHeight > 0).length;
    });
    const ok = visible >= 2;
    console.log(
      `${ok ? "✓" : "✗"} ${name}: ${visible} chrome element(s) visible on screen`,
    );
    if (!ok) failed += 1;

    const shot = await page.screenshot({ fullPage: true, type: "png" });
    writeFileSync(path.join(outDir, `${name}.png`), shot);
    await page.close();
  }

  console.log(`\nPreviews written to ${outDir}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
