"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminSession } from "@/lib/adminAuth";
import {
  BookingCancellationError,
  cancelBooking,
  decideSeatReturn,
  sendBookingCancelledEmail,
} from "@/lib/booking/cancelBooking";
import {
  CANCELLATION_NOTE_MAX,
  SEAT_DECISION_NOTE_MAX,
  isCancellationReason,
} from "@/lib/booking/cancellationPolicy";

const BOOKINGS = "/admin?tab=bookings";
const CANCELLATIONS = "/admin?tab=cancellations";

function fail(message: string): never {
  redirect(`${BOOKINGS}&error=${encodeURIComponent(message)}`);
}

const cancelSchema = z.object({
  id: z.string().trim().min(1, "Missing booking"),
  reason: z
    .string()
    .trim()
    .refine(isCancellationReason, "Choose a cancellation reason"),
  note: z
    .string()
    .trim()
    .max(
      CANCELLATION_NOTE_MAX,
      `Keep the note under ${CANCELLATION_NOTE_MAX} characters`,
    )
    .default(""),
  notifyCustomer: z.boolean(),
});

/**
 * Admin: cancel a booking, release its seats, and optionally email the
 * customer. The email is sent only after the cancellation commits; if it
 * fails, the booking stays cancelled and the admin sees a warning with the
 * option to resend.
 */
export async function cancelBookingAction(formData: FormData) {
  const session = await getAdminSession();
  if (!session) redirect("/admin?error=Unauthorized");

  const parsed = cancelSchema.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason") ?? "",
    note: formData.get("note") ?? "",
    notifyCustomer: formData.get("notifyCustomer") === "on",
  });
  if (!parsed.success) {
    fail(parsed.error.issues[0]?.message ?? "Invalid cancellation");
  }
  const input = parsed.data;
  if (input.reason === "other" && !input.note) {
    fail('Add a note to the customer when the reason is "Other".');
  }

  let bookingRef: string;
  try {
    const result = await cancelBooking({
      bookingId: input.id,
      reason: input.reason as Parameters<typeof cancelBooking>[0]["reason"],
      note: input.note,
      cancelledBy: session.role,
    });
    bookingRef = result.bookingRef;
  } catch (error) {
    if (error instanceof BookingCancellationError) fail(error.message);
    console.error("[booking:cancel] failed", { bookingId: input.id, error });
    fail("Could not cancel the booking. Nothing was changed — please try again.");
  }

  console.info("[booking:cancel]", {
    bookingRef,
    reason: input.reason,
    by: session.role,
    notifyCustomer: input.notifyCustomer,
  });
  revalidatePath("/admin");

  if (!input.notifyCustomer) {
    redirect(`${BOOKINGS}&saved=booking-cancelled`);
  }

  const mail = await sendBookingCancelledEmail(input.id);
  if (!mail.ok) {
    console.error("[booking:cancel] email failed", {
      bookingRef,
      error: mail.error,
    });
    redirect(
      `${BOOKINGS}&saved=booking-cancelled&error=${encodeURIComponent(
        `Booking ${bookingRef} is cancelled, but the email could not be sent: ${mail.error} Use "Send cancellation email" to retry.`,
      )}`,
    );
  }
  redirect(`${BOOKINGS}&saved=booking-cancelled-emailed`);
}

/** Admin: (re)send the "booking cancelled" email for a cancelled booking. */
export async function sendBookingCancellationEmailAction(formData: FormData) {
  const session = await getAdminSession();
  if (!session) redirect("/admin?error=Unauthorized");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) fail("Missing booking");

  const mail = await sendBookingCancelledEmail(id);
  if (!mail.ok) fail(`Cancellation email not sent: ${mail.error}`);

  console.info("[booking:cancel-email] sent", { bookingId: id, by: session.role });
  revalidatePath("/admin");
  redirect(`${BOOKINGS}&saved=booking-cancellation-emailed`);
}

const seatDecisionSchema = z.object({
  id: z.string().trim().min(1, "Missing booking"),
  decision: z.enum(["return", "keep"]),
  outbound: z.coerce.number().int("Seat counts must be whole numbers").min(0),
  inbound: z.coerce.number().int("Seat counts must be whole numbers").min(0),
  note: z
    .string()
    .trim()
    .max(
      SEAT_DECISION_NOTE_MAX,
      `Keep the note under ${SEAT_DECISION_NOTE_MAX} characters`,
    )
    .default(""),
});

/**
 * Full admin: decide whether a cancelled booking's seats go back on sale.
 * Changing sellable inventory is restricted to the full admin login, the same
 * as the Flights and pricing tabs; sub-admins can view the queue.
 */
export async function decideSeatReturnAction(formData: FormData) {
  const session = await getAdminSession();
  if (!session) redirect("/admin?error=Unauthorized");
  const back: (message: string) => never = (message) =>
    redirect(`${CANCELLATIONS}&error=${encodeURIComponent(message)}`);
  if (session.role !== "admin") {
    back("Only the full admin login can return seats to sale.");
  }

  const parsed = seatDecisionSchema.safeParse({
    id: formData.get("id"),
    decision: formData.get("decision"),
    outbound: formData.get("outbound") ?? 0,
    inbound: formData.get("inbound") ?? 0,
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    back(parsed.error.issues[0]?.message ?? "Invalid seat decision");
  }
  const input = parsed.data;
  if (input.decision === "keep" && !input.note) {
    back("Add a note explaining why the seats are not being returned.");
  }

  let result: Awaited<ReturnType<typeof decideSeatReturn>>;
  try {
    result = await decideSeatReturn({
      bookingId: input.id,
      decision: input.decision,
      outbound: input.outbound,
      inbound: input.inbound,
      note: input.note,
      decidedBy: session.role,
    });
  } catch (error) {
    if (error instanceof BookingCancellationError) back(error.message);
    console.error("[booking:seat-decision] failed", { bookingId: input.id, error });
    back("Could not save the seat decision. Nothing was changed — please try again.");
  }

  console.info("[booking:seat-decision]", {
    bookingRef: result.bookingRef,
    decision: input.decision,
    outbound: result.outbound,
    inbound: result.inbound,
    by: session.role,
  });
  revalidatePath("/admin");
  revalidatePath("/flights");
  revalidatePath("/");
  redirect(
    `${CANCELLATIONS}&saved=${
      input.decision === "return" ? "seats-returned" : "seats-not-returned"
    }`,
  );
}
