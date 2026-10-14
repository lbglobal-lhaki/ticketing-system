"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";
import { slugifyCargoName } from "@/lib/cargo/productPricing";
import { CARGO_FLIGHT_CATEGORIES } from "@/lib/cargo/weightOptions";
import {
  failFromUnknown,
  formFail,
  zodFieldErrors,
  type FormActionResult,
} from "@/lib/forms/formAction";

const knownOrigins = CARGO_FLIGHT_CATEGORIES.map((c) => c.origin);

const optionSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(1, "Name is required").max(80),
  description: z.string().trim().max(200).default(""),
  kind: z.enum(["fixed", "per_kg"]),
  minKg: z.coerce.number().int().min(0).max(20_000),
  maxKg: z.coerce.number().int().min(0).max(20_000).optional(),
  chargeableKg: z.coerce.number().int().min(0).max(20_000).default(0),
  priceAud: z.coerce.number().min(0).max(100_000),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
  origins: z.array(z.string().trim().toUpperCase()).default([]),
});

function cents(amount: number) {
  return Math.round(amount * 100);
}

function parseOrigins(formData: FormData) {
  const picked = formData
    .getAll("origin")
    .map((v) => String(v).trim().toUpperCase())
    .filter((code) => knownOrigins.includes(code));
  return [...new Set(picked)];
}

function uniqueCode(name: string) {
  return slugifyCargoName(name);
}

export async function saveCargoWeightOptionAction(
  _prev: FormActionResult | null,
  formData: FormData,
): Promise<FormActionResult> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim() || undefined;
  const kind = String(formData.get("kind") ?? "fixed") === "per_kg" ? "per_kg" : "fixed";
  const maxRaw = String(formData.get("maxKg") ?? "").trim();
  const parsed = optionSchema.safeParse({
    id,
    name: formData.get("name"),
    description: formData.get("description") || "",
    kind,
    minKg: formData.get("minKg") || 0,
    maxKg: maxRaw === "" ? undefined : maxRaw,
    chargeableKg: formData.get("chargeableKg") || 0,
    priceAud: formData.get("priceAud") || 0,
    sortOrder: formData.get("sortOrder") || 0,
    active: formData.get("active") === "true",
    origins: parseOrigins(formData),
  });
  if (!parsed.success) {
    return formFail(
      parsed.error.issues[0]?.message ?? "Please fix the highlighted fields",
      zodFieldErrors(parsed.error),
    );
  }

  const data = parsed.data;
  if (data.kind === "per_kg" && data.maxKg != null && data.maxKg < data.minKg) {
    return formFail("Upper kg cannot be below the lower kg", {
      maxKg: "Must be at least the lower kg",
    });
  }
  if (data.priceAud <= 0) {
    return formFail("Enter a price greater than zero", { priceAud: "Required" });
  }

  const chargeableKg =
    data.kind === "fixed"
      ? data.chargeableKg || data.minKg || 1
      : 0;

  try {
    if (id) {
      const existing = await prisma.cargoWeightOption.findUnique({
        where: { id },
        select: { code: true },
      });
      if (!existing) return formFail("Weight option not found");
      await prisma.cargoWeightOption.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          kind: data.kind,
          minKg: data.minKg,
          maxKg: data.kind === "per_kg" ? (data.maxKg ?? null) : data.minKg,
          chargeableKg,
          priceCents: cents(data.priceAud),
          origins: data.origins,
          sortOrder: data.sortOrder,
          active: data.active,
        },
      });
    } else {
      let code = uniqueCode(data.name);
      const clash = await prisma.cargoWeightOption.findUnique({ where: { code } });
      if (clash) code = `${code}-${Date.now().toString(36)}`;
      const last = await prisma.cargoWeightOption.aggregate({
        _max: { sortOrder: true },
      });
      await prisma.cargoWeightOption.create({
        data: {
          code,
          name: data.name,
          description: data.description,
          kind: data.kind,
          minKg: data.minKg,
          maxKg: data.kind === "per_kg" ? (data.maxKg ?? null) : data.minKg,
          chargeableKg,
          priceCents: cents(data.priceAud),
          origins: data.origins,
          sortOrder: data.sortOrder || (last._max.sortOrder ?? 0) + 1,
          active: data.active,
        },
      });
    }
  } catch (error) {
    console.error("saveCargoWeightOptionAction", error);
    return failFromUnknown(error, "Could not save the weight option");
  }

  revalidatePath("/admin");
  revalidatePath("/cargo");
  redirect("/admin?tab=cargo&saved=cargo-weight-saved");
}

export async function deleteCargoWeightOptionAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect("/admin?tab=cargo&error=Missing+weight+option");

  const option = await prisma.cargoWeightOption.findUnique({
    where: { id },
    select: { id: true, _count: { select: { bookings: true } } },
  });
  if (!option) {
    redirect("/admin?tab=cargo&error=Weight+option+not+found");
  }

  if (option._count.bookings > 0) {
    await prisma.cargoWeightOption.update({
      where: { id },
      data: { active: false },
    });
    revalidatePath("/admin");
    revalidatePath("/cargo");
    redirect("/admin?tab=cargo&saved=cargo-weight-retired");
  }

  await prisma.cargoWeightOption.delete({ where: { id } });
  revalidatePath("/admin");
  revalidatePath("/cargo");
  redirect("/admin?tab=cargo&saved=cargo-weight-deleted");
}
