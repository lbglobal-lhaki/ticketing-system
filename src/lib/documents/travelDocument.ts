import { readFileSync } from "fs";
import path from "path";
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
import { formatAud } from "@/lib/pricing";
import { PDF_FONT_FAMILY, pdfFontFaceCss } from "@/lib/documents/pdfFonts";
import type {
  BookingDocumentData,
  BookingDocumentPassenger,
} from "@/lib/documents/templates";
import { formatDateOfBirthDisplay, passengerTypeLabel } from "@/lib/booking/passengers";

/**
 * E-ticket / itinerary / receipt, laid out to match the approved reference
 * document ("E-Ticket, Itinerary, and Receipts For Mrs. Nima Choden.pdf").
 *
 * Structure, in reference order:
 *   1. Confirmation letter — the only sheet carrying the brand band and the
 *      contact footer.
 *   2. One sheet per ticketed traveller: passenger box, charter banner, the
 *      "not a boarding pass" card, terms + baggage, payment and fare details.
 *   3. Travel checklist.
 *
 * Chrome is laid out inline rather than in Chromium's @page margin box, because
 * the reference prints the band on sheet 1 only and `displayHeaderFooter`
 * repeats it on every sheet. `travelDocumentPdfOptions` therefore passes no
 * header/footer templates, which lets `@page { margin: 0 }` take effect and the
 * full-bleed banner reach both paper edges.
 *
 * All artwork (brand band, charter banner, checklist icons) is lifted from the
 * reference PDF by scripts/extract-header-asset.ts and
 * scripts/extract-checklist-icons.ts, so nothing is approximated with emoji and
 * nothing is cropped.
 */

/** Deep navy used for headings, panel fills and pass typography. */
const NAVY = "#1c317b";
/** Panel fill on the checklist sheet — a touch darker than the body navy. */
const PANEL_NAVY = "#140f8a";
/** Paper tint on the ticket sheets. */
const TICKET_PAPER = "#fafdff";

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

/** Title case for the stub, which prints "Economy" rather than "ECONOMY". */
function cabinTitle(cabin: string) {
  const label = cabinLabel(cabin);
  return label.charAt(0) + label.slice(1).toLowerCase();
}

function countryForAirport(code: string) {
  const c = code.toUpperCase();
  if (c === "PBH") return "Bhutan";
  if (["SYD", "MEL", "BNE", "ADL", "PER"].includes(c)) return "Australia";
  return "";
}

/** Reference date format: DD/MM/YYYY. */
function ticketDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(date);
}

/** Reference time format: 24h, e.g. 01:25. */
function ticketTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Australia/Sydney",
  }).format(date);
}

/**
 * Bar pattern for the "not a boarding pass" codes.
 *
 * Deliberately decorative — the card is explicitly not a boarding document, so
 * the code carries no scannable payload. Widths are derived from the ticket
 * number so every traveller's card differs, as in the reference.
 */
function barcodeUri(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619) >>> 0;
  }

  const bars: string[] = [];
  let x = 0;
  for (let i = 0; i < 48; i++) {
    hash = Math.imul(hash ^ (i + 0x9e3779b9), 16777619) >>> 0;
    const barWidth = 1 + ((hash >>> 3) % 4);
    const gap = 1 + ((hash >>> 11) % 3);
    bars.push(`<rect x="${x}" y="0" width="${barWidth}" height="100"/>`);
    x += barWidth + gap;
  }

  // preserveAspectRatio="none" lets CSS stretch the code to the printed size.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="100" viewBox="0 0 ${x} 100" preserveAspectRatio="none" fill="#000">` +
    `${bars.join("")}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Passenger names print on one line in the card's meta row and stub, where the
 * reference only ever had to fit "NIMA CHODEN". Longer names are stepped down
 * rather than wrapped — wrapping pushed the itinerary rows past the card edge.
 */
function nameFontPx(name: string, basePx: number, availableMm: number) {
  // ~0.7em is the average advance of upper-case Arimo/Arial at bold weight.
  const availablePx = availableMm / 0.2646;
  const fitted = availablePx / (0.7 * Math.max(1, name.length));
  return Math.round(Math.min(basePx, Math.max(6.5, fitted)) * 10) / 10;
}

/** Solid block arrow between the route endpoints. */
function routeArrow() {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 26" width="48" height="26">` +
    `<path d="M0 9h28V0l20 13-20 13v-9H0z" fill="${NAVY}"/></svg>`;
  return `<img class="ep-arrow" src="data:image/svg+xml;utf8,${encodeURIComponent(svg)}" alt="to" />`;
}

type TicketAssets = {
  banner: string;
  map: string;
  barcodeSeed: string;
  icoTerms: string;
  icoBaggage: string;
  perkDirect: string;
  perkComfort: string;
  perkAll: string;
};

