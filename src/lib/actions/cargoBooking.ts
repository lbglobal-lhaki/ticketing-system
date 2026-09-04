"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import {
  buildCargoAnswers,
  cargoBookingFromForm,
} from "@/lib/cargo/bookingForm";
import {
  cargoQuoteCents,
  flightPayloadFromRow,
  formatKg,
} from "@/lib/cargo/capacity";
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

  let parcelNumber = "";
  try {
    const settings = await getSiteSettings();
    const flight = await prisma.flight.findFirst({
      where: { id: input.flightId, active: true },
    });
    if (!flight) {
      return formFail("That flight is no longer available", {
        flightId: "Choose another departure",
      });
    }

    const payload = flightPayloadFromRow(flight, settings.passengerPayloadKg);
    if (input.weightKg > payload.availableKg) {
      return formFail(
        `Only ${formatKg(payload.availableKg)} of cargo space is left on this flight`,
        {
          weightKg:
            payload.availableKg > 0
              ? `Reduce to ${formatKg(payload.availableKg)} or choose another flight`
              : "This flight is full — choose another departure",
        },
      );
    }

    const answers = buildCargoAnswers(input, {
      flightNumber: `${flight.airline} ${flight.flightNumber}`.trim(),
      originLabel: airportCity(flight.origin),
      destinationLabel: airportCity(flight.destination),
      departureLabel: formatFlightDateTime(flight.departureAt),
    });

    parcelNumber = await allocateCargoParcelNumber();
    const quotedCents = cargoQuoteCents(input.weightKg, settings);

    await prisma.$transaction(async (tx) => {
      // Re-check under the same guard we validated with — another booking may
      // have taken the space between the read above and here.
      const maxCargoKg = payload.payloadKg - payload.passengerKg;
      const claimed = await tx.flight.updateMany({
        where: {
          id: flight.id,
          active: true,
          cargoBookedKg: { lte: maxCargoKg - input.weightKg },
        },
        data: { cargoBookedKg: { increment: input.weightKg } },
      });
      if (claimed.count !== 1) {
        throw new Error(
          "That cargo space was just taken — please choose another flight",
        );
      }

      await tx.cargoSubmission.create({
        data: {
          parcelNumber,
          status: "new",
          flightId: flight.id,
          weightKg: input.weightKg,
          pieces: input.pieces,
          quotedCents,
          answers: answers as Prisma.InputJsonValue,
          submitterName: input.senderName,
          email: input.senderEmail,
          phone: input.senderPhone,
          submittedAt: new Date(),
        },
      });
    });
  } catch (error) {
    console.error("submitCargoBookingAction", error);
    return failFromUnknown(error, "Could not submit your cargo booking");
  }

  revalidatePath("/admin");
  revalidatePath("/cargo");
  redirect(`/cargo/booked/${encodeURIComponent(parcelNumber)}`);
}
