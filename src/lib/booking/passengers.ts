import { z } from "zod";

export const PASSENGER_TYPES = ["adult", "child", "infant"] as const;
export type PassengerType = (typeof PASSENGER_TYPES)[number];

/** Online catalogue rates relative to the adult package fare. */
export const CHILD_FARE_RATE = 0.75;
export const INFANT_FARE_RATE = 0.1;

/** Child fare = 75% of adult (e.g. $1999 → $1499.25). */
export function childFareCents(adultUnitFareCents: number): number {
  return Math.round(Math.max(0, adultUnitFareCents) * CHILD_FARE_RATE);
}

/** Infant fare = 10% of adult (e.g. $1999 → $199.90). */
export function infantFareCents(adultUnitFareCents: number): number {
  return Math.round(Math.max(0, adultUnitFareCents) * INFANT_FARE_RATE);
}

/** Total party fare for online checkout (infants included, no seat). */
export function partyFareCents(input: {
  adultUnitFareCents: number;
  adults: number;
  children: number;
  infants: number;
}): number {
  const unit = Math.max(0, input.adultUnitFareCents);
  const adults = Math.max(0, Math.floor(input.adults));
  const children = Math.max(0, Math.floor(input.children));
  const infants = Math.max(0, Math.floor(input.infants));
  return (
    unit * adults +
    childFareCents(unit) * children +
    infantFareCents(unit) * infants
  );
}

export function seatedCountFromMix(adults: number, children: number): number {
  return Math.max(0, Math.floor(adults)) + Math.max(0, Math.floor(children));
}

/**
 * Party airfare for a quote. New quotes store the total in `quotedPriceCents`
 * with `unitAdultFareCents > 0`. Legacy quotes multiply unit × seats.
 */
export function quotePartyFareCents(quote: {
  quotedPriceCents: number;
  unitAdultFareCents?: number | null;
  seatsBooked?: number | null;
  adultCount?: number | null;
  childCount?: number | null;
  infantCount?: number | null;
}): number {
  if ((quote.unitAdultFareCents ?? 0) > 0) {
    return quote.quotedPriceCents;
  }
  return quote.quotedPriceCents * Math.max(1, quote.seatsBooked || 1);
}

export type TravellerDraft = {
  passengerType: PassengerType;
  title: string;
  firstName: string;
  lastName: string;
  passportNumber: string;
  nationality: string;
  /** Contact only required / used on the primary adult. */
  email?: string;
  phone?: string;
};

export function travellerDisplayName(t: {
  title?: string;
  firstName: string;
  lastName: string;
}): string {
  const last = t.lastName && t.lastName !== "—" ? t.lastName : "";
  const core = [t.firstName, last].filter(Boolean).join(" ").trim();
  const title = (t.title ?? "").trim();
  return [title, core].filter(Boolean).join(" ").trim();
}

export type TravellerDetail = {
  fullName: string;
  email: string;
  phone: string;
  passportNumber: string;
  nationality: string;
  passengerType: PassengerType;
  /** Admin-set fare for child/infant (cents). Adults use 0 (system fare). */
  priceCents: number;
};

export function allocatesSeat(type: PassengerType): boolean {
  return type !== "infant";
}

export function passengerTypeLabel(type: PassengerType | string): string {
  if (type === "child") return "Child";
  if (type === "infant") return "Infant";
  return "Adult";
}

const baseFields = {
  fullName: z.string().trim().min(2).max(120),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === "" || z.string().email().safeParse(v).success, {
      message: "Invalid email",
    }),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  passportNumber: z.string().trim().max(40).optional().or(z.literal("")),
  nationality: z.string().trim().max(60).optional().or(z.literal("")),
};

const adultSchema = z.object({
  ...baseFields,
  passengerType: z.literal("adult"),
  priceCents: z.literal(0).default(0),
});

const pricedSchema = z.object({
  ...baseFields,
  passengerType: z.enum(["child", "infant"]),
  priceCents: z.number().int().min(0).max(10_000_000),
});

function moneyAudToCents(raw: string): number {
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Price must be a valid amount ($0 or more)");
  }
  return Math.round(n * 100);
}

