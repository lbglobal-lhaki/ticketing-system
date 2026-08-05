"use server";

import { requireAdmin } from "@/lib/adminAuth";

import { isRedirectError } from "next/dist/client/components/redirect-error";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import {
  bankHoldExpiresAt,
  makeAccessToken,
  makeBookingRef,
  makeInvoiceNumber,
  makeTicketNumber,
} from "@/lib/branding";
import { recordDeletion } from "@/lib/audit/deletionLog";
import { prisma } from "@/lib/db";
import {
  buildRouteLabel,
  computeInvoiceTotals,
  defaultEndorsementText,
  defaultFareCalculationLine,
  defaultInvoiceIdentity,
} from "@/lib/documents/invoiceFields";
import {
  sendBookingConfirmationBundle,
} from "@/lib/email/bookingMail";
import {
  decrementFareAndFlight,
  restoreFareAndFlight,
} from "@/lib/booking/inventory";
import { parseDateTimeLocal } from "@/lib/datetime";
import { getCurrentFareRelease } from "@/lib/fares/current";
import {
  getBankTransferDetails,
  isBankTransferConfigured,
} from "@/lib/payments/bank";
import { calculateCardServiceFee } from "@/lib/payments/fees";
import { priceFlight, splitRoundTripPackageCents } from "@/lib/pricing/service";
import { z } from "zod";

const passengerDetailSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === "" || z.string().email().safeParse(v).success, {
      message: "Invalid email",
    }),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  passportNumber: z.string().trim().max(40).optional().or(z.literal("")),
  nationality: z.string().trim().max(60).optional().or(z.literal("")),
});

type PassengerDetail = z.infer<typeof passengerDetailSchema>;

const walkInSchema = z.object({
  flightId: z.string().min(1),
  returnFlightId: z.string().optional().or(z.literal("")),
  fareProductId: z.string().optional().or(z.literal("")),
  passengerName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  passengerPhone: z.string().trim().max(40).optional().or(z.literal("")),
  passportNumber: z.string().trim().max(40).optional().or(z.literal("")),
  nationality: z.string().trim().max(60).optional().or(z.literal("")),
  paymentMethod: z.enum(["cash", "card", "bank_transfer"]),
  extraBaggageKg: z.coerce.number().int().min(0).max(500).default(0),
  extraBaggageAud: z.coerce.number().min(0).max(100000).default(0),
  bookingSource: z.enum(["walk_in", "online"]).default("walk_in"),
  customPriceAud: z.string().trim().optional().or(z.literal("")),
  gstMode: z.enum(["none", "exclusive", "inclusive"]).default("none"),
  customGstAud: z.string().trim().optional().or(z.literal("")),
});

function parseExtraPassengers(formData: FormData): PassengerDetail[] {
  const names = formData.getAll("extraPassengerName").map(String);
  const emails = formData.getAll("extraPassengerEmail").map(String);
  const phones = formData.getAll("extraPassengerPhone").map(String);
  const passports = formData.getAll("extraPassengerPassport").map(String);
  const nationalities = formData.getAll("extraPassengerNationality").map(String);

  if (names.length === 0) return [];
  if (names.length > 8) {
    throw new Error("Maximum 8 extra passengers (9 travellers total)");
  }

  return names.map((fullName, i) => {
    const parsed = passengerDetailSchema.safeParse({
      fullName,
      email: emails[i] ?? "",
      phone: phones[i] ?? "",
      passportNumber: passports[i] ?? "",
      nationality: nationalities[i] ?? "",
    });
    if (!parsed.success) {
      throw new Error(
        `Extra passenger ${i + 1}: ${parsed.error.issues[0]?.message ?? "invalid details"}`,
      );
    }
    return parsed.data;
  });
}

const CUSTOM_FLIGHT_VALUE = "__custom__";

const customFlightSchema = z.object({
  airline: z.string().trim().min(2).max(80),
  flightNumber: z.string().trim().min(2).max(16),
  origin: z.string().trim().length(3).transform((v) => v.toUpperCase()),
  destination: z.string().trim().length(3).transform((v) => v.toUpperCase()),
  departureAt: z.string().min(1),
  arrivalAt: z.string().min(1),
  cabinClass: z.enum(["economy", "business"]),
  priceAud: z.coerce.number().min(0).max(100000),
});

/**
 * Resolves the flightId a walk-in leg should book against. If the admin
 * picked "Custom flight (not in system)", parses the inline fields and
 * creates a one-off, hidden Flight row (sized exactly to `seats`, priced at
 * the admin-entered amount) so the rest of the booking flow — pricing,
 * seat decrement, invoice — works exactly like any other flight.
 */
