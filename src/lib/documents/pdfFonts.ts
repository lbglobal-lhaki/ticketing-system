import { readFileSync } from "fs";
import path from "path";

/**
 * PDF documents used to render body text as `Arial, Helvetica, sans-serif`
 * and rely on whatever the machine generating the PDF happened to have
 * installed. That's fine on a dev machine with real Arial, but the
 * serverless Chromium build used in production (`@sparticuz/chromium-min`)
 * ships without it and silently substitutes a wider fallback font — which
 * reflows text onto extra lines and was the real cause of invoices
 * intermittently spilling onto a second page (with just the footer stranded
 * on it) even though the exact same HTML fit on one page locally.
 *
 * Embedding Arimo (Google's metric-compatible, Apache-2.0 replacement for
 * Arial) as a base64 `@font-face` guarantees byte-identical text layout on
 * every machine — dev laptop or serverless — regardless of what system
 * fonts are present. `htmlToPdf` already waits on `document.fonts.ready`
 * before printing, so the embedded font is always fully loaded first.
 */

let cachedFontFaceCss: string | null = null;

function fontDataUri(filename: string): string | null {
  try {
    const buf = readFileSync(
      path.join(process.cwd(), "public", "documents", "fonts", filename),
    );
    return `data:font/ttf;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** `@font-face` CSS declaring "Arimo" from bundled TTFs — safe to inline in every PDF template's <style>. */
export function pdfFontFaceCss(): string {
  if (cachedFontFaceCss !== null) return cachedFontFaceCss;

  const regular = fontDataUri("Arimo-Regular.ttf");
  const bold = fontDataUri("Arimo-Bold.ttf");
  if (!regular || !bold) {
    cachedFontFaceCss = "";
    return cachedFontFaceCss;
  }

  cachedFontFaceCss = `
    @font-face {
      font-family: "Arimo";
      font-style: normal;
      font-weight: 400;
      src: url(${regular}) format("truetype");
    }
    @font-face {
      font-family: "Arimo";
      font-style: normal;
      font-weight: 700;
      src: url(${bold}) format("truetype");
    }
  `;
  return cachedFontFaceCss;
}

/** Shared PDF body font stack — Arimo first (embedded, deterministic), system fonts only as a last-resort fallback. */
export const PDF_FONT_FAMILY = '"Arimo", Arial, Helvetica, sans-serif';
