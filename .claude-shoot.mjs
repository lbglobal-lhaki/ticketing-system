import puppeteer from "puppeteer-core";
import dotenv from "dotenv";

dotenv.config({ path: "c:/Users/palde/OneDrive/Desktop/Websites/ticketing-system/.env" });

const OUT = "C:/Users/palde/AppData/Local/Temp/claude/c--Users-palde-OneDrive-Desktop-Websites-ticketing-system/73f39ad3-0de7-480d-b224-d1fa8cf30e69/scratchpad";
const BASE = "http://localhost:3000";

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 });

const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

await page.goto(`${BASE}/admin`, { waitUntil: "networkidle2" });

// Log in if the gate is showing.
const pw = await page.$('input[name="password"]');
if (pw) {
  await pw.type(process.env.ADMIN_PASSWORD ?? "");
  await page.click('button[type="submit"], input[type="submit"]');
  // Server action + redirect — no full navigation, so wait for the gate to go.
  await page.waitForFunction(
    () => !document.querySelector('input[name="password"]'),
    { timeout: 60000 },
  );
  await new Promise((r) => setTimeout(r, 1500));
}

const tabs = ["flights", "form", "bookings", "invoices", "cargo", "deleted"];
for (const tab of tabs) {
  await page.goto(`${BASE}/admin?tab=${tab}`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: `${OUT}/tab-${tab}.png`, fullPage: false });
  console.log(`shot ${tab}`);
}

// Open the walk-in flight combobox and type into it.
await page.goto(`${BASE}/admin?tab=bookings`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1000));
const opened = await page.evaluate(() => {
  const sel = document.querySelector('select[name="flightId"]');
  if (!sel) return "no flightId select";
  const btn = sel.parentElement?.querySelector("button");
  if (!btn) return "no trigger button";
  btn.scrollIntoView({ block: "center" });
  btn.click();
  return "clicked";
});
console.log("combobox:", opened);
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: `${OUT}/combobox-open.png` });

await page.keyboard.type("p");
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: `${OUT}/combobox-typed.png` });

console.log("ERRORS:", errors.length ? errors.slice(0, 10) : "none");
await browser.close();