async function resolveLegFlightId(
  formData: FormData,
  prefix: "outbound" | "return",
  selectedId: string,
  seats: number,
): Promise<string> {
  if (selectedId !== CUSTOM_FLIGHT_VALUE) return selectedId;

  const parsed = customFlightSchema.safeParse({
    airline: formData.get(`${prefix}CustomAirline`),
    flightNumber: formData.get(`${prefix}CustomFlightNumber`),
    origin: formData.get(`${prefix}CustomOrigin`),
    destination: formData.get(`${prefix}CustomDestination`),
    departureAt: formData.get(`${prefix}CustomDepartureAt`),
    arrivalAt: formData.get(`${prefix}CustomArrivalAt`),
    cabinClass: formData.get(`${prefix}CustomCabinClass`),
    priceAud: formData.get(`${prefix}CustomPriceAud`) || "0",
  });
  if (!parsed.success) {
    throw new Error(
      `Custom ${prefix} flight: ${parsed.error.issues[0]?.message ?? "invalid details"}`,
    );
  }
  const data = parsed.data;
  if (data.origin === data.destination) {
    throw new Error(`Custom ${prefix} flight: From and To must be different`);
  }
  const tzRaw = Number(formData.get("tzOffsetMinutes"));
  const tzOffsetMinutes = Number.isFinite(tzRaw) ? tzRaw : 0;
  let departureAt: Date;
  let arrivalAt: Date;
  try {
    departureAt = parseDateTimeLocal(data.departureAt, tzOffsetMinutes);
    arrivalAt = parseDateTimeLocal(data.arrivalAt, tzOffsetMinutes);
  } catch {
    throw new Error(`Custom ${prefix} flight: invalid departure or arrival time`);
  }
  if (arrivalAt <= departureAt) {
    throw new Error(`Custom ${prefix} flight: arrival must be after departure`);
  }
  if (data.priceAud <= 0) {
    throw new Error(`Custom ${prefix} flight: enter a price above $0`);
  }

  const flight = await prisma.flight.create({
    data: {
      airline: data.airline,
      flightNumber: data.flightNumber.toUpperCase(),
      origin: data.origin,
      destination: data.destination,
      departureAt,
      arrivalAt,
      cabinClass: data.cabinClass,
      currency: "AUD",
      totalSeats: seats,
      remainingSeats: seats,
      // Hidden from public search/results — only reachable via this booking.
      active: false,
      fareReleases: {
        create: {
          name: "Walk-in fare",
          sortOrder: 1,
          totalSeats: seats,
          remainingSeats: seats,
          // Same amount for both trip types — custom legs are priced per seat
          // for that leg; RT walk-ins sum the two legs' release prices.
          priceCents: Math.round(data.priceAud * 100),
          roundTripPriceCents: Math.round(data.priceAud * 100),
          active: true,
        },
      },
    },
  });
  return flight.id;
}

async function decrementSeats(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  flightId: string,
  fareReleaseId: string,
  seats: number,
) {
  const fareUpdated = await tx.fareRelease.updateMany({
    where: { id: fareReleaseId, remainingSeats: { gte: seats } },
    data: { remainingSeats: { decrement: seats } },
  });
  if (fareUpdated.count !== 1) {
    throw new Error("Not enough seats in this fare release");
  }
  const flightUpdated = await tx.flight.updateMany({
    where: { id: flightId, remainingSeats: { gte: seats } },
    data: { remainingSeats: { decrement: seats } },
  });
  if (flightUpdated.count !== 1) {
    throw new Error("Not enough seats remaining");
  }
}

