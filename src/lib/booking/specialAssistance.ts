export const SPECIAL_ASSISTANCE_OTHER_MAX = 500;

export type SpecialAssistance = {
  wheelchair: boolean;
  language: boolean;
  other: string;
};

export const EMPTY_SPECIAL_ASSISTANCE: SpecialAssistance = {
  wheelchair: false,
  language: false,
  other: "",
};

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function asBool(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === 1;
}

export function parseSpecialAssistance(raw: unknown): SpecialAssistance {
  const rec = asRecord(raw);
  if (!rec) return { ...EMPTY_SPECIAL_ASSISTANCE };
  const other = String(rec.other ?? "").trim().slice(0, SPECIAL_ASSISTANCE_OTHER_MAX);
  return {
    wheelchair: asBool(rec.wheelchair),
    language: asBool(rec.language),
    other,
  };
}

export function specialAssistanceFromFormData(formData: FormData): SpecialAssistance {
  return {
    wheelchair: formData.get("specialAssistanceWheelchair") === "on",
    language: formData.get("specialAssistanceLanguage") === "on",
    other: String(formData.get("specialAssistanceOther") ?? "")
      .trim()
      .slice(0, SPECIAL_ASSISTANCE_OTHER_MAX),
  };
}

export function hasSpecialAssistance(raw: unknown): boolean {
  const value = parseSpecialAssistance(raw);
  return value.wheelchair || value.language || value.other.length > 0;
}

/** Compact JSON for Prisma Json columns — empty requests store `{}`. */
export function specialAssistanceToJson(
  raw: unknown,
): Record<string, boolean | string> {
  const value =
    raw instanceof FormData
      ? specialAssistanceFromFormData(raw)
      : parseSpecialAssistance(raw);
  if (!hasSpecialAssistance(value)) return {};
  const out: Record<string, boolean | string> = {};
  if (value.wheelchair) out.wheelchair = true;
  if (value.language) out.language = true;
  if (value.other) out.other = value.other;
  return out;
}

export function formatSpecialAssistance(raw: unknown): string {
  const value = parseSpecialAssistance(raw);
  const parts: string[] = [];
  if (value.wheelchair) parts.push("Wheelchair assistance");
  if (value.language) {
    parts.push("Assistance for non-English-speaking passengers");
  }
  if (value.other) parts.push(value.other);
  return parts.join(" · ");
}
