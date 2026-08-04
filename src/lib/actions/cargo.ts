"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/adminAuth";
import { recordDeletion } from "@/lib/audit/deletionLog";
import { allocateCargoParcelNumber } from "@/lib/cargo/parcelNumber";
import { extractCargoContacts } from "@/lib/cargo/submit";
import { prisma } from "@/lib/db";
import { z } from "zod";

const statusSchema = z.enum(["new", "reviewed", "closed"]);

function cargoFail(message: string): never {
  redirect(`/admin?tab=cargo&error=${encodeURIComponent(message)}`);
}

function parseAnswersFromForm(formData: FormData) {
  const keys = formData.getAll("answerKey").map((v) => String(v).trim());
  const values = formData.getAll("answerValue").map((v) => String(v));
  const answers: Record<string, string> = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (!key) continue;
    answers[key] = values[i] ?? "";
  }
  return answers;
}

function parseContacts(formData: FormData, answers: Record<string, string>) {
  const name = String(formData.get("submitterName") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  return extractCargoContacts({
    answers,
    name: name || undefined,
    email: email || undefined,
    phone: phone || undefined,
  });
}

function parsePaid(formData: FormData) {
  const raw = String(formData.get("paid") || "").trim().toLowerCase();
  return raw === "on" || raw === "true" || raw === "1" || raw === "yes";
}

export async function createCargoSubmissionAction(formData: FormData) {
  await requireAdmin();

  const statusRaw = String(formData.get("status") || "new").trim();
  const statusParsed = statusSchema.safeParse(statusRaw);
  if (!statusParsed.success) cargoFail("Invalid status");

  const answers = parseAnswersFromForm(formData);
  if (Object.keys(answers).length === 0) {
    cargoFail("Add at least one form field (question + answer)");
  }

  const contacts = parseContacts(formData, answers);
  const notes = String(formData.get("notes") || "").trim();
  const paid = parsePaid(formData);

  try {
    const parcelNumber = await allocateCargoParcelNumber();
    await prisma.cargoSubmission.create({
      data: {
        parcelNumber,
        status: statusParsed.data,
        paid,
        paidAt: paid ? new Date() : null,
        answers: answers as Prisma.InputJsonValue,
        submitterName: contacts.submitterName,
        email: contacts.email,
        phone: contacts.phone,
        notes: notes || null,
        submittedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("createCargoSubmissionAction", error);
    cargoFail(
      error instanceof Error ? error.message : "Could not create cargo entry",
    );
  }

  revalidatePath("/admin");
  redirect("/admin?tab=cargo&saved=cargo-created");
}

export async function updateCargoSubmissionAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") || "").trim();
  if (!id) cargoFail("Missing cargo id");

  const statusRaw = String(formData.get("status") || "").trim();
  const statusParsed = statusSchema.safeParse(statusRaw);
  if (!statusParsed.success) cargoFail("Invalid status");

  const answers = parseAnswersFromForm(formData);
  if (Object.keys(answers).length === 0) {
    cargoFail("Keep at least one form field (question + answer)");
  }

  const contacts = parseContacts(formData, answers);
  const notes = String(formData.get("notes") || "").trim();
  const paid = parsePaid(formData);

  try {
    const existing = await prisma.cargoSubmission.findUnique({
      where: { id },
      select: { paid: true, paidAt: true },
    });
    if (!existing) cargoFail("Cargo enquiry not found");

    await prisma.cargoSubmission.update({
      where: { id },
      data: {
        status: statusParsed.data,
        paid,
        paidAt: paid ? existing.paidAt ?? new Date() : null,
        answers: answers as Prisma.InputJsonValue,
        submitterName: contacts.submitterName,
        email: contacts.email,
        phone: contacts.phone,
        notes: notes || null,
      },
    });
  } catch (error) {
    console.error("updateCargoSubmissionAction", error);
    cargoFail(
      error instanceof Error ? error.message : "Could not update cargo",
    );
  }

  revalidatePath("/admin");
  redirect("/admin?tab=cargo&saved=cargo-updated");
}

export async function setCargoPaidAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") || "").trim();
  if (!id) cargoFail("Missing cargo id");

  const paid = parsePaid(formData);

  try {
    await prisma.cargoSubmission.update({
      where: { id },
      data: {
        paid,
        paidAt: paid ? new Date() : null,
      },
    });
  } catch (error) {
    console.error("setCargoPaidAction", error);
    cargoFail(
      error instanceof Error ? error.message : "Could not update payment status",
    );
  }

  revalidatePath("/admin");
  redirect(
    `/admin?tab=cargo&saved=${paid ? "cargo-paid" : "cargo-unpaid"}`,
  );
}

/** Accepts one or many `id` fields — powers both the row Delete button and bulk-select delete. */
export async function deleteCargoSubmissionAction(formData: FormData) {
  await requireAdmin();

  const ids = Array.from(
    new Set(formData.getAll("id").map((v) => String(v).trim()).filter(Boolean)),
  );
  if (ids.length === 0) cargoFail("Missing cargo id");

  try {
    await prisma.$transaction(
      async (tx) => {
        const cargos = await tx.cargoSubmission.findMany({
          where: { id: { in: ids } },
          include: { emailNotices: true },
        });
        if (cargos.length === 0) throw new Error("Cargo enquiry not found");

        for (const cargo of cargos) {
          await recordDeletion(
            {
              entityType: "cargo",
              entityId: cargo.id,
              label: cargo.parcelNumber,
              summary: cargo.submitterName || cargo.email || "Cargo enquiry",
              snapshot: cargo,
            },
            tx,
          );
        }

        // Cascades cargo.emailNotices via the CargoEmailNotice.cargoId FK.
        await tx.cargoSubmission.deleteMany({
          where: { id: { in: cargos.map((c) => c.id) } },
        });
      },
      { maxWait: 20_000, timeout: 60_000 },
    );
  } catch (error) {
    console.error("deleteCargoSubmissionAction", error);
    cargoFail(
      error instanceof Error ? error.message : "Could not delete cargo",
    );
  }

  revalidatePath("/admin");
  redirect(
    `/admin?tab=cargo&saved=${ids.length > 1 ? "cargo-bulk-deleted" : "cargo-deleted"}`,
  );
}
