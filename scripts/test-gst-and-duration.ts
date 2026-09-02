/**
 * GST + timezone duration checks for client feedback.
 * Run: npx tsx scripts/test-gst-and-duration.ts
 */
import { parseFlightDateTime, scheduledFlightDurationMinutes } from "../src/lib/datetime";
import {
  calculateCardServiceFee,
  exclusiveGstAppliesToFare,
  exclusiveGstCents,
  isPromotionalCatalogueFare,
} from "../src/lib/payments/fees";
import { flightDurationMinutes, formatDuration } from "../src/lib/flights/results";

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

console.log("\n== GST on promotional vs standard ==\n");
assert(isPromotionalCatalogueFare({ fareProductCode: "saver" }), "saver code is promotional");
assert(
  isPromotionalCatalogueFare({ fareProductName: "Saver" }),
  "Saver name is promotional",
);
assert(
  !isPromotionalCatalogueFare({ fareProductCode: "standard" }),
  "standard is not promotional",
);
assert(
  !isPromotionalCatalogueFare({ fareProductCode: "flexi" }),
  "flexi is not promotional",
);
assert(
  !isPromotionalCatalogueFare({ fareProductCode: "business_saver" }),
  "business_saver is not promotional",
);
assert(
  exclusiveGstAppliesToFare({ fareProductCode: "standard" }),
  "standard gets exclusive GST",
);
assert(
  !exclusiveGstAppliesToFare({ fareProductCode: "saver" }),
  "saver does not get exclusive GST",
);

const promoCard = calculateCardServiceFee(99_900, { includeGst: false });
assert(promoCard.gstCents === 0, "promo card GST is $0");
assert(
  promoCard.totalCents === 99_900 + promoCard.serviceFeeCents,
  "promo card total is advertised fare + card fee only",
);

const standardCard = calculateCardServiceFee(129_900, { includeGst: true });
assert(standardCard.gstCents > 0, "standard card GST is added");
assert(
  standardCard.totalCents ===
    standardCard.taxableCents + standardCard.gstCents,
  "standard card total includes GST",
);

assert(
  exclusiveGstCents(99_900, false) === 0,
  "promo bank GST is $0",
);
assert(
  exclusiveGstCents(129_900, true) === 12_990,
  "standard $1299 bank GST is $129.90",
);

console.log("\n== Perth / Paro local times and duration ==\n");
const dep = parseFlightDateTime("2026-08-17T13:25");
const arr = parseFlightDateTime("2026-08-17T22:25");
const naiveHours = (arr.getTime() - dep.getTime()) / 3600000;
assert(naiveHours === 9, "clock difference is 9 hours (old bug)");
const minutes = scheduledFlightDurationMinutes(dep, arr, "PER", "PBH");
assert(minutes === 11 * 60, `actual PER→PBH is 11h (got ${formatDuration(minutes)})`);
assert(
  flightDurationMinutes(dep, arr, "PER", "PBH") === 11 * 60,
  "results helper matches 11h",
);

const retDep = parseFlightDateTime("2026-08-18T01:25");
const retArr = parseFlightDateTime("2026-08-18T10:35");
const retMin = scheduledFlightDurationMinutes(retDep, retArr, "PBH", "PER");
assert(
  retMin === 7 * 60 + 10,
  `PBH→PER 01:25 BTT to 10:35 AWST is 7h 10m (got ${formatDuration(retMin)})`,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
