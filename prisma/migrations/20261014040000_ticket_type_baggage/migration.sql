-- AlterTable
ALTER TABLE "CargoWeightOption" ADD COLUMN "sellAsCargo" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "includedBaggageKg" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Booking" ADD COLUMN "includedBaggageLabel" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "TicketTypeBaggageAllocation" (
    "id" TEXT NOT NULL,
    "cabinClass" "CabinClass" NOT NULL,
    "ticketTypeName" TEXT NOT NULL,
    "ticketTypeKey" TEXT NOT NULL,
    "cargoWeightOptionId" TEXT NOT NULL,
    "includedKg" INTEGER NOT NULL,
    "cabinBaggageKg" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketTypeBaggageAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketTypeBaggageAllocation_cabinClass_ticketTypeKey_key" ON "TicketTypeBaggageAllocation"("cabinClass", "ticketTypeKey");

-- CreateIndex
CREATE INDEX "TicketTypeBaggageAllocation_cargoWeightOptionId_idx" ON "TicketTypeBaggageAllocation"("cargoWeightOptionId");

-- AddForeignKey
ALTER TABLE "TicketTypeBaggageAllocation" ADD CONSTRAINT "TicketTypeBaggageAllocation_cargoWeightOptionId_fkey" FOREIGN KEY ("cargoWeightOptionId") REFERENCES "CargoWeightOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