export async function createWalkInBookingAction(formData: FormData) {
  await requireAdmin();

  const parsed = walkInSchema.safeParse({
    flightId: formData.get("flightId"),
    returnFlightId: formData.get("returnFlightId") || "",
    fareProductId: formData.get("fareProductId") || "",
    passengerName: formData.get("passengerName"),
    email: formData.get("email"),
    passengerPhone: formData.get("passengerPhone") || "",
    passportNumber: formData.get("passportNumber") || "",
    nationality: formData.get("nationality") || "",
    paymentMethod: formData.get("paymentMethod"),
    extraBaggageKg: formData.get("extraBaggageKg") || "0",
    extraBaggageAud: formData.get("extraBaggageAud") || "0",
    bookingSource: formData.get("bookingSource") || "walk_in",
    customPriceAud: formData.get("customPriceAud") || "",
    gstMode: formData.get("gstMode") || "none",
    customGstAud: formData.get("customGstAud") || "",
  });

  if (!parsed.success) {
    redirect(
      `/admin?tab=bookings&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid walk-in form")}`,
    );
  }

  let extraPassengers: PassengerDetail[] = [];
  try {
    extraPassengers = parseExtraPassengers(formData);
  } catch (e) {
    redirect(
      `/admin?tab=bookings&error=${encodeURIComponent(
        e instanceof Error ? e.message : "Invalid extra passenger details",
      )}`,
    );
  }

  const data = {
    ...parsed.data,
    seatsBooked: 1 + extraPassengers.length,
  };
  if (data.paymentMethod === "bank_transfer" && !isBankTransferConfigured()) {
    redirect(
      "/admin?tab=bookings&error=Bank+details+not+configured+for+walk-in+bank+transfer",
    );
  }

  // Admin-entered custom total airfare — optional. When set, it fully
  // replaces whatever the system would otherwise charge (the flight's fare
  // release price, or a selected fare tier override), for this booking only.
  const customPriceRaw = data.customPriceAud?.trim();
  let customTotalCents: number | null = null;
  if (customPriceRaw) {
    const amount = Number(customPriceRaw);
    if (!Number.isFinite(amount) || amount < 0) {
      redirect(
        `/admin?tab=bookings&error=${encodeURIComponent(
          "Custom price must be a valid amount ($0 or more)",
        )}`,
      );
    }
    customTotalCents = Math.round(amount * 100);
  }

  try {
    const flightId = await resolveLegFlightId(
      formData,
      "outbound",
      data.flightId,
      data.seatsBooked,
    );
    const returnFlightId = data.returnFlightId
      ? await resolveLegFlightId(
          formData,
          "return",
          data.returnFlightId,
          data.seatsBooked,
        )
      : "";

    const flight = await prisma.flight.findFirst({
      where: { id: flightId },
      include: { fareReleases: { orderBy: { sortOrder: "asc" } } },
    });
    if (!flight) throw new Error("Flight not found");

    // A fare-tier override charges its own catalogue price, and a custom
    // admin price replaces the total outright — in either case the flight's
    // own fare release only needs to exist (to decrement seats against), it
    // doesn't need to be priced itself.
    const usingFareOverride = Boolean(data.fareProductId);
    const usingCustomPrice = customTotalCents !== null;
    const skipsSystemFarePricing = usingFareOverride || usingCustomPrice;
    const isRoundTrip = Boolean(returnFlightId);

    const outboundCurrent = getCurrentFareRelease(flight.fareReleases);
    if (!outboundCurrent) {
      throw new Error("Outbound flight has no active fare release");
    }
    if (!skipsSystemFarePricing) {
      const outboundNeeded = isRoundTrip
        ? outboundCurrent.roundTripPriceCents
        : outboundCurrent.priceCents;
      if (outboundNeeded <= 0) {
        throw new Error(
          isRoundTrip
            ? "Current round-trip fare release is not priced — set a round-trip price in Flights, pick a fare tier override, or enter a custom price below"
            : "Current fare release is not priced — set a price in Flights, pick a fare tier override, or enter a custom price below",
        );
      }
    }

    let returnFlight = null;
    let returnCurrent = null;
    if (returnFlightId) {
      returnFlight = await prisma.flight.findFirst({
        where: { id: returnFlightId },
        include: { fareReleases: { orderBy: { sortOrder: "asc" } } },
      });
      if (!returnFlight) throw new Error("Return flight not found");
      if (returnFlight.departureAt <= flight.departureAt) {
        throw new Error(
          "Return flight must depart after the outbound flight",
        );
      }
      if (
        returnFlight.origin !== flight.destination ||
        returnFlight.destination !== flight.origin
      ) {
        throw new Error(
          "Return flight must match the reverse route of the outbound flight",
        );
      }
      returnCurrent = getCurrentFareRelease(returnFlight.fareReleases);
      if (!returnCurrent) {
        throw new Error("Return flight has no active fare release");
      }
      if (!skipsSystemFarePricing && returnCurrent.roundTripPriceCents <= 0) {
        throw new Error(
          "Return round-trip fare is not priced — set a round-trip price in Flights, pick a fare tier override, or enter a custom price below",
        );
      }
    }

    let outboundLegCents = 0;
    let returnLegCents = 0;
    if (!skipsSystemFarePricing) {
      const tripType = isRoundTrip ? "round_trip" : "one_way";
      const outboundPrice = await priceFlight(flight, { tripType });
      const returnPrice = returnFlight
        ? await priceFlight(returnFlight, { tripType })
        : null;
      if (!outboundPrice.farePriced) {
        throw new Error("Outbound fare unavailable");
      }
      if (returnFlight && returnPrice && !returnPrice.farePriced) {
        throw new Error("Return fare unavailable");
      }
      outboundLegCents = outboundPrice.displayPriceCents;
      returnLegCents = returnPrice?.displayPriceCents ?? 0;
    }

    // Optional fare-tier override — admin can charge a specific charter
    // catalogue price (Saver / Flexi / …) instead of the flight's current
    // fare-release price, same as the online checkout allows.
    let fareProductCode = "";
    let fareProductName = "";
    let outboundReleaseName = outboundCurrent.name;
    if (data.fareProductId) {
      const product = await prisma.charterFareProduct.findFirst({
        where: { id: data.fareProductId, active: true },
      });
      if (!product) throw new Error("Selected fare tier is unavailable");
      if (product.cabinClass !== flight.cabinClass) {
        throw new Error("Selected fare tier does not match the outbound cabin");
      }
      if (returnFlight && returnFlight.cabinClass !== product.cabinClass) {
        throw new Error("Selected fare tier does not match the return cabin");
      }
      fareProductCode = product.code;
      fareProductName = product.name;
      outboundReleaseName = product.name;
      if (returnFlight) {
        if (product.roundTripPriceCents <= 0) {
          throw new Error(
            "Selected round-trip fare is not priced — set a charter round-trip price first",
          );
        }
        const split = splitRoundTripPackageCents(product.roundTripPriceCents);
        outboundLegCents = split.outboundCents;
        returnLegCents = split.returnCents;
      } else {
        if (product.priceCents <= 0) {
          throw new Error(
            "Selected one-way fare is not priced — set a charter one-way price first",
          );
        }
        outboundLegCents = product.priceCents;
      }
    }

    // Custom price wins over everything above — it's a flat total for the
    // whole booking (all seats/legs included), not a per-leg or per-seat rate.
    if (usingCustomPrice && !usingFareOverride) {
      outboundReleaseName = "Custom price (admin-set)";
    }

    const flightFareCents = usingCustomPrice
      ? (customTotalCents as number)
      : (outboundLegCents + returnLegCents) * data.seatsBooked;
    const baggageCents = Math.round(data.extraBaggageAud * 100);
    const chargeableSubtotalCents = flightFareCents + baggageCents;

    const paidUpfront = data.paymentMethod !== "bank_transfer";
    const cardOrBase =
      data.paymentMethod === "card"
        ? calculateCardServiceFee(chargeableSubtotalCents, {
            includeGst: false,
          })
        : {
            fareCents: chargeableSubtotalCents,
            serviceFeeCents: 0,
            gstCents: 0,
            totalCents: chargeableSubtotalCents,
          };

    const gstMode = data.gstMode;
    let gstRateBps = gstMode === "none" ? 0 : 1000;
    let gstIncluded = gstMode === "inclusive";
    let gstOverrideCents = 0;
    const customGstRaw = data.customGstAud?.trim();
    if (customGstRaw) {
      const gstAud = Number(customGstRaw);
      if (!Number.isFinite(gstAud) || gstAud < 0) {
        redirect(
          `/admin?tab=bookings&error=${encodeURIComponent("Custom GST must be a valid amount")}`,
        );
      }
      gstOverrideCents = Math.round(gstAud * 100);
      if (gstOverrideCents > 0) {
        // Custom amount is always an exclusive add-on.
        gstIncluded = false;
        if (gstRateBps === 0) gstRateBps = 1000; // still show as GST on invoice
      }
    }

    const totals = computeInvoiceTotals({
      airfareCents: flightFareCents,
      airportTaxesCents: 0,
      extraBaggageCents: baggageCents,
      travelInsuranceCents: 0,
      otherChargesCents: 0,
      serviceFeeCents: cardOrBase.serviceFeeCents,
      gstRateBps,
      gstIncluded,
      gstOverrideCents,
    });

    const bank = getBankTransferDetails();
    const holdExpiresAt = paidUpfront
      ? null
      : bankHoldExpiresAt(new Date(), 48);

    const gstNote =
      gstOverrideCents > 0
        ? ` · custom GST $${(gstOverrideCents / 100).toFixed(2)}`
        : gstMode === "exclusive"
          ? " · GST exclusive 10%"
          : gstMode === "inclusive"
            ? " · GST inclusive 10%"
            : "";

    const created = await prisma.$transaction(async (tx) => {
      await decrementSeats(
        tx,
        flight.id,
        outboundCurrent.id,
        data.seatsBooked,
      );
      if (returnFlight && returnCurrent) {
        await decrementSeats(
          tx,
          returnFlight.id,
          returnCurrent.id,
          data.seatsBooked,
        );
      }

      const bookingRef = makeBookingRef();
      const allPassengers: PassengerDetail[] = [
        {
          fullName: data.passengerName,
          email: data.email,
          phone: data.passengerPhone || "",
          passportNumber: data.passportNumber || "",
          nationality: data.nationality || "",
        },
        ...extraPassengers,
      ];
      const passengerTickets = allPassengers.map(() => makeTicketNumber());

      const booking = await tx.booking.create({
        data: {
          quoteId: null,
          flightId: flight.id,
          fareReleaseId: outboundCurrent.id,
          fareReleaseName: outboundReleaseName,
          returnFlightId: returnFlight?.id,
          returnFareReleaseId: returnCurrent?.id,
          tripType: returnFlight ? "round_trip" : "one_way",
          fareProductCode,
          fareProductName,
          extraBaggageKg: data.extraBaggageKg,
          passengerName: data.passengerName,
          email: data.email,
          passengerPhone: data.passengerPhone || "",
          passportNumber: data.passportNumber || "",
          nationality: data.nationality || "",
          seatsBooked: data.seatsBooked,
          amountPaidCents: totals.amountCents,
          serviceFeeCents: cardOrBase.serviceFeeCents,
          paymentMethod: data.paymentMethod,
          source: data.bookingSource,
          status: paidUpfront ? "confirmed" : "pending_payment",
          bookingRef,
          ticketNumber: passengerTickets[0]!,
          accessToken: makeAccessToken(),
          holdExpiresAt,
          passengers: {
            create: allPassengers.map((pax, index) => ({
              sortOrder: index,
              fullName: pax.fullName,
              email: pax.email || "",
              phone: pax.phone || "",
              passportNumber: pax.passportNumber || "",
              nationality: pax.nationality || "",
              ticketNumber: passengerTickets[index]!,
            })),
          },
        },
      });

      const identity = defaultInvoiceIdentity();
      const tripType = returnFlight ? "round_trip" : "one_way";
      const routeLabel = buildRouteLabel({
        origin: flight.origin,
        destination: flight.destination,
        tripType,
      });
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber: makeInvoiceNumber(),
          bookingId: booking.id,
          paymentMethod: data.paymentMethod,
          status: paidUpfront ? "paid" : "unpaid",
          amountCents: totals.amountCents,
          fareCents: flightFareCents,
          serviceFeeCents: cardOrBase.serviceFeeCents,
          airfareCents: flightFareCents,
          airportTaxesCents: 0,
          extraBaggageCents: baggageCents,
          travelInsuranceCents: 0,
          otherChargesCents: 0,
          gstRateBps,
          gstIncluded,
          gstOverrideCents,
          accountNumber: identity.accountNumber,
          businessTpn: identity.businessTpn,
          routeLabel,
          seatLabel: "",
          nameRef: bookingRef.slice(-7),
          endorsementText: defaultEndorsementText(),
          fareCalculationLine: defaultFareCalculationLine({
            origin: flight.origin,
            destination: flight.destination,
            tripType,
            fareCents: flightFareCents,
          }),
          currency: "AUD",
          bankAccountName: !paidUpfront ? bank?.accountName : null,
          bankBsb: !paidUpfront ? bank?.bsb : null,
          bankAccountNumber: !paidUpfront ? bank?.accountNumber : null,
          bankReference: !paidUpfront ? bookingRef : null,
          customerName: data.passengerName,
          customerEmail: data.email,
          customerPhone: data.passengerPhone || "",
          notes:
            (paidUpfront
              ? `Walk-in booking · paid by ${data.paymentMethod}`
              : "Walk-in booking · awaiting bank transfer (48h hold)") +
            (usingCustomPrice ? " · custom admin-set price" : "") +
            gstNote,
          dueAt: holdExpiresAt,
          paidAt: paidUpfront ? new Date() : null,
          markedPaidByAdmin: paidUpfront,
        },
      });

      return { booking, invoice };
    });

    // Do not auto-email travel docs / invoices on walk-in create — admins
    // often need to edit the documents first, then send from the Invoices tab.
    revalidatePath("/admin");
    redirect(
      `/admin?tab=bookings&saved=walk-in&ref=${encodeURIComponent(created.booking.bookingRef)}`,
    );
  } catch (error) {
    // Next.js implements redirect() by throwing — must rethrow so the
    // navigation isn't swallowed and shown as "NEXT_REDIRECT" in the UI.
    if (isRedirectError(error)) throw error;
    redirect(
      `/admin?tab=bookings&error=${encodeURIComponent(
        error instanceof Error ? error.message : "Walk-in booking failed",
      )}`,
    );
  }
}

