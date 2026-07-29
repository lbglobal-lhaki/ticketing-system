"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createFlightAction,
  deleteFlightAction,
  removeFlightAction,
  restoreFlightAction,
  updateFarePriceAction,
  updateFlightAction,
} from "@/lib/actions/admin";
import {
  InvoiceAdminPanel,
  type AdminInvoiceRow,
} from "@/components/InvoiceAdminPanel";
import {
  createWalkInBookingAction,
  markBookingPaidAction,
  markBookingUnpaidAction,
} from "@/lib/actions/walkIn";
import type { SystemAnalytics } from "@/lib/analytics/systemAnalytics";
import {
  CharterFaresAdmin,
  type AdminCharterFare,
} from "@/components/CharterFaresAdmin";
import {
  CargoAdminPanel,
  type AdminCargoRow,
} from "@/components/CargoAdminPanel";
import { SystemAnalyticsSection } from "@/components/SystemAnalyticsSection";
import { toDateTimeLocalValue } from "@/lib/datetime";
import {
  BUSINESS_FARE_TEMPLATE,
  ECONOMY_FARE_TEMPLATE,
} from "@/lib/fares/templates";
import { formatAud } from "@/lib/pricing";

type CabinClass = "economy" | "business";
type TripType = "one_way" | "round_trip";

type FareRow = {
  id?: string;
  name: string;
  sortOrder: number;
  totalSeats: number;
  remainingSeats: number;
  priceCents: number;
};

type FlightRow = {
  id: string;
  airline: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  cabinClass: CabinClass;
  totalSeats: number;
  remainingSeats: number;
  active: boolean;
  fareReleases: FareRow[];
};

type BookingRow = {
  id: string;
  bookingRef: string;
  ticketNumber: string;
  tripType: TripType;
  passengerName: string;
  email: string;
  amountPaidCents: number;
  fareReleaseName: string;
  status: "pending_payment" | "confirmed" | "cancelled" | "hold_expired";
  paymentMethod: "card" | "bank_transfer" | "cash" | null;
  source: "online" | "walk_in";
  holdExpiresAt: string | null;
  createdAt: string;
  invoiceId: string | null;
  invoiceStatus: "unpaid" | "paid" | "cancelled" | "failed" | null;
  flight: {
    flightNumber: string;
    origin: string;
    destination: string;
  };
  returnFlight: {
    flightNumber: string;
    origin: string;
    destination: string;
  } | null;
};

type InvoiceRow = AdminInvoiceRow;

type Tab =
  | "analytics"
  | "flights"
  | "form"
  | "fares"
  | "bookings"
  | "invoices"
  | "cargo";

const TABS: { id: Tab; label: string }[] = [
  { id: "analytics", label: "Analytics" },
  { id: "flights", label: "Flights" },
  { id: "form", label: "Add / Edit" },
  { id: "fares", label: "Charter fares" },
  { id: "bookings", label: "Bookings" },
  { id: "invoices", label: "Invoices" },
  { id: "cargo", label: "Cargo" },
];

const fieldClass =
  "w-full border-0 border-b border-line bg-transparent py-3 text-sm text-foreground outline-none transition focus:border-accent";

function templateToRows(cabin: CabinClass): FareRow[] {
  const template =
    cabin === "economy" ? ECONOMY_FARE_TEMPLATE : BUSINESS_FARE_TEMPLATE;
  return template.map((t) => ({
    name: t.name,
    sortOrder: t.sortOrder,
    totalSeats: t.totalSeats,
    remainingSeats: t.totalSeats,
    priceCents: 0,
  }));
}

