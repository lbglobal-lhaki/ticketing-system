import { createHash, timingSafeEqual } from "crypto";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/AdminDashboard";
import { SubmitButton } from "@/components/SubmitButton";
import {
  clearAdminSessionCookie,
  isAdminAuthed,
  setAdminSessionCookie,
} from "@/lib/adminAuth";
import {
  clearAdminLoginFailures,
  getAdminLoginClientIp,
  getAdminLoginThrottle,
  recordAdminLoginFailure,
} from "@/lib/adminLoginRateLimit";
import { getSystemAnalytics } from "@/lib/analytics/systemAnalytics";
import { expireStaleHoldsForAdminLoad } from "@/lib/booking/expireHolds";
import { prisma } from "@/lib/db";
import { listAllCharterFareProductsAdmin } from "@/lib/fares/charter";
import { adminLoginSchema } from "@/lib/validation";

// Walk-in confirmations and invoice resends generate PDF attachments via
// headless Chromium, which can take longer than the platform default.
export const maxDuration = 60;

/** Fixed-length digest compare — avoids leaking password length via early return. */
function passwordMatches(input: string, expected: string) {
  const a = createHash("sha256").update(`admin-pw:${input}`).digest();
  const b = createHash("sha256").update(`admin-pw:${expected}`).digest();
  return timingSafeEqual(a, b);
}

