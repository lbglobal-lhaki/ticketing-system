-- Closed fares keep remainingSeats at 0 when unpaid invoices or carts lapse.
ALTER TABLE "FareRelease" ADD COLUMN "salesClosed" BOOLEAN NOT NULL DEFAULT false;

-- Any fare already showing 0 remaining is treated as closed for sale.
UPDATE "FareRelease" SET "salesClosed" = true WHERE "remainingSeats" <= 0;