export async function markBookingPaidAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin?tab=bookings&error=Missing+booking");

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { invoice: true },
  });
  if (!booking) redirect("/admin?tab=bookings&error=Booking+not+found");
  if (booking.status === "hold_expired" || booking.status === "cancelled") {
    redirect(
      "/admin?tab=bookings&error=Cannot+mark+paid+—+this+hold+already+expired+or+was+cancelled",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id },
      data: {
        status: "confirmed",
        holdExpiresAt: null,
      },
    });
    if (booking.invoice) {
      await tx.invoice.update({
        where: { id: booking.invoice.id },
        data: {
          status: "paid",
          paidAt: new Date(),
          markedPaidByAdmin: true,
          pdfBlobUrl: null,
          pdfBlobPathname: null,
        },
      });
    }
  });

  after(async () => {
    try {
      await sendBookingConfirmationBundle(id);
    } catch (err) {
      console.error("mark booking paid email failed", err);
    }
  });

  revalidatePath("/admin");
  redirect("/admin?tab=bookings&saved=booking-paid");
}

export async function markBookingUnpaidAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin?tab=bookings&error=Missing+booking");

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { invoice: true },
  });
  if (!booking?.invoice) {
    redirect("/admin?tab=bookings&error=Booking+or+invoice+not+found");
  }
  if (booking.paymentMethod !== "bank_transfer") {
    redirect(
      "/admin?tab=bookings&error=Only+bank+transfer+bookings+can+be+marked+unpaid",
    );
  }

  const holdExpiresAt =
    booking.holdExpiresAt && booking.holdExpiresAt > new Date()
      ? booking.holdExpiresAt
      : bankHoldExpiresAt(new Date(), 48);

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id },
      data: {
        status: "pending_payment",
        holdExpiresAt,
      },
    });
    await tx.invoice.update({
      where: { id: booking.invoice!.id },
      data: {
        status: "unpaid",
        paidAt: null,
        dueAt: holdExpiresAt,
        markedPaidByAdmin: true,
        pdfBlobUrl: null,
        pdfBlobPathname: null,
      },
    });
  });

  revalidatePath("/admin");
  redirect("/admin?tab=bookings&saved=booking-unpaid");
}