export function AdminDashboard({
  flights,
  bookings,
  invoices,
  cargoSubmissions,
  analytics,
  charterFares,
  initialTab,
  savedMessage,
  errorMessage,
}: {
  flights: FlightRow[];
  bookings: BookingRow[];
  invoices: InvoiceRow[];
  cargoSubmissions: AdminCargoRow[];
  analytics: SystemAnalytics;
  charterFares: AdminCharterFare[];
  initialTab?: Tab;
  savedMessage?: string | null;
  errorMessage?: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab ?? "analytics");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cabinClass, setCabinClass] = useState<CabinClass>("business");
  const [fareRows, setFareRows] = useState<FareRow[]>(() =>
    templateToRows("business"),
  );

  const editing = useMemo(
    () => flights.find((f) => f.id === editingId) ?? null,
    [flights, editingId],
  );

  const activeCount = flights.filter((f) => f.active).length;

  function selectTab(next: Tab) {
    setTab(next);
    // Keep ?tab= in the URL so refresh / back stays on the same section.
    router.replace(`/admin?tab=${next}`, { scroll: false });
  }

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (editing) {
      setCabinClass(editing.cabinClass);
      setFareRows(
        editing.fareReleases.length > 0
          ? editing.fareReleases.map((r) => ({ ...r }))
          : templateToRows(editing.cabinClass),
      );
    }
  }, [editing]);

  function openAdd() {
    setEditingId(null);
    setCabinClass("business");
    setFareRows(templateToRows("business"));
    selectTab("form");
  }

  function openEdit(id: string) {
    setEditingId(id);
    selectTab("form");
  }

  function onCabinChange(next: CabinClass) {
    setCabinClass(next);
    if (!editing) {
      setFareRows(templateToRows(next));
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <nav className="flex flex-wrap gap-1 border-b border-line">
          {TABS.map((item) => {
            const active = tab === item.id;
            const label =
              item.id === "form"
                ? editing
                  ? "Edit flight"
                  : "Add flight"
                : item.label;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === "form" && !editingId) openAdd();
                  else selectTab(item.id);
                }}
                className={`relative px-4 py-3 text-sm font-medium transition ${
                  active ? "text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {label}
                {active && (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 bg-accent" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
          <p>
            <span className="font-semibold text-foreground">{activeCount}</span>{" "}
            active · {flights.length} total
          </p>
          <p>
            <span className="font-semibold text-foreground">
              {bookings.length}
            </span>{" "}
            recent bookings
          </p>
          <p>
            <span className="font-semibold text-foreground">
              {invoices.filter((i) => i.status === "unpaid").length}
            </span>{" "}
            unpaid invoices
          </p>
        </div>
      </div>

      {savedMessage && (
        <p className="border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent-deep">
          {savedMessage}
        </p>
      )}
      {errorMessage && (
        <p className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      {tab === "analytics" && (
        <SystemAnalyticsSection analytics={analytics} />
      )}

      {tab === "flights" && (
        <section className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight">
                Flight inventory
              </h2>
              <p className="mt-1 max-w-xl text-sm text-muted">
                Each flight sells in order: Early Bird → Standard → Final
                Release. Prices are fixed as you set them — no automatic
                increases.
              </p>
            </div>
            <button
              type="button"
              onClick={openAdd}
              className="bg-accent-deep px-5 py-3 text-sm font-semibold tracking-wide text-white transition hover:bg-accent"
            >
              Add flight
            </button>
          </div>

          {flights.length === 0 ? (
            <div className="border border-dashed border-line bg-surface/70 px-6 py-14 text-center">
              <p className="font-[family-name:var(--font-syne)] text-xl font-semibold">
                No flights yet
              </p>
              <button
                type="button"
                onClick={openAdd}
                className="mt-6 border border-line px-4 py-2 text-sm font-medium transition hover:border-accent"
              >
                Create a flight
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-line border-y border-line bg-surface/60">
              {flights.map((f) => (
                <li key={f.id} className="px-4 py-5 sm:px-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <p className="font-[family-name:var(--font-syne)] text-lg font-semibold tracking-tight">
                          {f.airline} {f.flightNumber}
                        </p>
                        <span
                          className={`text-xs font-medium uppercase tracking-[0.12em] ${
                            f.active ? "text-accent" : "text-red-700"
                          }`}
                        >
                          {f.active ? "Live" : "Hidden"} · {f.cabinClass}
                        </span>
                      </div>
                      <p className="text-sm text-foreground">
                        {f.origin} → {f.destination}
                      </p>
                      <p className="text-sm text-muted">
                        {f.remainingSeats}/{f.totalSeats} seats across fare
                        releases
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                      <button
                        type="button"
                        onClick={() => openEdit(f.id)}
                        className="font-medium text-accent transition hover:text-accent-deep"
                      >
                        Edit details
                      </button>
                      {f.active ? (
                        <form action={removeFlightAction}>
                          <input type="hidden" name="id" value={f.id} />
                          <button
                            type="submit"
                            className="text-muted transition hover:text-red-700"
                          >
                            Remove
                          </button>
                        </form>
                      ) : (
                        <form action={restoreFlightAction}>
                          <input type="hidden" name="id" value={f.id} />
                          <button
                            type="submit"
                            className="text-muted transition hover:text-accent"
                          >
                            Restore
                          </button>
                        </form>
                      )}
                      <form action={deleteFlightAction}>
                        <input type="hidden" name="id" value={f.id} />
                        <button
                          type="submit"
                          className="text-muted/70 transition hover:text-foreground"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3 border-t border-line/70 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                      Fare releases
                    </p>
                    {f.fareReleases.map((release) => (
                      <form
                        key={release.id}
                        action={updateFarePriceAction}
                        className="flex flex-wrap items-end gap-3"
                      >
                        <input type="hidden" name="id" value={release.id} />
                        <div className="min-w-[10rem] flex-1">
                          <p className="text-sm font-medium">{release.name}</p>
                          <p className="text-xs text-muted">
                            {release.remainingSeats}/{release.totalSeats} seats
                          </p>
                        </div>
                        <label className="space-y-1 text-sm">
                          <span className="text-xs uppercase tracking-[0.14em] text-muted">
                            Price (AUD)
                          </span>
                          <input
                            name="priceAud"
                            type="number"
                            min={0}
                            step={0.01}
                            required
                            defaultValue={(release.priceCents / 100).toFixed(2)}
                            className="w-36 border border-line bg-white px-3 py-2 outline-none focus:border-accent"
                          />
                        </label>
                        <button
                          type="submit"
                          className="bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-deep"
                        >
                          Update price
                        </button>
                      </form>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "form" && (
        <section className="border border-line bg-surface/80 p-6 sm:p-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              {editing ? "Edit" : "New"}
            </p>
            <h2 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight">
              {editing ? "Edit flight" : "Add a flight"}
            </h2>
            <p className="mt-2 text-sm text-muted">
              Business defaults to 20 seats across Early Bird (5), Business
              Standard (10), and Final Release (5). Set every price yourself.
            </p>
          </div>

          <form
            key={editing?.id ?? "new"}
            action={editing ? updateFlightAction : createFlightAction}
            className="mt-8 grid max-w-3xl gap-6 sm:grid-cols-2"
          >
            {editing && <input type="hidden" name="id" value={editing.id} />}

            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                Airline
              </span>
              <input
                name="airline"
                required
                defaultValue={editing?.airline ?? ""}
                placeholder="Qantas"
                className={fieldClass}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                Flight number
              </span>
              <input
                name="flightNumber"
                required
                defaultValue={editing?.flightNumber ?? ""}
                placeholder="QF401"
                className={fieldClass}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                From
              </span>
              <input
                name="origin"
                required
                maxLength={3}
                defaultValue={editing?.origin ?? ""}
                placeholder="PER"
                className={`${fieldClass} uppercase`}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                To
              </span>
              <input
                name="destination"
                required
                maxLength={3}
                defaultValue={editing?.destination ?? ""}
                placeholder="PBH"
                className={`${fieldClass} uppercase`}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                Leaves at
              </span>
              <input
                name="departureAt"
                type="datetime-local"
                required
                defaultValue={
                  editing
                    ? toDateTimeLocalValue(new Date(editing.departureAt))
                    : ""
                }
                className={fieldClass}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                Arrives at
              </span>
              <input
                name="arrivalAt"
                type="datetime-local"
                required
                defaultValue={
                  editing
                    ? toDateTimeLocalValue(new Date(editing.arrivalAt))
                    : ""
                }
                className={fieldClass}
              />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                Cabin / product
              </span>
              <select
                name="cabinClass"
                value={cabinClass}
                onChange={(e) => onCabinChange(e.target.value as CabinClass)}
                className={fieldClass}
              >
                <option value="business">Business (20-seat fare template)</option>
                <option value="economy">Economy (same release structure)</option>
              </select>
            </label>

            <div className="sm:col-span-2 space-y-4 border border-line bg-white/50 p-4">
              <div>
                <p className="font-[family-name:var(--font-syne)] text-lg font-semibold">
                  Fare releases
                </p>
                <p className="mt-1 text-sm text-muted">
                  Sold in order. Leave price at 0 until you are ready — that
                  release will not sell.
                </p>
              </div>
              {fareRows.map((row, index) => (
                <div
                  key={`${row.name}-${index}`}
                  className="grid gap-3 border-t border-line pt-4 sm:grid-cols-4"
                >
                  <input type="hidden" name="fareSortOrder" value={row.sortOrder} />
                  <label className="space-y-1 text-sm sm:col-span-2">
                    <span className="text-xs uppercase tracking-[0.12em] text-muted">
                      Release name
                    </span>
                    <input
                      name="fareName"
                      required
                      value={row.name}
                      onChange={(e) => {
                        const next = [...fareRows];
                        next[index] = { ...row, name: e.target.value };
                        setFareRows(next);
                      }}
                      className={fieldClass}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-xs uppercase tracking-[0.12em] text-muted">
                      Seats
                    </span>
                    <input
                      name="fareTotalSeats"
                      type="number"
                      min={0}
                      required
                      value={row.totalSeats}
                      onChange={(e) => {
                        const totalSeats = Number(e.target.value);
                        const next = [...fareRows];
                        next[index] = {
                          ...row,
                          totalSeats,
                          remainingSeats: editing
                            ? Math.min(row.remainingSeats, totalSeats)
                            : totalSeats,
                        };
                        setFareRows(next);
                      }}
                      className={fieldClass}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-xs uppercase tracking-[0.12em] text-muted">
                      Price (AUD)
                    </span>
                    <input
                      name="farePriceAud"
                      type="number"
                      min={0}
                      step={0.01}
                      required
                      value={(row.priceCents / 100).toFixed(2)}
                      onChange={(e) => {
                        const next = [...fareRows];
                        next[index] = {
                          ...row,
                          priceCents: Math.round(Number(e.target.value) * 100),
                        };
                        setFareRows(next);
                      }}
                      className={fieldClass}
                    />
                  </label>
                  {editing && (
                    <label className="space-y-1 text-sm sm:col-span-2">
                      <span className="text-xs uppercase tracking-[0.12em] text-muted">
                        Seats still for sale
                      </span>
                      <input
                        name="fareRemainingSeats"
                        type="number"
                        min={0}
                        required
                        value={row.remainingSeats}
                        onChange={(e) => {
                          const next = [...fareRows];
                          next[index] = {
                            ...row,
                            remainingSeats: Number(e.target.value),
                          };
                          setFareRows(next);
                        }}
                        className={fieldClass}
                      />
                    </label>
                  )}
                  {!editing && (
                    <input
                      type="hidden"
                      name="fareRemainingSeats"
                      value={row.totalSeats}
                    />
                  )}
                </div>
              ))}
              <p className="text-sm text-muted">
                Total seats:{" "}
                <span className="font-medium text-foreground">
                  {fareRows.reduce((s, r) => s + r.totalSeats, 0)}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <button
                type="submit"
                className="bg-accent-deep px-5 py-3 text-sm font-semibold tracking-wide text-white transition hover:bg-accent"
              >
                {editing ? "Save changes" : "Publish flight"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  selectTab("flights");
                }}
                className="border border-line px-5 py-3 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground"
              >
                Back to flights
              </button>
            </div>
          </form>
        </section>
      )}

      {tab === "fares" && <CharterFaresAdmin fares={charterFares} />}

      {tab === "bookings" && (
        <section className="space-y-8">
          <div>
            <h2 className="font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight">
              Bookings log
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              All bookings show credit card vs bank transfer. For bank transfer,
              confirm paid to send the confirmation email with e-ticket. Unpaid
              bank holds expire after 48 hours and seats return to the pool.
            </p>
          </div>

          <div className="border border-line bg-surface/80 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
              Walk-in
            </p>
            <h3 className="mt-2 font-[family-name:var(--font-syne)] text-xl font-semibold">
              Book for a client
            </h3>
            <p className="mt-1 text-sm text-muted">
              Counter / phone bookings. Cash or card = confirmed + confirmation
              email. Bank transfer = 48h hold + invoice email.
            </p>
            <form
              action={createWalkInBookingAction}
              className="mt-6 grid gap-4 sm:grid-cols-2"
            >
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Flight
                </span>
                <select name="flightId" required className={fieldClass}>
                  <option value="">Select outbound flight</option>
                  {flights
                    .filter((f) => f.active && f.remainingSeats > 0)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.airline} {f.flightNumber} · {f.origin}→{f.destination}{" "}
                        · {new Date(f.departureAt).toLocaleString("en-AU")} ·{" "}
                        {f.remainingSeats} seats
                      </option>
                    ))}
                </select>
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Return flight (optional)
                </span>
                <select name="returnFlightId" className={fieldClass}>
                  <option value="">One way only</option>
                  {flights
                    .filter((f) => f.active && f.remainingSeats > 0)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.airline} {f.flightNumber} · {f.origin}→{f.destination}{" "}
                        · {new Date(f.departureAt).toLocaleString("en-AU")}
                      </option>
                    ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Passenger name
                </span>
                <input name="passengerName" required className={fieldClass} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Email
                </span>
                <input
                  name="email"
                  type="email"
                  required
                  className={fieldClass}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Phone
                </span>
                <input name="passengerPhone" className={fieldClass} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Passport
                </span>
                <input name="passportNumber" className={fieldClass} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Nationality
                </span>
                <input name="nationality" className={fieldClass} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Seats
                </span>
                <input
                  name="seatsBooked"
                  type="number"
                  min={1}
                  max={9}
                  defaultValue={1}
                  required
                  className={fieldClass}
                />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Payment method
                </span>
                <select name="paymentMethod" required className={fieldClass}>
                  <option value="cash">Cash (mark paid now)</option>
                  <option value="card">Credit card at counter (mark paid now)</option>
                  <option value="bank_transfer">
                    Bank transfer (48h hold + invoice email)
                  </option>
                </select>
              </label>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="bg-accent-deep px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent"
                >
                  Create walk-in booking
                </button>
              </div>
            </form>
          </div>

          {bookings.length === 0 ? (
            <div className="border border-dashed border-line bg-surface/70 px-6 py-14 text-center text-sm text-muted">
              No bookings yet.
            </div>
          ) : (
            <div className="overflow-x-auto border-y border-line bg-surface/60">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-[0.12em] text-muted">
                    <th className="px-4 py-3 font-medium">Ref</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Payment</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Flights</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.id} className="border-b border-line/70">
                      <td className="px-4 py-4">
                        <p className="font-medium">{b.bookingRef}</p>
                        <p className="text-xs text-muted">{b.ticketNumber}</p>
                      </td>
                      <td className="px-4 py-4 text-muted">
                        {b.status.replaceAll("_", " ")}
                        {b.holdExpiresAt && b.status === "pending_payment" ? (
                          <p className="mt-1 text-xs text-amber-800">
                            Hold until{" "}
                            {new Date(b.holdExpiresAt).toLocaleString("en-AU")}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-muted">
                        {b.paymentMethod === "card"
                          ? "Credit card"
                          : b.paymentMethod === "bank_transfer"
                            ? "Bank transfer"
                            : b.paymentMethod === "cash"
                              ? "Cash"
                              : "—"}
                      </td>
                      <td className="px-4 py-4 text-muted">
                        {b.source === "walk_in" ? "Walk-in" : "Online"}
                      </td>
                      <td className="px-4 py-4">
                        <p>{b.passengerName}</p>
                        <p className="text-xs text-muted">{b.email}</p>
                      </td>
                      <td className="px-4 py-4 text-muted">
                        {b.flight.flightNumber} {b.flight.origin}→
                        {b.flight.destination}
                        {b.returnFlight
                          ? ` · ${b.returnFlight.flightNumber} ${b.returnFlight.origin}→${b.returnFlight.destination}`
                          : ""}
                      </td>
                      <td className="px-4 py-4 font-medium">
                        {formatAud(b.amountPaidCents)}
                      </td>
                      <td className="px-4 py-4">
                        {b.paymentMethod === "bank_transfer" &&
                        b.status === "pending_payment" ? (
                          <form action={markBookingPaidAction}>
                            <input type="hidden" name="id" value={b.id} />
                            <button
                              type="submit"
                              className="bg-accent-deep px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent"
                            >
                              Mark paid
                            </button>
                          </form>
                        ) : null}
                        {b.paymentMethod === "bank_transfer" &&
                        b.status === "confirmed" ? (
                          <form action={markBookingUnpaidAction}>
                            <input type="hidden" name="id" value={b.id} />
                            <button
                              type="submit"
                              className="border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent"
                            >
                              Mark unpaid
                            </button>
                          </form>
                        ) : null}
                        {b.paymentMethod === "card" ||
                        b.paymentMethod === "cash" ? (
                          <span className="text-xs text-accent">Auto paid</span>
                        ) : null}
                        {b.status === "hold_expired" ? (
                          <span className="text-xs text-red-700">
                            Hold expired
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "invoices" && <InvoiceAdminPanel invoices={invoices} />}

      {tab === "cargo" && <CargoAdminPanel submissions={cargoSubmissions} />}
    </div>
  );
}
