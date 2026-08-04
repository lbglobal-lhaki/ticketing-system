"use server";

import { isRedirectError } from "next/dist/client/components/redirect-error";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { confirmBooking } from "@/lib/booking/confirmBooking";
import { withAccessToken } from "@/lib/documentAccess";
import {
  sendBankTransferBundle,
  sendBookingConfirmationBundle,
} from "@/lib/email/bookingMail";
import {
  getBankTransferDetails,
  isBankTransferConfigured,
} from "@/lib/payments/bank";
import { fulfillCardPayment } from "@/lib/payments/fulfillCardPayment";
import { isStripeConfigured } from "@/lib/payments/stripe";
import { getSessionId } from "@/lib/session";
import { bookingSchema } from "@/lib/validation";
import { z } from "zod";

const cardPaymentSchema = bookingSchema.extend({
  paymentIntentId: z.string().min(1, "Payment reference missing"),
});

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export async function payWithCardAction(input: {
  quoteId: string;
  passengerName: string;
  email: string;
  passengerPhone?: string;
  passportNumber?: string;
  nationality?: string;
  seatsBooked: number;
  paymentIntentId: string;
}): Promise<{ error?: string }> {
  try {
    if (!isStripeConfigured()) {
      return {
        error:
          "Card payments are not configured yet. Choose bank transfer instead.",
      };
    }

    const parsed = cardPaymentSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Invalid payment form",
      };
    }

    const sessionId = await getSessionId();
    if (!sessionId || sessionId === "anonymous") {
      return { error: "Missing browser session — refresh and try again" };
    }

    const result = await fulfillCardPayment({
      paymentIntentId: parsed.data.paymentIntentId,
      quoteId: parsed.data.quoteId,
      sessionId,
      seatsBooked: parsed.data.seatsBooked,
      passengerName: parsed.data.passengerName,
      email: parsed.data.email,
      passengerPhone: parsed.data.passengerPhone || "",
      passportNumber: parsed.data.passportNumber || "",
      nationality: parsed.data.nationality || "",
    });

    if (!result.ok) {
      return { error: result.error };
    }

    if (!result.alreadyFulfilled) {
      const bookingId = result.booking.id;
      after(async () => {
        try {
          await sendBookingConfirmationBundle(bookingId);
        } catch (err) {
          console.error("confirmation email failed", err);
        }
      });
    }

    redirect(
      withAccessToken(
        `/confirmation/${result.booking.id}`,
        result.booking.accessToken,
      ),
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("payWithCardAction", error);
    return { error: toErrorMessage(error, "Unexpected card payment error") };
  }
}

export async function payWithBankTransferAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const fail = (error: string) => {
    console.error("payWithBankTransferAction:", error);
    return { error };
  };

  try {
    if (!isBankTransferConfigured()) {
      return fail(
        "Bank transfer is not configured. Ask admin to set bank account details.",
      );
    }

    const parsed = bookingSchema.safeParse({
      quoteId: formData.get("quoteId"),
      passengerName: formData.get("passengerName"),
      email: formData.get("email"),
      passengerPhone: formData.get("passengerPhone") || "",
      passportNumber: formData.get("passportNumber") || "",
      nationality: formData.get("nationality") || "",
      seatsBooked: formData.get("seatsBooked") || "1",
    });

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid form");
    }

    const sessionId = await getSessionId();
    if (!sessionId || sessionId === "anonymous") {
      return fail("Missing browser session — refresh and try again");
    }

    const bank = getBankTransferDetails();

    const result = await confirmBooking({
      ...parsed.data,
      passengerPhone: parsed.data.passengerPhone || "",
      passportNumber: parsed.data.passportNumber || "",
      nationality: parsed.data.nationality || "",
      sessionId,
      paymentMethod: "bank_transfer",
      invoiceStatus: "unpaid",
      bankDetails: bank,
    });

    if (!result.ok) {
      return fail(result.error);
    }

    const bookingId = result.booking.id;
    after(async () => {
      try {
        const mail = await sendBankTransferBundle(bookingId);
        if (!mail.ok) {
          console.error("bank transfer email failed", mail.error);
        }
      } catch (err) {
        console.error("bank transfer email failed", err);
      }
    });

    // Email is queued in the background — confirmation page should not wait
    // minutes for Chromium + SMTP before showing bank details.
    redirect(
      withAccessToken(
        `/confirmation/${result.booking.id}?invoice=1&emailed=1`,
        result.booking.accessToken,
      ),
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("payWithBankTransferAction", error);
    return fail(toErrorMessage(error, "Could not create bank transfer invoice"));
  }
}
