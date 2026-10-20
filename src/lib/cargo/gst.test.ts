import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cargoMoneySnapshot,
  exclusiveGstCents,
  includedGstCents,
  priceCargoCharges,
} from "./gst";

test("exclusive 10% GST: $200 freight becomes $20 GST and $220 total", () => {
  const priced = priceCargoCharges({ exclusiveCents: 20_000, gstRateBps: 1000 });
  assert.equal(priced.freightCents, 20_000);
  assert.equal(priced.gstCents, 2_000);
  assert.equal(priced.totalCents, 22_000);
  assert.equal(priced.gstIncluded, false);
});

test("GST-inclusive prices are not taxed twice", () => {
  const priced = priceCargoCharges({
    exclusiveCents: 22_000,
    gstRateBps: 1000,
    gstIncluded: true,
  });
  assert.equal(priced.totalCents, 22_000);
  assert.equal(priced.gstCents, includedGstCents(22_000, 1000));
  assert.equal(priced.freightCents + priced.gstCents, 22_000);
  const twice = priceCargoCharges({
    exclusiveCents: priced.totalCents,
    gstRateBps: 1000,
    gstIncluded: true,
  });
  assert.equal(twice.totalCents, 22_000);
  assert.equal(twice.gstCents, priced.gstCents);
});

test("GST-free charges stay itemised at $0 GST", () => {
  const priced = priceCargoCharges({ exclusiveCents: 20_000, gstRateBps: 0 });
  assert.equal(priced.gstCents, 0);
  assert.equal(priced.totalCents, 20_000);
});

test("historical invoices keep the original total without inventing GST", () => {
  const snap = cargoMoneySnapshot({ quotedCents: 15_000 });
  assert.equal(snap.freightCents, 15_000);
  assert.equal(snap.gstCents, 0);
  assert.equal(snap.totalCents, 15_000);
  assert.equal(snap.gstRateBps, 0);
});

test("issued snapshots preserve freight, GST and total", () => {
  const snap = cargoMoneySnapshot({
    quotedCents: 22_000,
    freightCents: 20_000,
    gstCents: 2_000,
    gstRateBps: 1000,
  });
  assert.equal(snap.freightCents, 20_000);
  assert.equal(snap.gstCents, 2_000);
  assert.equal(snap.totalCents, 22_000);
});

test("exclusive GST uses banker's-style cent rounding via Math.round", () => {
  assert.equal(exclusiveGstCents(1, 1000), 0);
  assert.equal(exclusiveGstCents(5, 1000), 1);
  assert.equal(exclusiveGstCents(10, 1000), 1);
});
