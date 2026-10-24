import assert from "node:assert/strict";
import { test } from "node:test";
import { quoteCargoWeightOption } from "./weightOptions";

const fixed = {
  kind: "fixed" as const,
  minKg: 5,
  maxKg: 5,
  priceCents: 11_848,
  priceBtnCents: 800_000,
  chargeableKg: 5,
  name: "5 kg",
};

const perKg = {
  kind: "per_kg" as const,
  minKg: 100,
  maxKg: 299,
  priceCents: 2_962,
  priceBtnCents: 180_000,
  chargeableKg: 0,
  name: "100 kg+",
};

test("fixed cargo quotes copy the admin AUD and BTN totals", () => {
  const quoted = quoteCargoWeightOption(fixed, 0);
  assert.equal(quoted.ok, true);
  if (!quoted.ok) return;
  assert.equal(quoted.quotedCents, 11_848);
  assert.equal(quoted.quotedBtnCents, 800_000);
});

test("per-kg cargo multiplies both currencies by the entered weight", () => {
  const quoted = quoteCargoWeightOption(perKg, 120);
  assert.equal(quoted.ok, true);
  if (!quoted.ok) return;
  assert.equal(quoted.quotedCents, 120 * 2_962);
  assert.equal(quoted.quotedBtnCents, 120 * 180_000);
});

test("missing BTN stays zero and does not block an AUD quote", () => {
  const quoted = quoteCargoWeightOption({ ...fixed, priceBtnCents: 0 }, 0);
  assert.equal(quoted.ok, true);
  if (!quoted.ok) return;
  assert.equal(quoted.quotedBtnCents, 0);
});
