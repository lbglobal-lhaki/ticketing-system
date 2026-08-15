"use server";

import { requireAdmin } from "@/lib/adminAuth";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  buildRouteLabel,
  computeInvoiceTotals,
  defaultEndorsementText,
  defaultFareCalculationLine,
  defaultInvoiceIdentity,
} from "@/lib/documents/invoiceFields";
import {
  sendAirfareInvoiceEmail,
  sendInvoiceEmailForBooking,
  sendTravelDocumentEmail,
} from "@/lib/email/bookingMail";
import { invalidateInvoicePdfBlob } from "@/lib/documents/invoiceBlob";
import { recordDeletion } from "@/lib/audit/deletionLog";
import { parseDateTimeLocal } from "@/lib/datetime";
import { z } from "zod";


function moneyAud(value: FormDataEntryValue | null) {
  const n = Number(String(value ?? "0").replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export async function markInvoicePaidAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin?tab=invoices&error=Missing+invoice");

  const current = await prisma.invoice.findUnique({
    where: { id },
    include: { booking: true },
  });
  if (!current) redirect("/admin?tab=invoices&error=Invoice+not+found");
  if (
    current.booking.status === "hold_expired" ||
    current.booking.status === "cancelled"
  ) {
    redirect(
      `/admin?tab=invoices&error=${encodeURIComponent(
        "Cannot mark paid — booking hold expired or cancelled. Create a new booking.",
      )}`,
    );
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.invoice.update({
      where: { id },
      data: {
        status: "paid",
        paidAt: new Date(),
        markedPaidByAdmin: true,
        // Paid status appears on the PDF — force regenerate on next send/view.
        pdfBlobUrl: null,
        pdfBlobPathname: null,
      },
    });
    await tx.booking.update({
      where: { id: updated.bookingId },
      data: { status: "confirmed", holdExpiresAt: null },
    });
  });

  revalidatePath("/admin");
  redirect("/admin?tab=invoices&saved=invoice-paid");
}

export async function markInvoiceUnpaidAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin?tab=invoices&error=Missing+invoice");

  const { bankHoldExpiresAt } = await import("@/lib/branding");
  const current = await prisma.invoice.findUnique({
    where: { id },
    include: { booking: true },
  });
  if (!current) redirect("/admin?tab=invoices&error=Invoice+not+found");
  if (current.booking.paymentMethod !== "bank_transfer") {
    redirect(
      "/admin?tab=invoices&error=Only+bank+transfer+invoices+can+be+marked+unpaid",
    );
  }
  if (
    current.booking.status === "hold_expired" ||
    current.booking.status === "cancelled"
  ) {
    redirect(
      `/admin?tab=invoices&error=${encodeURIComponent(
        "Cannot mark unpaid — booking hold expired or cancelled.",
      )}`,
    );
  }

  const holdExpiresAt =
    current.booking.holdExpiresAt && current.booking.holdExpiresAt > new Date()
      ? current.booking.holdExpiresAt
      : bankHoldExpiresAt(new Date(), 48);

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id },
      data: {
        status: "unpaid",
        paidAt: null,
        markedPaidByAdmin: true,
        pdfBlobUrl: null,
        pdfBlobPathname: null,
      },
    });
    await tx.booking.update({
      where: { id: current.bookingId },
      data: {
        status: "pending_payment",
        holdExpiresAt,
      },
    });
  });

  revalidatePath("/admin");
  redirect("/admin?tab=invoices&saved=invoice-unpaid");
}

export async function markInvoiceSentAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin?tab=invoices&error=Missing+invoice");

  const result = await sendInvoiceEmailModalAction(id);
  if (!result.ok) {
    redirect(
      `/admin?tab=invoices&error=${encodeURIComponent(result.error)}`,
    );
  }
  revalidatePath("/admin");
  redirect(
    `/admin?tab=invoices&saved=invoice-sent${
      result.warning
        ? `&error=${encodeURIComponent(result.warning)}`
        : ""
    }`,
  );
}

