"use server";

import { requireAdmin } from "@/lib/adminAuth";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { invalidateCharterFareCache } from "@/lib/fares/charter";
import { z } from "zod";


const updateSchema = z.object({
  id: z.string().min(1),
  priceAud: z.coerce.number().min(0).max(100000),
  roundTripPriceAud: z.coerce.number().min(0).max(100000),
  tagline: z.string().trim().max(80),
  recommended: z.enum(["true", "false"]).optional(),
  mostPopular: z.enum(["true", "false"]).optional(),
  active: z.enum(["true", "false"]).optional(),
  flightChangeLabel: z.string().trim().min(1).max(120),
  refundLabel: z.string().trim().min(1).max(120),
  checkedBaggage: z.string().trim().min(1).max(80),
  cabinBaggage: z.string().trim().min(1).max(40),
  seatSelection: z.string().trim().min(1).max(120),
  mealLabel: z.string().trim().min(1).max(80),
  frequentFlyerLabel: z.string().trim().max(120),
  priorityCheckIn: z.string().trim().max(80),
  priorityBoarding: z.string().trim().max(80),
  changeFeeLabel: z.string().trim().max(120),
  refundFeeLabel: z.string().trim().max(120),
  changePermitted: z.enum(["true", "false"]).optional(),
  refundPermitted: z.enum(["true", "false"]).optional(),
  perkLines: z.string().trim().max(2000),
  changeBullets: z.string().trim().max(4000),
  refundBullets: z.string().trim().max(4000),
  baggageBullets: z.string().trim().max(4000),
  notes: z.string().trim().max(500),
});

function linesToJson(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export async function updateCharterFareAction(formData: FormData) {
  await requireAdmin();

  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    priceAud: formData.get("priceAud"),
    roundTripPriceAud: formData.get("roundTripPriceAud") || "0",
    tagline: formData.get("tagline") || "",
    recommended: formData.get("recommended") ? "true" : "false",
    mostPopular: formData.get("mostPopular") ? "true" : "false",
    active: formData.get("active") ? "true" : "false",
    flightChangeLabel: formData.get("flightChangeLabel"),
    refundLabel: formData.get("refundLabel"),
    checkedBaggage: formData.get("checkedBaggage"),
    cabinBaggage: formData.get("cabinBaggage") || "7kg",
    seatSelection: formData.get("seatSelection"),
    mealLabel: formData.get("mealLabel") || "Meal Included",
    frequentFlyerLabel: formData.get("frequentFlyerLabel") || "",
    priorityCheckIn: formData.get("priorityCheckIn") || "",
    priorityBoarding: formData.get("priorityBoarding") || "",
    changeFeeLabel: formData.get("changeFeeLabel") || "",
    refundFeeLabel: formData.get("refundFeeLabel") || "",
    changePermitted: formData.get("changePermitted") ? "true" : "false",
    refundPermitted: formData.get("refundPermitted") ? "true" : "false",
    perkLines: formData.get("perkLines") || "",
    changeBullets: formData.get("changeBullets") || "",
    refundBullets: formData.get("refundBullets") || "",
    baggageBullets: formData.get("baggageBullets") || "",
    notes: formData.get("notes") || "",
  });

  if (!parsed.success) {
    redirect(
      `/admin?tab=fares&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid fare")}`,
    );
  }

  const data = parsed.data;
  await prisma.charterFareProduct.update({
    where: { id: data.id },
    data: {
      priceCents: Math.round(data.priceAud * 100),
      roundTripPriceCents: Math.round(data.roundTripPriceAud * 100),
      tagline: data.tagline,
      recommended: data.recommended === "true",
      mostPopular: data.mostPopular === "true",
      active: data.active === "true",
      flightChangeLabel: data.flightChangeLabel,
      refundLabel: data.refundLabel,
      checkedBaggage: data.checkedBaggage,
      cabinBaggage: data.cabinBaggage,
      seatSelection: data.seatSelection,
      mealLabel: data.mealLabel,
      frequentFlyerLabel: data.frequentFlyerLabel,
      priorityCheckIn: data.priorityCheckIn,
      priorityBoarding: data.priorityBoarding,
      changeFeeLabel: data.changeFeeLabel,
      refundFeeLabel: data.refundFeeLabel,
      changePermitted: data.changePermitted === "true",
      refundPermitted: data.refundPermitted === "true",
      perkLines: linesToJson(data.perkLines),
      changeBullets: linesToJson(data.changeBullets),
      refundBullets: linesToJson(data.refundBullets),
      baggageBullets: linesToJson(data.baggageBullets),
      notes: data.notes,
    },
  });

  invalidateCharterFareCache();
  revalidatePath("/admin");
  revalidatePath("/");
  redirect("/admin?tab=fares&saved=fare-updated");
}
