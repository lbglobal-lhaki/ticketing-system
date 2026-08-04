import { readFileSync } from "fs";
import path from "path";

/**
 * PDF documents use Arimo (metric-compatible with Arial) so serverless
 * Chromium — which has no Arial — lays out identically to local Chrome.
 *
 * IMPORTANT: do NOT base64-inline the TTFs into every HTML document.
 * That alone was ~824KB of CSS per render and made Puppeteer setContent
 * crawl. Templates only declare the font-family stack; `htmlToPdf`
 * registers the faces once per page via the FontFace API.
 */

/** Shared PDF body font stack — Arimo first (injected at print time). */
export const PDF_FONT_FAMILY = '"Arimo", Arial, Helvetica, sans-serif';

/**
 * Kept for call-site compatibility in document templates. Always empty —
 * fonts are registered by `loadPdfFontPayloads()` inside `htmlToPdf`.
 */
export function pdfFontFaceCss(): string {
  return "";
}

export type PdfFontPayload = {
  regularBase64: string;
  boldBase64: string;
};

let cachedPayloads: PdfFontPayload | null | undefined;

function readFontBase64(filename: string): string | null {
  try {
    return readFileSync(
      path.join(process.cwd(), "public", "documents", "fonts", filename),
    ).toString("base64");
  } catch {
    return null;
  }
}

/** Lazy-load Arimo TTFs once per process — reused across every PDF render. */
export function loadPdfFontPayloads(): PdfFontPayload | null {
  if (cachedPayloads !== undefined) return cachedPayloads;

  const regularBase64 = readFontBase64("Arimo-Regular.ttf");
  const boldBase64 = readFontBase64("Arimo-Bold.ttf");
  if (!regularBase64 || !boldBase64) {
    cachedPayloads = null;
    return null;
  }

  cachedPayloads = { regularBase64, boldBase64 };
  return cachedPayloads;
}
