import { existsSync, readFileSync } from "fs";
import path from "path";
import { CARGO_Q } from "@/lib/cargo/bookingForm";
import { formatKg } from "@/lib/cargo/capacity";
import { extractCargoShipment, type CargoAnswers } from "@/lib/cargo/parties";
import { formatCargoAnswer } from "@/lib/cargo/submit";
import {
  cityName,
  defaultInvoiceIdentity,
  ICON_GLOBE,
  ICON_MAIL,
  ICON_PHONE,
} from "@/lib/documents/invoiceFields";
import { PDF_FONT_FAMILY } from "@/lib/documents/pdfFonts";
import type { BookingDocumentData } from "@/lib/documents/templates";
import { getBankTransferDetails } from "@/lib/payments/bank";

export type CargoInvoiceSource = {
  id: string;
  parcelNumber: string;
  paid: boolean;
  paidAt: Date | null;
  submitterName: string | null;
  email: string | null;
  phone: string | null;
  answers: unknown;
  weightKg: number;
  pieces: number;
  quotedCents: number;
  productName: string;
  createdAt: Date;
  submittedAt: Date | null;
  flight: {
    airline: string;
    flightNumber: string;
    origin: string;
    destination: string;
    departureAt: Date;
    arrivalAt: Date;
  } | null;
};

const NAVY = "#1A3781";
const NAVY_DEEP = "#090946";
const RED = "#AC0707";
const CREAM = "#FAEFDA";
const GOLD = "#FACD17";

const CARGO_RATES: { weight: string; bhutan: string; aud: string }[] = [
  { weight: "Below 500 g - Documents", bhutan: "Nu. 2,500", aud: "$35.54" },
  { weight: "5 kg", bhutan: "Nu. 8,000", aud: "$118.48" },
  { weight: "10 kg", bhutan: "Nu. 13,500", aud: "$199.94" },
  { weight: "20 kg", bhutan: "Nu. 22,500", aud: "$333.23" },
  { weight: "30 kg", bhutan: "Nu. 30,000", aud: "$444.30" },
  { weight: "45 kg", bhutan: "Nu. 36,500", aud: "$540.57" },
  { weight: "100 kg", bhutan: "Nu. 2,000/kg", aud: "$29.62/kg" },
  { weight: "300 kg", bhutan: "Nu. 1,400/kg", aud: "$20.73/kg" },
  { weight: "500 kg", bhutan: "Nu. 1,080/kg", aud: "$16.00/kg" },
  { weight: "1,000 kg+", bhutan: "Nu. 810/kg", aud: "$12.00/kg" },
];

const ICON_PERSON =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="white"><circle cx="12" cy="8" r="3.4"/><path d="M5.2 19.2c.6-3.4 3.2-5.4 6.8-5.4s6.2 2 6.8 5.4"/></svg>';
const ICON_PLANE =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="white"><path d="M21 16.2v-1.7l-8.2-5.1V4.2a1.6 1.6 0 1 0-3.2 0v5.2L1.4 14.5v1.7l8.2-2.6v4.6L7.4 19.6V21l3.6-1 3.6 1v-1.4l-2.2-1.4v-4.6l8.6 2.6z"/></svg>';

function esc(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function asAnswers(value: unknown): CargoAnswers {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as CargoAnswers;
  }
  return {};
}

