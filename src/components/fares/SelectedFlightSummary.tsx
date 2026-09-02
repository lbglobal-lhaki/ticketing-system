import {
  formatClock,
  formatDuration,
  formatShortDate,
  flightDurationMinutes,
  routeCityLabel,
} from "@/lib/flights/results";
import { airportTzAbbr } from "@/lib/datetime";

type Leg = {
  airline: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureAt: Date;
  arrivalAt: Date;
};

export function SelectedFlightSummary({
  outbound,
  returnFlight,
}: {
  outbound: Leg;
  returnFlight?: Leg | null;
}) {
  return (
    <section className="rounded-2xl border border-line bg-white p-4 shadow-[0_10px_28px_rgba(15, 23, 42,0.05)] sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        Selected flight
      </p>
      <FlightLegRow leg={outbound} label={returnFlight ? "Outbound" : undefined} />
      {returnFlight ? (
        <>
          <div className="my-4 h-px bg-line" />
          <FlightLegRow leg={returnFlight} label="Return" />
        </>
      ) : null}
    </section>
  );
}

function FlightLegRow({ leg, label }: { leg: Leg; label?: string }) {
  const duration = flightDurationMinutes(
    leg.departureAt,
    leg.arrivalAt,
    leg.origin,
    leg.destination,
  );
  return (
    <div className="mt-4 min-w-0">
      {label ? (
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          {label}
        </p>
      ) : null}
      <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold">
        <img
          src="/drukair_logo.png"
          alt=""
          width={72}
          height={72}
          className="size-16 shrink-0 rounded-xl object-contain sm:size-[4.5rem]"
        />
        <span className="min-w-0 truncate">
          {leg.airline}{" "}
          <span className="font-medium text-muted">{leg.flightNumber}</span>
        </span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
        <div className="min-w-0">
          <p className="font-[family-name:var(--font-syne)] text-xl font-bold tracking-tight sm:text-2xl">
            {formatClock(leg.departureAt)}
          </p>
          <p className="text-[11px] font-medium text-muted sm:text-xs">
            {airportTzAbbr(leg.origin, leg.departureAt)}
          </p>
          <p className="text-[11px] text-muted sm:text-xs">
            {formatShortDate(leg.departureAt)}
          </p>
          <p className="mt-1 font-semibold">{leg.origin}</p>
          <p className="truncate text-[11px] text-muted sm:text-xs">
            {routeCityLabel(leg.origin)}
          </p>
        </div>
        <div className="flex w-[4.5rem] flex-col items-center gap-1 sm:w-[6.5rem]">
          <p className="text-[10px] text-muted sm:text-xs">
            {formatDuration(duration)}
          </p>
          <div className="flex w-full items-center gap-1 sm:gap-2">
            <span className="h-px flex-1 bg-line" />
            <span className="rounded-full bg-surface px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-accent-deep sm:px-2 sm:text-[10px]">
              Nonstop
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>
        </div>
        <div className="min-w-0 text-right">
          <p className="font-[family-name:var(--font-syne)] text-xl font-bold tracking-tight sm:text-2xl">
            {formatClock(leg.arrivalAt)}
          </p>
          <p className="text-[11px] font-medium text-muted sm:text-xs">
            {airportTzAbbr(leg.destination, leg.arrivalAt)}
          </p>
          <p className="text-[11px] text-muted sm:text-xs">
            {formatShortDate(leg.arrivalAt)}
          </p>
          <p className="mt-1 font-semibold">{leg.destination}</p>
          <p className="truncate text-[11px] text-muted sm:text-xs">
            {routeCityLabel(leg.destination)}
          </p>
        </div>
      </div>
    </div>
  );
}
