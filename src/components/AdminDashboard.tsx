"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  bulkUpdateFareTierPriceAction,
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
  deleteBookingAction,
  markBookingPaidAction,
  markBookingUnpaidAction,
} from "@/lib/actions/walkIn";
import {
  DeletedRecordsPanel,
  type AdminDeletedRecordRow,
} from "@/components/DeletedRecordsPanel";
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
import { MoneyInput } from "@/components/MoneyInput";
import { SubmitButton } from "@/components/SubmitButton";
import { Spinner } from "@/components/Spinner";
import {
  BulkSelectBar,
  SelectAllCheckbox,
  useBulkSelection,
} from "@/components/BulkSelectBar";
import { toDateTimeLocalValue } from "@/lib/datetime";
import {
  BUSINESS_FARE_TEMPLATE,
  ECONOMY_FARE_TEMPLATE,
} from "@/lib/fares/templates";
import { formatAud } from "@/lib/pricing";

const CUSTOM_FLIGHT_VALUE = "__custom__";

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
  returnLegFlightId: string | null;
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
  extraBaggageKg: number;
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
  | "cargo"
  | "deleted";

const TABS: { id: Tab; label: string }[] = [
  { id: "analytics", label: "Analytics" },
  { id: "flights", label: "Flights" },
  { id: "form", label: "Add / Edit" },
  { id: "fares", label: "Charter fares" },
  { id: "bookings", label: "Bookings" },
  { id: "invoices", label: "Invoices" },
  { id: "cargo", label: "Cargo" },
  { id: "deleted", label: "Deleted" },
];

const TAB_IDS = new Set<string>(TABS.map((t) => t.id));

function parseClientTab(value: string | null | undefined): Tab | undefined {
  if (value && TAB_IDS.has(value)) return value as Tab;
  return undefined;
}

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

/** Inline fields for a walk-in leg that isn't in the Flight table at all. */
function CustomFlightFields({ prefix }: { prefix: "outbound" | "return" }) {
  return (
    <div className="space-y-3 border-t border-line pt-4 sm:col-span-2">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        Custom {prefix} flight details
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Airline
          </span>
          <input
            name={`${prefix}CustomAirline`}
            required
            placeholder="Qantas"
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Flight number
          </span>
          <input
            name={`${prefix}CustomFlightNumber`}
            required
            placeholder="QF401"
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            From
          </span>
          <input
            name={`${prefix}CustomOrigin`}
            required
            maxLength={3}
            placeholder="PER"
            className={`${fieldClass} uppercase`}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            To
          </span>
          <input
            name={`${prefix}CustomDestination`}
            required
            maxLength={3}
            placeholder="PBH"
            className={`${fieldClass} uppercase`}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Departs at
          </span>
          <input
            name={`${prefix}CustomDepartureAt`}
            type="datetime-local"
            required
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Arrives at
          </span>
          <input
            name={`${prefix}CustomArrivalAt`}
            type="datetime-local"
            required
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Cabin
          </span>
          <select
            name={`${prefix}CustomCabinClass`}
            defaultValue="business"
            className={fieldClass}
          >
            <option value="business">Business</option>
            <option value="economy">Economy</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Price per seat (AUD)
          </span>
          <MoneyInput
            name={`${prefix}CustomPriceAud`}
            defaultValue="0.00"
            className={fieldClass}
          />
        </label>
      </div>
    </div>
  );
}

