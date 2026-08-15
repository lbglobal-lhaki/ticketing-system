/**
 * Crops a region out of a PNG for close inspection of document layouts.
 *
 * Usage: npx tsx scripts/crop-png.ts <in.png> <out.png> <x0> <y0> <x1> <y1>
 * Coordinates are fractions of width/height (0..1).
 */
import { readFileSync, writeFileSync } from "fs";
import { PNG } from "pngjs";

const [, , inFile, outFile, ...rest] = process.argv;
if (!inFile || !outFile || rest.length < 4) {
  console.error("usage: crop-png.ts <in> <out> <x0> <y0> <x1> <y1>");
  process.exit(1);
}
const [fx0, fy0, fx1, fy1] = rest.map(Number) as [
  number,
  number,
  number,
  number,
];

const img = PNG.sync.read(readFileSync(inFile));
const x0 = Math.max(0, Math.floor(fx0 * img.width));
const y0 = Math.max(0, Math.floor(fy0 * img.height));
const x1 = Math.min(img.width, Math.ceil(fx1 * img.width));
const y1 = Math.min(img.height, Math.ceil(fy1 * img.height));

const out = new PNG({ width: x1 - x0, height: y1 - y0 });
for (let y = y0; y < y1; y++) {
  for (let x = x0; x < x1; x++) {
    const from = (img.width * y + x) << 2;
    const to = (out.width * (y - y0) + (x - x0)) << 2;
    out.data[to] = img.data[from]!;
    out.data[to + 1] = img.data[from + 1]!;
    out.data[to + 2] = img.data[from + 2]!;
    out.data[to + 3] = img.data[from + 3]!;
  }
}
writeFileSync(outFile, PNG.sync.write(out));
console.log(`${outFile} (${out.width}x${out.height})`);
