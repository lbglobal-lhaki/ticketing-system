import assert from "node:assert/strict";
import { test } from "node:test";
import {
  remainingAfterRestore,
  salesClosedFromRemaining,
} from "./inventoryPolicy";
import { fareIsOpenForSale, getCurrentFareRelease } from "@/lib/fares/current";

test("cancelled seats return to an open fare", () => {
  assert.equal(
    remainingAfterRestore({
      remainingSeats: 0,
      totalSeats: 80,
      seats: 2,
      salesClosed: false,
    }),
    2,
  );
});

test("cancelled seats do not reopen a closed fare", () => {
  assert.equal(
    remainingAfterRestore({
      remainingSeats: 0,
      totalSeats: 80,
      seats: 2,
      salesClosed: true,
    }),
    0,
  );
});

test("setting remaining to 0 closes the fare for sale", () => {
  assert.equal(salesClosedFromRemaining(0), true);
  assert.equal(salesClosedFromRemaining(1), false);
  assert.equal(fareIsOpenForSale({ remainingSeats: 0, salesClosed: true }), false);
  assert.equal(fareIsOpenForSale({ remainingSeats: 4, salesClosed: false }), true);
});

test("closed economy fares are not offered even if remaining was left positive", () => {
  const picked = getCurrentFareRelease(
    [
      {
        id: "eco-saver",
        cabinClass: "economy",
        name: "Economy Saver",
        sortOrder: 1,
        totalSeats: 80,
        remainingSeats: 3,
        priceCents: 199_900,
        roundTripPriceCents: 0,
        active: true,
        salesClosed: true,
      },
    ],
    "economy",
  );
  assert.equal(picked, null);
});
