import { prisma } from "@/lib/db";

export {
  remainingAfterRestore,
  salesClosedFromRemaining,
} from "@/lib/booking/inventoryPolicy";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function decrementFareAndFlight(
  tx: Tx,
  flightId: string,
  fareReleaseId: string,
  seats: number,
) {
  if (seats < 1) return;
  const fareUpdated = await tx.$executeRaw`
    UPDATE "FareRelease"
    SET
      "remainingSeats" = "remainingSeats" - ${seats},
      "salesClosed" = "salesClosed" OR ("remainingSeats" - ${seats}) <= 0
    WHERE "id" = ${fareReleaseId}
      AND "remainingSeats" >= ${seats}
      AND "salesClosed" = false
  `;
  if (Number(fareUpdated) !== 1) {
    throw new Error("Not enough seats in this fare release");
  }

  const flightUpdated = await tx.flight.updateMany({
    where: { id: flightId, remainingSeats: { gte: seats } },
    data: { remainingSeats: { decrement: seats } },
  });
  if (flightUpdated.count !== 1) {
    throw new Error("Not enough seats remaining");
  }
}

/**
 * Restores `seats` back onto a fare release + its flight, clamped to each
 * row's `totalSeats`. Closed fares (`salesClosed`) keep remaining at 0 so a
 * cancelled invoice cannot reopen a sold-out cabin. Single atomic
 * `UPDATE ... SET x = LEAST(...)` per row so this can't race with a concurrent
 * restore/decrement, and so it stays fast inside hold-expiry sweeps.
 */
export async function restoreFareAndFlight(
  tx: Tx,
  flightId: string,
  fareReleaseId: string | null,
  seats: number,
) {
  if (seats < 1) return;
  if (fareReleaseId) {
    await tx.$executeRaw`
      UPDATE "FareRelease"
      SET "remainingSeats" = CASE
        WHEN "salesClosed" THEN "remainingSeats"
        ELSE LEAST("totalSeats", "remainingSeats" + ${seats})
      END
      WHERE "id" = ${fareReleaseId}
    `;
    await tx.$executeRaw`
      UPDATE "Flight"
      SET "remainingSeats" = LEAST("totalSeats", "remainingSeats" + ${seats})
      WHERE "id" = ${flightId}
        AND NOT EXISTS (
          SELECT 1 FROM "FareRelease"
          WHERE "id" = ${fareReleaseId} AND "salesClosed" = true
        )
    `;
    return;
  }
  await tx.$executeRaw`
    UPDATE "Flight"
    SET "remainingSeats" = LEAST("totalSeats", "remainingSeats" + ${seats})
    WHERE "id" = ${flightId}
  `;
}

async function expireQuoteInTx(
  tx: Tx,
  quote: {
    id: string;
    status: string;
    inventoryHeld: boolean;
    heldSeats: number;
    flightId: string;
    fareReleaseId: string | null;
    returnFlightId: string | null;
    returnFareReleaseId: string | null;
  },
  restoreInventory: boolean,
) {
  if (quote.status !== "active") return;
  if (
    restoreInventory &&
    quote.inventoryHeld &&
    quote.heldSeats > 0 &&
    quote.fareReleaseId
  ) {
    await restoreFareAndFlight(
      tx,
      quote.flightId,
      quote.fareReleaseId,
      quote.heldSeats,
    );
    if (quote.returnFlightId && quote.returnFareReleaseId) {
      await restoreFareAndFlight(
        tx,
        quote.returnFlightId,
        quote.returnFareReleaseId,
        quote.heldSeats,
      );
    }
  }
  await tx.priceQuote.update({
    where: { id: quote.id },
    data: {
      status: "expired",
      inventoryHeld: false,
      heldSeats: 0,
    },
  });
}

/** Drop open carts for a fare that ops has closed, without putting seats back. */
export async function expireQuotesForClosedFare(tx: Tx, fareReleaseId: string) {
  const quotes = await tx.priceQuote.findMany({
    where: {
      status: "active",
      OR: [
        { fareReleaseId },
        { returnFareReleaseId: fareReleaseId },
      ],
    },
  });
  for (const quote of quotes) {
    await expireQuoteInTx(tx, quote, false);
  }
}

/** Adjust soft-held seats on an active quote to match `targetSeats`. */
export async function syncQuoteSeatHold(
  quoteId: string,
  sessionId: string,
  targetSeats: number,
  opts?: { paidCapture?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const paidCapture = Boolean(opts?.paidCapture);
  try {
    await prisma.$transaction(
      async (tx) => {
        const quote = await tx.priceQuote.findUnique({
          where: { id: quoteId },
        });
        if (!quote || quote.sessionId !== sessionId) {
          throw new Error("Quote not found");
        }
        if (quote.status === "used") {
          if (paidCapture) return;
          throw new Error("Quote already used");
        }
        const lapsed =
          quote.status === "expired" || quote.expiresAt <= new Date();
        if (lapsed && !paidCapture) {
          throw new Error("Quote has expired");
        }
        if (!quote.fareReleaseId) {
          throw new Error("Quote missing fare release");
        }

        if (lapsed && paidCapture) {
          await tx.priceQuote.update({
            where: { id: quote.id },
            data: {
              status: "active",
              expiresAt: new Date(Date.now() + 30 * 60 * 1000),
            },
          });
        }

        const seats = Math.min(9, Math.max(1, targetSeats));
        const held = quote.inventoryHeld ? quote.heldSeats : 0;
        const delta = seats - held;

        if (delta > 0) {
          try {
            await decrementFareAndFlight(
              tx,
              quote.flightId,
              quote.fareReleaseId,
              delta,
            );
            if (quote.returnFlightId && quote.returnFareReleaseId) {
              await decrementFareAndFlight(
                tx,
                quote.returnFlightId,
                quote.returnFareReleaseId,
                delta,
              );
            }
          } catch (error) {
            if (!paidCapture) throw error;
            console.error(
              "PAID_CAPTURE_OVERBOOK",
              quoteId,
              error instanceof Error ? error.message : error,
            );
          }
        } else if (delta < 0) {
          await restoreFareAndFlight(
            tx,
            quote.flightId,
            quote.fareReleaseId,
            -delta,
          );
          if (quote.returnFlightId && quote.returnFareReleaseId) {
            await restoreFareAndFlight(
              tx,
              quote.returnFlightId,
              quote.returnFareReleaseId,
              -delta,
            );
          }
        }

        await tx.priceQuote.update({
          where: { id: quote.id },
          data: {
            seatsBooked: seats,
            heldSeats: seats,
            inventoryHeld: true,
          },
        });
      },
      { maxWait: 15_000, timeout: 30_000 },
    );
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not hold seats",
    };
  }
}

/** Release soft-held seats and mark quote expired. */
export async function releaseQuoteHold(quoteId: string) {
  await prisma.$transaction(
    async (tx) => {
      const quote = await tx.priceQuote.findUnique({ where: { id: quoteId } });
      if (!quote) return;
      await expireQuoteInTx(tx, quote, true);
    },
    { maxWait: 15_000, timeout: 30_000 },
  );
}
