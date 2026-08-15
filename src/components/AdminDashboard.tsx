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
import { GstModeFields } from "@/components/GstModeFields";
import {
  createWalkInBookingAction,
  deleteBookingAction,
  markBookingPaidAction,
  markBookingUnpaidAction,
} from "@/lib/actions/walkIn";
import { BookingEditModal } from "@/components/BookingEditModal";
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
import {
  PassengerGroupFields,
  type CompanionDraft,
} from "@/components/PassengerGroupFields";
import { SubmitButton } from "@/components/SubmitButton";
import { Spinner } from "@/components/Spinner";
import {
  BulkSelectBar,
  SelectAllCheckbox,
  useBulkSelection,
} from "@/components/BulkSelectBar";
import { Combobox, type ComboboxOption } from "@/components/admin/Combobox";
import { SegmentedField } from "@/components/admin/SegmentedField";
import { ListFilterBar, NoMatches } from "@/components/admin/ListFilterBar";
import { formatFlightDateTime, toDateTimeLocalValue } from "@/lib/datetime";
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
  roundTripPriceCents: number;
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

type BookingPassengerRow = {
  fullName: string;
  email: string;
  phone: string;
  passportNumber: string;
  nationality: string;
  ticketNumber: string;
  passengerType: "adult" | "child" | "infant";
  priceCents: number;
  allocatesSeat: boolean;
};

