-- CreateEnum
CREATE TYPE "CargoSubmissionStatus" AS ENUM ('new', 'reviewed', 'closed');

-- CreateTable
CREATE TABLE "CargoSubmission" (
    "id" TEXT NOT NULL,
    "status" "CargoSubmissionStatus" NOT NULL DEFAULT 'new',
    "submitterName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "answers" JSONB NOT NULL,
    "googleResponseId" TEXT,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CargoSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CargoSubmission_googleResponseId_key" ON "CargoSubmission"("googleResponseId");

-- CreateIndex
CREATE INDEX "CargoSubmission_status_idx" ON "CargoSubmission"("status");

-- CreateIndex
CREATE INDEX "CargoSubmission_createdAt_idx" ON "CargoSubmission"("createdAt");

-- CreateIndex
CREATE INDEX "CargoSubmission_email_idx" ON "CargoSubmission"("email");
