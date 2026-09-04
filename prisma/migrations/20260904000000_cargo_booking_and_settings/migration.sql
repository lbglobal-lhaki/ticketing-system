-- Flight: shared passenger/cargo payload budget
ALTER TABLE "Flight" ADD COLUMN IF NOT EXISTS "cargoPayloadKg" INTEGER NOT NULL DEFAULT 13000;
ALTER TABLE "Flight" ADD COLUMN IF NOT EXISTS "cargoBookedKg" INTEGER NOT NULL DEFAULT 0;

-- CargoSubmission: structured booking fields (answers JSON stays as-is)
ALTER TABLE "CargoSubmission" ADD COLUMN IF NOT EXISTS "flightId" TEXT;
ALTER TABLE "CargoSubmission" ADD COLUMN IF NOT EXISTS "weightKg" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CargoSubmission" ADD COLUMN IF NOT EXISTS "pieces" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CargoSubmission" ADD COLUMN IF NOT EXISTS "quotedCents" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "CargoSubmission_flightId_idx" ON "CargoSubmission"("flightId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CargoSubmission_flightId_fkey'
  ) THEN
    ALTER TABLE "CargoSubmission"
      ADD CONSTRAINT "CargoSubmission_flightId_fkey"
      FOREIGN KEY ("flightId") REFERENCES "Flight"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Single-row admin settings
CREATE TABLE IF NOT EXISTS "SiteSetting" (
  "id" TEXT NOT NULL,
  "seatWindowCents" INTEGER NOT NULL DEFAULT 0,
  "seatExitRowCents" INTEGER NOT NULL DEFAULT 0,
  "seatStandardCents" INTEGER NOT NULL DEFAULT 0,
  "cargoRatePerKgCents" INTEGER NOT NULL DEFAULT 0,
  "cargoMinChargeCents" INTEGER NOT NULL DEFAULT 0,
  "defaultPayloadKg" INTEGER NOT NULL DEFAULT 13000,
  "passengerPayloadKg" INTEGER NOT NULL DEFAULT 100,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SiteSetting" ("id", "updatedAt")
VALUES ('default', NOW())
ON CONFLICT ("id") DO NOTHING;
