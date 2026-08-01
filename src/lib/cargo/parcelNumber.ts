import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";

/** Human-facing cargo / parcel id, e.g. CGO-20260801-A3F91C. */
export function makeCargoParcelNumber(prefix = "CGO") {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const rand = randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
}

/** Allocate a unique parcel number (retries on the rare collision). */
export async function allocateCargoParcelNumber() {
  for (let attempt = 0; attempt < 8; attempt++) {
    const parcelNumber = makeCargoParcelNumber();
    const existing = await prisma.cargoSubmission.findUnique({
      where: { parcelNumber },
      select: { id: true },
    });
    if (!existing) return parcelNumber;
  }
  // Extremely unlikely fallback — longer entropy.
  return `CGO-${Date.now()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}