type BookingRow = {
  id: string;
  bookingRef: string;
  ticketNumber: string;
  tripType: TripType;
  passengerName: string;
  email: string;
  passengerPhone: string;
  passportNumber: string;
  nationality: string;
  seatsBooked: number;
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
  passengers: BookingPassengerRow[];
  flight: {
    flightNumber: string;
    origin: string;
    destination: string;
    cabinClass: "economy" | "business";
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

const CABIN_SEGMENTS = [
  { value: "business", label: "Business" },
  { value: "economy", label: "Economy" },
];

function cabinLabel(cabin: CabinClass) {
  return cabin === "business" ? "Business" : "Economy";
}

/** Every free-text search on this page: all terms must appear somewhere. */
function matchesQuery(query: string, ...fields: (string | number | null | undefined)[]) {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = fields.filter((f) => f != null).join(" ").toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

/** Two-line picker row for a flight — the same shape everywhere it's chosen. */
function flightOption(
  flight: FlightRow,
  options?: { showSeats?: boolean },
): ComboboxOption {
  return {
    value: flight.id,
    label: `${flight.airline} ${flight.flightNumber} · ${flight.origin} → ${flight.destination}`,
    description: `${formatFlightDateTime(flight.departureAt)} · ${cabinLabel(flight.cabinClass)}`,
    meta: options?.showSeats
      ? `${flight.remainingSeats} seat${flight.remainingSeats === 1 ? "" : "s"}`
      : undefined,
    keywords: `${flight.origin}${flight.destination} ${flight.cabinClass}`,
  };
}

function templateToRows(cabin: CabinClass): FareRow[] {
  const template =
    cabin === "economy" ? ECONOMY_FARE_TEMPLATE : BUSINESS_FARE_TEMPLATE;
  return template.map((t) => ({
    name: t.name,
    sortOrder: t.sortOrder,
    totalSeats: t.totalSeats,
    remainingSeats: t.totalSeats,
    priceCents: 0,
    roundTripPriceCents: 0,
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
        <SegmentedField
          name={`${prefix}CustomCabinClass`}
          label="Cabin"
          defaultValue="business"
          options={CABIN_SEGMENTS}
        />
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
  const [partnerFlightId, setPartnerFlightId] = useState("");
  const [bulkPriceCabin, setBulkPriceCabin] = useState<CabinClass>("business");
  const [bulkTierName, setBulkTierName] = useState(
    () => BUSINESS_FARE_TEMPLATE[0]!.name,
  );
  const [fareTripMode, setFareTripMode] = useState<TripType>("one_way");
  const [fareRows, setFareRows] = useState<FareRow[]>(() =>
    templateToRows("business"),
  );
  const [flightQuery, setFlightQuery] = useState("");
  const [flightFilter, setFlightFilter] = useState("all");
  const [bookingQuery, setBookingQuery] = useState("");
  const [bookingFilter, setBookingFilter] = useState("all");
  const [walkInOutboundChoice, setWalkInOutboundChoice] = useState("");
  const [walkInReturnChoice, setWalkInReturnChoice] = useState("");
  const [walkInFareProductId, setWalkInFareProductId] = useState("");
  const [walkInTripType, setWalkInTripType] = useState<TripType>("one_way");
  const [walkInAdults, setWalkInAdults] = useState<CompanionDraft[]>([]);
  const [walkInChildren, setWalkInChildren] = useState<CompanionDraft[]>([]);
  const [walkInInfants, setWalkInInfants] = useState<CompanionDraft[]>([]);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [bulkPending, startBulkTransition] = useTransition();

  const editingBooking = useMemo(
    () => bookings.find((b) => b.id === editingBookingId) ?? null,
    [bookings, editingBookingId],
  );

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
  // Bumped after every successful walk-in booking to force the whole form
  // (including uncontrolled fields and GstModeFields' internal state) to
  // remount and clear. AdminDashboard itself is never unmounted across the
  // redirect, so without this, passenger/payment/GST/custom-price details
  // from the last walk-in booking would silently carry over into the next.
  const [walkInFormKey, setWalkInFormKey] = useState(0);
  if (searchKey !== settledSearchKey) {
    setSettledSearchKey(searchKey);
    // Don't touch the safety-timeout ref here — refs can't be read/written
    // during render. The stale timer firing later is harmless: it just
    // calls setBusy(false) again once busy is already false.
    if (busy) setBusy(false);
    if (searchParams.get("saved") === "walk-in") {
      setWalkInFormKey((k) => k + 1);
      setWalkInOutboundChoice("");
      setWalkInReturnChoice("");
      setWalkInFareProductId("");
      setWalkInTripType("one_way");
      setWalkInAdults([]);
      setWalkInChildren([]);
      setWalkInInfants([]);
    }
    // After a successful flight add/edit, drop out of "edit" mode — otherwise
    // the redirect lands back on the Flights tab but the "Add / Edit" nav tab
    // silently stays pointed at the flight that was just edited, so clicking
    // it to add a *new* flight would instead reopen that same edit form.
    const saved = searchParams.get("saved");
    if (saved === "added" || saved === "updated") {
      setEditingId(null);
    }
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

  const visibleFlights = useMemo(
    () =>
      flights.filter((f) => {
        if (flightFilter === "live" && !f.active) return false;
        if (flightFilter === "hidden" && f.active) return false;
        return matchesQuery(
          flightQuery,
          f.airline,
          f.flightNumber,
          f.origin,
          f.destination,
          `${f.origin}${f.destination}`,
          f.cabinClass,
          formatFlightDateTime(f.departureAt),
        );
      }),
    [flights, flightFilter, flightQuery],
  );

  const visibleBookings = useMemo(
    () =>
      bookings.filter((b) => {
        if (bookingFilter === "unpaid_bank") {
          if (b.paymentMethod !== "bank_transfer") return false;
          if (b.status !== "pending_payment") return false;
        } else if (bookingFilter !== "all" && b.status !== bookingFilter) {
          return false;
        }
        return matchesQuery(
          bookingQuery,
          b.bookingRef,
          b.ticketNumber,
          b.passengerName,
          b.email,
          b.passengerPhone,
          b.passportNumber,
          b.flight.flightNumber,
          `${b.flight.origin}${b.flight.destination}`,
          b.returnFlight?.flightNumber,
          b.passengers?.map((p) => p.fullName).join(" "),
        );
      }),
    [bookings, bookingFilter, bookingQuery],
  );

  // Selection follows what's on screen — "select all" after a search must
  // never sweep in rows the admin can't currently see.
  const flightIds = useMemo(
    () => visibleFlights.map((f) => f.id),
    [visibleFlights],
  );
  const flightBulk = useBulkSelection(flightIds);
  const bookingIds = useMemo(
    () => visibleBookings.map((b) => b.id),
    [visibleBookings],
  );
  const bookingBulk = useBulkSelection(bookingIds);

  const bookableFlightOptions = useMemo<ComboboxOption[]>(
    () => [
      {
        value: CUSTOM_FLIGHT_VALUE,
        label: "+ Custom flight (not in system)",
        description: "Type the airline, route and times by hand",
        keywords: "custom manual new other adhoc",
      },
      ...flights
        .filter((f) => f.active && f.remainingSeats > 0)
        .map((f) => flightOption(f, { showSeats: true })),
    ],
    [flights],
  );

  const partnerFlightOptions = useMemo<ComboboxOption[]>(
    () => [
      {
        value: "",
        label: "No pairing — sells as one-way only",
        keywords: "none no pairing one way",
      },
      ...flights.filter((f) => f.id !== editingId).map((f) => flightOption(f)),
    ],
    [flights, editingId],
  );

  const fareProductOptions = useMemo<ComboboxOption[]>(
    () => [
      {
        value: "",
        label: "Auto — use each flight's current fare-release price",
        keywords: "auto default none",
      },
      ...charterFares
        .filter((f) => f.active)
        .map((f) => {
          const showRt =
            walkInTripType === "round_trip" && f.roundTripPriceCents > 0;
          return {
            value: f.id,
            label: `${cabinLabel(f.cabinClass)} · ${f.name}`,
            description: showRt
              ? `${formatAud(f.roundTripPriceCents)} round-trip total`
              : `${formatAud(f.priceCents)} one-way`,
            keywords: f.cabinClass,
          };
        }),
    ],
    [charterFares, walkInTripType],
  );

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
      setPartnerFlightId(editing.returnLegFlightId ?? "");
      setFareRows(
        editing.fareReleases.length > 0
          ? editing.fareReleases.map((r) => ({
              ...r,
              roundTripPriceCents: r.roundTripPriceCents ?? 0,
            }))
          : templateToRows(editing.cabinClass),
      );
    }
  }, [editing]);

  function openAdd() {
    setEditingId(null);
    setCabinClass("business");
    setPartnerFlightId("");
    setFareRows(templateToRows("business"));
    selectTab("form");
  }

  function openEdit(id: string) {
    const flight = flights.find((f) => f.id === id);
    if (flight) {
      // Sync fare rows before the form mounts so uncontrolled MoneyInputs
      // get the real saved prices (not stale zeros from the previous flight).
      setCabinClass(flight.cabinClass);
      setPartnerFlightId(flight.returnLegFlightId ?? "");
      setFareRows(
        flight.fareReleases.length > 0
          ? flight.fareReleases.map((r) => ({
              ...r,
              roundTripPriceCents: r.roundTripPriceCents ?? 0,
            }))
          : templateToRows(flight.cabinClass),
      );
    }
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
                Release. One-way and round-trip prices are set separately —
                round trip is not double one-way.
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

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Price type
            </p>
            <div className="inline-flex rounded-full border border-line bg-white p-1 text-sm font-medium">
              <button
                type="button"
                onClick={() => setFareTripMode("one_way")}
                className={`rounded-full px-4 py-2 transition ${
                  fareTripMode === "one_way"
                    ? "bg-accent-deep text-white"
                    : "text-muted hover:text-foreground"
                }`}
              >
                One way
              </button>
              <button
                type="button"
                onClick={() => setFareTripMode("round_trip")}
                className={`rounded-full px-4 py-2 transition ${
                  fareTripMode === "round_trip"
                    ? "bg-accent-deep text-white"
                    : "text-muted hover:text-foreground"
                }`}
              >
                Round trip
              </button>
            </div>
          </div>

          <div className="border border-line bg-surface/80 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
              Bulk pricing ·{" "}
              {fareTripMode === "round_trip" ? "Round trip" : "One way"}
            </p>
            <h3 className="mt-2 font-[family-name:var(--font-syne)] text-xl font-semibold">
              Apply a{" "}
              {fareTripMode === "round_trip" ? "round-trip" : "one-way"} price
              to a fare tier across all flights
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Set &quot;Early Bird&quot; business once and it updates every
              business flight that has that tier — instead of opening each
              flight one by one.
            </p>
            <form
              key={`bulk-${fareTripMode}-${searchParams.get("saved")}-${searchParams.get("count")}`}
              action={bulkUpdateFareTierPriceAction}
              className="mt-4 grid gap-4 sm:grid-cols-2"
            >
              <input type="hidden" name="priceKind" value={fareTripMode} />
              <SegmentedField
                name="cabinClass"
                label="Cabin"
                value={bulkPriceCabin}
                options={CABIN_SEGMENTS}
                onChange={(next) => {
                  setBulkPriceCabin(next as CabinClass);
                  const template =
                    next === "economy"
                      ? ECONOMY_FARE_TEMPLATE
                      : BUSINESS_FARE_TEMPLATE;
                  setBulkTierName(template[0]!.name);
                }}
              />
              <SegmentedField
                name="tierName"
                label="Fare tier"
                value={bulkTierName}
                onChange={setBulkTierName}
                options={(bulkPriceCabin === "economy"
                  ? ECONOMY_FARE_TEMPLATE
                  : BUSINESS_FARE_TEMPLATE
                ).map((t) => ({ value: t.name, label: t.name }))}
              />
              <label className="space-y-1 text-sm">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  {fareTripMode === "round_trip"
                    ? "Round-trip package (AUD)"
                    : "One-way price (AUD)"}
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
                  className="size-4 accent-accent-deep"
                />
                Only fill in unpriced releases
              </label>
              <div className="sm:col-span-2">
                <p className="mb-3 text-xs text-muted">
                  Leave the checkbox unchecked to overwrite every matching
                  flight with this price. Check it only when you want to fill
                  blanks without changing flights that already have a price.
                </p>
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
              <ListFilterBar
                query={flightQuery}
                onQueryChange={setFlightQuery}
                placeholder="Search flight number, airline, route, date…"
                chips={[
                  { value: "all", label: "All", count: flights.length },
                  { value: "live", label: "Live", count: activeCount },
                  {
                    value: "hidden",
                    label: "Hidden",
                    count: flights.length - activeCount,
                  },
                ]}
                activeChip={flightFilter}
                onChipChange={setFlightFilter}
                resultCount={visibleFlights.length}
                totalCount={flights.length}
                itemLabel="flight"
              />

              {visibleFlights.length === 0 ? (
                <NoMatches
                  label="No flights match that search."
                  onReset={() => {
                    setFlightQuery("");
                    setFlightFilter("all");
                  }}
                />
              ) : (
              <>
              <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted">
                <SelectAllCheckbox
                  allSelected={flightBulk.allSelected}
                  someSelected={flightBulk.someSelected}
                  onToggle={flightBulk.toggleAll}
                />
                Select all ({visibleFlights.length})
              </label>
            <ul className="divide-y divide-line border-y border-line bg-surface/60">
              {visibleFlights.map((f) => (
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
                        Departs {formatFlightDateTime(f.departureAt)}
                      </p>
                      <p className="text-sm text-muted">
                        Arrives {formatFlightDateTime(f.arrivalAt)}
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
                      Fare releases ·{" "}
                      {fareTripMode === "round_trip"
                        ? "Round-trip package"
                        : "One-way price"}
                    </p>
                    {f.fareReleases.map((release) => {
                      const activeCents =
                        fareTripMode === "round_trip"
                          ? (release.roundTripPriceCents ?? 0)
                          : (release.priceCents ?? 0);
                      return (
                      <form
                        key={`${release.id}-${fareTripMode}-${activeCents}`}
                        action={updateFarePriceAction}
                        className="flex flex-wrap items-end gap-3"
                      >
                        <input type="hidden" name="id" value={release.id} />
                        <input
                          type="hidden"
                          name="priceKind"
                          value={fareTripMode}
                        />
                        <div className="min-w-[10rem] flex-1">
                          <p className="text-sm font-medium">{release.name}</p>
                          <p className="text-xs text-muted">
                            {release.remainingSeats}/{release.totalSeats} seats
                            · saved {formatAud(activeCents)}
                          </p>
                        </div>
                        <label className="space-y-1 text-sm">
                          <span className="text-xs uppercase tracking-[0.14em] text-muted">
                            {fareTripMode === "round_trip"
                              ? "RT price (AUD)"
                              : "Price (AUD)"}
                          </span>
                          <MoneyInput
                            name="priceAud"
                            required
                            defaultValue={(activeCents / 100).toFixed(2)}
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
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
              </>
              )}
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
            <input
              type="hidden"
              name="tzOffsetMinutes"
              value={new Date().getTimezoneOffset()}
            />

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
            <SegmentedField
              name="cabinClass"
              label="Cabin / product"
              className="sm:col-span-2"
              value={cabinClass}
              onChange={(next) => onCabinChange(next as CabinClass)}
              options={[
                {
                  value: "business",
                  label: "Business",
                  hint: "20-seat fare template — Early Bird (5), Business Standard (10), Final Release (5).",
                },
                {
                  value: "economy",
                  label: "Economy",
                  hint: "Same release structure as business, economy pricing.",
                },
              ]}
            />

            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                Round-trip partner flight (optional)
              </span>
              <Combobox
                name="returnLegFlightId"
                value={partnerFlightId}
                onChange={setPartnerFlightId}
                placeholder="No pairing — sells as one-way only"
                searchPlaceholder="Search the return leg…"
                options={partnerFlightOptions}
              />
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
                  key={`${row.id ?? "new"}-${index}-${row.priceCents}-${row.roundTripPriceCents}`}
                  className="grid gap-3 border-t border-line pt-4 sm:grid-cols-4"
                >
                  <input type="hidden" name="fareSortOrder" value={row.sortOrder} />
                  <input type="hidden" name="fareReleaseId" value={row.id ?? ""} />
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
                      One-way price (AUD)
                    </span>
                    <MoneyInput
                      key={`ow-${row.id ?? index}-${row.priceCents}`}
                      name="farePriceAud"
                      required
                      defaultValue={(row.priceCents / 100).toFixed(2)}
                      className={fieldClass}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-xs uppercase tracking-[0.12em] text-muted">
                      Round-trip package (AUD)
                    </span>
                    <MoneyInput
                      key={`rt-${row.id ?? index}-${row.roundTripPriceCents}`}
                      name="fareRoundTripPriceAud"
                      required
                      defaultValue={(row.roundTripPriceCents / 100).toFixed(2)}
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
              Counter / phone bookings. Cash or card = confirmed immediately.
              Bank transfer = 48h seat hold. Choose GST mode below — it is
              written onto the invoice. Docs are not emailed automatically.
            </p>
            <form
              key={walkInFormKey}
              action={createWalkInBookingAction}
              className="mt-6 grid gap-4 sm:grid-cols-2"
            >
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Flight
                </span>
                <Combobox
                  name="flightId"
                  required
                  value={walkInOutboundChoice}
                  onChange={(next) => {
                    setWalkInOutboundChoice(next);
                    setWalkInReturnChoice("");
                    setWalkInTripType("one_way");
                  }}
                  placeholder="Select outbound flight"
                  searchPlaceholder="Flight number, route, date…"
                  options={bookableFlightOptions}
                />
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
                  <Combobox
                    name="returnFlightId"
                    required
                    value={walkInReturnChoice}
                    onChange={setWalkInReturnChoice}
                    placeholder="Select return flight"
                    searchPlaceholder="Flight number, route, date…"
                    options={bookableFlightOptions}
                  />
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
                <Combobox
                  name="fareProductId"
                  value={walkInFareProductId}
                  onChange={setWalkInFareProductId}
                  placeholder="Auto — use each flight's current fare-release price"
                  searchPlaceholder="Cabin or fare name…"
                  options={fareProductOptions}
                />
                <span className="block text-xs text-muted">
                  Charges this catalogue price instead of the fare-release
                  price. Round-trip uses the stored RT package total. Must match
                  the cabin of the flight(s) chosen above.
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
              <input
                type="hidden"
                name="tzOffsetMinutes"
                value={new Date().getTimezoneOffset()}
              />
              <div className="sm:col-span-2 space-y-3 border border-line bg-white/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Primary passenger (contact)
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
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
                  <label className="space-y-1 text-sm sm:col-span-2">
                    <span className="text-xs uppercase tracking-[0.12em] text-muted">
                      Nationality
                    </span>
                    <input name="nationality" className={fieldClass} />
                  </label>
                </div>
              </div>

              <div className="sm:col-span-2 space-y-4">
                <PassengerGroupFields
                  type="adult"
                  prefix="extra"
                  items={walkInAdults}
                  onChange={setWalkInAdults}
                  canChangeCount
                  description="Extra adults each get a seat and use the adult fare. Listed on travel docs and invoice."
                />
                <PassengerGroupFields
                  type="child"
                  prefix="child"
                  items={walkInChildren}
                  onChange={setWalkInChildren}
                  canChangeCount
                  description="Children get a seat and their own admin-set price (not the adult fare)."
                />
                <PassengerGroupFields
                  type="infant"
                  prefix="infant"
                  items={walkInInfants}
                  onChange={setWalkInInfants}
                  canChangeCount
                  description="Infants get a ticket and admin-set price but do not take a seat."
                />
                <p className="text-sm text-muted">
                  Seats (adults + children):{" "}
                  <span className="font-medium text-foreground">
                    {1 + walkInAdults.length + walkInChildren.length}
                  </span>
                  {walkInInfants.length > 0 ? (
                    <>
                      {" "}
                      · Infants (no seat):{" "}
                      <span className="font-medium text-foreground">
                        {walkInInfants.length}
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
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
              <SegmentedField
                name="bookingSource"
                label="How was this booked?"
                className="sm:col-span-2"
                defaultValue="walk_in"
                options={[
                  { value: "walk_in", label: "Walk-in", hint: "Counter or phone booking." },
                  {
                    value: "online",
                    label: "Online",
                    hint: "Entered on the customer's behalf.",
                  },
                ]}
              />
              <SegmentedField
                name="paymentMethod"
                label="Payment method"
                className="sm:col-span-2"
                defaultValue="cash"
                options={[
                  { value: "cash", label: "Cash", hint: "Marked paid now." },
                  {
                    value: "card",
                    label: "Credit card",
                    hint: "Taken at the counter — marked paid now.",
                  },
                  {
                    value: "bank_transfer",
                    label: "Bank transfer",
                    hint: "48h unpaid seat hold until you confirm payment.",
                  },
                ]}
              />
              <GstModeFields defaultMode="none" className="sm:col-span-2" />
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                  Custom GST (AUD) — optional
                </span>
                <MoneyInput
                  name="customGstAud"
                  defaultValue=""
                  className={fieldClass}
                />
                <span className="block text-xs text-muted">
                  Leave blank to use None / Exclusive / Inclusive above. Enter an
                  amount to set GST exactly (added on top of the fare).
                </span>
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
            <>
            <ListFilterBar
              query={bookingQuery}
              onQueryChange={setBookingQuery}
              placeholder="Search ref, ticket, name, email, phone, flight…"
              chips={[
                { value: "all", label: "All", count: bookings.length },
                {
                  value: "confirmed",
                  label: "Confirmed",
                  count: bookings.filter((b) => b.status === "confirmed").length,
                },
                {
                  value: "unpaid_bank",
                  label: "Awaiting payment",
                  count: bookings.filter(
                    (b) =>
                      b.paymentMethod === "bank_transfer" &&
                      b.status === "pending_payment",
                  ).length,
                },
                {
                  value: "cancelled",
                  label: "Cancelled",
                  count: bookings.filter((b) => b.status === "cancelled").length,
                },
                {
                  value: "hold_expired",
                  label: "Expired",
                  count: bookings.filter((b) => b.status === "hold_expired")
                    .length,
                },
              ]}
              activeChip={bookingFilter}
              onChipChange={setBookingFilter}
              resultCount={visibleBookings.length}
              totalCount={bookings.length}
              itemLabel="booking"
            />

            {visibleBookings.length === 0 ? (
              <NoMatches
                label="No bookings match that search."
                onReset={() => {
                  setBookingQuery("");
                  setBookingFilter("all");
                }}
              />
            ) : (
            <div className="overflow-x-auto border-y border-line bg-surface/60">
              <table className="w-full min-w-[1040px] text-left text-sm">
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
                    <th className="px-4 py-3 font-medium">Cabin</th>
                    <th className="px-4 py-3 font-medium">Flights</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleBookings.map((b) => (
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
                        {(() => {
                          const kids =
                            b.passengers?.filter(
                              (p) => p.passengerType === "child",
                            ).length ?? 0;
                          const infants =
                            b.passengers?.filter(
                              (p) => p.passengerType === "infant",
                            ).length ?? 0;
                          const parts = [
                            b.seatsBooked > 1
                              ? `${b.seatsBooked} seats`
                              : null,
                            kids > 0 ? `${kids} child` : null,
                            infants > 0 ? `${infants} infant` : null,
                          ].filter(Boolean);
                          return parts.length ? (
                            <p className="text-xs text-muted">
                              {parts.join(" · ")}
                            </p>
                          ) : null;
                        })()}
                      </td>
                      <td className="px-4 py-4 text-muted">
                        {b.flight.cabinClass === "business"
                          ? "Business"
                          : "Economy"}
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
                        {b.status !== "cancelled" ? (
                          <button
                            type="button"
                            onClick={() => setEditingBookingId(b.id)}
                            className="mb-1.5 block border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent hover:text-foreground"
                          >
                            Edit
                          </button>
                        ) : null}
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
            </>
          )}
        </section>
      )}

      {tab === "invoices" && <InvoiceAdminPanel invoices={invoices} />}

      {tab === "cargo" && <CargoAdminPanel submissions={cargoSubmissions} />}

      {tab === "deleted" && (
        <DeletedRecordsPanel records={deletedRecords} />
      )}

      {editingBooking && (
        <BookingEditModal
          booking={{
            id: editingBooking.id,
            bookingRef: editingBooking.bookingRef,
            ticketNumber: editingBooking.ticketNumber,
            passengerName: editingBooking.passengerName,
            email: editingBooking.email,
            passengerPhone: editingBooking.passengerPhone,
            passportNumber: editingBooking.passportNumber,
            nationality: editingBooking.nationality,
            seatsBooked: editingBooking.seatsBooked,
            extraBaggageKg: editingBooking.extraBaggageKg,
            fareReleaseName: editingBooking.fareReleaseName,
            amountPaidCents: editingBooking.amountPaidCents,
            status: editingBooking.status,
            paymentMethod: editingBooking.paymentMethod,
            passengers: editingBooking.passengers ?? [],
            flightLabel: `${editingBooking.flight.flightNumber} ${editingBooking.flight.origin}→${editingBooking.flight.destination}${
              editingBooking.returnFlight
                ? ` · ${editingBooking.returnFlight.flightNumber} ${editingBooking.returnFlight.origin}→${editingBooking.returnFlight.destination}`
                : ""
            }`,
          }}
          onClose={() => setEditingBookingId(null)}
        />
      )}
    </div>
  );
}
