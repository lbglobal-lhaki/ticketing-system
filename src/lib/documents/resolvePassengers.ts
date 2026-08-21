import {
  allocatesSeat,
  childFareCents,
  infantFareCents,
  travellerDisplayName,
  type TravellerDraft,
} from "@/lib/booking/passengers";
import type { BookingDocumentPassenger } from "@/lib/documents/templates";

type QuoteParty = {
  unitAdultFareCents: number;
  adultCount: number;
  childCount: number;
  infantCount: number;
  travellersDraft?: unknown;
} | null;

type BookingSeed = {
  passengerName: string;
  email: string;
  passengerPhone?: string | null;
  passportNumber?: string | null;
  nationality?: string | null;
  ticketNumber: string;
  seatsBooked: number;
};

/**
 * Resolve travellers for invoices / e-tickets.
 * Works for new party-mix bookings and older bookings that only stored
 * seatsBooked + primary contact (and optional BookingPassenger rows).
 */
export function resolveDocumentPassengers(input: {
  booking: BookingSeed;
  stored: BookingDocumentPassenger[];
  quote: QuoteParty;
}): BookingDocumentPassenger[] {
  const { booking, quote } = input;
  let passengers =
    input.stored.length > 0
      ? [...input.stored]
      : [
          {
            fullName: booking.passengerName,
            email: booking.email,
            phone: booking.passengerPhone || "",
            passportNumber: booking.passportNumber || "",
            nationality: booking.nationality || "",
            ticketNumber: booking.ticketNumber,
            passengerType: "adult" as const,
            dateOfBirth: null,
            priceCents: 0,
            allocatesSeat: true,
          },
        ];

  const unit = quote && quote.unitAdultFareCents > 0 ? quote.unitAdultFareCents : 0;
  const adultsN = quote ? Math.max(1, quote.adultCount || 1) : 0;
  const childrenN = quote ? Math.max(0, quote.childCount || 0) : 0;
  const infantsN = quote ? Math.max(0, quote.infantCount || 0) : 0;
  const expectedParty = unit > 0 ? adultsN + childrenN + infantsN : 0;
  const draft = Array.isArray(quote?.travellersDraft)
    ? (quote!.travellersDraft as TravellerDraft[])
    : [];

  // Rebuild from quote party mix when stored rows are incomplete.
  if (expectedParty > passengers.length) {
    const rebuilt: BookingDocumentPassenger[] = [];
    for (let i = 0; i < expectedParty; i++) {
      const d = draft[i];
      let type: "adult" | "child" | "infant" = "adult";
      if (i >= adultsN + childrenN) type = "infant";
      else if (i >= adultsN) type = "child";
      const existing = passengers[i];
      rebuilt.push({
        fullName:
          existing?.fullName ||
          (d ? travellerDisplayName(d) : "") ||
          (i === 0
            ? booking.passengerName
            : `${type === "child" ? "Child" : type === "infant" ? "Infant" : "Passenger"} ${i + 1}`),
        email: existing?.email || (i === 0 ? booking.email : d?.email || ""),
        phone:
          existing?.phone ||
          (i === 0 ? booking.passengerPhone || "" : d?.phone || ""),
        passportNumber:
          existing?.passportNumber ||
          d?.passportNumber ||
          (i === 0 ? booking.passportNumber || "" : ""),
        nationality:
          existing?.nationality ||
          d?.nationality ||
          (i === 0 ? booking.nationality || "" : ""),
        ticketNumber: existing?.ticketNumber || booking.ticketNumber,
        returnTicketNumber: existing?.returnTicketNumber ?? null,
        bookingRef: existing?.bookingRef ?? null,
        passengerType: existing?.passengerType || d?.passengerType || type,
        dateOfBirth: existing?.dateOfBirth ?? d?.dateOfBirth ?? null,
        priceCents:
          existing?.priceCents && existing.priceCents > 0
            ? existing.priceCents
            : type === "child"
              ? childFareCents(unit)
              : type === "infant"
                ? infantFareCents(unit)
                : 0,
        allocatesSeat: allocatesSeat(type),
      });
    }
    passengers = rebuilt;
  }

  // Legacy multi-seat bookings: ensure one named adult slot per seated traveller
  // so travel docs / invoices list every seat (even without a quote party mix).
  const seatedStored = passengers.filter(
    (p) => p.allocatesSeat !== false && p.passengerType !== "infant",
  ).length;
  if (!quote && booking.seatsBooked > seatedStored) {
    for (let i = seatedStored; i < booking.seatsBooked; i++) {
      passengers.push({
        fullName:
          i === 0
            ? booking.passengerName
            : `Passenger ${i + 1}`,
        email: i === 0 ? booking.email : "",
        phone: i === 0 ? booking.passengerPhone || "" : "",
        passportNumber: i === 0 ? booking.passportNumber || "" : "",
        nationality: i === 0 ? booking.nationality || "" : "",
        ticketNumber: booking.ticketNumber,
        passengerType: "adult",
        dateOfBirth: null,
        priceCents: 0,
        allocatesSeat: true,
      });
    }
  }

  // Fill missing child/infant fares from the adult unit when available.
  if (unit > 0) {
    passengers = passengers.map((p) => {
      if ((p.priceCents ?? 0) > 0) return p;
      if (p.passengerType === "child") {
        return { ...p, priceCents: childFareCents(unit), allocatesSeat: true };
      }
      if (p.passengerType === "infant") {
        return {
          ...p,
          priceCents: infantFareCents(unit),
          allocatesSeat: false,
        };
      }
      return p;
    });
  }

  return passengers;
}
