-- E-ticket / itinerary terminal fields. Existing charter sectors print as 1
-- (Perth T1 / Paro main), matching the client's updated travel document.
ALTER TABLE "Flight" ADD COLUMN "departureTerminal" TEXT NOT NULL DEFAULT '1';
ALTER TABLE "Flight" ADD COLUMN "arrivalTerminal" TEXT NOT NULL DEFAULT '1';
