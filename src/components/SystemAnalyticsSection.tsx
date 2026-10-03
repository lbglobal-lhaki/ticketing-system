"use client";

import { DonutChart, SEAT_CHART } from "@/components/analytics/DonutChart";
import { FlightSeatInventory } from "@/components/analytics/FlightSeatInventory";
import type { SystemAnalytics } from "@/lib/analytics/systemAnalytics";
import { formatAud } from "@/lib/pricing";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import {
  StatCard as UiStatCard,
  type StatTone,
} from "@/components/ui/StatCard";

function StatCard(props: {
  label: string;
  value: string;
  hint?: string;
  statTone?: StatTone;
}) {
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
  const economy = flights.economy;
  const business = flights.business;

  return (
    <section className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          statTone="green"
          label="Confirmed sales"
          value={formatAud(sales.revenueCents)}
          hint={
            sales.avgTicketCents
              ? `Avg ticket ${formatAud(sales.avgTicketCents)}`
              : "No confirmed bookings yet"
          }
        />
        <StatCard
          statTone="red"
          label="Pending payments"
          value={formatAud(sales.pendingCents)}
          hint={`${payments.bankPendingBookings} bank holds · ${payments.unpaidInvoices} unpaid invoices`}
        />
        <StatCard
          statTone="blue"
          label="Tickets sold"
          value={String(bookings.ticketsSold)}
          hint={`${bookings.confirmed} confirmed · ${bookings.pendingPayment} pending`}
        />
        <StatCard
          statTone="indigo"
          label="Active flights"
          value={String(flights.active)}
          hint={`${flights.upcoming} upcoming · ${flights.inactive} hidden`}
        />
      </div>

      <Card>
        <CardHeader
          title="Cabin mix — upcoming flights"
          description="Live seat pool across every departure still on sale. Booked is already held or ticketed."
        />
        <CardBody>
          <div className="grid gap-8 sm:grid-cols-3">
            <DonutChart
              variant="donut"
              title="Economy seats"
              centerValue={String(economy.remainingSeats)}
              centerLabel="open"
              slices={[
                {
                  label: "Booked",
                  value: economy.bookedSeats,
                  color: SEAT_CHART.economyBooked,
                },
                {
                  label: "Available",
                  value: economy.remainingSeats,
                  color: SEAT_CHART.economyOpen,
                },
              ]}
            />
            <DonutChart
              variant="donut"
              title="Business seats"
              centerValue={String(business.remainingSeats)}
              centerLabel="open"
              slices={[
                {
                  label: "Booked",
                  value: business.bookedSeats,
                  color: SEAT_CHART.businessBooked,
                },
                {
                  label: "Available",
                  value: business.remainingSeats,
                  color: SEAT_CHART.businessOpen,
                },
              ]}
            />
            <DonutChart
              variant="pie"
              title="Booked cabin mix"
              slices={[
                {
                  label: "Economy booked",
                  value: economy.bookedSeats,
                  color: SEAT_CHART.economyBooked,
                },
                {
                  label: "Business booked",
                  value: business.bookedSeats,
                  color: SEAT_CHART.businessBooked,
                },
              ]}
            />
          </div>
        </CardBody>
      </Card>

      <FlightSeatInventory flights={analytics.flightInventory} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="accent-top relative rounded-card border border-line bg-surface p-5 shadow-ui-sm">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-accent-deep">
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

        <div className="accent-top relative rounded-card border border-line bg-surface p-5 shadow-ui-sm">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-accent-deep">
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

        <div className="accent-top relative rounded-card border border-line bg-surface p-5 shadow-ui-sm">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-accent-deep">
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

        <div className="accent-top relative rounded-card border border-line bg-surface p-5 shadow-ui-sm">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-accent-deep">
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
      </div>
    </section>
  );
}