const updateSchema = z.object({
  id: z.string().min(1),
  customerName: z.string().trim().min(1).max(120),
  customerEmail: z.string().trim().email(),
  customerPhone: z.string().trim().max(40).optional().or(z.literal("")),
  passportNumber: z.string().trim().max(40).optional().or(z.literal("")),
  nationality: z.string().trim().max(60).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  accountNumber: z.string().trim().max(80).optional().or(z.literal("")),
  businessTpn: z.string().trim().max(80).optional().or(z.literal("")),
  routeLabel: z.string().trim().max(80).optional().or(z.literal("")),
  seatLabel: z.string().trim().max(40).optional().or(z.literal("")),
  nameRef: z.string().trim().max(40).optional().or(z.literal("")),
  endorsementText: z.string().trim().max(240).optional().or(z.literal("")),
  fareCalculationLine: z.string().trim().max(240).optional().or(z.literal("")),
  gstMode: z.enum(["none", "exclusive", "inclusive"]).optional(),
  dueAt: z.string().optional().or(z.literal("")),
});

function parseGstMode(formData: FormData): "none" | "exclusive" | "inclusive" {
  const raw = String(formData.get("gstMode") ?? "").trim();
  if (raw === "exclusive" || raw === "inclusive" || raw === "none") return raw;
  // Legacy checkbox fallback
  if (formData.get("applyGst") === "on") return "exclusive";
  return "none";
}

function parseUpdateForm(formData: FormData) {
  return updateSchema.safeParse({
    id: formData.get("id"),
    customerName: formData.get("customerName"),
    customerEmail: formData.get("customerEmail"),
    customerPhone: formData.get("customerPhone") || "",
    passportNumber: formData.get("passportNumber") || "",
    nationality: formData.get("nationality") || "",
    notes: formData.get("notes") || "",
    accountNumber: formData.get("accountNumber") || "",
    businessTpn: formData.get("businessTpn") || "",
    routeLabel: formData.get("routeLabel") || "",
    seatLabel: formData.get("seatLabel") || "",
    nameRef: formData.get("nameRef") || "",
    endorsementText: formData.get("endorsementText") || "",
    fareCalculationLine: formData.get("fareCalculationLine") || "",
    gstMode: parseGstMode(formData),
    dueAt: formData.get("dueAt") || "",
  });
}

