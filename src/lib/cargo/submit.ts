import { z } from "zod";

export const cargoAnswerValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

export const cargoSubmitSchema = z.object({
  googleResponseId: z.string().trim().min(1).max(200).optional(),
  submittedAt: z.string().trim().min(1).max(80).optional(),
  answers: z.record(z.string(), cargoAnswerValueSchema),
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(60).optional().or(z.literal("")),
});

export type CargoAnswers = Record<
  string,
  string | number | boolean | string[]
>;

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function answerAsString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const joined = value.map(String).join(", ").trim();
    return joined || null;
  }
  return null;
}

/** Pull name/email/phone from explicit fields or common form question titles. */
export function extractCargoContacts(input: {
  answers: CargoAnswers;
  name?: string;
  email?: string;
  phone?: string;
}) {
  const byNorm = new Map<string, unknown>();
  for (const [key, value] of Object.entries(input.answers)) {
    byNorm.set(normalizeKey(key), value);
  }

  const pick = (...candidates: string[]) => {
    for (const c of candidates) {
      const v = answerAsString(byNorm.get(normalizeKey(c)));
      if (v) return v;
    }
    return null;
  };

  const name =
    input.name?.trim() ||
    pick(
      "name",
      "full name",
      "your name",
      "submitter name",
      "contact name",
      "sender name",
      "shipper name",
    );

  const emailRaw =
    input.email?.trim() ||
    pick("email", "email address", "e-mail", "contact email");
  const email =
    emailRaw && z.string().email().safeParse(emailRaw).success
      ? emailRaw
      : emailRaw || null;

  const phone =
    input.phone?.trim() ||
    pick("phone", "phone number", "mobile", "mobile number", "contact number");

  return {
    submitterName: name || null,
    email: email || null,
    phone: phone || null,
  };
}

export function formatCargoAnswer(value: unknown): string {
  return answerAsString(value) ?? "—";
}
