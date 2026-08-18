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

/** Stamp child 75% / infant 10% of the adult unit onto companion rows. */
export function applyCatalogueCompanionFares(
  travellers: TravellerDetail[],
  adultUnitCents: number,
): TravellerDetail[] {
  const unit = Math.max(0, adultUnitCents);
  if (unit <= 0) return travellers;
  return travellers.map((t) => {
    if (t.passengerType === "child") {
      return { ...t, priceCents: childFareCents(unit) };
    }
    if (t.passengerType === "infant") {
      return { ...t, priceCents: infantFareCents(unit) };
    }
    return t;
  });
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
  /** YYYY-MM-DD. Required for child/infant. */
  dateOfBirth?: string;
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
  /** Required for child/infant. Adults leave this null. */
  dateOfBirth: Date | null;
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

/** Infant: younger than 1 on the flight date. Child: 1 through 10. Adult: 11+. */
export const INFANT_MAX_AGE_YEARS = 1;
export const CHILD_MAX_AGE_YEARS = 11;

export const ADULT_AGE_HINT = "11+ years · full fare";
export const CHILD_AGE_HINT = "1–10 years · 75% of adult fare · seat";
export const INFANT_AGE_HINT = "Under 1 year · 10% of adult fare · no seat";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Calendar date as YYYY-MM-DD (UTC), for <input type="date" />. */
export function formatDateOfBirth(
  date: Date | string | null | undefined,
): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function formatDateOfBirthDisplay(
  date: Date | string | null | undefined,
): string {
  const iso = formatDateOfBirth(date);
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).toLocaleDateString(
    "en-AU",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    },
  );
}

/** Parse YYYY-MM-DD into a UTC-noon Date so the calendar day never shifts TZ. */
export function parseDateOfBirth(raw: string): Date {
  const match = String(raw ?? "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error("Date of birth is required");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Invalid date of birth");
  }
  return date;
}

function utcYmd(date: Date) {
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth(),
    d: date.getUTCDate(),
  };
}

/** Completed years of age on `onDate` (typically the outbound departure). */
export function completedAgeYears(dateOfBirth: Date, onDate: Date): number {
  const born = utcYmd(dateOfBirth);
  const on = utcYmd(onDate);
  let age = on.y - born.y;
  if (on.m < born.m || (on.m === born.m && on.d < born.d)) age -= 1;
  return age;
}

export function passengerTypeFromAge(ageYears: number): PassengerType {
  if (ageYears < INFANT_MAX_AGE_YEARS) return "infant";
  if (ageYears < CHILD_MAX_AGE_YEARS) return "child";
  return "adult";
}

export function assertDobMatchesType(
  dateOfBirth: Date,
  type: PassengerType,
  onDate: Date,
  who = passengerTypeLabel(type),
): void {
  const on = utcYmd(onDate);
  const born = utcYmd(dateOfBirth);
  if (
    born.y > on.y ||
    (born.y === on.y && born.m > on.m) ||
    (born.y === on.y && born.m === on.m && born.d > on.d)
  ) {
    throw new Error(`${who}: date of birth cannot be after the flight date`);
  }
  const age = completedAgeYears(dateOfBirth, onDate);
  const expected = passengerTypeFromAge(age);
  if (type === "infant" && expected !== "infant") {
    throw new Error(
      `${who}: must be under 1 year old on the departure date. Book them as a ${expected} instead.`,
    );
  }
  if (type === "child" && expected !== "child") {
    throw new Error(
      expected === "infant"
        ? `${who}: must be 1–10 years old on the departure date. Book them as an infant instead.`
        : `${who}: must be 1–10 years old on the departure date. Book them as an adult instead.`,
    );
  }
}

export function assertChildInfantAges(
  travellers: Array<{
    passengerType: PassengerType;
    dateOfBirth: Date | null;
    fullName?: string;
  }>,
  ageOn: Date,
): void {
  let childN = 0;
  let infantN = 0;
  for (const t of travellers) {
    if (t.passengerType !== "child" && t.passengerType !== "infant") continue;
    const n = t.passengerType === "child" ? ++childN : ++infantN;
    const who = t.fullName?.trim()
      ? t.fullName.trim()
      : `${passengerTypeLabel(t.passengerType)} ${n}`;
    if (!t.dateOfBirth) {
      throw new Error(`${who}: date of birth is required`);
    }
    assertDobMatchesType(t.dateOfBirth, t.passengerType, ageOn, who);
  }
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
  dateOfBirth: z.date().nullable(),
  priceCents: z.literal(0).default(0),
});

const pricedSchema = z.object({
  ...baseFields,
  passengerType: z.enum(["child", "infant"]),
  dateOfBirth: z.date(),
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

  const passports = formData.getAll(`${prefix}PassengerPassport`).map(String);
  const nationalities = formData
    .getAll(`${prefix}PassengerNationality`)
    .map(String);
  const prices = formData.getAll(`${prefix}PassengerPriceAud`).map(String);
  const dobs = formData.getAll(`${prefix}PassengerDateOfBirth`).map(String);

  return names.map((fullName, i) => {
    let priceCents = 0;
    if (type === "child" || type === "infant") {
      const rawPrice = (prices[i] ?? "").trim();
      if (rawPrice) {
        try {
          priceCents = moneyAudToCents(rawPrice);
        } catch (e) {
          throw new Error(
            `${passengerTypeLabel(type)} ${i + 1}: ${
              e instanceof Error ? e.message : "invalid price"
            }`,
          );
        }
      }
    }

    let dateOfBirth: Date | null = null;
    if (type === "child" || type === "infant") {
      try {
        dateOfBirth = parseDateOfBirth(dobs[i] ?? "");
      } catch (e) {
        throw new Error(
          `${passengerTypeLabel(type)} ${i + 1}: ${
            e instanceof Error ? e.message : "invalid date of birth"
          }`,
        );
      }
    }

    const raw = {
      fullName,
      // Companions have no contact fields; only the primary passenger does.
      email: "",
      phone: "",
      passportNumber: passports[i] ?? "",
      nationality: nationalities[i] ?? "",
      passengerType: type,
      dateOfBirth,
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
  dateOfBirth: z.string().trim().optional().or(z.literal("")),
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
  ageOn: Date,
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
      dateOfBirth: String(formData.get(`dateOfBirth_${i}`) ?? ""),
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

    let dateOfBirth = "";
    if (expectedType === "child" || expectedType === "infant") {
      try {
        const dob = parseDateOfBirth(parsed.data.dateOfBirth || "");
        assertDobMatchesType(
          dob,
          expectedType,
          ageOn,
          `${passengerTypeLabel(expectedType)} ${i + 1}`,
        );
        dateOfBirth = formatDateOfBirth(dob);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "invalid date of birth";
        if (
          msg.startsWith("Child ") ||
          msg.startsWith("Infant ") ||
          msg.startsWith("Adult ")
        ) {
          throw e instanceof Error ? e : new Error(msg);
        }
        throw new Error(
          `${passengerTypeLabel(expectedType)} ${i + 1}: ${msg}`,
        );
      }
    }

    out.push({
      passengerType: parsed.data.passengerType,
      title: parsed.data.title,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      passportNumber: parsed.data.passportNumber || "",
      nationality: parsed.data.nationality || "",
      dateOfBirth,
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
