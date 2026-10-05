import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  const fares = await prisma.charterFareProduct.findMany({
    select: {
      code: true,
      name: true,
      cabinClass: true,
      priceCents: true,
      roundTripPriceCents: true,
      active: true,
    },
  });
  console.log("CHARTER", fares.length);
  for (const f of fares) {
    console.log(
      `${f.cabinClass} ${f.code} ow=${f.priceCents} rt=${f.roundTripPriceCents} active=${f.active}`,
    );
  }

  const now = new Date();
  const flights = await prisma.flight.findMany({
    where: { active: true, departureAt: { gte: now } },
    select: {
      flightNumber: true,
      origin: true,
      destination: true,
      pricingSource: true,
      remainingSeats: true,
      fareReleases: {
        select: {
          cabinClass: true,
          name: true,
          remainingSeats: true,
          priceCents: true,
          roundTripPriceCents: true,
          active: true,
        },
      },
      returnLegFlight: {
        select: { flightNumber: true, remainingSeats: true, active: true },
      },
    },
    take: 16,
    orderBy: { departureAt: "asc" },
  });
  console.log("FLIGHTS", flights.length);
  for (const fl of flights) {
    console.log(
      `${fl.flightNumber} ${fl.origin}>${fl.destination} ${fl.pricingSource} paired=${fl.returnLegFlight?.flightNumber ?? "none"} retSeats=${fl.returnLegFlight?.remainingSeats ?? "-"}`,
    );
    for (const r of fl.fareReleases) {
      console.log(
        `  ${r.cabinClass} ${r.name} ow=${r.priceCents} rt=${r.roundTripPriceCents} left=${r.remainingSeats} active=${r.active}`,
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