/** One boarding-pass-style card: barcode rail, itinerary body, tear-off stub. */
function passCard(
  flight: BookingDocumentData["flight"],
  opts: {
    passengerName: string;
    ticketCode: string;
    issueDate: Date;
    seat: string;
    baggage: string;
    assets: TicketAssets;
  },
) {
  const { assets } = opts;
  const from = flight.origin.toUpperCase();
  const to = flight.destination.toUpperCase();
  const barcode = barcodeUri(opts.ticketCode);
  const notBoarding = "THIS IS NOT A BOARDING PASS";
  const name = opts.passengerName.toUpperCase();
  const metaNameSize = nameFontPx(name, 16, 41);
  const stubNameSize = nameFontPx(name, 15, 42);

  const perk = (icon: string, title: string, sub: string) => `
        <div class="perk">
          ${icon ? `<img src="${icon}" alt="" />` : `<span class="perk-dot"></span>`}
          <strong>${esc(title)}</strong>
          <span>${esc(sub)}</span>
        </div>`;

  return `
  <div class="pass">
    <div class="pass-rail">
      <img class="rail-code" src="${barcode}" alt="" />
      <div class="rail-note">${notBoarding}</div>
    </div>

    <div class="pass-body">
      <div class="pass-map" style="background-image:url('${assets.map}')"></div>

      <div class="pass-meta">
        <div><span>Passenger Name</span><strong style="font-size:${metaNameSize}px">${esc(name)}</strong></div>
        <div><span>Ticket No</span><strong>${esc(opts.ticketCode)}</strong></div>
        <div><span>Date of Issue</span><strong>${esc(ticketDate(opts.issueDate))}</strong></div>
      </div>

      <div class="pass-route">
        <div class="ep">
          <span>From</span>
          <b>${esc(from)}</b>
          <i>${esc(cityName(from))}</i>
          <i>${esc(countryForAirport(from))}</i>
        </div>
        <div class="ep-arrow-cell">${routeArrow()}</div>
        <div class="ep">
          <span>To</span>
          <b>${esc(to)}</b>
          <i>${esc(cityName(to))}</i>
          <i>${esc(countryForAirport(to))}</i>
        </div>
      </div>

      <div class="pass-grid">
        <div><span>Flight No</span><strong>${esc(flight.flightNumber)}</strong></div>
        <div><span>Date</span><strong>${esc(ticketDate(flight.departureAt))}</strong></div>
        <div><span>Departure</span><strong>${esc(ticketTime(flight.departureAt))}</strong><i>${esc(from)} Time</i></div>
        <div><span>Arrival</span><strong>${esc(ticketTime(flight.arrivalAt))}</strong><i>${esc(to)} Time</i></div>
        <div><span>Class</span><strong>${esc(cabinLabel(flight.cabinClass))}</strong></div>
        <div><span>Seat</span><strong>${esc(opts.seat)}</strong></div>
        <div><span>Included Baggage</span><strong>${esc(opts.baggage)}</strong></div>
      </div>

      <div class="pass-perks">
        ${perk(assets.perkDirect, "DIRECT FLIGHT", "No Transit. No Hassle")}
        ${perk(assets.perkComfort, "COMFORTABLE JOURNEY", "Safe. Reliable. On Time")}
        ${perk(assets.perkAll, "FOR ALL", "Students. Families. Travellers")}
      </div>
    </div>

    <div class="pass-stub">
      <span class="stub-label">Passenger Name</span>
      <strong class="stub-name" style="font-size:${stubNameSize}px">${esc(name)}</strong>

      <div class="stub-route">
        <div class="ep">
          <span>From</span>
          <b>${esc(from)}</b>
          <i>${esc(cityName(from))}</i>
          <i>${esc(countryForAirport(from))}</i>
        </div>
        <div class="ep-arrow-cell">${routeArrow()}</div>
        <div class="ep">
          <span>To</span>
          <b>${esc(to)}</b>
          <i>${esc(cityName(to))}</i>
          <i>${esc(countryForAirport(to))}</i>
        </div>
      </div>

      <div class="stub-rows">
        <span>Ticket No:</span><b>${esc(opts.ticketCode)}</b>
        <span>Flight No:</span><b>${esc(flight.flightNumber)}</b>
        <span>Date:</span><b>${esc(ticketDate(flight.departureAt))}</b>
        <span>Seat:</span><b>${esc(opts.seat)}</b>
        <span>Class</span><b>${esc(cabinTitle(flight.cabinClass))}</b>
      </div>

      <div class="stub-code">
        <img src="${barcode}" alt="" />
        <div>${notBoarding}</div>
      </div>
    </div>
  </div>`;
}

/** Checklist tile: light square + label, as printed on the reference. */
function checkItem(label: string) {
  return `<li><span class="cb"></span><span>${esc(label)}</span></li>`;
}

function crossItem(label: string) {
  return `<li><span class="x">✕</span><span>${esc(label)}</span></li>`;
}

