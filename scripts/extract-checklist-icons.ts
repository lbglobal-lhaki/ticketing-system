/**
 * Lifts the checklist artwork out of the reference e-ticket PDF and saves each
 * icon as its own asset.
 *
 * The icons are embedded as stencil masks, so pulling the XObjects directly
 * yields blank tiles. Rasterising the page at print resolution and cropping
 * gives the approved artwork exactly as it prints. Each crop rectangle only has
 * to *contain* its icon — the white margin is trimmed off automatically — so the
 * coordinates below are deliberately generous.
 *
 * Usage: npx tsx scripts/extract-checklist-icons.ts "<reference pdf>"
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { PNG } from "pngjs";
import { rasterizePdf } from "../src/lib/documents/pdfRaster";

/** ~4x A4 ≈ 290dpi: crisp at the ~30px the icons print at. */
const SCALE = 4;

/** Fractions of page width/height on the reference checklist sheet. */
type Rect = { name: string; x0: number; y0: number; x1: number; y1: number };

/** Icon band of the biosecurity grid, clear of the caption under each tile. */
const BIO_ROW1_Y = [0.5365, 0.5760] as const;
const BIO_ROW2_Y = [0.6050, 0.6425] as const;
const BIO_ROW1_COLS = [
  [0.4125, 0.4580],
  [0.4795, 0.5585],
  [0.5860, 0.6500],
  [0.6640, 0.7355],
  [0.7390, 0.8180],
] as const;
const BIO_ROW2_COLS = [
  [0.4100, 0.4670],
  [0.4885, 0.5610],
  [0.5780, 0.6540],
  [0.6640, 0.7355],
  [0.7480, 0.8180],
] as const;

const RECTS: Rect[] = [
  ...["bio-food", "bio-meat", "bio-fruit", "bio-seeds", "bio-wood"].map(
    (name, i) => ({
      name,
      x0: BIO_ROW1_COLS[i]![0],
      y0: BIO_ROW1_Y[0],
      x1: BIO_ROW1_COLS[i]![1],
      y1: BIO_ROW1_Y[1],
    }),
  ),
  ...["bio-animal", "bio-medicine", "bio-herbs", "bio-soil", "bio-religious"].map(
    (name, i) => ({
      name,
      x0: BIO_ROW2_COLS[i]![0],
      y0: BIO_ROW2_Y[0],
      x1: BIO_ROW2_COLS[i]![1],
      y1: BIO_ROW2_Y[1],
    }),
  ),
  // x1 stops short of 0.969 — the panel's navy border sits at the sheet edge.
  { name: "bio-inspector", x0: 0.8790, y0: 0.6180, x1: 0.9630, y1: 0.6790 },
  { name: "warn-triangle", x0: 0.3990, y0: 0.7140, x1: 0.4545, y1: 0.7510 },
  { name: "money-cash", x0: 0.1550, y0: 0.8650, x1: 0.2475, y1: 0.9140 },
  { name: "arrive-immigration", x0: 0.4270, y0: 0.8700, x1: 0.4900, y1: 0.9140 },
  { name: "arrive-baggage", x0: 0.5400, y0: 0.8700, x1: 0.6085, y1: 0.9140 },
  { name: "arrive-biosecurity", x0: 0.6450, y0: 0.8700, x1: 0.7135, y1: 0.9140 },
  { name: "arrive-customs", x0: 0.7460, y0: 0.8700, x1: 0.8085, y1: 0.9140 },
  { name: "arrive-exit", x0: 0.8465, y0: 0.8700, x1: 0.9050, y1: 0.9140 },
];

/** Section glyphs on the per-passenger sheet (page 2). */
const PAGE2_RECTS: Rect[] = [
  { name: "ico-terms", x0: 0.0250, y0: 0.5260, x1: 0.0500, y1: 0.5520 },
  { name: "ico-baggage", x0: 0.6100, y0: 0.5260, x1: 0.6400, y1: 0.5520 },
  // Glyphs above the three benefit captions in the card's footer strip.
  { name: "perk-direct", x0: 0.1830, y0: 0.4740, x1: 0.2040, y1: 0.4925 },
  { name: "perk-comfort", x0: 0.4020, y0: 0.4740, x1: 0.4240, y1: 0.4925 },
  { name: "perk-all", x0: 0.6110, y0: 0.4775, x1: 0.6330, y1: 0.4925 },
];

const NAVY = { r: 30, g: 45, b: 110 };

/** True for the deep navy the charter banner is painted in. */
function isBannerNavy(img: PNG, x: number, y: number) {
  const i = (img.width * y + x) << 2;
  return (
    Math.abs(img.data[i]! - NAVY.r) < 45 &&
    Math.abs(img.data[i + 1]! - NAVY.g) < 45 &&
    Math.abs(img.data[i + 2]! - NAVY.b) < 55
  );
}

/**
 * The charter banner bleeds edge to edge, so its extent is found by scanning
 * the left margin for the navy block rather than hard-coding a rectangle.
 */
function bannerBand(page: PNG) {
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < page.height; y++) {
    if (isBannerNavy(page, 4, y)) {
      if (top < 0) top = y;
      bottom = y;
    } else if (top >= 0 && y - bottom > 20) {
      break;
    }
  }
  return top < 0 ? null : { top, bottom };
}

