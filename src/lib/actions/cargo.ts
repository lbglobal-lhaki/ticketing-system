"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { getAdminSession, requireAdmin } from "@/lib/adminAuth";
import { recordDeletion } from "@/lib/audit/deletionLog";
import { cargoMoneySnapshot } from "@/lib/cargo/gst";
import { cargoPaymentOutcome } from "@/lib/cargo/lifecycle";
import {
  enqueueCargoNotification,
  processCargoLifecycleEvent,
} from "@/lib/cargo/notifications";
import { allocateCargoParcelNumber } from "@/lib/cargo/parcelNumber";
import { extractCargoContacts } from "@/lib/cargo/submit";
import { prisma } from "@/lib/db";
import { z } from "zod";
import {
  failFromUnknown,
  formFail,
  type FormActionResult,
} from "@/lib/forms/formAction";

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

function parseMoneyCents(formData: FormData, fallbackCents: number) {
  const rawCents = String(formData.get("paidAmountCents") || "").trim();
  if (rawCents) {
    const n = Number(rawCents);
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  const raw = String(formData.get("paidAmount") || "").trim();
  if (!raw) return fallbackCents;
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return fallbackCents;
  return Math.round(n * 100);
}

export async function createCargoSubmissionAction(
  _prev: FormActionResult | null,
  formData: FormData,
): Promise<FormActionResult> {
  await requireAdmin();

  const statusRaw = String(formData.get("status") || "new").trim();
  const statusParsed = statusSchema.safeParse(statusRaw);
  if (!statusParsed.success) {
    return formFail("Invalid status", { status: "Invalid status" });
  }

  const answers = parseAnswersFromForm(formData);
  if (Object.keys(answers).length === 0) {
    return formFail("Add at least one form field (question + answer)");
  }

  const contacts = parseContacts(formData, answers);
  const notes = String(formData.get("notes") || "").trim();

  try {
    const parcelNumber = await allocateCargoParcelNumber();
    await prisma.cargoSubmission.create({
      data: {
        parcelNumber,
        status: statusParsed.data,
        bookingStatus: "pending_payment",
        paymentStatus: "unpaid",
        paid: false,
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
    return failFromUnknown(error, "Could not create cargo entry");
  }

  revalidatePath("/admin");
  redirect("/admin?tab=cargo&saved=cargo-created");
}

export async function updateCargoSubmissionAction(
  _prev: FormActionResult | null,
  formData: FormData,
): Promise<FormActionResult> {
  await requireAdmin();

  const id = String(formData.get("id") || "").trim();
  if (!id) return formFail("Missing cargo id");

  const statusRaw = String(formData.get("status") || "").trim();
  const statusParsed = statusSchema.safeParse(statusRaw);
  if (!statusParsed.success) {
    return formFail("Invalid status", { status: "Invalid status" });
  }

  const answers = parseAnswersFromForm(formData);
  if (Object.keys(answers).length === 0) {
    return formFail("Keep at least one form field (question + answer)");
  }

  const contacts = parseContacts(formData, answers);
  const notes = String(formData.get("notes") || "").trim();

  try {
    const existing = await prisma.cargoSubmission.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return formFail("Cargo enquiry not found");

    await prisma.cargoSubmission.update({
      where: { id },
      data: {
        status: statusParsed.data,
        answers: answers as Prisma.InputJsonValue,
        submitterName: contacts.submitterName,
        email: contacts.email,
        phone: contacts.phone,
        notes: notes || null,
      },
    });
  } catch (error) {
    console.error("updateCargoSubmissionAction", error);
    return failFromUnknown(error, "Could not update cargo");
  }

  revalidatePath("/admin");
  redirect("/admin?tab=cargo&saved=cargo-updated");
}

export async function setCargoPaidAction(formData: FormData) {
  await requireAdmin();
  const session = await getAdminSession();
  if (!session) cargoFail("Unauthorized");

  const id = String(formData.get("id") || "").trim();
  if (!id) cargoFail("Missing cargo id");

  const markPaid = parsePaid(formData);
  const paymentMethod = String(formData.get("paymentMethod") || "bank_transfer")
    .trim()
    .slice(0, 40);
  const paymentReference = String(formData.get("paymentReference") || "")
    .trim()
    .slice(0, 120);
  const paidAtRaw = String(formData.get("paidAt") || "").trim();
  const paidAt = paidAtRaw ? new Date(paidAtRaw) : new Date();
  if (Number.isNaN(paidAt.getTime())) cargoFail("Invalid payment date");

  let parcelNumber = "";
  let shouldConfirm = false;

  try {
    const row = await prisma.cargoSubmission.findUnique({ where: { id } });
    if (!row) cargoFail("Cargo booking not found");
    if (row.bookingStatus === "cancelled") {
      cargoFail("Reopen this cancelled booking before verifying payment");
    }

    const money = cargoMoneySnapshot(row);
    const paidAmountCents = markPaid
      ? parseMoneyCents(formData, money.totalCents)
      : 0;
    const outcome = cargoPaymentOutcome({
      totalCents: money.totalCents,
      paidAmountCents,
      markPaid,
      currentlyCancelled: false,
    });
    shouldConfirm = outcome.shouldConfirm;
    parcelNumber = row.parcelNumber;

    await prisma.cargoSubmission.update({
      where: { id },
      data: {
        paid: outcome.paid,
        paidAt: outcome.paid ? paidAt : null,
        bookingStatus: outcome.bookingStatus,
        paymentStatus: outcome.paymentStatus,
        paidAmountCents,
        paymentMethod: markPaid ? paymentMethod || "bank_transfer" : "",
        paymentReference: markPaid ? paymentReference : "",
        paidVerifiedBy: markPaid ? session.role : "",
      },
    });

    if (shouldConfirm) {
      await enqueueCargoNotification(row.id, "confirmation", {
        forceResend: Boolean(row.confirmationSentAt),
      });
    }
  } catch (error) {
    console.error("setCargoPaidAction", error);
    cargoFail(
      error instanceof Error ? error.message : "Could not update payment status",
    );
  }

  if (shouldConfirm && parcelNumber) {
    after(async () => {
      try {
        await processCargoLifecycleEvent(parcelNumber, "PAYMENT_VERIFIED");
      } catch (error) {
        console.error("cargo confirmation email failed", error);
      }
    });
  }

  revalidatePath("/admin");
  redirect(
    `/admin?tab=cargo&saved=${
      shouldConfirm
        ? "cargo-confirmed"
        : markPaid
          ? "cargo-payment-recorded"
          : "cargo-unpaid"
    }`,
  );
}

export async function cancelCargoBookingAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "").trim();
  if (!id) cargoFail("Missing cargo id");

  try {
    const row = await prisma.cargoSubmission.findUnique({
      where: { id },
      select: { bookingStatus: true },
    });
    if (!row) cargoFail("Cargo booking not found");
    if (row.bookingStatus === "cancelled") {
      cargoFail("This booking is already cancelled");
    }
    await prisma.cargoSubmission.update({
      where: { id },
      data: {
        bookingStatus: "cancelled",
        cancelledAt: new Date(),
      },
    });
  } catch (error) {
    console.error("cancelCargoBookingAction", error);
    cargoFail(
      error instanceof Error ? error.message : "Could not cancel booking",
    );
  }

  revalidatePath("/admin");
  redirect("/admin?tab=cargo&saved=cargo-cancelled");
}

export async function reopenCargoBookingAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "").trim();
  if (!id) cargoFail("Missing cargo id");

  try {
    const row = await prisma.cargoSubmission.findUnique({ where: { id } });
    if (!row) cargoFail("Cargo booking not found");
    if (row.bookingStatus !== "cancelled") {
      cargoFail("Only cancelled bookings can be reopened");
    }
    const money = cargoMoneySnapshot(row);
    const fullyPaid =
      row.paid &&
      row.paymentStatus === "paid" &&
      (money.totalCents === 0 || row.paidAmountCents >= money.totalCents);
    await prisma.cargoSubmission.update({
      where: { id },
      data: {
        bookingStatus: fullyPaid ? "confirmed" : "pending_payment",
        cancelledAt: null,
      },
    });
  } catch (error) {
    console.error("reopenCargoBookingAction", error);
    cargoFail(
      error instanceof Error ? error.message : "Could not reopen booking",
    );
  }

  revalidatePath("/admin");
  redirect("/admin?tab=cargo&saved=cargo-reopened");
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
          include: { emailNotices: true, notifications: true },
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

          // Give the payload back so the space is sellable again.
          if (cargo.flightId && cargo.weightKg > 0) {
            await tx.$executeRaw`
              UPDATE "Flight"
              SET "cargoBookedKg" = GREATEST(0, "cargoBookedKg" - ${cargo.weightKg})
              WHERE "id" = ${cargo.flightId}
            `;
          }
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
