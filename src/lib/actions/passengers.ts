"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { syncQuoteSeatHold } from "@/lib/booking/inventory";
import { Prisma } from "@/generated/prisma/client";
import {
  parseOnlineTravellersDraft,
  seatedCountFromMix,
} from "@/lib/booking/passengers";
import { prisma } from "@/lib/db";
import { getSessionId } from "@/lib/session";

function fail(quoteId: string, message: string): never {
  redirect(
    `/checkout/${quoteId}/passengers?error=${encodeURIComponent(message)}`,
  );
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

  const isPartyQuote = quote.unitAdultFareCents > 0;

  try {
    if (isPartyQuote) {
      const adults = Math.max(1, quote.adultCount || 1);
      const children = Math.max(0, quote.childCount || 0);
      const infants = Math.max(0, quote.infantCount || 0);
      const seatsBooked = seatedCountFromMix(adults, children);

      const travellers = parseOnlineTravellersDraft(formData, {
        adults,
        children,
        infants,
      });
      const primary = travellers[0]!;

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
          travellersDraft: travellers as unknown as Prisma.InputJsonValue,
          privacyAccepted: true,
        },
      });
    } else {
      // Legacy quotes: one named adult + optional seat multiplier.
      const seatsRaw = Number(formData.get("seatsBooked") || "1");
      const seatsBooked = Math.min(
        9,
        Math.max(1, Number.isFinite(seatsRaw) ? Math.floor(seatsRaw) : 1),
      );
      const travellers = parseOnlineTravellersDraft(formData, {
        adults: 1,
        children: 0,
        infants: 0,
      });
      const primary = travellers[0]!;

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
          travellersDraft: travellers as unknown as Prisma.InputJsonValue,
          privacyAccepted: true,
        },
      });
    }
  } catch (error) {
    fail(
      quoteId,
      error instanceof Error ? error.message : "Invalid passenger details",
    );
  }

  revalidatePath(`/checkout/${quoteId}`);
  redirect(`/checkout/${quoteId}`);
}
