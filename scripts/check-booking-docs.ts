import {
  formatFlightClock,
  formatFlightDate,
  parseDateTimeLocal,
  parseFlightDateTime,
  toFlightDateTimeLocalValue,
} from "../src/lib/datetime";
import { charterWelcomeRoute } from "../src/lib/documents/invoiceFields";
import {
  formatBookingRef,
  formatTicketNumber,
  parseBookingRefSerial,
  parseTicketSerial,
} from "../src/lib/booking/documentIds";

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

const kb920Dep = parseFlightDateTime("2026-10-22T09:00");
const kb920Arr = parseFlightDateTime("2026-10-23T00:25");
const kb921Dep = parseFlightDateTime("2026-10-23T01:25");
const kb921Arr = parseFlightDateTime("2026-10-23T10:35");

assert(toFlightDateTimeLocalValue(kb920Dep) === "2026-10-22T09:00", "KB920 dep round-trip");
assert(formatFlightClock(kb920Dep) === "09:00", `KB920 dep clock ${formatFlightClock(kb920Dep)}`);
assert(formatFlightClock(kb920Arr) === "00:25", `KB920 arr clock ${formatFlightClock(kb920Arr)}`);
assert(formatFlightClock(kb921Dep) === "01:25", `KB921 dep clock ${formatFlightClock(kb921Dep)}`);
assert(formatFlightClock(kb921Arr) === "10:35", `KB921 arr clock ${formatFlightClock(kb921Arr)}`);
assert(formatFlightDate(kb920Dep) === "22/10/2026", `KB920 date ${formatFlightDate(kb920Dep)}`);
assert(formatFlightDate(kb920Arr) === "23/10/2026", `KB920 +1 date ${formatFlightDate(kb920Arr)}`);

const oldOffsetAugustSydney = -600;
const leaked = parseDateTimeLocal("2026-10-22T09:00", oldOffsetAugustSydney);
assert(
  formatFlightClock(leaked) !== "09:00",
  "legacy offset path should still be able to shift October times",
);

assert(
  charterWelcomeRoute({ origin: "PBH", destination: "PER", roundTrip: false }) ===
    "Paro to Perth",
  "one-way welcome",
);
assert(
  charterWelcomeRoute({ origin: "PBH", destination: "PER", roundTrip: true }) ===
    "Paro to Perth and Perth to Paro",
  "round-trip welcome PBH",
);
assert(
  charterWelcomeRoute({
    origin: "PER",
    destination: "PBH",
    roundTrip: true,
    returnOrigin: "PBH",
    returnDestination: "PER",
  }) === "Perth to Paro and Paro to Perth",
  "round-trip welcome PER",
);

assert(formatTicketNumber(2_600_000_007) === "888-2600000007", "ticket format");
assert(parseTicketSerial("888-2600000008") === 2_600_000_008, "ticket parse");
assert(formatBookingRef(8941) === "LB8941", "ref format");
assert(parseBookingRefSerial("LB8942") === 8942, "ref parse");
assert(formatBookingRef(8941 + 1) !== formatBookingRef(8941), "family refs differ");

console.log("booking-doc checks passed");
