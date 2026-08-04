"use client";

import { MoneyInput } from "@/components/MoneyInput";
import { updateCharterFareAction } from "@/lib/actions/charterFares";
import { formatAud } from "@/lib/pricing";

export type AdminCharterFare = {
  id: string;
  code: string;
  name: string;
  cabinClass: "economy" | "business";
  sortOrder: number;
  priceCents: number;
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
  const economy = fares.filter((f) => f.cabinClass === "economy");
  const business = fares.filter((f) => f.cabinClass === "business");

  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight">
          Charter fare products
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Perth ⇄ Paro rules shown to customers. Edit prices, tags, and policy
          labels — these drive the fare selection cards and checkout totals.
        </p>
      </div>

      <FareGroup title="Economy" fares={economy} />
      <FareGroup title="Business" fares={business} />
    </section>
  );
}

function FareGroup({
  title,
  fares,
}: {
  title: string;
  fares: AdminCharterFare[];
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        {title}
      </h3>
      {fares.map((fare) => (
        <form
          key={fare.id}
          action={updateCharterFareAction}
          className="space-y-4 rounded-2xl border border-line bg-white/80 p-4 sm:p-5"
        >
          <input type="hidden" name="id" value={fare.id} />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-[family-name:var(--font-syne)] text-xl font-semibold">
                {fare.name}
              </p>
              <p className="text-xs text-muted">
                code: {fare.code} · currently {formatAud(fare.priceCents)}
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
                Price (AUD)
              </span>
              <MoneyInput
                name="priceAud"
                defaultValue={Math.round(fare.priceCents / 100)}
                required
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

          <button
            type="submit"
            className="rounded-full bg-accent-deep px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent"
          >
            Save {fare.name}
          </button>
        </form>
      ))}
    </div>
  );
}
