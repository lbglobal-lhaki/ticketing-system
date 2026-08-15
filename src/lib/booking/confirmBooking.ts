import {
  bankHoldExpiresAt,
  makeAccessToken,
  makeBookingRef,
  makeInvoiceNumber,
  makeTicketNumber,
} from "@/lib/branding";
import { prisma } from "@/lib/db";
import {
  buildRouteLabel,
  defaultEndorsementText,
  defaultFareCalculationLine,
  defaultInvoiceIdentity,
} from "@/lib/documents/invoiceFields";
import { getCurrentFareRelease } from "@/lib/fares/current";
import {
  getQuoteTtlMinutes,
  resolveAdultLegFares,
  splitRoundTripPackageCents,
} from "@/lib/pricing/service";
import {
  decrementFareAndFlight,
  releaseQuoteHold,
  syncQuoteSeatHold,
} from "@/lib/booking/inventory";
import {
  allocatesSeat,
  childFareCents,
  infantFareCents,
  partyFareCents,
  quotePartyFareCents,
  seatedCountFromMix,
  travellerDisplayName,
  type TravellerDraft,
} from "@/lib/booking/passengers";

export async function createPriceQuote(input: {
  flightId: string;
  returnFlightId?: string;
  sessionId: string;
  /** Selected charter fare product (Saver / Flexi / …) — locks catalogue price. */
  fareProductId?: string;
  adults?: number;
  children?: number;
  infants?: number;
}) {
  if (!input.sessionId || input.sessionId === "anonymous") {
    return { ok: false as const, error: "Missing browser session — refresh and try again" };
  }

  const tripType = input.returnFlightId ? "round_trip" : "one_way";
  const isRoundTrip = tripType === "round_trip";

  const flight = await prisma.flight.findFirst({
    where: { id: input.flightId, active: true },
    include: { fareReleases: { orderBy: { sortOrder: "asc" } } },
  });
  if (!flight) return { ok: false as const, error: "Outbound flight not found" };
  if (flight.remainingSeats < 1) {
    return { ok: false as const, error: "Outbound flight is sold out" };
  }

  const outboundCurrent = getCurrentFareRelease(flight.fareReleases);
  if (!outboundCurrent) {
    return {
      ok: false as const,
      error: "Outbound fare is not priced yet — ask admin to set release prices",
    };
  }
  const outboundReleasePrice = isRoundTrip
    ? outboundCurrent.roundTripPriceCents
    : outboundCurrent.priceCents;
  if (outboundReleasePrice <= 0) {
    return {
      ok: false as const,
      error: isRoundTrip
        ? "Outbound round-trip fare is not priced yet — ask admin to set round-trip release prices"
        : "Outbound fare is not priced yet — ask admin to set release prices",
    };
  }

  let returnFlight = null;
  let returnCurrent = null;
  if (input.returnFlightId) {
    returnFlight = await prisma.flight.findFirst({
      where: { id: input.returnFlightId, active: true },
      include: { fareReleases: { orderBy: { sortOrder: "asc" } } },
    });
    if (!returnFlight) {
      return { ok: false as const, error: "Return flight not found" };
    }
    if (returnFlight.remainingSeats < 1) {
      return { ok: false as const, error: "Return flight is sold out" };
    }
    if (returnFlight.departureAt <= flight.departureAt) {
      return {
        ok: false as const,
        error: "Return flight must depart after the outbound flight",
      };
    }
    if (
      returnFlight.origin !== flight.destination ||
      returnFlight.destination !== flight.origin
    ) {
      return {
        ok: false as const,
        error: "Return flight must match the reverse route",
      };
    }
    returnCurrent = getCurrentFareRelease(returnFlight.fareReleases);
    if (!returnCurrent || returnCurrent.roundTripPriceCents <= 0) {
      return {
        ok: false as const,
        error:
          "Return round-trip fare is not priced yet — ask admin to set round-trip release prices",
      };
    }
  }

  let outboundCents = 0;
  let returnCents = 0;
  let fareProductCode = "";
  let fareProductName = "";
  let fareReleaseName = outboundCurrent.name;
  let returnFareReleaseName = returnCurrent?.name ?? "";

  if (input.fareProductId) {
    const product = await prisma.charterFareProduct.findFirst({
      where: { id: input.fareProductId, active: true },
    });
    if (!product) {
      return { ok: false as const, error: "Selected fare product is unavailable" };
    }
    if (product.cabinClass !== flight.cabinClass) {
      return {
        ok: false as const,
        error: "Selected fare does not match this flight cabin",
      };
    }
    fareProductCode = product.code;
    fareProductName = product.name;
    fareReleaseName = product.name;
    if (returnFlight) {
      if (product.roundTripPriceCents <= 0) {
        return {
          ok: false as const,
          error:
            "Selected round-trip fare is not priced yet — ask admin to set charter round-trip prices",
        };
      }
      const split = splitRoundTripPackageCents(product.roundTripPriceCents);
      outboundCents = split.outboundCents;
      returnCents = split.returnCents;
      returnFareReleaseName = product.name;
    } else {
      if (product.priceCents <= 0) {
        return {
          ok: false as const,
          error: "Selected fare product is not priced yet",
        };
      }
      outboundCents = product.priceCents;
      returnCents = 0;
    }
  } else {
    // Fare-release path: RT amount is a full adult package on the outbound
    // release — never sum outbound + return roundTripPriceCents.
    const legs = resolveAdultLegFares({
      isRoundTrip: Boolean(returnFlight),
      outboundOneWayCents: outboundCurrent.priceCents,
      outboundRoundTripCents: outboundCurrent.roundTripPriceCents,
      returnOneWayCents: returnCurrent?.priceCents ?? 0,
      returnRoundTripCents: returnCurrent?.roundTripPriceCents ?? 0,
    });
    if (legs.unitAdultCents <= 0) {
      return { ok: false as const, error: "Outbound fare is not available" };
    }
    outboundCents = legs.outboundLegCents;
    returnCents = legs.returnLegCents;
  }

  const unitAdultFareCents = outboundCents + returnCents;
  const adults = Math.min(9, Math.max(1, Math.floor(input.adults ?? 1)));
  const children = Math.min(8, Math.max(0, Math.floor(input.children ?? 0)));
  const infants = Math.min(9, Math.max(0, Math.floor(input.infants ?? 0)));
  const holdSeats = seatedCountFromMix(adults, children);
  if (holdSeats < 1 || holdSeats > 9) {
    return {
      ok: false as const,
      error: "Seated travellers (adults + children) must be between 1 and 9",
    };
  }
  if (flight.remainingSeats < holdSeats) {
    return { ok: false as const, error: "Not enough seats on the outbound flight" };
  }
  if (returnFlight && returnFlight.remainingSeats < holdSeats) {
    return { ok: false as const, error: "Not enough seats on the return flight" };
  }

  const totalCents = partyFareCents({
    adultUnitFareCents: unitAdultFareCents,
    adults,
    children,
    infants,
  });
  const expiresAt = new Date(Date.now() + getQuoteTtlMinutes() * 60 * 1000);

  // One active cart item per session — release any prior holds first.
  const priorQuotes = await prisma.priceQuote.findMany({
    where: { sessionId: input.sessionId, status: "active" },
    select: { id: true },
  });
  for (const prior of priorQuotes) {
    await releaseQuoteHold(prior.id);
  }

  try {
    const quote = await prisma.$transaction(
      async (tx) => {
        await decrementFareAndFlight(
          tx,
          flight.id,
          outboundCurrent.id,
          holdSeats,
        );
        if (returnFlight && returnCurrent) {
          await decrementFareAndFlight(
            tx,
            returnFlight.id,
            returnCurrent.id,
            holdSeats,
          );
        }

        const created = await tx.priceQuote.create({
          data: {
            flightId: flight.id,
            fareReleaseId: outboundCurrent.id,
            fareReleaseName,
            returnFlightId: returnFlight?.id,
            returnFareReleaseId: returnCurrent?.id,
            returnFareReleaseName,
            fareProductCode,
            fareProductName,
            tripType,
            sessionId: input.sessionId,
            quotedPriceCents: totalCents,
            outboundPriceCents: outboundCents,
            returnPriceCents: returnCents,
            unitAdultFareCents,
            adultCount: adults,
            childCount: children,
            infantCount: infants,
            basePriceSnapshotCents:
              outboundCurrent.priceCents + (returnCurrent?.priceCents ?? 0),
            demandMultiplier: 1,
            scarcityMultiplier: 1,
            baseMarkup: 0,
            expiresAt,
            status: "active",
            seatsBooked: holdSeats,
            heldSeats: holdSeats,
            inventoryHeld: true,
            travellersDraft: [],
          },
        });

        return created;
      },
      { maxWait: 15_000, timeout: 30_000 },
    );

    return { ok: true as const, quote };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Could not hold seats for this fare",
    };
  }
}

