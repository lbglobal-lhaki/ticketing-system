-- CreateEnum
CREATE TYPE "DeletedEntityType" AS ENUM ('flight', 'booking', 'invoice', 'cargo');

-- CreateTable
CREATE TABLE "DeletedRecord" (
    "id" TEXT NOT NULL,
    "entityType" "DeletedEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "snapshot" JSONB NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedBy" TEXT NOT NULL DEFAULT 'admin',

    CONSTRAINT "DeletedRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeletedRecord_entityType_deletedAt_idx" ON "DeletedRecord"("entityType", "deletedAt");

-- CreateIndex
CREATE INDEX "DeletedRecord_deletedAt_idx" ON "DeletedRecord"("deletedAt");
