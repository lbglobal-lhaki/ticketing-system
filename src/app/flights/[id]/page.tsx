import Link from "next/link";
import { notFound } from "next/navigation";
import { TripTypeFareSection } from "@/components/fares/TripTypeFareSection";
import { getBrand } from "@/lib/branding";
import { prisma } from "@/lib/db";
import { buildCharterFareProducts } from "@/lib/fares/charter";
import {
  cabinLabel,
  cabinsOnFlight,
  parseCabin,
  seatsByCabin,
} from "@/lib/fares/templates";

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
    cabinClass?: string;
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

  /*
   * The flight sells every cabin it has releases for, so the cabin comes from
   * the link the customer clicked on the results card (each cabin row carries
   * its own ?cabinClass=). Fall back to the first cabin this flight offers so
   * a bare /flights/[id] link still works.
   */
  const availableCabins = cabinsOnFlight(flight.fareReleases);
  const requested = parseCabin(raw.cabinClass ?? availableCabins[0] ?? "economy");
  const cabinClass = availableCabins.includes(requested)
    ? requested
    : (availableCabins[0] ?? "economy");

  const cabinSeats = seatsByCabin(flight.fareReleases)[cabinClass];
  // Sold out is per cabin — a full business cabin must not hide economy seats.
  const soldOut = cabinSeats.remainingSeats < 1;
  const products = await buildCharterFareProducts({
    cabinClass,
    available: !soldOut,
  });

  const cabinHref = (cabin: string) => {
    const qs = new URLSearchParams({
      adults: String(adults),
      children: String(children),
      infants: String(infants),
      passengers: String(adults + children),
      cabinClass: cabin,
    });
    return `/flights/${flight.id}?${qs.toString()}`;
  };

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

          {availableCabins.length > 1 ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs uppercase tracking-[0.12em] text-muted">
                Cabin
              </span>
              <div className="inline-flex rounded-full border border-line bg-white p-1 text-sm font-medium">
                {availableCabins.map((cabin) => {
                  const seats = seatsByCabin(flight.fareReleases)[cabin];
                  const active = cabin === cabinClass;
                  return (
                    <Link
                      key={cabin}
                      href={cabinHref(cabin)}
                      className={`rounded-full px-4 py-2 transition ${
                        active
                          ? "bg-accent-deep text-white"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      {cabinLabel(cabin)}
                      <span className="ml-2 text-xs opacity-80">
                        {seats.remainingSeats > 0
                          ? `${seats.remainingSeats} left`
                          : "Sold out"}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
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
