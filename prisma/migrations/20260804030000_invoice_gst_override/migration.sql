-- Optional admin-entered GST amount (cents). When > 0, invoice totals use
-- this exact value instead of the 10% rate calculation.
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "gstOverrideCents" INTEGER NOT NULL DEFAULT 0;