/**
 * Permanently deletes a booking (and its invoice, via DB cascade) — both
 * are recorded on the admin Deleted tab first. Seat inventory is restored
 * for bookings that still hold seats (not hold_expired — those already
 * returned seats when the hold lapsed).
 */
/** Accepts one or many `id` fields — powers both the row Delete button and bulk-select delete. */
export async function deleteBookingAction(formData: FormData) {
  await requireAdmin();
  const ids = Array.from(new Set(formData.getAll("id").map(String).filter(Boolean)));
  if (ids.length === 0) redirect("/admin?tab=bookings&error=Missing+booking");

  const bookings = await prisma.booking.findMany({
    where: { id: { in: ids } },
    include: {
      invoice: true,
      flight: {
        select: {
          airline: true,
          flightNumber: true,
          origin: true,
          destination: true,
        },
      },
      returnFlight: {
        select: {
          airline: true,
          flightNumber: true,
          origin: true,
          destination: true,
        },
      },
    },
  });
  if (bookings.length === 0) {
    redirect("/admin?tab=bookings&error=Booking(s)+not+found");
  }

  await prisma.$transaction(
    async (tx) => {
      for (const booking of bookings) {
        // Return seats before deleting — skip expired holds (already restored).
        if (
          booking.status !== "hold_expired" &&
          booking.seatsBooked > 0 &&
          booking.fareReleaseId
        ) {
          await restoreFareAndFlight(
            tx,
            booking.flightId,
            booking.fareReleaseId,
            booking.seatsBooked,
          );
          if (booking.returnFlightId && booking.returnFareReleaseId) {
            await restoreFareAndFlight(
              tx,
              booking.returnFlightId,
              booking.returnFareReleaseId,
              booking.seatsBooked,
            );
          }
        }

        if (booking.invoice) {
          await recordDeletion(
            {
              entityType: "invoice",
              entityId: booking.invoice.id,
              label: booking.invoice.invoiceNumber,
              summary: `Deleted together with booking ${booking.bookingRef}`,
              snapshot: booking.invoice,
            },
            tx,
          );
        }
        await recordDeletion(
          {
            entityType: "booking",
            entityId: booking.id,
            label: booking.bookingRef,
            summary: `${booking.passengerName} · ${booking.flight.flightNumber} ${booking.flight.origin}→${booking.flight.destination}${
              booking.returnFlight
                ? ` · ${booking.returnFlight.flightNumber} ${booking.returnFlight.origin}→${booking.returnFlight.destination}`
                : ""
            }`,
            snapshot: booking,
          },
          tx,
        );
      }
      // Invoice.bookingId has onDelete: Cascade — deleting the bookings removes
      // their invoice rows automatically; we've already logged them above.
      await tx.booking.deleteMany({
        where: { id: { in: bookings.map((b) => b.id) } },
      });
    },
    { maxWait: 20_000, timeout: 60_000 },
  );

  revalidatePath("/admin");
  redirect(
    `/admin?tab=bookings&saved=${bookings.length > 1 ? "bookings-deleted" : "booking-deleted"}`,
  );
}

