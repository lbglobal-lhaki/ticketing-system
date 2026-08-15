import { existsSync } from "fs";
import type { Browser } from "puppeteer-core";
import { loadPdfFontPayloads } from "@/lib/documents/pdfFonts";

/** True when running on Vercel/AWS Lambda-style serverless compute. */
const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME,
);

/**
 * Remote Chromium pack for serverless (downloaded + extracted to /tmp on first use).
 * Must match the installed @sparticuz/chromium-min major version.
 */
const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL?.trim() ||
  "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar";

const LOCAL_CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  // Windows
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  // macOS
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  // Linux
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
].filter((value): value is string => Boolean(value));

let cachedLocalChromePath: string | null | undefined;

function findLocalChromePath(): string | null {
  if (cachedLocalChromePath !== undefined) return cachedLocalChromePath;
  cachedLocalChromePath =
    LOCAL_CHROME_CANDIDATES.find((candidate) => existsSync(candidate)) ??
    null;
  return cachedLocalChromePath;
}

let browserPromise: Promise<Browser> | null = null;

/** Exposed for dev/QA tooling that needs the same warm Chromium instance. */
export async function getPdfBrowser(): Promise<Browser> {
  return getBrowser();
}

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      // Serverless freezes can leave a dead browser handle behind.
      if (existing.connected) return existing;
    } catch {
      /* relaunch below */
    }
    browserPromise = null;
  }

  browserPromise = launchBrowser().catch((error) => {
    browserPromise = null;
    throw error;
  });
  return browserPromise;
}

async function launchBrowser(): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default;

  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium-min")).default;
    chromium.setGraphicsMode = false;
    return puppeteer.launch({
      args: puppeteer.defaultArgs({
        args: chromium.args,
        headless: "shell",
      }),
      executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
      headless: "shell",
    });
  }

  const executablePath = findLocalChromePath();
  if (!executablePath) {
    throw new Error(
      "PDF generation needs a local Chrome/Edge install. Install Google Chrome, or set PUPPETEER_EXECUTABLE_PATH to your browser's executable path.",
    );
  }
  return puppeteer.launch({ executablePath, headless: true });
}

export type HtmlToPdfOptions = {
  /**
   * Paint a repeating header/footer into the @page margin box. The margin is
   * reserved on every sheet and sits outside the content box, so flowing
   * content can never overlap it (no manual pagination required).
   */
  headerTemplate?: string;
  footerTemplate?: string;
  margin?: { top?: string; right?: string; bottom?: string; left?: string };
};

/**
 * Renders HTML to an A4 PDF buffer.
 *
 * Performance notes:
 * - Reuses one Chromium instance for the life of the process (including
 *   serverless warm instances). Closing after every PDF forced a multi-minute
 *   Chromium pack download/extract on each invoice/eticket.
 * - Fonts are registered via FontFace after setContent — not baked as ~824KB
 *   of base64 CSS into every HTML string (that made parsing alone crawl).
 * - `domcontentloaded` is enough for fully inlined documents; `networkidle0`
 *   was waiting on nothing useful and adding seconds.
 */
export async function htmlToPdf(
  html: string,
  options?: HtmlToPdfOptions,
): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    const fonts = loadPdfFontPayloads();
    if (fonts) {
      // NOTE: keep this body free of *named* inner functions. Bundlers that
      // enable esbuild's `keepNames` rewrite `const fn = () => {}` into
      // `__name(fn, "fn")`, and that helper does not exist inside the page
      // context — it throws "__name is not defined" at evaluate time.
      await page.evaluate(
        async (regularBase64: string, boldBase64: string) => {
          await Promise.all(
            (
              [
                ["400", regularBase64],
                ["700", boldBase64],
              ] as Array<[string, string]>
            ).map(async ([weight, b64]) => {
              const binary = atob(b64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
              }
              const face = new FontFace("Arimo", bytes.buffer, {
                style: "normal",
                weight,
              });
              await face.load();
              document.fonts.add(face);
            }),
          );
        },
        fonts.regularBase64,
        fonts.boldBase64,
      );
    }

    // Images (even base64) decode async — wait before capturing so headers
    // aren't cropped mid-paint.
    await page.evaluate(async () => {
      const images = Array.from(document.images);
      await Promise.all(
        images.map((img) => {
          if (img.complete && img.naturalHeight > 0) return Promise.resolve();
          return new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          });
        }),
      );
      const fontSet = (document as Document & { fonts?: FontFaceSet }).fonts;
      if (fontSet?.ready) await fontSet.ready;
    });

    const usesMarginChrome = Boolean(
      options?.headerTemplate || options?.footerTemplate,
    );

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      // With margin chrome, Puppeteer's format + margin must be authoritative;
      // a CSS `@page { margin: 0 }` would otherwise collapse the header box.
      preferCSSPageSize: !usesMarginChrome,
      displayHeaderFooter: usesMarginChrome,
      headerTemplate: options?.headerTemplate ?? "",
      footerTemplate: options?.footerTemplate ?? "",
      margin: options?.margin,
    });
    return Buffer.from(pdf);
  } finally {
    // Only close the page — keep the browser warm for the next PDF in this
    // request (or the next warm-instance request). Relaunch happens
    // automatically in getBrowser() if the handle dies after a freeze.
    await page.close().catch(() => {});
  }
}
