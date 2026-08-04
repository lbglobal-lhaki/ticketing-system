import Link from "next/link";
import { FlightResultsClient } from "@/components/flights/FlightResultsClient";
import { searchWindow } from "@/lib/datetime";
import { prisma } from "@/lib/db";
import {
  addDaysIso,
  dayKey,
  groupFlightResults,
  type DateStripDay,
} from "@/lib/flights/results";
import { getCharterCabinFromPrices } from "@/lib/fares/charter";
import { airportLabel, buildAirportOptions, formatFlightTime } from "@/lib/format";
import type { AirportOption } from "@/lib/format";
import { formatAud } from "@/lib/pricing";
import { searchSchema } from "@/lib/validation";

export type FlightSearchParams = {
  origin?: string;
  destination?: string;
  date?: string;
  tripType?: string;
  returnDate?: string;
  outboundId?: string;
  passengers?: string;
  cabinClass?: string;
  /** When "1", list every flight in the search window (not only the selected day). */
  allTickets?: string;
};

function parsePassengers(raw?: string) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.min(9, Math.max(1, Math.round(n)));
}

function parseCabinClass(raw?: string): "economy" | "business" {
  return raw === "business" ? "business" : "economy";
}

function defaultSearchDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function buildDayFares(
  flights: Array<{
    departureAt: Date;
    price: { displayPriceCents: number; farePriced: boolean };
  }>,
  centerDate: string,
  spanBefore = 7,
  spanAfter = 14,
): Promise<DateStripDay[]> {
  const map = new Map<string, number[]>();

  for (const row of flights) {
    if (!row.price.farePriced) continue;
    const key = dayKey(row.departureAt);
    const list = map.get(key) ?? [];
    list.push(row.price.displayPriceCents);
    map.set(key, list);
  }

  const days: DateStripDay[] = [];
  for (let i = -spanBefore; i <= spanAfter; i += 1) {
    const date = addDaysIso(centerDate, i);
    const prices = map.get(date) ?? [];
    days.push({
      date,
      lowestFareCents: prices.length ? Math.min(...prices) : null,
      flightCount: prices.length,
    });
  }
  return days;
}

export async function getSearchAirports(): Promise<AirportOption[]> {
  const flights = await prisma.flight.findMany({
    where: { active: true },
    select: { origin: true, destination: true },
  });
  const codes = flights.flatMap((f) => [f.origin, f.destination]);
  const options = buildAirportOptions(codes);
  if (options.length > 0) return options;
  return buildAirportOptions(["PER", "PBH"]);
}

export async function resolveSearchInput(raw: FlightSearchParams) {
  const airports = await getSearchAirports();
  const defaultOrigin =
    airports.find((a) => a.code === "PER")?.code ?? airports[0]?.code ?? "PER";
  const defaultDestination =
    airports.find((a) => a.code === "PBH" && a.code !== defaultOrigin)?.code ??
    airports.find((a) => a.code !== defaultOrigin)?.code ??
    "PBH";

  const candidate = {
    origin: raw.origin || defaultOrigin,
    destination: raw.destination || defaultDestination,
    date: raw.date || defaultSearchDate(3),
    tripType: raw.tripType || "one_way",
    returnDate: raw.returnDate || undefined,
  };

  if (
    candidate.tripType === "round_trip" &&
    !candidate.returnDate
  ) {
    candidate.returnDate = defaultSearchDate(7);
  }

  return {
    airports,
    parsed: searchSchema.safeParse(candidate),
    outboundId: raw.outboundId,
  };
}

