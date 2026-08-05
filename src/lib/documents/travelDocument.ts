import { readFileSync } from "fs";
import path from "path";
import { formatAud } from "@/lib/pricing";
import { getBrand } from "@/lib/branding";
import {
  cityName,
  computeInvoiceTotals,
  defaultBaggageLabel,
  displayTicketCode,
  ICON_GLOBE,
  ICON_MAIL,
  ICON_PHONE,
} from "@/lib/documents/invoiceFields";
import { PDF_FONT_FAMILY, pdfFontFaceCss } from "@/lib/documents/pdfFonts";
import type { BookingDocumentData } from "@/lib/documents/templates";
import { passengerTypeLabel } from "@/lib/booking/passengers";

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
    path.join(process.cwd(), "public", "documents", "eticket-assets", filename),
    path.join(process.cwd(), "public", "documents", "invoice-assets", filename),
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

function paymentMethodLabel(method: string | null) {
  if (method === "card") return "Credit Card";
  if (method === "bank_transfer") return "Bank Transfer";
  if (method === "cash") return "Cash";
  return "—";
}

function cabinLabel(cabin: string) {
  return cabin.replaceAll("_", " ").toUpperCase();
}

function countryForAirport(code: string) {
  const c = code.toUpperCase();
  if (c === "PBH") return "Bhutan";
  if (c === "PER") return "Australia";
  if (["SYD", "MEL", "BNE", "ADL", "PER"].includes(c)) return "Australia";
  return "";
}

/** PDF-style date: DD/MM/YYYY */
function ticketDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(date);
}

/** PDF-style time: 08:30 A.M */
function ticketTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Australia/Sydney",
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const dayPeriod = (parts.find((p) => p.type === "dayPeriod")?.value ?? "AM")
    .toUpperCase()
    .replace("AM", "A.M")
    .replace("PM", "P.M");
  return `${hour}:${minute} ${dayPeriod}`;
}

function longDate(date: Date) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(date);
}

