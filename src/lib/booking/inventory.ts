import { prisma } from "@/lib/db";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function decrementFareAndFlight(
  tx: Tx,
  flightId: string,
  fareReleaseId: string,
  seats: number,
) {
  if (seats < 1) return;
  const fareUpdated = await tx.fareRelease.updateMany({
    where: { id: fareReleaseId, remainingSeats: { gte: seats } },
    data: { remainingSeats: { decrement: seats } },
  });
  if (fareUpdated.count !== 1) {
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
 * row's `totalSeats`. Single atomic `UPDATE ... SET x = LEAST(...)` per row
 * (no read-then-write) so this can't race with a concurrent restore/decrement
 * on the same row, and so it stays fast inside an interactive transaction —
 * this runs inside best-effort hold-expiry sweeps that can process many rows
 * back-to-back, where each extra round trip adds up toward the transaction's
 * timeout.
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
      SET "remainingSeats" = LEAST("totalSeats", "remainingSeats" + ${seats})
      WHERE "id" = ${fareReleaseId}
    `;
  }
  await tx.$executeRaw`
    UPDATE "Flight"
    SET "remainingSeats" = LEAST("totalSeats", "remainingSeats" + ${seats})
    WHERE "id" = ${flightId}
  `;
}

/** Adjust soft-held seats on an active quote to match `targetSeats`. */
export async function syncQuoteSeatHold(
  quoteId: string,
  sessionId: string,
  targetSeats: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await prisma.$transaction(
      async (tx) => {
        const quote = await tx.priceQuote.findUnique({
          where: { id: quoteId },
        });
        if (!quote || quote.sessionId !== sessionId) {
          throw new Error("Quote not found");
        }
        if (quote.status !== "active" || quote.expiresAt <= new Date()) {
          throw new Error("Quote has expired");
        }
        if (!quote.fareReleaseId) {
          throw new Error("Quote missing fare release");
        }

        const seats = Math.min(9, Math.max(1, targetSeats));
        const held = quote.inventoryHeld ? quote.heldSeats : 0;
        const delta = seats - held;

        if (delta > 0) {
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
      if (!quote || quote.status !== "active") return;

      if (quote.inventoryHeld && quote.heldSeats > 0 && quote.fareReleaseId) {
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
    },
    { maxWait: 15_000, timeout: 30_000 },
  );
}
