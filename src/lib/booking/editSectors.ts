import { prisma } from "@/lib/db";
import {
  decrementFareAndFlight,
  restoreFareAndFlight,
} from "@/lib/booking/inventory";
import { getCurrentFareRelease } from "@/lib/fares/current";
import { cabinLabel, parseCabin } from "@/lib/fares/templates";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Works out the flights an edited booking travels on and moves its held seats
 * onto them. Covers changing the travel date (pick another flight), dropping
 * one sector of a round trip, and adding a return — the booking keeps its
 * reference, ticket numbers and invoice number throughout.
 *
 * A leg the booking already flies keeps its fare release; a new flight books
 * against its current release in the booking's cabin.
 */
export async function resolveEditedSectors(
  tx: Tx,
  booking: {
    status: string;
    flightId: string;
    fareReleaseId: string | null;
    returnFlightId: string | null;
    returnFareReleaseId: string | null;
    seatsBooked: number;
    fareRelease: { cabinClass: string } | null;
  },
  next: { flightId: string; returnFlightId: string | null; seatsBooked: number },
) {
  const changed =
    next.flightId !== booking.flightId ||
    next.returnFlightId !== (booking.returnFlightId ?? null);

  const ids = [next.flightId, ...(next.returnFlightId ? [next.returnFlightId] : [])];
  const flights = await tx.flight.findMany({
    where: { id: { in: ids } },
    include: { fareReleases: { orderBy: { sortOrder: "asc" } } },
  });
  const outbound = flights.find((f) => f.id === next.flightId);
  if (!outbound) throw new Error("Selected flight was not found");
  const inbound = next.returnFlightId
    ? flights.find((f) => f.id === next.returnFlightId)
    : null;
  if (next.returnFlightId && !inbound) {
    throw new Error("Selected return flight was not found");
  }

  const summary = {
    changed,
    flightId: outbound.id,
    returnFlightId: inbound?.id ?? null,
    fareReleaseId: booking.fareReleaseId,
    returnFareReleaseId: inbound ? booking.returnFareReleaseId : null,
    origin: outbound.origin,
    destination: outbound.destination,
    departureAt: outbound.departureAt,
  };
  if (!changed) return summary;

  if (booking.status !== "pending_payment" && booking.status !== "confirmed") {
    throw new Error(
      "Reactivate this booking before changing its flights — its seats were returned to the pool",
    );
  }
  if (inbound) {
    if (inbound.departureAt <= outbound.departureAt) {
      throw new Error("The return flight must depart after the departure flight");
    }
    if (
      inbound.origin !== outbound.destination ||
      inbound.destination !== outbound.origin
    ) {
      throw new Error(
        `The return flight must fly ${outbound.destination} → ${outbound.origin}`,
      );
    }
  }

  const cabin = parseCabin(booking.fareRelease?.cabinClass ?? "economy");
  const heldRelease = new Map<string, string | null>([
    [booking.flightId, booking.fareReleaseId],
    ...(booking.returnFlightId
      ? ([[booking.returnFlightId, booking.returnFareReleaseId]] as const)
      : []),
  ]);

  // Give back every seat held today, then hold the new count on the new
  // legs — a kept leg nets out to just the passenger-count difference.
  for (const [flightId, releaseId] of heldRelease) {
    await restoreFareAndFlight(tx, flightId, releaseId, booking.seatsBooked);
  }

  const holdOn = async (flight: (typeof flights)[number]) => {
    let releaseId = heldRelease.get(flight.id) ?? null;
    if (!releaseId) {
      const release = getCurrentFareRelease(flight.fareReleases, cabin, {
        roundTrip: Boolean(inbound),
      });
      if (!release) {
        throw new Error(
          `${flight.flightNumber} has no ${cabinLabel(cabin)} seats left to move this booking onto`,
        );
      }
      releaseId = release.id;
    }
    try {
      await decrementFareAndFlight(tx, flight.id, releaseId, next.seatsBooked);
    } catch {
      throw new Error(
        `${flight.flightNumber} doesn't have ${next.seatsBooked} ${cabinLabel(cabin)} seat${
          next.seatsBooked === 1 ? "" : "s"
        } free for this booking`,
      );
    }
    return releaseId;
  };

  summary.fareReleaseId = await holdOn(outbound);
  summary.returnFareReleaseId = inbound ? await holdOn(inbound) : null;
  return summary;
}
