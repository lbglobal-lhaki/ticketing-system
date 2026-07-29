import Link from "next/link";
import { notFound } from "next/navigation";
import { FareComparisonRow } from "@/components/fares/FareComparisonRow";
import { SelectedFlightSummary } from "@/components/fares/SelectedFlightSummary";
import { getBrand } from "@/lib/branding";
import { prisma } from "@/lib/db";
import { buildCharterFareProducts } from "@/lib/fares/charter";

export default async function TripReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ outboundId?: string; returnId?: string }>;
}) {
  const { outboundId, returnId } = await searchParams;
  if (!outboundId || !returnId) notFound();

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

  const soldOut =
    outbound.remainingSeats < 1 || returnFlight.remainingSeats < 1;

  const products = await buildCharterFareProducts({
    cabinClass: outbound.cabinClass,
    available: !soldOut,
  });

  // Round-trip display: show catalogue × 2 for the pair.
  const roundTripProducts = products.map((p) => ({
    ...p,
    priceCents: p.priceCents * 2,
    notes: p.notes
      ? `${p.notes} · round-trip total`
      : "Round-trip total (both legs)",
  }));

  return (
    <main className="page-shell bg-background pb-safe">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <Link
          href="/"
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
            title="Choose your round-trip fare"
            subtitle="Prices below are for both legs · Perth ⇄ Paro charter rules apply"
          />
        </div>
      </div>
    </main>
  );
}
