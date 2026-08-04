-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "extraBaggageKg" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Flight" ADD COLUMN     "returnLegFlightId" TEXT;

-- CreateIndex
CREATE INDEX "Flight_returnLegFlightId_idx" ON "Flight"("returnLegFlightId");

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_returnLegFlightId_fkey" FOREIGN KEY ("returnLegFlightId") REFERENCES "Flight"("id") ON DELETE SET NULL ON UPDATE CASCADE;
