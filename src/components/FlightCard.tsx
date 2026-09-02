import Link from "next/link";
import { formatAud } from "@/lib/pricing";
import { airportLabel, cabinLabel, formatFlightTime } from "@/lib/format";

type FlightCardProps = {
  id: string;
  airline: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureAt: Date;
  arrivalAt: Date;
  cabinClass: string;
  remainingSeats: number;
  totalSeats: number;
  displayPriceCents: number;
  basePriceCents: number;
  fareReleaseName?: string | null;
  farePriced?: boolean;
  href: string;
  ctaLabel?: string;
};

export function FlightCard(props: FlightCardProps) {
  const soldOut = props.remainingSeats < 1 || props.farePriced === false;
  const scarce = props.remainingSeats / props.totalSeats <= 0.2;

  return (
    <article className="flex flex-col gap-3 border-b border-zinc-200 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <p className="text-sm font-medium text-zinc-900">
          {props.airline} {props.flightNumber}
          <span className="ml-2 text-xs font-normal uppercase tracking-wide text-zinc-500">
            {cabinLabel(props.cabinClass)}
          </span>
        </p>
        <p className="text-base text-zinc-800">
          {airportLabel(props.origin)} → {airportLabel(props.destination)}
        </p>
        <p className="text-sm text-zinc-500">
          Departs {formatFlightTime(props.departureAt, props.origin)} · Arrives{" "}
          {formatFlightTime(props.arrivalAt, props.destination)}
        </p>
        {props.fareReleaseName && (
          <p className="text-sm font-medium text-accent">
            {props.fareReleaseName}
          </p>
        )}
        <p
          className={`text-sm ${soldOut ? "text-red-700" : scarce ? "text-amber-700" : "text-zinc-500"}`}
        >
          {props.remainingSeats < 1
            ? "Sold out"
            : props.farePriced === false
              ? "Awaiting fare price"
              : `${props.remainingSeats} of ${props.totalSeats} seats left`}
        </p>
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <div className="text-right">
          {props.farePriced === false ? (
            <p className="text-lg font-semibold text-zinc-500">Price TBA</p>
          ) : (
            <p className="text-xl font-semibold text-zinc-900">
              {formatAud(props.displayPriceCents)}
            </p>
          )}
        </div>
        {soldOut ? (
          <span className="text-sm text-zinc-400">Unavailable</span>
        ) : (
          <Link
            href={props.href}
            className="inline-flex items-center justify-center bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            {props.ctaLabel ?? "View"}
          </Link>
        )}
      </div>
    </article>
  );
}
