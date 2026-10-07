-- AlterTable
ALTER TABLE "Flight" ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "activeBeforeDelete" BOOLEAN;

-- CreateIndex
CREATE INDEX "Flight_deletedAt_idx" ON "Flight"("deletedAt");
