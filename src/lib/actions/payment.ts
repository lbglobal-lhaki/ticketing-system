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
import { calculateCardServiceFee } from "@/lib/payments/fees";
import {
  isStripeConfigured,
  refundPaymentIntent,
  retrievePaymentIntent,
} from "@/lib/payments/stripe";
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

    const { prisma } = await import("@/lib/db");
    const quote = await prisma.priceQuote.findUnique({
      where: { id: parsed.data.quoteId },
      select: {
        quotedPriceCents: true,
        status: true,
        expiresAt: true,
        sessionId: true,
        inventoryHeld: true,
      },
    });

    if (!quote || quote.status !== "active") {
      return { error: "Quote is no longer available" };
    }
    if (quote.sessionId !== sessionId) {
      return { error: "Quote does not belong to this session" };
    }
    if (quote.expiresAt <= new Date()) {
      return { error: "Quote has expired — please book again" };
    }
    if (!quote.inventoryHeld) {
      return { error: "Seat hold expired — please select fares again" };
    }

    const fareCents =
      quote.quotedPriceCents * parsed.data.seatsBooked;
    const { totalCents, serviceFeeCents } = calculateCardServiceFee(fareCents);

    // The card was already charged client-side via Stripe's Payment Element —
    // verify the PaymentIntent server-side before trusting it (status, amount,
    // currency, and that it belongs to this quote) rather than taking the
    // client's word for it.
    let paymentIntentId: string;
    try {
      const intent = await retrievePaymentIntent(parsed.data.paymentIntentId);
      if (intent.status !== "succeeded") {
        return { error: `Payment was not completed (status: ${intent.status}).` };
      }
      if (intent.currency !== "aud") {
        return { error: "Payment currency mismatch — contact support." };
      }
      if (intent.amount !== totalCents) {
        // Funds were captured but for an unexpected amount — refund immediately.
        try {
          await refundPaymentIntent({
            paymentIntentId: intent.id,
            idempotencyKey: `refund-mismatch-${intent.id}`,
          });
        } catch (refundError) {
          console.error("mismatch auto-refund failed", refundError);
        }
        return {
          error:
            "Payment amount did not match the quote — your card was refunded. Please try again.",
        };
      }
      if (intent.metadata?.quoteId && intent.metadata.quoteId !== parsed.data.quoteId) {
        return { error: "Payment does not match this booking — contact support." };
      }
      paymentIntentId = intent.id;
    } catch (error) {
      return { error: toErrorMessage(error, "Could not verify card payment") };
    }

    const result = await confirmBooking({
      quoteId: parsed.data.quoteId,
      sessionId,
      passengerName: parsed.data.passengerName,
      email: parsed.data.email,
      passengerPhone: parsed.data.passengerPhone || "",
      passportNumber: parsed.data.passportNumber || "",
      nationality: parsed.data.nationality || "",
      seatsBooked: parsed.data.seatsBooked,
      paymentMethod: "card",
      invoiceStatus: "paid",
      stripePaymentIntentId: paymentIntentId,
      amountCentsOverride: totalCents,
      serviceFeeCents,
    });

    if (!result.ok) {
      try {
        await refundPaymentIntent({
          paymentIntentId,
          idempotencyKey: `refund-${paymentIntentId}`,
          amountCents: totalCents,
        });
      } catch (refundError) {
        console.error("auto-refund failed", refundError);
        return {
          error: `${result.error}. Card was charged (${paymentIntentId}) but booking failed — contact support; refund may need manual processing.`,
        };
      }
      return {
        error: `${result.error}. Your card charge was automatically refunded.`,
      };
    }

    const bookingId = result.booking.id;
    after(async () => {
      try {
        await sendBookingConfirmationBundle(bookingId);
      } catch (err) {
        console.error("confirmation email failed", err);
      }
    });

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
