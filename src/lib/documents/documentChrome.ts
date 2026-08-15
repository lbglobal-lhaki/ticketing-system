import { existsSync, readFileSync } from "fs";
import path from "path";
import { getBrand } from "@/lib/branding";
import { ICON_GLOBE, ICON_MAIL, ICON_PHONE } from "@/lib/documents/invoiceFields";

/**
 * Shared page chrome for the airfare invoice and travel document.
 *
 * Header and footer are painted by Chromium into the @page margin box via
 * Puppeteer's `displayHeaderFooter`. That box is reserved on *every* sheet and
 * sits outside the content area, so flowing content can never overlap it and
 * documents no longer need hand-rolled "how many rows fit" pagination.
 *
 * The same markup is also emitted inline for on-screen previews (the admin
 * modal serves raw HTML, not a PDF) and hidden again under `@media print`.
 */

/**
 * Chromium insets header/footer templates by a fixed ~5.29mm from the page
 * edge. Measured with scripts/probe-margin-box.ts; the header artwork is pulled
 * back up through it with a negative margin so the brand band bleeds to the
 * very top edge, as the artwork is designed to.
 */
const CHROME_INSET_MM = 5.29;
/** A4 portrait width. */
const PAGE_WIDTH_MM = 210;
/** Clear space between the header band and the first line of content. */
const HEADER_CONTENT_GAP_MM = 5;

/** Horizontal breathing room for flowing content (the chrome itself is full-bleed). */
export const CONTENT_SIDE_PADDING_MM = 12;

function chromeAssetPath(filename: string) {
  const candidates = [
    path.join(process.cwd(), "public", "documents", "invoice-assets", filename),
    path.join(process.cwd(), "public", "documents", "eticket-assets", filename),
  ];
  return candidates.find((filePath) => existsSync(filePath)) ?? null;
}

function chromeAssetDataUri(filename: string) {
  const filePath = chromeAssetPath(filename);
  if (!filePath) return "";
  try {
    return `data:image/png;base64,${readFileSync(filePath).toString("base64")}`;
  } catch {
    return "";
  }
}

/** Reads width/height straight out of a PNG's IHDR chunk. */
function pngSize(filePath: string) {
  try {
    const head = readFileSync(filePath).subarray(0, 33);
    if (head.length < 24) return null;
    return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
  } catch {
    return null;
  }
}

/**
 * Height of the header artwork once bled across a 210mm sheet. Derived from the
 * image so swapping the artwork can't silently crop it or leave a white strip.
 */
function headerArtHeightMm() {
  const filePath =
    chromeAssetPath("header-wide.png") ?? chromeAssetPath("header-page1.png");
  const size = filePath ? pngSize(filePath) : null;
  if (!size || size.width === 0) return 35.3;
  return (PAGE_WIDTH_MM * size.height) / size.width;
}

/**
 * Chromium sets the content top to `max(margin.top, renderedHeaderBottom)`, so
 * asking for artwork height + gap yields exactly that gap under the band.
 */
export function pdfPageMargin() {
  return {
    top: `${(headerArtHeightMm() + HEADER_CONTENT_GAP_MM).toFixed(2)}mm`,
    bottom: `${FOOTER_MARGIN_MM}mm`,
    left: "0mm",
    right: "0mm",
  };
}

/** Footer strip is ~9mm of ink; + Chromium's inset keeps it near the page edge. */
const FOOTER_MARGIN_MM = 15;

