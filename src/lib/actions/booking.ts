"use server";

import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { createPriceQuote } from "@/lib/booking/confirmBooking";
import { getSessionId } from "@/lib/session";

function parseCount(raw: FormDataEntryValue | null, fallback: number, max: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(0, Math.floor(n)));
}

export async function startCheckoutAction(
  flightId: string,
  returnFlightId?: string,
  fareProductId?: string,
) {
  const sessionId = await getSessionId();
  const result = await createPriceQuote({
    flightId,
    returnFlightId,
    sessionId,
    fareProductId,
    adults: 1,
    children: 0,
    infants: 0,
  });
  if (!result.ok) {
    return { error: result.error };
  }
  redirect(`/checkout/${result.quote.id}/passengers`);
}

export async function startCheckoutFormAction(formData: FormData) {
  try {
    const flightId = String(formData.get("flightId") ?? "").trim();
    const returnRaw = String(formData.get("returnFlightId") ?? "").trim();
    const fareProductId = String(formData.get("fareProductId") ?? "").trim();
    const returnFlightId = returnRaw || undefined;
    const adults = Math.max(1, parseCount(formData.get("adults"), 1, 9));
    const children = parseCount(formData.get("children"), 0, 8);
    const infants = parseCount(formData.get("infants"), 0, 9);

    if (!flightId) {
      redirect("/?error=Missing+flight");
    }
    if (!fareProductId) {
      redirect(
        `/flights/${flightId}?error=${encodeURIComponent("Please select a fare")}`,
      );
    }
    if (adults + children > 9) {
      redirect(
        `/flights/${flightId}?error=${encodeURIComponent(
          "Adults + children cannot exceed 9 seats",
        )}`,
      );
    }

    const sessionId = await getSessionId();
    const result = await createPriceQuote({
      flightId,
      returnFlightId,
      sessionId,
      fareProductId,
      adults,
      children,
      infants,
    });

    if (!result.ok) {
      redirect(
        `/flights/${flightId}?error=${encodeURIComponent(result.error)}`,
      );
    }

    redirect(`/checkout/${result.quote.id}/passengers`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("startCheckoutFormAction", error);
    const flightId = String(formData.get("flightId") ?? "").trim();
    redirect(
      flightId
        ? `/flights/${flightId}?error=${encodeURIComponent("Could not start checkout")}`
        : "/?error=Could+not+start+checkout",
    );
  }
}
