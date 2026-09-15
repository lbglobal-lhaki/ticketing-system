-- AlterTable
CREATE TYPE "FlightPricingSource" AS ENUM ('charter', 'ticket_types');

ALTER TABLE "Flight" ADD COLUMN "pricingSource" "FlightPricingSource" NOT NULL DEFAULT 'charter';
