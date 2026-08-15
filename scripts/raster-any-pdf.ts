/**
 * Rasterizes any PDF to PNGs for visual inspection / design comparison.
 *
 * Usage: npx tsx scripts/raster-any-pdf.ts "<pdf path>" <outDirName> [scale]
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { rasterizePdf } from "../src/lib/documents/pdfRaster";

async function main() {
  const src = process.argv[2];
  const outName = process.argv[3] || "sample";
  const scale = Number(process.argv[4] || 1.6);
  if (!src) {
    console.error("usage: raster-any-pdf.ts <pdf> <outDirName> [scale]");
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), "tmp", outName);
  mkdirSync(outDir, { recursive: true });

  const pages = await rasterizePdf(readFileSync(src), { scale });
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
