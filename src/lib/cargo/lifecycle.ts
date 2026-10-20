export type CargoBookingStatus = "pending_payment" | "confirmed" | "cancelled";
export type CargoPaymentStatus =
  | "unpaid"
  | "partially_paid"
  | "paid"
  | "refunded";
export type CargoNotificationKind = "acknowledgement" | "confirmation";

export function canIssueCargoConfirmation(input: {
  paid: boolean;
  paymentStatus: string;
  bookingStatus: string;
}) {
  return (
    input.paid === true &&
    input.paymentStatus === "paid" &&
    input.bookingStatus === "confirmed"
  );
}

export function cargoPaymentOutcome(input: {
  totalCents: number;
  paidAmountCents: number;
  markPaid: boolean;
  currentlyCancelled: boolean;
}): {
  paymentStatus: CargoPaymentStatus;
  bookingStatus: CargoBookingStatus;
  paid: boolean;
  shouldConfirm: boolean;
} {
  if (input.currentlyCancelled) {
    const paidAmount = Math.max(0, Math.round(input.paidAmountCents));
    const total = Math.max(0, Math.round(input.totalCents));
    const fullyPaid = paidAmount > 0 && (total === 0 || paidAmount >= total);
    return {
      paymentStatus: fullyPaid
        ? "paid"
        : paidAmount > 0
          ? "partially_paid"
          : "unpaid",
      bookingStatus: "cancelled",
      paid: fullyPaid,
      shouldConfirm: false,
    };
  }

  if (!input.markPaid) {
    return {
      paymentStatus: "unpaid",
      bookingStatus: "pending_payment",
      paid: false,
      shouldConfirm: false,
    };
  }

  const paidAmount = Math.max(0, Math.round(input.paidAmountCents));
  const total = Math.max(0, Math.round(input.totalCents));

  if (total > 0 && paidAmount < total) {
    return {
      paymentStatus: paidAmount > 0 ? "partially_paid" : "unpaid",
      bookingStatus: "pending_payment",
      paid: false,
      shouldConfirm: false,
    };
  }

  return {
    paymentStatus: "paid",
    bookingStatus: "confirmed",
    paid: true,
    shouldConfirm: true,
  };
}

export function canonicalNotificationKey(
  cargoId: string,
  kind: CargoNotificationKind,
) {
  return `${cargoId}:${kind}`;
}

export function bookingStatusLabel(status: string) {
  if (status === "confirmed") return "Confirmed";
  if (status === "cancelled") return "Cancelled";
  return "Pending Payment";
}

export function paymentStatusLabel(status: string) {
  if (status === "paid") return "Paid";
  if (status === "partially_paid") return "Partially Paid";
  if (status === "refunded") return "Refunded";
  return "Unpaid";
}

export function notificationStatusLabel(status: string | null | undefined) {
  if (status === "sent") return "Sent";
  if (status === "failed") return "Failed";
  if (status === "processing") return "Pending";
  if (status === "pending") return "Pending";
  return "Not queued";
}
