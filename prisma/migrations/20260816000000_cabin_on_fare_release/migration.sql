-- Cabins move from Flight to FareRelease.
--
-- A single aircraft carries both cabins, so one departure was previously
-- entered as two Flight rows (KB921 business + KB921 economy). Cabin now lives
-- on the fare bucket, letting one Flight hold every cabin's seat pools.
--
-- Existing fare releases inherit their flight's cabin so no row is left
-- mislabelled; merging the now-duplicate Flight rows is handled separately.

ALTER TABLE "FareRelease"
  ADD COLUMN "cabinClass" "CabinClass" NOT NULL DEFAULT 'economy';

UPDATE "FareRelease" fr
SET "cabinClass" = f."cabinClass"
FROM "Flight" f
WHERE fr."flightId" = f."id";

DROP INDEX IF EXISTS "FareRelease_flightId_sortOrder_idx";
CREATE INDEX "FareRelease_flightId_cabinClass_sortOrder_idx"
  ON "FareRelease" ("flightId", "cabinClass", "sortOrder");

ALTER TABLE "Flight" DROP COLUMN "cabinClass";
