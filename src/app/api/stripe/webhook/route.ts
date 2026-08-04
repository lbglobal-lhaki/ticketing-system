import { after } from "next/server";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { sendBookingConfirmationBundle } from "@/lib/email/bookingMail";
import { fulfillCardPayment } from "@/lib/payments/fulfillCardPayment";
import { constructStripeWebhookEvent } from "@/lib/payments/stripe";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const payload = await request.text();
    event = constructStripeWebhookEvent(payload, signature);
  } catch (error) {
    console.error("stripe webhook signature failed", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const result = await fulfillCardPayment({
        paymentIntentId: intent.id,
      });

      if (result.ok && !result.alreadyFulfilled) {
        const bookingId = result.booking.id;
        after(async () => {
          try {
            await sendBookingConfirmationBundle(bookingId);
          } catch (err) {
            console.error("webhook confirmation email failed", err);
          }
        });
      }

      if (!result.ok) {
        // Still 200 so Stripe doesn't hammer retries on intentional refunds
        // (amount mismatch). Log for ops.
        console.error("stripe webhook fulfill failed", intent.id, result.error);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("stripe webhook handler failed", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
