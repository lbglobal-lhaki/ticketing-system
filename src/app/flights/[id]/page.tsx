import Link from "next/link";
import { notFound } from "next/navigation";
import { FareComparisonRow } from "@/components/fares/FareComparisonRow";
import { SelectedFlightSummary } from "@/components/fares/SelectedFlightSummary";
import { getBrand } from "@/lib/branding";
import { prisma } from "@/lib/db";
import { buildCharterFareProducts } from "@/lib/fares/charter";

export default async function FlightDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const brand = getBrand();
  const flight = await prisma.flight.findFirst({
    where: { id, active: true },
    include: { fareReleases: { orderBy: { sortOrder: "asc" } } },
  });
  if (!flight) notFound();

  const soldOut = flight.remainingSeats < 1;
  const products = await buildCharterFareProducts({
    cabinClass: flight.cabinClass,
    available: !soldOut,
  });

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
          <SelectedFlightSummary outbound={flight} />

          {error ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {decodeURIComponent(error)}
            </p>
          ) : null}

          <FareComparisonRow
            products={products}
            flightId={flight.id}
            supportEmail={brand.supportEmail}
            disabled={soldOut}
            title={`${flight.cabinClass === "business" ? "Business" : "Economy"} charter fares`}
            subtitle="Perth ⇄ Paro rules · prices are per passenger one-way"
          />
        </div>
      </div>
    </main>
  );
}
