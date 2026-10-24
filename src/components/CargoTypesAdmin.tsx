"use client";

import { useState } from "react";
import { MoneyInput } from "@/components/MoneyInput";
import { SubmitButton } from "@/components/SubmitButton";
import { FieldError, labeledControlClass } from "@/components/forms/FieldError";
import { useStickyAction } from "@/components/forms/useStickyAction";
import {
  deleteCargoWeightOptionAction,
  saveCargoWeightOptionAction,
} from "@/lib/actions/cargoWeightOptions";
import {
  CARGO_FLIGHT_CATEGORIES,
  optionPriceLabel,
  optionRangeLabel,
  type CargoWeightOptionRow,
} from "@/lib/cargo/weightOptions";
import {
  ticketTypeKey,
  type TicketTypeChoice,
} from "@/lib/fares/baggageAllowance";
import { cabinLabel } from "@/lib/fares/templates";
import { formatDualCargoPrice } from "@/lib/pricing";

const fieldClass =
  "w-full min-w-0 border-0 border-b border-line bg-transparent py-2 text-sm text-foreground outline-none transition focus:border-accent";

function originLabel(code: string) {
  return (
    CARGO_FLIGHT_CATEGORIES.find((c) => c.origin === code)?.label ?? code
  );
}

function OptionForm({
  option,
  ticketTypes,
  options,
  onCancel,
}: {
  option: CargoWeightOptionRow | null;
  ticketTypes: TicketTypeChoice[];
  options: CargoWeightOptionRow[];
  onCancel: () => void;
}) {
  const sticky = useStickyAction(saveCargoWeightOptionAction);
  const err = (key: string) => sticky.fieldErrors[key];
  const [kind, setKind] = useState<"fixed" | "per_kg">(
    option?.kind ?? "fixed",
  );
  const [sellAsCargo, setSellAsCargo] = useState(option?.sellAsCargo ?? true);
  const selectedOrigins = option?.origins ?? [];
  const selectedKeys = new Set(
    (option?.ticketTypes ?? []).map((t) => ticketTypeKey(t.cabinClass, t.name)),
  );
  const ownerByKey = new Map<string, string>();
  for (const row of options) {
    if (option && row.id === option.id) continue;
    for (const t of row.ticketTypes) {
      ownerByKey.set(ticketTypeKey(t.cabinClass, t.name), row.name);
    }
  }
  const economyTypes = ticketTypes.filter((t) => t.cabinClass === "economy");
  const businessTypes = ticketTypes.filter((t) => t.cabinClass === "business");

  return (
    <form
      onSubmit={sticky.onSubmit}
      data-skip-busy
      className="space-y-4 rounded-2xl border border-line bg-white p-4 sm:p-5"
    >
      {option ? <input type="hidden" name="id" value={option.id} /> : null}
      <input type="hidden" name="active" value="true" />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Name
          </span>
          <input
            name="name"
            required
            defaultValue={option?.name ?? ""}
            placeholder="e.g. 20 kg"
            className={labeledControlClass(fieldClass, err("name"))}
          />
          <FieldError error={err("name")} />
        </label>

        <label className="block text-sm sm:col-span-2">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Customer-facing note
          </span>
          <input
            name="description"
            defaultValue={option?.description ?? ""}
            placeholder="e.g. Below 500 g"
            className={labeledControlClass(fieldClass, err("description"))}
          />
        </label>

        <div className="sm:col-span-2">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            How it is priced
          </p>
          <div className="mt-2 inline-flex rounded-full border border-line bg-white p-1 text-sm font-medium">
            <button
              type="button"
              onClick={() => setKind("fixed")}
              className={`rounded-full px-4 py-2 transition ${
                kind === "fixed"
                  ? "bg-accent-deep text-white"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Fixed total
            </button>
            <button
              type="button"
              onClick={() => setKind("per_kg")}
              className={`rounded-full px-4 py-2 transition ${
                kind === "per_kg"
                  ? "bg-accent-deep text-white"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Per kilogram
            </button>
          </div>
          <input type="hidden" name="kind" value={kind} />
        </div>

        {kind === "fixed" ? (
          <>
            <label className="block text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                Weight held on the aircraft (kg)
              </span>
              <input
                name="minKg"
                type="number"
                min={0}
                required
                defaultValue={option?.chargeableKg || option?.minKg || 1}
                className={labeledControlClass(fieldClass, err("minKg"))}
              />
              <input type="hidden" name="chargeableKg" value="" />
              <p className="mt-1 text-xs text-muted">
                Documents use 1 kg against payload even though the tariff is
                below 500 g.
              </p>
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                Price (AUD)
              </span>
              <MoneyInput
                name="priceAud"
                required={sellAsCargo}
                defaultValue={((option?.priceCents ?? 0) / 100).toFixed(2)}
                className={labeledControlClass(fieldClass, err("priceAud"))}
              />
              <FieldError error={err("priceAud")} />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                Price (BTN / Nu.)
              </span>
              <MoneyInput
                name="priceBtn"
                affix="Nu."
                defaultValue={((option?.priceBtnCents ?? 0) / 100).toFixed(2)}
                className={labeledControlClass(fieldClass, err("priceBtn"))}
              />
              <FieldError error={err("priceBtn")} />
              <p className="mt-1 text-xs text-muted">
                Optional. Shown to customers as BTN Nu. alongside AUD. GST-exclusive,
                same as the Australian price.
              </p>
            </label>
          </>
        ) : (
          <>
            <label className="block text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                From (kg)
              </span>
              <input
                name="minKg"
                type="number"
                min={1}
                required
                defaultValue={option?.minKg ?? 100}
                className={labeledControlClass(fieldClass, err("minKg"))}
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                Up to (kg)
              </span>
              <input
                name="maxKg"
                type="number"
                min={1}
                defaultValue={option?.maxKg ?? ""}
                placeholder="Leave blank for no upper limit"
                className={labeledControlClass(fieldClass, err("maxKg"))}
              />
              <FieldError error={err("maxKg")} />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                Rate per kg (AUD)
              </span>
              <MoneyInput
                name="priceAud"
                required={sellAsCargo}
                defaultValue={((option?.priceCents ?? 0) / 100).toFixed(2)}
                className={labeledControlClass(fieldClass, err("priceAud"))}
              />
              <FieldError error={err("priceAud")} />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                Rate per kg (BTN / Nu.)
              </span>
              <MoneyInput
                name="priceBtn"
                affix="Nu."
                defaultValue={((option?.priceBtnCents ?? 0) / 100).toFixed(2)}
                className={labeledControlClass(fieldClass, err("priceBtn"))}
              />
              <FieldError error={err("priceBtn")} />
            </label>
          </>
        )}

        <label className="block text-sm">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Display order
          </span>
          <input
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={option?.sortOrder ?? 0}
            className={fieldClass}
          />
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
          Sold on these flight categories
        </legend>
        <p className="text-xs text-muted">
          Leave both ticked to sell on every departure. Untick a sector to hide
          this band there — Paro lifts less than Perth, so heavier bands often
          stay Australia-outbound only.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {CARGO_FLIGHT_CATEGORIES.map((category) => (
            <label
              key={category.origin}
              className="flex items-start gap-2.5 rounded-xl border border-line px-3 py-3 text-sm"
            >
              <input
                type="checkbox"
                name="origin"
                value={category.origin}
                defaultChecked={
                  selectedOrigins.length === 0 ||
                  selectedOrigins.includes(category.origin)
                }
                className="mt-0.5 size-4 accent-accent-deep"
              />
              <span>
                <span className="font-medium text-foreground">
                  {category.label}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {category.hint}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-start gap-2.5 rounded-xl border border-line px-3 py-3 text-sm">
        <input
          type="checkbox"
          checked={sellAsCargo}
          onChange={(e) => setSellAsCargo(e.target.checked)}
          className="mt-0.5 size-4 accent-accent-deep"
        />
        <span>
          <span className="font-medium text-foreground">
            Sell this band on the cargo page
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            Turn off for passenger baggage only — for example 23 kg on Early
            Bird — so it does not appear as a cargo product.
          </span>
        </span>
      </label>
      <input type="hidden" name="sellAsCargo" value={sellAsCargo ? "true" : "false"} />

      <fieldset className="space-y-3">
        <legend className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
          Include with these ticket types
        </legend>
        <p className="text-xs text-muted">
          Tick Early Bird (or any other type) to give that fare this weight as
          included checked baggage. It shows on fare cards, invoices and travel
          documents. A ticket type can only sit on one weight — ticking it here
          moves it off the other option.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { title: "Economy", rows: economyTypes },
            { title: "Business", rows: businessTypes },
          ].map((group) => (
            <div key={group.title} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                {group.title}
              </p>
              {group.rows.map((choice) => {
                const owner = ownerByKey.get(choice.key);
                return (
                  <label
                    key={choice.key}
                    className="flex items-start gap-2.5 rounded-xl border border-line px-3 py-2.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="ticketType"
                      value={`${choice.cabinClass}:${choice.name}`}
                      defaultChecked={selectedKeys.has(choice.key)}
                      className="mt-0.5 size-4 accent-accent-deep"
                    />
                    <span>
                      <span className="font-medium text-foreground">
                        {choice.name}
                      </span>
                      {owner ? (
                        <span className="mt-0.5 block text-xs text-muted">
                          Currently on {owner} — tick to move it here
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
              Other cabin
            </span>
            <select
              name="customTicketTypeCabin"
              defaultValue="economy"
              className={fieldClass}
            >
              <option value="economy">Economy</option>
              <option value="business">Business</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
              Other ticket type name
            </span>
            <input
              name="customTicketTypeName"
              placeholder="e.g. Super Saver"
              className={fieldClass}
            />
          </label>
        </div>
      </fieldset>

      {sticky.formError ? (
        <p className="text-sm text-red-700">{sticky.formError}</p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <SubmitButton
          pending={sticky.pending}
          pendingLabel="Saving…"
          className="btn-cta min-h-10 px-5 text-sm"
        >
          {option ? "Save option" : "Add option"}
        </SubmitButton>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-medium text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function CargoTypesAdmin({
  options,
  ticketTypes,
}: {
  options: CargoWeightOptionRow[];
  ticketTypes: TicketTypeChoice[];
}) {
  const [editingId, setEditingId] = useState<string | null | "new">(null);
  const live = options.filter(
    (o) => o.active && o.sellAsCargo && o.priceCents > 0,
  );

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold tracking-tight">
            Cargo weight options
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Cargo customers pick a priced band. Set AUD and, if you use it,
            BTN (Nu.) — both show on the cargo page. Tick ticket types on a
            weight to include that allowance on the fare, invoice and travel
            document.
          </p>
        </div>
        {editingId === null ? (
          <button
            type="button"
            onClick={() => setEditingId("new")}
            className="btn-cta shrink-0 rounded-xl px-4 py-2.5 text-sm"
          >
            Add weight option
          </button>
        ) : null}
      </div>

      <p className="text-sm text-muted">
        {live.length > 0
          ? `${live.length} option${live.length === 1 ? "" : "s"} live on the cargo page.`
          : "No live options — the cargo page will not take bookings until you add one."}
      </p>

      {editingId === "new" ? (
        <OptionForm
          option={null}
          ticketTypes={ticketTypes}
          options={options}
          onCancel={() => setEditingId(null)}
        />
      ) : null}

      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
        {options.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted">
            No weight options yet. Add the tariff so customers can book.
          </li>
        ) : (
          options.map((option) => {
            const origins =
              option.origins.length === 0
                ? "Every departure"
                : option.origins.map(originLabel).join(" · ");
            return (
              <li key={option.id} className="px-4 py-4 sm:px-5">
                {editingId === option.id ? (
                  <OptionForm
                    option={option}
                    ticketTypes={ticketTypes}
                    options={options}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="font-[family-name:var(--font-syne)] text-base font-semibold">
                          {option.name}
                        </p>
                        <span
                          className={`px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] ${
                            option.active
                              ? "bg-sky-100 text-sky-800"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {option.active ? "Live" : "Hidden"}
                        </span>
                        <span className="px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] bg-violet-100 text-violet-800">
                          {option.kind === "fixed" ? "Fixed" : "Per kg"}
                        </span>
                      </div>
                      <p className="text-sm text-muted">
                        {optionRangeLabel(option)}
                        {option.sellAsCargo ? ` · ${origins}` : " · Passenger baggage only"}
                      </p>
                      {option.ticketTypes.length > 0 ? (
                        <p className="text-sm text-foreground">
                          {option.ticketTypes
                            .map((t) => `${t.name} (${cabinLabel(t.cabinClass)})`)
                            .join(" · ")}
                        </p>
                      ) : (
                        <p className="text-sm text-muted">
                          Not allocated to a ticket type
                        </p>
                      )}
                      <p className="font-[family-name:var(--font-syne)] text-lg font-bold text-accent-deep">
                        {option.sellAsCargo
                          ? optionPriceLabel(option)
                          : "Included with fare"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(option.id)}
                        className="tap-target rounded-control border border-line px-3 text-xs font-medium text-accent-deep transition hover:border-accent"
                      >
                        Edit
                      </button>
                      <form action={deleteCargoWeightOptionAction}>
                        <input type="hidden" name="id" value={option.id} />
                        <SubmitButton
                          pendingLabel="Removing…"
                          onClick={(e) => {
                            if (
                              !confirm(
                                `Remove ${option.name} (${formatDualCargoPrice(option.priceCents, option.priceBtnCents, option.kind === "per_kg" ? " / kg" : "")}) from the cargo shop?\n\nExisting bookings keep this price. If any bookings used it, it is hidden instead of erased.`,
                              )
                            ) {
                              e.preventDefault();
                            }
                          }}
                          className="tap-target rounded-control border border-line px-3 text-xs font-medium text-muted/70 transition hover:border-accent-red/40 hover:text-accent-red"
                        >
                          Delete
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
