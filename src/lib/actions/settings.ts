"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";
import {
  failFromUnknown,
  formFail,
  zodFieldErrors,
  type FormActionResult,
} from "@/lib/forms/formAction";
import { SITE_SETTING_ID } from "@/lib/settings";

const aud = (max = 10_000) => z.coerce.number().min(0).max(max);

const settingsSchema = z.object({
  seatWindowAud: aud(),
  seatExitRowAud: aud(),
  seatStandardAud: aud(),
  cargoRatePerKgAud: aud(1_000),
  cargoMinChargeAud: aud(100_000),
  defaultPayloadKg: z.coerce.number().int().min(0).max(200_000),
  passengerPayloadKg: z.coerce
    .number()
    .int()
    .min(1, "Per-passenger weight must be at least 1 kg")
    .max(500),
});

const cents = (amount: number) => Math.round(amount * 100);

export async function updateSiteSettingsAction(
  _prev: FormActionResult | null,
  formData: FormData,
): Promise<FormActionResult> {
  await requireAdmin();

  const parsed = settingsSchema.safeParse({
    seatWindowAud: formData.get("seatWindowAud") || 0,
    seatExitRowAud: formData.get("seatExitRowAud") || 0,
    seatStandardAud: formData.get("seatStandardAud") || 0,
    cargoRatePerKgAud: formData.get("cargoRatePerKgAud") || 0,
    cargoMinChargeAud: formData.get("cargoMinChargeAud") || 0,
    defaultPayloadKg: formData.get("defaultPayloadKg") || 0,
    passengerPayloadKg: formData.get("passengerPayloadKg") || 100,
  });
  if (!parsed.success) {
    return formFail(
      parsed.error.issues[0]?.message ?? "Please fix the highlighted fields",
      zodFieldErrors(parsed.error),
    );
  }

  const data = {
    seatWindowCents: cents(parsed.data.seatWindowAud),
    seatExitRowCents: cents(parsed.data.seatExitRowAud),
    seatStandardCents: cents(parsed.data.seatStandardAud),
    cargoRatePerKgCents: cents(parsed.data.cargoRatePerKgAud),
    cargoMinChargeCents: cents(parsed.data.cargoMinChargeAud),
    defaultPayloadKg: parsed.data.defaultPayloadKg,
    passengerPayloadKg: parsed.data.passengerPayloadKg,
  };

  try {
    await prisma.siteSetting.upsert({
      where: { id: SITE_SETTING_ID },
      update: data,
      create: { id: SITE_SETTING_ID, ...data },
    });
  } catch (error) {
    console.error("updateSiteSettingsAction", error);
    return failFromUnknown(error, "Could not save settings");
  }

  revalidatePath("/admin");
  revalidatePath("/cargo");
  redirect("/admin?tab=settings&saved=settings-updated");
}
