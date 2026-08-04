import { existsSync } from "fs";
import type { Browser } from "puppeteer-core";

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

/** Renders a self-contained HTML document (inline styles/images) to an A4 PDF buffer. */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, {
      waitUntil: "networkidle0",
      timeout: 30_000,
    });
    // `domcontentloaded`/`networkidle0` don't guarantee images have finished
    // decoding and painting — even inline base64 <img>s decode async off the
    // main thread. Without this, page.pdf() can snapshot mid-paint and the
    // header banner comes out cropped/cut off. Wait for every image plus
    // web fonts before printing.
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
      const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
      if (fonts?.ready) await fonts.ready;
    });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
    // Close after each render on serverless — warm instances often kill Chrome.
    if (isServerless) {
      await browser.close().catch(() => {});
      browserPromise = null;
    }
  }
}
