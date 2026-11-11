"use client";

import { useId, useMemo, useState } from "react";
import type {
  OverbookedFlight,
  SeatReviewRow,
  SeatReviewSector,
} from "@/lib/booking/cancelBooking";
import {
  SEAT_DECISION_NOTE_MAX,
  cancellationReasonLabel,
  seatReturnStatusLabel,
} from "@/lib/booking/cancellationPolicy";
import { decideSeatReturnAction } from "@/lib/actions/cancelBooking";
import { ListFilterBar, NoMatches } from "@/components/admin/ListFilterBar";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { SubmitButton } from "@/components/SubmitButton";
import { formatFlightDateTime } from "@/lib/datetime";

type Filter = "pending" | "decided" | "all";

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: "warning",
  returned: "success",
  not_returned: "neutral",
  not_applicable: "neutral",
};

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("en-AU") : "—";
}

function roleLabel(role: string) {
  if (role === "admin") return "Admin";
  if (role === "sub_admin") return "Sub-admin";
  return role || "—";
}

/**
 * Cancellations tab: every cancelled booking, and a manual decision on
 * whether its seats go back on sale.
 *
 * Cancelling never releases seats on its own — some bookings were taken on
 * flights that were already full, and returning those seats would oversell
 * the aircraft. Each sector shows the live load, what can safely go back, and
 * why not, so the decision (and who made it) is on record.
 */
