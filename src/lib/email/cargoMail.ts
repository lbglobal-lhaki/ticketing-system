import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/branding";
import {
  extractCargoShipment,
  type CargoAnswers,
} from "@/lib/cargo/parties";
import {
  renderCargoInvoiceHtml,
  type CargoInvoiceSource,
} from "@/lib/documents/cargoInvoice";
import { cargoInvoicePdfOptions } from "@/lib/documents/templates";
import { htmlToPdf } from "@/lib/documents/pdf";
import {
  cargoCustomerBookingEmail,
  cargoStaffBookingEmail,
} from "@/lib/email/cargoTemplates";
import { sendEmail, type EmailAttachment } from "@/lib/email/send";

function asAnswers(value: unknown): CargoAnswers {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as CargoAnswers;
  }
  return {};
}

function cargoStaffRecipients(customerEmail: string) {
  const brand = getBrand();
  const extras = (process.env.CARGO_STAFF_EMAIL ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const customer = customerEmail.trim().toLowerCase();
  const unique = new Set<string>();
  for (const raw of [
    brand.agentEmail,
    brand.supportEmail,
    brand.paymentProofEmail,
    ...extras,
  ]) {
    const email = raw.trim();
    if (!email) continue;
    if (email.toLowerCase() === customer) continue;
    unique.add(email);
  }
  return [...unique];
}

async function invoiceAttachment(
  row: CargoInvoiceSource,
): Promise<EmailAttachment> {
  const html = renderCargoInvoiceHtml(row);
  try {
    return {
      filename: `Cargo-Invoice-${row.parcelNumber}.pdf`,
      content: await htmlToPdf(html, cargoInvoicePdfOptions()),
      contentType: "application/pdf",
    };
  } catch (error) {
    console.error("[email] cargo invoice PDF failed; attaching HTML", error);
    return {
      filename: `Cargo-Invoice-${row.parcelNumber}.html`,
      content: html,
      contentType: "text/html",
    };
  }
}

export type CargoBookingEmailResult = {
  ok: boolean;
  customerSent: boolean;
  staffSent: number;
  skipped?: boolean;
  error?: string;
};

/**
 * Customer confirmation + cargo invoice, and a staff acknowledgement.
 * Safe to call after booking — never throws for SMTP failures.
 */
export async function sendCargoBookingEmails(
  parcelNumber: string,
): Promise<CargoBookingEmailResult> {
  const row = await prisma.cargoSubmission.findUnique({
    where: { parcelNumber },
    include: {
      flight: {
        select: {
          airline: true,
          flightNumber: true,
          origin: true,
          destination: true,
          departureAt: true,
          arrivalAt: true,
        },
      },
    },
  });
  if (!row) {
    return { ok: false, customerSent: false, staffSent: 0, error: "Cargo booking not found" };
  }

  const shipment = extractCargoShipment({
    id: row.id,
    parcelNumber: row.parcelNumber,
    email: row.email,
    phone: row.phone,
    submitterName: row.submitterName,
    answers: asAnswers(row.answers),
  });
  const invoice = await invoiceAttachment(row);
  const customerTpl = cargoCustomerBookingEmail({
    shipment,
    quotedCents: row.quotedCents,
    paid: row.paid,
  });
  const staffTpl = cargoStaffBookingEmail({
    shipment,
    quotedCents: row.quotedCents,
    paid: row.paid,
  });

  const customerTo = customerTpl.toEmail.trim();
  const staffList = cargoStaffRecipients(customerTo);

  const jobs: Promise<{
    role: "customer" | "staff";
    result: Awaited<ReturnType<typeof sendEmail>>;
  }>[] = [];

  if (customerTo) {
    jobs.push(
      sendEmail({
        to: customerTo,
        subject: customerTpl.subject,
        html: customerTpl.html,
        text: customerTpl.text,
        mailbox: "accounts",
        attachments: [invoice],
      }).then((result) => ({ role: "customer" as const, result })),
    );
  }

  for (const to of staffList) {
    jobs.push(
      sendEmail({
        to,
        subject: staffTpl.subject,
        html: staffTpl.html,
        text: staffTpl.text,
        mailbox: "ticketing",
        attachments: [invoice],
      }).then((result) => ({ role: "staff" as const, result })),
    );
  }

  if (jobs.length === 0) {
    return {
      ok: false,
      customerSent: false,
      staffSent: 0,
      error: "No customer or staff email addresses to send to",
    };
  }

  const results = await Promise.all(jobs);
  let customerSent = false;
  let staffSent = 0;
  let skipped = false;
  const errors: string[] = [];

  for (const { role, result } of results) {
    if (result.ok) {
      if (role === "customer") customerSent = true;
      else staffSent += 1;
      continue;
    }
    if (result.skipped) skipped = true;
    errors.push(`${role}: ${result.error}`);
  }

  if (errors.length) {
    console.error("[email] cargo booking send issues", {
      parcelNumber,
      errors,
    });
  }

  const ok = customerSent || staffSent > 0;
  return {
    ok,
    customerSent,
    staffSent,
    skipped: skipped && !ok,
    error: ok ? undefined : errors[0] || "Cargo emails could not be sent",
  };
}
