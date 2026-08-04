import { releaseQuoteHold } from "@/lib/booking/inventory";
import { withDbRetry } from "@/lib/db";
import { getSessionId } from "@/lib/session";

export async function getActiveCartQuotes() {
  const sessionId = await getSessionId();
  if (!sessionId) return [];

  const now = new Date();
  const items = await withDbRetry((db) =>
    db.priceQuote.findMany({
      where: {
        sessionId,
        status: "active",
        expiresAt: { gt: now },
      },
      include: {
        flight: true,
        returnFlight: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  );

  // One active hold per session — release older leftovers.
  if (items.length > 1) {
    await Promise.all(items.slice(1).map((q) => releaseQuoteHold(q.id)));
    return items.slice(0, 1);
  }

  return items;
}

export async function getCartCount() {
  const items = await getActiveCartQuotes();
  return items.length;
}
