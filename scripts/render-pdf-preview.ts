/**
 * Rasterises PDFs in tmp/pdf-smoke to PNGs so document layout can be eyeballed.
 * pdf.js runs inside the Chromium page we already launch for PDF generation,
 * which avoids any native canvas dependency.
 *
 * Run: npx tsx scripts/render-pdf-preview.ts [maxPagesPerDoc]
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { rasterizePdf } from "../src/lib/documents/pdfRaster";

async function main() {
  const maxPages = Number(process.argv[2] || 3);
  const inDir = path.join(process.cwd(), "tmp", "pdf-smoke");
  const outDir = path.join(process.cwd(), "tmp", "pdf-preview");
  mkdirSync(outDir, { recursive: true });

  const filter = process.argv[3];
  const files = readdirSync(inDir).filter(
    (f) => f.endsWith(".pdf") && (!filter || f.includes(filter)),
  );
  for (const file of files) {
    const pdf = readFileSync(path.join(inDir, file));
    const pages = await rasterizePdf(pdf, { maxPages, scale: 1.4 });
    pages.forEach((png, i) => {
      const out = path.join(outDir, `${file.replace(/\.pdf$/, "")}-p${i + 1}.png`);
      writeFileSync(out, png);
      console.log(out);
    });
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
