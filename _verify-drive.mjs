import puppeteer from "puppeteer-core";
import dotenv from "dotenv";
import { readFileSync } from "fs";

const ROOT = "c:/Users/palde/OneDrive/Desktop/Websites/ticketing-system";
dotenv.config({ path: `${ROOT}/.env` });

const OUT =
  "C:/Users/palde/AppData/Local/Temp/claude/c--Users-palde-OneDrive-Desktop-Websites-ticketing-system/6d440267-86c0-45d1-b0c8-2158364c4fc4/scratchpad";
const BASE = "http://localhost:3000";
const seed = JSON.parse(
  readFileSync(`${OUT}/seed.json`, "utf8").replace(/^﻿/, "").trim(),
);

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
page.setDefaultNavigationTimeout(240000);
page.setDefaultTimeout(120000);
await page.setViewport({ width: 1500, height: 1400, deviceScaleFactor: 1 });

const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

// ---- login ----------------------------------------------------------------
await page.goto(`${BASE}/admin`, { waitUntil: "networkidle2" });
const pw = await page.$('input[name="password"]');
if (pw) {
  await pw.type(process.env.ADMIN_PASSWORD ?? "");
  await page.click('button[type="submit"], input[type="submit"]');
  await page.waitForFunction(
    () => !document.querySelector('input[name="password"]'),
    { timeout: 60000 },
  );
  await sleep(1500);
}
log("logged in");

// ---- helpers --------------------------------------------------------------
async function setField(name, value) {
  const el = await page.$(`[name="${name}"]`);
  if (!el) throw new Error(`no field ${name}`);
  await el.click({ clickCount: 3 });
  await el.type(value);
}

async function clickButtonByText(text, root = null) {
  const handle = await page.evaluateHandle(
    (t, scope) => {
      const btns = Array.from(
        (scope || document).querySelectorAll("button"),
      ).filter((b) => b.textContent.trim().toLowerCase() === t.toLowerCase());
      return btns[0] || null;
    },
    text,
    root,
  );
  const el = handle.asElement();
  if (!el) throw new Error(`no button "${text}"`);
  await el.evaluate((b) => b.scrollIntoView({ block: "center" }));
  await el.click();
}

/** Count companion contact inputs anywhere on the page. */
const countContactInputs = () =>
  page.evaluate(() => ({
    email: document.querySelectorAll(
      '[name$="PassengerEmail"]',
    ).length,
    phone: document.querySelectorAll('[name$="PassengerPhone"]').length,
    names: document.querySelectorAll('[name$="PassengerName"]').length,
  }));

// ==========================================================================
// PART 1 — walk-in booking: 1 extra adult + 1 child + 1 infant
// ==========================================================================
await page.goto(`${BASE}/admin?tab=bookings`, { waitUntil: "networkidle2" });
await sleep(1200);

// Flight combobox → "+ Custom flight (not in system)"
await page.evaluate(() => {
  const sel = document.querySelector('select[name="flightId"]');
  const btn = sel.parentElement.querySelector("button");
  btn.scrollIntoView({ block: "center" });
  btn.click();
});
await sleep(500);
await page.keyboard.type("custom");
await sleep(400);
await page.keyboard.press("Enter");
await sleep(800);
log("selected custom flight");

const dep = new Date(Date.now() + 30 * 864e5);
const arr = new Date(dep.getTime() + 8 * 3600e3);
const dtl = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;

await setField("outboundCustomAirline", "WALKIN AIR");
await setField("outboundCustomFlightNumber", `WK${String(Date.now()).slice(-4)}`);
await setField("outboundCustomOrigin", "PER");
await setField("outboundCustomDestination", "PBH");
await setField("outboundCustomDepartureAt", dtl(dep));
await setField("outboundCustomArrivalAt", dtl(arr));
await setField("outboundCustomPriceAud", "1000.00");
log("custom flight filled");

await setField("passengerName", "Walkin Primary");
await setField("email", "walkin.primary@example.com");
await setField("passengerPhone", "0411111111");
await setField("passportNumber", "PP0001");
await setField("nationality", "Australian");
log("primary passenger filled");

await clickButtonByText("Add adult");
await clickButtonByText("Add child");
await clickButtonByText("Add infant");
await sleep(600);

// Fill the companion rows (getAll order: extra, child, infant groups)
await page.evaluate(() => {
  const set = (el, v) => {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const byName = (n) => Array.from(document.querySelectorAll(`[name="${n}"]`));
  set(byName("extraPassengerName")[0], "Walkin Extra Adult");
  set(byName("extraPassengerPassport")[0], "PP0002");
  set(byName("extraPassengerNationality")[0], "Australian");
  set(byName("childPassengerName")[0], "Walkin Child");
  set(byName("childPassengerPassport")[0], "PP0003");
  set(byName("childPassengerPriceAud")[0], "450.00");
  set(byName("infantPassengerName")[0], "Walkin Infant");
  set(byName("infantPassengerPassport")[0], "PP0004");
  set(byName("infantPassengerPriceAud")[0], "120.00");
});
await sleep(400);
log("companions filled");

const walkInContacts = await countContactInputs();
log("walk-in form contact inputs:", JSON.stringify(walkInContacts));

await page.screenshot({ path: `${OUT}/walkin-form.png`, fullPage: true });

// Submit
await clickButtonByText("Create walk-in booking").catch(async () => {
  // fall back: submit button inside the walk-in form
  await page.evaluate(() => {
    const form = document.querySelector('form:has([name="passengerName"])');
    form.querySelector('button[type="submit"]').click();
  });
});
await page.waitForFunction(
  () => /saved=walk-in|error=/.test(location.search),
  { timeout: 90000 },
);
await sleep(2000);
const afterCreateUrl = page.url();
log("after create:", decodeURIComponent(afterCreateUrl));
await page.screenshot({ path: `${OUT}/walkin-result.png`, fullPage: false });

// ==========================================================================
// PART 2 — open existing multi-passenger booking, save with no changes
// ==========================================================================
await page.goto(`${BASE}/admin?tab=bookings`, { waitUntil: "networkidle2" });
await sleep(1500);

const opened = await page.evaluate((ref) => {
  const els = Array.from(document.querySelectorAll("*")).filter(
    (e) => e.children.length === 0 && e.textContent.includes(ref),
  );
  if (els.length === 0) return "ref not found";
  let row = els[0];
  for (let i = 0; i < 12 && row; i++) {
    const btn = Array.from(row.querySelectorAll("button")).find((b) =>
      /^edit$/i.test(b.textContent.trim()),
    );
    if (btn) {
      btn.scrollIntoView({ block: "center" });
      btn.click();
      return "clicked edit";
    }
    row = row.parentElement;
  }
  return "edit button not found";
}, seed.bookingRef);
log("open edit modal:", opened);
await sleep(1500);

const modalContacts = await countContactInputs();
log("edit modal contact inputs:", JSON.stringify(modalContacts));
await page.screenshot({ path: `${OUT}/edit-modal.png`, fullPage: true });

await clickButtonByText("Save booking");
await page.waitForFunction(() => /saved=|error=/.test(location.search), {
  timeout: 90000,
});
await sleep(2500);
log("after save:", decodeURIComponent(page.url()));
await page.screenshot({ path: `${OUT}/edit-saved.png`, fullPage: false });

log("PAGE ERRORS:", errors.length ? errors.slice(0, 10) : "none");
console.log(
  "SUMMARY " +
    JSON.stringify({
      walkInContacts,
      modalContacts,
      afterCreateUrl: decodeURIComponent(afterCreateUrl),
    }),
);
await browser.close();