function parseNamedGroup(
  formData: FormData,
  prefix: "extra" | "child" | "infant",
  type: PassengerType,
): TravellerDetail[] {
  const names = formData.getAll(`${prefix}PassengerName`).map(String);
  if (names.length === 0) return [];
  if (names.length > 8) {
    throw new Error(`Maximum 8 ${type} passengers`);
  }

  const emails = formData.getAll(`${prefix}PassengerEmail`).map(String);
  const phones = formData.getAll(`${prefix}PassengerPhone`).map(String);
  const passports = formData.getAll(`${prefix}PassengerPassport`).map(String);
  const nationalities = formData
    .getAll(`${prefix}PassengerNationality`)
    .map(String);
  const prices = formData.getAll(`${prefix}PassengerPriceAud`).map(String);

  return names.map((fullName, i) => {
    let priceCents = 0;
    if (type === "child" || type === "infant") {
      try {
        priceCents = moneyAudToCents(prices[i] ?? "0");
      } catch (e) {
        throw new Error(
          `${passengerTypeLabel(type)} ${i + 1}: ${
            e instanceof Error ? e.message : "invalid price"
          }`,
        );
      }
    }

    const raw = {
      fullName,
      email: emails[i] ?? "",
      phone: phones[i] ?? "",
      passportNumber: passports[i] ?? "",
      nationality: nationalities[i] ?? "",
      passengerType: type,
      priceCents,
    };

    const parsed =
      type === "adult" ? adultSchema.safeParse(raw) : pricedSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `${passengerTypeLabel(type)} ${i + 1}: ${
          parsed.error.issues[0]?.message ?? "invalid details"
        }`,
      );
    }
    return parsed.data as TravellerDetail;
  });
}

/** Parse walk-in / edit form: extra adults + children + infants. */
export function parseCompanionTravellers(formData: FormData): {
  adults: TravellerDetail[];
  children: TravellerDetail[];
  infants: TravellerDetail[];
  all: TravellerDetail[];
  seatedCount: number;
  childFareCents: number;
  infantFareCents: number;
} {
  const adults = parseNamedGroup(formData, "extra", "adult");
  const children = parseNamedGroup(formData, "child", "child");
  const infants = parseNamedGroup(formData, "infant", "infant");
  const all = [...adults, ...children, ...infants];
  // Primary adult is counted separately by callers (+1).
  const seatedCount = adults.length + children.length;
  const childFareCents = children.reduce((s, c) => s + c.priceCents, 0);
  const infantFareCents = infants.reduce((s, c) => s + c.priceCents, 0);
  return {
    adults,
    children,
    infants,
    all,
    seatedCount,
    childFareCents,
    infantFareCents,
  };
}

export function seatedTravellerCount(travellers: TravellerDetail[]): number {
  return travellers.filter((t) => allocatesSeat(t.passengerType)).length;
}

const draftTravellerSchema = z.object({
  passengerType: z.enum(PASSENGER_TYPES),
  title: z.string().trim().min(1, "Select a title").max(20),
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  passportNumber: z.string().trim().max(40).optional().or(z.literal("")),
  nationality: z.string().trim().max(60).optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || z.string().email().safeParse(v).success, {
      message: "Invalid email",
    }),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
});

/**
 * Parse online checkout travellers from indexed form fields:
 * travellerType_0, title_0, firstName_0, ...
 * Expected order: adults, then children, then infants.
 */
export function parseOnlineTravellersDraft(
  formData: FormData,
  expected: { adults: number; children: number; infants: number },
): TravellerDraft[] {
  const adults = Math.max(1, Math.floor(expected.adults));
  const children = Math.max(0, Math.floor(expected.children));
  const infants = Math.max(0, Math.floor(expected.infants));
  const total = adults + children + infants;
  const out: TravellerDraft[] = [];

  for (let i = 0; i < total; i++) {
    let expectedType: PassengerType = "adult";
    if (i >= adults + children) expectedType = "infant";
    else if (i >= adults) expectedType = "child";

    const raw = {
      passengerType: String(formData.get(`travellerType_${i}`) || expectedType),
      title: String(formData.get(`title_${i}`) ?? ""),
      firstName: String(formData.get(`firstName_${i}`) ?? ""),
      lastName: String(formData.get(`lastName_${i}`) ?? ""),
      passportNumber: String(formData.get(`passportNumber_${i}`) ?? ""),
      nationality: String(formData.get(`nationality_${i}`) ?? ""),
      email: String(formData.get(`email_${i}`) ?? ""),
      phone: String(formData.get(`phone_${i}`) ?? ""),
    };

    const parsed = draftTravellerSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `${passengerTypeLabel(expectedType)} ${i + 1}: ${
          parsed.error.issues[0]?.message ?? "invalid details"
        }`,
      );
    }
    if (parsed.data.passengerType !== expectedType) {
      throw new Error(`Traveller ${i + 1} type mismatch`);
    }
    out.push({
      passengerType: parsed.data.passengerType,
      title: parsed.data.title,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      passportNumber: parsed.data.passportNumber || "",
      nationality: parsed.data.nationality || "",
      email: parsed.data.email || "",
      phone: parsed.data.phone || "",
    });
  }

  const primary = out[0];
  if (!primary?.email || !z.string().email().safeParse(primary.email).success) {
    throw new Error("Primary adult needs a valid email");
  }
  if (!primary.phone || primary.phone.trim().length < 6) {
    throw new Error("Primary adult needs a mobile number");
  }

  return out;
}
