import test from "node:test";
import assert from "node:assert/strict";
import {
  CANCELLATION_REASONS,
  assessSeatReturn,
  bookingsOverCapacity,
  canCancelBooking,
  cancellationReasonCustomerText,
  cancellationReasonLabel,
  invoiceStatusAfterCancellation,
  isCancellationReason,
  seatReturnStatusOnCancel,
  seatsToReclaim,
  wasBookedOverCapacity,
  type SectorInventory,
} from "@/lib/booking/cancellationPolicy";

const sector = (over: Partial<SectorInventory> = {}): SectorInventory => ({
  seatsBooked: 2,
  flightTotalSeats: 100,
  flightRemainingSeats: 50,
  liveSeatsSold: 48,
  fare: { name: "Economy", totalSeats: 80, remainingSeats: 30, salesClosed: false },
  ...over,
});

test("live and expired bookings can be cancelled; cancelled cannot", () => {
  assert.equal(canCancelBooking("pending_payment"), true);
  assert.equal(canCancelBooking("confirmed"), true);
  assert.equal(canCancelBooking("hold_expired"), true);
  assert.equal(canCancelBooking("cancelled"), false);
  assert.equal(canCancelBooking("anything_else"), false);
});

test("cancelling never returns seats — live bookings go to manual review", () => {
  assert.equal(seatReturnStatusOnCancel("pending_payment"), "pending");
  assert.equal(seatReturnStatusOnCancel("confirmed"), "pending");
  // Expired holds already went back automatically.
  assert.equal(seatReturnStatusOnCancel("hold_expired"), "not_applicable");
});

test("healthy flight: the whole booking can go back", () => {
  const a = assessSeatReturn(sector());
  assert.equal(a.returnable, 2);
  assert.equal(a.oversoldBy, 0);
  assert.deepEqual(a.notes, []);
});

test("oversold flight: nothing goes back and the oversell is reported", () => {
  const a = assessSeatReturn(sector({ liveSeatsSold: 103, flightRemainingSeats: 0 }));
  assert.equal(a.returnable, 0);
  assert.equal(a.oversoldBy, 3);
  assert.match(a.notes.join(" "), /oversold/i);
});

test("nearly full flight: only the seats that exist go back", () => {
  const a = assessSeatReturn(sector({ seatsBooked: 4, liveSeatsSold: 98 }));
  assert.equal(a.returnable, 2);
  assert.equal(a.oversoldBy, 0);
});

test("flight inventory counter bounds the return", () => {
  const a = assessSeatReturn(sector({ seatsBooked: 3, flightRemainingSeats: 99 }));
  assert.equal(a.returnable, 1);
});

test("closed ticket type returns nothing until reopened", () => {
  const a = assessSeatReturn(
    sector({ fare: { name: "Saver", totalSeats: 10, remainingSeats: 0, salesClosed: true } }),
  );
  assert.equal(a.returnable, 0);
  assert.match(a.notes.join(" "), /closed/i);
});

test("ticket type counter bounds the return", () => {
  const a = assessSeatReturn(
    sector({ fare: { name: "Saver", totalSeats: 10, remainingSeats: 9, salesClosed: false } }),
  );
  assert.equal(a.returnable, 1);
});

test("over-capacity bookings are found in booking order", () => {
  const over = bookingsOverCapacity(10, [
    { ref: "C", seatsBooked: 3, createdAt: "2026-01-03" },
    { ref: "A", seatsBooked: 6, createdAt: "2026-01-01" },
    { ref: "B", seatsBooked: 3, createdAt: "2026-01-02" },
    { ref: "D", seatsBooked: 1, createdAt: "2026-01-04" },
  ]);
  // A(6) B(9) fit; C pushes to 12 (2 over); D is entirely over.
  assert.deepEqual(
    over.map((b) => [b.ref, b.seatsOverCapacity]),
    [
      ["C", 2],
      ["D", 1],
    ],
  );
  assert.deepEqual(bookingsOverCapacity(10, [{ seatsBooked: 10, createdAt: "x" }]), []);
});

test("a cancelled booking is flagged when it was taken on a full flight", () => {
  assert.equal(
    wasBookedOverCapacity({ totalSeats: 10, seatsBooked: 2, seatsHeldBefore: 9 }),
    true,
  );
  assert.equal(
    wasBookedOverCapacity({ totalSeats: 10, seatsBooked: 1, seatsHeldBefore: 9 }),
    false,
  );
});

test("reactivation reclaims exactly what went back to sale", () => {
  const base = {
    seatsBooked: 3,
    hasReturnLeg: true,
    seatsReturnedOutbound: 0,
    seatsReturnedReturn: 0,
  };
  // Pending review / not returned: seats are still counted as sold.
  for (const seatReturnStatus of ["pending", "not_returned"]) {
    assert.deepEqual(
      seatsToReclaim({ ...base, status: "cancelled", seatReturnStatus }),
      { outbound: 0, inbound: 0 },
    );
  }
  // Partially returned: take back only those.
  assert.deepEqual(
    seatsToReclaim({
      ...base,
      status: "cancelled",
      seatReturnStatus: "returned",
      seatsReturnedOutbound: 2,
      seatsReturnedReturn: 1,
    }),
    { outbound: 2, inbound: 1 },
  );
  // Expired holds released everything.
  assert.deepEqual(
    seatsToReclaim({ ...base, status: "hold_expired", seatReturnStatus: "not_applicable" }),
    { outbound: 3, inbound: 3 },
  );
  assert.deepEqual(
    seatsToReclaim({ ...base, hasReturnLeg: false, status: "cancelled", seatReturnStatus: "not_applicable" }),
    { outbound: 3, inbound: 0 },
  );
});

test("paid invoices stay paid; anything else is voided", () => {
  assert.equal(invoiceStatusAfterCancellation("paid"), "paid");
  assert.equal(invoiceStatusAfterCancellation("unpaid"), "cancelled");
  assert.equal(invoiceStatusAfterCancellation("failed"), "cancelled");
});

test("reason codes are unique, labelled, and validated", () => {
  const codes = CANCELLATION_REASONS.map((r) => r.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const r of CANCELLATION_REASONS) {
    assert.ok(isCancellationReason(r.code));
    assert.ok(cancellationReasonLabel(r.code));
  }
  assert.equal(isCancellationReason("not-a-reason"), false);
  assert.equal(cancellationReasonLabel("not-a-reason"), "");
});

test("customer wording reads as a clause and avoids shouty spam style", () => {
  assert.equal(cancellationReasonCustomerText("customer_request"), "at your request");
  assert.equal(cancellationReasonCustomerText("other"), "");
  for (const r of CANCELLATION_REASONS) {
    assert.doesNotMatch(r.customerText, /!|[A-Z]{3,}/);
  }
});
