-- CreateEnum
CREATE TYPE "CargoWeightKind" AS ENUM ('fixed', 'per_kg');

-- CreateTable
CREATE TABLE "CargoWeightOption" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "kind" "CargoWeightKind" NOT NULL,
    "minKg" INTEGER NOT NULL DEFAULT 0,
    "maxKg" INTEGER,
    "chargeableKg" INTEGER NOT NULL DEFAULT 0,
    "priceCents" INTEGER NOT NULL,
    "origins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CargoWeightOption_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "CargoSubmission" ADD COLUMN "cargoWeightOptionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CargoWeightOption_code_key" ON "CargoWeightOption"("code");

-- CreateIndex
CREATE INDEX "CargoWeightOption_active_sortOrder_idx" ON "CargoWeightOption"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "CargoSubmission_cargoWeightOptionId_idx" ON "CargoSubmission"("cargoWeightOptionId");

-- AddForeignKey
ALTER TABLE "CargoSubmission" ADD CONSTRAINT "CargoSubmission_cargoWeightOptionId_fkey" FOREIGN KEY ("cargoWeightOptionId") REFERENCES "CargoWeightOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
