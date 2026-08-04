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
import { getQuoteTtlMinutes, priceFlight } from "@/lib/pricing/service";
import {
  decrementFareAndFlight,
  releaseQuoteHold,
  syncQuoteSeatHold,
} from "@/lib/booking/inventory";

export async function createPriceQuote(input: {
  flightId: string;
  returnFlightId?: string;
  sessionId: string;
  /** Selected charter fare product (Saver / Flexi / …) — locks catalogue price. */
  fareProductId?: string;
}) {
  if (!input.sessionId || input.sessionId === "anonymous") {
    return { ok: false as const, error: "Missing browser session — refresh and try again" };
  }

  const tripType = input.returnFlightId ? "round_trip" : "one_way";

  const flight = await prisma.flight.findFirst({
    where: { id: input.flightId, active: true },
    include: { fareReleases: { orderBy: { sortOrder: "asc" } } },
  });
  if (!flight) return { ok: false as const, error: "Outbound flight not found" };
  if (flight.remainingSeats < 1) {
    return { ok: false as const, error: "Outbound flight is sold out" };
  }

  const outboundCurrent = getCurrentFareRelease(flight.fareReleases);
  if (!outboundCurrent || outboundCurrent.priceCents <= 0) {
    return {
      ok: false as const,
      error: "Outbound fare is not priced yet — ask admin to set release prices",
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
    if (!returnCurrent || returnCurrent.priceCents <= 0) {
      return {
        ok: false as const,
        error: "Return fare is not priced yet — ask admin to set release prices",
      };
    }
  }

  const outboundPrice = await priceFlight(flight);
  const returnPrice = returnFlight ? await priceFlight(returnFlight) : null;
  if (!outboundPrice.farePriced) {
    return { ok: false as const, error: "Outbound fare is not available" };
  }
  if (returnFlight && returnPrice && !returnPrice.farePriced) {
    return { ok: false as const, error: "Return fare is not available" };
  }

  let outboundCents = outboundPrice.displayPriceCents;
  let returnCents = returnPrice?.displayPriceCents ?? 0;
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
    outboundCents = product.priceCents;
    if (returnFlight) {
      returnCents = product.priceCents;
      returnFareReleaseName = product.name;
    } else {
      returnCents = 0;
    }
  }

  const totalCents = outboundCents + returnCents;
  const expiresAt = new Date(Date.now() + getQuoteTtlMinutes() * 60 * 1000);
  const holdSeats = 1;

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
        const fareCents = quote.quotedPriceCents * input.seatsBooked;
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
              ? "Awaiting bank transfer · seats held for 48 hours."
              : "";

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
            dueAt: holdExpiresAt,
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
