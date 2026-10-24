import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dualCargoPriceParts,
  formatAudAmount,
  formatBtnAmount,
  formatDualCargoPrice,
} from "./formatMoney";

test("formats AUD and BTN the way customers should see them", () => {
  assert.equal(formatAudAmount(20_000), "AUD $200.00");
  assert.equal(formatBtnAmount(1_400_000), "BTN Nu. 14,000.00");
});

test("pairs both currencies when BTN is set", () => {
  assert.equal(
    formatDualCargoPrice(20_000, 1_400_000),
    "AUD $200.00 and BTN Nu. 14,000.00",
  );
});

test("omits BTN when it has not been published", () => {
  assert.equal(formatDualCargoPrice(3_554, 0), "AUD $35.54");
});

test("splits dual prices so cards can stack AUD above BTN", () => {
  const parts = dualCargoPriceParts(3_554, 236_900);
  assert.equal(parts.aud, "AUD $35.54");
  assert.equal(parts.btn, "BTN Nu. 2,369.00");
});

test("adds a per-kg suffix to both amounts", () => {
  assert.equal(
    formatDualCargoPrice(2_962, 180_000, " / kg"),
    "AUD $29.62 / kg and BTN Nu. 1,800.00 / kg",
  );
});
