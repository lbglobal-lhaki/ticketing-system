"use client";

import type { SystemAnalytics } from "@/lib/analytics/systemAnalytics";
import { formatAud } from "@/lib/pricing";
import { StatCard as UiStatCard } from "@/components/ui/StatCard";

function StatCard(props: { label: string; value: string; hint?: string }) {
  return <UiStatCard {...props} />;
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export function SystemAnalyticsSection({
  analytics,
}: {
  analytics: SystemAnalytics;
}) {
  const { flights, bookings, sales, payments, cargo } = analytics;

  return (
    <section className="space-y-8">
      {/* Hero row — the four numbers ops actually check on arrival. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Confirmed sales"
          value={formatAud(sales.revenueCents)}
          hint={
            sales.avgTicketCents
              ? `Avg ticket ${formatAud(sales.avgTicketCents)}`
              : "No confirmed bookings yet"
          }
        />
        <StatCard
          label="Pending payments"
          value={formatAud(sales.pendingCents)}
          hint={`${payments.bankPendingBookings} bank holds · ${payments.unpaidInvoices} unpaid invoices`}
        />
        <StatCard
          label="Tickets sold"
          value={String(bookings.ticketsSold)}
          hint={`${bookings.confirmed} confirmed · ${bookings.pendingPayment} pending`}
        />
        <StatCard
          label="Active flights"
          value={String(flights.active)}
          hint={`${flights.upcoming} upcoming · ${flights.inactive} hidden`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-card border border-line bg-surface p-5 shadow-ui-sm">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
            Flights & seats
          </h3>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted">Total flights</dt>
              <dd className="font-semibold">{flights.total}</dd>
            </div>
            <div>
              <dt className="text-muted">Seats remaining</dt>
              <dd className="font-semibold">{flights.seatsRemaining}</dd>
            </div>
            <div>
              <dt className="text-muted">Seats sold (capacity)</dt>
              <dd className="font-semibold">{flights.seatsSold}</dd>
            </div>
            <div>
              <dt className="text-muted">Upcoming departures</dt>
              <dd className="font-semibold">{flights.upcoming}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-card border border-line bg-surface p-5 shadow-ui-sm">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
            Bookings
          </h3>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted">Total</dt>
              <dd className="font-semibold">{bookings.total}</dd>
            </div>
            <div>
              <dt className="text-muted">Online / walk-in</dt>
              <dd className="font-semibold">
                {bookings.online} / {bookings.walkIn}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Cancelled</dt>
              <dd className="font-semibold">{bookings.cancelled}</dd>
            </div>
            <div>
              <dt className="text-muted">Hold expired</dt>
              <dd className="font-semibold">{bookings.holdExpired}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-card border border-line bg-surface p-5 shadow-ui-sm">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
            Invoices & payments
          </h3>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted">Paid invoices</dt>
              <dd className="font-semibold">
                {payments.paidInvoices} · {formatAud(sales.paidInvoiceCents)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Unpaid invoices</dt>
              <dd className="font-semibold">
                {payments.unpaidInvoices} · {formatAud(sales.unpaidInvoiceCents)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Card-paid bookings</dt>
              <dd className="font-semibold">{payments.cardPaidBookings}</dd>
            </div>
            <div>
              <dt className="text-muted">Bank pending</dt>
              <dd className="font-semibold">{payments.bankPendingBookings}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-card border border-line bg-surface p-5 shadow-ui-sm">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
            Cargo
          </h3>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted">Total enquiries</dt>
              <dd className="font-semibold">{cargo.total}</dd>
            </div>
            <div>
              <dt className="text-muted">New / reviewed / closed</dt>
              <dd className="font-semibold">
                {cargo.newCount} / {cargo.reviewed} / {cargo.closed}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Paid</dt>
              <dd className="font-semibold text-emerald-800">{cargo.paid}</dd>
            </div>
            <div>
              <dt className="text-muted">Unpaid</dt>
              <dd className="font-semibold text-amber-800">{cargo.unpaid}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-card border border-line bg-surface p-5 shadow-ui-sm">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
            Recent bookings
          </h3>
          {analytics.recentBookings.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No bookings yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {analytics.recentBookings.map((b) => (
                <li
                  key={b.id}
                  className="flex items-start justify-between gap-3 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {b.bookingRef} · {b.passengerName}
                    </p>
                    <p className="text-muted">
                      {b.route} · {statusLabel(b.status)}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold">
                    {formatAud(b.amountPaidCents)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-card border border-line bg-surface p-5 shadow-ui-sm">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
            Upcoming flights
          </h3>
          {analytics.upcomingFlights.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No upcoming flights.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {analytics.upcomingFlights.map((f) => (
                <li
                  key={f.id}
                  className="flex items-start justify-between gap-3 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {f.flightNumber} · {f.route}
                    </p>
                    <p className="text-muted">
                      {new Date(f.departureAt).toLocaleString("en-AU", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                    {f.cabins.length > 0 ? (
                      <p className="text-muted">
                        {f.cabins
                          .map(
                            (c) =>
                              `${c.cabinClass === "business" ? "Business" : "Economy"} ${c.remainingSeats}/${c.totalSeats}`,
                          )
                          .join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-muted">
                    {f.remainingSeats}/{f.totalSeats} seats
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