async function persistInvoiceDocument(formData: FormData) {
  const parsed = parseUpdateForm(formData);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid invoice",
    };
  }

  const existing = await prisma.invoice.findUnique({
    where: { id: parsed.data.id },
    include: { booking: { select: { bookingRef: true } } },
  });
  if (!existing) return { ok: false as const, error: "Invoice not found" };

  const airfareCents = moneyAud(formData.get("airfareAud"));
  const airportTaxesCents = moneyAud(formData.get("airportTaxesAud"));
  const extraBaggageCents = moneyAud(formData.get("extraBaggageAud"));
  const travelInsuranceCents = moneyAud(formData.get("travelInsuranceAud"));
  const otherChargesCents = moneyAud(formData.get("otherChargesAud"));
  const serviceFeeCents = moneyAud(formData.get("serviceFeeAud"));
  const gstMode = parsed.data.gstMode ?? "none";
  let gstRateBps = gstMode === "none" ? 0 : 1000;
  let gstIncluded = gstMode === "inclusive";
  // Empty custom field clears override; omit field (travel tab) keeps existing.
  const customGstRaw = formData.get("customGstAud");
  let gstOverrideCents = existing.gstOverrideCents ?? 0;
  if (customGstRaw !== null) {
    const raw = String(customGstRaw).trim();
    gstOverrideCents = raw ? moneyAud(raw) : 0;
  }
  if (gstOverrideCents > 0) {
    gstIncluded = false;
    if (gstRateBps === 0) gstRateBps = 1000;
  }

  const totals = computeInvoiceTotals({
    airfareCents,
    airportTaxesCents,
    extraBaggageCents,
    travelInsuranceCents,
    otherChargesCents,
    serviceFeeCents,
    gstRateBps,
    gstIncluded,
    gstOverrideCents,
  });

  // Empty dueAt clears; filled value uses admin browser TZ (same as flights).
  let dueAt: Date | null = existing.dueAt;
  const dueRaw = formData.get("dueAt");
  if (dueRaw !== null) {
    const dueStr = String(dueRaw).trim();
    if (!dueStr) {
      dueAt = null;
    } else {
      const tzRaw = Number(formData.get("tzOffsetMinutes"));
      const tzOffsetMinutes = Number.isFinite(tzRaw) ? tzRaw : 0;
      try {
        dueAt = parseDateTimeLocal(dueStr, tzOffsetMinutes);
      } catch {
        return { ok: false as const, error: "Invalid due date/time" };
      }
    }
  }

  await prisma.invoice.update({
    where: { id: existing.id },
    data: {
      customerName: parsed.data.customerName,
      customerEmail: parsed.data.customerEmail,
      customerPhone: parsed.data.customerPhone || "",
      notes: parsed.data.notes || "",
      accountNumber: parsed.data.accountNumber || "",
      businessTpn: parsed.data.businessTpn || "",
      routeLabel: parsed.data.routeLabel || "",
      seatLabel: parsed.data.seatLabel || "",
      nameRef: parsed.data.nameRef || "",
      endorsementText: parsed.data.endorsementText || "",
      fareCalculationLine: parsed.data.fareCalculationLine || "",
      airfareCents,
      airportTaxesCents,
      extraBaggageCents,
      travelInsuranceCents,
      otherChargesCents,
      fareCents: airfareCents,
      serviceFeeCents,
      gstRateBps,
      gstIncluded: totals.gstIncluded,
      gstOverrideCents,
      amountCents: totals.amountCents,
      dueAt,
      // Line items / customer details changed — invalidate cached PDF.
      pdfBlobUrl: null,
      pdfBlobPathname: null,
    },
  });

  await prisma.booking.update({
    where: { id: existing.bookingId },
    data: {
      passengerName: parsed.data.customerName,
      email: parsed.data.customerEmail,
      passengerPhone: parsed.data.customerPhone || "",
      passportNumber: parsed.data.passportNumber || "",
      nationality: parsed.data.nationality || "",
      amountPaidCents: totals.amountCents,
      serviceFeeCents,
    },
  });

  // Travel docs prefer BookingPassenger rows when present — keep primary in sync.
  const primaryPax = await prisma.bookingPassenger.findFirst({
    where: { bookingId: existing.bookingId },
    orderBy: { sortOrder: "asc" },
  });
  if (primaryPax) {
    await prisma.bookingPassenger.update({
      where: { id: primaryPax.id },
      data: {
        fullName: parsed.data.customerName,
        email: parsed.data.customerEmail,
        phone: parsed.data.customerPhone || "",
        passportNumber: parsed.data.passportNumber || "",
        nationality: parsed.data.nationality || "",
      },
    });
  }

  // Don't revalidatePath("/admin") here — the invoice modal updates local
  // state + preview iframe. Full admin revalidation was reloading the whole
  // dashboard after every Save and felt like a multi-minute hang.
  revalidatePath(`/confirmation/${existing.bookingId}`);
  revalidatePath(`/documents/invoice/${existing.invoiceNumber}`);
  revalidatePath(`/documents/eticket/${existing.booking.bookingRef}`);

  return {
    ok: true as const,
    bookingId: existing.bookingId,
    invoice: {
      id: existing.id,
      customerName: parsed.data.customerName,
      customerEmail: parsed.data.customerEmail,
      customerPhone: parsed.data.customerPhone || "",
      passportNumber: parsed.data.passportNumber || "",
      nationality: parsed.data.nationality || "",
      notes: parsed.data.notes || "",
      accountNumber: parsed.data.accountNumber || "",
      businessTpn: parsed.data.businessTpn || "",
      routeLabel: parsed.data.routeLabel || "",
      seatLabel: parsed.data.seatLabel || "",
      nameRef: parsed.data.nameRef || "",
      endorsementText: parsed.data.endorsementText || "",
      fareCalculationLine: parsed.data.fareCalculationLine || "",
      airfareCents,
      airportTaxesCents,
      extraBaggageCents,
      travelInsuranceCents,
      otherChargesCents,
      fareCents: airfareCents,
      serviceFeeCents,
      gstIncluded: totals.gstIncluded,
      gstRateBps,
      gstOverrideCents,
      amountCents: totals.amountCents,
      dueAt: dueAt?.toISOString() ?? null,
    },
  };
}

