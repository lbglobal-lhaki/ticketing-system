-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_quoteId_fkey";

-- AlterTable
ALTER TABLE "CharterFareProduct" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "PriceQuote_status_expiresAt_idx" ON "PriceQuote"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "PriceQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
