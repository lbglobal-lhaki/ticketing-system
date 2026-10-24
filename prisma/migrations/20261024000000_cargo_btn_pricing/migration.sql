-- AlterTable
ALTER TABLE "CargoWeightOption" ADD COLUMN "priceBtnCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CargoSubmission" ADD COLUMN "quotedBtnCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CargoSubmission" ADD COLUMN "freightBtnCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CargoSubmission" ADD COLUMN "gstBtnCents" INTEGER NOT NULL DEFAULT 0;
