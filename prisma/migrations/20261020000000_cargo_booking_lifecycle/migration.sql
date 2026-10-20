-- CreateEnum
CREATE TYPE "CargoBookingStatus" AS ENUM ('pending_payment', 'confirmed', 'cancelled');

-- CreateEnum
CREATE TYPE "CargoPaymentStatus" AS ENUM ('unpaid', 'partially_paid', 'paid', 'refunded');

-- CreateEnum
CREATE TYPE "CargoNotificationKind" AS ENUM ('acknowledgement', 'confirmation');

-- CreateEnum
CREATE TYPE "CargoNotificationStatus" AS ENUM ('pending', 'processing', 'sent', 'failed');

-- AlterTable
ALTER TABLE "CargoSubmission" ADD COLUMN "freightCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CargoSubmission" ADD COLUMN "gstCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CargoSubmission" ADD COLUMN "gstRateBps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CargoSubmission" ADD COLUMN "bookingStatus" "CargoBookingStatus" NOT NULL DEFAULT 'pending_payment';
ALTER TABLE "CargoSubmission" ADD COLUMN "paymentStatus" "CargoPaymentStatus" NOT NULL DEFAULT 'unpaid';
ALTER TABLE "CargoSubmission" ADD COLUMN "paidAmountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CargoSubmission" ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CargoSubmission" ADD COLUMN "paymentReference" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CargoSubmission" ADD COLUMN "paidVerifiedBy" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CargoSubmission" ADD COLUMN "invoiceSentAt" TIMESTAMP(3);
ALTER TABLE "CargoSubmission" ADD COLUMN "confirmationSentAt" TIMESTAMP(3);
ALTER TABLE "CargoSubmission" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "CargoSubmission" ADD COLUMN "clientRequestId" TEXT;

-- Historical paid bookings stay confirmed with the amount they already paid.
-- Do not invent GST on issued invoices.
UPDATE "CargoSubmission"
SET
  "bookingStatus" = 'confirmed',
  "paymentStatus" = 'paid',
  "paidAmountCents" = "quotedCents",
  "freightCents" = "quotedCents",
  "gstCents" = 0,
  "gstRateBps" = 0
WHERE "paid" = true;

UPDATE "CargoSubmission"
SET "freightCents" = "quotedCents"
WHERE "paid" = false AND "freightCents" = 0 AND "quotedCents" > 0;

-- CreateIndex
CREATE UNIQUE INDEX "CargoSubmission_clientRequestId_key" ON "CargoSubmission"("clientRequestId");

-- CreateIndex
CREATE INDEX "CargoSubmission_bookingStatus_idx" ON "CargoSubmission"("bookingStatus");

-- CreateIndex
CREATE INDEX "CargoSubmission_paymentStatus_idx" ON "CargoSubmission"("paymentStatus");

-- CreateTable
CREATE TABLE "CargoNotification" (
    "id" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "kind" "CargoNotificationKind" NOT NULL,
    "status" "CargoNotificationStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CargoNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CargoNotification_idempotencyKey_key" ON "CargoNotification"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CargoNotification_cargoId_kind_idx" ON "CargoNotification"("cargoId", "kind");

-- CreateIndex
CREATE INDEX "CargoNotification_status_idx" ON "CargoNotification"("status");

-- AddForeignKey
ALTER TABLE "CargoNotification" ADD CONSTRAINT "CargoNotification_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "CargoSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
