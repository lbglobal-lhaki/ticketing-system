import "dotenv/config";
import { existsSync, mkdirSync } from "fs";
import puppeteer from "puppeteer-core";

const executablePath = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));
mkdirSync("tmp-shots", { recursive: true });
const base = "http://localhost:3000";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1300, height: 950 });
  const dialogs = [];
  page.on("dialog", async (d) => {
    dialogs.push(d.message());
    await d.dismiss();
  });

  // Former charter-priced departure: KB960 PBH→PER 21 Oct.
  await page.goto(
    `${base}/?origin=PBH&destination=PER&date=2026-10-21&tripType=one_way&adults=1&cabinClass=economy`,
    { waitUntil: "networkidle0", timeout: 180000 },
  );
  const card = await page.evaluate(() => {
    const c = document.querySelector('a[href^="/flights/"]');
    return { href: c?.getAttribute("href"), text: c?.closest("article,li,div")?.textContent?.replace(/\s+/g, " ").slice(0, 300) };
  });
  console.log("SEARCH first fare link:", card.href);
  await page.screenshot({ path: "tmp-shots/search.png", clip: { x: 0, y: 480, width: 1300, height: 450 } });

  await page.goto(base + card.href, { waitUntil: "networkidle0", timeout: 180000 });
  const fares = await page.evaluate(() =>
    [...document.querySelectorAll("h3, h4")].map((h) => h.textContent.trim()).filter(Boolean).slice(0, 20),
  );
  console.log("FARE PAGE headings:", fares.join(" | "));
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log("mentions charter catalogue/Saver/Flexi:", /Saver|Flexi|activate charter/i.test(bodyText));
  await page.screenshot({ path: "tmp-shots/fares.png", fullPage: true });

  // Admin.
  await page.goto(`${base}/admin`, { waitUntil: "networkidle0", timeout: 180000 });
  if (await page.$('input[name="password"]')) {
    await page.type('input[name="password"]', process.env.ADMIN_PASSWORD ?? "");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: 180000 }),
      page.click('button[type="submit"]'),
    ]);
  }
  await page.goto(`${base}/admin?tab=fares`, { waitUntil: "networkidle0", timeout: 180000 });
  const nav = await page.evaluate(() => document.querySelector("nav, aside")?.innerText.replace(/\s+/g, " "));
  console.log("ADMIN NAV:", nav);
  console.log("?tab=fares lands on heading:", await page.evaluate(() => document.querySelector("h1")?.textContent));
  await page.screenshot({ path: "tmp-shots/admin.png" });
  console.log("DIALOGS:", dialogs.length);
} finally {
  await browser.close();
}