/** Modal-friendly save (no redirect). */
export async function saveInvoiceDocumentModalAction(formData: FormData) {
  await requireAdmin();
  return persistInvoiceDocument(formData);
}

export async function updateInvoiceDocumentAction(formData: FormData) {
  await requireAdmin();
  const result = await persistInvoiceDocument(formData);
  if (!result.ok) {
    redirect(
      `/admin?tab=invoices&error=${encodeURIComponent(result.error)}`,
    );
  }
  redirect("/admin?tab=invoices&saved=invoice-updated");
}

async function loadInvoiceForGenerate(id: string) {
  return prisma.invoice.findUnique({
    where: { id },
    include: {
      booking: { include: { flight: true, returnFlight: true } },
    },
  });
}

/** Current airfare figure to seed default text fields (invoice's own line item, falling back to legacy fareCents / the total minus fees). */
function resolveAirfareCents(invoice: {
  airfareCents: number;
  fareCents: number;
  amountCents: number;
  serviceFeeCents: number;
}) {
  if (invoice.airfareCents > 0) return invoice.airfareCents;
  if (invoice.fareCents > 0) return invoice.fareCents;
  return Math.max(0, invoice.amountCents - invoice.serviceFeeCents);
}

/**
 * Regenerates the fields shown on the travel document / e-ticket (seat,
 * name ref, fare-calc line, endorsement) from the current booking + flight
 * data. "Generate" always recomputes fresh — use Save instead to keep a
 * one-off manual override.
 */
async function generateTravelDocumentFields(id: string) {
  const invoice = await loadInvoiceForGenerate(id);
  if (!invoice) return { ok: false as const, error: "Invoice not found" };

  const flight = invoice.booking.flight;
  const tripType = invoice.booking.tripType;
  const airfare = resolveAirfareCents(invoice);

  const seatLabel = "Auto assigned";
  const nameRef = invoice.booking.bookingRef.slice(-7);
  const endorsementText = defaultEndorsementText();
  const fareCalculationLine = defaultFareCalculationLine({
    origin: flight.origin,
    destination: flight.destination,
    tripType,
    fareCents: airfare,
  });

  await prisma.invoice.update({
    where: { id },
    data: {
      seatLabel,
      nameRef,
      endorsementText,
      fareCalculationLine,
    },
  });

  // Modal updates local state — avoid forcing a full /admin reload.
  revalidatePath(`/documents/eticket/${invoice.booking.bookingRef}`);
  return {
    ok: true as const,
    invoice: {
      id,
      seatLabel,
      nameRef,
      endorsementText,
      fareCalculationLine,
    },
  };
}

/**
 * Regenerates the fields shown on the airfare invoice (route label,
 * account/TPN numbers, line-item backfill) and drops the cached PDF so the
 * next view/send renders fresh from the current template.
 */