const updateBookingSchema = z.object({
  id: z.string().min(1),
  passengerName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  passengerPhone: z.string().trim().max(40).optional().or(z.literal("")),
  passportNumber: z.string().trim().max(40).optional().or(z.literal("")),
  nationality: z.string().trim().max(60).optional().or(z.literal("")),
  extraBaggageKg: z.coerce.number().int().min(0).max(500).default(0),
  fareReleaseName: z.string().trim().max(120).optional().or(z.literal("")),
  amountAud: z.coerce.number().min(0).max(100000),
});

/**
 * Back-solve airfare so invoice PDF totals (recomputed from line items)
 * match the admin-entered booking amount.
 */
function airfareCentsForTargetAmount(
  targetAmountCents: number,
  inv: {
    airportTaxesCents: number;
    extraBaggageCents: number;
    travelInsuranceCents: number;
    otherChargesCents: number;
    serviceFeeCents: number;
    gstRateBps: number;
    gstIncluded: boolean;
    gstOverrideCents: number;
  },
): number {
  const fixed =
    inv.airportTaxesCents +
    inv.extraBaggageCents +
    inv.travelInsuranceCents +
    inv.otherChargesCents +
    inv.serviceFeeCents;
  const override = Math.max(0, inv.gstOverrideCents ?? 0);
  if (override > 0) {
    return Math.max(0, targetAmountCents - fixed - override);
  }
  if (inv.gstIncluded || (inv.gstRateBps ?? 0) <= 0) {
    return Math.max(0, targetAmountCents - fixed);
  }
  // exclusive: amount = (airfare + fixed) * (1 + rate/10000)
  const taxable = Math.round(
    (targetAmountCents * 10_000) / (10_000 + inv.gstRateBps),
  );
  return Math.max(0, taxable - fixed);
}

