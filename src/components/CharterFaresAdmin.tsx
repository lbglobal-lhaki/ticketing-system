"use client";

import { useState } from "react";
import { MoneyInput } from "@/components/MoneyInput";
import { SubmitButton } from "@/components/SubmitButton";
import { updateCharterFareAction } from "@/lib/actions/charterFares";
import { formatAud } from "@/lib/pricing";
import { useStickyAction } from "@/components/forms/useStickyAction";

export type AdminCharterFare = {
  id: string;
  code: string;
  name: string;
  cabinClass: "economy" | "business";
  sortOrder: number;
  priceCents: number;
  roundTripPriceCents: number;
  /** Used to force a fresh mount after every save so no field goes stale. */
  updatedAt: string;
  tagline: string;
  recommended: boolean;
  mostPopular: boolean;
  active: boolean;
  flightChangeLabel: string;
  refundLabel: string;
  checkedBaggage: string;
  cabinBaggage: string;
  seatSelection: string;
  mealLabel: string;
  frequentFlyerLabel: string;
  priorityCheckIn: string;
  priorityBoarding: string;
  changePermitted: boolean;
  changeFeeLabel: string;
  refundPermitted: boolean;
  refundFeeLabel: string;
  perkLines: string[];
  changeBullets: string[];
  refundBullets: string[];
  baggageBullets: string[];
  notes: string;
};

const fieldClass =
  "w-full min-w-0 border-0 border-b border-line bg-transparent py-2 text-sm text-foreground outline-none transition focus:border-accent";

function lines(value: string[]) {
  return value.join("\n");
}

