-- CreateEnum
CREATE TYPE "CargoEmailRole" AS ENUM ('sender', 'receiver');

-- CreateEnum
CREATE TYPE "CargoEmailStatus" AS ENUM ('draft', 'sent');

-- CreateTable
CREATE TABLE "CargoEmailNotice" (
    "id" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "role" "CargoEmailRole" NOT NULL,
    "toEmail" TEXT NOT NULL,
    "toName" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL DEFAULT '',
    "pickupLocation" TEXT NOT NULL DEFAULT '',
    "arrivalNote" TEXT NOT NULL DEFAULT '',
    "status" "CargoEmailStatus" NOT NULL DEFAULT 'draft',
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CargoEmailNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CargoEmailNotice_cargoId_role_idx" ON "CargoEmailNotice"("cargoId", "role");

-- CreateIndex
CREATE INDEX "CargoEmailNotice_cargoId_status_idx" ON "CargoEmailNotice"("cargoId", "status");

-- CreateIndex
CREATE INDEX "CargoEmailNotice_createdAt_idx" ON "CargoEmailNotice"("createdAt");

-- AddForeignKey
ALTER TABLE "CargoEmailNotice" ADD CONSTRAINT "CargoEmailNotice_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "CargoSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
