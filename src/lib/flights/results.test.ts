import assert from "node:assert/strict";
import { test } from "node:test";
import { groupFlightResults } from "@/lib/flights/results";

const outbound = {
  id: "f-out",
  airline: "Drukair",
  flightNumber: "KB 500",
  origin: "PER",
  destination: "PBH",
  departureAt: new Date("2026-12-01T02:00:00.000Z"),
  arrivalAt: new Date("2026-12-01T14:00:00.000Z"),
  returnLegFlight: {
    id: "f-ret",
    flightNumber: "KB 501",
    departureAt: new Date("2026-12-08T02:00:00.000Z"),
    remainingSeats: 80,
    active: true,
    fareReleases: [
      {
        cabinClass: "economy",
        remainingSeats: 0,
        totalSeats: 80,
        salesClosed: true,
      },
    ],
  },
};

test("round-trip badge is hidden when the paired return cabin has no seats", () => {
  const rows = groupFlightResults([
    {
      flight: outbound,
      cabin: { cabinClass: "economy", remainingSeats: 10, totalSeats: 80 },
      price: {
        displayPriceCents: 199_900,
        basePriceCents: 199_900,
        fareReleaseName: "Economy Standard",
        farePriced: true,
      },
      href: "/flights/f-out",
      ctaLabel: "Select",
    },
  ]);
  assert.equal(rows[0]?.roundTripAvailable, false);
});

test("round-trip badge is hidden when this cabin itself has no seats", () => {
  const rows = groupFlightResults([
    {
      flight: {
        ...outbound,
        returnLegFlight: {
          ...outbound.returnLegFlight,
          fareReleases: [
            {
              cabinClass: "economy",
              remainingSeats: 20,
              totalSeats: 80,
              salesClosed: false,
            },
          ],
        },
      },
      cabin: { cabinClass: "economy", remainingSeats: 0, totalSeats: 80 },
      price: {
        displayPriceCents: 0,
        basePriceCents: 0,
        fareReleaseName: null,
        farePriced: false,
      },
      href: "/flights/f-out",
      ctaLabel: "Select",
    },
  ]);
  assert.equal(rows[0]?.roundTripAvailable, false);
});