export async function renderFlightSearch(raw: FlightSearchParams) {
  const { airports, parsed, outboundId } = await resolveSearchInput(raw);

  if (!parsed.success) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-12">
        <p className="text-red-700">
          {parsed.error.issues[0]?.message ?? "Invalid search"}
        </p>
        <Link href="/" className="mt-4 inline-block text-sm underline">
          Start a new search
        </Link>
      </main>
    );
  }

  const { origin, destination, date, tripType, returnDate } = parsed.data;
  const isRoundTrip = tripType === "round_trip";
  const passengers = parsePassengers(raw.passengers);
  const cabinClass = parseCabinClass(raw.cabinClass);
  const allTickets = raw.allTickets === "1" || raw.allTickets === "true";
  const { economy: economyFromCents, business: businessFromCents } =
    await getCharterCabinFromPrices();

  function catalogPrice(flight: {
    cabinClass: string;
    remainingSeats: number;
    totalSeats: number;
  }) {
    const catalog =
      flight.cabinClass === "business"
        ? businessFromCents
        : economyFromCents;
    const cents = catalog ?? 0;
    return {
      basePriceCents: cents,
      displayPriceCents: cents,
      baseMarkup: 1,
      demandMultiplier: 1,
      scarcityMultiplier: 1,
      demandScore: 0,
      remainingSeats: flight.remainingSeats,
      totalSeats: flight.totalSeats,
      fareReleaseId: null as string | null,
      fareReleaseName: null as string | null,
      farePriced: cents > 0,
    };
  }

  /** Full catalogue — every active flight, route, cabin, and date. */
  if (allTickets) {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);

    const flights = await prisma.flight.findMany({
      where: {
        active: true,
        departureAt: { gte: dayStart },
      },
      orderBy: { departureAt: "asc" },
      include: {
        returnLegFlight: {
          select: {
            id: true,
            flightNumber: true,
            departureAt: true,
            remainingSeats: true,
            active: true,
          },
        },
      },
    });

    const priced = flights.map((flight) => ({
      flight,
      price: catalogPrice(flight),
    }));

    const centerDate =
      priced[0] != null ? dayKey(priced[0].flight.departureAt) : date;
    const dayFares = await buildDayFares(
      priced.map(({ flight, price }) => ({
        departureAt: flight.departureAt,
        price,
      })),
      centerDate,
      0,
      60,
    );

    // One result row per inventory flight. Same schedule with both cabins
    // (economy + business rows in the DB) merges into a single card.
    const grouped = groupFlightResults(
      priced.map(({ flight, price }) => ({
        flight,
        price,
        href: `/flights/${flight.id}`,
        ctaLabel: "Select",
      })),
    );

    const baseParams: Record<string, string> = {
      origin,
      destination,
      date,
      tripType,
      passengers: String(passengers),
      cabinClass,
    };
    if (returnDate) baseParams.returnDate = returnDate;

    // Surface paired charters first in the full catalogue.
    const sortedCatalogue = [...grouped].sort((a, b) => {
      if (a.roundTripAvailable !== b.roundTripAvailable) {
        return a.roundTripAvailable ? -1 : 1;
      }
      return (
        new Date(a.departureAt).getTime() - new Date(b.departureAt).getTime()
      );
    });

    return (
      <FlightResultsClient
        origin={origin}
        destination={destination}
        date={date}
        returnDate={returnDate}
        tripType={tripType}
        passengers={passengers}
        cabinClass={cabinClass}
        allTickets
        summaryTitle="All available tickets"
        stripDate={centerDate}
        dateParam="date"
        dayFares={dayFares}
        baseParams={baseParams}
        flights={sortedCatalogue}
        airports={airports}
        preferRoundTrip={isRoundTrip}
      />
    );
  }

  if (isRoundTrip && outboundId) {
    const outbound = await prisma.flight.findFirst({
      where: { id: outboundId, active: true },
    });
    if (!outbound) {
      return (
        <main className="mx-auto w-full max-w-5xl px-4 py-12">
          <p className="text-red-700">Selected outbound flight not found.</p>
          <Link href="/" className="mt-4 inline-block text-sm underline">
            Start a new search
          </Link>
        </main>
      );
    }

    const outboundPrice = catalogPrice(outbound);
    const activeReturnDate = returnDate ?? date;
    const { windowStart, windowEnd } = searchWindow(activeReturnDate);
    const returns = await prisma.flight.findMany({
      where: {
        active: true,
        origin: destination,
        destination: origin,
        departureAt: {
          gte:
            outbound.arrivalAt > windowStart
              ? outbound.arrivalAt
              : windowStart,
          lte: windowEnd,
        },
      },
      orderBy: { departureAt: "asc" },
      include: {
        returnLegFlight: {
          select: {
            id: true,
            flightNumber: true,
            departureAt: true,
            remainingSeats: true,
            active: true,
          },
        },
      },
    });

    const priced = returns.map((flight) => ({
      flight,
      price: catalogPrice(flight),
    }));

    const dayFares = await buildDayFares(
      priced.map(({ flight, price }) => ({
        departureAt: flight.departureAt,
        price,
      })),
      activeReturnDate,
    );

    const onSelectedDay = priced.filter(
      ({ flight }) => dayKey(flight.departureAt) === activeReturnDate,
    );
    const returnRows = onSelectedDay.length > 0 ? onSelectedDay : priced;

    const grouped = groupFlightResults(
      returnRows.map(({ flight, price }) => {
        const params = new URLSearchParams({
          outboundId: outbound.id,
          returnId: flight.id,
          passengers: String(passengers),
          cabinClass,
        });
        return {
          flight,
          price,
          href: `/flights/trip?${params.toString()}`,
          ctaLabel: "Select return",
        };
      }),
    );

    const withTripTotals = grouped.map((row) => ({
      ...row,
      roleLabel: "return" as const,
      roundTripAvailable: true,
      economy: row.economy
        ? {
            ...row.economy,
            displayPriceCents:
              outboundPrice.displayPriceCents + row.economy.displayPriceCents,
            basePriceCents:
              outboundPrice.basePriceCents + row.economy.basePriceCents,
            farePriced: outboundPrice.farePriced && row.economy.farePriced,
            fareReleaseName:
              [outboundPrice.fareReleaseName, row.economy.fareReleaseName]
                .filter(Boolean)
                .join(" + ") || null,
          }
        : null,
      business: row.business
        ? {
            ...row.business,
            displayPriceCents:
              outboundPrice.displayPriceCents + row.business.displayPriceCents,
            basePriceCents:
              outboundPrice.basePriceCents + row.business.basePriceCents,
            farePriced: outboundPrice.farePriced && row.business.farePriced,
            fareReleaseName:
              [outboundPrice.fareReleaseName, row.business.fareReleaseName]
                .filter(Boolean)
                .join(" + ") || null,
          }
        : null,
      lowestFareCents: null as number | null,
    }));

    for (const row of withTripTotals) {
      const prices = [row.economy, row.business]
        .filter((f) => f?.farePriced)
        .map((f) => f!.displayPriceCents);
      row.lowestFareCents = prices.length ? Math.min(...prices) : null;
    }

    const baseParams: Record<string, string> = {
      origin,
      destination,
      date,
      tripType: "round_trip",
      outboundId: outbound.id,
      passengers: String(passengers),
      cabinClass,
    };
    if (returnDate) baseParams.returnDate = returnDate;

    return (
      <FlightResultsClient
        origin={origin}
        destination={destination}
        date={date}
        returnDate={activeReturnDate}
        tripType="round_trip"
        passengers={passengers}
        cabinClass={cabinClass}
        allTickets={allTickets}
        summaryTitle="Choose your return"
        stripDate={activeReturnDate}
        dateParam="returnDate"
        dayFares={dayFares}
        baseParams={baseParams}
        flights={withTripTotals}
        airports={airports}
        outboundSummary={`${outbound.airline} ${outbound.flightNumber} · ${airportLabel(outbound.origin)} → ${airportLabel(outbound.destination)} · ${formatFlightTime(outbound.departureAt)} · ${formatAud(outboundPrice.displayPriceCents)}`}
      />
    );
  }

  const { windowStart, windowEnd } = searchWindow(date);
  const flights = await prisma.flight.findMany({
    where: {
      active: true,
      origin,
      destination,
      departureAt: { gte: windowStart, lte: windowEnd },
    },
    orderBy: { departureAt: "asc" },
    include: {
      returnLegFlight: {
        select: {
          id: true,
          flightNumber: true,
          departureAt: true,
          remainingSeats: true,
          active: true,
        },
      },
    },
  });

  const priced = flights.map((flight) => ({
    flight,
    price: catalogPrice(flight),
  }));

  const dayFares = await buildDayFares(
    priced.map(({ flight, price }) => ({
      departureAt: flight.departureAt,
      price,
    })),
    date,
  );

  const onSelectedDay = priced.filter(
    ({ flight }) => dayKey(flight.departureAt) === date,
  );
  const displayRows = onSelectedDay.length > 0 ? onSelectedDay : priced;

  // This charter route sells one fixed round-trip pair a month — the fare
  // step on /flights/[id] offers "Round trip" inline (auto-attaching the
  // paired return leg), so there's no separate manual return-flight search
  // to send customers through here, even when they searched "Round trip".
  const grouped = groupFlightResults(
    displayRows.map(({ flight, price }) => ({
      flight,
      price,
      href: `/flights/${flight.id}`,
      ctaLabel: "Select",
    })),
  ).map((row) =>
    isRoundTrip
      ? {
          ...row,
          roleLabel: "outbound" as const,
        }
      : row,
  );

  // When customers searched round-trip, surface paired charters first so the
  // fixed return leg is easy to find (manual return picker is secondary).
  if (isRoundTrip) {
    grouped.sort((a, b) => {
      if (a.roundTripAvailable !== b.roundTripAvailable) {
        return a.roundTripAvailable ? -1 : 1;
      }
      return (
        new Date(a.departureAt).getTime() - new Date(b.departureAt).getTime()
      );
    });
  }

  const baseParams: Record<string, string> = {
    origin,
    destination,
    date,
    tripType,
    passengers: String(passengers),
    cabinClass,
  };
  if (returnDate) baseParams.returnDate = returnDate;

  return (
    <FlightResultsClient
      origin={origin}
      destination={destination}
      date={date}
      returnDate={returnDate}
      tripType={tripType}
      passengers={passengers}
      cabinClass={cabinClass}
      allTickets={allTickets}
      summaryTitle={isRoundTrip ? "Choose outbound" : undefined}
      stripDate={date}
      dateParam="date"
      dayFares={dayFares}
      baseParams={baseParams}
      flights={grouped}
      airports={airports}
      preferRoundTrip={isRoundTrip}
    />
  );
}
