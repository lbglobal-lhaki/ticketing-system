import Link from "next/link";
import { notFound } from "next/navigation";
import { FareComparisonRow } from "@/components/fares/FareComparisonRow";
import { SelectedFlightSummary } from "@/components/fares/SelectedFlightSummary";
import { getBrand } from "@/lib/branding";
import { prisma } from "@/lib/db";
import { buildCharterFareProducts } from "@/lib/fares/charter";
import {
  cabinsOnFlight,
  parseCabin,
  seatsByCabin,
} from "@/lib/fares/templates";

function parseCount(raw: string | undefined, fallback: number, min: number, max: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export default async function TripReviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    outboundId?: string;
    returnId?: string;
    adults?: string;
    children?: string;
    infants?: string;
    passengers?: string;
    cabinClass?: string;
  }>;
}) {
  const raw = await searchParams;
  const { outboundId, returnId } = raw;
  if (!outboundId || !returnId) notFound();

  const adults = parseCount(raw.adults, parseCount(raw.passengers, 1, 1, 9), 1, 9);
  let children = parseCount(raw.children, 0, 0, 8);
  const infants = parseCount(raw.infants, 0, 0, 9);
  if (adults + children > 9) children = Math.max(0, 9 - adults);

  const brand = getBrand();
  const [outbound, returnFlight] = await Promise.all([
    prisma.flight.findFirst({
      where: { id: outboundId, active: true },
      include: { fareReleases: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.flight.findFirst({
      where: { id: returnId, active: true },
      include: { fareReleases: { orderBy: { sortOrder: "asc" } } },
    }),
  ]);
  if (!outbound || !returnFlight) notFound();

  /*
   * Both legs must sell the cabin the customer picked on the results card;
   * seats are counted per cabin because the flight total covers the whole
   * aircraft and would call a full business cabin "available".
   */
  const shared = cabinsOnFlight(outbound.fareReleases).filter((c) =>
    cabinsOnFlight(returnFlight.fareReleases).includes(c),
  );
  const requested = parseCabin(raw.cabinClass ?? shared[0] ?? "economy");
  const cabinClass = shared.includes(requested)
    ? requested
    : (shared[0] ?? "economy");

  const soldOut =
    seatsByCabin(outbound.fareReleases)[cabinClass].remainingSeats < 1 ||
    seatsByCabin(returnFlight.fareReleases)[cabinClass].remainingSeats < 1;

  const products = await buildCharterFareProducts({
    cabinClass,
    available: !soldOut,
  });

  // Round-trip display: use stored package total (not ×2 one-way).
  const roundTripProducts = products
    .filter((p) => p.roundTripPriceCents > 0)
    .map((p) => ({
      ...p,
      priceCents: p.roundTripPriceCents,
      available: p.available && p.roundTripPriceCents > 0,
      notes: p.notes
        ? `${p.notes} · round-trip total`
        : "Round-trip total (both legs)",
    }));

  const backQs = new URLSearchParams({
    adults: String(adults),
    children: String(children),
    infants: String(infants),
    passengers: String(adults + children),
  });

  return (
    <main className="page-shell bg-background pb-safe">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <Link
          href={`/?${backQs.toString()}`}
          className="text-sm font-medium text-accent transition hover:text-accent-deep"
        >
          ← Back to results
        </Link>

        <div className="mt-5 space-y-6">
          <SelectedFlightSummary
            outbound={outbound}
            returnFlight={returnFlight}
          />

          <FareComparisonRow
            products={roundTripProducts}
            flightId={outbound.id}
            returnFlightId={returnFlight.id}
            supportEmail={brand.supportEmail}
            disabled={soldOut}
            adults={adults}
            children={children}
            infants={infants}
            title="Choose your round-trip fare"
            subtitle="Prices below are per adult · child 75% · infant 10% (no seat)"
          />
        </div>
      </div>
    </main>
  );
}
