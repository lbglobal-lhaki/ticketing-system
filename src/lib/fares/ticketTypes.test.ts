import assert from "node:assert/strict";
import { test } from "node:test";
import { ticketTypeCabinPrice } from "@/lib/fares/customerPrice";
import type { FareReleaseRow } from "@/lib/fares/current";
import {
  matchingReturnRelease,
  roundTripTicketTypeAvailable,
} from "@/lib/fares/ticketTypes";

function release(
  overrides: Partial<FareReleaseRow> & Pick<FareReleaseRow, "id" | "name">,
): FareReleaseRow {
  return {
    cabinClass: "economy",
    sortOrder: 1,
    totalSeats: 40,
    remainingSeats: 10,
    priceCents: 199_900,
    roundTripPriceCents: 349_900,
    active: true,
    salesClosed: false,
    ...overrides,
  };
}

test("matching return ignores a sold-out same-named ticket type", () => {
  const outbound = release({ id: "out-std", name: "Economy Standard" });
  const match = matchingReturnRelease(
    [
      release({
        id: "ret-std",
        name: "Economy Standard",
        remainingSeats: 0,
        salesClosed: true,
      }),
      release({
        id: "ret-final",
        name: "Final Release",
        sortOrder: 3,
        remainingSeats: 20,
      }),
    ],
    outbound,
    "economy",
  );
  assert.equal(match, null);
});

test("matching return uses the open same-named ticket type", () => {
  const outbound = release({ id: "out-std", name: "Economy Standard" });
  const match = matchingReturnRelease(
    [
      release({
        id: "ret-std",
        name: "Economy Standard",
        remainingSeats: 4,
      }),
    ],
    outbound,
    "economy",
  );
  assert.equal(match?.id, "ret-std");
});

test("round-trip is not available when the return ticket type has no seats", () => {
  const outbound = release({ id: "out-std", name: "Economy Standard" });
  assert.equal(
    roundTripTicketTypeAvailable(
      outbound,
      [
        release({
          id: "ret-std",
          name: "Economy Standard",
          remainingSeats: 0,
          salesClosed: true,
        }),
      ],
      "economy",
    ),
    false,
  );
});

test("a cabin with no remaining seats is not priced for round-trip", () => {
  const snapshot = ticketTypeCabinPrice(
    [
      release({
        id: "eco-std",
        name: "Economy Standard",
        remainingSeats: 0,
        salesClosed: true,
        roundTripPriceCents: 349_900,
      }),
    ],
    "economy",
    { remainingSeats: 0, totalSeats: 40 },
    true,
  );
  assert.equal(snapshot.farePriced, false);
  assert.equal(snapshot.displayPriceCents, 0);
});
