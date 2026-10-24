"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import {
  buildCargoAnswers,
  cargoBookingFromForm,
} from "@/lib/cargo/bookingForm";
import { flightPayloadFromRow, formatKg } from "@/lib/cargo/capacity";
import { cargoGstRateBpsFromEnv, priceCargoCharges } from "@/lib/cargo/gst";
import { canonicalNotificationKey } from "@/lib/cargo/lifecycle";
import { processCargoNotifications } from "@/lib/cargo/notifications";
import { allocateCargoParcelNumber } from "@/lib/cargo/parcelNumber";
import { formatFlightDateTime } from "@/lib/datetime";
import { prisma } from "@/lib/db";
import { airportCity } from "@/lib/format";
import {
  failFromUnknown,
  formFail,
  zodFieldErrors,
  type FormActionResult,
} from "@/lib/forms/formAction";
import { getSiteSettings } from "@/lib/settings";
import {
  optionSoldOnOrigin,
  quoteCargoWeightOption,
} from "@/lib/cargo/weightOptions";

/**
 * Public cargo booking. Weight is checked against the payload left on the
 * chosen departure after seated passengers, then committed with a conditional
 * update so two simultaneous bookings cannot oversell the hold.
 */
export async function submitCargoBookingAction(
  _prev: FormActionResult | null,
  formData: FormData,
): Promise<FormActionResult> {
  const parsed = cargoBookingFromForm(formData);
  if (!parsed.success) {
    return formFail(
      parsed.error.issues[0]?.message ?? "Please fix the highlighted fields",
      zodFieldErrors(parsed.error),
    );
  }
  const input = parsed.data;
  const clientRequestId = String(formData.get("clientRequestId") || "")
    .trim()
    .slice(0, 80);

  if (clientRequestId) {
    const existing = await prisma.cargoSubmission.findUnique({
      where: { clientRequestId },
      select: { parcelNumber: true },
    });
    if (existing) {
      revalidatePath("/admin");
      revalidatePath("/cargo");
      redirect(`/cargo/booked/${encodeURIComponent(existing.parcelNumber)}`);
    }
  }

  let parcelNumber = "";
  try {
    const settings = await getSiteSettings();
    const flight = await prisma.flight.findFirst({
      where: { id: input.flightId, active: true, deletedAt: null },
    });
    if (!flight) {
      return formFail("That flight is no longer available", {
        flightId: "Choose another departure",
      });
    }

    const option = await prisma.cargoWeightOption.findFirst({
      where: { id: input.weightOptionId, active: true },
    });
    if (!option) {
      return formFail("That weight option is no longer on sale", {
        weightOptionId: "Choose another weight option",
      });
    }
    if (!optionSoldOnOrigin(option, flight.origin)) {
      return formFail(
        `${option.name} is not sold on ${airportCity(flight.origin)} departures`,
        { weightOptionId: "Pick an option offered on this flight" },
      );
    }

    const quoted = quoteCargoWeightOption(option, input.actualKg);
    if (!quoted.ok) {
      return formFail(quoted.error, {
        actualKg: quoted.error,
        weightOptionId: quoted.error,
      });
    }

    const payload = flightPayloadFromRow(flight, settings.passengerPayloadKg);
    if (quoted.weightKg > payload.availableKg) {
      return formFail(
        `Only ${formatKg(payload.availableKg)} of cargo space is left on this flight`,
        {
          weightOptionId:
            payload.availableKg > 0
              ? `Choose a smaller option, or another flight`
              : "This flight is full — choose another departure",
        },
      );
    }

    const answers = buildCargoAnswers(
      input,
      {
        flightNumber: `${flight.airline} ${flight.flightNumber}`.trim(),
        originLabel: airportCity(flight.origin),
        destinationLabel: airportCity(flight.destination),
        departureLabel: formatFlightDateTime(flight.departureAt),
      },
      option,
      quoted.weightKg,
    );

    parcelNumber = await allocateCargoParcelNumber();
    const gstRateBps = cargoGstRateBpsFromEnv();
    const priced = priceCargoCharges({
      exclusiveCents: quoted.quotedCents,
      gstRateBps,
    });
    const pricedBtn = priceCargoCharges({
      exclusiveCents: quoted.quotedBtnCents,
      gstRateBps,
    });
    const quotedCents = priced.totalCents;
    const weightKg = quoted.weightKg;

    await prisma.$transaction(async (tx) => {
      // Re-check under the same guard we validated with — another booking may
      // have taken the space between the read above and here.
      const maxCargoKg = payload.payloadKg - payload.passengerKg;
      const claimed = await tx.flight.updateMany({
        where: {
          id: flight.id,
          active: true,
          cargoBookedKg: { lte: maxCargoKg - weightKg },
        },
        data: { cargoBookedKg: { increment: weightKg } },
      });
      if (claimed.count !== 1) {
        throw new Error(
          "That cargo space was just taken — please choose another flight",
        );
      }

      const created = await tx.cargoSubmission.create({
        data: {
          parcelNumber,
          status: "new",
          bookingStatus: "pending_payment",
          paymentStatus: "unpaid",
          flightId: flight.id,
          weightKg,
          pieces: input.pieces,
          quotedCents,
          freightCents: priced.freightCents,
          gstCents: priced.gstCents,
          gstRateBps: priced.gstRateBps,
          quotedBtnCents: pricedBtn.totalCents,
          freightBtnCents: pricedBtn.freightCents,
          gstBtnCents: pricedBtn.gstCents,
          cargoWeightOptionId: option.id,
          productName: option.name,
          answers: answers as Prisma.InputJsonValue,
          submitterName: input.senderName,
          email: input.senderEmail,
          phone: input.senderPhone,
          submittedAt: new Date(),
          clientRequestId: clientRequestId || null,
        },
      });
      await tx.cargoNotification.create({
        data: {
          cargoId: created.id,
          kind: "acknowledgement",
          status: "pending",
          idempotencyKey: canonicalNotificationKey(
            created.id,
            "acknowledgement",
          ),
        },
      });
    });
  } catch (error) {
    if (
      clientRequestId &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.cargoSubmission.findUnique({
        where: { clientRequestId },
        select: { parcelNumber: true },
      });
      if (existing) {
        parcelNumber = existing.parcelNumber;
      } else {
        console.error("submitCargoBookingAction", error);
        return failFromUnknown(error, "Could not submit your cargo booking");
      }
    } else {
      console.error("submitCargoBookingAction", error);
      return failFromUnknown(error, "Could not submit your cargo booking");
    }
  }

  const bookedParcel = parcelNumber;
  after(async () => {
    try {
      await processCargoNotifications(bookedParcel);
    } catch (error) {
      console.error("cargo booking acknowledgement failed", error);
    }
  });

  revalidatePath("/admin");
  revalidatePath("/cargo");
  redirect(`/cargo/booked/${encodeURIComponent(parcelNumber)}`);
}
