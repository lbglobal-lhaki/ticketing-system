import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canIssueCargoConfirmation,
  canonicalNotificationKey,
  cargoPaymentOutcome,
} from "./lifecycle";

test("unpaid bookings cannot receive official confirmation", () => {
  assert.equal(
    canIssueCargoConfirmation({
      paid: false,
      paymentStatus: "unpaid",
      bookingStatus: "pending_payment",
    }),
    false,
  );
  assert.equal(
    canIssueCargoConfirmation({
      paid: true,
      paymentStatus: "paid",
      bookingStatus: "pending_payment",
    }),
    false,
  );
});

test("fully paid confirmed bookings can receive confirmation", () => {
  assert.equal(
    canIssueCargoConfirmation({
      paid: true,
      paymentStatus: "paid",
      bookingStatus: "confirmed",
    }),
    true,
  );
});

test("partial payment does not confirm the booking", () => {
  const outcome = cargoPaymentOutcome({
    totalCents: 22_000,
    paidAmountCents: 10_000,
    markPaid: true,
    currentlyCancelled: false,
  });
  assert.equal(outcome.paymentStatus, "partially_paid");
  assert.equal(outcome.bookingStatus, "pending_payment");
  assert.equal(outcome.paid, false);
  assert.equal(outcome.shouldConfirm, false);
  assert.equal(
    canIssueCargoConfirmation({
      paid: outcome.paid,
      paymentStatus: outcome.paymentStatus,
      bookingStatus: outcome.bookingStatus,
    }),
    false,
  );
});

test("full payment verifies and confirms", () => {
  const outcome = cargoPaymentOutcome({
    totalCents: 22_000,
    paidAmountCents: 22_000,
    markPaid: true,
    currentlyCancelled: false,
  });
  assert.equal(outcome.paymentStatus, "paid");
  assert.equal(outcome.bookingStatus, "confirmed");
  assert.equal(outcome.paid, true);
  assert.equal(outcome.shouldConfirm, true);
});

test("cancelled bookings cannot auto-transition to confirmed", () => {
  const outcome = cargoPaymentOutcome({
    totalCents: 22_000,
    paidAmountCents: 22_000,
    markPaid: true,
    currentlyCancelled: true,
  });
  assert.equal(outcome.bookingStatus, "cancelled");
  assert.equal(outcome.shouldConfirm, false);
});

test("marking unpaid clears payment without confirming", () => {
  const outcome = cargoPaymentOutcome({
    totalCents: 22_000,
    paidAmountCents: 0,
    markPaid: false,
    currentlyCancelled: false,
  });
  assert.equal(outcome.paymentStatus, "unpaid");
  assert.equal(outcome.bookingStatus, "pending_payment");
  assert.equal(outcome.shouldConfirm, false);
});

test("canonical notification keys are stable per booking and kind", () => {
  assert.equal(
    canonicalNotificationKey("abc", "acknowledgement"),
    "abc:acknowledgement",
  );
  assert.equal(
    canonicalNotificationKey("abc", "confirmation"),
    "abc:confirmation",
  );
  assert.notEqual(
    canonicalNotificationKey("abc", "acknowledgement"),
    canonicalNotificationKey("abc", "confirmation"),
  );
});
