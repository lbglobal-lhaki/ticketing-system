import {
  extractCargoShipment,
  type CargoAnswers,
} from "@/lib/cargo/parties";
import {
  CARGO_TERMS_INTRO,
  CARGO_TERMS_SECTIONS,
  type CargoTermsBlock,
} from "@/lib/cargo/termsContent";
import {
  headerDataUri,
  headerHtml,
  renderCargoInvoiceHtml,
  type CargoInvoiceSource,
} from "@/lib/documents/cargoInvoice";
import {
  ICON_GLOBE,
  ICON_MAIL,
  ICON_PHONE,
} from "@/lib/documents/invoiceFields";

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

function longDate(date: Date) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Perth",
  }).format(date);
}

const TERMS_PAGES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [9, 10, 11],
  [12, 13, 14],
  [15, 16, 17, 18],
  [19, 20, 21, 22],
  [23, 24, 25, 26],
  [27],
];

const TERMS_CLOSING =
  "Important: These charges are not included in the standard air cargo/freight rate unless expressly stated otherwise. L&B Global/Avelora Trade & Cargo will not be responsible for customs duties, government charges, clearing agent fees, storage fees, inspection fees, or disposal/destruction costs imposed by third parties or government authorities.";

function footerHtml() {
  return `<footer class="foot">
    <div class="rule"></div>
    <div class="contacts">
      <div class="item">
        <span class="dot">${ICON_PHONE}</span>
        <span class="phones">+61 424 919 833 | +61 451 106 077<br>+975 1756 6856 | +975 7778 1399</span>
      </div>
      <div class="item"><span class="dot">${ICON_GLOBE}</span>www.lbglobal.com.au</div>
      <div class="item"><span class="dot">${ICON_MAIL}</span>ticketing@lbglobal.com.au</div>
    </div>
  </footer>`;
}

function termsBlockHtml(block: CargoTermsBlock) {
  const heading = block.heading
    ? `<h2>${esc(block.heading)}</h2>`
    : "";
  const paras = block.paragraphs
    .map((p) => `<p>${esc(p)}</p>`)
    .join("");
  const bullets = block.bullets?.length
    ? `<ul>${block.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
    : "";
  return `${heading}${paras}${bullets}`;
}

function letterArticle(row: CargoInvoiceSource) {
  const shipment = extractCargoShipment({
    id: row.id,
    parcelNumber: row.parcelNumber,
    email: row.email,
    phone: row.phone,
    submitterName: row.submitterName,
    answers: asAnswers(row.answers),
  });
  const name =
    shipment.sender.name || row.submitterName || "Valued Customer";
  const to = shipment.sender.email || row.email || "";
  const date = longDate(row.submittedAt || row.createdAt);
  const paidLead = row.paid
    ? "Thank you for choosing L&B Global Cargo Services. We have successfully received your payment, and your cargo booking is now confirmed for our upcoming chartered flight. Your Cargo Booking Confirmation/Receipt is attached to this email."
    : "Thank you for choosing L&B Global Cargo Services. We have received your cargo booking for our upcoming chartered flight. Your Cargo Booking Confirmation/Receipt is attached to this email. If a balance is due, please follow the payment instructions on the invoice.";

  return `<article class="sheet letter">
    ${headerHtml(headerDataUri())}
    <div class="pad">
      <div class="letter-meta">
        <div>To: ${esc(to)}</div>
        <div>Name: ${esc(name)}</div>
        <div>Date: ${esc(date)}</div>
      </div>
      <p>Dear Valued Customer,</p>
      <p>${esc(paidLead)}</p>
      <p>Please review all cargo details carefully, including sender's Name and Contact Details, Receiver/Consignee Name and contact details, cargo route, flight/dispatch date, total weight, number of packages, cargo description and booking/reference number. If you notice any incorrect information, please contact us immediately so we can update the details before cargo acceptance and departure.</p>
      <h2>Important Cargo Reminders</h2>
      <ul>
        <li>Please ensure all items are properly packed, sealed, labelled, and ready for transport.</li>
        <li>The sender is responsible for providing an accurate description of all items contained in the package.</li>
        <li>Please do not include prohibited, dangerous, restricted, undeclared, or unlawful goods.</li>
        <li>Food, plant, animal, medicinal, commercial, or other restricted products may be subject to additional customs, biosecurity, permit, or import requirements.</li>
        <li>All cargo is subject to applicable aviation security screening, customs and biosecurity requirements.</li>
        <li>Additional charges may apply if the actual weight, dimensions, contents, handling requirements, customs clearance, storage, duties, taxes or other government charges differ from the information provided at the time of booking.</li>
        <li>L&amp;B Global reserves the right to refuse cargo that does not meet airline, aviation security, customs, biosecurity, or regulatory requirements.</li>
      </ul>
      <p>For cargo being sent to Australia, please ensure the receiver/consignee is available and provides any documents or information required for customs or biosecurity clearance. Please keep your Cargo Booking Reference and payment receipt for your records.</p>
      <p>For any questions regarding your cargo booking, documentation, packing, customs requirements, or collection arrangements, please contact our team before the cargo acceptance deadline.</p>
      <p>Thank you for choosing L&amp;B Global.</p>
      <p>Kind regards,<br/>L&amp;B Global<br/>Chartered Flight &amp; Cargo Team</p>
    </div>
    ${footerHtml()}
  </article>`;
}

function termsArticles() {
  return TERMS_PAGES.map((indexes, pageIndex) => {
    const intro =
      pageIndex === 0 ? `<p>${esc(CARGO_TERMS_INTRO)}</p>` : "";
    const body = indexes
      .map((i) => CARGO_TERMS_SECTIONS[i])
      .filter(Boolean)
      .map((block) => termsBlockHtml(block))
      .join("");
    const closing =
      pageIndex === TERMS_PAGES.length - 1
        ? `<p>${esc(TERMS_CLOSING)}</p>`
        : "";
    return `<article class="sheet terms">
      ${headerHtml(headerDataUri())}
      <div class="pad">
        <h1>CUSTOMER TERMS &amp; CONDITIONS</h1>
        ${intro}${body}${closing}
      </div>
      ${footerHtml()}
    </article>`;
  }).join("");
}

/** Cover letter + rates invoice page + terms — matches Cargo Booking Confirmation.pdf */
export function renderCargoConfirmationHtml(row: CargoInvoiceSource) {
  const invoiceDoc = renderCargoInvoiceHtml(row, "rates");
  return invoiceDoc
    .replace(
      /<title>[\s\S]*?<\/title>/,
      `<title>Cargo Booking Confirmation ${esc(row.parcelNumber)}</title>`,
    )
    .replace("<body>", `<body>${letterArticle(row)}`)
    .replace("</body>", `${termsArticles()}</body>`);
}
