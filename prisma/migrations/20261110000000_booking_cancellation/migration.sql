-- Admin booking cancellation: audit trail, customer notification tracking,
-- and the manual seat-return review queue (Cancellations tab).
-- Additive and nullable/defaulted, so it is safe to deploy ahead of the code.
ALTER TABLE "Booking" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "cancelledBy" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Booking" ADD COLUMN "cancellationReason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Booking" ADD COLUMN "cancellationNote" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Booking" ADD COLUMN "cancellationEmailSentAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "seatReturnStatus" TEXT NOT NULL DEFAULT 'not_applicable';
ALTER TABLE "Booking" ADD COLUMN "seatsReturnedOutbound" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Booking" ADD COLUMN "seatsReturnedReturn" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Booking" ADD COLUMN "seatReturnDecidedAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "seatReturnDecidedBy" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Booking" ADD COLUMN "seatReturnNote" TEXT NOT NULL DEFAULT '';

CREATE INDEX "Booking_status_seatReturnStatus_idx" ON "Booking"("status", "seatReturnStatus");
