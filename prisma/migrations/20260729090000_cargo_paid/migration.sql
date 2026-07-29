-- AlterTable
ALTER TABLE "CargoSubmission" ADD COLUMN IF NOT EXISTS "paid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CargoSubmission" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CargoSubmission_paid_idx" ON "CargoSubmission"("paid");
