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
import { bankHoldExpiresAt } from "@/lib/branding";
import { formatFlightDateTime, toDateTimeLocalValue, toFlightDateTimeLocalValue, toFlightYmd } from "@/lib/datetime";
import {
  BUSINESS_FARE_TEMPLATE,
  CABIN_CLASSES,
  ECONOMY_FARE_TEMPLATE,
  defaultFlightFareTemplate,
  fareTemplateForCabin,
} from "@/lib/fares/templates";
import {
  childFareCents,
  infantFareCents,
  partyFareCents,
} from "@/lib/booking/passengers";
import { formatAud } from "@/lib/pricing";
import { EXTRA_BAG_AUD, extraBaggageCentsForBags } from "@/lib/pricing/baggage";
import { AdminShell, type NavGroup } from "@/components/ui/AdminShell";
import { Button } from "@/components/ui/Button";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import {
  buildPricingCoverage,
  type CoverageRow,
  type CoverageStatus,
} from "@/lib/fares/coverage";
import { Menu, MenuDivider, MenuItem } from "@/components/ui/Menu";
import {
  Table,
  TableWrap,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui/Table";
import { Alert } from "@/components/ui/Feedback";
import { FieldError, labeledControlClass } from "@/components/forms/FieldError";
import { useStickyAction } from "@/components/forms/useStickyAction";

const CUSTOM_FLIGHT_VALUE = "__custom__";

type CabinClass = "economy" | "business";
type TripType = "one_way" | "round_trip";

/** A fare bucket as the server sends it. */
type SavedFareRow = {
  id?: string;
  /** Cabin this bucket belongs to — one flight sells several. */
  cabinClass: CabinClass;
  name: string;
  sortOrder: number;
  totalSeats: number;
  remainingSeats: number;
  priceCents: number;
  roundTripPriceCents: number;
};

/**
 * A bucket while it is being edited. `uid` is a stable client-side key: the
 * price inputs are uncontrolled, so keying them by array index would hand a
 * removed row's typed price to its neighbour.
 */
type FareRow = SavedFareRow & { uid: string };

type FlightRow = {
  id: string;
  airline: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  totalSeats: number;
  remainingSeats: number;
  active: boolean;
  returnLegFlightId: string | null;
  fareReleases: SavedFareRow[];
};

type BookingPassengerRow = {
  fullName: string;
  email: string;
  phone: string;
  passportNumber: string;
  nationality: string;
  ticketNumber: string;
  returnTicketNumber?: string | null;
  bookingRef?: string | null;
  passengerType: "adult" | "child" | "infant";
  dateOfBirth: string | null;
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

/**
 * Sidebar grouping. Same eight destinations in the same order as the tab strip
 * they replace — only the presentation is grouped, so `?tab=` and every
 * redirect target are unaffected.
 */
const NAV_GROUPS: { label: string; ids: Tab[] }[] = [
  { label: "Overview", ids: ["analytics"] },
  { label: "Inventory", ids: ["flights", "form", "fares"] },
  { label: "Sales", ids: ["bookings", "invoices"] },
  { label: "Operations", ids: ["cargo", "deleted"] },
];

/** Page heading + one-line explainer per section. */
const PAGE_META: Record<Tab, { title: string; description: string }> = {
  analytics: {
    title: "Overview",
    description: "How the charter is selling right now.",
  },
  flights: {
    title: "Flights",
    description:
      "Every departure and the seats it still has. Prices are set per cabin and ticket type.",
  },
  form: {
    title: "Flight",
    description: "Schedule, round-trip pairing, cabins and ticket types.",
  },
  fares: {
    title: "Charter fares",
    description:
      "The fare catalogue customers choose from — one set per cabin.",
  },
  bookings: {
    title: "Bookings",
    description:
      "Confirm bank transfers, edit traveller details, and book at the counter.",
  },
  invoices: {
    title: "Invoices",
    description: "Generate, preview and email travel documents and tax invoices.",
  },
  cargo: {
    title: "Cargo",
    description: "Freight enquiries from the website.",
  },
  deleted: {
    title: "Deleted",
    description: "Anything removed from the dashboard is recorded here.",
  },
};

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

/**
 * Titled block inside a long admin form. Purely a container — the fields keep
 * their names, values and validation; this only groups them so the form reads
 * as three short steps instead of one wall.
 */
function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-card border border-line bg-surface p-5 shadow-ui-sm sm:col-span-2 ${className ?? ""}`}
    >
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-xl text-sm text-muted">{description}</p>
      ) : null}
      <div className="mt-4 grid gap-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function cabinLabel(cabin: CabinClass) {
  return cabin === "business" ? "Business" : "Economy";
}

const COVERAGE_BADGE: Record<CoverageStatus, { tone: BadgeTone; label: string }> = {
  complete: { tone: "success", label: "Complete" },
  partial: { tone: "warning", label: "Partial" },
  unpriced: { tone: "danger", label: "Unpriced" },
  mixed: { tone: "info", label: "Mixed" },
  empty: { tone: "neutral", label: "None" },
};

/** Cabins a flight sells, derived from its fare releases. */
function cabinsOf(flight: { fareReleases: SavedFareRow[] }): CabinClass[] {
  const seen = new Set(flight.fareReleases.map((r) => r.cabinClass));
  return CABIN_CLASSES.filter((c) => seen.has(c as CabinClass)) as CabinClass[];
}

/** Per-cabin seat pools for a flight row. */
function cabinSeatsOf(flight: { fareReleases: SavedFareRow[] }) {
  return cabinsOf(flight).map((cabin) => {
    const rows = flight.fareReleases.filter((r) => r.cabinClass === cabin);
    return { cabin, ...seatTotals(rows) };
  });
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
    description: `${formatFlightDateTime(flight.departureAt)} · ${
      cabinsOf(flight)
        .map((c) => cabinLabel(c))
        .join(" + ") || "No cabins"
    }`,
    meta: options?.showSeats
      ? `${flight.remainingSeats} seat${flight.remainingSeats === 1 ? "" : "s"}`
      : undefined,
    keywords: `${flight.origin}${flight.destination} ${cabinsOf(flight).join(" ")}`,
  };
}

let fareRowSeq = 0;
function nextFareUid() {
  fareRowSeq += 1;
  return `fare-${fareRowSeq}`;
}

function templateToRows(cabin: CabinClass): FareRow[] {
  return fareTemplateForCabin(cabin).map((t) => ({
    uid: nextFareUid(),
    cabinClass: t.cabinClass as CabinClass,
    name: t.name,
    sortOrder: t.sortOrder,
    totalSeats: t.totalSeats,
    remainingSeats: t.totalSeats,
    priceCents: 0,
    roundTripPriceCents: 0,
  }));
}

/** A brand-new flight starts with every cabin's default buckets. */
function defaultFareRows(): FareRow[] {
  return defaultFlightFareTemplate().map((t) => ({
    uid: nextFareUid(),
    cabinClass: t.cabinClass as CabinClass,
    name: t.name,
    sortOrder: t.sortOrder,
    totalSeats: t.totalSeats,
    remainingSeats: t.totalSeats,
    priceCents: 0,
    roundTripPriceCents: 0,
  }));
}

/** Saved releases arriving from the server have no client uid yet. */
function withUids(rows: SavedFareRow[]): FareRow[] {
  return rows.map((r) => ({ ...r, uid: nextFareUid() }));
}

function seatTotals(rows: SavedFareRow[]) {
  return rows.reduce(
    (acc, r) => {
      acc.total += r.totalSeats;
      acc.remaining += r.remainingSeats;
      return acc;
    },
    { total: 0, remaining: 0 },
  );
}

/** Inline fields for a walk-in leg that isn't in the Flight table at all. */
function CustomFlightFields({
  prefix,
  fieldErrors = {},
}: {
  prefix: "outbound" | "return";
  fieldErrors?: Record<string, string>;
}) {
  const err = (suffix: string) => fieldErrors[`${prefix}Custom${suffix}`];
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
            data-field-key={`${prefix}CustomAirline`}
            aria-invalid={err("Airline") ? true : undefined}
            className={labeledControlClass(fieldClass, err("Airline"))}
          />
          <FieldError error={err("Airline")} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Flight number
          </span>
          <input
            name={`${prefix}CustomFlightNumber`}
            required
            placeholder="QF401"
            data-field-key={`${prefix}CustomFlightNumber`}
            aria-invalid={err("FlightNumber") ? true : undefined}
            className={labeledControlClass(fieldClass, err("FlightNumber"))}
          />
          <FieldError error={err("FlightNumber")} />
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
            data-field-key={`${prefix}CustomOrigin`}
            aria-invalid={err("Origin") ? true : undefined}
            className={labeledControlClass(`${fieldClass} uppercase`, err("Origin"))}
          />
          <FieldError error={err("Origin")} />
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
            data-field-key={`${prefix}CustomDestination`}
            aria-invalid={err("Destination") ? true : undefined}
            className={labeledControlClass(
              `${fieldClass} uppercase`,
              err("Destination"),
            )}
          />
          <FieldError error={err("Destination")} />
        </label>
        <DateTimePicker
          name={`${prefix}CustomDepartureAt`}
          label="Departs at"
          required
          error={err("DepartureAt")}
          placeholder="Pick date and time"
        />
        <DateTimePicker
          name={`${prefix}CustomArrivalAt`}
          label="Arrives at"
          required
          error={err("ArrivalAt")}
          placeholder="Pick date and time"
        />
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
            className={labeledControlClass(fieldClass, err("PriceAud"))}
          />
          <FieldError error={err("PriceAud")} />
        </label>
      </div>
    </div>
  );
}

/**
 * One cabin + tier bucket. Rows built from a template are clickable and point
 * the bulk form at that bucket; custom tier names are not, because the form's
 * tier control only offers template names.
 */
function CoverageBoardRow({
  row,
  selected,
  onSelect,
}: {
  row: CoverageRow;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const badge = COVERAGE_BADGE[row.status];
  const amount =
    row.total === 0
      ? "No releases"
      : row.distinctAmounts > 1
        ? `Mixed · ${row.distinctAmounts} amounts`
        : row.amountCents !== null
          ? formatAud(row.amountCents)
          // "$0" rather than repeating the word already on the badge, and it
          // matches the help line above the board.
          : "$0";

  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">
          <span className="text-muted">{cabinLabel(row.cabinClass)} · </span>
          {row.name}
        </span>
        <span className="mt-0.5 block text-xs text-muted">
          {row.total === 0
            ? "Not on any flight"
            : `${row.priced}/${row.total} priced`}
          {row.unpriced > 0 ? ` · ${row.unpriced} unpriced` : ""}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm tabular-nums text-foreground">
          {amount}
        </span>
      </span>
      <Badge tone={badge.tone} className="shrink-0">
        {badge.label}
      </Badge>
    </>
  );

  const shell =
    "flex w-full min-h-10 items-center gap-3 px-3 py-2.5 text-left transition-colors";

  return (
    <li className={selected ? "bg-accent/5" : undefined}>
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          title="Point the bulk form at this bucket"
          className={`${shell} hover:bg-accent/8 focus-visible:outline-2 focus-visible:outline-offset-[-2px]`}
        >
          {body}
        </button>
      ) : (
        <div className={shell}>{body}</div>
      )}
    </li>
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
  const walkInSticky = useStickyAction(createWalkInBookingAction);
  const createFlightSticky = useStickyAction(createFlightAction);
  const updateFlightSticky = useStickyAction(updateFlightAction);
  const [partnerFlightId, setPartnerFlightId] = useState("");
  const [bulkPriceCabin, setBulkPriceCabin] = useState<CabinClass>("business");
  const [bulkTierName, setBulkTierName] = useState(
    () => BUSINESS_FARE_TEMPLATE[0]!.name,
  );
  const [fareTripMode, setFareTripMode] = useState<TripType>("one_way");
  const [fareRows, setFareRows] = useState<FareRow[]>(() => defaultFareRows());
  const [flightQuery, setFlightQuery] = useState("");
  const [flightFilter, setFlightFilter] = useState("all");
  const [bookingQuery, setBookingQuery] = useState("");
  const [bookingFilter, setBookingFilter] = useState("all");
  const [walkInOutboundChoice, setWalkInOutboundChoice] = useState("");
  const [walkInReturnChoice, setWalkInReturnChoice] = useState("");
  const [walkInReturnDate, setWalkInReturnDate] = useState("");
  const [walkInExtraBags, setWalkInExtraBags] = useState(0);
  const [walkInFareProductId, setWalkInFareProductId] = useState("");
  const [walkInCabin, setWalkInCabin] = useState<CabinClass>("economy");
  const [walkInTripType, setWalkInTripType] = useState<TripType>("one_way");
  const [walkInAdults, setWalkInAdults] = useState<CompanionDraft[]>([]);
  const [walkInChildren, setWalkInChildren] = useState<CompanionDraft[]>([]);
  const [walkInInfants, setWalkInInfants] = useState<CompanionDraft[]>([]);
  const [walkInPaymentMethod, setWalkInPaymentMethod] = useState<
    "cash" | "card" | "bank_transfer"
  >("cash");
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
  const walkInWasPending = useRef(false);
  const flightWasPending = useRef(false);

  function markBusy() {
    setBusy(true);
    if (busySafetyTimeout.current) clearTimeout(busySafetyTimeout.current);
    // Walk-in confirmations / invoice resends render a PDF via headless
    // Chromium and can legitimately take a while — never get stuck longer
    // than the route's own server timeout budget.
    busySafetyTimeout.current = setTimeout(() => setBusy(false), 55_000);
  }

  const flightPending = createFlightSticky.pending || updateFlightSticky.pending;
  useEffect(() => {
    if (walkInSticky.pending) {
      walkInWasPending.current = true;
      return;
    }
    if (walkInWasPending.current) {
      walkInWasPending.current = false;
      setBusy(false);
    }
  }, [walkInSticky.pending]);
  useEffect(() => {
    if (flightPending) {
      flightWasPending.current = true;
      return;
    }
    if (flightWasPending.current) {
      flightWasPending.current = false;
      setBusy(false);
    }
  }, [flightPending]);

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
      setWalkInReturnDate("");
      setWalkInExtraBags(0);
      setWalkInFareProductId("");
      setWalkInCabin("economy");
      setWalkInTripType("one_way");
      setWalkInAdults([]);
      setWalkInChildren([]);
      setWalkInInfants([]);
      setWalkInPaymentMethod("cash");
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
  /** Live seat position for a cabin on the chosen outbound flight. */
  function walkInCabinHint(cabin: CabinClass) {
    if (!walkInOutboundFlight) return "Pick a flight to see seats.";
    const seats = cabinSeatsOf(walkInOutboundFlight).find(
      (c) => c.cabin === cabin,
    );
    if (!seats) return "Not sold on this flight.";
    return `${seats.remaining} of ${seats.total} seats left.`;
  }

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

  useEffect(() => {
    if (walkInTripType !== "round_trip") {
      setWalkInReturnDate("");
      setWalkInReturnChoice("");
      return;
    }
    if (walkInPairedReturn) {
      setWalkInReturnDate(toFlightYmd(walkInPairedReturn.departureAt));
      setWalkInReturnChoice(walkInPairedReturn.id);
      return;
    }
    setWalkInReturnChoice("");
    setWalkInReturnDate("");
  }, [walkInOutboundChoice, walkInTripType, walkInPairedReturn?.id]);

  /**
   * Every return the server will accept: reverse route, after the outbound,
   * still on sale. The date picker only reorders this list — it never hides
   * flights, so the admin can always see how many returns exist.
   */
  const walkInReturnFlights = useMemo(() => {
    const out = walkInOutboundFlight;
    return flights.filter((f) => {
      if (!f.active || f.remainingSeats <= 0) return false;
      if (!out) return true;
      if (f.id === out.id) return false;
      if (f.origin !== out.destination || f.destination !== out.origin) {
        return false;
      }
      return new Date(f.departureAt) > new Date(out.departureAt);
    });
  }, [flights, walkInOutboundFlight]);

  const walkInReturnDateMatchCount = useMemo(() => {
    if (!walkInReturnDate) return 0;
    return walkInReturnFlights.filter(
      (f) => toFlightYmd(f.departureAt) === walkInReturnDate,
    ).length;
  }, [walkInReturnFlights, walkInReturnDate]);

  const walkInReturnDateSummary = useMemo(() => {
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const f of walkInReturnFlights) {
      const ymd = toFlightYmd(f.departureAt);
      if (!ymd || seen.has(ymd)) continue;
      seen.add(ymd);
      labels.push(
        new Date(f.departureAt).toLocaleDateString("en-AU", {
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        }),
      );
    }
    return labels;
  }, [walkInReturnFlights]);

  const walkInReturnOptions = useMemo<ComboboxOption[]>(() => {
    const matching: typeof walkInReturnFlights = [];
    const rest: typeof walkInReturnFlights = [];
    for (const f of walkInReturnFlights) {
      if (
        walkInReturnDate &&
        toFlightYmd(f.departureAt) === walkInReturnDate
      ) {
        matching.push(f);
      } else {
        rest.push(f);
      }
    }
    const ordered = walkInReturnDate ? [...matching, ...rest] : walkInReturnFlights;
    return [
      {
        value: CUSTOM_FLIGHT_VALUE,
        label: "+ Custom flight (not in system)",
        description: "Type the airline, route and times by hand",
        keywords: "custom manual new other adhoc",
      },
      ...ordered.map((f) => {
        const option = flightOption(f, { showSeats: true });
        const onSelectedDate =
          Boolean(walkInReturnDate) &&
          toFlightYmd(f.departureAt) === walkInReturnDate;
        return {
          ...option,
          description: onSelectedDate
            ? `${option.description} · matches date`
            : option.description,
        };
      }),
    ];
  }, [walkInReturnFlights, walkInReturnDate]);

  const editing = useMemo(
    () => flights.find((f) => f.id === editingId) ?? null,
    [flights, editingId],
  );
  const flightSticky = editing ? updateFlightSticky : createFlightSticky;

  const activeCount = flights.filter((f) => f.active).length;

  /*
   * The admin page loads every flight (no `take`), so these counts cover the
   * same releases a bulk apply would hit — not just a visible page of them.
   * Recomputed only when the flight data or the price-type toggle changes.
   */
  const pricingCoverage = useMemo(
    () => buildPricingCoverage(flights, fareTripMode),
    [flights, fareTripMode],
  );
  const unpaidInvoiceCount = invoices.filter((i) => i.status === "unpaid").length;

  const navGroups = useMemo<NavGroup[]>(() => {
    const labelFor = (id: Tab) => {
      if (id === "form") return editing ? "Edit flight" : "Add flight";
      return TABS.find((t) => t.id === id)?.label ?? id;
    };
    const countFor = (id: Tab) =>
      id === "invoices" && unpaidInvoiceCount > 0 ? unpaidInvoiceCount : undefined;
    return NAV_GROUPS.map((group) => ({
      label: group.label,
      items: group.ids.map((id) => ({
        id,
        label: labelFor(id),
        count: countFor(id),
      })),
    }));
  }, [editing, unpaidInvoiceCount]);

  const pageMeta = PAGE_META[tab];

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
          cabinsOf(f).join(" "),
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
        .filter((f) => f.active && f.cabinClass === walkInCabin)
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
    [charterFares, walkInTripType, walkInCabin],
  );

  const walkInAdultUnitCents = useMemo(() => {
    const product = charterFares.find(
      (f) => f.id === walkInFareProductId && f.active,
    );
    if (product) {
      return walkInTripType === "round_trip"
        ? product.roundTripPriceCents
        : product.priceCents;
    }
    const flight = walkInOutboundFlight;
    if (!flight) return 0;
    const priceOf = (r: SavedFareRow) =>
      walkInTripType === "round_trip" ? r.roundTripPriceCents : r.priceCents;
    const sorted = flight.fareReleases
      .filter((r) => r.cabinClass === walkInCabin)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const hit =
      sorted.find((r) => r.remainingSeats > 0 && priceOf(r) > 0) ??
      sorted.find((r) => r.remainingSeats > 0);
    return hit ? priceOf(hit) : 0;
  }, [
    charterFares,
    walkInFareProductId,
    walkInTripType,
    walkInOutboundFlight,
    walkInCabin,
  ]);
  const walkInChildPriceAud = (childFareCents(walkInAdultUnitCents) / 100).toFixed(2);
  const walkInInfantPriceAud = (
    infantFareCents(walkInAdultUnitCents) / 100
  ).toFixed(2);
  const walkInPartyTotalCents = partyFareCents({
    adultUnitFareCents: walkInAdultUnitCents,
    adults: 1 + walkInAdults.length,
    children: walkInChildren.length,
    infants: walkInInfants.length,
  });

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

  /*
   * There is deliberately no effect syncing form state from `editing`.
   * `editing` is a useMemo over the `flights` prop, so it took a new identity
   * on every dashboard data refresh and re-ran the sync — throwing away
   * whatever prices the admin had typed but not yet saved. openEdit() below
   * seeds cabin / pairing / fare rows synchronously before the form is shown,
   * which is the only path that ever selects a flight to edit.
   */

  /*
   * Fare-row editing. Rows live in one flat list (that is how the form posts
   * them) but are rendered grouped by cabin, so every mutation takes the index
   * into the flat list and re-numbers sortOrder within the affected cabin.
   */
  function renumber(rows: FareRow[]): FareRow[] {
    const perCabin = new Map<CabinClass, number>();
    return rows.map((row) => {
      const next = (perCabin.get(row.cabinClass) ?? 0) + 1;
      perCabin.set(row.cabinClass, next);
      return { ...row, sortOrder: next };
    });
  }

  function updateFareRow(index: number, patch: Partial<FareRow>) {
    setFareRows((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function addFareRow(cabin: CabinClass) {
    setFareRows((rows) => {
      const row: FareRow = {
        uid: nextFareUid(),
        cabinClass: cabin,
        name: "",
        sortOrder: 0,
        totalSeats: 0,
        remainingSeats: 0,
        priceCents: 0,
        roundTripPriceCents: 0,
      };
      // Insert after the cabin's last row so cabins stay contiguous.
      let insertAt = rows.length;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i]!.cabinClass === cabin) {
          insertAt = i + 1;
          break;
        }
      }
      const next = [...rows];
      next.splice(insertAt, 0, row);
      return renumber(next);
    });
  }

  function removeFareRow(index: number) {
    setFareRows((rows) => renumber(rows.filter((_, i) => i !== index)));
  }

  function addCabin(cabin: CabinClass) {
    setFareRows((rows) => renumber([...rows, ...templateToRows(cabin)]));
  }

  function removeCabin(cabin: CabinClass) {
    const seated = fareRows.filter(
      (r) => r.cabinClass === cabin && r.totalSeats !== r.remainingSeats,
    );
    if (
      seated.length > 0 &&
      !confirm(
        `${cabinLabel(cabin)} has seats already sold. Removing the cabin deletes its ticket types — bookings that used them keep their record but the cabin stops selling. Continue?`,
      )
    ) {
      return;
    }
    setFareRows((rows) =>
      renumber(rows.filter((r) => r.cabinClass !== cabin)),
    );
  }

  function openAdd() {
    setEditingId(null);
    setPartnerFlightId("");
    setFareRows(defaultFareRows());
    selectTab("form");
  }

  function openEdit(id: string) {
    const flight = flights.find((f) => f.id === id);
    if (flight) {
      // Sync fare rows before the form mounts so uncontrolled MoneyInputs
      // get the real saved prices (not stale zeros from the previous flight).
      setPartnerFlightId(flight.returnLegFlightId ?? "");
      setFareRows(
        flight.fareReleases.length > 0
          ? withUids(
              flight.fareReleases.map((r) => ({
                ...r,
                roundTripPriceCents: r.roundTripPriceCents ?? 0,
              })),
            )
          : defaultFareRows(),
      );
    }
    setEditingId(id);
    selectTab("form");
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
      <AdminShell
        groups={navGroups}
        activeId={tab}
        onSelect={(id) => {
          // Identical to the old tab buttons: "Add / Edit" with nothing being
          // edited resets the flight form first.
          if (id === "form" && !editingId) openAdd();
          else selectTab(id as Tab);
        }}
        title={
          tab === "form" ? (editing ? "Edit flight" : "Add a flight") : pageMeta.title
        }
        description={pageMeta.description}
        actions={
          tab === "flights" ? (
            <Button variant="primary" onClick={openAdd}>
              Add flight
            </Button>
          ) : undefined
        }
      >
      {savedMessage && <Alert tone="success">{savedMessage}</Alert>}
      {errorMessage && <Alert tone="danger">{errorMessage}</Alert>}

      {tab === "analytics" && (
        <SystemAnalyticsSection analytics={analytics} />
      )}

      {tab === "flights" && (
        <section className="space-y-6">

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Price type
            </p>
            <div className="inline-flex rounded-full border border-line bg-white p-1 text-sm font-medium">
              <button
                type="button"
                onClick={() => setFareTripMode("one_way")}
                className={`!rounded-full px-4 py-2 transition ${
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
                className={`!rounded-full px-4 py-2 transition ${
                  fareTripMode === "round_trip"
                    ? "bg-accent-deep text-white"
                    : "text-muted hover:text-foreground"
                }`}
              >
                Round trip
              </button>
            </div>
          </div>

          {/*
            Bulk pricing is an occasional power tool, not the point of this
            page — collapsed by default so the flight list is what you land on.
            The form inside is unchanged.
          */}
          <details className="group rounded-card border border-line bg-surface shadow-ui-sm">
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">
                  Bulk pricing
                </span>
                <span className="mt-0.5 block text-sm text-muted">
                  Apply one {fareTripMode === "round_trip" ? "round-trip" : "one-way"}{" "}
                  price to a fare tier across every matching flight.
                </span>
              </span>
              <span
                aria-hidden
                className="shrink-0 text-muted transition-transform group-open:rotate-180"
              >
                ▾
              </span>
            </summary>
            <div className="border-t border-line px-5 pb-5 pt-4">
            {/*
              Coverage board. The bulk flash only says how many releases were
              touched, which stops answering "what is left" after the second
              run — this reads the releases already on the page instead.
            */}
            {flights.length === 0 ? (
              <p className="text-sm text-muted">
                No flights yet, so there is nothing to price.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                    Coverage ·{" "}
                    {fareTripMode === "round_trip" ? "Round trip" : "One way"}
                  </p>
                  <p className="text-xs text-muted">
                    $0 means not priced yet. Mixed means flights in that tier
                    don&apos;t all share one amount.
                  </p>
                </div>

                <ul className="divide-y divide-line/70 rounded-card border border-line bg-background/40">
                  {pricingCoverage.standard.map((row) => (
                    <CoverageBoardRow
                      key={row.key}
                      row={row}
                      selected={
                        row.cabinClass === bulkPriceCabin &&
                        row.name === bulkTierName
                      }
                      onSelect={() => {
                        setBulkPriceCabin(row.cabinClass as CabinClass);
                        setBulkTierName(row.name);
                      }}
                    />
                  ))}
                </ul>

                {pricingCoverage.other.length > 0 ? (
                  <>
                    <p className="pt-1 text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                      Other tier names
                    </p>
                    <ul className="divide-y divide-line/70 rounded-card border border-line bg-background/40">
                      {pricingCoverage.other.map((row) => (
                        <CoverageBoardRow key={row.key} row={row} />
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            )}

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
                  className="inline-flex min-h-10 items-center rounded-control border border-line bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Apply to matching flights
                </SubmitButton>
              </div>
            </form>
            </div>
          </details>

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
                          {f.active ? "Live" : "Hidden"}
                        </span>
                        {cabinSeatsOf(f).map(({ cabin, total, remaining }) => (
                          <span
                            key={cabin}
                            className="border border-line px-2 py-0.5 text-xs font-medium text-muted"
                          >
                            {cabinLabel(cabin)} {remaining}/{total}
                          </span>
                        ))}
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
                        {f.remainingSeats}/{f.totalSeats} seats on the aircraft
                        {cabinSeatsOf(f).length > 1
                          ? " (all cabins combined)"
                          : ""}
                      </p>
                    </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                      <button
                        type="button"
                        onClick={() => openEdit(f.id)}
                        className="tap-target font-medium text-accent transition hover:text-accent-deep"
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

                  {/*
                    Grouped by cabin. Both cabins ship tiers called "Early Bird"
                    and "Final Release", so a flat list showed each name twice
                    with nothing to tell them apart — the price boxes looked
                    duplicated. Each row now sits under a cabin heading and
                    names itself "Business · Early Bird".
                  */}
                  {/*
                    Collapsed by default: six priced tiers per flight across
                    thirty flights meant ~180 open input boxes on one page.
                    The list is now scannable and prices are one click away.
                  */}
                  <details className="group mt-4 border-t border-line/70 pt-3">
                    <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted [&::-webkit-details-marker]:hidden">
                      <span
                        aria-hidden
                        className="transition-transform group-open:rotate-180"
                      >
                        ▾
                      </span>
                      Ticket prices ·{" "}
                      {fareTripMode === "round_trip"
                        ? "Round-trip package"
                        : "One way"}
                    </summary>
                    <div className="mt-3 space-y-4">
                    {cabinSeatsOf(f).map(({ cabin, total, remaining }) => (
                      <div key={cabin} className="space-y-2">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <p className="text-sm font-semibold text-foreground">
                            {cabinLabel(cabin)}
                          </p>
                          <p className="text-xs text-muted">
                            {remaining}/{total} seats left
                          </p>
                        </div>
                        {f.fareReleases
                          .filter((r) => r.cabinClass === cabin)
                          .map((release) => {
                            const activeCents =
                              fareTripMode === "round_trip"
                                ? (release.roundTripPriceCents ?? 0)
                                : (release.priceCents ?? 0);
                            return (
                              <form
                                key={`${release.id}-${fareTripMode}-${activeCents}`}
                                action={updateFarePriceAction}
                                className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-background/60 px-3 py-2.5"
                              >
                                <input
                                  type="hidden"
                                  name="id"
                                  value={release.id}
                                />
                                <input
                                  type="hidden"
                                  name="priceKind"
                                  value={fareTripMode}
                                />
                                <div className="min-w-[12rem] flex-1">
                                  <p className="text-sm font-medium text-foreground">
                                    <span className="text-muted">
                                      {cabinLabel(cabin)} ·{" "}
                                    </span>
                                    {release.name}
                                  </p>
                                  <p className="text-xs text-muted">
                                    {release.remainingSeats}/
                                    {release.totalSeats} seats · saved{" "}
                                    {formatAud(activeCents)}
                                  </p>
                                </div>
                                <label className="space-y-1 text-sm">
                                  <span className="text-xs uppercase tracking-[0.1em] text-muted">
                                    {fareTripMode === "round_trip"
                                      ? "Round trip"
                                      : "One way"}
                                  </span>
                                  <MoneyInput
                                    name="priceAud"
                                    required
                                    defaultValue={(activeCents / 100).toFixed(2)}
                                    className="w-40 rounded-control border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent"
                                  />
                                </label>
                                <SubmitButton
                                  pendingLabel="Saving…"
                                  className="inline-flex min-h-10 items-center rounded-control border border-line bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Update
                                </SubmitButton>
                              </form>
                            );
                          })}
                      </div>
                    ))}
                    </div>
                  </details>
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
        <section>
          {/* The shell already renders the page heading for this section. */}
          <p className="max-w-2xl text-sm text-muted">
            One flight, both cabins. Defaults to a 140-seat aircraft — Business
            20 and Economy 120 — but every cabin, ticket type, seat count and
            price below is yours to change.
          </p>

          <form
            key={editing?.id ?? "new"}
            onSubmit={flightSticky.onSubmit}
            data-skip-busy
            className="mt-8 grid max-w-4xl gap-6 sm:grid-cols-2"
          >
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <input
              type="hidden"
              name="tzOffsetMinutes"
              value={new Date().getTimezoneOffset()}
            />

            <FormSection
              title="Schedule"
              description="Which aircraft flies where, and when."
            >
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                Airline
              </span>
              <input
                name="airline"
                required
                defaultValue={editing?.airline ?? ""}
                placeholder="Qantas"
                data-field-key="airline"
                aria-invalid={flightSticky.fieldErrors.airline ? true : undefined}
                className={labeledControlClass(
                  fieldClass,
                  flightSticky.fieldErrors.airline,
                )}
              />
              <FieldError error={flightSticky.fieldErrors.airline} />
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
                data-field-key="flightNumber"
                aria-invalid={
                  flightSticky.fieldErrors.flightNumber ? true : undefined
                }
                className={labeledControlClass(
                  fieldClass,
                  flightSticky.fieldErrors.flightNumber,
                )}
              />
              <FieldError error={flightSticky.fieldErrors.flightNumber} />
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
                data-field-key="origin"
                aria-invalid={flightSticky.fieldErrors.origin ? true : undefined}
                className={labeledControlClass(
                  `${fieldClass} uppercase`,
                  flightSticky.fieldErrors.origin,
                )}
              />
              <FieldError error={flightSticky.fieldErrors.origin} />
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
                data-field-key="destination"
                aria-invalid={
                  flightSticky.fieldErrors.destination ? true : undefined
                }
                className={labeledControlClass(
                  `${fieldClass} uppercase`,
                  flightSticky.fieldErrors.destination,
                )}
              />
              <FieldError error={flightSticky.fieldErrors.destination} />
            </label>
            <DateTimePicker
              name="departureAt"
              label="Leaves at"
              required
              error={flightSticky.fieldErrors.departureAt}
              defaultValue={
                editing
                  ? toFlightDateTimeLocalValue(new Date(editing.departureAt))
                  : ""
              }
            />
            <DateTimePicker
              name="arrivalAt"
              label="Arrives at"
              required
              error={flightSticky.fieldErrors.arrivalAt}
              defaultValue={
                editing
                  ? toFlightDateTimeLocalValue(new Date(editing.arrivalAt))
                  : ""
              }
            />
            </FormSection>

            <FormSection
              title="Round-trip pairing"
              description="Optional. Pair this outbound leg with its return so customers can book both in one go."
            >
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                Partner flight
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

            </FormSection>

            <div className="sm:col-span-2 space-y-5 rounded-card border border-line bg-surface p-5 shadow-ui-sm">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="font-[family-name:var(--font-syne)] text-lg font-semibold">
                    Cabins &amp; ticket types
                  </p>
                  <p className="mt-1 max-w-xl text-sm text-muted">
                    Each cabin sells its ticket types in order, top to bottom.
                    Leave a price at 0 to hold a ticket type back — it will not
                    sell until you price it.
                  </p>
                </div>
                <p className="text-sm text-muted">
                  Aircraft total:{" "}
                  <span className="font-medium text-foreground">
                    {seatTotals(fareRows).total} seats
                  </span>
                </p>
              </div>

              {CABIN_CLASSES.map((cabinValue) => {
                const cabin = cabinValue as CabinClass;
                const rows = fareRows
                  .map((row, index) => ({ row, index }))
                  .filter((entry) => entry.row.cabinClass === cabin);

                if (rows.length === 0) {
                  return (
                    <div
                      key={cabin}
                      className="flex flex-wrap items-center justify-between gap-3 border border-dashed border-line px-4 py-3"
                    >
                      <p className="text-sm text-muted">
                        No {cabinLabel(cabin)} cabin on this flight.
                      </p>
                      <button
                        type="button"
                        onClick={() => addCabin(cabin)}
                        className="border border-line px-3 py-1.5 text-sm font-medium text-accent transition hover:border-accent"
                      >
                        + Add {cabinLabel(cabin)} cabin
                      </button>
                    </div>
                  );
                }

                const totals = seatTotals(rows.map((entry) => entry.row));
                return (
                  <div key={cabin} className="border border-line bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface/70 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
                          {cabinLabel(cabin)}
                        </p>
                        <p className="text-xs text-muted">
                          {rows.length} ticket type
                          {rows.length === 1 ? "" : "s"} ·{" "}
                          {editing
                            ? totals.remaining + "/" + totals.total + " seats left"
                            : totals.total + " seats"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => addFareRow(cabin)}
                          className="tap-target rounded-control border border-line px-3 text-xs font-medium text-accent transition hover:border-accent"
                        >
                          + Add ticket type
                        </button>
                        <button
                          type="button"
                          onClick={() => removeCabin(cabin)}
                          className="tap-target rounded-control px-2 text-xs font-medium text-muted/80 transition hover:text-accent-red"
                        >
                          Remove cabin
                        </button>
                      </div>
                    </div>

                    <div className="divide-y divide-line/70">
                      {rows.map((entry, position) => (
                        <div
                          key={entry.row.uid}
                          className="grid items-start gap-3 px-4 py-4 sm:grid-cols-6"
                        >
                          <input
                            type="hidden"
                            name="fareCabinClass"
                            value={entry.row.cabinClass}
                          />
                          <input
                            type="hidden"
                            name="fareSortOrder"
                            value={position + 1}
                          />
                          <input
                            type="hidden"
                            name="fareReleaseId"
                            value={entry.row.id ?? ""}
                          />
                          <label className="space-y-1 text-sm sm:col-span-2">
                            <span className="text-xs uppercase tracking-[0.12em] text-muted">
                              Ticket type
                            </span>
                            <input
                              name="fareName"
                              required
                              value={entry.row.name}
                              onChange={(e) =>
                                updateFareRow(entry.index, {
                                  name: e.target.value,
                                })
                              }
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
                              value={entry.row.totalSeats}
                              onChange={(e) => {
                                const totalSeats = Number(e.target.value);
                                updateFareRow(entry.index, {
                                  totalSeats,
                                  remainingSeats: editing
                                    ? Math.min(
                                        entry.row.remainingSeats,
                                        totalSeats,
                                      )
                                    : totalSeats,
                                });
                              }}
                              className={fieldClass}
                            />
                          </label>
                          <label className="space-y-1 text-sm">
                            <span className="text-xs uppercase tracking-[0.12em] text-muted">
                              One-way
                            </span>
                            <MoneyInput
                              key={"ow-" + entry.row.uid + "-" + entry.row.priceCents}
                              name="farePriceAud"
                              required
                              defaultValue={(entry.row.priceCents / 100).toFixed(2)}
                              className={fieldClass}
                            />
                          </label>
                          <label className="space-y-1 text-sm">
                            <span className="text-xs uppercase tracking-[0.12em] text-muted">
                              Round trip
                            </span>
                            <MoneyInput
                              key={"rt-" + entry.row.uid + "-" + entry.row.roundTripPriceCents}
                              name="fareRoundTripPriceAud"
                              required
                              defaultValue={(
                                entry.row.roundTripPriceCents / 100
                              ).toFixed(2)}
                              className={fieldClass}
                            />
                          </label>
                          <div className="flex items-end justify-end">
                            <button
                              type="button"
                              onClick={() => removeFareRow(entry.index)}
                              className="tap-target text-xs font-medium text-muted/80 transition hover:text-accent-red"
                            >
                              Remove
                            </button>
                          </div>
                          {editing ? (
                            <label className="space-y-1 text-sm sm:col-span-2">
                              <span className="text-xs uppercase tracking-[0.12em] text-muted">
                                Seats still for sale
                              </span>
                              <input
                                name="fareRemainingSeats"
                                type="number"
                                min={0}
                                required
                                value={entry.row.remainingSeats}
                                onChange={(e) =>
                                  updateFareRow(entry.index, {
                                    remainingSeats: Number(e.target.value),
                                  })
                                }
                                className={fieldClass}
                              />
                            </label>
                          ) : (
                            <input
                              type="hidden"
                              name="fareRemainingSeats"
                              value={entry.row.totalSeats}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-3 sm:col-span-2">
              {flightSticky.formError ? (
                <div className="w-full">
                  <Alert tone="danger">{flightSticky.formError}</Alert>
                </div>
              ) : null}
              <SubmitButton
                pending={flightSticky.pending}
                pendingLabel={editing ? "Saving…" : "Publishing…"}
                className="btn-grad inline-flex min-h-10 items-center rounded-control px-5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {editing ? "Save changes" : "Publish flight"}
              </SubmitButton>
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  selectTab("flights");
                }}
                className="inline-flex min-h-10 items-center rounded-control border border-line bg-surface px-5 text-sm font-medium text-muted transition-colors hover:border-accent/60 hover:text-foreground"
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

          <div className="rounded-card border border-line bg-surface p-5 shadow-ui-sm sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
              Walk-in
            </p>
            <h3 className="mt-1.5 text-base font-semibold text-foreground">
              Book for a client
            </h3>
            <p className="mt-1 text-sm text-muted">
              Counter / phone bookings. Cash or card = confirmed immediately.
              Bank transfer = unpaid seat hold until the expiry you set. Choose
              GST mode below — it is written onto the invoice. Docs are not
              emailed automatically.
            </p>
            <form
              key={walkInFormKey}
              onSubmit={walkInSticky.onSubmit}
              data-skip-busy
              className="mt-6 grid gap-4 sm:grid-cols-2"
            >
              <FormSection
                title="Flight"
                description="Pick the departure, then the cabin and fare this booking is sold on."
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
                    setWalkInReturnDate("");
                    setWalkInTripType("one_way");
                  }}
                  placeholder="Select outbound flight"
                  searchPlaceholder="Flight number, route, date…"
                  options={bookableFlightOptions}
                />
              </label>
              {walkInOutboundChoice === CUSTOM_FLIGHT_VALUE && (
                <CustomFlightFields
                  prefix="outbound"
                  fieldErrors={walkInSticky.fieldErrors}
                />
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
                        setWalkInReturnDate("");
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
                  {walkInTripType === "round_trip" && walkInCanAutoRoundTrip && walkInPairedReturn ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-line bg-background/60 px-3 py-2.5">
                      <p className="text-xs text-muted">
                        Suggested paired return:{" "}
                        <span className="font-medium text-foreground">
                          {walkInPairedReturn.airline}{" "}
                          {walkInPairedReturn.flightNumber}
                        </span>{" "}
                        · {walkInPairedReturn.origin}→
                        {walkInPairedReturn.destination} ·{" "}
                        {formatFlightDateTime(walkInPairedReturn.departureAt)}
                      </p>
                      {walkInReturnChoice !== walkInPairedReturn.id ? (
                        <button
                          type="button"
                          onClick={() => {
                            setWalkInReturnDate(
                              toFlightYmd(walkInPairedReturn.departureAt),
                            );
                            setWalkInReturnChoice(walkInPairedReturn.id);
                          }}
                          className="text-xs font-medium text-accent underline-offset-2 hover:underline"
                        >
                          Use the paired return
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}

              {walkInTripType === "round_trip" && walkInOutboundChoice ? (
                <>
                  <label className="space-y-1 text-sm sm:col-span-2">
                    <span className="text-xs uppercase tracking-[0.12em] text-muted">
                      Return flight
                    </span>
                    <Combobox
                      name="returnFlightId"
                      required
                      value={walkInReturnChoice}
                      onChange={(id) => {
                        setWalkInReturnChoice(id);
                        if (id && id !== CUSTOM_FLIGHT_VALUE) {
                          const selected = flights.find((f) => f.id === id);
                          if (selected) {
                            setWalkInReturnDate(
                              toFlightYmd(selected.departureAt),
                            );
                          }
                        }
                      }}
                      placeholder="Select return flight"
                      searchPlaceholder="Flight number, route, date…"
                      options={walkInReturnOptions}
                    />
                    <span className="block text-xs text-muted">
                      {walkInReturnFlights.length === 0
                        ? "No reverse-route flights after this outbound. Use a custom flight if needed."
                        : `${walkInReturnFlights.length} return flight${
                            walkInReturnFlights.length === 1 ? "" : "s"
                          } on the reverse route${
                            walkInReturnDateSummary.length > 0
                              ? ` · ${walkInReturnDateSummary.join(", ")}`
                              : ""
                          }. Open the list to see every option.`}
                    </span>
                  </label>
                  <DateTimePicker
                    name="returnDateFilter"
                    label="Narrow by return date"
                    showTime={false}
                    value={walkInReturnDate}
                    onChange={setWalkInReturnDate}
                    min={
                      walkInOutboundFlight
                        ? toFlightYmd(walkInOutboundFlight.departureAt)
                        : undefined
                    }
                    wrapperClassName="sm:col-span-2"
                    helper={
                      walkInReturnDate
                        ? `${walkInReturnDateMatchCount} flight${
                            walkInReturnDateMatchCount === 1 ? "" : "s"
                          } on this date are listed first — every other return stays in the list.`
                        : "Optional. Matching flights move to the top of the list; every other return stays visible."
                    }
                  />
                  {walkInReturnDate ? (
                    <button
                      type="button"
                      onClick={() => setWalkInReturnDate("")}
                      className="text-xs font-medium text-accent underline-offset-2 hover:underline sm:col-span-2"
                    >
                      Show all return dates
                    </button>
                  ) : null}
                </>
              ) : null}
              {walkInTripType === "round_trip" &&
                walkInReturnChoice === CUSTOM_FLIGHT_VALUE && (
                  <CustomFlightFields
                    prefix="return"
                    fieldErrors={walkInSticky.fieldErrors}
                  />
                )}
              <SegmentedField
                name="cabinClass"
                label="Cabin"
                className="sm:col-span-2"
                value={walkInCabin}
                onChange={(next) => {
                  setWalkInCabin(next as CabinClass);
                  // Tier options are cabin-specific; drop a now-mismatched pick.
                  setWalkInFareProductId("");
                }}
                options={[
                  {
                    value: "economy",
                    label: "Economy",
                    hint: walkInCabinHint("economy"),
                  },
                  {
                    value: "business",
                    label: "Business",
                    hint: walkInCabinHint("business"),
                  },
                ]}
              />
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
              <details className="group sm:col-span-2">
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm font-medium text-accent [&::-webkit-details-marker]:hidden">
                  <span aria-hidden className="transition-transform group-open:rotate-180">
                    ▾
                  </span>
                  Override the price
                </summary>
                <label className="mt-3 block space-y-1 text-sm">
                  <span className="text-xs uppercase tracking-[0.12em] text-muted">
                    Custom total price (AUD)
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
              </details>
              <input
                type="hidden"
                name="tzOffsetMinutes"
                value={new Date().getTimezoneOffset()}
              />
              </FormSection>

              <FormSection
                title="Travellers"
                description="The lead contact receives the confirmation email; everyone else is listed on the documents."
              >
              <div className="sm:col-span-2 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                  Primary passenger (contact)
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="text-xs uppercase tracking-[0.12em] text-muted">
                      Passenger name
                    </span>
                    <input
                      name="passengerName"
                      required
                      data-field-key="passengerName"
                      aria-invalid={
                        walkInSticky.fieldErrors.passengerName ? true : undefined
                      }
                      className={labeledControlClass(
                        fieldClass,
                        walkInSticky.fieldErrors.passengerName,
                      )}
                    />
                    <FieldError error={walkInSticky.fieldErrors.passengerName} />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-xs uppercase tracking-[0.12em] text-muted">
                      Email
                    </span>
                    <input
                      name="email"
                      type="email"
                      required
                      data-field-key="email"
                      aria-invalid={
                        walkInSticky.fieldErrors.email ? true : undefined
                      }
                      className={labeledControlClass(
                        fieldClass,
                        walkInSticky.fieldErrors.email,
                      )}
                    />
                    <FieldError error={walkInSticky.fieldErrors.email} />
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
                  fieldErrors={walkInSticky.fieldErrors}
                  description="Extra adults each get a seat and use the adult fare. Listed on travel docs and invoice."
                />
                <PassengerGroupFields
                  type="child"
                  prefix="child"
                  items={walkInChildren}
                  onChange={setWalkInChildren}
                  canChangeCount
                  priceMode="auto"
                  autoPriceAud={walkInChildPriceAud}
                  fieldErrors={walkInSticky.fieldErrors}
                  description="Children get a seat at 75% of the adult fare. Date of birth is required — 2–11 years old on the departure date."
                />
                <PassengerGroupFields
                  type="infant"
                  prefix="infant"
                  items={walkInInfants}
                  onChange={setWalkInInfants}
                  canChangeCount
                  priceMode="auto"
                  autoPriceAud={walkInInfantPriceAud}
                  fieldErrors={walkInSticky.fieldErrors}
                  description="Infants get a ticket at 10% of the adult fare but no seat. Date of birth is required — under 2 years on the departure date."
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
                  {walkInAdultUnitCents > 0 ? (
                    <>
                      {" "}
                      · Party fare:{" "}
                      <span className="font-medium text-foreground">
                        {formatAud(walkInPartyTotalCents)}
                      </span>
                      <span className="text-xs">
                        {" "}
                        ({formatAud(walkInAdultUnitCents)} adult ·{" "}
                        {formatAud(childFareCents(walkInAdultUnitCents))} child ·{" "}
                        {formatAud(infantFareCents(walkInAdultUnitCents))}{" "}
                        infant)
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
              </FormSection>

              <FormSection
                title="Payment"
                description="Cash and card are marked paid immediately. Bank transfer holds the seats until the expiry you set."
              >
              <label className="space-y-1 text-sm">
                <span className="text-xs uppercase tracking-[0.12em] text-muted">
                Extra bags
              </span>
              <input
                name="extraBaggageKg"
                type="number"
                min={0}
                max={20}
                value={walkInExtraBags}
                onChange={(e) =>
                  setWalkInExtraBags(
                    Math.min(20, Math.max(0, Number(e.target.value) || 0)),
                  )
                }
                className={fieldClass}
              />
              <span className="block text-xs text-muted">
                ${EXTRA_BAG_AUD.toFixed(2)} each
                {walkInExtraBags > 0
                  ? ` · ${formatAud(extraBaggageCentsForBags(walkInExtraBags))}`
                  : ""}
              </span>
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
                value={walkInPaymentMethod}
                onChange={(next) =>
                  setWalkInPaymentMethod(
                    next as "cash" | "card" | "bank_transfer",
                  )
                }
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
                    hint: "Unpaid seat hold until the expiry you set below.",
                  },
                ]}
              />
              {walkInPaymentMethod === "bank_transfer" ? (
                <DateTimePicker
                  name="holdExpiresAt"
                  label="Seat hold expires"
                  required
                  wrapperClassName="sm:col-span-2"
                  error={walkInSticky.fieldErrors.holdExpiresAt}
                  defaultValue={toDateTimeLocalValue(
                    bankHoldExpiresAt(new Date(), 48),
                  )}
                  helper={
                    walkInSticky.fieldErrors.holdExpiresAt
                      ? undefined
                      : "Seats stay reserved until this time. Not shown on the invoice — set an invoice due date separately if needed."
                  }
                />
              ) : null}
              <details className="group sm:col-span-2">
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm font-medium text-accent [&::-webkit-details-marker]:hidden">
                  <span aria-hidden className="transition-transform group-open:rotate-180">
                    ▾
                  </span>
                  GST options
                </summary>
                <div className="mt-3 space-y-4">
                  <GstModeFields defaultMode="none" />
                  <label className="block space-y-1 text-sm">
                    <span className="text-xs uppercase tracking-[0.12em] text-muted">
                      Custom GST (AUD)
                    </span>
                    <MoneyInput
                      name="customGstAud"
                      defaultValue=""
                      className={fieldClass}
                    />
                    <span className="block text-xs text-muted">
                      Leave blank to use None / Exclusive / Inclusive above.
                      Enter an amount to set GST exactly (added on top of the
                      fare).
                    </span>
                  </label>
                </div>
              </details>
              </FormSection>

              <div className="sm:col-span-2 space-y-3">
                {walkInSticky.formError ? (
                  <Alert tone="danger">{walkInSticky.formError}</Alert>
                ) : null}
                <SubmitButton
                  pending={walkInSticky.pending}
                  pendingLabel="Creating booking…"
                  className="btn-grad inline-flex min-h-10 items-center rounded-control px-5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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
            <TableWrap>
              <Table className="min-w-[1040px]">
                <THead>
                  <Tr>
                    <Th>
                      <SelectAllCheckbox
                        allSelected={bookingBulk.allSelected}
                        someSelected={bookingBulk.someSelected}
                        onToggle={bookingBulk.toggleAll}
                      />
                    </Th>
                    <Th>Ref</Th>
                    <Th>Status</Th>
                    <Th>Payment</Th>
                    <Th>Source</Th>
                    <Th>Customer</Th>
                    <Th>Cabin</Th>
                    <Th>Flights</Th>
                    <Th align="right">Amount</Th>
                    <Th align="right">Actions</Th>
                  </Tr>
                </THead>
                <TBody>
                  {visibleBookings.map((b) => (
                    <Tr key={b.id}>
                      <Td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${b.bookingRef}`}
                          checked={bookingBulk.selected.has(b.id)}
                          onChange={() => bookingBulk.toggle(b.id)}
                          className="size-4 accent-accent-deep"
                        />
                      </Td>
                      <Td>
                        <p className="font-medium">{b.bookingRef}</p>
                        <p className="text-xs text-muted">{b.ticketNumber}</p>
                      </Td>
                      <Td>
                        <Badge
                          tone={
                            b.status === "confirmed"
                              ? "success"
                              : b.status === "pending_payment"
                                ? "info"
                                : "neutral"
                          }
                        >
                          {b.status.replaceAll("_", " ")}
                        </Badge>
                        {b.holdExpiresAt && b.status === "pending_payment" ? (
                          <p className="mt-1 text-xs text-muted">
                            Hold until{" "}
                            {new Date(b.holdExpiresAt).toLocaleString("en-AU")}
                          </p>
                        ) : null}
                      </Td>
                      <Td muted>
                        {b.paymentMethod === "card"
                          ? "Credit card"
                          : b.paymentMethod === "bank_transfer"
                            ? "Bank transfer"
                            : b.paymentMethod === "cash"
                              ? "Cash"
                              : "—"}
                      </Td>
                      <Td muted>
                        {b.source === "walk_in" ? "Walk-in" : "Online"}
                      </Td>
                      <Td>
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
                            kids > 0
                              ? `${kids} ${kids === 1 ? "child" : "children"}`
                              : null,
                            infants > 0
                              ? `${infants} infant${infants === 1 ? "" : "s"}`
                              : null,
                          ].filter(Boolean);
                          return parts.length ? (
                            <p className="text-xs text-muted">
                              {parts.join(" · ")}
                            </p>
                          ) : null;
                        })()}
                      </Td>
                      <Td muted>
                        {b.flight.cabinClass === "business"
                          ? "Business"
                          : "Economy"}
                      </Td>
                      <Td muted>
                        {b.flight.flightNumber} {b.flight.origin}→
                        {b.flight.destination}
                        {b.returnFlight
                          ? ` · ${b.returnFlight.flightNumber} ${b.returnFlight.origin}→${b.returnFlight.destination}`
                          : ""}
                        {b.extraBaggageKg > 0 ? (
                          <p className="mt-0.5 text-xs text-muted">
                            +{b.extraBaggageKg} extra bag
                            {b.extraBaggageKg === 1 ? "" : "s"}
                          </p>
                        ) : null}
                      </Td>
                      <Td align="right" numeric className="font-medium">
                        {formatAud(b.amountPaidCents)}
                      </Td>
                      <Td align="right">
                        {/*
                          One visible action per row — the rest fold into the
                          overflow menu. Every form, handler and confirm() is
                          the same, only its position changed.
                        */}
                        <div className="flex items-center justify-end gap-1">
                          {b.status !== "cancelled" ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setEditingBookingId(b.id)}
                            >
                              Edit
                            </Button>
                          ) : null}

                          <Menu label={`Actions for ${b.bookingRef}`}>
                            {b.paymentMethod === "bank_transfer" &&
                            b.status === "pending_payment" ? (
                              <MenuItem>
                                <form action={markBookingPaidAction}>
                                  <input type="hidden" name="id" value={b.id} />
                                  <SubmitButton pendingLabel="Confirming…">
                                    Mark paid
                                  </SubmitButton>
                                </form>
                              </MenuItem>
                            ) : null}
                            {b.paymentMethod === "bank_transfer" &&
                            b.status === "confirmed" ? (
                              <MenuItem>
                                <form action={markBookingUnpaidAction}>
                                  <input type="hidden" name="id" value={b.id} />
                                  <SubmitButton pendingLabel="Updating…">
                                    Mark unpaid
                                  </SubmitButton>
                                </form>
                              </MenuItem>
                            ) : null}
                            {b.paymentMethod === "card" ||
                            b.paymentMethod === "cash" ? (
                              <p className="px-3 py-2 text-xs text-muted">
                                Paid automatically at booking.
                              </p>
                            ) : null}
                            {b.status === "hold_expired" ? (
                              <p className="px-3 py-2 text-xs text-accent-red">
                                Hold expired — seats returned.
                              </p>
                            ) : null}

                            <MenuDivider />
                            <MenuItem tone="danger">
                              <form action={deleteBookingAction}>
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
                                >
                                  Delete
                                </SubmitButton>
                              </form>
                            </MenuItem>
                          </Menu>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
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

      </AdminShell>

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
            holdExpiresAt: editingBooking.holdExpiresAt,
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
