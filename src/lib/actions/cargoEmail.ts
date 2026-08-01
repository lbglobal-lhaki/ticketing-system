"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminAuth";
import { extractCargoShipment, type CargoAnswers } from "@/lib/cargo/parties";
import { prisma } from "@/lib/db";
import { cargoNotificationEmail } from "@/lib/email/cargoTemplates";
import { sendEmail } from "@/lib/email/send";
import { z } from "zod";

export type AdminCargoEmailNotice = {
  id: string;
  cargoId: string;
  role: "sender" | "receiver";
  toEmail: string;
  toName: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  pickupLocation: string;
  arrivalNote: string;
  status: "draft" | "sent";
  sentAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

function asAnswers(value: unknown): CargoAnswers {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as CargoAnswers;
  }
  return {};
}

function serializeNotice(row: {
  id: string;
  cargoId: string;
  role: "sender" | "receiver";
  toEmail: string;
  toName: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  pickupLocation: string;
  arrivalNote: string;
  status: "draft" | "sent";
  sentAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AdminCargoEmailNotice {
  return {
    id: row.id,
    cargoId: row.cargoId,
    role: row.role,
    toEmail: row.toEmail,
    toName: row.toName,
    subject: row.subject,
    bodyHtml: row.bodyHtml,
    bodyText: row.bodyText,
    pickupLocation: row.pickupLocation,
    arrivalNote: row.arrivalNote,
    status: row.status,
    sentAt: row.sentAt?.toISOString() ?? null,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const generateSchema = z.object({
  cargoId: z.string().min(1),
  roles: z.array(z.enum(["sender", "receiver"])).min(1),
  pickupLocation: z.string().trim().max(240).optional().or(z.literal("")),
  arrivalNote: z.string().trim().max(240).optional().or(z.literal("")),
  /** If true, overwrite existing draft for that role. Sent notices are never overwritten. */
  overwriteDrafts: z.boolean().optional(),
});

/** Create editable email drafts for sender and/or receiver. Does not send. */
export async function generateCargoEmailNoticesAction(input: {
  cargoId: string;
  roles?: Array<"sender" | "receiver">;
  pickupLocation?: string;
  arrivalNote?: string;
  overwriteDrafts?: boolean;
}) {
  await requireAdmin();

  const parsed = generateSchema.safeParse({
    cargoId: input.cargoId,
    roles: input.roles?.length ? input.roles : ["sender", "receiver"],
    pickupLocation: input.pickupLocation ?? "",
    arrivalNote: input.arrivalNote ?? "",
    overwriteDrafts: input.overwriteDrafts ?? true,
  });
  if (!parsed.success) {
    return { ok: false as const, error: "Invalid generate request" };
  }

  const cargo = await prisma.cargoSubmission.findUnique({
    where: { id: parsed.data.cargoId },
  });
  if (!cargo) return { ok: false as const, error: "Cargo enquiry not found" };

  const shipment = extractCargoShipment({
    id: cargo.id,
    parcelNumber: cargo.parcelNumber,
    email: cargo.email,
    phone: cargo.phone,
    submitterName: cargo.submitterName,
    answers: asAnswers(cargo.answers),
  });

  const created: AdminCargoEmailNotice[] = [];
  const skipped: string[] = [];

  for (const role of parsed.data.roles) {
    const tpl = cargoNotificationEmail({
      role,
      shipment,
      pickupLocation: parsed.data.pickupLocation || undefined,
      arrivalNote: parsed.data.arrivalNote || undefined,
    });

    if (!tpl.toEmail.trim()) {
      skipped.push(
        role === "sender"
          ? "Sender has no email on this enquiry"
          : "Receiver has no email on this enquiry",
      );
      continue;
    }

    const existingDraft = await prisma.cargoEmailNotice.findFirst({
      where: { cargoId: cargo.id, role, status: "draft" },
      orderBy: { createdAt: "desc" },
    });

    if (existingDraft && !parsed.data.overwriteDrafts) {
      created.push(serializeNotice(existingDraft));
      continue;
    }

    if (existingDraft && parsed.data.overwriteDrafts) {
      const updated = await prisma.cargoEmailNotice.update({
        where: { id: existingDraft.id },
        data: {
          toEmail: tpl.toEmail.trim(),
          toName: tpl.toName || "",
          subject: tpl.subject,
          bodyHtml: tpl.html,
          bodyText: tpl.text,
          pickupLocation: tpl.pickupLocation,
          arrivalNote: tpl.arrivalNote,
          lastError: null,
        },
      });
      created.push(serializeNotice(updated));
      continue;
    }

    const row = await prisma.cargoEmailNotice.create({
      data: {
        cargoId: cargo.id,
        role,
        toEmail: tpl.toEmail.trim(),
        toName: tpl.toName || "",
        subject: tpl.subject,
        bodyHtml: tpl.html,
        bodyText: tpl.text,
        pickupLocation: tpl.pickupLocation,
        arrivalNote: tpl.arrivalNote,
        status: "draft",
      },
    });
    created.push(serializeNotice(row));
  }

  revalidatePath("/admin");
  if (created.length === 0) {
    return {
      ok: false as const,
      error: skipped.join(". ") || "Could not generate any email drafts",
    };
  }

  return {
    ok: true as const,
    notices: created,
    warning: skipped.length ? skipped.join(". ") : undefined,
  };
}

const updateSchema = z.object({
  id: z.string().min(1),
  toEmail: z.string().trim().email(),
  toName: z.string().trim().max(120).optional().or(z.literal("")),
  subject: z.string().trim().min(1).max(200),
  bodyHtml: z.string().trim().min(1).max(100_000),
  bodyText: z.string().trim().max(50_000).optional().or(z.literal("")),
  pickupLocation: z.string().trim().max(240).optional().or(z.literal("")),
  arrivalNote: z.string().trim().max(240).optional().or(z.literal("")),
});

export async function updateCargoEmailNoticeAction(input: {
  id: string;
  toEmail: string;
  toName?: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  pickupLocation?: string;
  arrivalNote?: string;
}) {
  await requireAdmin();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid email draft",
    };
  }

  const existing = await prisma.cargoEmailNotice.findUnique({
    where: { id: parsed.data.id },
  });
  if (!existing) return { ok: false as const, error: "Email notice not found" };

  const updated = await prisma.cargoEmailNotice.update({
    where: { id: existing.id },
    data: {
      toEmail: parsed.data.toEmail,
      toName: parsed.data.toName || "",
      subject: parsed.data.subject,
      bodyHtml: parsed.data.bodyHtml,
      bodyText: parsed.data.bodyText || "",
      pickupLocation: parsed.data.pickupLocation || "",
      arrivalNote: parsed.data.arrivalNote || "",
      // Editing a sent notice turns it back into a draft for re-send control.
      status: "draft",
      sentAt: null,
      lastError: null,
    },
  });

  revalidatePath("/admin");
  return { ok: true as const, notice: serializeNotice(updated) };
}

export async function sendCargoEmailNoticeAction(id: string) {
  await requireAdmin();
  if (!id) return { ok: false as const, error: "Missing notice id" };

  const notice = await prisma.cargoEmailNotice.findUnique({ where: { id } });
  if (!notice) return { ok: false as const, error: "Email notice not found" };
  if (!notice.toEmail.trim()) {
    return { ok: false as const, error: "Recipient email is empty" };
  }

  const result = await sendEmail({
    to: notice.toEmail.trim(),
    subject: notice.subject,
    html: notice.bodyHtml,
    text: notice.bodyText || notice.subject,
    mailbox: "ticketing",
  });

  if (!result.ok) {
    if (!result.skipped) {
      await prisma.cargoEmailNotice.update({
        where: { id: notice.id },
        data: { lastError: result.error },
      });
      revalidatePath("/admin");
      return { ok: false as const, error: result.error };
    }

    const updatedSkipped = await prisma.cargoEmailNotice.update({
      where: { id: notice.id },
      data: {
        status: "sent",
        sentAt: new Date(),
        lastError: result.error,
      },
    });
    revalidatePath("/admin");
    return {
      ok: true as const,
      notice: serializeNotice(updatedSkipped),
      warning:
        "Marked sent locally — configure TICKETING_SMTP_USER/PASS to actually email customers.",
    };
  }

  const updated = await prisma.cargoEmailNotice.update({
    where: { id: notice.id },
    data: {
      status: "sent",
      sentAt: new Date(),
      lastError: null,
    },
  });

  revalidatePath("/admin");
  return { ok: true as const, notice: serializeNotice(updated) };
}

export async function deleteCargoEmailNoticeAction(id: string) {
  await requireAdmin();
  if (!id) return { ok: false as const, error: "Missing notice id" };

  try {
    await prisma.cargoEmailNotice.delete({ where: { id } });
  } catch {
    return { ok: false as const, error: "Email notice not found" };
  }

  revalidatePath("/admin");
  return { ok: true as const };
}

export async function listCargoEmailNoticesAction(cargoId: string) {
  await requireAdmin();
  const rows = await prisma.cargoEmailNotice.findMany({
    where: { cargoId },
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
  });
  return rows.map(serializeNotice);
}
