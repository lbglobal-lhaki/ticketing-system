import Link from "next/link";
import {
  estimateCo2Kg,
  formatCardDate,
  formatClock,
  formatDuration,
  routeCityLabel,
  type CabinFare,
  type FlightResultRow,
} from "@/lib/flights/results";
import { airportTzAbbr } from "@/lib/datetime";
import { formatAud } from "@/lib/pricing";

type FlightResultCardProps = {
  flight: FlightResultRow;
  globalLowestFareCents: number | null;
};

export function FlightResultCard({
  flight,
  globalLowestFareCents,
}: FlightResultCardProps) {
  const stopLabel = flight.stops === 0 ? "Nonstop" : `${flight.stops} Stop`;
  const detailsHref =
    flight.economy?.href ?? flight.business?.href ?? "#";

  return (
    <article className="results-card overflow-hidden rounded-2xl border border-line bg-white shadow-[0_8px_28px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-5 p-4 sm:p-5 lg:flex-row lg:items-stretch lg:gap-6 lg:p-6">
        {/* Schedule column */}
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <div className="mb-4 flex min-w-0 items-center gap-2.5">
            <img
              src="/drukair_logo.png"
              alt=""
              width={56}
              height={56}
              className="size-12 shrink-0 rounded-[12px] object-contain sm:size-14"
            />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="min-w-0 truncate font-[family-name:var(--font-syne)] text-sm font-bold tracking-tight text-accent-deep sm:text-base">
                  {flight.airline}{" "}
                  <span className="font-semibold text-foreground">
                    {flight.flightNumber}
                  </span>
                </p>
                <TripBadge flight={flight} />
              </div>
              {flight.roundTripAvailable &&
              flight.returnDepartureAt &&
              flight.roleLabel !== "return" ? (
                <p className="mt-1 text-xs text-muted">
                  Return{" "}
                  {flight.returnFlightNumber
                    ? `${flight.returnFlightNumber} · `
                    : ""}
                  {formatCardDate(flight.returnDepartureAt)}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 sm:gap-5">
            <Endpoint
              time={formatClock(flight.departureAt)}
              tz={airportTzAbbr(flight.origin, new Date(flight.departureAt))}
              date={formatCardDate(flight.departureAt)}
              code={flight.origin}
              city={routeCityLabel(flight.origin)}
              align="left"
            />

            <div className="flex w-[5.5rem] flex-col items-center gap-1.5 pt-1 sm:w-[9rem]">
              <p className="text-xs font-medium text-muted">
                {formatDuration(flight.durationMinutes)}
              </p>
              <div className="flex w-full items-center gap-1.5">
                <span className="h-px flex-1 bg-line" />
                <span className="badge-info px-2.5 py-0.5 text-[10px] sm:text-[11px]">
                  {stopLabel}
                </span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <Link
                href={detailsHref}
                className="mt-0.5 text-xs font-semibold text-accent transition hover:text-accent-deep"
              >
                Flight Details
              </Link>
            </div>

            <Endpoint
              time={formatClock(flight.arrivalAt)}
              tz={airportTzAbbr(
                flight.destination,
                new Date(flight.arrivalAt),
              )}
              date={formatCardDate(flight.arrivalAt)}
              code={flight.destination}
              city={routeCityLabel(flight.destination)}
              align="right"
            />
          </div>
        </div>

        {/* Cabin fare boxes */}
        <div className="grid min-w-0 shrink-0 grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 lg:w-[22rem] xl:w-[24.5rem]">
          <CabinPriceCard
            label="Economy"
            fare={flight.economy}
            durationMinutes={flight.durationMinutes}
            isLowest={
              flight.economy?.farePriced === true &&
              globalLowestFareCents != null &&
              flight.economy.displayPriceCents === globalLowestFareCents
            }
          />
          <CabinPriceCard
            label="Business"
            fare={flight.business}
            durationMinutes={flight.durationMinutes}
            isLowest={
              flight.business?.farePriced === true &&
              globalLowestFareCents != null &&
              flight.business.displayPriceCents === globalLowestFareCents
            }
          />
        </div>
      </div>
    </article>
  );
}

function TripBadge({ flight }: { flight: FlightResultRow }) {
  if (flight.roleLabel === "return") {
    return (
      <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-sky-900">
        Return
      </span>
    );
  }
  if (flight.roleLabel === "outbound" && flight.roundTripAvailable) {
    return (
      <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-900">
        Round trip
      </span>
    );
  }
  if (flight.roundTripAvailable) {
    return (
      <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-900">
        Round trip
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-700">
      One way
    </span>
  );
}

function Endpoint({
  time,
  tz,
  date,
  code,
  city,
  align,
}: {
  time: string;
  tz: string;
  date: string;
  code: string;
  city: string;
  align: "left" | "right";
}) {
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : "text-left"}`}>
      <p className="font-[family-name:var(--font-syne)] text-2xl font-bold leading-none tracking-tight text-foreground sm:text-[1.75rem]">
        {time}
      </p>
      <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
        {tz}
      </p>
      <p className="mt-1 text-xs text-muted">{date}</p>
      <p className="mt-2 font-[family-name:var(--font-syne)] text-lg font-bold tracking-tight text-foreground sm:text-xl">
        {code}
      </p>
      <p className="truncate text-sm text-foreground/80" title={city}>
        {city}
      </p>
    </div>
  );
}

function CabinPriceCard({
  label,
  fare,
  durationMinutes,
  isLowest,
}: {
  label: string;
  fare: CabinFare | null;
  durationMinutes: number;
  isLowest: boolean;
}) {
  if (!fare) {
    return (
      <div className="relative flex min-h-[8.5rem] flex-col justify-between rounded-xl border border-line bg-white px-3.5 py-3.5">
        <p className="text-xs font-medium text-muted">{label}</p>
        <p className="py-4 text-center text-sm font-medium text-muted">
          Not Available
        </p>
        <span aria-hidden className="h-4" />
      </div>
    );
  }

  const soldOut = fare.remainingSeats < 1 || !fare.farePriced;
  const co2 = estimateCo2Kg(durationMinutes, fare.cabinClass);
  const lowSeats =
    !soldOut && fare.remainingSeats > 0 && fare.remainingSeats <= 9;

  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        {lowSeats ? (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
            {fare.remainingSeats} Seat{fare.remainingSeats === 1 ? "" : "s"} Left
          </span>
        ) : null}
      </div>

      {soldOut ? (
        <p className="flex flex-1 items-center justify-center text-sm font-medium text-muted">
          {!fare.farePriced ? "Not Available" : "Not Available"}
        </p>
      ) : (
        <>
          <p className="mt-2 font-[family-name:var(--font-syne)] text-xl font-bold tracking-tight text-accent-deep sm:text-[1.35rem]">
            {formatAud(fare.displayPriceCents)}
          </p>
          <p className="mt-auto inline-flex items-center gap-1.5 pt-3 text-[11px] text-muted">
            <LeafIcon />
            {co2} Kgs CO2e
            <InfoIcon />
          </p>
        </>
      )}

      {isLowest && !soldOut ? (
        <span
          className="badge-promo absolute bottom-2 right-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          title="Lowest fare"
        >
          Lowest
        </span>
      ) : null}
    </>
  );

  if (soldOut) {
    return (
      <div className="relative flex min-h-[8.5rem] flex-col rounded-xl border border-line bg-white px-3.5 py-3.5">
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={fare.href}
      className="relative flex min-h-[8.5rem] flex-col rounded-xl border border-line bg-white px-3.5 py-3.5 transition hover:-translate-y-0.5 hover:border-accent hover:shadow-[0_10px_24px_rgba(15,23,42,0.1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {inner}
    </Link>
  );
}

function LeafIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 19c8 0 12-6 14-14-8 2-14 6-14 14Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M5 19c2-6 7-10 14-12"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 11v5M12 8.2h.01"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
