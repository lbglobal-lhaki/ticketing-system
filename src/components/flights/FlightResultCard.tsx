import Link from "next/link";
import {
  formatClock,
  formatDuration,
  routeCityLabel,
  type CabinFare,
  type FlightResultRow,
} from "@/lib/flights/results";
import { airportTzAbbr } from "@/lib/datetime";
import { formatAud } from "@/lib/pricing";

/** Width of each cabin column — the list header uses the same value. */
export const CABIN_COLUMN_CLASS = "lg:w-[9.75rem]";

type FlightResultCardProps = {
  flight: FlightResultRow;
  globalLowestFareCents: number | null;
};

function endpointDate(iso: string) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export function FlightResultCard({
  flight,
  globalLowestFareCents,
}: FlightResultCardProps) {
  const stopLabel = flight.stops === 0 ? "Nonstop" : `${flight.stops} Stop`;
  const detailsHref = flight.economy?.href ?? flight.business?.href ?? "#";
  const lowest = (fare: CabinFare | null) =>
    fare?.farePriced === true &&
    globalLowestFareCents != null &&
    fare.displayPriceCents === globalLowestFareCents;

  return (
    <article className="results-card overflow-hidden rounded-xl border border-line bg-white shadow-[0_6px_20px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col lg:flex-row lg:items-stretch">
        <div className="min-w-0 flex-1 px-4 py-5 sm:px-6">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(6rem,1.4fr)_minmax(0,1fr)] items-center gap-3 sm:gap-6">
            <Endpoint
              time={formatClock(flight.departureAt)}
              tz={airportTzAbbr(flight.origin, new Date(flight.departureAt))}
              place={`${routeCityLabel(flight.origin)} (${flight.origin})`}
              date={endpointDate(flight.departureAt)}
              align="left"
            />

            <div className="flex min-w-0 flex-col items-center gap-1">
              <p className="text-[11px] font-medium text-muted">
                {formatDuration(flight.durationMinutes)}
              </p>
              <div className="flex w-full items-center text-accent-deep">
                <PlaneRight />
                <span className="h-px flex-1 bg-accent-deep/70" />
                <span className="mx-0.5 size-1.5 shrink-0 rounded-full bg-accent-deep" />
                <span className="h-px flex-1 bg-accent-deep/70" />
                <PlaneRight />
              </div>
              <p className="text-xs font-semibold text-foreground">{stopLabel}</p>
              <p className="text-[11px] font-semibold tracking-wide text-muted">
                {flight.flightNumber}
              </p>
            </div>

            <Endpoint
              time={formatClock(flight.arrivalAt)}
              tz={airportTzAbbr(flight.destination, new Date(flight.arrivalAt))}
              place={`${routeCityLabel(flight.destination)} (${flight.destination})`}
              date={endpointDate(flight.arrivalAt)}
              align="right"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href={detailsHref}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-deep transition hover:text-accent"
            >
              <InfoIcon />
              Flight Info
            </Link>
            <TripBadge flight={flight} />
            {flight.roundTripAvailable &&
            flight.returnDepartureAt &&
            flight.roleLabel !== "return" ? (
              <span className="text-xs text-muted">
                Return{" "}
                {flight.returnFlightNumber
                  ? `${flight.returnFlightNumber} · `
                  : ""}
                {endpointDate(flight.returnDepartureAt)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 border-t border-line lg:flex lg:border-t-0">
          <CabinCell label="Economy" fare={flight.economy} isLowest={lowest(flight.economy)} />
          <CabinCell
            label="Business"
            fare={flight.business}
            isLowest={lowest(flight.business)}
            className="border-l border-line"
          />
        </div>
      </div>
    </article>
  );
}

function TripBadge({ flight }: { flight: FlightResultRow }) {
  if (flight.roleLabel === "return") {
    return (
      <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-sky-900">
        Return
      </span>
    );
  }
  if (flight.roundTripAvailable) {
    return (
      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-900">
        Round trip
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-700">
      One way
    </span>
  );
}

function Endpoint({
  time,
  tz,
  place,
  date,
  align,
}: {
  time: string;
  tz: string;
  place: string;
  date: string;
  align: "left" | "right";
}) {
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : "text-left"}`}>
      <p className="font-[family-name:var(--font-syne)] text-xl font-bold leading-none tracking-tight text-foreground sm:text-2xl">
        {time}
        <span className="ml-1.5 align-middle text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          {tz}
        </span>
      </p>
      <p className="mt-2 truncate text-sm font-bold text-foreground" title={place}>
        {place}
      </p>
      <p className="mt-0.5 text-xs font-semibold text-foreground/75">{date}</p>
    </div>
  );
}

function CabinCell({
  label,
  fare,
  isLowest,
  className = "",
}: {
  label: string;
  fare: CabinFare | null;
  isLowest: boolean;
  className?: string;
}) {
  const available = Boolean(fare && fare.farePriced && fare.remainingSeats > 0);
  const lowSeats = available && fare!.remainingSeats <= 9;
  const base = `relative flex min-h-[7.5rem] flex-col items-center justify-center gap-1 px-3 py-4 text-center ${CABIN_COLUMN_CLASS} ${className}`;

  const mobileLabel = (
    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted lg:hidden">
      {label}
    </span>
  );

  if (!available) {
    return (
      <div className={`${base} bg-background/60 text-muted/70`}>
        {mobileLabel}
        <NoSeatIcon />
        <span className="text-xs font-medium">No Seat</span>
      </div>
    );
  }

  return (
    <Link
      href={fare!.href}
      aria-label={`${label} from ${formatAud(fare!.displayPriceCents)}`}
      className={`${base} transition hover:bg-accent-deep/5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-deep`}
    >
      {mobileLabel}
      <span className="font-[family-name:var(--font-syne)] text-lg font-bold tracking-tight text-accent-deep">
        {formatAud(fare!.displayPriceCents)}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
        AUD
      </span>
      {lowSeats ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
          {fare!.remainingSeats} Seat{fare!.remainingSeats === 1 ? "" : "s"} Left
        </span>
      ) : null}
      {isLowest ? (
        <span className="badge-promo px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
          Lowest
        </span>
      ) : null}
    </Link>
  );
}

function PlaneRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0">
      <path
        d="M21 15.5v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0v5l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-5l8 2.5Z"
        transform="rotate(90 12 12)"
      />
    </svg>
  );
}

function NoSeatIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 4v8a2 2 0 0 0 2 2h6l3 5M7 14v6M17 12h-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z" />
    </svg>
  );
}
