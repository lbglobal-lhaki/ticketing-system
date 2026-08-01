-- AlterTable
ALTER TABLE "CargoSubmission" ADD COLUMN IF NOT EXISTS "parcelNumber" TEXT;

-- Backfill existing rows with stable unique parcel numbers
UPDATE "CargoSubmission"
SET "parcelNumber" = 'CGO-' || to_char("createdAt" AT TIME ZONE 'UTC', 'YYYYMMDD') || '-' || UPPER(substr(md5("id"), 1, 6))
WHERE "parcelNumber" IS NULL OR TRIM("parcelNumber") = '';

-- Enforce required + unique
ALTER TABLE "CargoSubmission" ALTER COLUMN "parcelNumber" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "CargoSubmission_parcelNumber_key" ON "CargoSubmission"("parcelNumber");
CREATE INDEX IF NOT EXISTS "CargoSubmission_parcelNumber_idx" ON "CargoSubmission"("parcelNumber");
