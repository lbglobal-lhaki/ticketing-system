import { airportCity } from "@/lib/format";

export type CabinFare = {
  flightId: string;
  cabinClass: "economy" | "business";
  displayPriceCents: number;
  basePriceCents: number;
  fareReleaseName: string | null;
  farePriced: boolean;
  remainingSeats: number;
  totalSeats: number;
  href: string;
  ctaLabel: string;
};

export type FlightResultRow = {
  key: string;
  airline: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  durationMinutes: number;
  stops: 0 | 1;
  economy: CabinFare | null;
  business: CabinFare | null;
  lowestFareCents: number | null;
  /** True when a paired return leg exists and still has seats. */
  roundTripAvailable: boolean;
  /** Paired return departure (ISO), when roundTripAvailable. */
  returnDepartureAt: string | null;
  returnFlightNumber: string | null;
  /** Optional listing role — used on multi-step round-trip search. */
  roleLabel?: "outbound" | "return" | null;
};

export type DateStripDay = {
  date: string;
  lowestFareCents: number | null;
  flightCount: number;
};

export function flightDurationMinutes(departureAt: Date, arrivalAt: Date) {
  return Math.max(
    0,
    Math.round((arrivalAt.getTime() - departureAt.getTime()) / 60000),
  );
}

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatClock(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Australia/Sydney",
  }).format(d);
}

export function formatShortDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "Australia/Sydney",
  }).format(d);
}

/** Card schedule line — e.g. "Mon, 17 Aug 2026". */
export function formatCardDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(d);
}

export function formatStripDay(date: string) {
  const d = new Date(`${date}T12:00:00.000Z`);
  return {
    weekday: new Intl.DateTimeFormat("en-AU", {
      weekday: "short",
      timeZone: "UTC",
    }).format(d),
    dayMonth: new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(d),
  };
}

export function formatSearchDateRange(
  date: string,
  returnDate?: string,
  tripType?: string,
) {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${iso}T12:00:00.000Z`));

  if (tripType === "round_trip" && returnDate) {
    return `${fmt(date)} – ${fmt(returnDate)}`;
  }
  return fmt(date);
}

/** Rough CO2e kg for display (demo estimate from duration). */
export function estimateCo2Kg(durationMinutes: number, cabin: string) {
  const hours = Math.max(0.5, durationMinutes / 60);
  const base = hours * 95;
  const factor = cabin === "business" ? 1.45 : 1;
  return Math.round(base * factor);
}

/** Calendar day key matching search query dates (UTC YYYY-MM-DD). */
export function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** @deprecated use dayKey — kept for any call sites expecting Sydney labeling */
export function sydneyDateKey(date: Date) {
  return dayKey(date);
}

export function addDaysIso(date: string, days: number) {
  const d = new Date(`${date}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function buildDateStrip(
  centerDate: string,
  dayFares: Map<string, { lowestFareCents: number | null; flightCount: number }>,
  windowStartOffset = 0,
  length = 7,
): DateStripDay[] {
  return Array.from({ length }, (_, i) => {
    const date = addDaysIso(centerDate, windowStartOffset + i);
    const stats = dayFares.get(date);
    return {
      date,
      lowestFareCents: stats?.lowestFareCents ?? null,
      flightCount: stats?.flightCount ?? 0,
    };
  });
}

export type GroupFlightInput = {
  flight: {
    id: string;
    airline: string;
    flightNumber: string;
    origin: string;
    destination: string;
    departureAt: Date;
    arrivalAt: Date;
    returnLegFlight?: {
      id: string;
      flightNumber: string;
      departureAt: Date;
      remainingSeats: number;
      active: boolean;
    } | null;
  };
  /**
   * One entry per cabin the flight sells. A flight carries both cabins on the
   * same departure, so seats are per-cabin here rather than per-flight — the
   * flight's own totals are the whole airframe and would overstate either one.
   */
  cabin: {
    cabinClass: "economy" | "business";
    remainingSeats: number;
    totalSeats: number;
  };
  price: {
    displayPriceCents: number;
    basePriceCents: number;
    fareReleaseName: string | null;
    farePriced: boolean;
  };
  href: string;
  ctaLabel: string;
};

function pairingFromFlight(flight: GroupFlightInput["flight"]): {
  roundTripAvailable: boolean;
  returnDepartureAt: string | null;
  returnFlightNumber: string | null;
} {
  const ret = flight.returnLegFlight;
  if (ret && ret.active && ret.remainingSeats > 0) {
    return {
      roundTripAvailable: true,
      returnDepartureAt: ret.departureAt.toISOString(),
      returnFlightNumber: ret.flightNumber,
    };
  }
  return {
    roundTripAvailable: false,
    returnDepartureAt: null,
    returnFlightNumber: null,
  };
}

export function groupFlightResults(rows: GroupFlightInput[]): FlightResultRow[] {
  const map = new Map<string, FlightResultRow>();

  for (const row of rows) {
    const key = [
      row.flight.flightNumber,
      row.flight.departureAt.toISOString(),
      row.flight.arrivalAt.toISOString(),
    ].join("|");

    const cabin = row.cabin.cabinClass;
    const fare: CabinFare = {
      flightId: row.flight.id,
      cabinClass: cabin,
      displayPriceCents: row.price.displayPriceCents,
      basePriceCents: row.price.basePriceCents,
      fareReleaseName: row.price.fareReleaseName || null,
      farePriced: row.price.farePriced,
      remainingSeats: row.cabin.remainingSeats,
      totalSeats: row.cabin.totalSeats,
      href: row.href,
      ctaLabel: row.ctaLabel,
    };
    const pairing = pairingFromFlight(row.flight);

    const existing = map.get(key);
    if (!existing) {
      const durationMinutes = flightDurationMinutes(
        row.flight.departureAt,
        row.flight.arrivalAt,
      );
      map.set(key, {
        key,
        airline: row.flight.airline,
        flightNumber: row.flight.flightNumber,
        origin: row.flight.origin,
        destination: row.flight.destination,
        departureAt: row.flight.departureAt.toISOString(),
        arrivalAt: row.flight.arrivalAt.toISOString(),
        durationMinutes,
        stops: 0,
        economy: cabin === "economy" ? fare : null,
        business: cabin === "business" ? fare : null,
        lowestFareCents: row.price.farePriced
          ? row.price.displayPriceCents
          : null,
        ...pairing,
      });
      continue;
    }

    if (cabin === "economy") existing.economy = fare;
    else existing.business = fare;

    // Prefer showing round-trip if either cabin has a bookable pair.
    if (pairing.roundTripAvailable) {
      existing.roundTripAvailable = true;
      existing.returnDepartureAt = pairing.returnDepartureAt;
      existing.returnFlightNumber = pairing.returnFlightNumber;
    }

    const prices = [existing.economy, existing.business]
      .filter((f): f is CabinFare => Boolean(f?.farePriced))
      .map((f) => f.displayPriceCents);
    existing.lowestFareCents =
      prices.length > 0 ? Math.min(...prices) : null;
  }

  return [...map.values()].sort(
    (a, b) =>
      new Date(a.departureAt).getTime() - new Date(b.departureAt).getTime(),
  );
}

export function routeCityLabel(code: string) {
  return airportCity(code);
}
