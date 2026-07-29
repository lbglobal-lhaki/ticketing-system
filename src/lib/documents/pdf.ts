import { existsSync } from "fs";
import type { Browser } from "puppeteer-core";

/** True when running on Vercel/AWS Lambda-style serverless compute. */
const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME,
);

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

/** Launches (or reuses, on a warm serverless instance) a headless Chromium instance. */
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launchBrowser().catch((error) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
}

async function launchBrowser(): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default;

  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
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
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}