function takeAnswer(answers: CargoAnswers, ...candidates: string[]) {
  const byNorm = new Map<string, unknown>();
  for (const [key, value] of Object.entries(answers)) {
    byNorm.set(key.toLowerCase().replace(/[^a-z0-9]/g, ""), value);
  }
  for (const candidate of candidates) {
    const hit = byNorm.get(candidate.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (hit == null) continue;
    const text = formatCargoAnswer(hit);
    if (!text || text === "—") continue;
    return text;
  }
  return "";
}

function money(cents: number) {
  const n = (Math.max(0, cents) / 100).toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${n}`;
}

function issueDate(date: Date | null | undefined) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Perth",
  }).format(date);
}

function flightDateLabel(date: Date | null | undefined, fallback: string) {
  if (!date) return fallback;
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function headerDataUri() {
  const filePath = path.join(
    process.cwd(),
    "public",
    "documents",
    "invoice-assets",
    "cargo-invoice-header.png",
  );
  if (!existsSync(filePath)) return "";
  try {
    return `data:image/png;base64,${readFileSync(filePath).toString("base64")}`;
  } catch {
    return "";
  }
}

function partyName(party: { name: string; company: string }) {
  if (party.name && party.company) return `${party.name}, ${party.company}`;
  return party.name || party.company;
}

type PayMode = "bank" | "card" | "cash" | "other";

function paymentMode(raw: string): PayMode {
  const v = raw.toLowerCase();
  if (/bank/.test(v)) return "bank";
  if (/card|credit|debit|stripe/.test(v)) return "card";
  if (/cash/.test(v)) return "cash";
  return raw.trim() ? "other" : "bank";
}

function tick(on: boolean) {
  return `<span class="tick${on ? " on" : ""}">${on ? "✓" : ""}</span>`;
}

/** Kept for callers that still map cargo onto the airfare invoice shape. */
export function cargoToInvoiceData(row: CargoInvoiceSource): BookingDocumentData {
  const shipment = extractCargoShipment({
    id: row.id,
    parcelNumber: row.parcelNumber,
    email: row.email,
    phone: row.phone,
    submitterName: row.submitterName,
    answers: asAnswers(row.answers),
  });
  const bank = getBankTransferDetails();
  const identity = defaultInvoiceIdentity();
  const amount = Math.max(0, row.quotedCents);
  const name =
    shipment.sender.name || row.submitterName || "Cargo customer";
  const origin = row.flight?.origin || shipment.originLabel || "PER";
  const destination =
    row.flight?.destination || shipment.destinationLabel || "PBH";
  const departureAt =
    row.flight?.departureAt || row.submittedAt || row.createdAt;

  return {
    bookingRef: row.parcelNumber,
    ticketNumber: row.parcelNumber,
    accessToken: "",
    createdAt: row.createdAt,
    status: row.paid ? "confirmed" : "pending_payment",
    passengerName: name,
    email: shipment.sender.email || row.email || "",
    passengerPhone: shipment.sender.phone || row.phone,
    passengers: [
      {
        fullName: name,
        ticketNumber: row.parcelNumber,
        passengerType: "adult",
        allocatesSeat: false,
      },
    ],
    seatsBooked: 1,
    fareReleaseName: "Cargo",
    fareProductName: row.productName || "Air cargo",
    paymentMethod: "bank_transfer",
    amountPaidCents: row.paid ? amount : 0,
    serviceFeeCents: 0,
    tripType: "one_way",
    flight: {
      airline: row.flight?.airline || "",
      flightNumber: row.flight?.flightNumber || "CARGO",
      origin,
      destination,
      departureAt,
      arrivalAt: row.flight?.arrivalAt || departureAt,
      cabinClass: "economy",
    },
    invoice: {
      invoiceNumber: `INV-${row.parcelNumber}`,
      amountCents: amount,
      fareCents: amount,
      serviceFeeCents: 0,
      airfareCents: amount,
      airportTaxesCents: 0,
      extraBaggageCents: 0,
      travelInsuranceCents: 0,
      otherChargesCents: 0,
      gstRateBps: 0,
      gstIncluded: false,
      accountNumber: identity.accountNumber,
      businessTpn: identity.businessTpn,
      routeLabel: `${cityName(origin)}-${cityName(destination)}`,
      seatLabel: "",
      nameRef: row.parcelNumber,
      endorsementText: "CARGO — NON-TRANSFERABLE",
      fareCalculationLine: "",
      status: row.paid ? "paid" : "unpaid",
      dueAt: null,
      createdAt: row.createdAt,
      bankAccountName: bank?.accountName ?? null,
      bankBsb: bank?.bsb ?? null,
      bankAccountNumber: bank?.accountNumber ?? null,
      bankReference: row.parcelNumber,
      customerPhone: shipment.sender.phone || row.phone,
      customerEmail: shipment.sender.email || row.email,
      primaryLineName: "Air cargo freight",
    },
  };
}

function headerHtml(headerUri: string) {
  if (headerUri) {
    return `<div class="brand"><img src="${headerUri}" alt="L&amp;B Global · Drukair" /></div>`;
  }
  return `<div class="brand brand-fallback">
    <span class="bar left"></span>
    <span class="wordmark">L&amp;B Global · Drukair</span>
    <span class="bar right"></span>
  </div>`;
}

function partyBox(
  title: string,
  icon: string,
  fields: { label: string; value: string }[],
) {
  return `<section class="party">
    <div class="band">${icon}<span>${title}</span></div>
    <div class="body">
      ${fields
        .map(
          (field) =>
            `<div class="line"><span class="k">${esc(field.label)}:</span> <span class="v">${esc(field.value)}</span></div>`,
        )
        .join("")}
    </div>
  </section>`;
}

function chargeRow(label: string, cents: number, strong = false) {
  return `<div class="charge${strong ? " strong" : ""}"><span>${esc(label)}</span><span class="amt">${esc(money(cents))}</span></div>`;
}

export function renderCargoInvoiceHtml(row: CargoInvoiceSource) {
  const answers = asAnswers(row.answers);
  const shipment = extractCargoShipment({
    id: row.id,
    parcelNumber: row.parcelNumber,
    email: row.email,
    phone: row.phone,
    submitterName: row.submitterName,
    answers,
  });

  const originCode = row.flight?.origin || shipment.originLabel;
  const destCode = row.flight?.destination || shipment.destinationLabel;
  const route = [cityName(originCode), cityName(destCode)]
    .filter(Boolean)
    .join("-");
  const flightNo = row.flight
    ? `${row.flight.airline} ${row.flight.flightNumber}`.trim()
    : takeAnswer(answers, CARGO_Q.flightNumber, "Flight Number", "Flight No");
  const goods =
    takeAnswer(answers, CARGO_Q.classification, "Tick all that apply") ||
    row.productName ||
    shipment.description;
  const description =
    shipment.description ||
    takeAnswer(answers, CARGO_Q.description, "Description of Goods") ||
    goods;
  const declaredValue =
    takeAnswer(
      answers,
      CARGO_Q.declaredValue,
      "Declared Cargo Value",
      "Declared Value (AUD)",
      "Declared Value",
    ) || "";
  const pieces =
    row.pieces > 0
      ? String(row.pieces)
      : shipment.packages || takeAnswer(answers, CARGO_Q.pieces, "Pieces");
  const weight =
    row.weightKg > 0 ? formatKg(row.weightKg) : shipment.weight;
  const chargeable = weight;
  const freight = Math.max(0, row.quotedCents);
  const paid = row.paid ? freight : 0;
  const balance = Math.max(0, freight - paid);
  const pay = paymentMode(
    takeAnswer(answers, CARGO_Q.paymentMethod, "Payment Method", "Form of Payment"),
  );
  const issued = issueDate(row.submittedAt || row.createdAt);
  const flightDate = flightDateLabel(
    row.flight?.departureAt,
    shipment.flightDate || takeAnswer(answers, CARGO_Q.flightDate, "Flight Date"),
  );
  const headerUri = headerDataUri();

  const rateRows = CARGO_RATES.map(
    (rate, i) => `<tr class="${i % 2 === 1 ? "alt" : ""}">
      <td>${esc(rate.weight)}</td>
      <td>${esc(rate.bhutan)}</td>
      <td>${esc(rate.aud)}</td>
    </tr>`,
  ).join("");

  const blankLines = Array.from({ length: 15 }, () => "<tr><td colspan=\"4\"></td></tr>").join(
    "",
  );

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="utf-8" />
  <title>Cargo Invoice/Receipt ${esc(row.parcelNumber)}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      font-family: ${PDF_FONT_FAMILY};
      color: #111;
      background: #e8e8ea;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      width: 210mm;
      min-height: 297mm;
      margin: 16px auto;
      background: #fff;
      position: relative;
      page-break-after: always;
      overflow: hidden;
    }
    .sheet:last-child { page-break-after: auto; margin-bottom: 16px; }
    .pad { padding: 0 13mm 12mm; }
    .brand img { display: block; width: 100%; height: auto; }
    .brand-fallback {
      display: flex; align-items: stretch; height: 18mm;
    }
    .brand-fallback .bar { flex: 1; background: ${NAVY}; }
    .brand-fallback .bar.left { flex: 0 0 18mm; }
    .brand-fallback .wordmark {
      display: flex; align-items: center; padding: 0 10px;
      font-weight: 700; color: ${NAVY}; font-size: 13px;
    }
    h1 {
      margin: 10mm 0 5mm;
      text-align: center;
      font-size: 28px;
      letter-spacing: 0.02em;
      font-weight: 800;
    }
    .meta {
      display: flex; justify-content: space-between;
      font-size: 12.5px; font-weight: 700;
      margin: 0 0 6mm;
    }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
    .party { border: 1.5px solid ${NAVY_DEEP}; min-height: 34mm; }
    .party + .party { border-left: 0; }
    .band {
      background: ${NAVY_DEEP}; color: #fff;
      font-size: 11.5px; font-weight: 700; letter-spacing: 0.04em;
      padding: 5px 10px; display: flex; align-items: center; gap: 7px;
    }
    .band svg { display: block; flex-shrink: 0; }
    .party .body { padding: 7px 10px 8px; font-size: 11.5px; line-height: 1.55; }
    .party .k { font-weight: 700; }
    .flight { margin-top: 5mm; border: 1.5px solid ${NAVY_DEEP}; }
    .grid {
      display: grid; grid-template-columns: 1fr 1fr;
      padding: 8px 12px 10px; font-size: 12px; line-height: 1.7;
    }
    .grid .k { font-weight: 700; }
    table.rates { width: 100%; border-collapse: collapse; margin-top: 5mm; font-size: 12px; }
    table.rates thead tr:first-child th {
      background: ${NAVY_DEEP}; color: #fff; font-size: 13px;
      letter-spacing: 0.08em; padding: 6px 8px; text-align: center;
    }
    table.rates thead tr:last-child th {
      background: ${RED}; color: #fff; font-size: 10.5px;
      letter-spacing: 0.06em; padding: 5px 8px; font-weight: 700;
    }
    table.rates td { padding: 4.5px 10px; text-align: center; }
    table.rates td:first-child { text-align: left; padding-left: 18px; }
    table.rates tr.alt td { background: ${CREAM}; }
    .summary { margin-top: 6mm; }
    .summary h2 {
      margin: 0 0 3mm; font-size: 16px; letter-spacing: 0.04em;
    }
    .charge {
      display: flex; justify-content: space-between; align-items: baseline;
      border-bottom: 1px solid #111; padding: 5px 0 3px;
      font-size: 13px;
    }
    .charge.strong { font-weight: 800; font-size: 14px; padding-top: 7px; }
    .charge .amt { min-width: 28mm; text-align: right; }
    .payline {
      margin-top: 7mm; display: flex; justify-content: space-between;
      align-items: center; font-size: 12.5px; font-weight: 700; gap: 12px;
    }
    .modes { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .tick {
      display: inline-flex; align-items: center; justify-content: center;
      width: 13px; height: 13px; border: 1.4px solid #222; margin-right: 5px;
      font-size: 10px; line-height: 1; vertical-align: -1px;
    }
    .tick.on { background: #111; color: #fff; border-color: #111; }
    .sheet-2 h1 { margin-top: 8mm; margin-bottom: 6mm; }
    table.goods { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    table.goods th {
      text-align: left; font-size: 12px; letter-spacing: 0.06em;
      padding: 0 8px 8px; border-bottom: 1.5px solid #111;
    }
    table.goods th.no { width: 14%; }
    table.goods th.qty { width: 16%; }
    table.goods th.val { width: 24%; }
    table.goods td { height: 9.2mm; border-bottom: 1px solid #222; padding: 0 8px; vertical-align: middle; }
    table.goods tr.fill td { height: 11mm; font-size: 12px; }
    .foot {
      position: absolute; left: 13mm; right: 13mm; bottom: 9mm;
    }
    .foot .rule { height: 2px; background: ${GOLD}; margin-bottom: 8px; }
    .contacts {
      display: grid; grid-template-columns: 1.15fr 0.9fr 1.1fr; gap: 8px;
      font-size: 10.5px; color: #222; font-weight: 600;
    }
    .contacts .item { display: flex; align-items: center; gap: 8px; }
    .dot {
      width: 22px; height: 22px; border-radius: 50%; background: ${GOLD};
      color: #fff; display: inline-flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .dot svg { display: block; }
    .phones { line-height: 1.35; }
    @media print {
      html, body { background: #fff; }
      .sheet { margin: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <article class="sheet">
    ${headerHtml(headerUri)}
    <div class="pad">
      <h1>CARGO INVOICE/RECEIPT</h1>
      <div class="meta">
        <div>RECEIPT NO: ${esc(row.parcelNumber)}</div>
        <div>DATE OF ISSUE: ${esc(issued)}</div>
      </div>
      <div class="parties">
        ${partyBox("SHIPPER / SENDER", ICON_PERSON, [
          { label: "Name", value: partyName(shipment.sender) },
          { label: "Address", value: shipment.sender.address },
          { label: "Email", value: shipment.sender.email || row.email || "" },
          { label: "Phone", value: shipment.sender.phone || row.phone || "" },
        ])}
        ${partyBox("CONSIGNEE / RECEIVER", ICON_PERSON, [
          { label: "Name", value: partyName(shipment.receiver) },
          { label: "Address", value: shipment.receiver.address },
          { label: "Email", value: shipment.receiver.email },
          { label: "Phone", value: shipment.receiver.phone },
        ])}
      </div>
      <section class="flight">
        <div class="band">${ICON_PLANE}<span>FLIGHT &amp; CARGO DETAILS</span></div>
        <div class="grid">
          <div><span class="k">Route:</span> ${esc(route)}</div>
          <div><span class="k">Flight No.:</span> ${esc(flightNo)}</div>
          <div><span class="k">Flight Date:</span> ${esc(flightDate)}</div>
          <div><span class="k">No. Pieces:</span> ${esc(pieces)}</div>
          <div><span class="k">Actual Weight:</span> ${esc(weight)}</div>
          <div><span class="k">Chargeable Weight:</span> ${esc(chargeable)}</div>
          <div><span class="k">Goods:</span> ${esc(goods)}</div>
          <div><span class="k">Declared Value:</span> ${esc(declaredValue)}</div>
        </div>
      </section>
      <table class="rates">
        <thead>
          <tr><th colspan="3">CARGO RATES</th></tr>
          <tr>
            <th>WEIGHT</th>
            <th>BHUTAN RATE</th>
            <th>APPROX. AUD RATE</th>
          </tr>
        </thead>
        <tbody>${rateRows}</tbody>
      </table>
      <section class="summary">
        <h2>CHARGES SUMMARY:</h2>
        ${chargeRow("Cargo/Freight Charge", freight)}
        ${chargeRow("Handling Charge", 0)}
        ${chargeRow("Security/Screening Charge", 0)}
        ${chargeRow("Other Charges", 0)}
        ${chargeRow("GST (if applicable)", 0)}
        ${chargeRow("Total Charges", freight, true)}
        ${chargeRow("Amount Paid", paid, true)}
        ${chargeRow("Balance Due", balance, true)}
      </section>
      <div class="payline">
        <div class="modes">
          <span>Payment Mode:</span>
          <span>${tick(pay === "bank")}Bank Transfer</span>
          <span>${tick(pay === "card")}Card</span>
          <span>${tick(pay === "cash")}Cash</span>
          <span>${tick(pay === "other")}Other</span>
        </div>
        <div>Reference: ${esc(row.parcelNumber)}</div>
      </div>
    </div>
  </article>
  <article class="sheet sheet-2">
    ${headerHtml(headerUri)}
    <div class="pad">
      <h1>CARGO DETAILS</h1>
      <table class="goods">
        <thead>
          <tr>
            <th class="no">NO</th>
            <th>DESCRIPTION OF GOODS</th>
            <th class="qty">QTY</th>
            <th class="val">DECLARED VALUE</th>
          </tr>
        </thead>
        <tbody>
          <tr class="fill">
            <td>1</td>
            <td>${esc(description)}</td>
            <td>${esc(pieces)}</td>
            <td>${esc(declaredValue)}</td>
          </tr>
          ${blankLines}
        </tbody>
      </table>
    </div>
    <footer class="foot">
      <div class="rule"></div>
      <div class="contacts">
        <div class="item">
          <span class="dot">${ICON_PHONE}</span>
          <span class="phones">+61 424 919 833 | +61 451 106 077<br>+975 1756 6856 | +975 7778 1399</span>
        </div>
        <div class="item"><span class="dot">${ICON_GLOBE}</span>www.lbglobal.com.au</div>
        <div class="item"><span class="dot">${ICON_MAIL}</span>ticketing@lbglobal.com.au</div>
      </div>
    </footer>
  </article>
</body>
</html>`;
}