function parseTab(
  value?: string,
):
  | "analytics"
  | "flights"
  | "form"
  | "fares"
  | "bookings"
  | "invoices"
  | "cargo"
  | "deleted"
  | undefined {
  if (
    value === "analytics" ||
    value === "flights" ||
    value === "form" ||
    value === "fares" ||
    value === "bookings" ||
    value === "invoices" ||
    value === "cargo" ||
    value === "deleted"
  ) {
    return value;
  }
  return undefined;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    saved?: string;
    tab?: string;
    count?: string;
  }>;
}) {
  const params = await searchParams;
  const authed = await isAdminAuthed();

  async function login(formData: FormData) {
    "use server";
    const ip = await getAdminLoginClientIp();
    const throttle = await getAdminLoginThrottle(ip);
    if (!throttle.ok) {
      redirect(
        `/admin?error=${encodeURIComponent(throttle.message)}`,
      );
    }

    const parsed = adminLoginSchema.safeParse({
      password: formData.get("password"),
    });
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) {
      redirect("/admin?error=ADMIN_PASSWORD+is+not+configured");
    }
    if (!parsed.success || !passwordMatches(parsed.data.password, expected)) {
      await recordAdminLoginFailure(ip);
      redirect("/admin?error=Invalid+password");
    }
    await clearAdminLoginFailures(ip);
    await setAdminSessionCookie();
    redirect("/admin?tab=flights");
  }

  async function logout() {
    "use server";
    await clearAdminSessionCookie();
    redirect("/admin");
  }

  if (!authed) {
    return (
      <main className="relative flex min-h-[calc(100svh-4rem)] items-center justify-center overflow-hidden px-4 py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `
              radial-gradient(ellipse at 15% 20%, rgba(37, 99, 235, 0.18), transparent 45%),
              radial-gradient(ellipse at 85% 80%, rgba(220, 38, 38, 0.1), transparent 40%),
              linear-gradient(165deg, #F8FAFC 0%, #FFFFFF 55%, #EEF2FF 100%)
            `,
          }}
        />
        <div className="relative w-full max-w-md">
          <div className="flex items-center gap-3">
            <img
              src="/drukair_logo.png"
              alt=""
              width={40}
              height={40}
              className="size-10 object-contain"
            />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              {process.env.NEXT_PUBLIC_BRAND_SHORT_NAME || "L&B Global"}
            </p>
          </div>
          <h1 className="heading-gradient mt-3 font-[family-name:var(--font-syne)] text-4xl font-semibold tracking-tight">
            Operations
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Sign in to manage flights, fixed ticket prices, bookings, and cargo.
          </p>
          <form
            action={login}
            className="glass-panel mt-8 space-y-5 rounded-2xl p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]"
          >
            <label className="block space-y-2 text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                Password
              </span>
              <input
                type="password"
                name="password"
                placeholder="Enter admin password"
                required
                className="w-full border-0 border-b border-line bg-transparent py-3 outline-none transition focus:border-accent"
              />
            </label>
            <SubmitButton
              pendingLabel="Signing in…"
              className="btn-cta w-full rounded-xl py-3.5 text-sm tracking-wide disabled:cursor-not-allowed disabled:opacity-70"
            >
              Enter dashboard
            </SubmitButton>
          </form>
          {params.error && (
            <p className="mt-4 text-sm text-red-700">
              {decodeURIComponent(params.error)}
            </p>
          )}
        </div>
      </main>
    );
  }

  // Best-effort hold expiry — never block dashboard TTFB on it. The hourly
  // cron is the source of truth; this is just a warm-up for ops sessions.
  void expireStaleHoldsForAdminLoad();

  const [
    flights,
    bookings,
    invoices,
    cargoSubmissions,
    deletedRecords,
    analytics,
    charterFares,
  ] = await Promise.all([
      prisma.flight.findMany({
        orderBy: [{ active: "desc" }, { departureAt: "asc" }],
        include: { fareReleases: { orderBy: { sortOrder: "asc" } } },
      }),
      prisma.booking.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          flight: true,
          returnFlight: true,
          // A flight sells both cabins — the booked one is its fare release's.
          fareRelease: { select: { cabinClass: true } },
          invoice: { select: { id: true, status: true } },
          passengers: { orderBy: { sortOrder: "asc" } },
        },
      }),
      prisma.invoice.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          booking: {
            select: {
              bookingRef: true,
              passportNumber: true,
              nationality: true,
              extraBaggageKg: true,
              fareRelease: { select: { cabinClass: true } },
            },
          },
        },
      }),
      prisma.cargoSubmission.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.deletedRecord.findMany({
        orderBy: { deletedAt: "desc" },
        take: 300,
        // Snapshots are large JSON blobs — load on demand when ops expand a row.
        select: {
          id: true,
          entityType: true,
          entityId: true,
          label: true,
          summary: true,
          deletedAt: true,
          deletedBy: true,
        },
      }),
      getSystemAnalytics(),
      listAllCharterFareProductsAdmin(),
    ]);

  const SAVED_MESSAGES: Record<string, string> = {
    added: "Flight added — customers can now see it.",
    updated: "Flight details saved.",
    price: "Ticket price updated.",
    removed: "Flight removed from the website.",
    restored: "Flight is visible to customers again.",
    deleted: "Flight deleted permanently — logged in the Deleted tab.",
    "flights-deleted": "Flights deleted permanently — logged in the Deleted tab.",
    "invoice-paid":
      "Invoice marked paid. No email was sent — use Travel doc / Invoice to send it.",
    "invoice-unpaid": "Invoice marked unpaid.",
    "invoice-sent":
      "Invoice email sent (or marked sent if email is not configured).",
    "travel-doc-sent": "Travel document emailed to the customer.",
    "airfare-invoice-sent":
      "Airfare invoice emailed (or marked sent if accounts email is not configured).",
    "invoice-updated": "Invoice document fields saved.",
    "invoice-generated": "Invoice document fields generated / refreshed.",
    "invoice-deleted": "Invoice deleted — logged in the Deleted tab.",
    "invoices-deleted": "Invoices deleted — logged in the Deleted tab.",
    "booking-paid":
      "Bank transfer marked paid. No email was sent — send documents from the Invoices tab.",
    "booking-unpaid": "Booking marked unpaid — seat hold restored.",
    "booking-updated": "Booking saved.",
    "booking-deleted":
      "Booking (and its invoice, if any) deleted — logged in the Deleted tab.",
    "bookings-deleted":
      "Bookings (and their invoices, if any) deleted — logged in the Deleted tab.",
    "walk-in":
      "Walk-in booking created. Edit and send documents from the Invoices tab when ready.",
    "fare-updated": "Charter fare product saved.",
    "cargo-updated": "Cargo submission updated.",
    "cargo-created": "Cargo enquiry created.",
    "cargo-deleted": "Cargo enquiry deleted — logged in the Deleted tab.",
    "cargo-bulk-deleted": "Cargo enquiries deleted — logged in the Deleted tab.",
    "cargo-paid": "Cargo marked as paid.",
    "cargo-unpaid": "Cargo marked as unpaid.",
    "deleted-record-purged":
      "Entry purged permanently — freed from the database.",
    "deleted-records-purged":
      "Entries purged permanently — freed from the database.",
  };
  const savedMessage =
    params.saved === "bulk-price"
      ? `Price applied to ${params.count ?? "0"} fare release(s) across matching flights.`
      : params.saved
        ? (SAVED_MESSAGES[params.saved] ?? null)
        : null;

  // Prefer explicit ?tab= — action redirects already include the right tab.
  // Do not infer tab from leftover ?saved= (that caused refresh jumps).
  const initialTab = parseTab(params.tab) ?? "analytics";

  return (
    <main className="admin-ui min-h-[calc(100svh-4rem)] [background-image:var(--grad-admin-page)]">
      <div className="accent-top border-b border-line bg-surface/85 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-[100rem] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              src="/drukair_logo.png"
              alt=""
              width={28}
              height={28}
              className="size-7 shrink-0 object-contain"
            />
            <p className="truncate text-xs font-semibold uppercase tracking-[0.14em]">
              <span className="heading-gradient">
                {process.env.NEXT_PUBLIC_BRAND_SHORT_NAME || "L&B Global"}
              </span>
              <span className="text-muted/70"> · Operations</span>
            </p>
          </div>
          <form action={logout}>
            <SubmitButton
              pendingLabel="Signing out…"
              className="inline-flex min-h-10 items-center rounded-control border border-line bg-surface px-3.5 text-sm font-medium text-muted transition-colors hover:border-accent/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              Sign out
            </SubmitButton>
          </form>
        </div>
      </div>

      <div>
        <div>
          <Suspense
            fallback={
              <p className="text-sm text-muted">Loading dashboard…</p>
            }
          >
          <AdminDashboard
            initialTab={initialTab}
            savedMessage={savedMessage}
            errorMessage={
              params.error ? decodeURIComponent(params.error) : null
            }
            analytics={analytics}
            charterFares={charterFares.map((f) => ({
              id: f.id,
              code: f.code,
              name: f.name,
              cabinClass: f.cabinClass as "economy" | "business",
              sortOrder: f.sortOrder,
              priceCents: f.priceCents,
              roundTripPriceCents: f.roundTripPriceCents ?? 0,
              updatedAt: f.updatedAt.toISOString(),
              tagline: f.tagline,
              recommended: f.recommended,
              mostPopular: f.mostPopular,
              active: f.active,
              flightChangeLabel: f.flightChangeLabel,
              refundLabel: f.refundLabel,
              checkedBaggage: f.checkedBaggage,
              cabinBaggage: f.cabinBaggage,
              seatSelection: f.seatSelection,
              mealLabel: f.mealLabel,
              frequentFlyerLabel: f.frequentFlyerLabel,
              priorityCheckIn: f.priorityCheckIn,
              priorityBoarding: f.priorityBoarding,
              changePermitted: f.changePermitted,
              changeFeeLabel: f.changeFeeLabel,
              refundPermitted: f.refundPermitted,
              refundFeeLabel: f.refundFeeLabel,
              perkLines: Array.isArray(f.perkLines)
                ? (f.perkLines as string[])
                : [],
              changeBullets: Array.isArray(f.changeBullets)
                ? (f.changeBullets as string[])
                : [],
              refundBullets: Array.isArray(f.refundBullets)
                ? (f.refundBullets as string[])
                : [],
              baggageBullets: Array.isArray(f.baggageBullets)
                ? (f.baggageBullets as string[])
                : [],
              notes: f.notes,
            }))}
            flights={flights.map((f) => ({
              id: f.id,
              airline: f.airline,
              flightNumber: f.flightNumber,
              origin: f.origin,
              destination: f.destination,
              departureAt: f.departureAt.toISOString(),
              arrivalAt: f.arrivalAt.toISOString(),
              totalSeats: f.totalSeats,
              remainingSeats: f.remainingSeats,
              active: f.active,
              returnLegFlightId: f.returnLegFlightId,
              fareReleases: f.fareReleases.map((r) => ({
                id: r.id,
                cabinClass: r.cabinClass as "economy" | "business",
                name: r.name,
                sortOrder: r.sortOrder,
                totalSeats: r.totalSeats,
                remainingSeats: r.remainingSeats,
                priceCents: r.priceCents,
                roundTripPriceCents: r.roundTripPriceCents,
              })),
            }))}
            bookings={bookings.map((b) => ({
              id: b.id,
              bookingRef: b.bookingRef,
              ticketNumber: b.ticketNumber,
              tripType: b.tripType,
              passengerName: b.passengerName,
              email: b.email,
              passengerPhone: b.passengerPhone,
              passportNumber: b.passportNumber,
              nationality: b.nationality,
              seatsBooked: b.seatsBooked,
              amountPaidCents: b.amountPaidCents,
              fareReleaseName: b.fareReleaseName,
              extraBaggageKg: b.extraBaggageKg,
              status: b.status,
              paymentMethod: b.paymentMethod,
              source: b.source,
              holdExpiresAt: b.holdExpiresAt?.toISOString() ?? null,
              createdAt: b.createdAt.toISOString(),
              invoiceId: b.invoice?.id ?? null,
              invoiceStatus: b.invoice?.status ?? null,
              passengers: b.passengers.map((p) => ({
                fullName: p.fullName,
                email: p.email,
                phone: p.phone,
                passportNumber: p.passportNumber,
                nationality: p.nationality,
                ticketNumber: p.ticketNumber,
                returnTicketNumber: p.returnTicketNumber,
                bookingRef: p.bookingRef,
                passengerType: p.passengerType as
                  | "adult"
                  | "child"
                  | "infant",
                dateOfBirth: p.dateOfBirth?.toISOString() ?? null,
                priceCents: p.priceCents,
                allocatesSeat: p.allocatesSeat,
              })),
              flight: {
                flightNumber: b.flight.flightNumber,
                origin: b.flight.origin,
                destination: b.flight.destination,
                cabinClass: (b.fareRelease?.cabinClass ?? "economy") as
                  | "economy"
                  | "business",
              },
              returnFlight: b.returnFlight
                ? {
                    flightNumber: b.returnFlight.flightNumber,
                    origin: b.returnFlight.origin,
                    destination: b.returnFlight.destination,
                  }
                : null,
            }))}
            invoices={invoices.map((invoice) => ({
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              status: invoice.status,
              paymentMethod: invoice.paymentMethod,
              amountCents: invoice.amountCents,
              fareCents: invoice.fareCents,
              serviceFeeCents: invoice.serviceFeeCents,
              airfareCents: invoice.airfareCents,
              airportTaxesCents: invoice.airportTaxesCents,
              extraBaggageCents: invoice.extraBaggageCents,
              extraBaggageKg: invoice.booking.extraBaggageKg,
              travelInsuranceCents: invoice.travelInsuranceCents,
              otherChargesCents: invoice.otherChargesCents,
              gstRateBps: invoice.gstRateBps,
              gstIncluded: invoice.gstIncluded,
              gstOverrideCents: invoice.gstOverrideCents,
              accountNumber: invoice.accountNumber,
              businessTpn: invoice.businessTpn,
              routeLabel: invoice.routeLabel,
              seatLabel: invoice.seatLabel,
              nameRef: invoice.nameRef,
              endorsementText: invoice.endorsementText,
              fareCalculationLine: invoice.fareCalculationLine,
              customerName: invoice.customerName,
              customerEmail: invoice.customerEmail,
              customerPhone: invoice.customerPhone,
              passportNumber: invoice.booking.passportNumber || "",
              nationality: invoice.booking.nationality || "",
              notes: invoice.notes,
              bankReference: invoice.bankReference,
              stripePaymentIntentId: invoice.stripePaymentIntentId,
              dueAt: invoice.dueAt?.toISOString() ?? null,
              sentAt: invoice.sentAt?.toISOString() ?? null,
              travelDocSentAt: invoice.travelDocSentAt?.toISOString() ?? null,
              paidAt: invoice.paidAt?.toISOString() ?? null,
              markedPaidByAdmin: invoice.markedPaidByAdmin,
              createdAt: invoice.createdAt.toISOString(),
              bookingRef: invoice.booking.bookingRef,
              bookingId: invoice.bookingId,
              cabinClass: (invoice.booking.fareRelease?.cabinClass ??
                "economy") as "economy" | "business",
            }))}
            deletedRecords={deletedRecords.map((row) => ({
              id: row.id,
              entityType: row.entityType,
              entityId: row.entityId,
              label: row.label,
              summary: row.summary,
              deletedAt: row.deletedAt.toISOString(),
              deletedBy: row.deletedBy,
              snapshot: null,
            }))}
            cargoSubmissions={cargoSubmissions.map((row) => {
              const answers =
                row.answers &&
                typeof row.answers === "object" &&
                !Array.isArray(row.answers)
                  ? (row.answers as Record<
                      string,
                      string | number | boolean | string[]
                    >)
                  : {};
              return {
                id: row.id,
                parcelNumber: row.parcelNumber,
                status: row.status,
                paid: row.paid,
                paidAt: row.paidAt?.toISOString() ?? null,
                submitterName: row.submitterName,
                email: row.email,
                phone: row.phone,
                answers,
                notes: row.notes,
                googleResponseId: row.googleResponseId,
                submittedAt: row.submittedAt?.toISOString() ?? null,
                createdAt: row.createdAt.toISOString(),
              };
            })}
          />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