async function generateAirfareInvoiceFields(id: string) {
  const invoice = await loadInvoiceForGenerate(id);
  if (!invoice) return { ok: false as const, error: "Invoice not found" };

  const identity = defaultInvoiceIdentity();
  const flight = invoice.booking.flight;
  const tripType = invoice.booking.tripType;
  const airfare = resolveAirfareCents(invoice);
  const routeLabel = buildRouteLabel({
    origin: flight.origin,
    destination: flight.destination,
    tripType,
  });
  const gstRateBps = invoice.gstRateBps ?? 0;
  const gstIncluded = Boolean(invoice.gstIncluded) && gstRateBps > 0;
  const gstOverrideCents = invoice.gstOverrideCents ?? 0;
  const totals = computeInvoiceTotals({
    airfareCents: airfare,
    airportTaxesCents: invoice.airportTaxesCents,
    extraBaggageCents: invoice.extraBaggageCents,
    travelInsuranceCents: invoice.travelInsuranceCents,
    otherChargesCents: invoice.otherChargesCents,
    serviceFeeCents: invoice.serviceFeeCents,
    gstRateBps,
    gstIncluded,
    gstOverrideCents,
  });

  await prisma.invoice.update({
    where: { id },
    data: {
      airfareCents: airfare,
      fareCents: airfare,
      accountNumber: identity.accountNumber,
      businessTpn: identity.businessTpn,
      routeLabel,
      gstRateBps,
      gstIncluded,
      gstOverrideCents,
      amountCents: totals.amountCents,
      pdfBlobUrl: null,
      pdfBlobPathname: null,
    },
  });

  await prisma.booking.update({
    where: { id: invoice.bookingId },
    data: { amountPaidCents: totals.amountCents },
  });

  // "Generate" means regenerate — drop any cached PDF so the next view
  // (preview, download, or email) renders fresh from the current template.
  await invalidateInvoicePdfBlob(id);

  // Modal updates local state — avoid forcing a full /admin reload.
  revalidatePath(`/documents/invoice/${invoice.invoiceNumber}`);
  return {
    ok: true as const,
    invoice: {
      id,
      airfareCents: airfare,
      fareCents: airfare,
      accountNumber: identity.accountNumber,
      businessTpn: identity.businessTpn,
      routeLabel,
      gstIncluded,
      gstRateBps,
      gstOverrideCents,
      amountCents: totals.amountCents,
    },
  };
}

/** Modal-friendly generate — travel document only (no redirect). */
export async function generateTravelDocumentModalAction(invoiceId: string) {
  await requireAdmin();
  return generateTravelDocumentFields(invoiceId);
}

/** Modal-friendly generate — airfare invoice only (no redirect). */
export async function generateAirfareInvoiceModalAction(invoiceId: string) {
  await requireAdmin();
  return generateAirfareInvoiceFields(invoiceId);
}

/** Backfill both documents' fields on an existing invoice (generate / refresh). */
export async function generateInvoiceDocumentsAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin?tab=invoices&error=Missing+invoice");

  const travel = await generateTravelDocumentFields(id);
  if (!travel.ok) {
    redirect(
      `/admin?tab=invoices&error=${encodeURIComponent(travel.error)}`,
    );
  }
  const airfare = await generateAirfareInvoiceFields(id);
  if (!airfare.ok) {
    redirect(
      `/admin?tab=invoices&error=${encodeURIComponent(airfare.error)}`,
    );
  }
  redirect(
    `/admin?tab=invoices&saved=invoice-generated&focus=${encodeURIComponent(id)}`,
  );
}

/** Modal-friendly send — travel document only (ticketing@). */
export async function sendTravelDocumentEmailModalAction(invoiceId: string) {
  await requireAdmin();
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { ok: false as const, error: "Invoice not found" };

  const result = await sendTravelDocumentEmail(invoice.bookingId);
  if (!result.ok && !("skipped" in result && result.skipped)) {
    return { ok: false as const, error: result.error };
  }
  if (!result.ok && "skipped" in result && result.skipped) {
    return {
      ok: true as const,
      warning:
        "Marked sent locally — configure TICKETING_SMTP_USER/PASS to actually email customers.",
    };
  }

  // Travel email doesn't touch invoice.sentAt (that's the airfare receipt flag).
  return { ok: true as const };
}

