import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/branding";
import { cargoBtnSnapshot, cargoMoneySnapshot } from "@/lib/cargo/gst";
import { canIssueCargoConfirmation } from "@/lib/cargo/lifecycle";
import {
  extractCargoShipment,
  type CargoAnswers,
} from "@/lib/cargo/parties";
import { renderCargoConfirmationHtml } from "@/lib/documents/cargoConfirmation";
import {
  renderCargoInvoiceHtml,
  type CargoInvoiceSource,
} from "@/lib/documents/cargoInvoice";
import { cargoInvoicePdfOptions } from "@/lib/documents/templates";
import { htmlToPdf } from "@/lib/documents/pdf";
import {
  cargoCustomerAcknowledgementEmail,
  cargoCustomerConfirmationEmail,
  cargoStaffAcknowledgementEmail,
  cargoStaffConfirmationEmail,
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

async function pdfAttachment(
  row: CargoInvoiceSource,
  kind: "invoice" | "confirmation",
): Promise<EmailAttachment> {
  const html =
    kind === "confirmation"
      ? renderCargoConfirmationHtml(row)
      : renderCargoInvoiceHtml(row);
  const stem =
    kind === "confirmation"
      ? `Cargo-Confirmation-${row.parcelNumber}`
      : `Cargo-Invoice-${row.parcelNumber}`;
  try {
    return {
      filename: `${stem}.pdf`,
      content: await htmlToPdf(html, cargoInvoicePdfOptions()),
      contentType: "application/pdf",
    };
  } catch (error) {
    console.error(`[email] cargo ${kind} PDF failed; attaching HTML`, error);
    return {
      filename: `${stem}.html`,
      content: html,
      contentType: "text/html",
    };
  }
}

export type CargoDeliveryResult = {
  ok: boolean;
  customerSent: boolean;
  staffSent: number;
  skipped?: boolean;
  error?: string;
};

/**
 * Send one lifecycle email. Callers must have already authorised the kind
 * (acknowledgement after create, confirmation only after verified payment).
 */
export async function deliverCargoNotification(
  parcelNumber: string,
  kind: "acknowledgement" | "confirmation",
): Promise<CargoDeliveryResult> {
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
    return {
      ok: false,
      customerSent: false,
      staffSent: 0,
      error: "Cargo booking not found",
    };
  }

  if (kind === "confirmation" && !canIssueCargoConfirmation(row)) {
    return {
      ok: false,
      customerSent: false,
      staffSent: 0,
      error: "Official confirmation can only be issued after payment is verified",
    };
  }

  const money = cargoMoneySnapshot(row);
  const btn = cargoBtnSnapshot(row);
  const shipment = extractCargoShipment({
    id: row.id,
    parcelNumber: row.parcelNumber,
    email: row.email,
    phone: row.phone,
    submitterName: row.submitterName,
    answers: asAnswers(row.answers),
  });

  const attachments: EmailAttachment[] = [];
  if (kind === "acknowledgement") {
    attachments.push(await pdfAttachment(row, "invoice"));
  } else {
    attachments.push(await pdfAttachment(row, "confirmation"));
  }

  const customerTpl =
    kind === "confirmation"
      ? cargoCustomerConfirmationEmail({
          shipment,
          quotedCents: money.totalCents,
          freightCents: money.freightCents,
          gstCents: money.gstCents,
          quotedBtnCents: btn.totalCents,
          freightBtnCents: btn.freightCents,
          gstBtnCents: btn.gstCents,
        })
      : cargoCustomerAcknowledgementEmail({
          shipment,
          quotedCents: money.totalCents,
          freightCents: money.freightCents,
          gstCents: money.gstCents,
          quotedBtnCents: btn.totalCents,
          freightBtnCents: btn.freightCents,
          gstBtnCents: btn.gstCents,
        });
  const staffTpl =
    kind === "confirmation"
      ? cargoStaffConfirmationEmail({
          shipment,
          quotedCents: money.totalCents,
          quotedBtnCents: btn.totalCents,
        })
      : cargoStaffAcknowledgementEmail({
          shipment,
          quotedCents: money.totalCents,
          quotedBtnCents: btn.totalCents,
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
        attachments,
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
        attachments:
          kind === "acknowledgement" ? attachments : undefined,
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
    console.error("[email] cargo lifecycle send issues", {
      parcelNumber,
      kind,
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
