-- Unique Stripe PaymentIntent → one invoice (NULLs allowed for bank/cash).
-- Deduplicate any accidental repeats before adding the constraint.
WITH ranked AS (
  SELECT
    id,
    "stripePaymentIntentId",
    ROW_NUMBER() OVER (
      PARTITION BY "stripePaymentIntentId"
      ORDER BY "createdAt" ASC
    ) AS rn
  FROM "Invoice"
  WHERE "stripePaymentIntentId" IS NOT NULL
)
UPDATE "Invoice" AS i
SET "stripePaymentIntentId" = i."stripePaymentIntentId" || '-dup-' || i.id
FROM ranked AS r
WHERE i.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_stripePaymentIntentId_key"
  ON "Invoice"("stripePaymentIntentId");

-- Admin login brute-force guard
CREATE TABLE IF NOT EXISTS "AdminLoginGuard" (
  "key" TEXT NOT NULL,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminLoginGuard_pkey" PRIMARY KEY ("key")
);
