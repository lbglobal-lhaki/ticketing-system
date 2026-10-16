import Link from "next/link";
import { FlightResultsClient } from "@/components/flights/FlightResultsClient";
import { searchWindow } from "@/lib/datetime";
import { prisma } from "@/lib/db";
import {
  addDaysIso,
  buildScheduleDateStrip,
  dayKey,
  groupFlightResults,
  type DateStripDay,
} from "@/lib/flights/results";
import { ticketTypeCabinPrice } from "@/lib/fares/customerPrice";
import type { FareReleaseRow } from "@/lib/fares/current";
import { cabinsOnFlight, seatsByCabin } from "@/lib/fares/templates";
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
  adults?: string;
  children?: string;
  infants?: string;
  cabinClass?: string;
  /** When "1", list every flight in the search window (not only the selected day). */
  allTickets?: string;
};

function parseCount(raw: string | undefined, fallback: number, min: number, max: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function parsePassengers(raw?: string) {
  return parseCount(raw, 1, 1, 9);
}

function parsePartyMix(raw: FlightSearchParams) {
  const adults = parseCount(raw.adults, parsePassengers(raw.passengers), 1, 9);
  let children = parseCount(raw.children, 0, 0, 8);
  const infants = parseCount(raw.infants, 0, 0, 9);
  if (adults + children > 9) children = Math.max(0, 9 - adults);
  return { adults, children, infants, seated: adults + children };
}

function partyQuery(adults: number, children: number, infants: number) {
  const qs = new URLSearchParams({
    adults: String(adults),
    children: String(children),
    infants: String(infants),
    passengers: String(adults + children),
  });
  return qs.toString();
}

function roundTripReturnHref(input: {
  outboundId: string;
  origin: string;
  destination: string;
  outboundDate: string;
  returnDate?: string;
  cabinClass: string;
  adults: number;
  children: number;
  infants: number;
}) {
  const params = new URLSearchParams(
    withPartyParams(
      {
        origin: input.origin,
        destination: input.destination,
        date: input.outboundDate,
        tripType: "round_trip",
        outboundId: input.outboundId,
        cabinClass: input.cabinClass,
      },
      input.adults,
      input.children,
      input.infants,
    ),
  );
  if (input.returnDate) params.set("returnDate", input.returnDate);
  return `/?${params.toString()}`;
}

function withPartyParams(
  base: Record<string, string>,
  adults: number,
  children: number,
  infants: number,
) {
  return {
    ...base,
    passengers: String(adults + children),
    adults: String(adults),
    children: String(children),
    infants: String(infants),
  };
}

const fareReleasePriceSelect = {
  id: true,
  cabinClass: true,
  name: true,
  sortOrder: true,
  totalSeats: true,
  remainingSeats: true,
  priceCents: true,
  roundTripPriceCents: true,
  active: true,
} as const;

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
  const { adults, children, infants, seated: passengers } = parsePartyMix(raw);
  const cabinClass = parseCabinClass(raw.cabinClass);
  const allTickets = raw.allTickets === "1" || raw.allTickets === "true";

  /*
   * One row per cabin the flight actually sells, so a single departure yields
   * both an economy and a business entry for the result card. A cabin with no
   * releases (an all-economy charter) simply produces nothing.
   */
  function cabinRowsFor<
    F extends {
      departureAt: Date;
      fareReleases: FareReleaseRow[];
    },
  >(flight: F) {
    const seats = seatsByCabin(flight.fareReleases);
    return cabinsOnFlight(flight.fareReleases).map((rowCabin) => ({
      flight,
      cabin: {
        cabinClass: rowCabin,
        totalSeats: seats[rowCabin].totalSeats,
        remainingSeats: seats[rowCabin].remainingSeats,
      },
      price: ticketTypeCabinPrice(
        flight.fareReleases,
        rowCabin,
        seats[rowCabin],
        isRoundTrip,
      ),
    }));
  }

  /** Full catalogue — every active flight, route, cabin, and date. */
  if (allTickets) {
    const flights = await prisma.flight.findMany({
      where: {
        active: true,
        departureAt: { gt: new Date() },
      },
      orderBy: { departureAt: "asc" },
      include: {
        // Cabin seat pools live on the releases now — the flight's own totals
        // are the whole airframe and would overstate either cabin.
        fareReleases: {
          select: fareReleasePriceSelect,
        },
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

    const priced = flights.flatMap(cabinRowsFor);

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
    const partyQs = partyQuery(adults, children, infants);
    const grouped = groupFlightResults(
      priced.map(({ flight, cabin, price }) => ({
        flight,
        cabin,
        price,
        // Carry the cabin so the fare page opens on the one that was clicked.
        href: `/flights/${flight.id}?${partyQs}&cabinClass=${cabin.cabinClass}`,
        ctaLabel: "Select",
      })),
    );

    const baseParams: Record<string, string> = {
      origin,
      destination,
      date,
      tripType,
      passengers: String(passengers),
      adults: String(adults),
      children: String(children),
      infants: String(infants),
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
        adults={adults}
        children={children}
        infants={infants}
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
      include: {
        fareReleases: {
          select: fareReleasePriceSelect,
        },
      },
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

    const outboundSeats = seatsByCabin(outbound.fareReleases)[cabinClass];
    const outboundPrice = ticketTypeCabinPrice(
      outbound.fareReleases,
      cabinClass,
      outboundSeats,
      isRoundTrip,
    );
    const activeReturnDate = returnDate ?? date;
    const returns = await prisma.flight.findMany({
      where: {
        active: true,
        origin: destination,
        destination: origin,
        departureAt: { gt: outbound.arrivalAt },
      },
      orderBy: { departureAt: "asc" },
      include: {
        // Cabin seat pools live on the releases now — the flight's own totals
        // are the whole airframe and would overstate either cabin.
        fareReleases: {
          select: fareReleasePriceSelect,
        },
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

    const priced = returns.flatMap(cabinRowsFor);

    const fareMap = new Map<
      string,
      { lowestFareCents: number | null; flightCount: number }
    >();
    for (const row of priced) {
      if (!row.price.farePriced) continue;
      const key = dayKey(row.flight.departureAt);
      const current = fareMap.get(key);
      const nextCount = (current?.flightCount ?? 0) + 1;
      const lowest =
        current?.lowestFareCents == null
          ? row.price.displayPriceCents
          : Math.min(current.lowestFareCents, row.price.displayPriceCents);
      fareMap.set(key, { lowestFareCents: lowest, flightCount: nextCount });
    }
    const onSelectedDay = priced.filter(
      ({ flight }) => dayKey(flight.departureAt) === activeReturnDate,
    );
    const highlightDate =
      onSelectedDay.length > 0
        ? activeReturnDate
        : priced[0]
          ? dayKey(priced[0].flight.departureAt)
          : activeReturnDate;
    const dayFares = buildScheduleDateStrip(fareMap, highlightDate);
    const returnRows = onSelectedDay.length > 0 ? onSelectedDay : priced;

    const grouped = groupFlightResults(
      returnRows.map(({ flight, cabin, price }) => {
        const params = new URLSearchParams({
          outboundId: outbound.id,
          returnId: flight.id,
          passengers: String(passengers),
          adults: String(adults),
          children: String(children),
          infants: String(infants),
          cabinClass: cabin.cabinClass,
        });
        return {
          flight,
          cabin,
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
      // Catalogue RT price is already a full package total — don't add
      // outbound + return one-way-style amounts.
      economy: row.economy
        ? {
            ...row.economy,
            displayPriceCents: row.economy.displayPriceCents,
            basePriceCents: row.economy.basePriceCents,
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
            displayPriceCents: row.business.displayPriceCents,
            basePriceCents: row.business.basePriceCents,
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

    const baseParams: Record<string, string> = withPartyParams(
      {
        origin,
        destination,
        date,
        tripType: "round_trip",
        outboundId: outbound.id,
        cabinClass,
      },
      adults,
      children,
      infants,
    );
    baseParams.returnDate = highlightDate;

    return (
      <FlightResultsClient
        origin={origin}
        destination={destination}
        date={date}
        returnDate={highlightDate}
        tripType="round_trip"
        passengers={passengers}
        adults={adults}
        children={children}
        infants={infants}
        cabinClass={cabinClass}
        allTickets={allTickets}
        summaryTitle="Choose your return"
        stripDate={highlightDate}
        dateParam="returnDate"
        showingNearbyDates={onSelectedDay.length === 0 && returnRows.length > 0}
        dayFares={dayFares}
        baseParams={baseParams}
        flights={withTripTotals}
        airports={airports}
        outboundSummary={`${outbound.airline} ${outbound.flightNumber} · ${airportLabel(outbound.origin)} → ${airportLabel(outbound.destination)} · ${formatFlightTime(outbound.departureAt, outbound.origin)} · ${formatAud(outboundPrice.displayPriceCents)}. Choose any later return on the published schedule — November, December, January or another available month.`}
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
      fareReleases: {
        select: fareReleasePriceSelect,
      },
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

  const priced = flights.flatMap(cabinRowsFor);

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

  const partyQs = partyQuery(adults, children, infants);
  const grouped = groupFlightResults(
    displayRows.map(({ flight, cabin, price }) => ({
      flight,
      cabin,
      price,
      href: isRoundTrip
        ? roundTripReturnHref({
            outboundId: flight.id,
            origin,
            destination,
            outboundDate: dayKey(flight.departureAt),
            returnDate,
            cabinClass: cabin.cabinClass,
            adults,
            children,
            infants,
          })
        : `/flights/${flight.id}?${partyQs}&cabinClass=${cabin.cabinClass}`,
      ctaLabel: isRoundTrip ? "Choose return" : "Select",
    })),
  ).map((row) =>
    isRoundTrip
      ? {
          ...row,
          roleLabel: "outbound" as const,
        }
      : row,
  );

  const baseParams: Record<string, string> = withPartyParams(
    {
      origin,
      destination,
      date,
      tripType,
      cabinClass,
    },
    adults,
    children,
    infants,
  );
  if (returnDate) baseParams.returnDate = returnDate;

  return (
    <FlightResultsClient
      origin={origin}
      destination={destination}
      date={date}
      returnDate={returnDate}
      tripType={tripType}
      passengers={passengers}
      adults={adults}
      children={children}
      infants={infants}
      cabinClass={cabinClass}
      allTickets={allTickets}
      summaryTitle={isRoundTrip ? "Choose outbound" : undefined}
      stripDate={date}
      dateParam="date"
      showingNearbyDates={onSelectedDay.length === 0 && displayRows.length > 0}
      dayFares={dayFares}
      baseParams={baseParams}
      flights={grouped}
      airports={airports}
      preferRoundTrip={isRoundTrip}
    />
  );
}
