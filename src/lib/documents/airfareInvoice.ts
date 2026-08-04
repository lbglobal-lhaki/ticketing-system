import { readFileSync } from "fs";
import path from "path";
import { getBrand } from "@/lib/branding";
import {
  cityName,
  computeInvoiceTotals,
  ICON_GLOBE,
  ICON_MAIL,
  ICON_PHONE,
} from "@/lib/documents/invoiceFields";
import { PDF_FONT_FAMILY, pdfFontFaceCss } from "@/lib/documents/pdfFonts";
import type { BookingDocumentData } from "@/lib/documents/templates";

function esc(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function assetDataUri(filename: string) {
  const candidates = [
    path.join(process.cwd(), "public", "documents", "invoice-assets", filename),
    path.join(process.cwd(), "public", "documents", "eticket-assets", filename),
  ];
  for (const filePath of candidates) {
    try {
      const buf = readFileSync(filePath);
      return `data:image/png;base64,${buf.toString("base64")}`;
    } catch {
      /* try next */
    }
  }
  return "";
}

/** PDF-style money: $1,234 */
function money(cents: number) {
  const n = (Math.max(0, cents) / 100).toLocaleString("en-AU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `$${n}`;
}

function longDate(date: Date | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(date);
}

function travelDateLabel(date: Date) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(date);
}

function normalizeRoute(label: string) {
  return label.replaceAll(" ", "").toLowerCase();
}

export function renderAirfareInvoiceHtml(data: BookingDocumentData) {
  const brand = getBrand();
  const invoice = data.invoice;
  if (!invoice) {
    throw new Error("Invoice missing for airfare invoice document");
  }

  const lines = {
    airfareCents: invoice.airfareCents || invoice.fareCents || 0,
    airportTaxesCents: invoice.airportTaxesCents || 0,
    extraBaggageCents: invoice.extraBaggageCents || 0,
    travelInsuranceCents: invoice.travelInsuranceCents || 0,
    otherChargesCents: invoice.otherChargesCents || 0,
  };
  const totals = computeInvoiceTotals({
    ...lines,
    serviceFeeCents: invoice.serviceFeeCents || 0,
    gstRateBps: invoice.gstRateBps,
    gstIncluded: invoice.gstIncluded,
  });
  const unpaid = invoice.status === "unpaid";
  const bankName = process.env.BANK_NAME?.trim() || "Brule Bank";
  const routeLabel =
    invoice.routeLabel ||
    `${cityName(data.flight.origin)}-${cityName(data.flight.destination)}`;
  const routeOptions = [
    "Paro-Perth",
    "Perth-Paro",
    "Paro-Perth-Paro",
    "Perth-Paro-Perth",
  ];
  const activeRoute = normalizeRoute(routeLabel);

  const lineRows: Array<[string, number]> = [
    ["Airfare", lines.airfareCents],
    ["Airport Taxes", lines.airportTaxesCents],
    ["Extra Baggage", lines.extraBaggageCents],
    ["Travel Insurance", lines.travelInsuranceCents],
    ["Other Charges", lines.otherChargesCents],
  ];
  if ((invoice.serviceFeeCents || 0) > 0) {
    lineRows.push(["Payment surcharge", invoice.serviceFeeCents || 0]);
  }

  // header.png's canvas is 30px too short and crops the "GLOBAL" pill under
  // the L&B logo — header-wide.png is the same artwork, uncropped.
  const headerUri =
    assetDataUri("header-wide.png") || assetDataUri("header-page1.png");
  const taxPct = ((invoice.gstRateBps ?? 0) / 100).toFixed(0);

  const styles = `
    ${pdfFontFaceCss()}
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      /* White so PDF never shows grey band below a short page. */
      background: #fff;
      color: #111;
      font-family: ${PDF_FONT_FAMILY};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      width: 210mm;
      /* Fill exactly one A4 sheet and pin the footer to the bottom. */
      min-height: 297mm;
      height: 297mm;
      margin: 0 auto;
      background: #fff;
      display: flex;
      flex-direction: column;
    }
    .header-img { display: block; width: 100%; height: auto; flex-shrink: 0; }
    .topbar-fallback { height: 12px; background: #0b2c5a; flex-shrink: 0; }
    .body {
      padding: 12px 36px 4px;
      flex: 1 1 auto;
      min-height: 0;
    }
    .meta-row {
      display: grid;
      grid-template-columns: 1.15fr 0.95fr;
      gap: 18px;
      align-items: start;
      margin-bottom: 6px;
      break-inside: avoid;
    }
    .invoice-title {
      margin: 6px 0 12px;
      font-size: 40px;
      font-weight: 800;
      letter-spacing: 0.02em;
      line-height: 1;
    }
    .meta {
      text-align: right;
      font-size: 12.5px;
      line-height: 1.7;
      padding-top: 4px;
    }
    .meta b { font-weight: 700; }
    .due {
      margin-top: 10px;
      font-size: 13px;
      font-weight: 800;
    }
    .section-label {
      margin: 0 0 8px;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .invoice-to {
      font-size: 13px;
      line-height: 1.65;
      margin-bottom: 12px;
    }
    .invoice-to .row {
      display: grid;
      grid-template-columns: 110px 1fr;
      gap: 8px;
    }
    .invoice-to .row span:first-child { font-weight: 700; }
    .flight {
      margin: 4px 0 14px;
      font-size: 13px;
      line-height: 1.6;
      break-inside: avoid;
    }
    .flight .row {
      display: grid;
      grid-template-columns: 175px 1fr;
      gap: 8px;
      margin: 4px 0;
      align-items: start;
    }
    .flight .row > span:first-child {
      font-weight: 800;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      font-size: 12px;
      white-space: nowrap;
    }
    .routes {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 16px;
    }
    .route {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12.5px;
    }
    .box {
      width: 13px;
      height: 13px;
      border: 1.5px solid #222;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 800;
      line-height: 1;
      flex-shrink: 0;
    }
    .box.on { background: #0b2c5a; border-color: #0b2c5a; color: #fff; }
    table.items {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      margin-top: 6px;
      break-inside: avoid;
    }
    table.items tr { break-inside: avoid; }
    table.items th {
      text-align: left;
      font-size: 12px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 6px 6px;
      border-bottom: 1.5px solid #c5ced8;
    }
    table.items th.num, table.items td.num { text-align: right; }
    table.items td {
      padding: 7px 6px;
      border-bottom: 1px solid #d7dde5;
      vertical-align: middle;
    }
    table.items td:first-child { font-weight: 600; }
    .pay-totals-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      margin-top: 8px;
      break-inside: avoid;
    }
    .totals {
      width: 260px;
      flex-shrink: 0;
      font-size: 13px;
    }
    .totals .line {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 5px 0;
    }
    .totals .line.tax span:last-child { color: #333; }
    .totals .rule {
      border-top: 2px solid #111;
      margin: 6px 0 4px;
    }
    .totals .grand {
      display: flex;
      justify-content: space-between;
      font-size: 16px;
      font-weight: 800;
      padding-top: 4px;
    }
    .pay {
      font-size: 13px;
      line-height: 1.55;
      max-width: 420px;
      flex: 1;
    }
    .pay h3 {
      margin: 0 0 8px;
      font-size: 14px;
      font-weight: 800;
    }
    .pay .row {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 6px;
    }
    .ref {
      margin-top: 8px;
      font-weight: 800;
      font-size: 13px;
    }
    .status {
      display: inline-block;
      margin-top: 8px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: ${unpaid ? "#8a3b12" : "#0f3d2e"};
    }
    .footer {
      margin-top: auto;
      border-top: 2px solid #f5c518;
      padding: 10px 28px 14px;
      flex-shrink: 0;
      break-inside: avoid;
    }
    .footer-row {
      display: grid;
      grid-template-columns: 1.2fr 1fr 1.1fr;
      gap: 10px;
      font-size: 12px;
      color: #333;
      font-weight: 500;
    }
    .footer .item { display: flex; align-items: center; gap: 8px; }
    .footer .dot {
      width: 22px; height: 22px; border-radius: 50%;
      background: #f5c518; color: #fff;
      display: inline-flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .footer .dot svg { display: block; }
    @media print {
      html, body { background: #fff; }
      .page {
        margin: 0;
        width: 210mm;
        min-height: 297mm;
        height: 297mm;
      }
      .footer, table.items tr, .pay-totals-row, .flight, .meta-row {
        break-inside: avoid;
      }
    }
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${esc(invoice.invoiceNumber)}</title>
  <style>${styles}</style>
</head>
<body>
  <section class="page">
    ${
      headerUri
        ? `<img class="header-img" src="${headerUri}" alt="L&B Global · Drukair" />`
        : `<div class="topbar-fallback"></div>`
    }
    <div class="body">
      <div class="meta-row">
        <div>
          <div class="invoice-title">INVOICE</div>
          <div class="section-label">Invoice To:</div>
          <div class="invoice-to">
            <div class="row"><span>Name:</span><span>${esc(data.passengerName)}</span></div>
            <div class="row"><span>Passport No:</span><span>${esc(data.passportNumber || "—")}</span></div>
            <div class="row"><span>Email:</span><span>${esc(data.email)}</span></div>
            <div class="row"><span>Phone:</span><span>${esc(data.passengerPhone || invoice.customerPhone || "—")}</span></div>
          </div>
        </div>
        <div class="meta">
          <div><b>Invoice Date:</b> ${esc(longDate(invoice.createdAt))}</div>
          <div><b>Invoice Number:</b> ${esc(invoice.invoiceNumber)}</div>
          <div><b>Account Number:</b> ${esc(invoice.accountNumber || brand.invoiceAccountNumber)}</div>
          <div><b>Business TPN Number:</b> ${esc(invoice.businessTpn || brand.invoiceBusinessTpn)}</div>
          ${
            invoice.dueAt
              ? `<div class="due">INVOICE DUE DATE:<br />${esc(longDate(invoice.dueAt))}</div>`
              : unpaid
                ? `<div class="due">INVOICE DUE DATE:<br />On receipt</div>`
                : `<div class="due">STATUS:<br />Paid</div>`
          }
          <div class="status">${unpaid ? "Unpaid" : "Paid"}</div>
        </div>
      </div>

      <div class="section-label">Flight Details:</div>
      <div class="flight">
        <div class="row">
          <span>Route:</span>
          <div class="routes">
            ${routeOptions
              .map((r) => {
                const on = normalizeRoute(r) === activeRoute;
                return `<span class="route"><span class="box${on ? " on" : ""}">${on ? "✓" : ""}</span>${esc(r)}</span>`;
              })
              .join("")}
            ${
              !routeOptions.some((r) => normalizeRoute(r) === activeRoute)
                ? `<span class="route"><span class="box on">✓</span>${esc(routeLabel)}</span>`
                : ""
            }
          </div>
        </div>
        <div class="row"><span>Travel Date:</span><span>${esc(travelDateLabel(data.flight.departureAt))}${
          data.returnFlight
            ? ` · Return ${esc(travelDateLabel(data.returnFlight.departureAt))}`
            : ""
        }</span></div>
        <div class="row"><span>Booking Reference:</span><span><strong>${esc(data.bookingRef)}</strong></span></div>
      </div>

      <table class="items">
        <thead>
          <tr>
            <th>Item</th>
            <th class="num">Qty</th>
            <th class="num">Unit Price</th>
            <th class="num">Total</th>
          </tr>
        </thead>
        <tbody>
          ${lineRows
            .map(([name, cents]) => {
              const qty = cents > 0 ? data.seatsBooked : 0;
              const unit =
                cents > 0 && data.seatsBooked > 0
                  ? Math.round(cents / data.seatsBooked)
                  : 0;
              return `<tr>
                <td>${esc(name)}</td>
                <td class="num">${qty}</td>
                <td class="num">${esc(money(unit).replace("$", ""))}</td>
                <td class="num">${esc(money(cents))}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>

      <div class="pay-totals-row">
      <div class="pay">
        <h3>Payment Information</h3>
        ${
          unpaid
            ? `
        <div class="row"><span>Account Name :</span><span>${esc(invoice.bankAccountName || "—")}</span></div>
        <div class="row"><span>Bank:</span><span>${esc(bankName)}</span></div>
        <div class="row"><span>BSB:</span><span>${esc(invoice.bankBsb || "—")}</span></div>
        <div class="row"><span>Account no. :</span><span>${esc(invoice.bankAccountNumber || "—")}</span></div>
        <div class="ref">Reference: Invoice Number / Passenger Name</div>
        <p style="margin:8px 0 0;font-size:12px;color:#444">Please use <strong>${esc(invoice.bankReference || invoice.invoiceNumber)} / ${esc(data.passengerName)}</strong> as the payment reference.</p>
        <p style="margin:10px 0 0;font-size:12px;color:#444"><strong>Transaction instructions:</strong> This invoice is unpaid. After you transfer the funds, email a screenshot of the payment to <strong>${esc(brand.paymentProofEmail)}</strong> so your booking can be confirmed.</p>`
            : `
        <div class="row"><span>Status:</span><span>Paid</span></div>
        <div class="row"><span>Form of Payment:</span><span>${
          data.paymentMethod === "card"
            ? "Credit Card"
            : data.paymentMethod === "bank_transfer"
              ? "Bank Transfer"
              : data.paymentMethod === "cash"
                ? "Cash"
                : "—"
        }</span></div>
        <div class="row"><span>Transaction ID:</span><span>${esc(invoice.stripePaymentIntentId || data.bookingRef)}</span></div>
        <div class="ref">Reference: Invoice Number / Passenger Name</div>`
        }
        ${
          invoice.notes
            ? `<p style="margin-top:12px;font-size:12px;color:#444">${esc(invoice.notes)}</p>`
            : ""
        }
      </div>

      <div class="totals">
        <div class="line"><span>SUBTOTAL</span><span>${esc(money(totals.subtotalCents))}</span></div>
        ${
          totals.gstCents > 0
            ? `<div class="line tax"><span>GST / Tax ${
                totals.gstIncluded ? "(incl.)" : "(excl.)"
              }</span><span>${esc(taxPct)}%</span></div>
        <div class="line"><span></span><span>${esc(money(totals.gstCents))}</span></div>`
            : ""
        }
        <div class="rule"></div>
        <div class="grand"><span>Total</span><span>${esc(money(totals.amountCents))}</span></div>
      </div>
      </div>
    </div>

    <div class="footer">
      <div class="footer-row">
        <div class="item"><span class="dot">${ICON_PHONE}</span>${esc(brand.agentPhonePrimary)} | ${esc(brand.agentPhoneSecondary)}</div>
        <div class="item"><span class="dot">${ICON_GLOBE}</span>${esc(brand.agentWebsite)}</div>
        <div class="item"><span class="dot">${ICON_MAIL}</span>${esc(brand.agentEmail)}</div>
      </div>
    </div>
  </section>
</body>
</html>`;
}