/** Modal-friendly send — airfare invoice only (accounts@). */
export async function sendAirfareInvoiceEmailModalAction(invoiceId: string) {
  await requireAdmin();
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { ok: false as const, error: "Invoice not found" };

  const result = await sendAirfareInvoiceEmail(invoice.bookingId);
  if (!result.ok && !("skipped" in result && result.skipped)) {
    return { ok: false as const, error: result.error };
  }
  const sentAt = new Date().toISOString();
  if (!result.ok && "skipped" in result && result.skipped) {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { sentAt: new Date(sentAt) },
    });
    return {
      ok: true as const,
      sentAt,
      warning:
        "Marked sent locally — configure ACCOUNTS_SMTP_USER/PASS to actually email customers.",
    };
  }

  return { ok: true as const, sentAt };
}

/** Modal-friendly send email for both documents. */
export async function sendInvoiceEmailModalAction(invoiceId: string) {
  await requireAdmin();
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { ok: false as const, error: "Invoice not found" };

  const result = await sendInvoiceEmailForBooking(invoice.bookingId);
  if (!result.ok && !("skipped" in result && result.skipped)) {
    return { ok: false as const, error: result.error };
  }

  if (!result.ok && "skipped" in result && result.skipped) {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { sentAt: new Date() },
    });
    revalidatePath("/admin");
    return {
      ok: true as const,
      warning:
        "Marked sent locally — configure TICKETING_SMTP_USER/PASS and ACCOUNTS_SMTP_USER/PASS to actually email customers.",
    };
  }

  revalidatePath("/admin");
  return { ok: true as const };
}

/** Permanently deletes an invoice — recorded on the admin Deleted tab first. */
/** Accepts one or many `id` fields — powers both the row Delete button and bulk-select delete. */
export async function deleteInvoiceAction(formData: FormData) {
  await requireAdmin();
  const ids = Array.from(new Set(formData.getAll("id").map(String).filter(Boolean)));
  if (ids.length === 0) redirect("/admin?tab=invoices&error=Missing+invoice");

  const invoices = await prisma.invoice.findMany({
    where: { id: { in: ids } },
    include: {
      booking: { select: { bookingRef: true, passengerName: true } },
    },
  });
  if (invoices.length === 0) {
    redirect("/admin?tab=invoices&error=Invoice(s)+not+found");
  }

  await prisma.$transaction(
    async (tx) => {
      for (const invoice of invoices) {
        await recordDeletion(
          {
            entityType: "invoice",
            entityId: invoice.id,
            label: invoice.invoiceNumber,
            summary: `${invoice.customerName} · Booking ${invoice.booking.bookingRef} · ${(invoice.amountCents / 100).toFixed(2)} AUD`,
            snapshot: invoice,
          },
          tx,
        );
      }
      await tx.invoice.deleteMany({
        where: { id: { in: invoices.map((i) => i.id) } },
      });
    },
    { maxWait: 20_000, timeout: 60_000 },
  );

  revalidatePath("/admin");
  redirect(
    `/admin?tab=invoices&saved=${invoices.length > 1 ? "invoices-deleted" : "invoice-deleted"}`,
  );
}

/** Modal-friendly delete (no redirect) — used from the document editor modal. */
export async function deleteInvoiceModalAction(invoiceId: string) {
  await requireAdmin();

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      booking: { select: { bookingRef: true, passengerName: true } },
    },
  });
  if (!invoice) return { ok: false as const, error: "Invoice not found" };

  await prisma.$transaction(async (tx) => {
    await recordDeletion(
      {
        entityType: "invoice",
        entityId: invoice.id,
        label: invoice.invoiceNumber,
        summary: `${invoice.customerName} · Booking ${invoice.booking.bookingRef} · ${(invoice.amountCents / 100).toFixed(2)} AUD`,
        snapshot: invoice,
      },
      tx,
    );
    await tx.invoice.delete({ where: { id: invoiceId } });
  });

  revalidatePath("/admin");
  return { ok: true as const };
}
