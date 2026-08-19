import type { ZodError } from "zod";

/** Map of form field `name` → first error message for that field. */
export type FieldErrors = Record<string, string>;

/**
 * Result of a form server action that should keep the filled-in values.
 * Success still uses `redirect()`; validation failures return this instead
 * of bouncing the user to `?error=` (which remounts the page and wipes the form).
 */
export type FormActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: FieldErrors;
};

export function formFail(
  error: string,
  fieldErrors?: FieldErrors,
): FormActionResult {
  return { ok: false, error, fieldErrors };
}

export function formOk(): FormActionResult {
  return { ok: true };
}

/** Flatten a Zod error into `{ fieldName: message }` using the issue path. */
export function zodFieldErrors(error: ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function firstErrorMessage(
  error: ZodError,
  fallback = "Please fix the highlighted fields",
) {
  return error.issues[0]?.message ?? fallback;
}

/** Thrown inside helpers so the parent action can return field errors. */
export class FormValidationError extends Error {
  fieldErrors: FieldErrors;

  constructor(message: string, fieldErrors?: FieldErrors) {
    super(message);
    this.name = "FormValidationError";
    this.fieldErrors = fieldErrors ?? {};
  }
}

export function failFromUnknown(error: unknown, fallback: string): FormActionResult {
  if (error instanceof FormValidationError) {
    return formFail(error.message, error.fieldErrors);
  }
  if (error instanceof Error && error.message) {
    return formFail(error.message);
  }
  return formFail(fallback);
}