export function CharterFaresAdmin({ fares }: { fares: AdminCharterFare[] }) {
  const [tripMode, setTripMode] = useState<"one_way" | "round_trip">("one_way");
  const economy = fares.filter((f) => f.cabinClass === "economy");
  const business = fares.filter((f) => f.cabinClass === "business");

  return (
    <section className="space-y-8">
      <p className="max-w-2xl text-sm text-muted">
        One-way and round-trip prices are set separately — round trip is a full
        package total, not double one-way.
      </p>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          Price type
        </p>
        <div className="inline-flex rounded-full border border-line bg-white p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => setTripMode("one_way")}
            className={`rounded-full px-4 py-2 transition ${
              tripMode === "one_way"
                ? "bg-accent-deep text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            One way
          </button>
          <button
            type="button"
            onClick={() => setTripMode("round_trip")}
            className={`rounded-full px-4 py-2 transition ${
              tripMode === "round_trip"
                ? "bg-accent-deep text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            Round trip
          </button>
        </div>
      </div>

      <FareGroup title="Economy" fares={economy} tripMode={tripMode} />
      <FareGroup title="Business" fares={business} tripMode={tripMode} />
    </section>
  );
}

function FareGroup({
  title,
  fares,
  tripMode,
}: {
  title: string;
  fares: AdminCharterFare[];
  tripMode: "one_way" | "round_trip";
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        {title}
      </h3>
      {fares.map((fare) => (
        // Remount on every save (updatedAt changes) — otherwise React keeps
        // reusing the old DOM nodes for every defaultValue/defaultChecked
        // field below, so a second save can silently resubmit stale values
        // (most visibly: the price reverting to what it was before the
        // previous edit).
        <FareForm
          key={`${fare.id}-${fare.updatedAt}`}
          fare={fare}
          tripMode={tripMode}
        />
      ))}
    </div>
  );
}

function FareForm({
  fare,
  tripMode,
}: {
  fare: AdminCharterFare;
  tripMode: "one_way" | "round_trip";
}) {
  const isRoundTrip = tripMode === "round_trip";
  // Keep both prices in live state so switching One way / Round trip does
  // not discard an unsaved edit (hidden field used to re-submit prop values).
  const [oneWayAud, setOneWayAud] = useState(
    ((fare.priceCents ?? 0) / 100).toFixed(2),
  );
  const [roundTripAud, setRoundTripAud] = useState(
    ((fare.roundTripPriceCents ?? 0) / 100).toFixed(2),
  );
  const oneWayCents = Math.round(Number(oneWayAud || "0") * 100);
  const roundTripCents = Math.round(Number(roundTripAud || "0") * 100);
  const activeCents = isRoundTrip ? roundTripCents : oneWayCents;
  const sticky = useStickyAction(updateCharterFareAction);

  return (
    <form
      onSubmit={sticky.onSubmit}
      className="space-y-4 rounded-2xl border border-line bg-white/80 p-4 sm:p-5"
    >
      <input type="hidden" name="id" value={fare.id} />
      <input
        type="hidden"
        name={isRoundTrip ? "priceAud" : "roundTripPriceAud"}
        value={isRoundTrip ? oneWayAud : roundTripAud}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-[family-name:var(--font-syne)] text-xl font-semibold">
            {fare.name}
          </p>
          <p className="text-xs text-muted">
            code: {fare.code} · one-way {formatAud(Math.round(Number(oneWayAud || "0") * 100))} · RT{" "}
            {formatAud(Math.round(Number(roundTripAud || "0") * 100))}
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              name="active"
              defaultChecked={fare.active}
            />
            Active
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              name="mostPopular"
              defaultChecked={fare.mostPopular}
            />
            Most popular
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              name="recommended"
              defaultChecked={fare.recommended}
            />
            Recommended
          </label>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            {isRoundTrip ? "Round-trip total (AUD)" : "One-way price (AUD)"} ·
            saved {formatAud(activeCents)}
          </span>
          <MoneyInput
            key={`${fare.id}-${tripMode}`}
            name={isRoundTrip ? "roundTripPriceAud" : "priceAud"}
            defaultValue={isRoundTrip ? roundTripAud : oneWayAud}
            required
            onChange={(e) => {
              const v = e.target.value;
              if (isRoundTrip) setRoundTripAud(v);
              else setOneWayAud(v);
            }}
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Tagline
          </span>
          <input
            name="tagline"
            defaultValue={fare.tagline}
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Flight/date change
          </span>
          <input
            name="flightChangeLabel"
            defaultValue={fare.flightChangeLabel}
            required
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Refund
          </span>
          <input
            name="refundLabel"
            defaultValue={fare.refundLabel}
            required
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Checked baggage
          </span>
          <input
            name="checkedBaggage"
            defaultValue={fare.checkedBaggage}
            required
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Cabin baggage
          </span>
          <input
            name="cabinBaggage"
            defaultValue={fare.cabinBaggage}
            required
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Seat selection
          </span>
          <input
            name="seatSelection"
            defaultValue={fare.seatSelection}
            required
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Meal
          </span>
          <input
            name="mealLabel"
            defaultValue={fare.mealLabel}
            required
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Frequent flyer
          </span>
          <input
            name="frequentFlyerLabel"
            defaultValue={fare.frequentFlyerLabel}
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Priority check-in
          </span>
          <input
            name="priorityCheckIn"
            defaultValue={fare.priorityCheckIn}
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Priority boarding
          </span>
          <input
            name="priorityBoarding"
            defaultValue={fare.priorityBoarding}
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Change fee (details)
          </span>
          <input
            name="changeFeeLabel"
            defaultValue={fare.changeFeeLabel}
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Refund fee (details)
          </span>
          <input
            name="refundFeeLabel"
            defaultValue={fare.refundFeeLabel}
            className={fieldClass}
          />
        </label>
        <label className="inline-flex items-center gap-2 text-sm sm:col-span-1">
          <input
            type="checkbox"
            name="changePermitted"
            defaultChecked={fare.changePermitted}
          />
          Change permitted
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="refundPermitted"
            defaultChecked={fare.refundPermitted}
          />
          Refund permitted
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Perk lines (one per line)
          </span>
          <textarea
            name="perkLines"
            rows={4}
            defaultValue={lines(fare.perkLines)}
            className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Notes
          </span>
          <textarea
            name="notes"
            rows={4}
            defaultValue={fare.notes}
            className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Change policy bullets
          </span>
          <textarea
            name="changeBullets"
            rows={4}
            defaultValue={lines(fare.changeBullets)}
            className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Refund policy bullets
          </span>
          <textarea
            name="refundBullets"
            rows={4}
            defaultValue={lines(fare.refundBullets)}
            className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="space-y-1 text-sm lg:col-span-2">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Baggage bullets
          </span>
          <textarea
            name="baggageBullets"
            rows={3}
            defaultValue={lines(fare.baggageBullets)}
            className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
      </div>

      {sticky.formError ? (
        <p className="text-sm font-medium text-accent-red" role="alert">
          {sticky.formError}
        </p>
      ) : null}
      <SubmitButton
        pending={sticky.pending}
        pendingLabel="Saving…"
        className="rounded-full bg-accent-deep px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        Save {fare.name}
      </SubmitButton>
    </form>
  );
}
