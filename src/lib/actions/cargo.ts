"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const statusSchema = z.enum(["new", "reviewed", "closed"]);

export async function updateCargoSubmissionAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") || "").trim();
  if (!id) {
    redirect("/admin?tab=cargo&error=" + encodeURIComponent("Missing cargo id"));
  }

  const statusRaw = String(formData.get("status") || "").trim();
  const statusParsed = statusSchema.safeParse(statusRaw);
  if (!statusParsed.success) {
    redirect(
      "/admin?tab=cargo&error=" + encodeURIComponent("Invalid status"),
    );
  }

  const notes = String(formData.get("notes") || "");

  try {
    await prisma.cargoSubmission.update({
      where: { id },
      data: {
        status: statusParsed.data,
        notes: notes.trim() ? notes.trim() : null,
      },
    });
  } catch (error) {
    console.error("updateCargoSubmissionAction", error);
    redirect(
      "/admin?tab=cargo&error=" +
        encodeURIComponent(
          error instanceof Error ? error.message : "Could not update cargo",
        ),
    );
  }

  revalidatePath("/admin");
  redirect("/admin?tab=cargo&saved=cargo-updated");
}