/**
 * Replace BookingPassenger rows with the full named traveller list
 * (primary first). Preserves existing ticket numbers where possible.
 */
async function syncAllBookingPassengers(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  bookingId: string,
  allPassengers: PassengerDetail[],
  primaryTicketNumber: string,
) {
  const existing = await tx.bookingPassenger.findMany({
    where: { bookingId },
    orderBy: { sortOrder: "asc" },
  });

  for (let i = 0; i < allPassengers.length; i++) {
    const pax = allPassengers[i]!;
    const row = existing[i];
    if (row) {
      await tx.bookingPassenger.update({
        where: { id: row.id },
        data: {
          sortOrder: i,
          fullName: pax.fullName,
          email: pax.email || "",
          phone: pax.phone || "",
          passportNumber: pax.passportNumber || "",
          nationality: pax.nationality || "",
        },
      });
    } else {
      await tx.bookingPassenger.create({
        data: {
          bookingId,
          sortOrder: i,
          fullName: pax.fullName,
          email: pax.email || "",
          phone: pax.phone || "",
          passportNumber: pax.passportNumber || "",
          nationality: pax.nationality || "",
          ticketNumber: i === 0 ? primaryTicketNumber : makeTicketNumber(),
        },
      });
    }
  }

  if (existing.length > allPassengers.length) {
    await tx.bookingPassenger.deleteMany({
      where: {
        id: { in: existing.slice(allPassengers.length).map((p) => p.id) },
      },
    });
  }
}

