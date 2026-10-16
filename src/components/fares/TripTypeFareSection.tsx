"use client";

import Link from "next/link";
import { useState } from "react";
import { FareComparisonRow } from "@/components/fares/FareComparisonRow";
import { SelectedFlightSummary } from "@/components/fares/SelectedFlightSummary";
import { productsPricedForTrip } from "@/lib/fares/products";
import type { FareProduct } from "@/lib/fares/products";
import { dayKey } from "@/lib/flights/results";

type Leg = {
  id: string;
  airline: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureAt: Date;
  arrivalAt: Date;
  remainingSeats: number;
};

function ymd(value: Date) {
  return dayKey(value);
}

/**
 * One-way fares on this departure. Round trip is a second step: the customer
 * picks any later reverse-route flight on the published schedule, not a
 * single admin-paired month.
 */
export function TripTypeFareSection({
  outbound,
  pairedReturn,
  products,
  supportEmail,
  disabled,
  adults = 1,
  children = 0,
  infants = 0,
}: {
  outbound: Leg;
  pairedReturn: Leg | null;
  products: FareProduct[];
  supportEmail: string;
  disabled?: boolean;
  adults?: number;
  children?: number;
  infants?: number;
}) {
  const [tripType, setTripType] = useState<"one_way" | "round_trip">("one_way");

  const returnPickerHref = (() => {
    const params = new URLSearchParams({
      origin: outbound.origin,
      destination: outbound.destination,
      date: ymd(outbound.departureAt),
      tripType: "round_trip",
      outboundId: outbound.id,
      adults: String(adults),
      children: String(children),
      infants: String(infants),
      passengers: String(adults + children),
    });
    if (pairedReturn) {
      params.set("returnDate", ymd(pairedReturn.departureAt));
    }
    return `/?${params.toString()}`;
  })();

  const selected = productsPricedForTrip(products, "one_way");
  const displayedProducts = selected.map((p) => ({
    ...p,
    available: p.available && p.priceCents > 0,
  }));

  return (
    <div className="space-y-6">
      <SelectedFlightSummary outbound={outbound} returnFlight={null} />

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          Trip type
        </p>
        <div className="inline-flex rounded-full border border-line bg-white p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => setTripType("one_way")}
            className={`rounded-full px-4 py-2 transition ${
              tripType === "one_way"
                ? "bg-accent-deep text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            One way
          </button>
          <Link
            href={returnPickerHref}
            className={`rounded-full px-4 py-2 transition ${
              tripType === "round_trip"
                ? "bg-accent-deep text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            Round trip
          </Link>
        </div>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Round trip lets you pick any later return on the schedule — for
          example leave in October and come back in November, December or
          January.
          {pairedReturn
            ? ` A typical pairing is ${pairedReturn.flightNumber} on ${new Date(
                pairedReturn.departureAt,
              ).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "UTC",
              })}.`
            : ""}
        </p>
      </div>

      <FareComparisonRow
        products={displayedProducts}
        flightId={outbound.id}
        supportEmail={supportEmail}
        disabled={disabled}
        adults={adults}
        children={children}
        infants={infants}
        title="Choose your fare"
        subtitle="One-way ticket prices on this flight · child 75% · infant 10% (no seat)"
        emptyHint="This flight has no priced ticket types for this cabin yet."
      />
    </div>
  );
}
