"use client";

import { useMemo, useState } from "react";
import {
  DonutChart,
  SEAT_CHART,
} from "@/components/analytics/DonutChart";
import { ListFilterBar, NoMatches } from "@/components/admin/ListFilterBar";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import type {
  CabinInventory,
  FlightInventoryRow,
} from "@/lib/analytics/systemAnalytics";
import { formatFlightDateTime } from "@/lib/datetime";

function cabinOf(
  flight: FlightInventoryRow,
  cabin: "economy" | "business",
): CabinInventory {
  return (
    flight.cabins.find((c) => c.cabinClass === cabin) ?? {
      cabinClass: cabin,
      totalSeats: 0,
      remainingSeats: 0,
      bookedSeats: 0,
    }
  );
}

function loadTone(pct: number) {
  if (pct >= 90) return "text-accent-red";
  if (pct >= 70) return "[color:var(--success)]";
  return "text-accent";
}

function CabinMini({
  cabin,
  bookedColor,
  openColor,
}: {
  cabin: CabinInventory;
  bookedColor: string;
  openColor: string;
}) {
  const empty = cabin.totalSeats <= 0;
  return (
    <div className="flex flex-col items-center gap-2">
      <DonutChart
        title={`${cabin.cabinClass === "business" ? "Business" : "Economy"} seats`}
        slices={
          empty
            ? [{ label: "Not sold", value: 1, color: SEAT_CHART.empty }]
            : [
                { label: "Booked", value: cabin.bookedSeats, color: bookedColor },
                {
                  label: "Available",
                  value: cabin.remainingSeats,
                  color: openColor,
                },
              ]
        }
        centerValue={empty ? "—" : String(cabin.remainingSeats)}
        centerLabel={empty ? "n/a" : "open"}
        size={112}
        legend={false}
      />
      <div className="text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          {cabin.cabinClass === "business" ? "Business" : "Economy"}
        </p>
        {empty ? (
          <p className="mt-0.5 text-xs text-muted">Not on this flight</p>
        ) : (
          <p className="mt-0.5 text-xs tabular-nums text-foreground">
            <span className="font-semibold">{cabin.bookedSeats}</span> booked
            <span className="text-muted"> · </span>
            <span className="font-semibold">{cabin.remainingSeats}</span> open
          </p>
        )}
      </div>
    </div>
  );
}

function FlightCard({ flight }: { flight: FlightInventoryRow }) {
  const economy = cabinOf(flight, "economy");
  const business = cabinOf(flight, "business");

  return (
    <li className="rounded-card border border-line bg-white p-4 shadow-ui-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-[family-name:var(--font-syne)] text-base font-semibold tracking-tight text-accent-deep">
            {flight.airline} {flight.flightNumber}
          </p>
          <p className="mt-0.5 text-sm text-foreground">{flight.route}</p>
          <p className="mt-0.5 text-xs text-muted">
            {formatFlightDateTime(flight.departureAt)}
          </p>
        </div>
        <div className="text-right">
          <p
            className={cn(
              "font-[family-name:var(--font-syne)] text-xl font-bold tabular-nums",
              loadTone(flight.loadFactorPct),
            )}
          >
            {flight.loadFactorPct}%
          </p>
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
            load
          </p>
          {!flight.active ? (
            <p className="mt-1 text-[11px] font-medium text-muted">Hidden</p>
          ) : !flight.upcoming ? (
            <p className="mt-1 text-[11px] font-medium text-muted">Departed</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <CabinMini
          cabin={economy}
          bookedColor={SEAT_CHART.economyBooked}
          openColor={SEAT_CHART.economyOpen}
        />
        <CabinMini
          cabin={business}
          bookedColor={SEAT_CHART.businessBooked}
          openColor={SEAT_CHART.businessOpen}
        />
      </div>

      <p className="mt-4 border-t border-line pt-3 text-xs tabular-nums text-muted">
        Aircraft{" "}
        <span className="font-semibold text-foreground">{flight.bookedSeats}</span>{" "}
        booked ·{" "}
        <span className="font-semibold text-foreground">
          {flight.remainingSeats}
        </span>{" "}
        open · {flight.totalSeats} seats
      </p>
    </li>
  );
}

export function FlightSeatInventory({
  flights,
}: {
  flights: FlightInventoryRow[];
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("upcoming");

  const counts = useMemo(
    () => ({
      upcoming: flights.filter((f) => f.upcoming).length,
      past: flights.filter((f) => !f.upcoming).length,
      all: flights.length,
    }),
    [flights],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const scoped = flights.filter((f) => {
      if (scope === "upcoming") return f.upcoming;
      if (scope === "past") return !f.upcoming;
      return true;
    });
    const filtered = q
      ? scoped.filter((f) =>
          [
            f.airline,
            f.flightNumber,
            f.route,
            f.origin,
            f.destination,
          ]
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : scoped;

    return [...filtered].sort((a, b) => {
      const aTime = new Date(a.departureAt).getTime();
      const bTime = new Date(b.departureAt).getTime();
      return scope === "past" ? bTime - aTime : aTime - bTime;
    });
  }, [flights, query, scope]);

  return (
    <Card>
      <CardHeader
        title="Seat inventory by flight"
        description="Booked and available seats in economy and business for every departure."
      />
      <CardBody className="space-y-5">
        <ListFilterBar
          query={query}
          onQueryChange={setQuery}
          placeholder="Search flight, route or city…"
          chips={[
            { value: "upcoming", label: "Upcoming", count: counts.upcoming },
            { value: "past", label: "Departed", count: counts.past },
            { value: "all", label: "All", count: counts.all },
          ]}
          activeChip={scope}
          onChipChange={setScope}
          resultCount={visible.length}
          totalCount={
            scope === "upcoming"
              ? counts.upcoming
              : scope === "past"
                ? counts.past
                : counts.all
          }
          itemLabel="flight"
        />

        {visible.length === 0 ? (
          <NoMatches
            label="No flights in this view. Try another filter or search."
            onReset={() => {
              setQuery("");
              setScope("upcoming");
            }}
          />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((flight) => (
              <FlightCard key={flight.id} flight={flight} />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
