-- Distinct round-trip prices (not 2× one-way) on inventory releases and charter catalogue.
ALTER TABLE "FareRelease" ADD COLUMN "roundTripPriceCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CharterFareProduct" ADD COLUMN "roundTripPriceCents" INTEGER NOT NULL DEFAULT 0;
