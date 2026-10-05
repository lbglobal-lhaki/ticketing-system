"use client";

import { useState } from "react";
import { FareComparisonRow } from "@/components/fares/FareComparisonRow";
import { SelectedFlightSummary } from "@/components/fares/SelectedFlightSummary";
import { fareProductsForTripType } from "@/lib/fares/products";
import type { FareProduct } from "@/lib/fares/products";

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

/**
 * Charter fare selection with an inline One way / Round trip toggle.
 *
 * This charter route sells one fixed round-trip pair per month — customers
 * don't search for a return flight separately. If this flight has a
 * designated `pairedReturn` leg, picking "Round trip" here auto-attaches it
 * and uses the stored round-trip catalogue total; no second search step required.
 */
export function TripTypeFareSection({
  outbound,
  pairedReturn,
  products,
  fallbackProducts = [],
  supportEmail,
  disabled,
  adults = 1,
  children = 0,
  infants = 0,
  pricingSource = "charter",
}: {
  outbound: Leg;
  pairedReturn: Leg | null;
  products: FareProduct[];
  /** Used when the primary catalogue has no price for the chosen trip type. */
  fallbackProducts?: FareProduct[];
  supportEmail: string;
  disabled?: boolean;
  adults?: number;
  children?: number;
  infants?: number;
  pricingSource?: string;
}) {
  const canRoundTrip = Boolean(pairedReturn && pairedReturn.remainingSeats > 0);
  const usingTicketTypes = pricingSource === "ticket_types";
  const [tripType, setTripType] = useState<"one_way" | "round_trip">(
    canRoundTrip ? "round_trip" : "one_way",
  );

  const isRoundTrip = tripType === "round_trip" && canRoundTrip;

  const trip = isRoundTrip ? "round_trip" : "one_way";
  const selected = fareProductsForTripType(products, fallbackProducts, trip);
  const usingTicketCards =
    usingTicketTypes ||
    (pricingSource !== "ticket_types" &&
      products.filter((p) =>
        isRoundTrip ? p.roundTripPriceCents > 0 : p.priceCents > 0,
      ).length === 0 &&
      selected.length > 0);

  const displayedProducts = isRoundTrip
    ? selected.map((p) => ({
        ...p,
        priceCents: p.roundTripPriceCents,
        available: p.available && p.roundTripPriceCents > 0,
        notes: p.notes
          ? `${p.notes} · round-trip total (both legs)`
          : "Round-trip total (both legs)",
      }))
    : selected.map((p) => ({
        ...p,
        available: p.available && p.priceCents > 0,
      }));

  return (
    <div className="space-y-6">
      <SelectedFlightSummary
        outbound={outbound}
        returnFlight={isRoundTrip ? pairedReturn : null}
      />

      {canRoundTrip && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Trip type
          </p>
          <div className="inline-flex rounded-full border border-line bg-white p-1 text-sm font-medium">
            <button
              type="button"
              onClick={() => setTripType("one_way")}
              className={`rounded-full px-4 py-2 transition ${
                !isRoundTrip
                  ? "bg-accent-deep text-white"
                  : "text-muted hover:text-foreground"
              }`}
            >
              One way
            </button>
            <button
              type="button"
              onClick={() => setTripType("round_trip")}
              className={`rounded-full px-4 py-2 transition ${
                isRoundTrip
                  ? "bg-accent-deep text-white"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Round trip
            </button>
          </div>
        </div>
      )}

      <FareComparisonRow
        products={displayedProducts}
        flightId={outbound.id}
        returnFlightId={isRoundTrip ? pairedReturn!.id : undefined}
        supportEmail={supportEmail}
        disabled={disabled}
        adults={adults}
        children={children}
        infants={infants}
        title={isRoundTrip ? "Choose your round-trip fare" : "Choose your fare"}
        subtitle={
          isRoundTrip
            ? usingTicketCards
              ? "Ticket prices for both legs · child 75% · infant 10% (no seat)"
              : "Adult package for both legs · child 75% · infant 10% (no seat)"
            : usingTicketCards
              ? "Ticket prices on this flight · child 75% · infant 10% (no seat)"
              : "Adult fare per seat · child 75% · infant 10% (no seat)"
        }
        emptyHint={
          usingTicketCards || usingTicketTypes
            ? "This flight has no priced ticket types for this cabin yet."
            : "Ask admin to activate charter fares for this cabin."
        }
      />
    </div>
  );
}