/** Admin edit of an existing booking — passengers, baggage, amount. */
export async function updateBookingAction(formData: FormData) {
  await requireAdmin();

  const parsed = updateBookingSchema.safeParse({
    id: formData.get("id"),
    passengerName: formData.get("passengerName"),
    email: formData.get("email"),
    passengerPhone: formData.get("passengerPhone") || "",
    passportNumber: formData.get("passportNumber") || "",
    nationality: formData.get("nationality") || "",
    extraBaggageKg: formData.get("extraBaggageKg") || "0",
    fareReleaseName: formData.get("fareReleaseName") || "",
    amountAud: formData.get("amountAud") || "0",
  });

  if (!parsed.success) {
    redirect(
      `/admin?tab=bookings&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid booking")}`,
    );
  }

  let extraPassengers: PassengerDetail[] = [];
  try {
    extraPassengers = parseExtraPassengers(formData);
  } catch (e) {
    redirect(
      `/admin?tab=bookings&error=${encodeURIComponent(
        e instanceof Error ? e.message : "Invalid extra passenger details",
      )}`,
    );
  }

  const data = parsed.data;
  const seatsBooked = 1 + extraPassengers.length;
  const amountPaidCents = Math.round(data.amountAud * 100);
  const allPassengers: PassengerDetail[] = [
    {
      fullName: data.passengerName,
      email: data.email,
      phone: data.passengerPhone || "",
      passportNumber: data.passportNumber || "",
      nationality: data.nationality || "",
    },
    ...extraPassengers,
  ];

  try {
    await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: data.id },
        include: { invoice: true },
      });
      if (!booking) throw new Error("Booking not found");
      if (booking.status === "cancelled") {
        throw new Error("Cancelled bookings cannot be edited");
      }

      const seatDelta = seatsBooked - booking.seatsBooked;
      if (seatDelta !== 0) {
        if (booking.status === "hold_expired") {
          throw new Error(
            "Cannot change passengers on an expired hold — create a new booking",
          );
        }
        if (!booking.fareReleaseId) {
          throw new Error(
            "Cannot adjust seats — this booking has no fare release to update inventory against",
          );
        }
        if (seatDelta > 0) {
          await decrementFareAndFlight(
            tx,
            booking.flightId,
            booking.fareReleaseId,
            seatDelta,
          );
          if (booking.returnFlightId && booking.returnFareReleaseId) {
            await decrementFareAndFlight(
              tx,
              booking.returnFlightId,
              booking.returnFareReleaseId,
              seatDelta,
            );
          }
        } else {
          await restoreFareAndFlight(
            tx,
            booking.flightId,
            booking.fareReleaseId,
            -seatDelta,
          );
          if (booking.returnFlightId && booking.returnFareReleaseId) {
            await restoreFareAndFlight(
              tx,
              booking.returnFlightId,
              booking.returnFareReleaseId,
              -seatDelta,
            );
          }
        }
      }

      await tx.booking.update({
        where: { id: booking.id },
        data: {
          passengerName: data.passengerName,
          email: data.email,
          passengerPhone: data.passengerPhone || "",
          passportNumber: data.passportNumber || "",
          nationality: data.nationality || "",
          seatsBooked,
          extraBaggageKg: data.extraBaggageKg,
          fareReleaseName: data.fareReleaseName || booking.fareReleaseName,
          amountPaidCents,
        },
      });

      await syncAllBookingPassengers(
        tx,
        booking.id,
        allPassengers,
        booking.ticketNumber,
      );

      if (booking.invoice) {
        // Sync customer + airfare so PDF totals (from line items) match.
        const airfareCents = airfareCentsForTargetAmount(
          amountPaidCents,
          booking.invoice,
        );
        await tx.invoice.update({
          where: { id: booking.invoice.id },
          data: {
            customerName: data.passengerName,
            customerEmail: data.email,
            customerPhone: data.passengerPhone || "",
            airfareCents,
            fareCents: airfareCents,
            amountCents: amountPaidCents,
            pdfBlobUrl: null,
            pdfBlobPathname: null,
          },
        });
      }
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirect(
      `/admin?tab=bookings&error=${encodeURIComponent(
        error instanceof Error ? error.message : "Failed to update booking",
      )}`,
    );
  }

  const refreshed = await prisma.booking.findUnique({
    where: { id: data.id },
    select: {
      bookingRef: true,
      invoice: { select: { invoiceNumber: true } },
    },
  });
  revalidatePath("/admin");
  revalidatePath(`/confirmation/${data.id}`);
  if (refreshed?.bookingRef) {
    revalidatePath(`/documents/eticket/${refreshed.bookingRef}`);
  }
  if (refreshed?.invoice?.invoiceNumber) {
    revalidatePath(`/documents/invoice/${refreshed.invoice.invoiceNumber}`);
  }
  redirect("/admin?tab=bookings&saved=booking-updated");
}
