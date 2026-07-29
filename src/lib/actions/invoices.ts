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
  sendBookingConfirmationBundle,
  sendInvoiceEmailForBooking,
} from "@/lib/email/bookingMail";
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

  const invoice = await prisma.$transaction(async (tx) => {
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
    return updated;
  });

  try {
    await sendBookingConfirmationBundle(invoice.bookingId);
  } catch (err) {
    console.error("send confirmation after mark paid failed", err);
  }

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
        dueAt: holdExpiresAt,
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
  gstIncluded: z.enum(["true", "false"]).optional(),
  dueAt: z.string().optional().or(z.literal("")),
});

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
    gstIncluded: formData.get("gstIncluded") === "on" ? "true" : "false",
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
  });
  if (!existing) return { ok: false as const, error: "Invoice not found" };

  const airfareCents = moneyAud(formData.get("airfareAud"));
  const airportTaxesCents = moneyAud(formData.get("airportTaxesAud"));
  const extraBaggageCents = moneyAud(formData.get("extraBaggageAud"));
  const travelInsuranceCents = moneyAud(formData.get("travelInsuranceAud"));
  const otherChargesCents = moneyAud(formData.get("otherChargesAud"));
  const serviceFeeCents = moneyAud(formData.get("serviceFeeAud"));

  const totals = computeInvoiceTotals({
    airfareCents,
    airportTaxesCents,
    extraBaggageCents,
    travelInsuranceCents,
    otherChargesCents,
    serviceFeeCents,
    gstRateBps: existing.gstRateBps || 1000,
    gstIncluded: parsed.data.gstIncluded !== "false",
  });

  let dueAt: Date | null = existing.dueAt;
  if (parsed.data.dueAt) {
    const d = new Date(parsed.data.dueAt);
    if (!Number.isNaN(d.getTime())) dueAt = d;
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
      gstIncluded: totals.gstIncluded,
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

  revalidatePath("/admin");
  revalidatePath(`/confirmation/${existing.bookingId}`);
  return { ok: true as const, bookingId: existing.bookingId };
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

async function generateInvoiceDocuments(id: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      booking: { include: { flight: true, returnFlight: true } },
    },
  });
  if (!invoice) return { ok: false as const, error: "Invoice not found" };

  const identity = defaultInvoiceIdentity();
  const flight = invoice.booking.flight;
  const tripType = invoice.booking.tripType;
  const airfare =
    invoice.airfareCents > 0
      ? invoice.airfareCents
      : invoice.fareCents > 0
        ? invoice.fareCents
        : Math.max(0, invoice.amountCents - invoice.serviceFeeCents);

  await prisma.invoice.update({
    where: { id },
    data: {
      airfareCents: airfare,
      fareCents: airfare,
      accountNumber: invoice.accountNumber || identity.accountNumber,
      businessTpn: invoice.businessTpn || identity.businessTpn,
      routeLabel:
        invoice.routeLabel ||
        buildRouteLabel({
          origin: flight.origin,
          destination: flight.destination,
          tripType,
        }),
      seatLabel: invoice.seatLabel || "Auto assigned",
      nameRef: invoice.nameRef || invoice.booking.bookingRef.slice(-7),
      endorsementText: invoice.endorsementText || defaultEndorsementText(),
      fareCalculationLine:
        invoice.fareCalculationLine ||
        defaultFareCalculationLine({
          origin: flight.origin,
          destination: flight.destination,
          tripType,
          fareCents: airfare,
        }),
      gstRateBps: invoice.gstRateBps || 1000,
      gstIncluded: invoice.gstIncluded,
    },
  });

  revalidatePath("/admin");
  return { ok: true as const };
}

/** Modal-friendly generate both docs (no redirect). */
export async function generateInvoiceDocumentsModalAction(invoiceId: string) {
  await requireAdmin();
  return generateInvoiceDocuments(invoiceId);
}

/** Backfill document fields on an existing invoice (generate / refresh). */
export async function generateInvoiceDocumentsAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin?tab=invoices&error=Missing+invoice");

  const result = await generateInvoiceDocuments(id);
  if (!result.ok) {
    redirect(
      `/admin?tab=invoices&error=${encodeURIComponent(result.error)}`,
    );
  }
  redirect(
    `/admin?tab=invoices&saved=invoice-generated&focus=${encodeURIComponent(id)}`,
  );
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
