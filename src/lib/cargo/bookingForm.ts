import { z } from "zod";

/**
 * Shared definition of the public cargo booking form.
 *
 * The question titles below are the ones `cargoDocument.ts`, `cargoTemplates.ts`
 * and `parties.ts` already look for, so a booking taken here renders through the
 * existing PDF and sender/receiver emails with no downstream changes. Keep the
 * strings in sync with those readers when adding a question.
 */
export const CARGO_Q = {
  direction: "Direction",
  flightDate: "Flight Date",
  flightNumber: "Flight Number",

  pieces: "Number of Packages",
  weight: "Estimated Weight (kg)",
  dimensions: "Dimensions (Length × Width × Height)",
  declaredValue: "Declared Cargo Value",
  description: "Cargo description",
  classification: "Tick all that apply",
  packaging: "Packaging Type",
  specialHandling: "Special Handling",

  senderName: "Sender Name",
  senderCompany: "Company Name (if applicable)",
  senderAddress: "Residential Address",
  senderCity: "City",
  senderCountry: "Country",
  senderPhone: "Phone Number",
  senderEmail: "Email Address",
  senderPassport: "Passport Number",

  receiverName: "Receiver Name",
  receiverCompany: "Receiver Company",
  receiverAddress: "Receiver Address",
  receiverPhone: "Receiver Phone",
  receiverEmail: "Receiver Email",
  receiverPassport: "Receiver Passport",
  relationship: "Relationship to Sender",

  dangerousGoods: "Does your shipment contain any of the following?",
  biosecurity: "Biosecurity Declaration",
  insurance: "Would you like cargo insurance?",
  insuranceAmount: "Insurance Amount Requested",
  paymentMethod: "Payment Method",
  terms: "Terms & Conditions",
} as const;

export const CARGO_CLASSIFICATIONS = [
  "Personal effects",
  "Household goods",
  "Documents",
  "Clothing",
  "Electronics",
  "Commercial goods",
  "Food products",
  "Gifts",
  "Handicrafts",
  "Other",
] as const;

export const CARGO_PACKAGING = [
  "Carton",
  "Suitcase",
  "Wooden crate",
  "Pallet",
  "Plastic container",
  "Other",
] as const;

export const CARGO_HANDLING = [
  "Fragile",
  "Keep upright",
  "Handle with care",
  "Do not stack",
  "Temperature sensitive",
  "High value",
] as const;

export const CARGO_RESTRICTED = [
  "Lithium batteries or power banks",
  "Aerosols, paints or flammable liquids",
  "Compressed gas cylinders",
  "Firearms, ammunition or weapons",
  "Perishable food or plant material",
  "Live animals",
] as const;

export const CARGO_PAYMENT_METHODS = [
  "Bank transfer",
  "Credit or debit card",
  "Cash on drop-off",
] as const;

export const CARGO_DESCRIPTION_MAX = 600;

const trimmed = (max: number) => z.string().trim().max(max);
const required = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max);

export const cargoBookingSchema = z.object({
  flightId: required("Flight", 40),

  pieces: z.coerce
    .number({ message: "Enter the number of packages" })
    .int("Use a whole number")
    .min(1, "At least one package")
    .max(500, "Contact us directly for shipments over 500 packages"),
  weightKg: z.coerce
    .number({ message: "Enter the total weight" })
    .int("Round to the nearest kilogram")
    .min(1, "Enter a weight of at least 1 kg")
    .max(13_000, "That exceeds the aircraft payload"),
  dimensions: trimmed(200),
  declaredValueAud: z.coerce
    .number({ message: "Enter the declared value" })
    .min(0, "Declared value cannot be negative")
    .max(1_000_000),
  description: required("Cargo description", CARGO_DESCRIPTION_MAX),
  classification: z.array(z.string().trim()).default([]),
  packaging: trimmed(80),
  specialHandling: z.array(z.string().trim()).default([]),

  senderName: required("Sender name", 120),
  senderCompany: trimmed(120),
  senderAddress: required("Sender address", 200),
  senderCity: trimmed(80),
  senderCountry: trimmed(80),
  senderPhone: required("Sender phone", 40),
  senderEmail: z.string().trim().email("Enter a valid email address").max(160),
  senderPassport: trimmed(40),

  receiverName: required("Receiver name", 120),
  receiverCompany: trimmed(120),
  receiverAddress: required("Receiver address", 200),
  receiverPhone: required("Receiver phone", 40),
  receiverEmail: z
    .string()
    .trim()
    .max(160)
    .refine((v) => v === "" || z.string().email().safeParse(v).success, {
      message: "Enter a valid email address",
    }),
  receiverPassport: trimmed(40),
  relationship: trimmed(80),

  restricted: z.array(z.string().trim()).default([]),
  biosecurityDeclared: z.literal(true, {
    message: "Please confirm the biosecurity declaration",
  }),
  insurance: z.enum(["Yes", "No"]).default("No"),
  insuranceAmountAud: z.coerce.number().min(0).max(1_000_000).default(0),
  paymentMethod: required("Payment method", 60),
  termsAccepted: z.literal(true, {
    message: "Please accept the terms and conditions",
  }),
});