export function renderTravelDocumentHtml(data: BookingDocumentData) {
  const brand = getBrand();
  const invoice = data.invoice;
  const seat = invoice?.seatLabel?.trim() || "–";
  const fareName = data.fareProductName || data.fareReleaseName || "";
  const includedBaggage =
    defaultBaggageLabel(data.flight.cabinClass, fareName).split("(")[0]?.trim() ||
    "1 PIECE";
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
  const fop = paymentMethodLabel(data.paymentMethod);
  const receiptNo = invoice?.invoiceNumber?.trim() || data.bookingRef;
  const endorsement =
    invoice?.endorsementText?.trim() ||
    "NON-TRANSFERABLE / SUBJECT TO FARE RULES";

  const travellers: BookingDocumentPassenger[] =
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
            passengerType: "adult",
            priceCents: 0,
            allocatesSeat: true,
          },
        ];

  /*
   * Per-traveller fare, derived the same way the airfare invoice derives its
   * line items, so the two documents can never disagree.
   *
   * The stored per-passenger price cannot be trusted on its own: online
   * bookings (confirmBooking.ts) and booking edits both write 0 for every
   * adult and price only children/infants, so reading it directly printed the
   * whole booking's airfare on every adult's sheet. Children and infants keep
   * their own stored amount; the adults split whatever airfare is left, with
   * the last adult absorbing any rounding drift.
   */
  const airfareTotalCents = lines.airfareCents || totals.linesCents;
  const adultTravellers = travellers.filter(
    (pax) => (pax.passengerType || "adult") === "adult",
  );
  const pricedCompanionCents = travellers
    .filter((pax) => pax.passengerType === "child" || pax.passengerType === "infant")
    .reduce((sum, pax) => sum + Math.max(0, pax.priceCents ?? 0), 0);
  const adultTotalCents = Math.max(0, airfareTotalCents - pricedCompanionCents);
  const adultUnitCents =
    adultTravellers.length > 0
      ? Math.round(adultTotalCents / adultTravellers.length)
      : 0;

  const fareByTraveller = new Map<BookingDocumentPassenger, number>();
  let adultAssigned = 0;
  let adultSeen = 0;
  for (const pax of travellers) {
    if ((pax.passengerType || "adult") !== "adult") {
      fareByTraveller.set(pax, Math.max(0, pax.priceCents ?? 0));
      continue;
    }
    const isLastAdult = adultSeen === adultTravellers.length - 1;
    const cents = isLastAdult
      ? Math.max(0, adultTotalCents - adultAssigned)
      : adultUnitCents;
    adultAssigned += cents;
    adultSeen += 1;
    fareByTraveller.set(pax, cents);
  }

  const assets: TicketAssets = {
    banner:
      assetDataUri("charter-banner-wide.png") ||
      assetDataUri("p2-banner.png") ||
      assetDataUri("charter-banner.png"),
    map: assetDataUri("world-map-dots.png") || assetDataUri("world-map.png"),
    barcodeSeed: data.bookingRef,
    icoTerms: assetDataUri("ico-terms.png"),
    icoBaggage: assetDataUri("ico-baggage.png"),
    perkDirect: assetDataUri("perk-direct.png"),
    perkComfort: assetDataUri("perk-comfort.png"),
    perkAll: assetDataUri("perk-all.png"),
  };
  const bandUri =
    assetDataUri("header-full.png") ||
    assetDataUri("header-wide.png") ||
    assetDataUri("header-page1.png");

  const routeLabel = `${cityName(data.flight.origin)} to ${cityName(data.flight.destination)}`;

  /* ---------------------------------------------------------------- sheet 1 */

  const letterSheet = `
  <section class="sheet letter">
    ${
      bandUri
        ? `<img class="band" src="${bandUri}" alt="${esc(brand.issuingAgent)} · ${esc(brand.issuingAirline)}" />`
        : `<div class="band band-fallback"></div>`
    }
    <div class="letter-body">
      <p class="to-line">To:<br /><strong>${esc(data.passengerName)}</strong><br /><strong>Date: ${esc(ticketDate(data.createdAt))}</strong></p>

      <p>Dear Valued Customer,</p>
      <p>Thank you for choosing ${esc(brand.issuingAgent)}.</p>
      <p>${
        unpaid
          ? "Your booking has been reserved and is awaiting payment confirmation."
          : "We have successfully received your payment, and your booking is now confirmed."
      }</p>
      <p>Your e-ticket is attached to this email.</p>
      <p class="tight">
        Please review all the details on your ticket carefully, including:<br />
        Passenger Name, Flight Route, Travel Date, and Booking Reference<br />
        If you notice any errors, please get in touch with us immediately before your travel date.
      </p>

      <p class="lead"><strong>Travel Reminders</strong></p>
      <ul>
        <li>Arrive at the airport at least ${esc(String(brand.arriveHoursBefore))} hours before departure.</li>
        <li>Carry a valid passport and any required travel documents.</li>
        <li>Ensure your baggage complies with the airline&#39;s baggage allowance.</li>
        <li>Please comply with all immigration, customs, and biosecurity requirements.</li>
      </ul>

      <p class="tight"><strong>If you require:</strong><br />
      Extra baggage, Cargo services, Special meals, Wheelchair assistance, Travel insurance, Flight changes (subject to fare conditions)<br />
      <strong>Please contact our team before your departure</strong></p>

      <p class="tight">We sincerely appreciate your trust in ${esc(brand.issuingAgent)} and look forward to welcoming you onboard our ${esc(routeLabel)} Direct Chartered Flight.</p>
      <p>We wish you a safe and pleasant journey.</p>
      <p>Kind regards,</p>
      <p class="tight">${esc(brand.issuingAgent)}<br />${esc(brand.reservationsTeam)}</p>
    </div>

    <div class="foot">
      <div class="foot-rule"></div>
      <div class="foot-items">
        <div class="foot-item"><span class="dot">${ICON_PHONE}</span>${esc(brand.agentPhonePrimary)} | ${esc(brand.agentPhoneSecondary)}</div>
        <div class="foot-item"><span class="dot">${ICON_GLOBE}</span>${esc(brand.agentWebsite)}</div>
        <div class="foot-item"><span class="dot">${ICON_MAIL}</span>${esc(brand.agentEmail)}</div>
      </div>
    </div>
  </section>`;

  /* ------------------------------------------------------- ticket sheets */

  const flights = [data.flight, ...(data.returnFlight ? [data.returnFlight] : [])];

  const ticketSheet = (
    pax: BookingDocumentPassenger,
    flight: BookingDocumentData["flight"],
  ) => {
    const type = pax.passengerType || "adult";
    const noSeat = type === "infant" || pax.allocatesSeat === false;
    const ticketCode = displayTicketCode(pax.ticketNumber);
    const fareCents = fareByTraveller.get(pax) ?? 0;

    return `
  <section class="sheet ticket">
    <div class="tk-head">
      <h1>E-TICKET, ITINERARY, RECEIPTS AND TAX INVOICE</h1>
      <h2>Passenger Information</h2>
      <div class="tk-ref"><strong>Booking Reference:</strong><span>${esc(data.bookingRef)}</span></div>
      <div class="pax-box">
        <span>Ticket Number:</span><b>${esc(ticketCode)}</b>
        <span>Passenger Name:</span><b>${esc(pax.fullName)}</b>
        <span>Issue Date:</span><b>${esc(ticketDate(data.createdAt))}</b>
        <span>Issuing Airline:</span><b>${esc(brand.issuingAirline)}</b>
        <span>Issuing Agent:</span><b>${esc(brand.issuingAgent)}</b>
        ${
          type !== "adult"
            ? `<span>Passenger Type:</span><b>${
                noSeat
                  ? "Infant (no seat) — travels with an adult"
                  : esc(passengerTypeLabel(type))
              }</b>${
                pax.dateOfBirth
                  ? `<span>Date of Birth:</span><b>${esc(formatDateOfBirthDisplay(pax.dateOfBirth))}</b>`
                  : ""
              }`
            : ""
        }
      </div>
    </div>

    ${
      assets.banner
        ? `<img class="tk-banner" src="${assets.banner}" alt="Chartered Flight ${esc(cityName(data.flight.origin))} ⇄ ${esc(cityName(data.flight.destination))}" />`
        : `<div class="tk-banner tk-banner-fallback">
            <div><strong>CHARTERED FLIGHT</strong><em>${esc(cityName(data.flight.origin).toUpperCase())} ⇄ ${esc(cityName(data.flight.destination).toUpperCase())}</em><span>(${esc(brand.charterTagline)})</span></div>
            <div class="end">CHARTERED FLIGHT</div>
          </div>`
    }

    ${passCard(flight, {
      passengerName: pax.fullName,
      ticketCode,
      issueDate: data.createdAt,
      seat: noSeat ? "–" : seat,
      baggage: noSeat ? "–" : includedBaggage,
      assets,
    })}

    <div class="tk-lower">
      <div class="tk-cols">
        <div>
          <h3>${assets.icoTerms ? `<img src="${assets.icoTerms}" alt="" />` : ""}TERMS &amp; CONDITIONS</h3>
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
          <h3>${assets.icoBaggage ? `<img src="${assets.icoBaggage}" alt="" />` : ""}BAGGAGE ALLOWANCE</h3>
          <div class="bag-cards">
            <div class="bag-card">
              <div class="cls">ECONOMY CLASS</div>
              <div class="sub">Check-In Baggage</div>
              <div class="kg">23 KG</div>
              <div class="sub">1 &times; 23kg</div>
            </div>
            <div class="bag-card">
              <div class="cls">BUSINESS CLASS</div>
              <div class="sub">Check-In Baggage</div>
              <div class="kg">40 KG</div>
              <div class="sub">1 &times; 40kg</div>
            </div>
          </div>
        </div>
      </div>

      <h2 class="pay-title">PAYMENT AND FARE DETAILS</h2>
      <div class="pay-lines">
        <div>Form of Payment: ${esc(fop)}</div>
        <div>Receipt No: ${esc(receiptNo)}</div>
        <div>Fare: AUD ${esc(formatAud(fareCents))}</div>
        <div>Endorsement / Restrictions: ${esc(endorsement)}</div>
        <div>Total/Transaction Currency: AUD ${esc(formatAud(totals.amountCents))}</div>
        <div>Total Fare and Other Charges: AUD ${esc(formatAud(totals.amountCents))}</div>
        ${
          unpaid
            ? `<div class="pay-warn">Awaiting payment confirmation — this sheet is a reservation summary until your transfer is verified.</div>`
            : ""
        }
      </div>
    </div>
  </section>`;
  };

  const ticketSheets = travellers.flatMap((pax) =>
    flights.map((flight) => ticketSheet(pax, flight)),
  );

  /* ------------------------------------------------------ checklist sheet */

  const bio = (asset: string, label: string) =>
    `<div class="bio-item">${
      assetDataUri(asset) ? `<img src="${assetDataUri(asset)}" alt="" />` : ""
    }<span>${label}</span></div>`;

  const step = (asset: string, label: string) =>
    `<div class="step">${
      assetDataUri(asset) ? `<img src="${assetDataUri(asset)}" alt="" />` : ""
    }<span>${label}</span></div>`;

  const warnIcon = assetDataUri("warn-triangle.png");
  const inspectorIcon = assetDataUri("bio-inspector.png");
  const cashIcon = assetDataUri("money-cash.png");

  const checklistSheet = `
  <section class="sheet checklist">
    <div class="cl-title"><span class="blk"></span><h1>TRAVEL CHECKLIST</h1><span class="blk"></span></div>

    <div class="cl-row cl-row-1">
      <div class="panel">
        <h3><em>1.</em>CHECK-IN DOCUMENTS</h3>
        <div class="content"><ul>${[
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
          .join("")}</ul></div>
      </div>
      <div class="panel">
        <h3><em>2.</em>CABIN BAGGAGE</h3>
        <div class="content"><ul>${[
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
          .join("")}</ul></div>
      </div>
      <div class="panel">
        <h3><em>3.</em>CHECKED BAGGAGE</h3>
        <div class="content"><ul>${[
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
          .join("")}</ul></div>
      </div>
    </div>

    <div class="cl-row cl-row-2">
      <div class="panel danger">
        <h3><em>4.</em>DANGEROUS GOODS<small>(FOR YOUR SAFETY, CERTAIN ITEMS ARE NOT ALLOWED.)</small></h3>
        <div class="content">
          <h4>NOT ALLOWED IN&nbsp; CHECKED BAGGAGE</h4>
          <ul>${[
            "Power Banks",
            "Spare Lithium Batteries",
            "E-Cigarettes/Vapes",
            "Loose Batteries",
            "Smart bags without removable batteries",
          ]
            .map(crossItem)
            .join("")}</ul>
          <h4>NOT ALLOWED AT ALL</h4>
          <ul>${[
            "Fireworks",
            "Fuel/Gas Canisters",
            "Weapons",
            "Ammunition",
            "Explosives",
            "Flammable Liquids",
            "Sharp Objects",
            "Poison/Toxic Substances",
          ]
            .map(crossItem)
            .join("")}</ul>
        </div>
      </div>

      <div class="panel bio">
        <h3><em>5.</em>AUSTRALIAN BORDER FORCE &amp; BIOSECURITY<small>(PROTECT AUSTRALIA&rsquo;S UNIQUE ENVIRONMENT)</small></h3>
        <div class="content">
          <p class="bio-head">ALWAYS DECLARE IF YOU ARE CARRYING</p>
          <div class="bio-split">
            <div class="bio-box">
              ${bio("bio-food.png", "Food")}
              ${bio("bio-meat.png", "Meat or dairy<br />products")}
              ${bio("bio-fruit.png", "Fruits &amp;<br />Vegetables")}
              ${bio("bio-seeds.png", "Seeds, Plants or<br />Flowers")}
              ${bio("bio-wood.png", "Wooden<br />Items")}
              ${bio("bio-animal.png", "Animal<br />Products")}
              ${bio("bio-medicine.png", "Medicines")}
              ${bio("bio-herbs.png", "Herbs/<br />Traditional<br />Medicines")}
              ${bio("bio-soil.png", "Equipments<br />with Soil")}
              ${bio("bio-religious.png", "Religious<br />Offering<br />Containing<br />Seeds/Plants")}
            </div>
            <div class="bio-tip">
              <strong>TIP:</strong>
              <p>Declare even if you are unsure. Most items can be inspected and cleared</p>
              ${inspectorIcon ? `<img src="${inspectorIcon}" alt="" />` : ""}
            </div>
          </div>
          <div class="bio-warn">
            ${warnIcon ? `<img src="${warnIcon}" alt="" />` : `<span class="warn-ico">!</span>`}
            <p>Failure to declare prohibited or risk items may result in heavy fines, visa cancellation or prosecution</p>
          </div>
        </div>
      </div>
    </div>

    <div class="cl-row cl-row-3">
      <div class="panel">
        <h3><em>6.</em>MONEY</h3>
        <div class="content money-box">
          ${cashIcon ? `<img src="${cashIcon}" alt="" />` : ""}
          <p>CASH OR MONETARY INSTRUMENTS OVER AUD 10,000 MUST BE DECLARED.</p>
        </div>
      </div>
      <div class="panel">
        <h3><em>7.</em>ON ARRIVAL IN ${esc(cityName(data.flight.destination).toUpperCase())}</h3>
        <div class="content arrive">
          ${step("arrive-immigration.png", "Immigration")}
          ${step("arrive-baggage.png", "Baggage Claim")}
          ${step("arrive-biosecurity.png", "Biosecurity<br />Screening")}
          ${step("arrive-customs.png", "Customs")}
          ${step("arrive-exit.png", "Exit to<br />Arrival Hall")}
        </div>
      </div>
    </div>
  </section>`;

  /* ------------------------------------------------------------- styles */

  const styles = `
    ${pdfFontFaceCss()}
    /*
     * @page margin is 0 and no header/footer template is passed to Chromium, so
     * every millimetre of the sheet is addressable and the charter banner can
     * bleed to both paper edges. Sheets are min-height (never fixed height) so
     * an unusually long name or fare line pushes onto a second sheet instead of
     * being clipped.
     */
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #111;
      font-family: ${PDF_FONT_FAMILY};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      position: relative;
      width: 210mm;
      min-height: 296mm;
      background: #fff;
      overflow: hidden;
    }
    .sheet + .sheet { break-before: page; page-break-before: always; }
    @media screen {
      body { background: #eef1f5; padding: 12px 0; }
      .sheet { margin: 0 auto 14px; box-shadow: 0 4px 24px rgba(0,0,0,.12); }
    }

    /* ------------------------------------------------------- sheet 1 */
    .sheet.letter { display: flex; flex-direction: column; }
    .band { display: block; width: 100%; height: auto; }
    .band-fallback { height: 40.7mm; background: ${NAVY}; }
    .letter-body {
      flex: 1;
      padding: 8.7mm 12mm 0 21.5mm;
      font-size: 15px;
      line-height: 1.3;
      color: #333;
    }
    .letter-body p { margin: 0 0 12px; }
    .letter-body p.tight { margin-bottom: 12px; }
    .letter-body p.lead { margin-bottom: 2px; }
    .letter-body strong { color: #111; }
    .letter-body ul { margin: 0 0 12px; padding-left: 22px; }
    .letter-body li { margin: 0; }
    .to-line { line-height: 1.6; margin-bottom: 20px !important; }

    .foot { padding-bottom: 18.4mm; }
    .foot-rule { height: 4px; background: #f5c518; margin: 0 21.4mm 0 23.1mm; }
    .foot-items {
      display: grid;
      grid-template-columns: 68.8mm 55.2mm auto;
      padding: 7.6mm 0 0 22.05mm;
      font-size: 12px;
      color: #333;
    }
    .foot-item { display: flex; align-items: center; gap: 3.1mm; }
    .foot-item .dot {
      width: 6.3mm; height: 6.3mm; border-radius: 50%;
      background: #f5c518; color: #fff; flex-shrink: 0;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .foot-item .dot svg { display: block; width: 3.4mm; height: 3.4mm; }

    /* --------------------------------------------------- ticket sheets */
    .sheet.ticket { background: ${TICKET_PAPER}; }
    .tk-head { position: relative; padding: 12mm 10mm 0; }
    .tk-head h1 {
      margin: 0;
      font-size: 22px;
      line-height: 1.15;
      letter-spacing: -0.2px;
      color: #111;
    }
    .tk-head h2 { margin: 4.4mm 0 0; font-size: 16px; line-height: 1.2; color: #111; }
    /*
     * Taken out of flow: booking references are far longer than the reference
     * document's "LB890X", and letting a wrapped reference grow this row pushed
     * the passenger box — and with it the banner and card — down the sheet.
     */
    .tk-ref {
      position: absolute; top: 22.6mm; left: 156mm; width: 46mm;
      font-size: 14px; line-height: 1.45;
    }
    .tk-ref strong { display: block; color: #111; }
    .tk-ref span { color: #333; word-break: break-word; }
    .pax-box {
      display: grid;
      grid-template-columns: 40mm auto;
      width: 130.8mm;
      margin-top: 3.8mm;
      border: 1px solid #1a1a1a;
      border-radius: 11px;
      padding: 18px 11px 24px;
      font-size: 15px;
      line-height: 23px;
    }
    .pax-box span { font-weight: 700; color: #111; }
    .pax-box b { font-weight: 400; color: #111; }

    .tk-banner { display: block; width: 100%; height: auto; margin-top: 4.3mm; }
    .tk-banner-fallback {
      display: flex; align-items: stretch; height: 24mm; margin-top: 4.3mm;
      background: linear-gradient(90deg, ${NAVY} 0%, #4a63a8 60%, ${NAVY} 100%);
      color: #fff;
    }
    .tk-banner-fallback > div:first-child {
      flex: 1; display: flex; flex-direction: column; justify-content: center;
      gap: 2px; padding: 0 10mm;
    }
    .tk-banner-fallback strong { font-size: 17px; letter-spacing: .04em; }
    .tk-banner-fallback em { font-size: 17px; font-style: normal; font-weight: 700; }
    .tk-banner-fallback span { font-size: 10px; border: 1px solid #fff; padding: 2px 6px; width: fit-content; }
    .tk-banner-fallback .end {
      width: 54mm; background: #101c48; display: flex; align-items: center;
      justify-content: center; font-size: 17px; font-weight: 800; letter-spacing: .03em;
    }

    /* -------------------------------------------------------- the card */
    .pass {
      display: grid;
      grid-template-columns: 13.1mm 130.6mm auto;
      height: 49.1mm;
      padding: 0 8.5mm 0 7.9mm;
    }
    /*
     * The rail code prints on its side. Rotating in flow would reserve the
     * un-rotated 32.6mm width and shove the itinerary body off the sheet, so
     * both rail children are taken out of flow and placed against the column.
     */
    .pass-rail { position: relative; }
    .rail-code {
      position: absolute; top: 4.5mm; left: 0;
      width: 32.6mm; height: 8.9mm;
      transform-origin: 0 0;
      transform: translateX(8.9mm) rotate(90deg);
    }
    .rail-note {
      position: absolute; top: 4.5mm; left: 9.7mm; height: 32.6mm;
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      font-size: 5.5px;
      font-weight: 700;
      letter-spacing: .04em;
      color: #111;
      text-align: center;
    }

    .pass-body { position: relative; width: 128mm; padding: 3mm 0 0 4mm; }
    .pass-map {
      position: absolute; inset: 0; z-index: 0;
      background-repeat: no-repeat;
      background-size: 100% 100%;
      opacity: .42;
    }
    .pass-body > *:not(.pass-map) { position: relative; z-index: 1; }

    .pass-meta {
      display: grid;
      grid-template-columns: 43mm 43.3mm auto;
      padding-left: 0.8mm;
    }
    .pass-meta span { display: block; font-size: 9.5px; color: #333; line-height: 1.1; }
    .pass-meta strong {
      display: block; font-size: 16px; color: ${NAVY};
      letter-spacing: .3px; line-height: 1.05; white-space: nowrap;
    }

    .pass-route, .stub-route {
      display: grid;
      align-items: start;
    }
    .pass-route { grid-template-columns: 16.3mm 11.2mm auto; padding-left: 3.9mm; margin-top: 1.5mm; }
    .pass-route .ep span { display: block; font-size: 11.5px; color: #333; line-height: 1.1; }
    .pass-route .ep b { display: block; font-size: 25px; color: #111; line-height: 1.05; }
    .pass-route .ep i { display: block; font-style: normal; font-size: 11.5px; color: #333; line-height: 1.18; }
    .ep-arrow-cell { display: flex; align-items: center; height: 10.3mm; }
    .ep-arrow { width: 8.4mm; height: auto; }

    .pass-grid {
      display: grid;
      grid-template-columns: 15.2mm 23.2mm 20.1mm 20.3mm 19.9mm 10.7mm auto;
      margin-top: 1.5mm;
    }
    .pass-grid span { display: block; font-size: 8px; color: #333; line-height: 1.1; white-space: nowrap; }
    .pass-grid strong { display: block; font-size: 12px; color: ${NAVY}; line-height: 1.15; white-space: nowrap; }
    .pass-grid i { display: block; font-style: normal; font-size: 8px; color: #333; line-height: 1.1; white-space: nowrap; }

    .pass-perks {
      position: absolute; left: 0; right: 0; bottom: 0; height: 10mm;
      display: grid; grid-template-columns: repeat(3, 1fr);
      align-items: center;
      background: #c6cddf;
      z-index: 1;
    }
    .perk { text-align: center; line-height: 1.2; }
    .perk img { display: block; height: 3.1mm; width: auto; margin: 0 auto 0.6mm; }
    .perk .perk-dot { display: block; width: 2.6mm; height: 2.6mm; border-radius: 50%; background: #111; margin: 0 auto 0.6mm; }
    .perk strong { display: block; font-size: 9px; color: ${NAVY}; }
    .perk span { display: block; font-size: 7.5px; color: #333; }

    .pass-stub { border-left: 2px dashed #4a5a86; padding: 1.2mm 0 0 7.9mm; }
    .stub-label { display: block; font-size: 9.5px; color: #333; line-height: 1.15; }
    .stub-name { display: block; font-size: 15px; color: ${NAVY}; letter-spacing: .3px; line-height: 1.1; white-space: nowrap; }
    .stub-route { grid-template-columns: 16.8mm 11.4mm auto; margin-top: 1.2mm; }
    .stub-route .ep span { display: block; font-size: 11px; color: #333; line-height: 1.1; }
    .stub-route .ep b { display: block; font-size: 22px; color: #111; line-height: 1.05; }
    .stub-route .ep i { display: block; font-style: normal; font-size: 11px; color: #333; line-height: 1.18; }
    .stub-route .ep-arrow-cell { height: 9.3mm; }
    .stub-rows {
      display: grid;
      grid-template-columns: 11.5mm auto;
      margin-top: 1.8mm;
      font-size: 9px;
      line-height: 2.35mm;
    }
    .stub-rows span { color: ${NAVY}; }
    .stub-rows b { font-weight: 400; color: #111; }
    .stub-code { margin-top: 2.4mm; width: 34.5mm; }
    .stub-code img { display: block; width: 100%; height: 9mm; }
    .stub-code div {
      font-size: 6.5px; font-weight: 700; color: ${NAVY};
      text-align: center; letter-spacing: .02em; margin-top: -0.6mm;
    }

    /* ------------------------------------------- terms / baggage / fares */
    .tk-lower { padding: 7.5mm 6.5mm 0; }
    .tk-cols { display: grid; grid-template-columns: 122mm auto; }
    .tk-lower h3 {
      display: flex; align-items: center; gap: 2.6mm;
      margin: 0 0 4.5mm;
      font-size: 15px; color: ${NAVY}; letter-spacing: .2px;
    }
    .tk-lower h3 img { height: 4.2mm; width: auto; }
    .terms { margin: 0; padding-left: 14px; font-size: 14px; line-height: 17.9px; color: #1a1a1a; }
    .terms li { margin-bottom: 0; padding-left: 4px; }
    .bag-cards { display: grid; grid-template-columns: 37mm 37mm; gap: 1.9mm; }
    .bag-card {
      border: 1px solid #1a1a1a; border-radius: 8px;
      height: 38.3mm; padding: 3mm 2mm;
      display: flex; flex-direction: column; align-items: center;
      text-align: center;
    }
    .bag-card .cls { font-size: 11px; font-weight: 700; color: ${NAVY}; letter-spacing: .2px; }
    .bag-card .sub { font-size: 13px; color: #111; }
    .bag-card .sub:last-child { font-size: 11px; margin-top: auto; }
    .bag-card .kg { font-size: 28px; color: #111; line-height: 1.1; margin: 4mm 0 0; }
    .bag-card .cls + .sub { margin-top: 3.4mm; }

    .pay-title { margin: 11mm 0 0; font-size: 22px; color: #111; letter-spacing: -0.2px; }
    .pay-lines { margin-top: 4.4mm; font-size: 14px; line-height: 17.9px; color: #1a1a1a; }
    .pay-warn { margin-top: 3mm; color: #8a4b00; font-weight: 700; }

    /* ------------------------------------------------- checklist sheet */
    .sheet.checklist { padding: 4.6mm 6.6mm 0 5.9mm; }
    .cl-title { display: grid; grid-template-columns: 53.6mm auto 53.1mm; align-items: center; margin: 0 -6.6mm 6.9mm -5.9mm; }
    .cl-title .blk { height: 15.7mm; background: ${PANEL_NAVY}; }
    .cl-title h1 { margin: 0; text-align: center; font-size: 34px; color: #111; letter-spacing: .3px; }

    /*
     * Row heights are pinned rather than left to the content, so the three
     * bands land on the same baselines as the reference sheet and the panels
     * fill the page instead of stacking up short.
     */
    .cl-row { display: grid; gap: 1.9mm; }
    .cl-row-1 { grid-template-columns: repeat(3, 1fr); min-height: 97.7mm; margin-bottom: 5.1mm; }
    .cl-row-2 { grid-template-columns: 73.5mm auto; min-height: 101mm; margin-bottom: 2.9mm; }
    .cl-row-3 { grid-template-columns: 73.5mm auto; min-height: 52.9mm; }

    .panel { border: 1.5px solid ${PANEL_NAVY}; display: flex; flex-direction: column; }
    .panel h3 {
      margin: 0; background: ${PANEL_NAVY}; color: #fff;
      font-size: 16px; letter-spacing: .1px; padding: 4.2mm 4mm;
    }
    .panel h3 em { font-style: normal; }
    .panel h3 small { display: block; font-size: 8px; font-weight: 700; margin-top: 1mm; white-space: nowrap; }
    .panel .content { flex: 1; padding: 3.4mm 3.6mm; font-size: 11px; }
    .panel ul { list-style: none; margin: 0; padding: 0; }
    .panel li { display: flex; gap: 2.4mm; align-items: flex-start; line-height: 5.3mm; }
    .cb {
      width: 2.8mm; height: 2.8mm; background: #dde3ee; border-radius: 0.4mm;
      margin-top: 1.2mm; flex-shrink: 0;
    }

    .danger .content { padding-top: 2.4mm; }
    .danger h4 {
      margin: 0 0 1mm; text-align: center; color: #e0362c;
      font-size: 11px; letter-spacing: .2px;
    }
    .danger ul + h4 { margin-top: 2mm; }
    .danger li { font-size: 11px; font-weight: 700; color: #111; line-height: 5mm; gap: 1.8mm; }
    .x {
      width: 3.1mm; height: 3.1mm; border-radius: 50%; background: #e0362c; color: #fff;
      font-size: 7px; font-weight: 800; margin-top: 0.9mm; flex-shrink: 0;
      display: inline-flex; align-items: center; justify-content: center;
    }

    .bio-head { margin: 0 0 2.2mm; text-align: center; color: #0a9d3f; font-size: 11px; font-weight: 700; }
    .bio-split { display: grid; grid-template-columns: auto 24mm; gap: 3mm; }
    .bio-box {
      display: grid; grid-template-columns: repeat(5, 1fr); gap: 1mm;
      border: 1px solid #333; border-radius: 3mm; padding: 3mm 2mm;
    }
    .bio-item { text-align: center; font-size: 8px; line-height: 1.25; color: #111; }
    .bio-item img { display: block; height: 9mm; width: auto; max-width: 100%; margin: 0 auto 1mm; }
    .bio-tip { text-align: center; color: #111; }
    .bio-tip strong { display: block; font-size: 10px; color: #0a9d3f; }
    .bio-tip p { margin: 0.6mm 0 0; font-size: 10px; font-weight: 700; line-height: 1.3; }
    .bio-tip img { display: block; height: 14mm; width: auto; margin: 2mm auto 0; }
    .bio-warn { display: flex; align-items: center; gap: 3mm; margin-top: 3.4mm; }
    .bio-warn img { height: 10mm; width: auto; flex-shrink: 0; }
    .bio-warn p { margin: 0; font-size: 13px; line-height: 1.35; color: #111; }
    .warn-ico {
      width: 8mm; height: 8mm; background: #e0362c; color: #fff; border-radius: 1mm;
      font-size: 14px; font-weight: 800; flex-shrink: 0;
      display: inline-flex; align-items: center; justify-content: center;
    }

    .money-box {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      text-align: center; gap: 2mm;
    }
    .money-box img { height: 14mm; width: auto; }
    .money-box p { margin: 0; font-size: 13px; font-weight: 700; line-height: 1.4; color: #111; }

    .arrive { display: grid; grid-template-columns: repeat(5, 1fr); align-items: end; gap: 1mm; }
    .step { text-align: center; font-size: 10px; line-height: 1.25; color: #111; }
    .step img { display: block; height: 13mm; width: auto; margin: 0 auto 1.4mm; }

    @media print {
      body { background: #fff; padding: 0; }
      .sheet { box-shadow: none; margin: 0; }
      /* Keep every card and panel whole; overflow moves to the next sheet. */
      .pass, .panel, .bag-card, .tk-cols, .cl-row, .pax-box, .bio-box {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      h1, h2, h3 { break-after: avoid; page-break-after: avoid; }
    }
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>E-Ticket ${esc(data.bookingRef)}</title>
  <style>${styles}</style>
</head>
<body>
${letterSheet}
${ticketSheets.join("\n")}
${checklistSheet}
</body>
</html>`;
}