/** Full-width slice, no trimming — the banner is meant to bleed. */
function sliceRows(page: PNG, top: number, bottom: number) {
  const out = new PNG({ width: page.width, height: bottom - top + 1 });
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < page.width; x++) {
      const from = (page.width * y + x) << 2;
      const to = (out.width * (y - top) + x) << 2;
      out.data[to] = page.data[from]!;
      out.data[to + 1] = page.data[from + 1]!;
      out.data[to + 2] = page.data[from + 2]!;
      out.data[to + 3] = 255;
    }
  }
  return out;
}

const NEAR_WHITE = 247;

/** Shrinks a crop to its ink, keeping a small transparent margin. */
function trimToInk(img: PNG) {
  let minX = img.width;
  let minY = img.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (img.width * y + x) << 2;
      if (
        img.data[i]! < NEAR_WHITE ||
        img.data[i + 1]! < NEAR_WHITE ||
        img.data[i + 2]! < NEAR_WHITE
      ) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(img.width - 1, maxX + pad);
  maxY = Math.min(img.height - 1, maxY + pad);

  const out = new PNG({ width: maxX - minX + 1, height: maxY - minY + 1 });
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const from = (img.width * y + x) << 2;
      const to = (out.width * (y - minY) + (x - minX)) << 2;
      const r = img.data[from]!;
      const g = img.data[from + 1]!;
      const b = img.data[from + 2]!;
      out.data[to] = r;
      out.data[to + 1] = g;
      out.data[to + 2] = b;
      // Paper white becomes transparent so icons sit on any panel colour.
      out.data[to + 3] =
        r >= NEAR_WHITE && g >= NEAR_WHITE && b >= NEAR_WHITE ? 0 : 255;
    }
  }
  return out;
}

function crop(page: PNG, rect: Rect) {
  const x0 = Math.max(0, Math.floor(rect.x0 * page.width));
  const y0 = Math.max(0, Math.floor(rect.y0 * page.height));
  const x1 = Math.min(page.width, Math.ceil(rect.x1 * page.width));
  const y1 = Math.min(page.height, Math.ceil(rect.y1 * page.height));
  const out = new PNG({ width: x1 - x0, height: y1 - y0 });
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const from = (page.width * y + x) << 2;
      const to = (out.width * (y - y0) + (x - x0)) << 2;
      out.data[to] = page.data[from]!;
      out.data[to + 1] = page.data[from + 1]!;
      out.data[to + 2] = page.data[from + 2]!;
      out.data[to + 3] = 255;
    }
  }
  return out;
}

async function main() {
  const src = process.argv[2];
  if (!src) {
    console.error("usage: extract-checklist-icons.ts <pdf>");
    process.exit(1);
  }
  const outDir = path.join(
    process.cwd(),
    "public",
    "documents",
    "eticket-assets",
  );
  mkdirSync(outDir, { recursive: true });

  const pages = await rasterizePdf(readFileSync(src), { scale: SCALE });
  const checklist = PNG.sync.read(pages[pages.length - 1]!);
  const perPassenger = PNG.sync.read(pages[1]!);

  for (const [page, rects] of [
    [checklist, RECTS],
    [perPassenger, PAGE2_RECTS],
  ] as Array<[PNG, Rect[]]>) {
    for (const rect of rects) {
      const trimmed = trimToInk(crop(page, rect));
      if (!trimmed) {
        console.warn(`  ! ${rect.name}: blank crop`);
        continue;
      }
      const file = path.join(outDir, `${rect.name}.png`);
      writeFileSync(file, PNG.sync.write(trimmed));
      console.log(`${rect.name}.png (${trimmed.width}x${trimmed.height})`);
    }
  }

  // The dotted world map ships with its transparency flattened onto black, so
  // using it directly as a background paints a grey slab behind the card. Undo
  // the flatten: luminance becomes alpha, colour is un-premultiplied.
  try {
    const map = PNG.sync.read(
      readFileSync(path.join(outDir, "world-map.png")),
    );
    for (let i = 0; i < map.data.length; i += 4) {
      const r = map.data[i]!;
      const g = map.data[i + 1]!;
      const b = map.data[i + 2]!;
      const alpha = Math.max(r, g, b);
      map.data[i + 3] = alpha;
      if (alpha > 0) {
        map.data[i] = Math.min(255, Math.round((r * 255) / alpha));
        map.data[i + 1] = Math.min(255, Math.round((g * 255) / alpha));
        map.data[i + 2] = Math.min(255, Math.round((b * 255) / alpha));
      }
    }
    writeFileSync(
      path.join(outDir, "world-map-dots.png"),
      PNG.sync.write(map),
    );
    console.log(`world-map-dots.png (${map.width}x${map.height})`);
  } catch {
    console.warn("  ! world-map.png not found; skipped alpha recovery");
  }

  const band = bannerBand(perPassenger);
  if (band) {
    const banner = sliceRows(perPassenger, band.top, band.bottom);
    writeFileSync(
      path.join(outDir, "charter-banner-wide.png"),
      PNG.sync.write(banner),
    );
    console.log(
      `charter-banner-wide.png (${banner.width}x${banner.height}) → ${(
        (210 * banner.height) /
        banner.width
      ).toFixed(2)}mm tall at full bleed`,
    );
  } else {
    console.warn("  ! charter banner not found");
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