export type CargoBookingInput = z.infer<typeof cargoBookingSchema>;

function listOr(values: readonly string[], fallback: string) {
  const cleaned = values.map((v) => v.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(", ") : fallback;
}

function aud(amount: number) {
  return `A$${amount.toFixed(2)}`;
}

/**
 * Flatten a validated booking into the question → answer map stored on
 * `CargoSubmission.answers`, so the cargo PDF and emails read it unchanged.
 */
export function buildCargoAnswers(
  input: CargoBookingInput,
  flight: {
    flightNumber: string;
    originLabel: string;
    destinationLabel: string;
    departureLabel: string;
  },
): Record<string, string> {
  return {
    [CARGO_Q.direction]: `${flight.originLabel} → ${flight.destinationLabel}`,
    [CARGO_Q.flightDate]: flight.departureLabel,
    [CARGO_Q.flightNumber]: flight.flightNumber,

    [CARGO_Q.pieces]: String(input.pieces),
    [CARGO_Q.weight]: String(input.weightKg),
    [CARGO_Q.dimensions]: input.dimensions,
    [CARGO_Q.declaredValue]: aud(input.declaredValueAud),
    [CARGO_Q.description]: input.description,
    [CARGO_Q.classification]: listOr(input.classification, "Not specified"),
    [CARGO_Q.packaging]: input.packaging || "Not specified",
    [CARGO_Q.specialHandling]: listOr(input.specialHandling, "None"),

    [CARGO_Q.senderName]: input.senderName,
    [CARGO_Q.senderCompany]: input.senderCompany,
    [CARGO_Q.senderAddress]: input.senderAddress,
    [CARGO_Q.senderCity]: input.senderCity,
    [CARGO_Q.senderCountry]: input.senderCountry,
    [CARGO_Q.senderPhone]: input.senderPhone,
    [CARGO_Q.senderEmail]: input.senderEmail,
    [CARGO_Q.senderPassport]: input.senderPassport,

    [CARGO_Q.receiverName]: input.receiverName,
    [CARGO_Q.receiverCompany]: input.receiverCompany,
    [CARGO_Q.receiverAddress]: input.receiverAddress,
    [CARGO_Q.receiverPhone]: input.receiverPhone,
    [CARGO_Q.receiverEmail]: input.receiverEmail,
    [CARGO_Q.receiverPassport]: input.receiverPassport,
    [CARGO_Q.relationship]: input.relationship,

    [CARGO_Q.dangerousGoods]: listOr(input.restricted, "None of the above"),
    [CARGO_Q.biosecurity]:
      "Declared — no undeclared food, plant or animal material",
    [CARGO_Q.insurance]: input.insurance,
    [CARGO_Q.insuranceAmount]:
      input.insurance === "Yes" && input.insuranceAmountAud > 0
        ? aud(input.insuranceAmountAud)
        : "",
    [CARGO_Q.paymentMethod]: input.paymentMethod,
    [CARGO_Q.terms]: "Accepted",
  };
}

/** Read a validated booking out of the posted form. */
export function cargoBookingFromForm(formData: FormData) {
  const str = (key: string) => String(formData.get(key) ?? "");
  const list = (key: string) => formData.getAll(key).map(String);
  const bool = (key: string) => formData.get(key) === "on";

  return cargoBookingSchema.safeParse({
    flightId: str("flightId"),
    pieces: str("pieces"),
    weightKg: str("weightKg"),
    dimensions: str("dimensions"),
    declaredValueAud: str("declaredValueAud") || "0",
    description: str("description"),
    classification: list("classification"),
    packaging: str("packaging"),
    specialHandling: list("specialHandling"),
    senderName: str("senderName"),
    senderCompany: str("senderCompany"),
    senderAddress: str("senderAddress"),
    senderCity: str("senderCity"),
    senderCountry: str("senderCountry"),
    senderPhone: str("senderPhone"),
    senderEmail: str("senderEmail"),
    senderPassport: str("senderPassport"),
    receiverName: str("receiverName"),
    receiverCompany: str("receiverCompany"),
    receiverAddress: str("receiverAddress"),
    receiverPhone: str("receiverPhone"),
    receiverEmail: str("receiverEmail"),
    receiverPassport: str("receiverPassport"),
    relationship: str("relationship"),
    restricted: list("restricted"),
    biosecurityDeclared: bool("biosecurityDeclared"),
    insurance: str("insurance") === "Yes" ? "Yes" : "No",
    insuranceAmountAud: str("insuranceAmountAud") || "0",
    paymentMethod: str("paymentMethod"),
    termsAccepted: bool("termsAccepted"),
  });
}
