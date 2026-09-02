"use client";

import {
  A320NEO_GRAPHIC,
  A320NEO_SEATS,
  seatFeeCents,
  seatFeeLabel,
  type SeatCabin,
  type SeatHotspot,
} from "@/lib/seats/catalog";
import { formatAud } from "@/lib/pricing";

export function SeatMap({
  cabin,
  taken,
  selectedId,
  onSelect,
  disabled,
}: {
  cabin: SeatCabin;
  taken: Set<string>;
  selectedId?: string;
  onSelect: (seat: SeatHotspot) => void;
  disabled?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="relative mx-auto w-[724px] overflow-hidden rounded-2xl border border-line bg-white">
        <img
          src={A320NEO_GRAPHIC}
          alt="Drukair Airbus A320neo seating layout"
          width={724}
          height={1024}
          draggable={false}
          className="pointer-events-none block h-auto w-[724px] max-w-none select-none"
        />
      {A320NEO_SEATS.map((seat) => {
        const isCabin = seat.cabin === cabin;
        const isTaken = taken.has(seat.id);
        const isSelected = selectedId === seat.id;
        const fee = isCabin ? seatFeeCents(seat, cabin) : 0;
        const title = isTaken
          ? `${seat.id} unavailable`
          : !isCabin
            ? `${seat.id} is ${seat.cabin} class`
            : `${seat.id} · ${seatFeeLabel(seat, cabin)}${
                fee > 0 ? ` · ${formatAud(fee)}` : ""
              }`;
        return (
          <button
            key={seat.id}
            type="button"
            title={title}
            aria-label={title}
            disabled={disabled || isTaken || !isCabin}
            onClick={() => onSelect(seat)}
            style={{
              left: `${seat.x * 100}%`,
              top: `${seat.y * 100}%`,
              width: `${seat.w * 100}%`,
              height: `${seat.h * 100}%`,
            }}
            className={[
              "absolute rounded-[2px] border-0 p-0 transition",
              isSelected
                ? "bg-accent/35 ring-2 ring-accent ring-offset-1"
                : isTaken
                  ? "cursor-not-allowed bg-zinc-950/45"
                  : !isCabin
                    ? "cursor-not-allowed bg-transparent"
                    : "bg-transparent hover:bg-accent/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
            ].join(" ")}
          />
        );
      })}
      </div>
    </div>
  );
}
