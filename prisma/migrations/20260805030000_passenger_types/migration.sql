-- CreateEnum
CREATE TYPE "PassengerType" AS ENUM ('adult', 'child', 'infant');

-- AlterTable
ALTER TABLE "BookingPassenger" ADD COLUMN "passengerType" "PassengerType" NOT NULL DEFAULT 'adult';
ALTER TABLE "BookingPassenger" ADD COLUMN "priceCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BookingPassenger" ADD COLUMN "allocatesSeat" BOOLEAN NOT NULL DEFAULT true;
