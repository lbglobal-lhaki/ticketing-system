/**
 * Extracts the full-bleed brand header band from the reference e-ticket PDF and
 * saves it as a document asset.
 *
 * Both shipped headers (header-page1.png / header-wide.png) crop the bottom of
 * the L&B logo, cutting off the "PATHWAY TO GLOBAL JOURNEY" strapline. This
 * lifts the band from the approved reference document instead, at print
 * resolution, so nothing is cropped.
 *
 * Usage: npx tsx scripts/extract-header-asset.ts "<reference pdf>" [outFile]
 */
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { PNG } from "pngjs";
import { rasterizePdf } from "../src/lib/documents/pdfRaster";

/** Print-resolution raster: A4 width becomes ~2976px (~360dpi). */
const SCALE = 5;

async function main() {
  const src = process.argv[2];
  const outFile =
    process.argv[3] ||
    path.join(
      process.cwd(),
      "public",
      "documents",
      "eticket-assets",
      "header-full.png",
    );
  if (!src) {
    console.error("usage: extract-header-asset.ts <pdf> [outFile]");
    process.exit(1);
  }

  const [page1] = await rasterizePdf(readFileSync(src), {
    maxPages: 1,
    scale: SCALE,
  });
  const img = PNG.sync.read(page1!);
  const { width, height } = img;
  const pxPerMm = height / 297;

  const isInk = (x: number, y: number) => {
    const i = (width * y + x) << 2;
    const r = img.data[i]!;
    const g = img.data[i + 1]!;
    const b = img.data[i + 2]!;
    // Anything meaningfully darker than paper white.
    return r < 245 || g < 245 || b < 245;
  };

  const rowHasInk = (y: number) => {
    for (let x = 0; x < width; x++) if (isInk(x, y)) return true;
    return false;
  };

  // The band lives in the top fifth of the sheet; find where it ends by
  // locating the first sustained run of blank rows after the artwork starts.
  const searchLimit = Math.floor(height * 0.22);
  let firstInk = -1;
  for (let y = 0; y < searchLimit; y++) {
    if (rowHasInk(y)) {
      firstInk = y;
      break;
    }
  }
  if (firstInk < 0) {
    console.error("no header artwork found");
    process.exit(1);
  }

  const BLANK_RUN = Math.round(3 * pxPerMm); // 3mm of clear space ends the band
  let bandEnd = firstInk;
  let blank = 0;
  for (let y = firstInk; y < searchLimit; y++) {
    if (rowHasInk(y)) {
      bandEnd = y;
      blank = 0;
    } else if (++blank >= BLANK_RUN) {
      break;
    }
  }

  // Keep the page-top white margin so the asset can be placed flush at y=0, and
  // leave clear space under the lowest ink — cropping to the last inked row put
  // the "PATHWAY TO GLOBAL JOURNEY" strapline flush against the bottom edge,
  // where it reads as cut off even though every pixel is present.
  const BOTTOM_CLEARANCE_MM = 2.5;
  const cropHeight = Math.min(
    height,
    bandEnd + 1 + Math.round(BOTTOM_CLEARANCE_MM * pxPerMm),
  );
  const out = new PNG({ width, height: cropHeight });
  for (let y = 0; y < cropHeight; y++) {
    for (let x = 0; x < width; x++) {
      const from = (width * y + x) << 2;
      const to = (width * y + x) << 2;
      out.data[to] = img.data[from]!;
      out.data[to + 1] = img.data[from + 1]!;
      out.data[to + 2] = img.data[from + 2]!;
      out.data[to + 3] = 255;
    }
  }
  writeFileSync(outFile, PNG.sync.write(out));

  console.log(`source page: ${width}x${height}px (${pxPerMm.toFixed(2)} px/mm)`);
  console.log(
    `band: ink from y=${firstInk} to y=${bandEnd} → ${(cropHeight / pxPerMm).toFixed(2)}mm tall`,
  );
  console.log(`wrote ${outFile} (${width}x${cropHeight})`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