export function AdminDashboard({
  flights,
  bookings,
  invoices,
  cargoSubmissions,
  deletedRecords,
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
  deletedRecords: AdminDeletedRecordRow[];
  analytics: SystemAnalytics;
  charterFares: AdminCharterFare[];
  initialTab?: Tab;
  savedMessage?: string | null;
  errorMessage?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL ?tab= is the source of truth so refresh / back always stays put.
  const tab =
    parseClientTab(searchParams.get("tab")) ?? initialTab ?? "analytics";

  const [editingId, setEditingId] = useState<string | null>(null);
  const [cabinClass, setCabinClass] = useState<CabinClass>("business");
  const [bulkPriceCabin, setBulkPriceCabin] = useState<CabinClass>("business");
  const [fareRows, setFareRows] = useState<FareRow[]>(() =>
    templateToRows("business"),
  );
  const [walkInOutboundChoice, setWalkInOutboundChoice] = useState("");
  const [walkInReturnChoice, setWalkInReturnChoice] = useState("");
  const [walkInTripType, setWalkInTripType] = useState<TripType>("one_way");
  const [bulkPending, startBulkTransition] = useTransition();

  // Every save/delete/etc. here submits a form (or a bulk action) that
  // redirects back to /admin?tab=...&saved=... . Next keeps the *old*
  // dashboard on screen while that round trip is in flight (that's how
  // transitions avoid a jarring flash of loading.tsx on a route you're
  // already viewing) — which otherwise looks like the click did nothing.
  // This overlay makes that wait visible across the whole dashboard, not
  // just on the one button that was clicked.
  const [busy, setBusy] = useState(false);
  const busySafetyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function markBusy() {
    setBusy(true);
    if (busySafetyTimeout.current) clearTimeout(busySafetyTimeout.current);
    // Walk-in confirmations / invoice resends render a PDF via headless
    // Chromium and can legitimately take a while — never get stuck longer
    // than the route's own server timeout budget.
    busySafetyTimeout.current = setTimeout(() => setBusy(false), 55_000);
  }

  // The redirect target always carries a fresh (or cleared) query string —
  // that's the one reliable signal that the new dashboard has arrived. Clear
  // the overlay as soon as it changes (React's documented pattern for
  // resetting state in response to a value changing, done during render
  // rather than in an effect, so it can't cause a visible extra frame).
  const searchKey = searchParams.toString();
  const [settledSearchKey, setSettledSearchKey] = useState(searchKey);
  if (searchKey !== settledSearchKey) {
    setSettledSearchKey(searchKey);
    // Don't touch the safety-timeout ref here — refs can't be read/written
    // during render. The stale timer firing later is harmless: it just
    // calls setBusy(false) again once busy is already false.
    if (busy) setBusy(false);
  }

  const walkInOutboundFlight = useMemo(
    () => flights.find((f) => f.id === walkInOutboundChoice) ?? null,
    [flights, walkInOutboundChoice],
  );
  // Fixed charter round-trip pairing — the return leg is already known for
  // this outbound flight, so the admin shouldn't have to search for it.
  const walkInPairedReturn = useMemo(() => {
    if (!walkInOutboundFlight?.returnLegFlightId) return null;
    return (
      flights.find((f) => f.id === walkInOutboundFlight.returnLegFlightId) ??
      null
    );
  }, [flights, walkInOutboundFlight]);
  const walkInCanAutoRoundTrip = Boolean(
    walkInPairedReturn &&
      walkInPairedReturn.active &&
      walkInPairedReturn.remainingSeats > 0,
  );
  // Manual return picker only appears when there's no fixed pairing to fall
  // back on (custom flights or flights that were never paired).
  const walkInNeedsManualReturn =
    walkInTripType === "round_trip" &&
    (!walkInCanAutoRoundTrip || walkInOutboundChoice === CUSTOM_FLIGHT_VALUE);

  const editing = useMemo(
    () => flights.find((f) => f.id === editingId) ?? null,
    [flights, editingId],
  );

  const activeCount = flights.filter((f) => f.active).length;

  const flightIds = useMemo(() => flights.map((f) => f.id), [flights]);
  const flightBulk = useBulkSelection(flightIds);
  const bookingIds = useMemo(() => bookings.map((b) => b.id), [bookings]);
  const bookingBulk = useBulkSelection(bookingIds);

  function bulkDeleteFlights() {
    const ids = [...flightBulk.selected];
    if (ids.length === 0) return;
    if (
      !confirm(
        `Delete ${ids.length} flight${ids.length === 1 ? "" : "s"} permanently? Any bookings and invoices still tied to them will be deleted too and recorded in the Deleted tab.`,
      )
    ) {
      return;
    }
    const fd = new FormData();
    for (const id of ids) fd.append("id", id);
    markBusy();
    startBulkTransition(() => {
      void deleteFlightAction(fd);
    });
  }

  function bulkDeleteBookings() {
    const ids = [...bookingBulk.selected];
    if (ids.length === 0) return;
    if (
      !confirm(
        `Delete ${ids.length} booking${ids.length === 1 ? "" : "s"} permanently? Linked invoices will be deleted too and recorded in the Deleted tab.`,
      )
    ) {
      return;
    }
    const fd = new FormData();
    for (const id of ids) fd.append("id", id);
    markBusy();
    startBulkTransition(() => {
      void deleteBookingAction(fd);
    });
  }

  function selectTab(next: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    // Drop one-shot flash params so a refresh doesn't jump tabs / re-toast.
    params.delete("saved");
    params.delete("error");
    params.delete("ref");
    params.delete("focus");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Ensure the address bar always has ?tab= (covers /admin with no query).
  useEffect(() => {
    if (searchParams.get("tab")) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams, tab]);

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
    <div
      className="relative space-y-8"
      onSubmitCapture={(e) => {
        const form = e.target as HTMLFormElement | null;
        if (form?.closest?.("[data-skip-busy]")) return;
        markBusy();
      }}
    >
      {busy && (
        <div
          aria-live="polite"
          aria-busy="true"
          className="fixed inset-0 z-[150] flex items-center justify-center bg-white/70 backdrop-blur-[2px]"
        >
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-white px-8 py-6 shadow-[0_16px_40px_rgba(15,23,42,0.15)]">
            <Spinner className="size-8 text-accent" />
            <p className="text-sm font-medium text-foreground">
              Updating dashboard…
            </p>
          </div>
        </div>
      )}
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

          <div className="border border-line bg-surface/80 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
              Bulk pricing
            </p>
            <h3 className="mt-2 font-[family-name:var(--font-syne)] text-xl font-semibold">
              Apply a price to a fare tier across all flights
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Set &quot;Early Bird&quot; business once and it updates every
              business flight that has that tier — instead of opening each
              flight one by one.
            </p>
            <form
              action={bulkUpdateFareTierPriceAction}
              className="mt-4 grid gap-4 sm:grid-cols-4"
            >
              <label className="space-y-1 text-sm">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Cabin
                </span>
                <select
                  name="cabinClass"
                  value={bulkPriceCabin}
                  onChange={(e) =>
                    setBulkPriceCabin(e.target.value as CabinClass)
                  }
                  className={fieldClass}
                >
                  <option value="business">Business</option>
                  <option value="economy">Economy</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Fare tier
                </span>
                <select name="tierName" className={fieldClass}>
                  {(bulkPriceCabin === "economy"
                    ? ECONOMY_FARE_TEMPLATE
                    : BUSINESS_FARE_TEMPLATE
                  ).map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Price (AUD)
                </span>
                <MoneyInput
                  name="priceAud"
                  required
                  defaultValue="0.00"
                  className={fieldClass}
                />
              </label>
              <label className="flex items-end gap-2 pb-3 text-sm text-muted">
                <input
                  type="checkbox"
                  name="onlyUnpriced"
                  value="true"
                  defaultChecked
                  className="size-4 accent-accent-deep"
                />
                Only fill in unpriced releases
              </label>
              <div className="sm:col-span-4">
                <SubmitButton
                  pendingLabel="Applying…"
                  className="bg-accent-deep px-5 py-3 text-sm font-semibold tracking-wide text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Apply to matching flights
                </SubmitButton>
              </div>
            </form>
          </div>

          <BulkSelectBar
            count={flightBulk.selected.size}
            itemLabel="flight"
            pending={bulkPending}
            onDelete={bulkDeleteFlights}
            onClear={flightBulk.clear}
          />

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
            <>
              <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted">
                <SelectAllCheckbox
                  allSelected={flightBulk.allSelected}
                  someSelected={flightBulk.someSelected}
                  onToggle={flightBulk.toggleAll}
                />
                Select all ({flights.length})
              </label>
            <ul className="divide-y divide-line border-y border-line bg-surface/60">
              {flights.map((f) => (
                <li key={f.id} className="px-4 py-5 sm:px-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${f.airline} ${f.flightNumber}`}
                        checked={flightBulk.selected.has(f.id)}
                        onChange={() => flightBulk.toggle(f.id)}
                        className="mt-1.5 size-4 shrink-0 accent-accent-deep"
                      />
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
                          <SubmitButton
                            pendingLabel="Removing…"
                            className="text-muted transition hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Remove
                          </SubmitButton>
                        </form>
                      ) : (
                        <form action={restoreFlightAction}>
                          <input type="hidden" name="id" value={f.id} />
                          <SubmitButton
                            pendingLabel="Restoring…"
                            className="text-muted transition hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Restore
                          </SubmitButton>
                        </form>
                      )}
                      <form action={deleteFlightAction}>
                        <input type="hidden" name="id" value={f.id} />
                        <SubmitButton
                          pendingLabel="Deleting…"
                          onClick={(e) => {
                            if (
                              !confirm(
                                "Delete this flight permanently? Any bookings and invoices still tied to it will be deleted too and recorded in the Deleted tab.",
                              )
                            ) {
                              e.preventDefault();
                            }
                          }}
                          className="text-muted/70 transition hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Delete
                        </SubmitButton>
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
                          <MoneyInput
                            name="priceAud"
                            required
                            defaultValue={(release.priceCents / 100).toFixed(2)}
                            className="w-44 border border-line bg-white py-2 pr-3 outline-none focus:border-accent"
                          />
                        </label>
                        <SubmitButton
                          pendingLabel="Saving…"
                          className="bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Update price
                        </SubmitButton>
                      </form>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            </>
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

            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                Round-trip partner flight (optional)
              </span>
              <select
                name="returnLegFlightId"
                defaultValue={editing?.returnLegFlightId ?? ""}
                className={fieldClass}
              >
                <option value="">
                  No pairing — sells as one-way only
                </option>
                {flights
                  .filter((f) => f.id !== editing?.id)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.airline} {f.flightNumber} · {f.origin}→{f.destination}{" "}
                      · {new Date(f.departureAt).toLocaleString("en-AU")} ·{" "}
                      {f.cabinClass}
                    </option>
                  ))}
              </select>
              <span className="block text-xs text-muted">
                Pick the return leg this flight is chartered with. Customers
                booking this flight will see a &ldquo;Round trip&rdquo; option
                that auto-attaches the partner — no separate return search.
                Set this on the earlier-departing (outbound) leg only.
              </span>
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
                    <MoneyInput
                      name="farePriceAud"
                      required
                      value={(row.priceCents / 100).toFixed(2)}
                      onChange={(e) => {
                        const next = [...fareRows];
                        next[index] = {
                          ...row,
                          priceCents: Math.round(
                            (Number(e.target.value) || 0) * 100,
                          ),
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
              <SubmitButton
                pendingLabel={editing ? "Saving…" : "Publishing…"}
                className="bg-accent-deep px-5 py-3 text-sm font-semibold tracking-wide text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                {editing ? "Save changes" : "Publish flight"}
              </SubmitButton>
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
                <select
                  name="flightId"
                  required
                  value={walkInOutboundChoice}
                  onChange={(e) => {
                    setWalkInOutboundChoice(e.target.value);
                    setWalkInReturnChoice("");
                    setWalkInTripType("one_way");
                  }}
                  className={fieldClass}
                >
                  <option value="">Select outbound flight</option>
                  <option value={CUSTOM_FLIGHT_VALUE}>
                    + Custom flight (not in system)
                  </option>
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
              {walkInOutboundChoice === CUSTOM_FLIGHT_VALUE && (
                <CustomFlightFields prefix="outbound" />
              )}

              {walkInOutboundChoice && (
                <div className="space-y-2 sm:col-span-2">
                  <span className="block text-xs uppercase tracking-[0.12em] text-muted">
                    Trip type
                  </span>
                  <div className="inline-flex rounded-full border border-line bg-white p-1 text-sm font-medium">
                    <button
                      type="button"
                      onClick={() => {
                        setWalkInTripType("one_way");
                        setWalkInReturnChoice("");
                      }}
                      className={`rounded-full px-4 py-2 transition ${
                        walkInTripType === "one_way"
                          ? "bg-accent-deep text-white"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      One way
                    </button>
                    <button
                      type="button"
                      onClick={() => setWalkInTripType("round_trip")}
                      className={`rounded-full px-4 py-2 transition ${
                        walkInTripType === "round_trip"
                          ? "bg-accent-deep text-white"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      Round trip
                    </button>
                  </div>
                  {walkInTripType === "round_trip" &&
                    walkInCanAutoRoundTrip &&
                    walkInPairedReturn && (
                      <>
                        <input
                          type="hidden"
                          name="returnFlightId"
                          value={walkInPairedReturn.id}
                        />
                        <p className="text-xs text-muted">
                          Fixed return leg auto-attached: {walkInPairedReturn.airline}{" "}
                          {walkInPairedReturn.flightNumber} ·{" "}
                          {walkInPairedReturn.origin}→
                          {walkInPairedReturn.destination} ·{" "}
                          {new Date(
                            walkInPairedReturn.departureAt,
                          ).toLocaleString("en-AU")}
                        </p>
                      </>
                    )}
                </div>
              )}

              {walkInNeedsManualReturn && (
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="text-xs uppercase tracking-[0.12em] text-muted">
                    Return flight
                  </span>
                  <select
                    name="returnFlightId"
                    required
                    value={walkInReturnChoice}
                    onChange={(e) => setWalkInReturnChoice(e.target.value)}
                    className={fieldClass}
                  >
                    <option value="">Select return flight</option>
                    <option value={CUSTOM_FLIGHT_VALUE}>
                      + Custom flight (not in system)
                    </option>
                    {flights
                      .filter((f) => f.active && f.remainingSeats > 0)
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.airline} {f.flightNumber} · {f.origin}→
                          {f.destination} ·{" "}
                          {new Date(f.departureAt).toLocaleString("en-AU")}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {walkInNeedsManualReturn &&
                walkInReturnChoice === CUSTOM_FLIGHT_VALUE && (
                  <CustomFlightFields prefix="return" />
                )}
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Fare tier (optional override)
                </span>
                <select name="fareProductId" className={fieldClass}>
                  <option value="">
                    Auto — use each flight&apos;s current fare-release price
                  </option>
                  {charterFares
                    .filter((f) => f.active)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.cabinClass === "business" ? "Business" : "Economy"} ·{" "}
                        {f.name} — {formatAud(f.priceCents)} / leg
                      </option>
                    ))}
                </select>
                <span className="block text-xs text-muted">
                  Charges this catalogue price per leg instead of the fare
                  release price. Must match the cabin of the flight(s) chosen
                  above.
                </span>
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Custom total price (AUD, optional)
                </span>
                <MoneyInput
                  name="customPriceAud"
                  placeholder="Leave blank to use system price"
                  className={fieldClass}
                />
                <span className="block text-xs text-muted">
                  Overrides everything above — the fare release price and any
                  fare tier selected — with this exact total for the whole
                  booking (all seats/legs, before baggage).
                </span>
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
              <label className="space-y-1 text-sm">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Extra baggage (kg)
                </span>
                <input
                  name="extraBaggageKg"
                  type="number"
                  min={0}
                  max={500}
                  defaultValue={0}
                  className={fieldClass}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Extra baggage charge (AUD)
                </span>
                <MoneyInput
                  name="extraBaggageAud"
                  defaultValue="0.00"
                  className={fieldClass}
                />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  How was this booked?
                </span>
                <select
                  name="bookingSource"
                  defaultValue="walk_in"
                  className={fieldClass}
                >
                  <option value="walk_in">Walk-in (counter / phone)</option>
                  <option value="online">
                    Online (entered on customer&apos;s behalf)
                  </option>
                </select>
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
                <SubmitButton
                  pendingLabel="Creating booking…"
                  className="bg-accent-deep px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Create walk-in booking
                </SubmitButton>
              </div>
            </form>
          </div>

          <BulkSelectBar
            count={bookingBulk.selected.size}
            itemLabel="booking"
            pending={bulkPending}
            onDelete={bulkDeleteBookings}
            onClear={bookingBulk.clear}
          />

          {bookings.length === 0 ? (
            <div className="border border-dashed border-line bg-surface/70 px-6 py-14 text-center text-sm text-muted">
              No bookings yet.
            </div>
          ) : (
            <div className="overflow-x-auto border-y border-line bg-surface/60">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-[0.12em] text-muted">
                    <th className="px-4 py-3 font-medium">
                      <SelectAllCheckbox
                        allSelected={bookingBulk.allSelected}
                        someSelected={bookingBulk.someSelected}
                        onToggle={bookingBulk.toggleAll}
                      />
                    </th>
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
                      <td className="px-4 py-4 align-top">
                        <input
                          type="checkbox"
                          aria-label={`Select ${b.bookingRef}`}
                          checked={bookingBulk.selected.has(b.id)}
                          onChange={() => bookingBulk.toggle(b.id)}
                          className="size-4 accent-accent-deep"
                        />
                      </td>
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
                        {b.extraBaggageKg > 0 ? (
                          <p className="mt-0.5 text-xs text-muted">
                            +{b.extraBaggageKg}kg baggage
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 font-medium">
                        {formatAud(b.amountPaidCents)}
                      </td>
                      <td className="px-4 py-4">
                        {b.paymentMethod === "bank_transfer" &&
                        b.status === "pending_payment" ? (
                          <form action={markBookingPaidAction}>
                            <input type="hidden" name="id" value={b.id} />
                            <SubmitButton
                              pendingLabel="Confirming…"
                              className="bg-accent-deep px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Mark paid
                            </SubmitButton>
                          </form>
                        ) : null}
                        {b.paymentMethod === "bank_transfer" &&
                        b.status === "confirmed" ? (
                          <form action={markBookingUnpaidAction}>
                            <input type="hidden" name="id" value={b.id} />
                            <SubmitButton
                              pendingLabel="Updating…"
                              className="border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Mark unpaid
                            </SubmitButton>
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
                        <form
                          action={deleteBookingAction}
                          className="mt-1.5 inline"
                        >
                          <input type="hidden" name="id" value={b.id} />
                          <SubmitButton
                            pendingLabel="Deleting…"
                            onClick={(e) => {
                              if (
                                !confirm(
                                  `Delete booking ${b.bookingRef} permanently? Its invoice (if any) is deleted too and both are recorded in the Deleted tab.`,
                                )
                              ) {
                                e.preventDefault();
                              }
                            }}
                            className="block text-xs text-muted/70 transition hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Delete
                          </SubmitButton>
                        </form>
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

      {tab === "deleted" && (
        <DeletedRecordsPanel records={deletedRecords} />
      )}
    </div>
  );
}
