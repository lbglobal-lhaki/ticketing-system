-- CreateTable
CREATE TABLE "CargoProduct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "ratePerKgCents" INTEGER NOT NULL DEFAULT 0,
    "minChargeCents" INTEGER NOT NULL DEFAULT 0,
    "handlingCents" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CargoProduct_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "CargoSubmission" ADD COLUMN "cargoProductId" TEXT,
ADD COLUMN "productName" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "CargoProduct_slug_key" ON "CargoProduct"("slug");

-- CreateIndex
CREATE INDEX "CargoProduct_active_sortOrder_idx" ON "CargoProduct"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "CargoSubmission_cargoProductId_idx" ON "CargoSubmission"("cargoProductId");

-- AddForeignKey
ALTER TABLE "CargoSubmission" ADD CONSTRAINT "CargoSubmission_cargoProductId_fkey" FOREIGN KEY ("cargoProductId") REFERENCES "CargoProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
