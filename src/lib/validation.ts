import { z } from "zod";

export const searchSchema = z
  .object({
    origin: z
      .string()
      .trim()
      .min(3, "Origin airport code required")
      .max(3)
      .transform((v) => v.toUpperCase()),
    destination: z
      .string()
      .trim()
      .min(3, "Destination airport code required")
      .max(3)
      .transform((v) => v.toUpperCase()),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    tripType: z.enum(["one_way", "round_trip"]).default("one_way"),
    returnDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .optional()
      .or(z.literal("").transform(() => undefined)),
  })
  .superRefine((data, ctx) => {
    if (data.tripType === "round_trip") {
      if (!data.returnDate) {
        ctx.addIssue({
          code: "custom",
          message: "Return date is required for round trips",
          path: ["returnDate"],
        });
      } else if (data.returnDate < data.date) {
        ctx.addIssue({
          code: "custom",
          message: "Return date must be on or after departure",
          path: ["returnDate"],
        });
      }
    }
  });

export const bookingSchema = z.object({
  quoteId: z.string().min(1),
  passengerName: z.string().trim().min(2, "Name is required").max(120),
  email: z.string().trim().email("Valid email required"),
  passengerPhone: z.string().trim().max(40).optional().or(z.literal("")),
  passportNumber: z.string().trim().max(40).optional().or(z.literal("")),
  nationality: z.string().trim().max(60).optional().or(z.literal("")),
  seatsBooked: z.coerce.number().int().min(1).max(9).default(1),
});

export const adminLoginSchema = z.object({
  password: z.string().min(1),
});

export const fareReleaseInputSchema = z.object({
  cabinClass: z.enum(["economy", "business"]),
  name: z.string().trim().min(1).max(80),
  totalSeats: z.coerce.number().int().min(0).max(800),
  remainingSeats: z.coerce.number().int().min(0).max(800).optional(),
  priceAud: z.coerce.number().min(0).max(100000),
  roundTripPriceAud: z.coerce.number().min(0).max(100000).default(0),
  sortOrder: z.coerce.number().int().min(1).max(20),
});

export const flightFormSchema = z.object({
  airline: z.string().trim().min(2, "Airline is required").max(80),
  flightNumber: z.string().trim().min(2, "Flight number is required").max(16),
  origin: z
    .string()
    .trim()
    .length(3, "Use a 3-letter airport code")
    .transform((v) => v.toUpperCase()),
  destination: z
    .string()
    .trim()
    .length(3, "Use a 3-letter airport code")
    .transform((v) => v.toUpperCase()),
  departureAt: z.string().min(1, "Departure date/time required"),
  arrivalAt: z.string().min(1, "Arrival date/time required"),
});

/**
 * Fare releases for one flight, across every cabin it sells. Each row carries
 * its own cabin, so business and economy buckets arrive in a single submission
 * — the flight form lists them under cabin headings rather than the admin
 * creating a separate flight per cabin.
 */
export function parseFareReleasesFromForm(formData: FormData) {
  const cabins = formData.getAll("fareCabinClass").map(String);
  const names = formData.getAll("fareName").map(String);
  const totals = formData.getAll("fareTotalSeats").map(String);
  const remainings = formData.getAll("fareRemainingSeats").map(String);
  const prices = formData.getAll("farePriceAud").map(String);
  const roundTripPrices = formData.getAll("fareRoundTripPriceAud").map(String);
  const orders = formData.getAll("fareSortOrder").map(String);
  const ids = formData.getAll("fareReleaseId").map(String);

  const releases = names.map((name, i) =>
    fareReleaseInputSchema.parse({
      cabinClass: cabins[i] || "economy",
      name,
      totalSeats: totals[i] ?? "0",
      remainingSeats: remainings[i] || totals[i] || "0",
      priceAud: prices[i] || "0",
      roundTripPriceAud: roundTripPrices[i] || "0",
      sortOrder: orders[i] || String(i + 1),
    }),
  );

  if (releases.length === 0) {
    throw new Error("Add at least one fare release");
  }

  const seatSum = releases.reduce((s, r) => s + r.totalSeats, 0);
  if (seatSum < 1) {
    throw new Error("Total seats across fare releases must be at least 1");
  }

  // A cabin whose buckets all hold 0 seats can never be sold; that is almost
  // always a half-filled form rather than a deliberate "no business class".
  for (const cabin of ["business", "economy"] as const) {
    const inCabin = releases.filter((r) => r.cabinClass === cabin);
    if (inCabin.length > 0 && inCabin.every((r) => r.totalSeats === 0)) {
      throw new Error(
        `${cabin === "business" ? "Business" : "Economy"} has fare releases but no seats — set seats or remove the cabin`,
      );
    }
  }

  return releases.map((r, i) => ({
    id: ids[i]?.trim() || undefined,
    cabinClass: r.cabinClass,
    name: r.name,
    sortOrder: r.sortOrder,
    totalSeats: r.totalSeats,
    remainingSeats: Math.min(r.remainingSeats ?? r.totalSeats, r.totalSeats),
    priceCents: Math.round(r.priceAud * 100),
    roundTripPriceCents: Math.round(r.roundTripPriceAud * 100),
  }));
}