function esc(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function headerImageDataUri() {
  return (
    chromeAssetDataUri("header-wide.png") ||
    chromeAssetDataUri("header-page1.png")
  );
}

/**
 * Chromium renders header/footer templates in an isolated document that does
 * not inherit the page stylesheet, applies its own body margin, and defaults to
 * a very small font. Everything therefore has to be self-contained and explicit.
 */
function chromeTemplate(inner: string) {
  return `<style>
    html, body { margin: 0; padding: 0; width: 100%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    * { box-sizing: border-box; }
  </style>
  <div style="width:100%;margin:0;padding:0;">${inner}</div>`;
}

/** Full-bleed brand header, repeated on every sheet. */
export function pdfHeaderTemplate() {
  const headerUri = headerImageDataUri();
  // The negative margin cancels Chromium's inset so the band touches the edge.
  const bleed = `display:block;width:100%;margin-top:-${CHROME_INSET_MM}mm;`;
  const inner = headerUri
    ? `<img src="${headerUri}" style="${bleed}height:${headerArtHeightMm().toFixed(2)}mm;" />`
    : `<div style="${bleed}height:12mm;background:#0b2c5a;"></div>`;
  return chromeTemplate(inner);
}

type FooterOptions = {
  /** Small caption on the right, e.g. the invoice or booking reference. */
  reference?: string;
  showPageNumbers?: boolean;
};

/** Contact strip + page counter, repeated on every sheet. */
export function pdfFooterTemplate(options?: FooterOptions) {
  const brand = getBrand();
  const items = [
    { icon: ICON_PHONE, text: `${brand.agentPhonePrimary} | ${brand.agentPhoneSecondary}` },
    { icon: ICON_GLOBE, text: brand.agentWebsite },
    { icon: ICON_MAIL, text: brand.agentEmail },
  ];

  const cells = items
    .map(
      (item) =>
        `<td style="padding:0 6px;vertical-align:middle;white-space:nowrap;">
          <table style="border-collapse:collapse;"><tr>
            <td style="vertical-align:middle;padding:0 6px 0 0;">
              <span style="display:inline-block;width:16px;height:16px;line-height:16px;text-align:center;border-radius:50%;background:#f5c518;color:#fff;">${item.icon}</span>
            </td>
            <td style="vertical-align:middle;font-size:8px;color:#333;">${esc(item.text)}</td>
          </tr></table>
        </td>`,
    )
    .join("");

  const meta = [
    options?.reference ? esc(options.reference) : "",
    options?.showPageNumbers === false
      ? ""
      : 'Page <span class="pageNumber"></span> of <span class="totalPages"></span>',
  ]
    .filter(Boolean)
    .join(" &middot; ");

  const inner = `<div style="width:100%;border-top:2px solid #f5c518;padding:5px 16px 0;">
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        ${cells}
        <td style="padding:0 6px;text-align:right;vertical-align:middle;font-size:8px;color:#666;white-space:nowrap;">${meta}</td>
      </tr>
    </table>
  </div>`;
  return chromeTemplate(inner);
}

/**
 * Inline copies of the chrome for on-screen HTML previews only.
 * Hidden in print because Chromium paints the real chrome in the margin box.
 */
export function screenChromeCss() {
  return `
    .screen-chrome { display: block; }
    .screen-header img { display: block; width: 100%; height: auto; }
    .screen-header .fallback { height: 12px; background: #0b2c5a; }
    .screen-footer {
      border-top: 2px solid #f5c518;
      margin-top: 18px;
      padding: 8px ${CONTENT_SIDE_PADDING_MM}mm 12px;
      display: grid;
      grid-template-columns: 1.2fr 1fr 1.1fr;
      gap: 10px;
      font-size: 11px;
      color: #333;
      font-weight: 500;
    }
    .screen-footer .item { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .screen-footer .dot {
      width: 20px; height: 20px; border-radius: 50%;
      background: #f5c518; color: #fff;
      display: inline-flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .screen-footer .dot svg { display: block; width: 12px; height: 12px; }
    @media print {
      /* Chromium paints the real header/footer into the @page margin box. */
      .screen-chrome { display: none !important; }
    }
  `;
}

export function screenHeaderHtml() {
  const headerUri = headerImageDataUri();
  return `<div class="screen-chrome screen-header">${
    headerUri
      ? `<img src="${headerUri}" alt="L&B Global · Drukair" />`
      : `<div class="fallback"></div>`
  }</div>`;
}

export function screenFooterHtml() {
  const brand = getBrand();
  return `<div class="screen-chrome screen-footer">
    <div class="item"><span class="dot">${ICON_PHONE}</span>${esc(brand.agentPhonePrimary)} | ${esc(brand.agentPhoneSecondary)}</div>
    <div class="item"><span class="dot">${ICON_GLOBE}</span>${esc(brand.agentWebsite)}</div>
    <div class="item"><span class="dot">${ICON_MAIL}</span>${esc(brand.agentEmail)}</div>
  </div>`;
}
