/**
 * Measures exactly where Chromium places header/footer templates inside the
 * @page margin box, so full-bleed artwork can be aligned without guesswork.
 *
 * Run: npx tsx scripts/probe-margin-box.ts
 */
import { htmlToPdf } from "../src/lib/documents/pdf";
import { rasterizePdf } from "../src/lib/documents/pdfRaster";
import { PNG } from "pngjs";

/** Chromium's fixed inset above the header template / below the footer. */
const CHROME_INSET_MM = 5.29;
/** header-wide.png natural height when bled to a 210mm sheet. */
const ART_MM = 35.3;
const GAP_MM = 4;

const TOP_MM = ART_MM - CHROME_INSET_MM + GAP_MM;
const BOTTOM_MM = 20;

function band(inner: string) {
  return `<style>html,body{margin:0;padding:0;width:100%;-webkit-print-color-adjust:exact;print-color-adjust:exact}*{box-sizing:border-box}</style><div style="width:100%;margin:0;padding:0">${inner}</div>`;
}

async function main() {
  const html = `<!DOCTYPE html><html><head><style>
    @page { size: A4; }
    html,body { margin:0; }
    .fill { background:#00ffff; height: 400mm; }
  </style></head><body><div class="fill"></div></body></html>`;

  const pdf = await htmlToPdf(html, {
    // Pull the artwork up through Chromium's inset so it bleeds to the edge.
    headerTemplate: band(
      `<div style="width:100%;height:${ART_MM}mm;margin-top:-${CHROME_INSET_MM}mm;background:#ff00ff"></div>`,
    ),
    footerTemplate: band(
      `<div style="width:100%;height:${BOTTOM_MM}mm;background:#ffff00"></div>`,
    ),
    margin: {
      top: `${TOP_MM}mm`,
      bottom: `${BOTTOM_MM}mm`,
      left: "0mm",
      right: "0mm",
    },
  });

  const [png0] = await rasterizePdf(pdf, { maxPages: 1, scale: 2 });
  const img = PNG.sync.read(png0!);
  const { width, height } = img;
  const pxPerMm = height / 297;
  console.log(`page ${width}x${height}px, ${pxPerMm.toFixed(3)} px/mm`);

  const colorAt = (y: number, x: number) => {
    const i = (width * y + x) << 2;
    return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!] as const;
  };
  const isMagenta = (y: number) => {
    const [r, g, b] = colorAt(y, width >> 1);
    return r > 200 && g < 60 && b > 200;
  };
  const isCyan = (y: number) => {
    const [r, g, b] = colorAt(y, width >> 1);
    return r < 60 && g > 200 && b > 200;
  };
  const isYellow = (y: number) => {
    const [r, g, b] = colorAt(y, width >> 1);
    return r > 200 && g > 200 && b < 60;
  };

  const firstOf = (pred: (y: number) => boolean) => {
    for (let y = 0; y < height; y++) if (pred(y)) return y;
    return -1;
  };
  const lastOf = (pred: (y: number) => boolean) => {
    for (let y = height - 1; y >= 0; y--) if (pred(y)) return y;
    return -1;
  };

  const mm = (px: number) => (px / pxPerMm).toFixed(2) + "mm";

  const magFirst = firstOf(isMagenta);
  const magLast = lastOf(isMagenta);
  const cyanFirst = firstOf(isCyan);
  const cyanLast = lastOf(isCyan);
  const yelFirst = firstOf(isYellow);
  const yelLast = lastOf(isYellow);

  console.log(`\nheader template (magenta, asked for ${TOP_MM}mm):`);
  console.log(`  starts ${mm(magFirst)} from page top`);
  console.log(`  ends   ${mm(magLast + 1)}`);
  console.log(`  height ${mm(magLast - magFirst + 1)}`);

  console.log(`\ncontent box (cyan):`);
  console.log(`  starts ${mm(cyanFirst)}  (top margin asked: ${TOP_MM}mm)`);
  console.log(`  ends   ${mm(cyanLast + 1)}  (bottom margin asked: ${BOTTOM_MM}mm → ${297 - BOTTOM_MM}mm)`);

  console.log(`\nfooter template (yellow, asked for ${BOTTOM_MM}mm):`);
  console.log(`  starts ${mm(yelFirst)} from page top`);
  console.log(`  ends   ${mm(yelLast + 1)}`);
  console.log(`  height ${mm(yelLast - yelFirst + 1)}`);

  console.log(
    `\n→ header top inset: ${mm(magFirst)}; header bottom gap to content: ${mm(cyanFirst - (magLast + 1))}`,
  );
  console.log(
    `→ footer top gap from content: ${mm(yelFirst - (cyanLast + 1))}; footer bottom inset: ${mm(height - (yelLast + 1))}`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
