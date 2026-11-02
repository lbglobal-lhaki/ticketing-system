import assert from "node:assert/strict";
import { test } from "node:test";
import { paymentIntentWasRefunded } from "./stripe";
import type Stripe from "stripe";

test("a captured PaymentIntent with no charge refund is not treated as refunded", () => {
  const intent = {
    id: "pi_test",
    status: "succeeded",
    latest_charge: {
      id: "ch_test",
      refunded: false,
      amount_refunded: 0,
      amount: 199900,
    },
  } as unknown as Stripe.PaymentIntent;
  assert.equal(paymentIntentWasRefunded(intent), false);
});

test("a refunded charge must not mint another ticket", () => {
  const intent = {
    id: "pi_refunded",
    status: "succeeded",
    latest_charge: {
      id: "ch_refunded",
      refunded: true,
      amount_refunded: 199900,
      amount: 199900,
    },
  } as unknown as Stripe.PaymentIntent;
  assert.equal(paymentIntentWasRefunded(intent), true);
});
