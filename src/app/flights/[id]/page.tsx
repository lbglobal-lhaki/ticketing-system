import Link from "next/link";
import { notFound } from "next/navigation";
import { TripTypeFareSection } from "@/components/fares/TripTypeFareSection";
import { getBrand } from "@/lib/branding";
import { prisma } from "@/lib/db";
import { buildCharterFareProducts } from "@/lib/fares/charter";

function parseCount(raw: string | undefined, fallback: number, min: number, max: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export default async function FlightDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    adults?: string;
    children?: string;
    infants?: string;
    passengers?: string;
  }>;
}) {
  const { id } = await params;
  const raw = await searchParams;
  const brand = getBrand();
  const adults = parseCount(raw.adults, parseCount(raw.passengers, 1, 1, 9), 1, 9);
  let children = parseCount(raw.children, 0, 0, 8);
  const infants = parseCount(raw.infants, 0, 0, 9);
  if (adults + children > 9) children = Math.max(0, 9 - adults);

  const flight = await prisma.flight.findFirst({
    where: { id, active: true },
    include: {
      fareReleases: { orderBy: { sortOrder: "asc" } },
      returnLegFlight: true,
    },
  });
  if (!flight) notFound();

  const soldOut = flight.remainingSeats < 1;
  const products = await buildCharterFareProducts({
    cabinClass: flight.cabinClass,
    available: !soldOut,
  });

  const pairedReturn =
    flight.returnLegFlight && flight.returnLegFlight.active
      ? flight.returnLegFlight
      : null;

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
          {raw.error ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {decodeURIComponent(raw.error)}
            </p>
          ) : null}

          <TripTypeFareSection
            outbound={flight}
            pairedReturn={pairedReturn}
            products={products}
            supportEmail={brand.supportEmail}
            disabled={soldOut}
            adults={adults}
            children={children}
            infants={infants}
          />
        </div>
      </div>
    </main>
  );
}
