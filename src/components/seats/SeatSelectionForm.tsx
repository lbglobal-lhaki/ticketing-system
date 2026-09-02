"use client";

import { useActionState, useMemo, useState } from "react";
import { saveSeatSelectionAction } from "@/lib/actions/seats";
import { SeatMap } from "@/components/seats/SeatMap";
import { SubmitButton } from "@/components/SubmitButton";
import {
  EXIT_ROW_CENTS,
  WINDOW_SEAT_CENTS,
  getSeat,
  seatFeeCents,
  type SeatCabin,
  type SeatHotspot,
} from "@/lib/seats/catalog";
import { quoteSeatFeeCents, seatedTravellers } from "@/lib/seats/selection";
import type { TravellerDraft } from "@/lib/booking/passengers";
import { travellerDisplayName } from "@/lib/booking/passengers";
import { formatAud } from "@/lib/pricing";

type SeatSelectionFormProps = {
  quoteId: string;
  cabin: SeatCabin;
  roundTrip: boolean;
  travellers: TravellerDraft[];
  takenOutbound: string[];
  takenReturn: string[];
  outboundLabel: string;
  returnLabel?: string;
};

export function SeatSelectionForm({
  quoteId,
  cabin,
  roundTrip,
  travellers: initial,
  takenOutbound,
  takenReturn,
  outboundLabel,
  returnLabel,
}: SeatSelectionFormProps) {
  const [rows, setRows] = useState(initial);
  const [active, setActive] = useState(0);
  const [leg, setLeg] = useState<"outbound" | "return">("outbound");
  const [state, action] = useActionState(saveSeatSelectionAction, null);

  const seated = seatedTravellers(rows);
  const current = seated[active];
  const seatedIndex = current
    ? rows.findIndex((row) => row === current)
    : -1;
  const currentKey = leg === "outbound" ? "seatOutbound" : "seatReturn";
  const selectedId = current?.[currentKey];

  const taken = useMemo(() => {
    const set = new Set(leg === "outbound" ? takenOutbound : takenReturn);
    for (const t of seatedTravellers(rows)) {
      const id = (leg === "outbound" ? t.seatOutbound : t.seatReturn) || "";
      if (id && id !== selectedId) set.add(id);
    }
    return set;
  }, [leg, takenOutbound, takenReturn, rows, selectedId]);

  const feeTotal = quoteSeatFeeCents(rows, cabin, roundTrip);

  function pick(seat: SeatHotspot) {
    if (!current || seatedIndex < 0) return;
    setRows((prev) =>
      prev.map((row, i) =>
        i === seatedIndex ? { ...row, [currentKey]: seat.id } : row,
      ),
    );
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="quoteId" value={quoteId} />
      {rows.map((row, i) => (
        <div key={`hidden-${i}`}>
          <input
            type="hidden"
            name={`seatOutbound_${i}`}
            value={row.seatOutbound || ""}
          />
          <input
            type="hidden"
            name={`seatReturn_${i}`}
            value={row.seatReturn || ""}
          />
        </div>
      ))}

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Seat selection
        </p>
        <h2 className="heading-gradient mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight">
          Choose your seats
        </h2>
        <p className="mt-2 text-sm text-muted">
          Tap a seat on the Drukair A320neo map. Window seats and exit-row seats
          have an extra charge; other {cabin} seats are included.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {seated.map((t, i) => {
          const name = travellerDisplayName(t) || `Passenger ${i + 1}`;
          const mark = roundTrip
            ? `${t.seatOutbound || "–"}/${t.seatReturn || "–"}`
            : t.seatOutbound || "–";
          return (
            <button
              key={`${t.firstName}-${t.lastName}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                i === active
                  ? "border-accent bg-accent/10 font-semibold text-accent-deep"
                  : "border-line text-muted hover:border-accent/40"
              }`}
            >
              {name}
              <span className="ml-2 font-mono text-xs">{mark}</span>
            </button>
          );
        })}
      </div>

      {roundTrip ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setLeg("outbound")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              leg === "outbound"
                ? "bg-accent text-white"
                : "border border-line text-muted"
            }`}
          >
            Outbound
          </button>
          <button
            type="button"
            onClick={() => setLeg("return")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              leg === "return"
                ? "bg-accent text-white"
                : "border border-line text-muted"
            }`}
          >
            Return
          </button>
        </div>
      ) : null}

      <p className="text-sm font-medium text-foreground">
        {current ? travellerDisplayName(current) : "Passenger"} ·{" "}
        {leg === "outbound" ? outboundLabel : returnLabel || "Return"}
        {selectedId ? ` · ${selectedId}` : ""}
        {selectedId && getSeat(selectedId)
          ? ` · ${formatAud(seatFeeCents(getSeat(selectedId)!, cabin))}`
          : ""}
      </p>

      <SeatMap
        cabin={cabin}
        taken={taken}
        selectedId={selectedId}
        onSelect={pick}
      />

      <ul className="space-y-1 text-xs text-muted">
        <li>Window (A, F) · {formatAud(WINDOW_SEAT_CENTS)} extra in economy</li>
        <li>
          Exit row (12, 14) · {formatAud(EXIT_ROW_CENTS)} extra in economy
        </li>
        <li>Dark overlay · already taken</li>
        <li>Business bookings select rows 1–5; economy selects rows 6–26</li>
      </ul>

      <div className="flex items-end justify-between gap-4 border-t border-line pt-4">
        <p className="text-sm text-muted">Seat extras</p>
        <p className="font-[family-name:var(--font-syne)] text-2xl font-semibold">
          {formatAud(feeTotal)}
        </p>
      </div>

      {state?.error ? (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton className="btn-cta min-h-12 w-full px-5 py-3">
        Continue to payment
      </SubmitButton>
    </form>
  );
}
