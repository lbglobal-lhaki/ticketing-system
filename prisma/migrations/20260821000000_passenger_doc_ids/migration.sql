-- Per-passenger booking refs and a distinct return-leg ticket number.
ALTER TABLE "BookingPassenger" ADD COLUMN IF NOT EXISTS "returnTicketNumber" TEXT;
ALTER TABLE "BookingPassenger" ADD COLUMN IF NOT EXISTS "bookingRef" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "BookingPassenger_returnTicketNumber_key" ON "BookingPassenger"("returnTicketNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "BookingPassenger_bookingRef_key" ON "BookingPassenger"("bookingRef");

-- Keep the wall-clock currently shown in Australia/Sydney, then store those
-- digits as UTC so DST can no longer shift times on save/print.
UPDATE "Flight"
SET
  "departureAt" = (("departureAt" AT TIME ZONE 'Australia/Sydney') AT TIME ZONE 'UTC'),
  "arrivalAt" = (("arrivalAt" AT TIME ZONE 'Australia/Sydney') AT TIME ZONE 'UTC');
