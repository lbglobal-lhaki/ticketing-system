import Link from "next/link";
import {
  childFareCents,
  infantFareCents,
  quotePartyFareCents,
} from "@/lib/booking/passengers";
import {
  exclusiveGstAppliesToFare,
  exclusiveGstCents,
} from "@/lib/payments/fees";
import {
  formatCardDate,
  formatClock,
  formatDuration,
  flightDurationMinutes,
} from "@/lib/flights/results";
import { airportTzAbbr } from "@/lib/datetime";
import { airportCity } from "@/lib/format";
import { formatAud } from "@/lib/pricing";
import type { CheckoutQuoteState } from "@/lib/checkout/loadQuote";
import {
  quoteSeatFeeFromQuote,
  seatAssignmentLabel,
  seatedTravellers,
  travellersFromDraft,
} from "@/lib/seats/selection";

type FlightSummarySidebarProps = {
  state: CheckoutQuoteState;
  changeHref: string;
};

export function FlightSummarySidebar({
  state,
  changeHref,
}: FlightSummarySidebarProps) {
  const { quote, isRound } = state;
  const fareLabel =
    [
      quote.fareRelease?.cabinClass === "business" ? "Business" : "Economy",
      quote.fareProductName,
    ]
      .filter(Boolean)
      .join(" · ") || "Charter fare";

  const isParty = quote.unitAdultFareCents > 0;
  const unit = quote.unitAdultFareCents || quote.quotedPriceCents;
  const adults = isParty
    ? Math.max(1, quote.adultCount || 1)
    : Math.max(1, quote.seatsBooked || 1);
  const children = isParty ? Math.max(0, quote.childCount || 0) : 0;
  const infants = isParty ? Math.max(0, quote.infantCount || 0) : 0;
  const totalCents = quotePartyFareCents(quote);
  const seatFeeCents = quoteSeatFeeFromQuote(quote);
  const includeGst = exclusiveGstAppliesToFare(quote);
  const gstCents = exclusiveGstCents(totalCents + seatFeeCents, includeGst);
  const dueCents = totalCents + seatFeeCents + gstCents;
  const draft = travellersFromDraft(quote.travellersDraft);
  const seatLabel = seatAssignmentLabel(draft, isRound);

  const mixParts = [
    `${adults} adult${adults === 1 ? "" : "s"}`,
    children > 0
      ? `${children} child${children === 1 ? "" : "ren"}`
      : null,
    infants > 0
      ? `${infants} infant${infants === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  return (
    <aside className="rounded-2xl border border-line bg-white p-5 shadow-[0_10px_32px_rgba(15,23,42,0.08)] sm:p-6 lg:sticky lg:top-24">
      <SegmentBlock
        label="Departure"
        origin={quote.flight.origin}
        destination={quote.flight.destination}
        departureAt={quote.flight.departureAt}
        arrivalAt={quote.flight.arrivalAt}
        airline={quote.flight.airline}
        flightNumber={quote.flight.flightNumber}
        fareLabel={fareLabel}
        changeHref={changeHref}
        detailsHref={`/flights/${quote.flight.id}?adults=${adults}&children=${children}&infants=${infants}`}
      />

      {isRound && quote.returnFlight ? (
        <div className="mt-5 border-t border-line pt-5">
          <SegmentBlock
            label="Return"
            origin={quote.returnFlight.origin}
            destination={quote.returnFlight.destination}
            departureAt={quote.returnFlight.departureAt}
            arrivalAt={quote.returnFlight.arrivalAt}
            airline={quote.returnFlight.airline}
            flightNumber={quote.returnFlight.flightNumber}
            fareLabel={
              quote.returnFareReleaseName || quote.fareProductName || fareLabel
            }
            changeHref={changeHref}
            detailsHref={`/flights/trip?outboundId=${quote.flightId}&returnId=${quote.returnFlightId}&adults=${adults}&children=${children}&infants=${infants}`}
          />
        </div>
      ) : null}

      <div className="mt-6 space-y-2.5 border-t border-dashed border-line pt-5 text-sm">
        {isParty ? (
          <>
            <div className="flex justify-between gap-4">
              <span className="text-muted">
                Adult × {adults}
              </span>
              <span className="font-medium">
                {formatAud(unit * adults)}
              </span>
            </div>
            {children > 0 ? (
              <div className="flex justify-between gap-4">
                <span className="text-muted">
                  Child × {children} (75%)
                </span>
                <span className="font-medium">
                  {formatAud(childFareCents(unit) * children)}
                </span>
              </div>
            ) : null}
            {infants > 0 ? (
              <div className="flex justify-between gap-4">
                <span className="text-muted">
                  Infant × {infants} (10%)
                </span>
                <span className="font-medium">
                  {formatAud(infantFareCents(unit) * infants)}
                </span>
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex justify-between gap-4">
            <span className="text-muted">Air Transportation Charge</span>
            <span className="font-medium">{formatAud(totalCents)}</span>
          </div>
        )}
        {seatFeeCents > 0 ? (
          <div className="flex justify-between gap-4">
            <span className="text-muted">
              Seat selection
              {seatLabel ? ` (${seatLabel})` : ""}
            </span>
            <span className="font-medium">{formatAud(seatFeeCents)}</span>
          </div>
        ) : seatedTravellers(draft).some((t) => t.seatOutbound) ? (
          <div className="flex justify-between gap-4">
            <span className="text-muted">Seats</span>
            <span className="font-medium">{seatLabel || "Selected"}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <span className="text-muted">
            {gstCents > 0 ? "GST (10%)" : "Taxes, Fees, and Charges"}
          </span>
          <span className="font-medium">{formatAud(gstCents)}</span>
        </div>
        <div className="flex items-end justify-between gap-4 border-t border-dashed border-line pt-4">
          <span className="font-semibold text-foreground">Total Price</span>
          <span className="font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight text-accent-deep">
            {formatAud(dueCents)}
          </span>
        </div>
        <p className="text-xs text-muted">
          {mixParts.join(", ")}.
          {gstCents > 0
            ? " GST (10%) is added on this fare and any seat extras; promotional Saver fares stay at the advertised amount."
            : " Promotional fare charged at the advertised amount (GST is not added)."}
        </p>
      </div>

    </aside>
  );
}

function SegmentBlock({
  label,
  origin,
  destination,
  departureAt,
  arrivalAt,
  airline,
  flightNumber,
  fareLabel,
  changeHref,
  detailsHref,
}: {
  label: string;
  origin: string;
  destination: string;
  departureAt: Date;
  arrivalAt: Date;
  airline: string;
  flightNumber: string;
  fareLabel: string;
  changeHref: string;
  detailsHref: string;
}) {
  const duration = formatDuration(
    flightDurationMinutes(departureAt, arrivalAt, origin, destination),
  );

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
        {label}
      </p>
      <p className="mt-2 font-[family-name:var(--font-syne)] text-lg font-bold tracking-tight text-foreground">
        {airportCity(origin)} → {airportCity(destination)}
      </p>
      <p className="mt-1 text-sm text-muted">
        {formatCardDate(departureAt)}{" "}
        {new Intl.DateTimeFormat("en-AU", {
          year: "numeric",
          timeZone: "UTC",
        }).format(departureAt)}{" "}
        · {formatClock(departureAt)} {airportTzAbbr(origin, departureAt)}–
        {formatClock(arrivalAt)} {airportTzAbbr(destination, arrivalAt)} ·
        Nonstop · {duration}
      </p>

      <div className="mt-3 flex items-center gap-3 rounded-xl bg-accent/8 px-3 py-3">
        <img
          src="/drukair_logo.png"
          alt=""
          width={56}
          height={56}
          className="size-12 shrink-0 rounded-xl object-contain sm:size-14"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-accent-deep">
            {fareLabel}
          </p>
          <p className="truncate text-xs text-muted">
            {airline} {flightNumber}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-3 text-sm font-semibold text-accent">
        <Link href={detailsHref} className="hover:text-accent-deep">
          Flight Details
        </Link>
        <span className="text-line">|</span>
        <Link href={changeHref} className="hover:text-accent-deep">
          Change
        </Link>
      </div>
    </div>
  );
}
