import { readFileSync } from "fs";
import path from "path";
import { getBrand } from "@/lib/branding";
import { formatCargoAnswer } from "@/lib/cargo/submit";
import { PDF_FONT_FAMILY, pdfFontFaceCss } from "@/lib/documents/pdfFonts";

export type CargoDocumentData = {
  id: string;
  parcelNumber: string;
  status: "new" | "reviewed" | "closed";
  paid: boolean;
  paidAt: Date | null;
  submitterName: string | null;
  email: string | null;
  phone: string | null;
  answers: Record<string, string | number | boolean | string[]>;
  notes: string | null;
  googleResponseId: string | null;
  submittedAt: Date | null;
  createdAt: Date;
};

function esc(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function longDate(date: Date) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(date);
}

function statusLabel(status: CargoDocumentData["status"]) {
  if (status === "new") return "New";
  if (status === "reviewed") return "Reviewed";
  return "Closed";
}

function norm(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatCargoAnswerSafe(value: unknown) {
  return formatCargoAnswer(value as string | number | boolean | string[]);
}

function isChecked(value: string, needle: string) {
  const hay = value.toLowerCase();
  const n = needle.toLowerCase();
  return hay.includes(n);
}

function matchesAny(haystack: string, options: string[]) {
  const h = haystack.toLowerCase();
  return options.some((o) => h.includes(o.toLowerCase()));
}

function assetDataUri(filename: string) {
  try {
    const filePath = path.join(
      process.cwd(),
      "public",
      "documents",
      "eticket-assets",
      filename,
    );
    const buf = readFileSync(filePath);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
}

function field(label: string, value: string, opts?: { wide?: boolean }) {
  const filled = value.trim() ? esc(value) : "&nbsp;";
  return `<div class="field${opts?.wide ? " wide" : ""}">
    <div class="label">${esc(label)}</div>
    <div class="value">${filled}</div>
  </div>`;
}

function blank(label: string) {
  return field(label, "");
}

function checkItem(label: string, on: boolean) {
  return `<span class="check${on ? " on" : ""}"><span class="box">${on ? "✓" : ""}</span>${esc(label)}</span>`;
}

function checkGrid(items: { label: string; on: boolean }[]) {
  return `<div class="checks">${items.map((i) => checkItem(i.label, i.on)).join("")}</div>`;
}

function section(title: string, body: string) {
  return `<section class="block">
    <h2>${esc(title)}</h2>
    <div class="block-body">${body}</div>
  </section>`;
}

/** Structured A4 cargo declaration PDF — inspired by the L&B air cargo form. */
export function renderCargoDocumentHtml(data: CargoDocumentData) {
  const brand = getBrand();
  const when = data.submittedAt || data.createdAt;
  const answers = data.answers;
  const usedKeys = new Set<string>();

  const take = (...candidates: string[]) => {
    const byNorm = new Map<string, { key: string; value: unknown }>();
    for (const [key, value] of Object.entries(answers)) {
      byNorm.set(norm(key), { key, value });
    }
    for (const candidate of candidates) {
      const hit = byNorm.get(norm(candidate));
      if (!hit) continue;
      const text = formatCargoAnswerSafe(hit.value);
      if (!text || text === "—") continue;
      usedKeys.add(hit.key);
      return text;
    }
    return "";
  };

  const senderName =
    take("Sender Name", "Full Name", "Name", "Shipper Name", "Consignor") ||
    data.submitterName ||
    "";
  const senderCompany = take(
    "Company Name (if applicable)",
    "Company",
    "Company Name",
  );
  const senderAddress = [
    take("Residential Address", "Address", "Sender Address"),
    take("City"),
    take("Country"),
  ]
    .filter(Boolean)
    .join(", ");
  const senderPhone =
    take("Phone Number", "Phone", "Mobile Number", "Mobile") ||
    data.phone ||
    "";
  const senderEmail =
    take("Email Address", "Email", "Contact Email") || data.email || "";
  const senderPassport = take(
    "Passport Number",
    "Passport/ID No",
    "Passport",
    "ID No",
  );

  const receiverName = take(
    "Receiver Name",
    "Consignee",
    "Recipient Name",
    "Receiver Full Name",
  );
  const receiverCompany = take(
    "Receiver Company",
    "Consignee Company",
    "Receiver Company Name",
  );
  const receiverAddress = take(
    "Receiver Address",
    "Consignee Address",
    "Delivery Address",
  );
  const receiverPhone = take(
    "Receiver Phone",
    "Consignee Phone",
    "Receiver Mobile",
  );
  const receiverEmail = take("Receiver Email", "Consignee Email");
  const receiverPassport = take("Receiver Passport", "Consignee Passport");
  const relationship = take("Relationship to Sender", "Relationship");

  const bookingRef =
    data.parcelNumber ||
    take("Reference Number", "Booking Reference", "Booking Ref") ||
    data.id.slice(-10).toUpperCase();
  const flightDate = take(
    "Preferred Flight Month",
    "Flight Date",
    "Travel Date",
  );
  const direction = take("Direction", "Route", "Flight Route");
  const packages = take("Number of Packages", "Packages", "Pieces", "Qty");
  const weight = take(
    "Estimated Weight (kg)",
    "Weight (kg)",
    "Weight",
    "Total Weight",
  );
  const dimensions = take(
    "Dimensions (Length × Width × Height)",
    "Dimensions",
    "Size",
  );
  const declaredValue = take(
    "Declared Cargo Value",
    "Declared Value (AUD)",
    "Declared Value",
    "Cargo Value",
  );
  const paymentMethod = take("Payment Method", "Form of Payment");
  const insuranceWish = take(
    "Would you like cargo insurance?",
    "Insurance Required?",
    "Cargo Insurance",
    "Insurance",
  );
  const insuranceAmount = take(
    "Insurance Amount Requested",
    "Insurance Premium",
  );
  const cargoDesc = take(
    "Cargo description",
    "Description of Goods",
    "Description",
    "Cargo Details",
    "Item Description",
  );
  const classification = take(
    "Tick all that apply",
    "Cargo Classification",
    "Classification",
  );
  const packaging = take("Packaging Type", "Packaging");
  const specialHandling = take("Special Handling", "Handling");
  const biosecurity = take("Biosecurity Declaration", "Biosecurity");
  const dangerous = take(
    "Does your shipment contain any of the following?",
    "Dangerous Goods",
    "Prohibited",
  );
  const terms = take("Terms & Conditions", "Please confirm.", "Declaration");

  let routePerthParo = false;
  let routeParoPerth = false;
  if (direction) {
    const d = direction.toLowerCase();
    const iPerth = d.indexOf("perth");
    const iParo = d.indexOf("paro");
    if (iPerth >= 0 && iParo >= 0) {
      routePerthParo = iPerth < iParo;
      routeParoPerth = iParo < iPerth;
    } else {
      routePerthParo =
        isChecked(direction, "perth → paro") ||
        isChecked(direction, "perth-paro") ||
        isChecked(direction, "perth to paro");
      routeParoPerth =
        isChecked(direction, "paro → perth") ||
        isChecked(direction, "paro-perth") ||
        isChecked(direction, "paro to perth");
    }
  }

  const insuranceYes =
    isChecked(insuranceWish, "yes") ||
    isChecked(insuranceWish, "true") ||
    isChecked(insuranceWish, "required");
  const insuranceNo =
    isChecked(insuranceWish, "no") ||
    (!insuranceYes && Boolean(insuranceWish));

  const leftover = Object.entries(answers).filter(([k]) => !usedKeys.has(k));

  const headerUri =
    assetDataUri("header-page1.png") || assetDataUri("logo-lb.png");
  const ref = data.parcelNumber || data.id.slice(-10).toUpperCase();

  const packagingChecks = checkGrid([
    { label: "Carton", on: matchesAny(packaging, ["carton", "box"]) },
    { label: "Suitcase", on: matchesAny(packaging, ["suitcase", "luggage"]) },
    { label: "Wooden crate", on: matchesAny(packaging, ["wooden", "crate"]) },
    { label: "Pallet", on: matchesAny(packaging, ["pallet"]) },
    {
      label: "Plastic container",
      on: matchesAny(packaging, ["plastic", "container"]),
    },
    {
      label: packaging && !matchesAny(packaging, ["carton", "box", "suitcase", "luggage", "wooden", "crate", "pallet", "plastic", "container"])
        ? `Other — ${packaging}`
        : "Other",
      on: Boolean(
        packaging &&
          !matchesAny(packaging, [
            "carton",
            "box",
            "suitcase",
            "luggage",
            "wooden",
            "crate",
            "pallet",
            "plastic",
            "container",
          ]),
      ),
    },
  ]);

  const classificationChecks = checkGrid([
    {
      label: "Personal effects",
      on: matchesAny(classification, ["personal"]),
    },
    {
      label: "Household goods",
      on: matchesAny(classification, ["household"]),
    },
    { label: "Documents", on: matchesAny(classification, ["document"]) },
    { label: "Clothing", on: matchesAny(classification, ["clothing", "apparel"]) },
    {
      label: "Electronics",
      on: matchesAny(classification, ["electronic"]),
    },
    {
      label: "Commercial goods",
      on: matchesAny(classification, ["commercial"]),
    },
    {
      label: "Food products",
      on: matchesAny(classification, ["food"]),
    },
    { label: "Gifts", on: matchesAny(classification, ["gift"]) },
    {
      label: "Handicrafts",
      on: matchesAny(classification, ["handicraft"]),
    },
    {
      label:
        classification &&
        !matchesAny(classification, [
          "personal",
          "household",
          "document",
          "clothing",
          "apparel",
          "electronic",
          "commercial",
          "food",
          "gift",
          "handicraft",
        ])
          ? `Other — ${classification}`
          : "Other",
      on: Boolean(
        classification &&
          !matchesAny(classification, [
            "personal",
            "household",
            "document",
            "clothing",
            "apparel",
            "electronic",
            "commercial",
            "food",
            "gift",
            "handicraft",
          ]),
      ),
    },
  ]);

  const handlingChecks = checkGrid([
    { label: "Fragile", on: matchesAny(specialHandling, ["fragile"]) },
    {
      label: "Keep upright",
      on: matchesAny(specialHandling, ["upright"]),
    },
    {
      label: "Handle with care",
      on: matchesAny(specialHandling, ["care", "handle"]),
    },
    {
      label: "Do not stack",
      on: matchesAny(specialHandling, ["stack"]),
    },
    {
      label: "Temperature sensitive",
      on: matchesAny(specialHandling, ["temperature", "temp"]),
    },
    {
      label: "High value",
      on: matchesAny(specialHandling, ["high value", "valuable"]),
    },
    {
      label: "None",
      on:
        !specialHandling ||
        matchesAny(specialHandling, ["none", "n/a", "na"]),
    },
  ]);

  const styles = `
    ${pdfFontFaceCss()}
    @page { size: A4; margin: 10mm 11mm 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #fff;
      color: #1a2332;
      font-family: ${PDF_FONT_FAMILY};
      font-size: 10px;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet { width: 100%; max-width: 188mm; margin: 0 auto; }
    .top-rule {
      height: 4px;
      background: linear-gradient(90deg, #0b2c5a 0%, #0b2c5a 72%, #f5c518 72%, #f5c518 100%);
      margin-bottom: 10px;
    }
    .masthead {
      display: grid;
      grid-template-columns: 1.15fr 1fr;
      gap: 10px;
      align-items: end;
      padding-bottom: 8px;
      border-bottom: 1.5px solid #0b2c5a;
      margin-bottom: 8px;
    }
    .masthead img.header {
      display: block;
      width: 100%;
      max-height: 48px;
      object-fit: contain;
      object-position: left center;
    }
    .masthead img.logo {
      width: 48px;
      height: 48px;
      object-fit: contain;
    }
    .title-block { text-align: right; }
    .title-block .kicker {
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #0b2c5a;
    }
    .title-block h1 {
      margin: 3px 0 2px;
      font-size: 16px;
      line-height: 1.15;
      letter-spacing: 0.01em;
      color: #0b2c5a;
      font-weight: 800;
    }
    .title-block .sub { font-size: 9.5px; color: #4b5563; }
    .meta-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      align-items: center;
      background: #f4f7fb;
      border: 1px solid #d5dde8;
      padding: 6px 9px;
      margin-bottom: 9px;
      font-size: 9.5px;
    }
    .meta-bar strong { color: #0b2c5a; }
    .badge {
      margin-left: auto;
      border: 1px solid #0b2c5a;
      color: #0b2c5a;
      font-size: 8.5px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 2px 7px;
    }
    .parties {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 9px;
    }
    .block { margin-bottom: 8px; page-break-inside: avoid; }
    .block h2 {
      margin: 0;
      background: #0b2c5a;
      color: #fff;
      font-size: 9px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 5px 8px;
      font-weight: 700;
    }
    .block-body {
      border: 1px solid #c8d0db;
      border-top: 0;
      padding: 7px 8px 8px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 10px;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 6px 10px;
    }
    .grid-4 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr;
      gap: 6px 8px;
    }
    .field .label {
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #6b7280;
      margin-bottom: 1px;
    }
    .field .value {
      min-height: 16px;
      border-bottom: 1px solid #9aa6b5;
      padding: 1px 0 2px;
      font-size: 10.5px;
      color: #111827;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .field.wide { grid-column: 1 / -1; }
    .subhead {
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #0b2c5a;
      margin: 7px 0 4px;
    }
    .subhead:first-child { margin-top: 0; }
    .checks {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
    }
    .check {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 9.5px;
      color: #374151;
    }
    .check .box {
      width: 11px;
      height: 11px;
      border: 1.3px solid #0b2c5a;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 8px;
      font-weight: 800;
      color: #0b2c5a;
      flex-shrink: 0;
    }
    .check.on { color: #0b2c5a; font-weight: 600; }
    .check.on .box { background: #e8eef7; }
    .muted { color: #6b7280; font-size: 9px; }
    .note {
      margin-top: 6px;
      background: #fffbeb;
      border-left: 3px solid #f5c518;
      padding: 5px 7px;
      white-space: pre-wrap;
    }
    .declare-list {
      margin: 4px 0 0;
      padding-left: 16px;
      color: #374151;
      font-size: 9px;
    }
    .declare-list li { margin-bottom: 2px; }
    .sign-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-top: 6px;
    }
    .sign-box {
      border: 1px solid #c8d0db;
      padding: 7px 8px 6px;
      min-height: 72px;
    }
    .sign-box .who {
      font-size: 8px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #0b2c5a;
      margin-bottom: 18px;
    }
    .sign-box .line {
      border-top: 1px solid #9aa6b5;
      margin-top: 14px;
      padding-top: 3px;
      font-size: 8px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .footer {
      margin-top: 10px;
      border-top: 2px solid #f5c518;
      padding-top: 6px;
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 9px;
      color: #0b2c5a;
      font-weight: 600;
    }
    table.items {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5px;
    }
    table.items th {
      text-align: left;
      background: #eef2f7;
      border-bottom: 1px solid #c5ced8;
      padding: 4px 5px;
      font-size: 8px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #374151;
    }
    table.items td {
      border-bottom: 1px solid #e5e7eb;
      padding: 4px 5px;
      vertical-align: top;
    }
  `;

  const parties = `<div class="parties">
    ${section(
      "Consignor (Sender)",
      `<div class="grid-2">
        ${field("Full name", senderName, { wide: true })}
        ${field("Company", senderCompany, { wide: true })}
        ${field("Address", senderAddress, { wide: true })}
        ${field("Phone", senderPhone)}
        ${field("Email", senderEmail)}
        ${field("Passport / ID", senderPassport, { wide: true })}
      </div>`,
    )}
    ${section(
      "Consignee (Receiver)",
      `<div class="grid-2">
        ${field("Full name", receiverName, { wide: true })}
        ${field("Company", receiverCompany, { wide: true })}
        ${field("Address", receiverAddress, { wide: true })}
        ${field("Phone", receiverPhone)}
        ${field("Email", receiverEmail)}
        ${field("Passport / ID", receiverPassport)}
        ${field("Relationship", relationship)}
      </div>`,
    )}
  </div>`;

  const shipment = section(
    "Shipment details",
    `<div class="grid-4">
      ${field("Booking / reference", bookingRef)}
      ${field("Date received", longDate(when))}
      ${field("Preferred flight", flightDate)}
      ${field("Payment method", paymentMethod)}
    </div>
    <div class="subhead">Route</div>
    <div class="checks">
      ${checkItem("Perth → Paro", routePerthParo)}
      ${checkItem("Paro → Perth", routeParoPerth)}
      ${direction && !routePerthParo && !routeParoPerth ? checkItem(direction, true) : ""}
    </div>
    <div class="grid-3" style="margin-top:7px">
      ${field("Packages", packages)}
      ${field("Estimated weight (kg)", weight)}
      ${field("Dimensions", dimensions)}
    </div>`,
  );

  const cargo = section(
    "Cargo description",
    `${field("Description of goods", cargoDesc, { wide: true })}
    <div class="grid-2" style="margin-top:6px">
      ${field("Declared value (AUD)", declaredValue)}
      ${field("Qty / packages", packages)}
    </div>
    <div class="subhead">Packaging type</div>
    ${packagingChecks}
    <div class="subhead">Cargo classification</div>
    ${classificationChecks}
    <div class="subhead">Special handling</div>
    ${handlingChecks}`,
  );

  const insurance = section(
    "Insurance (optional)",
    `<p class="muted" style="margin:0 0 5px">Insurance is optional but recommended. Premium is typically 1.5% of declared value (minimum AUD $20).</p>
    <div class="checks" style="margin-bottom:6px">
      ${checkItem("YES — insure this shipment", insuranceYes)}
      ${checkItem("NO — liability limited under Terms & Conditions", insuranceNo)}
    </div>
    <div class="grid-2">
      ${field("Declared cargo value (AUD)", declaredValue)}
      ${field("Insurance amount / premium", insuranceAmount)}
    </div>`,
  );

  const declarations = section(
    "Declarations",
    `${
      biosecurity
        ? `<div class="subhead">Biosecurity</div>${field("", biosecurity, { wide: true })}`
        : ""
    }
    ${
      dangerous
        ? `<div class="subhead">Restricted / prohibited goods response</div>${field("", dangerous, { wide: true })}`
        : `<div class="subhead">Prohibited &amp; restricted goods</div>
           <p class="muted" style="margin:0 0 4px">Sender declares the shipment does not contain explosives, firearms, illegal drugs, flammable liquids, corrosives, toxic/hazardous or radioactive materials, counterfeit goods, undeclared dangerous goods, live animals, or goods prohibited by Australian or Bhutanese law.</p>`
    }
    ${terms ? `<div class="subhead">Terms acceptance</div>${field("", terms, { wide: true })}` : ""}
    <div class="subhead">Declaration by sender</div>
    <ol class="declare-list">
      <li>The information on this form is true, complete and accurate.</li>
      <li>Cargo is packed safely and securely; contents are fully declared.</li>
      <li>Cargo is subject to security screening, customs and quarantine.</li>
      <li>The sender accepts responsibility for fines, duties or losses from incorrect declarations.</li>
      <li>${esc(brand.issuingAgent)} may inspect, reject or refuse non-compliant shipments.</li>
      <li>Unless insurance is purchased, liability is limited under Conditions of Carriage and Cargo Terms.</li>
    </ol>`,
  );

  const leftoverHtml =
    leftover.length > 0
      ? section(
          "Additional form answers",
          `<table class="items"><thead><tr><th>Field</th><th>Answer</th></tr></thead><tbody>
            ${leftover
              .map(
                ([k, v]) =>
                  `<tr><td>${esc(k)}</td><td>${esc(formatCargoAnswerSafe(v))}</td></tr>`,
              )
              .join("")}
          </tbody></table>`,
        )
      : "";

  const office = section(
    "Office use only",
    `<div class="grid-4">
      ${field("Internal ref", ref)}
      ${field("Status", statusLabel(data.status))}
      ${field("Payment", data.paid ? "Paid" : "Unpaid")}
      ${field("Source", data.googleResponseId ? "Google Form" : "Admin entry")}
    </div>
    <div class="grid-4" style="margin-top:6px">
      ${blank("Cargo receipt no.")}
      ${data.paid && data.paidAt ? field("Paid on", longDate(data.paidAt)) : blank("Paid on")}
      ${blank("Actual weight (kg)")}
      ${field("Est. weight (kg)", weight)}
    </div>
    <div class="grid-4" style="margin-top:6px">
      ${blank("Chargeable weight (kg)")}
      ${blank("Freight (AUD)")}
      ${blank("Insurance (AUD)")}
      ${blank("Total payable (AUD)")}
    </div>
    ${
      data.notes
        ? `<div class="note"><strong>Admin notes</strong><br />${esc(data.notes)}</div>`
        : ""
    }
    <div class="sign-row">
      <div class="sign-box">
        <div class="who">Customer signature</div>
        <div class="line">Name / signature / date</div>
      </div>
      <div class="sign-box">
        <div class="who">${esc(brand.issuingAgent)} authorised officer</div>
        <div class="line">Name / position / signature / date</div>
      </div>
    </div>`,
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Air Cargo Declaration ${esc(ref)}</title>
  <style>${styles}</style>
</head>
<body>
  <div class="sheet">
    <div class="top-rule"></div>
    <header class="masthead">
      <div>
        ${
          headerUri
            ? headerUri.includes("header-page1")
              ? `<img class="header" src="${headerUri}" alt="${esc(brand.issuingAgent)}" />`
              : `<img class="logo" src="${headerUri}" alt="${esc(brand.issuingAgent)}" />`
            : `<div style="font-size:15px;font-weight:800;color:#0b2c5a">${esc(brand.issuingAgent)}</div>`
        }
      </div>
      <div class="title-block">
        <div class="kicker">${esc(brand.issuingAirline)} · Chartered cargo</div>
        <h1>Air Cargo Declaration &amp; Insurance</h1>
        <div class="sub">Route: Paro ⇄ Perth · ${esc(brand.issuingAgent)}</div>
      </div>
    </header>

    <div class="meta-bar">
      <span><strong>Ref</strong> ${esc(ref)}</span>
      <span><strong>Received</strong> ${esc(longDate(when))}</span>
      ${data.email ? `<span><strong>Contact</strong> ${esc(data.email)}</span>` : ""}
      <span class="badge">${esc(statusLabel(data.status))}</span>
      <span class="badge">${data.paid ? "Paid" : "Unpaid"}</span>
    </div>

    ${parties}
    ${shipment}
    ${cargo}
    ${insurance}
    ${declarations}
    ${leftoverHtml}
    ${office}

    <div class="footer">
      <span>${esc(brand.agentPhonePrimary)} | ${esc(brand.agentPhoneSecondary)}</span>
      <span>${esc(brand.agentWebsite)}</span>
      <span>${esc(brand.agentEmail)}</span>
    </div>
  </div>
</body>
</html>`;
}