export async function confirmBooking(input: {
  quoteId: string;
  sessionId: string;
  passengerName: string;
  email: string;
  passengerPhone?: string;
  passportNumber?: string;
  nationality?: string;
  seatsBooked: number;
  paymentMethod: "card" | "bank_transfer";
  invoiceStatus: "paid" | "unpaid";
  stripePaymentIntentId?: string;
  /** Override charged total (e.g. fare + credit card fee). */
  amountCentsOverride?: number;
  serviceFeeCents?: number;
  bankDetails?: {
    accountName: string;
    bsb: string;
    accountNumber: string;
  } | null;
}) {
  if (!input.sessionId || input.sessionId === "anonymous") {
    return { ok: false as const, error: "Missing browser session — refresh and try again" };
  }

  // Align soft-hold to requested seats before consuming the quote.
  const hold = await syncQuoteSeatHold(
    input.quoteId,
    input.sessionId,
    input.seatsBooked,
  );
  if (!hold.ok) {
    return { ok: false as const, error: hold.error };
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const quote = await tx.priceQuote.findUnique({
          where: { id: input.quoteId },
        });

        if (!quote) throw new Error("Quote not found");
        if (quote.sessionId !== input.sessionId) {
          throw new Error("Quote does not belong to this session");
        }
        if (quote.status === "used") throw new Error("Quote already used");
        if (quote.status === "expired" || quote.expiresAt <= new Date()) {
          throw new Error("Quote has expired — please book again");
        }
        if (quote.status !== "active") throw new Error("Quote is not active");
        if (!quote.fareReleaseId) throw new Error("Quote missing fare release");
        if (!quote.inventoryHeld || quote.heldSeats < input.seatsBooked) {
          throw new Error("Seats are no longer held — please select fares again");
        }

        const flight = await tx.flight.findUnique({
          where: { id: quote.flightId },
        });
        if (!flight || !flight.active) {
          throw new Error("Outbound flight not available");
        }

        let returnFlight = null;
        if (quote.returnFlightId) {
          returnFlight = await tx.flight.findUnique({
            where: { id: quote.returnFlightId },
          });
          if (!returnFlight || !returnFlight.active) {
            throw new Error("Return flight not available");
          }
          if (!quote.returnFareReleaseId) {
            throw new Error("Return fare release missing");
          }
        }

        // Inventory already soft-held on the quote — do not decrement again.
        await tx.priceQuote.update({
          where: { id: quote.id },
          data: {
            status: "used",
            inventoryHeld: false,
            heldSeats: 0,
            seatsBooked: input.seatsBooked,
          },
        });

        const bookingRef = makeBookingRef();
        const ticketNumber = makeTicketNumber();
        const accessToken = makeAccessToken();
        const fareCents = quotePartyFareCents(quote);
        const serviceFeeCents = input.serviceFeeCents ?? 0;
        const amountCents = input.amountCentsOverride ?? fareCents;
        const paid = input.invoiceStatus === "paid";
        const holdExpiresAt =
          !paid && input.paymentMethod === "bank_transfer"
            ? bankHoldExpiresAt(new Date(), 48)
            : null;
        const invoiceNotes =
          serviceFeeCents > 0
            ? `Includes card processing fee and exclusive GST (10%).`
            : holdExpiresAt
              ? "Awaiting bank transfer."
              : "";

        const draftRaw = quote.travellersDraft;
        const draftList: TravellerDraft[] = Array.isArray(draftRaw)
          ? (draftRaw as TravellerDraft[])
          : [];
        const unit = quote.unitAdultFareCents || quote.quotedPriceCents;
        const adultsN = Math.max(1, quote.adultCount || input.seatsBooked || 1);
        const childrenN = Math.max(0, quote.childCount || 0);
        const infantsN = Math.max(0, quote.infantCount || 0);

        // Build named travellers: prefer draft list; fill gaps from primary.
        const travellers: Array<{
          fullName: string;
          email: string;
          phone: string;
          passportNumber: string;
          nationality: string;
          passengerType: "adult" | "child" | "infant";
          priceCents: number;
        }> = [];
        const expected =
          (quote.unitAdultFareCents > 0
            ? adultsN + childrenN + infantsN
            : input.seatsBooked) || 1;

        for (let i = 0; i < expected; i++) {
          const d = draftList[i];
          let type: "adult" | "child" | "infant" = "adult";
          if (quote.unitAdultFareCents > 0) {
            if (i < adultsN) type = "adult";
            else if (i < adultsN + childrenN) type = "child";
            else type = "infant";
          }
          const priceCents =
            type === "child"
              ? childFareCents(unit)
              : type === "infant"
                ? infantFareCents(unit)
                : 0;
          if (d) {
            travellers.push({
              fullName: travellerDisplayName(d) || input.passengerName,
              email: i === 0 ? input.email : d.email || "",
              phone: i === 0 ? input.passengerPhone || "" : d.phone || "",
              passportNumber: d.passportNumber || "",
              nationality: d.nationality || "",
              passengerType: d.passengerType || type,
              priceCents,
            });
          } else if (i === 0) {
            travellers.push({
              fullName: input.passengerName,
              email: input.email,
              phone: input.passengerPhone || "",
              passportNumber: input.passportNumber || "",
              nationality: input.nationality || "",
              passengerType: "adult",
              priceCents: 0,
            });
          } else {
            travellers.push({
              fullName: `${type === "child" ? "Child" : type === "infant" ? "Infant" : "Passenger"} ${i + 1}`,
              email: "",
              phone: "",
              passportNumber: "",
              nationality: "",
              passengerType: type,
              priceCents,
            });
          }
        }

        const passengerTickets = travellers.map((_, i) =>
          i === 0 ? ticketNumber : makeTicketNumber(),
        );

        const booking = await tx.booking.create({
          data: {
            quoteId: quote.id,
            flightId: flight.id,
            fareReleaseId: quote.fareReleaseId,
            fareReleaseName: quote.fareReleaseName,
            returnFlightId: returnFlight?.id,
            returnFareReleaseId: quote.returnFareReleaseId,
            tripType: quote.tripType,
            passengerName: input.passengerName,
            email: input.email,
            passengerPhone: input.passengerPhone ?? "",
            passportNumber: input.passportNumber ?? "",
            nationality: input.nationality ?? "",
            seatsBooked: input.seatsBooked,
            amountPaidCents: amountCents,
            serviceFeeCents,
            fareProductCode: quote.fareProductCode,
            fareProductName: quote.fareProductName,
            paymentMethod: input.paymentMethod,
            source: "online",
            status: paid ? "confirmed" : "pending_payment",
            bookingRef,
            ticketNumber,
            accessToken,
            holdExpiresAt,
            passengers: {
              create: travellers.map((pax, index) => ({
                sortOrder: index,
                fullName: pax.fullName,
                email: pax.email,
                phone: pax.phone,
                passportNumber: pax.passportNumber,
                nationality: pax.nationality,
                passengerType: pax.passengerType,
                priceCents: pax.priceCents,
                allocatesSeat: allocatesSeat(pax.passengerType),
                ticketNumber: passengerTickets[index]!,
              })),
            },
          },
        });

        const identity = defaultInvoiceIdentity();
        const routeLabel = buildRouteLabel({
          origin: flight.origin,
          destination: flight.destination,
          tripType: quote.tripType,
        });
        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber: makeInvoiceNumber(),
            bookingId: booking.id,
            paymentMethod: input.paymentMethod,
            status: input.invoiceStatus,
            amountCents,
            fareCents,
            serviceFeeCents,
            airfareCents: fareCents,
            airportTaxesCents: 0,
            extraBaggageCents: 0,
            travelInsuranceCents: 0,
            otherChargesCents: 0,
          gstRateBps: 1000,
          gstIncluded: false,
            accountNumber: identity.accountNumber,
            businessTpn: identity.businessTpn,
            routeLabel,
            seatLabel: "",
            nameRef: bookingRef.slice(-7),
            endorsementText: defaultEndorsementText(),
            fareCalculationLine: defaultFareCalculationLine({
              origin: flight.origin,
              destination: flight.destination,
              tripType: quote.tripType,
              fareCents,
            }),
            currency: "AUD",
            stripePaymentIntentId: input.stripePaymentIntentId,
            bankAccountName: input.bankDetails?.accountName,
            bankBsb: input.bankDetails?.bsb,
            bankAccountNumber: input.bankDetails?.accountNumber,
            bankReference:
              input.paymentMethod === "bank_transfer" ? bookingRef : null,
            customerName: input.passengerName,
            customerEmail: input.email,
            customerPhone: input.passengerPhone ?? "",
            notes: invoiceNotes,
            dueAt: null,
            paidAt: paid ? new Date() : null,
            markedPaidByAdmin: false,
          },
        });

        return { booking, invoice };
      },
      {
        maxWait: 15_000,
        timeout: 30_000,
      },
    );

    return { ok: true as const, ...result };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not confirm booking";
    return { ok: false as const, error: message };
  }
}

export async function expireQuoteIfNeeded(quoteId: string) {
  const quote = await prisma.priceQuote.findUnique({ where: { id: quoteId } });
  if (quote && quote.status === "active" && quote.expiresAt <= new Date()) {
    await releaseQuoteHold(quoteId);
    return true;
  }
  return false;
}
