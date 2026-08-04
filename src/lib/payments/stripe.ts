import Stripe from "stripe";

let cachedClient: Stripe | null = null;

export function isStripeConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  );
}

export function getStripePublicConfig() {
  return {
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
    configured: isStripeConfigured(),
  };
}

export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!cachedClient) {
    cachedClient = new Stripe(secretKey);
  }
  return cachedClient;
}

/**
 * Create (or, with the same idempotency key, return the existing) PaymentIntent
 * for a checkout attempt. Card-only, AUD. Callers should derive the
 * idempotency key from stable inputs (quoteId + seats + amount) so refreshing
 * the checkout page doesn't spawn duplicate PaymentIntents.
 */
export async function createPaymentIntent(input: {
  amountCents: number;
  idempotencyKey: string;
  quoteId: string;
  sessionId: string;
  seatsBooked: number;
  description: string;
  receiptEmail?: string;
}) {
  const client = getStripeClient();
  try {
    const intent = await client.paymentIntents.create(
      {
        amount: Math.round(input.amountCents),
        currency: "aud",
        payment_method_types: ["card"],
        description: input.description.slice(0, 500),
        receipt_email: input.receiptEmail || undefined,
        metadata: {
          quoteId: input.quoteId,
          sessionId: input.sessionId,
          seatsBooked: String(Math.max(1, Math.round(input.seatsBooked))),
        },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    if (!intent.client_secret) {
      throw new Error("Stripe did not return a client secret");
    }
    return { id: intent.id, clientSecret: intent.client_secret };
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      throw new Error(error.message);
    }
    throw error;
  }
}

export function constructStripeWebhookEvent(
  payload: string | Buffer,
  signature: string,
) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  return getStripeClient().webhooks.constructEvent(payload, signature, secret);
}

export async function retrievePaymentIntent(paymentIntentId: string) {
  const client = getStripeClient();
  try {
    return await client.paymentIntents.retrieve(paymentIntentId);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      throw new Error(error.message);
    }
    throw error;
  }
}

export async function refundPaymentIntent(input: {
  paymentIntentId: string;
  idempotencyKey: string;
  amountCents?: number;
}) {
  const client = getStripeClient();
  try {
    const refund = await client.refunds.create(
      {
        payment_intent: input.paymentIntentId,
        amount: input.amountCents ? Math.round(input.amountCents) : undefined,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return { refundId: refund.id };
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      throw new Error(error.message);
    }
    throw error;
  }
}