function barcodeSvg(vertical = false) {
  const bars: string[] = [];
  let x = 0;
  const pattern = [2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 2, 3, 1, 1, 2, 1, 3, 2, 1, 2, 1, 3, 1, 2];
  for (const w of pattern) {
    bars.push(
      `<rect x="${x}" y="0" width="${w}" height="80" fill="#0b2c5a"/>`,
    );
    x += w + 1;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="80" viewBox="0 0 ${x} 80">${bars.join("")}</svg>`;
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  if (vertical) {
    return `<img class="barcode-v" src="${uri}" alt="" />`;
  }
  return `<img class="barcode-h" src="${uri}" alt="" />`;
}

function checkItem(label: string) {
  return `<li><span class="cb"></span>${esc(label)}</li>`;
}

function boardingPass(
  flight: BookingDocumentData["flight"],
  opts: {
    passengerName: string;
    ticketCode: string;
    issueDate: Date;
    seat: string;
    baggage: string;
    mapUri: string;
  },
) {
  const originCity = cityName(flight.origin);
  const destCity = cityName(flight.destination);
  const originCountry = countryForAirport(flight.origin);
  const destCountry = countryForAirport(flight.destination);

  return `
  <div class="pass">
    <div class="pass-main" style="background-image:url('${opts.mapUri}')">
      <div class="pass-left">
        ${barcodeSvg(true)}
        <div class="not-board">THIS IS NOT A BOARDING PASS</div>
      </div>
      <div class="pass-body">
        <div class="pass-meta">
          <div><span>Passenger Name</span><strong>${esc(opts.passengerName)}</strong></div>
          <div><span>Ticket No</span><strong>${esc(opts.ticketCode)}</strong></div>
          <div><span>Date of Issue</span><strong>${esc(ticketDate(opts.issueDate))}</strong></div>
        </div>
        <div class="pass-route">
          <div class="endpoint">
            <div class="code">From <b>${esc(flight.origin.toUpperCase())}</b></div>
            <div class="place">${esc(originCity)}${originCountry ? `<br />${esc(originCountry)}` : ""}</div>
          </div>
          <div class="route-arrow">➜</div>
          <div class="endpoint to">
            <div class="code">To <b>${esc(flight.destination.toUpperCase())}</b></div>
            <div class="place">${esc(destCity)}${destCountry ? `<br />${esc(destCountry)}` : ""}</div>
          </div>
        </div>
        <div class="pass-grid">
          <div><span>Flight No</span><strong>${esc(flight.flightNumber)}</strong></div>
          <div><span>Date</span><strong>${esc(ticketDate(flight.departureAt))}</strong></div>
          <div><span>Departure</span><strong>${esc(ticketTime(flight.departureAt))}<small>${esc(flight.origin.toUpperCase())} Time</small></strong></div>
          <div><span>Arrival</span><strong>${esc(ticketTime(flight.arrivalAt))}<small>${esc(flight.destination.toUpperCase())} Time</small></strong></div>
          <div><span>Class</span><strong>${esc(cabinLabel(flight.cabinClass))}</strong></div>
          <div><span>Seat</span><strong>${esc(opts.seat)}</strong></div>
          <div><span>Included Baggage</span><strong>${esc(opts.baggage)}</strong></div>
        </div>
        <div class="pass-perks">
          <div><strong>DIRECT FLIGHT</strong><span>No Transit. No Hassle</span></div>
          <div><strong>COMFORTABLE JOURNEY</strong><span>Safe. Reliable. On Time</span></div>
          <div><strong>FOR ALL</strong><span>Students. Families. Travellers</span></div>
        </div>
      </div>
    </div>
    <div class="pass-stub" style="background-image:url('${opts.mapUri}')">
      <div class="stub-name"><span>Passenger Name</span><strong>${esc(opts.passengerName)}</strong></div>
      <div class="stub-route">
        <div><b>From ${esc(flight.origin.toUpperCase())}</b><small>${esc(originCity)} ${esc(originCountry)}</small></div>
        <div class="stub-arrow">→</div>
        <div><b>To ${esc(flight.destination.toUpperCase())}</b><small>${esc(destCity)} ${esc(destCountry)}</small></div>
      </div>
      <div class="stub-rows">
        <div><span>Ticket No:</span><strong>${esc(opts.ticketCode)}</strong></div>
        <div><span>Flight No:</span><strong>${esc(flight.flightNumber)}</strong></div>
        <div><span>Date:</span><strong>${esc(ticketDate(flight.departureAt))}</strong></div>
        <div><span>Seat:</span><strong>${esc(opts.seat)}</strong></div>
        <div><span>Class</span><strong>${esc(cabinLabel(flight.cabinClass))}</strong></div>
      </div>
      <div class="stub-bar">
        ${barcodeSvg(false)}
        <div>THIS IS NOT A BOARDING PASS</div>
      </div>
    </div>
  </div>`;
}

export function renderTravelDocumentHtml(data: BookingDocumentData) {
  const brand = getBrand();
  const invoice = data.invoice;
  const seat = invoice?.seatLabel?.trim() || "TBA";
  const nameRef = invoice?.nameRef?.trim() || data.bookingRef.slice(-7);
  const fareName = data.fareProductName || data.fareReleaseName || "";
  const baggage = defaultBaggageLabel(data.flight.cabinClass, fareName);
  const unpaid = data.status !== "confirmed" && invoice?.status !== "paid";

  const lines = {
    airfareCents: invoice?.airfareCents ?? invoice?.fareCents ?? 0,
    airportTaxesCents: invoice?.airportTaxesCents ?? 0,
    extraBaggageCents: invoice?.extraBaggageCents ?? 0,
    travelInsuranceCents: invoice?.travelInsuranceCents ?? 0,
    otherChargesCents: invoice?.otherChargesCents ?? 0,
  };
  const serviceFee = data.serviceFeeCents || invoice?.serviceFeeCents || 0;
  const totals = computeInvoiceTotals({
    ...lines,
    serviceFeeCents: serviceFee,
    gstRateBps: invoice?.gstRateBps ?? 1000,
    gstIncluded: invoice?.gstIncluded ?? false,
    gstOverrideCents: invoice?.gstOverrideCents ?? 0,
  });
  const totalCents = totals.amountCents;
  const fop = paymentMethodLabel(data.paymentMethod);
  const endorsement =
    invoice?.endorsementText?.trim() ||
    "NON-TRANSFERABLE / SUBJECT TO FARE RULES";
  const fareCalc =
    invoice?.fareCalculationLine?.trim() ||
    `${data.flight.origin}${data.flight.destination} ${(totals.linesCents / 100).toFixed(2)}AUD END`;

  // Prefer the full-width header (same as invoice) so the brand bar is not cropped.
  const headerUri =
    assetDataUri("header-wide.png") || assetDataUri("header-page1.png");
  const bannerUri =
    assetDataUri("p2-banner.png") || assetDataUri("charter-banner.png");
  const mapUri = assetDataUri("world-map.png");
  const meatUri = assetDataUri("icon-meat.png");
  const produceUri = assetDataUri("icon-produce.png");

  const routeLabel = `${cityName(data.flight.origin).toUpperCase()} ⇄ ${cityName(data.flight.destination).toUpperCase()}`;

  const styles = `
    ${pdfFontFaceCss()}
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      background: #fff;
      color: #111;
      font-family: ${PDF_FONT_FAMILY};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    /* Exact A4 sheet — same shell as the invoice */
    .page {
      width: 210mm;
      min-height: 297mm;
      height: 297mm;
      margin: 0 auto 12px;
      background: #fff;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,.08);
    }
    .header-img {
      display: block;
      width: 100%;
      max-width: 100%;
      height: auto;
      flex-shrink: 0;
      object-fit: cover;
      object-position: center top;
    }
    .topbar-fallback { height: 12px; background: #0b2c5a; flex-shrink: 0; }
    .page-body {
      flex: 1 1 auto;
      padding: 14px 22px 8px;
      overflow: hidden;
    }
    .page-body.letter {
      padding: 24px 40px 12px;
      font-size: 13px;
      line-height: 1.5;
      color: #1a1a1a;
    }
    .page-body.letter .to-line { margin: 0 0 14px; }
    .page-body.letter h3 {
      font-size: 14px;
      margin: 16px 0 6px;
      color: #111;
    }
    .page-body.letter ul { margin: 0 0 12px; padding-left: 20px; }
    .page-body.letter li { margin: 3px 0; }
    .page-body.letter .p1-sign { margin-top: 20px; }
    .page-body.pass-page {
      display: flex;
      flex-direction: column;
      gap: 10px;
      justify-content: flex-start;
    }
    .pass-page-title {
      text-align: center;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #0b2c5a;
      margin: 0;
      flex-shrink: 0;
    }
    .footer {
      margin-top: auto;
      border-top: 2px solid #f5c518;
      padding: 10px 22px 12px;
      flex-shrink: 0;
    }
    .footer-row {
      display: grid;
      grid-template-columns: 1.2fr 1fr 1.1fr;
      gap: 8px;
      font-size: 11px;
      color: #333;
      font-weight: 500;
    }
    .footer .item { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .footer .dot {
      width: 20px; height: 20px; border-radius: 50%;
      background: #f5c518; color: #fff;
      display: inline-flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .footer .dot svg { display: block; width: 12px; height: 12px; }
    .p2-title {
      text-align: center;
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.04em;
      margin: 0 0 10px;
      text-transform: uppercase;
    }
    .guest-wrap {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: start;
      margin-bottom: 10px;
    }
    .guest-wrap h2 {
      margin: 0 0 6px;
      font-size: 14px;
      color: #0b2c5a;
    }
    .guest-box {
      border: 1.5px solid #9aa6b5;
      border-radius: 10px;
      padding: 8px 12px;
      width: 100%;
      font-size: 11px;
      line-height: 1.55;
    }
    .guest-box b { display: inline-block; min-width: 110px; }
    .res-no { font-size: 11px; padding-top: 2px; white-space: nowrap; }
    .res-no strong { font-size: 13px; }
    .banner {
      width: 100%;
      max-width: 100%;
      height: auto;
      display: block;
      margin: 6px 0 10px;
      border-radius: 2px;
      object-fit: contain;
    }
    .banner-fallback {
      display: flex;
      align-items: stretch;
      min-height: 78px;
      background: linear-gradient(90deg, #0b2c5a 0%, #1a4f8c 55%, #0b2c5a 100%);
      color: #fff;
      margin: 8px 0 12px;
      overflow: hidden;
    }
    .banner-fallback .mid {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 10px 16px;
    }
    .banner-fallback .mid .kicker { font-size: 12px; font-weight: 800; letter-spacing: .08em; }
    .banner-fallback .mid .route { font-size: 22px; font-weight: 800; margin: 2px 0 6px; }
    .banner-fallback .mid .tag {
      display: inline-block;
      border: 1px solid #fff;
      padding: 2px 8px;
      font-size: 10px;
      letter-spacing: .06em;
      width: fit-content;
    }
    .awaiting-pay {
      margin: 6px 0;
      padding: 10px 12px;
      border: 2px solid #b45309;
      background: #fffbeb;
      border-radius: 8px;
      color: #78350f;
    }
    .awaiting-pay strong { display: block; font-size: 12px; margin-bottom: 4px; }
    .awaiting-pay p { margin: 0; font-size: 11px; line-height: 1.4; }
    .banner-fallback .end {
      width: 54px;
      background: #071c3a;
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .12em;
    }
    .pass {
      display: grid;
      grid-template-columns: 1.55fr 0.7fr;
      border: 1.5px solid #0b2c5a;
      border-radius: 4px;
      overflow: hidden;
      margin: 0;
      flex: 0 0 auto;
      height: 195px;
    }
    .pass-main, .pass-stub {
      background-color: #f3f7fb;
      background-size: cover;
      background-position: center;
      background-blend-mode: lighten;
      position: relative;
    }
    .pass-main {
      display: grid;
      grid-template-columns: 34px 1fr;
      border-right: 2px dashed #7f93a8;
    }
    .pass-main::before, .pass-stub::before {
      content: "";
      position: absolute; inset: 0;
      background: rgba(255,255,255,.78);
      pointer-events: none;
    }
    .pass-left, .pass-body, .pass-stub > * { position: relative; z-index: 1; }
    .pass-left {
      background: #0b2c5a;
      color: #fff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 2px;
    }
    .barcode-v { width: 18px; height: 110px; object-fit: cover; filter: brightness(10); transform: rotate(90deg); }
    .not-board {
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      font-size: 7px;
      letter-spacing: .08em;
      font-weight: 700;
      text-align: center;
    }
    .pass-body { padding: 8px 10px 0; }
    .pass-meta {
      display: grid;
      grid-template-columns: 1.3fr 1fr 1fr;
      gap: 6px;
      background: #d9eaf7;
      padding: 5px 7px;
      border-radius: 3px;
      font-size: 9px;
    }
    .pass-meta span { display: block; color: #333; }
    .pass-meta strong { color: #0b2c5a; font-size: 11px; }
    .pass-route {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 8px 0 6px;
    }
    .pass-route .code { font-size: 15px; font-weight: 700; }
    .pass-route .place { font-size: 10px; color: #333; line-height: 1.2; margin-top: 1px; }
    .pass-route .route-arrow { font-size: 22px; color: #0b2c5a; font-weight: 800; }
    .pass-route .to { text-align: right; margin-left: auto; }
    .pass-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 3px;
      font-size: 8px;
      margin-bottom: 4px;
    }
    .pass-grid span { display: block; color: #445; }
    .pass-grid strong { display: block; color: #0b2c5a; font-size: 10px; line-height: 1.15; }
    .pass-grid small { display: block; font-size: 7px; font-weight: 600; color: #445; }
    .pass-perks {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
      background: #d7e4f0;
      margin: 0 -10px 0;
      padding: 6px 8px;
      font-size: 8px;
    }
    .pass-perks strong { display: block; font-size: 10px; color: #0b2c5a; }
    .pass-perks span { color: #333; }
    .pass-stub { padding: 10px 10px 8px; display: flex; flex-direction: column; }
    .stub-name span { display: block; font-size: 10px; }
    .stub-name strong { color: #0b2c5a; font-size: 13px; }
    .stub-route { margin: 10px 0; font-size: 13px; }
    .stub-route small { display: block; font-size: 10px; font-weight: 500; }
    .stub-arrow { color: #0b2c5a; font-weight: 800; margin: 4px 0; }
    .stub-rows { font-size: 11px; line-height: 1.55; flex: 1; }
    .stub-rows span { display: inline-block; min-width: 70px; color: #333; }
    .stub-bar { text-align: center; margin-top: 8px; }
    .barcode-h { width: 100%; height: 36px; object-fit: cover; }
    .stub-bar div { font-size: 7px; letter-spacing: .06em; font-weight: 700; color: #0b2c5a; margin-top: 3px; }
    .mid-split {
      display: grid;
      grid-template-columns: 1.15fr 1fr;
      gap: 12px;
      margin: 4px 0 8px;
      padding-top: 8px;
      border-top: 1px solid #c5ced8;
    }
    .mid-split h3 {
      margin: 0 0 6px;
      color: #0b2c5a;
      font-size: 12px;
      letter-spacing: .04em;
    }
    .terms { margin: 0; padding-left: 16px; font-size: 10px; line-height: 1.4; color: #222; }
    .bag-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .bag-card {
      border: 1.5px solid #0b2c5a;
      border-radius: 10px;
      padding: 8px 6px;
      text-align: center;
    }
    .bag-card .cls { font-size: 10px; font-weight: 800; color: #0b2c5a; }
    .bag-card .kg { font-size: 22px; font-weight: 800; color: #0b2c5a; line-height: 1.1; margin: 2px 0; }
    .bag-card .sub { font-size: 9px; color: #333; }
    .money-split {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      border-top: 1px solid #c5ced8;
      padding-top: 8px;
    }
    .money-split h3 {
      margin: 0 0 6px;
      font-size: 11px;
      letter-spacing: .03em;
      text-transform: uppercase;
    }
    .money-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      font-size: 10px;
      margin: 3px 0;
      border-bottom: 1px dotted #d5dbe3;
      padding-bottom: 3px;
    }
    .money-row span:last-child { font-weight: 700; }
    .p3-title {
      display: flex;
      align-items: center;
      gap: 10px;
      justify-content: center;
      margin: 0 0 8px;
    }
    .p3-title h1 {
      margin: 0;
      font-size: 18px;
      letter-spacing: .04em;
      white-space: nowrap;
    }
    .p3-title .bar { flex: 1; height: 8px; background: #0b2c5a; }
    .grid-top {
      display: grid;
      grid-template-columns: 1.15fr .9fr 1fr;
      gap: 6px;
      margin-bottom: 6px;
    }
    .panel {
      border: 1.5px solid #0b2c5a;
      border-radius: 4px;
      overflow: hidden;
      min-height: 0;
    }
    .panel h3 {
      margin: 0;
      background: #0b2c5a;
      color: #fff;
      font-size: 10px;
      letter-spacing: .04em;
      padding: 5px 6px;
    }
    .panel h3 small { display: block; font-weight: 500; font-size: 7px; opacity: .9; margin-top: 1px; }
    .panel .content { padding: 5px 6px 6px; font-size: 9px; }
    .panel ul { list-style: none; margin: 0; padding: 0; }
    .panel li { display: flex; gap: 5px; align-items: flex-start; margin: 1px 0; line-height: 1.2; }
    .cb {
      width: 10px; height: 10px; border: 1px solid #7a8694; border-radius: 1px;
      margin-top: 1px; flex-shrink: 0; display: inline-block;
    }
    .grid-mid {
      display: grid;
      grid-template-columns: 0.95fr 1.35fr;
      gap: 6px;
      margin-bottom: 6px;
    }
    .danger .content { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .danger .col h4 { margin: 0 0 6px; color: #c41212; font-size: 10px; }
    .danger .col li { color: #b10f0f; font-size: 10px; }
    .x {
      width: 11px; height: 11px; border-radius: 50%; background: #c41212; color: #fff;
      font-size: 8px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center;
      margin-top: 1px; flex-shrink: 0;
    }
    .bio-head { color: #1a7a3c; font-weight: 800; font-size: 11px; margin: 0 0 8px; }
    .bio-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 6px;
      margin-bottom: 8px;
    }
    .bio-item {
      border: 1px solid #c5ced8;
      border-radius: 6px;
      padding: 4px;
      text-align: center;
      font-size: 8px;
      line-height: 1.2;
      min-height: 62px;
    }
    .bio-item img { width: 28px; height: 28px; object-fit: contain; display: block; margin: 0 auto 3px; }
    .bio-tip {
      background: #eef6ff;
      border-left: 3px solid #0b2c5a;
      padding: 6px 8px;
      font-size: 10px;
      margin-bottom: 8px;
    }
    .bio-warn {
      color: #b10f0f;
      font-size: 10px;
      font-weight: 700;
      display: flex;
      gap: 6px;
      align-items: flex-start;
    }
    .warn-ico {
      width: 14px; height: 14px; background: #c41212; color: #fff; border-radius: 2px;
      font-size: 10px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .grid-bot {
      display: grid;
      grid-template-columns: 0.7fr 1.6fr;
      gap: 6px;
    }
    .money-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 6px;
      padding: 10px 8px;
      min-height: 72px;
    }
    .money-ico {
      width: 48px; height: 32px; border-radius: 4px; background: #1a7a3c; color: #fff;
      display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px;
    }
    .money-box p { margin: 0; font-size: 12px; font-weight: 800; line-height: 1.3; }
    .arrive-steps {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 6px;
      padding: 12px 8px;
    }
    .step { text-align: center; font-size: 9px; font-weight: 700; }
    .step .bubble {
      width: 42px; height: 42px; border-radius: 50%; border: 2px solid #0b2c5a;
      margin: 0 auto 6px; display: flex; align-items: center; justify-content: center;
      font-size: 16px; background: #f3f7fb;
    }
    @media print {
      html, body { background: #fff; }
      .page {
        box-shadow: none;
        margin: 0;
        width: 210mm;
        height: 297mm;
        min-height: 297mm;
        max-height: 297mm;
        page-break-after: always;
        break-after: page;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .page:last-child {
        page-break-after: auto;
        break-after: auto;
      }
    }
  `;

  const travellers =
    data.passengers?.length > 0
      ? data.passengers
      : [
          {
            fullName: data.passengerName,
            ticketNumber: data.ticketNumber,
            passportNumber: data.passportNumber,
            nationality: data.nationality,
            email: data.email,
            phone: data.passengerPhone,
            passengerType: "adult" as const,
            priceCents: 0,
            allocatesSeat: true,
          },
        ];

  // Infants travel on a ticket but do not receive a seat / boarding pass.
  const boardedTravellers = travellers.filter(
    (pax) => pax.allocatesSeat !== false && pax.passengerType !== "infant",
  );
  const infantTravellers = travellers.filter(
    (pax) => pax.allocatesSeat === false || pax.passengerType === "infant",
  );

  const footerHtml = `
    <div class="footer">
      <div class="footer-row">
        <div class="item"><span class="dot">${ICON_PHONE}</span>${esc(brand.agentPhonePrimary)} | ${esc(brand.agentPhoneSecondary)}</div>
        <div class="item"><span class="dot">${ICON_GLOBE}</span>${esc(brand.agentWebsite)}</div>
        <div class="item"><span class="dot">${ICON_MAIL}</span>${esc(brand.agentEmail)}</div>
      </div>
    </div>`;

  const headerHtml = headerUri
    ? `<img class="header-img" src="${headerUri}" alt="L&B Global · Drukair" />`
    : `<div class="topbar-fallback"></div>`;

  // Collect all boarding-pass cards, then pack 2 per A4 page (no empty sheets).
  const passCards: string[] = unpaid
    ? []
    : boardedTravellers.flatMap((pax) => {
        const typeLabel = passengerTypeLabel(pax.passengerType || "adult");
        const opts = {
          passengerName:
            pax.passengerType && pax.passengerType !== "adult"
              ? `${pax.fullName} (${typeLabel})`
              : pax.fullName,
          ticketCode: displayTicketCode(pax.ticketNumber),
          issueDate: data.createdAt,
          seat,
          baggage: baggage.split("(")[0].trim() || "1 PIECE",
          mapUri,
        };
        const cards = [boardingPass(data.flight, opts)];
        if (data.returnFlight) {
          cards.push(boardingPass(data.returnFlight, opts));
        }
        return cards;
      });

  const boardingPassPages: string[] = [];
  for (let i = 0; i < passCards.length; i += 2) {
    const chunk = passCards.slice(i, i + 2);
    boardingPassPages.push(`
  <section class="page">
    ${headerHtml}
    <div class="page-body pass-page">
      <p class="pass-page-title">Boarding passes</p>
      ${chunk.join("\n")}
    </div>
    ${footerHtml}
  </section>`);
  }

  const infantNotices =
    !unpaid && infantTravellers.length > 0
      ? infantTravellers
          .map(
            (pax) => `
    <div class="awaiting-pay" style="margin:8px 0">
      <strong>Infant (no seat) — ${esc(pax.fullName)}</strong>
      <p>Ticket ${esc(displayTicketCode(pax.ticketNumber))}. Travels with accompanying adult; no seat allocated.${
        (pax.priceCents ?? 0) > 0
          ? ` Fare: ${esc(formatAud(pax.priceCents ?? 0))}.`
          : ""
      }</p>
    </div>`,
          )
          .join("\n")
      : "";

  const guestRows = travellers
    .map((pax, i) => {
      const typeLabel = passengerTypeLabel(pax.passengerType || "adult");
      const seatNote =
        pax.passengerType === "infant" || pax.allocatesSeat === false
          ? " · no seat"
          : "";
      return `
          <div><b>${travellers.length > 1 ? `Passenger ${i + 1}:` : "Guest Name:"}</b> ${esc(pax.fullName)} <span style="color:#666">(${esc(typeLabel)}${esc(seatNote)})</span></div>
          <div><b>Ticket Number:</b> ${esc(displayTicketCode(pax.ticketNumber))}</div>
          ${
            (pax.priceCents ?? 0) > 0 &&
            (pax.passengerType === "child" || pax.passengerType === "infant")
              ? `<div><b>${esc(typeLabel)} fare:</b> ${esc(formatAud(pax.priceCents ?? 0))}</div>`
              : ""
          }
          ${
            pax.passportNumber
              ? `<div><b>Passport:</b> ${esc(pax.passportNumber)}</div>`
              : ""
          }
          ${
            pax.nationality
              ? `<div><b>Nationality:</b> ${esc(pax.nationality)}</div>`
              : ""
          }`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>E-Ticket ${esc(data.bookingRef)}</title>
  <style>${styles}</style>
</head>
<body>
  <!-- PAGE 1: Confirmation letter -->
  <section class="page">
    ${headerHtml}
    <div class="page-body letter">
      <p class="to-line">To: <strong>${esc(data.passengerName)}</strong><br />Date: <strong>${esc(longDate(data.createdAt))}</strong></p>
      <p>Dear Valued Customer,</p>
      <p>
        Thank you for choosing ${esc(brand.issuingAgent)}.
        ${
          unpaid
            ? "Your booking has been reserved and is awaiting payment confirmation."
            : "We have successfully received your payment, and your booking is now confirmed."
        }
      </p>
      <p>Your e-ticket is attached to this email.</p>
      <p>
        Please review all the details on your ticket carefully, including:<br />
        <strong>Passenger Name, Flight Route, Travel Date, Booking Reference, and Passport Details</strong>
      </p>
      <p>If you notice any errors, please get in touch with us immediately before your travel date.</p>

      <h3>Travel Reminders</h3>
      <ul>
        <li>Arrive at the airport at least ${esc(String(brand.arriveHoursBefore))} hours before departure.</li>
        <li>Carry a valid passport and any required travel documents.</li>
        <li>Ensure your baggage complies with the airline's baggage allowance.</li>
        <li>Please comply with all immigration, customs, and biosecurity requirements.</li>
      </ul>

      <p><strong>If you require:</strong><br />
      Extra baggage, Cargo services, Special meals, Wheelchair assistance, Travel insurance, Flight changes (subject to fare conditions)</p>
      <p><strong>Please contact our team before your departure</strong></p>

      <p>
        We sincerely appreciate your trust in ${esc(brand.issuingAgent)} and look forward to welcoming
        you onboard our ${esc(routeLabel)} Direct Chartered Flight.
      </p>
      <p>We wish you a safe and pleasant journey.</p>

      <div class="p1-sign">
        Kind regards,<br />
        <strong>${esc(brand.issuingAgent)}</strong><br />
        ${esc(brand.reservationsTeam)}
      </div>
    </div>
    ${footerHtml}
  </section>

  <!-- PAGE 2: Itinerary / guest summary (no boarding passes — those get their own pages) -->
  <section class="page">
    ${headerHtml}
    <div class="page-body">
    <div class="p2-title">E-Ticket, Itinerary, Receipts and Tax Invoice</div>

    <div class="guest-wrap">
      <div style="flex:1">
        <h2>Guest Information</h2>
        <div class="guest-box">
          ${guestRows}
          <div><b>Name REF:</b> ${esc(nameRef)}</div>
          <div><b>Issue Date:</b> ${esc(ticketDate(data.createdAt))}</div>
          <div><b>Travellers:</b> ${esc(String(travellers.length))}</div>
          <div><b>Issuing Airline:</b> ${esc(brand.issuingAirline)}</div>
          <div><b>Issuing Agent:</b> ${esc(brand.issuingAgent)}</div>
        </div>
      </div>
      <div class="res-no">Reservation Number:<br /><strong>${esc(data.bookingRef)}</strong></div>
    </div>

    ${
      bannerUri
        ? `<img class="banner" src="${bannerUri}" alt="Chartered Flight ${esc(routeLabel)}" />`
        : `<div class="banner-fallback">
            <div class="mid">
              <div class="kicker">CHARTERED FLIGHT</div>
              <div class="route">${esc(routeLabel)}</div>
              <div class="tag">(${esc(brand.charterTagline)})</div>
            </div>
            <div class="end">CHARTERED FLIGHT</div>
          </div>`
    }

    ${
      unpaid
        ? `<div class="awaiting-pay">
            <strong>Awaiting payment confirmation</strong>
            <p>Boarding passes are issued only after your bank transfer is verified. This page is a reservation summary, not a travel document.</p>
          </div>`
        : infantNotices
    }

    <div class="mid-split">
      <div>
        <h3>TERMS &amp; CONDITIONS</h3>
        <ul class="terms">
          <li>This e-ticket is non-transferable and valid only for the named passenger</li>
          <li>Please arrive at the airport at least ${esc(String(brand.arriveHoursBefore))} hours before departure</li>
          <li>Check-in closes 60 minutes prior to departure</li>
          <li>Baggage allowance as per the purchased fare</li>
          <li>Changes or cancellations are subject to the fare rules</li>
          <li>${esc(brand.issuingAgent)} reserves the right to make operational changes due to unforeseen circumstances</li>
          <li>For assistance, contact ${esc(brand.issuingAgent)}</li>
        </ul>
      </div>
      <div>
        <h3>BAGGAGE ALLOWANCE</h3>
        <div class="bag-cards">
          <div class="bag-card">
            <div class="cls">ECONOMY CLASS</div>
            <div class="sub">Check-In Baggage</div>
            <div class="kg">23 KG</div>
            <div class="sub">Max 2 Pieces</div>
          </div>
          <div class="bag-card">
            <div class="cls">BUSINESS CLASS</div>
            <div class="sub">Check-In Baggage</div>
            <div class="kg">30 KG</div>
            <div class="sub">Max 2 Pieces</div>
          </div>
        </div>
      </div>
    </div>

    <div class="money-split">
      <div>
        <h3>Receipt and Tax Invoice Details</h3>
        <div class="money-row"><span>Fare:</span><span>${esc(formatAud(lines.airfareCents || totals.linesCents))}</span></div>
        <div class="money-row"><span>Taxes/Fees/Carrier-Imposed Charges:</span><span>${esc(formatAud(lines.airportTaxesCents))}</span></div>
        <div class="money-row"><span>Fare Calculation Line:</span><span>${esc(fareCalc)}</span></div>
        <div class="money-row"><span>Endorsement / Restrictions:</span><span>${esc(endorsement)}</span></div>
        <div class="money-row"><span>Form of Payment:</span><span>${esc(fop)}</span></div>
        <div class="money-row"><span>Total/Transaction Currency:</span><span>${esc(formatAud(totalCents))} AUD</span></div>
      </div>
      <div>
        <h3>Other Charges</h3>
        <div class="money-row"><span>Preferred Seat:</span><span>${esc(formatAud(0))}</span></div>
        <div class="money-row"><span>Form of Payment:</span><span>${esc(fop)}</span></div>
        <div class="money-row"><span>Payment Surcharge:</span><span>${esc(formatAud(serviceFee))}</span></div>
        <div class="money-row"><span>Total Fare and Other Charges:</span><span>${esc(formatAud(totalCents))}</span></div>
        <div class="money-row"><span>GST on this transaction (10% added):</span><span>${
          totals.gstCents > 0 ? esc(formatAud(totals.gstCents)) : "—"
        }</span></div>
      </div>
    </div>
    </div>
    ${footerHtml}
  </section>

  ${boardingPassPages.join("\n")}

  <!-- Travel checklist -->
  <section class="page">
    ${headerHtml}
    <div class="page-body">
    <div class="p3-title"><div class="bar"></div><h1>TRAVEL CHECKLIST</h1><div class="bar"></div></div>

    <div class="grid-top">
      <div class="panel">
        <h3>1. CHECK-IN DOCUMENTS</h3>
        <div class="content"><ul>
          ${[
            "Passport",
            "Boarding Pass",
            "Visa Approval Letter",
            "Student COE",
            "Employment Documents",
            "Invitation Letter (If Visiting)",
            "Travel Insurance",
            "Hotel Booking/Accommodation",
            "Return Ticket (If Applicable)",
            "Financial Documents",
            "Any other supporting documents",
            "Flight E-Ticket",
            "Address in Australia",
            "Australian Custom Declaration",
          ]
            .map(checkItem)
            .join("")}
        </ul></div>
      </div>
      <div class="panel">
        <h3>2. CABIN BAGGAGE</h3>
        <div class="content"><ul>
          ${[
            "Passport",
            "Wallet",
            "Mobile Phone",
            "Laptop/Tablet",
            "Chargers & Power Bank",
            "Medication & Prescription",
            "Glasses/Contact Lenses",
            "Important Documents",
            "Pen",
            "Valuables",
          ]
            .map(checkItem)
            .join("")}
        </ul></div>
      </div>
      <div class="panel">
        <h3>3. CHECKED BAGGAGE</h3>
        <div class="content"><ul>
          ${[
            "Clothing",
            "Toiletries (Within Limit)",
            "Gifts (Declare if required)",
            "Electronic packed safely",
            "Remove old baggage tags",
            "Attach name tag",
            "Lock your luggage",
            "Liquids sealed properly",
            "Batteries removed if required",
            "Weight within allowance",
            "Fragile items declared",
          ]
            .map(checkItem)
            .join("")}
        </ul></div>
      </div>
    </div>

    <div class="grid-mid">
      <div class="panel danger">
        <h3>4. DANGEROUS GOODS<small>(FOR YOUR SAFETY, CERTAIN ITEMS ARE NOT ALLOWED.)</small></h3>
        <div class="content">
          <div class="col">
            <h4>NOT ALLOWED IN CHECKED BAGGAGE</h4>
            <ul>
              ${[
                "Power Banks",
                "Spare Lithium Batteries",
                "E-Cigarettes/Vapes",
                "Loose Batteries",
                "Smart bags without removable batteries",
              ]
                .map((t) => `<li><span class="x">✕</span>${esc(t)}</li>`)
                .join("")}
            </ul>
          </div>
          <div class="col">
            <h4>NOT ALLOWED AT ALL</h4>
            <ul>
              ${[
                "Fireworks",
                "Fuel/Gas Canisters",
                "Weapons",
                "Ammunition",
                "Explosives",
                "Flammable Liquids",
                "Sharp Objects",
                "Poison/Toxic Substances",
              ]
                .map((t) => `<li><span class="x">✕</span>${esc(t)}</li>`)
                .join("")}
            </ul>
          </div>
        </div>
      </div>
      <div class="panel">
        <h3>5. AUSTRALIAN BORDER FORCE &amp; BIOSECURITY<small>(PROTECT AUSTRALIA’S UNIQUE ENVIRONMENT)</small></h3>
        <div class="content">
          <p class="bio-head">ALWAYS DECLARE IF YOU ARE CARRYING</p>
          <div class="bio-grid">
            <div class="bio-item">${produceUri ? `<img src="${produceUri}" alt="" />` : ""}Food</div>
            <div class="bio-item">${meatUri ? `<img src="${meatUri}" alt="" />` : ""}Meat or dairy products</div>
            <div class="bio-item">${produceUri ? `<img src="${produceUri}" alt="" />` : ""}Fruits &amp; Vegetables</div>
            <div class="bio-item">🌱<br />Seeds, Plants or Flowers</div>
            <div class="bio-item">🪵<br />Wooden Items</div>
            <div class="bio-item">🐾<br />Animal Products</div>
            <div class="bio-item">💊<br />Medicines</div>
            <div class="bio-item">🌿<br />Herbs/Traditional Medicines</div>
            <div class="bio-item">🥾<br />Equipments with Soil</div>
            <div class="bio-item">🙏<br />Religious Offering Containing Seeds/Plants</div>
          </div>
          <div class="bio-tip"><strong>TIP:</strong> Declare even if you are unsure. Most items can be inspected and cleared.</div>
          <div class="bio-warn"><span class="warn-ico">!</span>Failure to declare prohibited or risk items may result in heavy fines, visa cancellation or prosecution</div>
        </div>
      </div>
    </div>

    <div class="grid-bot">
      <div class="panel">
        <h3>6. MONEY</h3>
        <div class="money-box">
          <div class="money-ico">$</div>
          <p>CASH OR MONETARY INSTRUMENTS OVER AUD 10,000 MUST BE DECLARED.</p>
        </div>
      </div>
      <div class="panel">
        <h3>7. ON ARRIVAL IN PERTH</h3>
        <div class="arrive-steps">
          <div class="step"><div class="bubble">🛂</div>Immigration</div>
          <div class="step"><div class="bubble">🧳</div>Baggage Claim</div>
          <div class="step"><div class="bubble">🌾</div>Biosecurity Screening</div>
          <div class="step"><div class="bubble">🛃</div>Customs</div>
          <div class="step"><div class="bubble">🚪</div>Exit to Arrival Hall</div>
        </div>
      </div>
    </div>
    </div>
    ${footerHtml}
  </section>
</body>
</html>`;
}
