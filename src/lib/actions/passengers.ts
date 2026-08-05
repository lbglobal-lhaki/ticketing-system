"use server";

import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { syncQuoteSeatHold } from "@/lib/booking/inventory";
import {
  parseOnlineTravellersDraft,
  partyFareCents,
  seatedCountFromMix,
} from "@/lib/booking/passengers";
import { prisma } from "@/lib/db";
import { getSessionId } from "@/lib/session";

function fail(quoteId: string, message: string): never {
  redirect(
    `/checkout/${quoteId}/passengers?error=${encodeURIComponent(message)}`,
  );
}

function parseCount(raw: FormDataEntryValue | null, fallback: number, max: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(0, Math.floor(n)));
}

export async function savePassengerDetailsAction(formData: FormData) {
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  if (!quoteId) redirect("/?error=Quote+not+found");

  if (formData.get("privacyAccepted")?.toString() !== "on") {
    fail(quoteId, "Please accept the privacy policy to continue");
  }

  const sessionId = await getSessionId();
  const quote = await prisma.priceQuote.findUnique({
    where: { id: quoteId },
  });

  if (!quote || quote.sessionId !== sessionId) {
    redirect("/?error=Quote+not+found");
  }
  if (quote.status !== "active" || quote.expiresAt <= new Date()) {
    fail(quoteId, "This fare lock has expired — please select fares again");
  }

  try {
    const adults = Math.max(1, parseCount(formData.get("adults"), 1, 9));
    let children = parseCount(formData.get("children"), 0, 8);
    const infants = parseCount(formData.get("infants"), 0, 9);
    if (adults + children > 9) {
      children = Math.max(0, 9 - adults);
    }

    const seatsBooked = seatedCountFromMix(adults, children);
    if (seatsBooked < 1 || seatsBooked > 9) {
      fail(quoteId, "Seated travellers (adults + children) must be between 1 and 9");
    }

    // Adult package unit: prefer stored unit; legacy quotes used per-seat quotedPrice.
    const unitAdultFareCents =
      quote.unitAdultFareCents > 0
        ? quote.unitAdultFareCents
        : quote.quotedPriceCents;

    if (unitAdultFareCents <= 0) {
      fail(quoteId, "This fare is not priced yet — please select fares again");
    }

    const travellers = parseOnlineTravellersDraft(formData, {
      adults,
      children,
      infants,
    });
    const primary = travellers[0]!;

    const quotedPriceCents = partyFareCents({
      adultUnitFareCents: unitAdultFareCents,
      adults,
      children,
      infants,
    });

    const hold = await syncQuoteSeatHold(quoteId, sessionId, seatsBooked);
    if (!hold.ok) fail(quoteId, hold.error);

    await prisma.priceQuote.update({
      where: { id: quoteId },
      data: {
        passengerTitle: primary.title,
        passengerFirstName: primary.firstName,
        passengerLastName: primary.lastName,
        passengerEmail: primary.email || "",
        passengerPhone: primary.phone || "",
        passportNumber: primary.passportNumber || "",
        nationality: primary.nationality || "",
        seatsBooked,
        adultCount: adults,
        childCount: children,
        infantCount: infants,
        unitAdultFareCents,
        quotedPriceCents,
        travellersDraft: travellers as unknown as Prisma.InputJsonValue,
        privacyAccepted: true,
      },
    });
  } catch (error) {
    // redirect() throws a special error — must not be swallowed as a form error.
    if (isRedirectError(error)) throw error;
    fail(
      quoteId,
      error instanceof Error ? error.message : "Invalid passenger details",
    );
  }

  revalidatePath(`/checkout/${quoteId}`);
  revalidatePath(`/checkout/${quoteId}/passengers`);
  revalidatePath(`/checkout/${quoteId}/card`);
  revalidatePath(`/checkout/${quoteId}/bank`);
  redirect(`/checkout/${quoteId}`);
}