export function CancellationsAdminPanel({
  rows,
  overbooked,
  canDecide,
}: {
  rows: SeatReviewRow[];
  overbooked: OverbookedFlight[];
  canDecide: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("pending");
  const [query, setQuery] = useState("");

  const counts = useMemo(
    () => ({
      pending: rows.filter((r) => r.seatReturnStatus === "pending").length,
      decided: rows.filter((r) => r.seatReturnStatus !== "pending").length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "pending" && r.seatReturnStatus !== "pending") return false;
      if (filter === "decided" && r.seatReturnStatus === "pending") return false;
      if (!q) return true;
      return [
        r.bookingRef,
        r.passengerName,
        r.email,
        ...r.sectors.map((s) => `${s.flightNumber} ${s.route}`),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, filter, query]);

  return (
    <div className="space-y-8">
      <OverbookedFlights flights={overbooked} />

      <section aria-labelledby="cancel-queue-heading" className="space-y-4">
        <div>
          <h2 id="cancel-queue-heading" className="text-base font-semibold text-foreground">
            Cancelled bookings
          </h2>
          <p className="mt-1 text-sm text-muted">
            Seats from a cancelled booking stay counted as sold until an admin
            decides here.
            {canDecide
              ? ""
              : " Only the full admin login can return seats — you can review the queue."}
          </p>
        </div>

        <ListFilterBar
          query={query}
          onQueryChange={setQuery}
          placeholder="Search booking ref, name, email, flight…"
          chips={[
            { value: "pending", label: "Awaiting review", count: counts.pending },
            { value: "decided", label: "Decided", count: counts.decided },
            { value: "all", label: "All", count: rows.length },
          ]}
          activeChip={filter}
          onChipChange={(v) => setFilter(v as Filter)}
          resultCount={visible.length}
          totalCount={rows.length}
          itemLabel="cancelled booking"
        />

        {rows.length === 0 ? (
          <p className="rounded-card border border-dashed border-line bg-surface/70 px-6 py-10 text-center text-sm text-muted">
            No cancelled bookings yet.
          </p>
        ) : visible.length === 0 ? (
          filter === "pending" && !query ? (
            <p className="rounded-card border border-dashed border-line bg-surface/70 px-6 py-10 text-center text-sm text-muted">
              Nothing awaiting review — every cancellation has a seat decision.
            </p>
          ) : (
            <NoMatches
              onReset={() => {
                setQuery("");
                setFilter("all");
              }}
            />
          )
        ) : (
          <ul className="space-y-4">
            {visible.map((row) => (
              <li key={row.id}>
                <CancelledBookingCard row={row} canDecide={canDecide} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function OverbookedFlights({ flights }: { flights: OverbookedFlight[] }) {
  return (
    <section aria-labelledby="overbooked-heading" className="space-y-3">
      <div>
        <h2 id="overbooked-heading" className="text-base font-semibold text-foreground">
          Overbooked flights
        </h2>
        <p className="mt-1 text-sm text-muted">
          Flights where live bookings hold more seats than the aircraft has,
          and the bookings that were made after it was already full.
        </p>
      </div>
      {flights.length === 0 ? (
        <p className="rounded-card border border-line bg-surface px-4 py-3 text-sm text-muted">
          No flight is oversold right now.
        </p>
      ) : (
        <ul className="space-y-3">
          {flights.map((f) => (
            <li
              key={f.id}
              className="rounded-card border border-accent-red/30 bg-accent-red/5 p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {f.flightNumber} {f.route}
                  <span className="ml-2 font-normal text-muted">
                    {formatFlightDateTime(new Date(f.departureAt))}
                  </span>
                </h3>
                <Badge tone="danger">{f.oversoldBy} over capacity</Badge>
              </div>
              <p className="mt-1 text-sm text-foreground">
                {f.liveSeatsSold} seats held on a {f.totalSeats}-seat flight.
              </p>
              {f.bookingsOverCapacity.length > 0 ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-left text-sm">
                    <caption className="sr-only">
                      Bookings made after {f.flightNumber} was full
                    </caption>
                    <thead className="text-xs uppercase tracking-[0.08em] text-muted">
                      <tr>
                        <th scope="col" className="py-1.5 pr-3 font-medium">Booking</th>
                        <th scope="col" className="py-1.5 pr-3 font-medium">Passenger</th>
                        <th scope="col" className="py-1.5 pr-3 font-medium">Booked</th>
                        <th scope="col" className="py-1.5 pr-3 text-right font-medium">Seats over</th>
                        <th scope="col" className="py-1.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {f.bookingsOverCapacity.map((b) => (
                        <tr key={b.id}>
                          <th scope="row" className="py-1.5 pr-3 font-medium">{b.bookingRef}</th>
                          <td className="py-1.5 pr-3">{b.passengerName}</td>
                          <td className="py-1.5 pr-3 text-muted">{fmtDate(b.createdAt)}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">
                            {b.seatsOverCapacity} of {b.seatsBooked}
                          </td>
                          <td className="py-1.5 text-muted">{b.status.replaceAll("_", " ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-muted">
                    To resolve, cancel or move these bookings from the Bookings
                    tab, or raise the seat count on the Flights tab.
                  </p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SectorTable({
  row,
  pending,
  seats,
  onSeats,
  canDecide,
}: {
  row: SeatReviewRow;
  pending: boolean;
  seats: Record<string, number>;
  onSeats: (leg: string, value: number) => void;
  canDecide: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <caption className="sr-only">Seat position per flight for {row.bookingRef}</caption>
        <thead className="text-xs uppercase tracking-[0.08em] text-muted">
          <tr>
            <th scope="col" className="py-1.5 pr-3 font-medium">Flight</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">Seats in booking</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">Live load</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">Ticket type</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">
              {pending ? "Can return" : "Returned"}
            </th>
            {pending && canDecide ? (
              <th scope="col" className="py-1.5 font-medium">Return</th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-line align-top">
          {row.sectors.map((s) => (
            <SectorRow
              key={s.leg}
              row={row}
              sector={s}
              pending={pending}
              canDecide={canDecide}
              value={seats[s.leg] ?? 0}
              onChange={(v) => onSeats(s.leg, v)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectorRow({
  row,
  sector: s,
  pending,
  canDecide,
  value,
  onChange,
}: {
  row: SeatReviewRow;
  sector: SeatReviewSector;
  pending: boolean;
  canDecide: boolean;
  value: number;
  onChange: (value: number) => void;
}) {
  const inputId = useId();
  const notesId = useId();
  const inv = s.inventory;
  const a = s.assessment;
  return (
    <tr>
      <th scope="row" className="py-2 pr-3 font-medium">
        {s.flightNumber} {s.route}
        <span className="block text-xs font-normal text-muted">
          {s.leg === "return" ? "Return · " : ""}
          {formatFlightDateTime(new Date(s.departureAt))}
        </span>
        {s.bookedOverCapacity ? (
          <span className="mt-1 inline-block">
            <Badge tone="danger">Booked over capacity</Badge>
          </span>
        ) : null}
      </th>
      <td className="py-2 pr-3 text-right tabular-nums">{inv.seatsBooked}</td>
      <td className="py-2 pr-3 text-right tabular-nums">
        <span className={a.oversoldBy > 0 ? "font-semibold text-accent-red" : undefined}>
          {inv.liveSeatsSold} / {inv.flightTotalSeats}
        </span>
        <span className="block text-xs text-muted">
          {inv.flightRemainingSeats} on sale
        </span>
      </td>
      <td className="py-2 pr-3">
        {inv.fare ? (
          <>
            {inv.fare.name}
            <span className="block text-xs text-muted">
              {inv.fare.salesClosed
                ? "Closed for sale"
                : `${inv.fare.remainingSeats} of ${inv.fare.totalSeats} on sale`}
            </span>
          </>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">
        {pending ? a.returnable : s.seatsReturned}
        {pending && a.notes.length > 0 ? (
          <ul id={notesId} className="mt-1 space-y-0.5 text-left text-xs text-muted">
            {a.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
      </td>
      {pending && canDecide ? (
        <td className="py-2">
          <label htmlFor={inputId} className="sr-only">
            Seats to return on {s.flightNumber} {s.route} for {row.bookingRef}
          </label>
          <input
            id={inputId}
            name={s.leg === "outbound" ? "outbound" : "inbound"}
            type="number"
            inputMode="numeric"
            min={0}
            max={a.returnable}
            step={1}
            value={value}
            disabled={a.returnable === 0}
            aria-describedby={a.notes.length > 0 ? notesId : undefined}
            onChange={(e) =>
              onChange(
                Math.max(0, Math.min(a.returnable, Math.trunc(Number(e.target.value) || 0))),
              )
            }
            className="min-h-10 w-20 rounded-control border border-line bg-surface px-2 text-right tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
          />
          {a.returnable === 0 ? (
            // Disabled inputs are not submitted; keep the count explicit.
            <input
              type="hidden"
              name={s.leg === "outbound" ? "outbound" : "inbound"}
              value={0}
            />
          ) : null}
        </td>
      ) : null}
    </tr>
  );
}

function CancelledBookingCard({
  row,
  canDecide,
}: {
  row: SeatReviewRow;
  canDecide: boolean;
}) {
  const headingId = useId();
  const pending = row.seatReturnStatus === "pending";
  const [seats, setSeats] = useState<Record<string, number>>(() =>
    Object.fromEntries(row.sectors.map((s) => [s.leg, s.assessment.returnable])),
  );
  const [note, setNote] = useState("");
  const totalToReturn = Object.values(seats).reduce((a, b) => a + b, 0);
  const anyReturnable = row.sectors.some((s) => s.assessment.returnable > 0);
  const oversold = row.sectors.some((s) => s.assessment.oversoldBy > 0);

  return (
    <article
      aria-labelledby={headingId}
      className="rounded-card border border-line bg-surface p-4 shadow-ui-sm sm:p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={headingId} className="text-sm font-semibold text-foreground">
            {row.bookingRef}
            <span className="ml-2 font-normal text-muted">{row.passengerName}</span>
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            Booked {fmtDate(row.bookedAt)} · Cancelled {fmtDate(row.cancelledAt)}
            {row.cancelledBy ? ` by ${roleLabel(row.cancelledBy)}` : ""}
            {row.cancellationReason
              ? ` · ${cancellationReasonLabel(row.cancellationReason)}`
              : ""}
            {" · "}
            {row.cancellationEmailSentAt ? "Customer emailed" : "Customer not emailed"}
            {row.invoiceStatus === "paid" ? " · Invoice paid (refund separately)" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {oversold ? <Badge tone="danger">Flight oversold</Badge> : null}
          <Badge tone={STATUS_TONE[row.seatReturnStatus] ?? "neutral"}>
            {seatReturnStatusLabel(row.seatReturnStatus)}
          </Badge>
        </div>
      </header>

      {row.seatReturnStatus === "not_applicable" ? (
        <p className="mt-3 text-sm text-muted">
          This booking&apos;s hold had already expired, so its seats went back to
          sale automatically. Nothing to decide.
        </p>
      ) : (
        <form action={decideSeatReturnAction} className="mt-4 space-y-4">
          <input type="hidden" name="id" value={row.id} />
          <SectorTable
            row={row}
            pending={pending}
            seats={seats}
            onSeats={(leg, v) => setSeats((prev) => ({ ...prev, [leg]: v }))}
            canDecide={canDecide}
          />

          {pending && canDecide ? (
            <>
              <Textarea
                name="note"
                label="Decision note"
                rows={2}
                maxLength={SEAT_DECISION_NOTE_MAX}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                helper="Required when seats are not returned — e.g. “Booked on a full flight; seats never existed.”"
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <SubmitButton
                  name="decision"
                  value="keep"
                  className={buttonClasses("secondary", "md")}
                  pendingLabel="Saving…"
                  aria-describedby={headingId}
                >
                  Don&apos;t return seats
                </SubmitButton>
                {anyReturnable ? (
                  <SubmitButton
                    name="decision"
                    value="return"
                    className={buttonClasses("primary", "md")}
                    pendingLabel="Returning…"
                    aria-describedby={headingId}
                    disabled={totalToReturn < 1}
                    confirmMessage={`Put ${totalToReturn} seat${totalToReturn === 1 ? "" : "s"} from ${row.bookingRef} back on sale?`}
                  >
                    Return {totalToReturn} seat{totalToReturn === 1 ? "" : "s"} to sale
                  </SubmitButton>
                ) : null}
              </div>
              {!anyReturnable ? (
                <p className="text-right text-xs text-muted">
                  No seats can go back without overselling — see the notes above.
                </p>
              ) : null}
            </>
          ) : null}

          {!pending ? (
            <p className="text-sm text-muted">
              Decided {fmtDate(row.seatReturnDecidedAt)}
              {row.seatReturnDecidedBy ? ` by ${roleLabel(row.seatReturnDecidedBy)}` : ""}
              {row.seatReturnNote ? ` — “${row.seatReturnNote}”` : ""}
            </p>
          ) : null}
        </form>
      )}
    </article>
  );
}
