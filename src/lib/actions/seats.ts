import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import type { TravellerDraft } from "@/lib/booking/passengers";
import { prisma } from "@/lib/db";
import { formFail, type FormActionResult } from "@/lib/forms/formAction";
import { occupiedSeatsForFlight } from "@/lib/seats/occupancy";
import { parseCabinClass, validateSeatPicks } from "@/lib/seats/selection";
import { getSessionId } from "@/lib/session";

export async function saveSeatSelectionAction(
  _prev: FormActionResult | null,
  formData: FormData,
): Promise<FormActionResult> {
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  if (!quoteId) redirect("/?error=Quote+not+found");

  const sessionId = await getSessionId();
  const quote = await prisma.priceQuote.findUnique({
    where: { id: quoteId },
    include: { fareRelease: { select: { cabinClass: true } } },
  });
  if (!quote || quote.sessionId !== sessionId) {
    redirect("/?error=Quote+not+found");
  }
  if (quote.status !== "active" || quote.expiresAt <= new Date()) {
    return formFail("This fare lock has expired — please select fares again");
  }

  const prev = Array.isArray(quote.travellersDraft)
    ? (quote.travellersDraft as TravellerDraft[])
    : [];
  if (prev.length === 0) {
    return formFail("Add passenger details before choosing seats");
  }

  const next: TravellerDraft[] = prev.map((t, i) => ({
    ...t,
    seatOutbound: String(formData.get(`seatOutbound_${i}`) ?? "")
      .trim()
      .toUpperCase(),
    seatReturn: String(formData.get(`seatReturn_${i}`) ?? "")
      .trim()
      .toUpperCase(),
  }));

  const cabin = parseCabinClass(quote.fareRelease?.cabinClass);
  const roundTrip = quote.tripType === "round_trip" && Boolean(quote.returnFlightId);

  try {
    const takenOutbound = await occupiedSeatsForFlight({
      flightId: quote.flightId,
      leg: "outbound",
      exceptQuoteId: quoteId,
    });
    const takenReturn =
      roundTrip && quote.returnFlightId
        ? await occupiedSeatsForFlight({
            flightId: quote.returnFlightId,
            leg: "return",
            exceptQuoteId: quoteId,
          })
        : new Set<string>();

    const invalid = validateSeatPicks({
      draft: next,
      cabin,
      roundTrip,
      takenOutbound,
      takenReturn,
    });
    if (invalid) return formFail(invalid);

    await prisma.priceQuote.update({
      where: { id: quoteId },
      data: {
        travellersDraft: next as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return formFail(
      error instanceof Error ? error.message : "Could not save seat selection",
    );
  }

  revalidatePath(`/checkout/${quoteId}`);
  revalidatePath(`/checkout/${quoteId}/seats`);
  revalidatePath(`/checkout/${quoteId}/card`);
  revalidatePath(`/checkout/${quoteId}/bank`);
  redirect(`/checkout/${quoteId}`);
}
