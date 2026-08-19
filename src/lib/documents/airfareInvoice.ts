import { getBrand } from "@/lib/branding";
import {
  cityName,
  computeInvoiceTotals,
} from "@/lib/documents/invoiceFields";
import {
  CONTENT_SIDE_PADDING_MM,
  screenChromeCss,
  screenFooterHtml,
  screenHeaderHtml,
} from "@/lib/documents/documentChrome";
import { PDF_FONT_FAMILY, pdfFontFaceCss } from "@/lib/documents/pdfFonts";
import type { BookingDocumentData } from "@/lib/documents/templates";
import { passengerTypeLabel } from "@/lib/booking/passengers";
import { getBankTransferDetails } from "@/lib/payments/bank";

function esc(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** PDF-style money: $1,234 */
/**
 * Always two decimals, matching `formatAud` used by the travel document — the
 * old 0..2 range rendered GST of 40480 cents as "$404.8" and made the same
 * total read differently on the invoice and the e-ticket.
 */
function money(cents: number) {
  const n = (Math.max(0, cents) / 100).toLocaleString("en-AU", {
    minimumFractionDigits: 2,
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
    gstOverrideCents: invoice.gstOverrideCents || 0,
  });
  const unpaid = invoice.status === "unpaid";
  const bank = getBankTransferDetails();
  const bankName =
    bank?.bankName || process.env.BANK_NAME?.trim() || "Commonwealth Bank";
  const bankSwift = bank?.swiftCode || "CTBAAU2S";
  const bankAddress =
    bank?.bankAddress ||
    "Commonwealth Bank of Australia, 217a Main St, Osborne Park WA 6017";
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

  const travellers =
    data.passengers?.length > 0
      ? data.passengers
      : [
          {
            fullName: data.passengerName,
            ticketNumber: data.ticketNumber,
            passengerType: "adult" as const,
            priceCents: 0,
            allocatesSeat: true,
          },
        ];
  const adults = travellers.filter(
    (p) => (p.passengerType || "adult") === "adult",
  );
  const children = travellers.filter((p) => p.passengerType === "child");
  const infants = travellers.filter((p) => p.passengerType === "infant");
  const hasPartyMix =
    children.length > 0 || infants.length > 0 || travellers.length > 1;

  /** Qty / unit / total for each invoice line. */
  type ItemRow = {
    name: string;
    qty: number;
    unitCents: number;
    totalCents: number;
  };
  const itemRows: ItemRow[] = [];

  if (hasPartyMix && lines.airfareCents > 0) {
    const childTotal = children.reduce((s, p) => s + (p.priceCents || 0), 0);
    const infantTotal = infants.reduce((s, p) => s + (p.priceCents || 0), 0);
    const adultTotal = Math.max(0, lines.airfareCents - childTotal - infantTotal);
    const adultUnit =
      adults.length > 0 ? Math.round(adultTotal / adults.length) : 0;
    // Absorb rounding drift on the last adult line.
    let adultAssigned = 0;
    adults.forEach((p, i) => {
      const isLast = i === adults.length - 1;
      const total = isLast
        ? Math.max(0, adultTotal - adultAssigned)
        : adultUnit;
      adultAssigned += total;
      itemRows.push({
        name: `Airfare — Adult — ${p.fullName}`,
        qty: 1,
        unitCents: total,
        totalCents: total,
      });
    });
    for (const p of children) {
      const total = Math.max(0, p.priceCents || 0);
      itemRows.push({
        name: `Airfare — Child (75%) — ${p.fullName}`,
        qty: 1,
        unitCents: total,
        totalCents: total,
      });
    }
    for (const p of infants) {
      const total = Math.max(0, p.priceCents || 0);
      itemRows.push({
        name: `Airfare — Infant (10%, no seat) — ${p.fullName}`,
        qty: 1,
        unitCents: total,
        totalCents: total,
      });
    }
  } else {
    itemRows.push({
      name: "Airfare",
      qty: lines.airfareCents > 0 ? Math.max(1, data.seatsBooked) : 0,
      unitCents:
        lines.airfareCents > 0 && data.seatsBooked > 0
          ? Math.round(lines.airfareCents / data.seatsBooked)
          : 0,
      totalCents: lines.airfareCents,
    });
  }

  for (const [name, cents] of [
    ["Airport Taxes", lines.airportTaxesCents],
    ["Travel Insurance", lines.travelInsuranceCents],
    ["Other Charges", lines.otherChargesCents],
  ] as const) {
    // Zero-value lines were printed as "$0" rows purely for completeness; they
    // padded every invoice with dead rows and pushed the totals onto page 2.
    if (cents > 0) {
      itemRows.push({ name, qty: 1, unitCents: cents, totalCents: cents });
    }
  }
  if (lines.extraBaggageCents > 0) {
    const bagQty = Math.max(1, Math.floor(data.extraBaggageKg ?? 0));
    itemRows.push({
      name: "Extra Baggage",
      qty: bagQty,
      unitCents: Math.round(lines.extraBaggageCents / bagQty),
      totalCents: lines.extraBaggageCents,
    });
  }
  if ((invoice.serviceFeeCents || 0) > 0) {
    itemRows.push({
      name: "Payment surcharge",
      qty: 1,
      unitCents: invoice.serviceFeeCents || 0,
      totalCents: invoice.serviceFeeCents || 0,
    });
  }

  const passengerListHtml = travellers
    .map((p, i) => {
      const type = passengerTypeLabel(p.passengerType || "adult");
      const seat =
        p.passengerType === "infant" || p.allocatesSeat === false
          ? " · no seat"
          : "";
      const price =
        (p.priceCents ?? 0) > 0 &&
        (p.passengerType === "child" || p.passengerType === "infant")
          ? ` · ${money(p.priceCents ?? 0)}`
          : "";
      return `<div class="pax-line"><span class="pax-n">${i + 1}.</span> <strong>${esc(p.fullName)}</strong> <span class="pax-meta">(${esc(type)}${esc(seat)}${esc(price)})</span>${
        p.ticketNumber
          ? `<span class="pax-ticket"> · Ticket ${esc(p.ticketNumber)}</span>`
          : ""
      }${
        p.passportNumber
          ? `<span class="pax-pass"> · Passport ${esc(p.passportNumber)}</span>`
          : ""
      }</div>`;
    })
    .join("");

  const taxPct = ((invoice.gstRateBps ?? 0) / 100).toFixed(0);

  const introHtml = `
      <div class="meta-row">
        <div>
          <div class="invoice-title">INVOICE</div>
          <div class="section-label">Invoice To:</div>
          <div class="invoice-to">
            <div class="row"><span>Name:</span><span>${esc(data.passengerName)}</span></div>
            <div class="row"><span>Passport No:</span><span>${esc(data.passportNumber || "—")}</span></div>
            <div class="row"><span>Email:</span><span>${esc(data.email)}</span></div>
            <div class="row"><span>Phone:</span><span>${esc(data.passengerPhone || invoice.customerPhone || "—")}</span></div>
            <div class="pax-block">
              <div class="pax-heading">Passengers (${travellers.length})</div>
              ${passengerListHtml}
            </div>
          </div>
        </div>
        <div class="meta">
          <div><b>Invoice Date:</b> ${esc(longDate(invoice.createdAt))}</div>
          <div><b>Invoice Number:</b> ${esc(invoice.invoiceNumber)}</div>
          <div><b>Swift Code:</b> ${esc(bankSwift)}</div>
          <div><b>Bank Address:</b> ${esc(bankAddress)}</div>
          <div><b>Business ABN:</b> ${esc(
            !invoice.businessTpn?.trim() || invoice.businessTpn.trim() === "LAC00357"
              ? brand.invoiceBusinessAbn
              : invoice.businessTpn,
          )}</div>
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
      </div>`;

  // A <thead> repeats automatically on every page a long table spans, so the
  // column labels stay visible without any manual page splitting.
  const itemsTableHtml = `<table class="items">
        <thead>
          <tr>
            <th>Item</th>
            <th class="num">Qty</th>
            <th class="num">Unit Price</th>
            <th class="num">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows
            .map(
              (row) => `<tr>
                <td>${esc(row.name)}</td>
                <td class="num">${row.qty}</td>
                <td class="num">${esc(money(row.unitCents).replace("$", ""))}</td>
                <td class="num">${esc(money(row.totalCents))}</td>
              </tr>`,
            )
            .join("")}
        </tbody>
      </table>`;

  const payTotalsHtml = `
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
        <div class="row"><span>Swift Code:</span><span>${esc(bankSwift)}</span></div>
        <div class="row"><span>Bank Address:</span><span>${esc(bankAddress)}</span></div>
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
                (invoice.gstOverrideCents || 0) > 0
                  ? "(custom)"
                  : totals.gstIncluded
                    ? "(incl.)"
                    : "(excl.)"
              }</span><span>${
                (invoice.gstOverrideCents || 0) > 0 ? "" : `${esc(taxPct)}%`
              }</span></div>
        <div class="line"><span></span><span>${esc(money(totals.gstCents))}</span></div>`
            : ""
        }
        <div class="rule"></div>
        <div class="grand"><span>Total</span><span>${esc(money(totals.amountCents))}</span></div>
      </div>
      </div>`;

  const styles = `
    ${pdfFontFaceCss()}
    /*
     * Header and footer are painted by Chromium into the @page margin box
     * (see documentChrome.ts), so content flows freely and can never overlap
     * them. No fixed page heights, no manual row chunking.
     */
    @page { size: A4; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      background: #fff;
      color: #111;
      font-family: ${PDF_FONT_FAMILY};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .body {
      padding: 12px ${CONTENT_SIDE_PADDING_MM}mm 4px;
    }
    ${screenChromeCss()}
    /* On screen only, mimic the A4 sheet so the admin preview looks right. */
    @media screen {
      body {
        background: #eef1f5;
      }
      .sheet {
        width: 210mm;
        min-height: 297mm;
        margin: 0 auto;
        background: #fff;
        box-shadow: 0 4px 24px rgba(0,0,0,.08);
      }
    }
    .meta-row {
      display: grid;
      grid-template-columns: 1.15fr 0.95fr;
      gap: 18px;
      align-items: start;
      margin-bottom: 6px;
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
    .pax-block {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px dashed #c5ced8;
    }
    .pax-block .pax-heading {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .pax-line {
      font-size: 12.5px;
      line-height: 1.45;
      margin: 3px 0;
    }
    .pax-n { font-weight: 700; color: #0b2c5a; }
    .pax-meta, .pax-ticket, .pax-pass { color: #444; font-weight: 500; }
    .flight {
      margin: 4px 0 14px;
      font-size: 13px;
      line-height: 1.6;
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
    }
    /* Repeat column labels when the table spans pages; never split a row. */
    table.items thead { display: table-header-group; }
    table.items tr { break-inside: avoid; page-break-inside: avoid; }
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
    /*
     * Table layout, not flex: Chromium *drops* content when it fragments a flex
     * container across a page boundary (the "Payment Information" heading and
     * SUBTOTAL row silently disappeared). Table cells fragment correctly.
     */
    .pay-totals-row {
      display: table;
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      margin-top: 8px;
    }
    .pay-totals-row > .pay {
      display: table-cell;
      width: 60%;
      vertical-align: top;
      padding-right: 24px;
    }
    .pay-totals-row > .totals {
      display: table-cell;
      width: 40%;
      vertical-align: top;
    }
    .totals {
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
    @media print {
      html, body { background: #fff; }
      .sheet { box-shadow: none; margin: 0; width: auto; min-height: 0; }
      /* Keep these blocks whole rather than letting a page break bisect them. */
      .meta-row, .flight, .pay-totals-row, .totals, .pax-line {
        break-inside: avoid;
        page-break-inside: avoid;
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
  <div class="sheet">
    ${screenHeaderHtml()}
    <div class="body">
      ${introHtml}
      ${itemsTableHtml}
      ${payTotalsHtml}
    </div>
    ${screenFooterHtml()}
  </div>
</body>
</html>`;
}
