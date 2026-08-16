/**
 * Checks every admin section at the widths real people use it at, and reports
 * anything that overflows horizontally or renders a control too small to tap.
 *
 * Horizontal overflow is the failure that matters: it means the page scrolls
 * sideways, which is how "works on my 1440" breaks on a laptop or a phone.
 * Tables are exempt — they scroll inside their own wrapper by design.
 *
 * Needs the dev server running and ADMIN_PASSWORD set.
 * Run: npx tsx scripts/smoke-admin-responsive.ts [baseUrl]
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import "dotenv/config";
import { getPdfBrowser } from "../src/lib/documents/pdf";

const WIDTHS = [
  { name: "mobile", width: 360, height: 780 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1280, height: 900 },
  { name: "desktop", width: 1440, height: 1000 },
];

const TABS = [
  "analytics",
  "flights",
  "form",
  "fares",
  "bookings",
  "invoices",
  "cargo",
  "deleted",
] as const;

let passed = 0;
let failed = 0;

function assert(cond: unknown, msg: string) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  ✗ ${msg}`);
  }
}

async function main() {
  const base = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
  const password = process.env.ADMIN_PASSWORD?.trim();
  if (!password) {
    console.error("ADMIN_PASSWORD is not set");
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), "tmp", "admin-responsive");
  mkdirSync(outDir, { recursive: true });

  const browser = await getPdfBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  await page.goto(`${base}/admin`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForSelector('input[name="password"]', { timeout: 60_000 });
  await page.type('input[name="password"]', password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 120_000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForSelector("nav button", { timeout: 90_000 });

  for (const vp of WIDTHS) {
    console.log(`\n${vp.name} · ${vp.width}px`);
    await page.setViewport({ width: vp.width, height: vp.height });

    for (const tab of TABS) {
      await page.goto(`${base}/admin?tab=${tab}`, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });
      await page.waitForSelector("h1", { timeout: 60_000 });
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 350))),
      );

      const report = await page.evaluate(() => {
        const docWidth = document.documentElement.scrollWidth;
        const winWidth = window.innerWidth;

        // Elements wider than the viewport that are NOT inside a scroll
        // container — those are the ones that push the page sideways.
        const offenders: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
          const rect = el.getBoundingClientRect();
          if (rect.width <= winWidth + 1) continue;
          let scrollableAncestor = false;
          for (let n = el.parentElement; n; n = n.parentElement) {
            const ov = getComputedStyle(n).overflowX;
            if (ov === "auto" || ov === "scroll") {
              scrollableAncestor = true;
              break;
            }
          }
          if (scrollableAncestor) continue;
          const id = `${el.tagName.toLowerCase()}.${(el.className || "")
            .toString()
            .split(/\s+/)
            .slice(0, 3)
            .join(".")}`;
          if (!offenders.includes(id)) offenders.push(id);
        }

        // Interactive controls smaller than a comfortable touch target.
        // Visually-hidden inputs are skipped: patterns like the Combobox's
        // sr-only <select> and the DateTimePicker's value field are 1px on
        // purpose — they exist so native validation can focus them, and the
        // real target is the styled trigger beside them.
        const small: string[] = [];
        for (const el of Array.from(
          document.querySelectorAll<HTMLElement>("button, a[href], input, select"),
        )) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.width <= 2 || r.height <= 2) continue;
          if (el.closest(".sr-only") || el.classList.contains("sr-only")) continue;
          if (r.height < 32) {
            const id = `${el.tagName.toLowerCase()}:${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 22)}(${Math.round(r.height)}px)`;
            if (!small.includes(id)) small.push(id);
          }
        }

        return {
          overflows: docWidth > winWidth + 1,
          docWidth,
          winWidth,
          offenders: offenders.slice(0, 5),
          small: small.slice(0, 5),
        };
      });

      assert(
        !report.overflows,
        `${vp.name}/${tab}: page scrolls sideways (${report.docWidth}px > ${report.winWidth}px)` +
          (report.offenders.length ? ` — ${report.offenders.join(", ")}` : ""),
      );
      assert(
        report.small.length === 0,
        `${vp.name}/${tab}: ${report.small.length} control(s) under 32px — ${report.small.join(", ")}`,
      );

      if (vp.name === "mobile" || vp.name === "laptop") {
        writeFileSync(
          path.join(outDir, `${vp.name}-${tab}.png`),
          await page.screenshot({ fullPage: true, type: "png" }),
        );
      }
    }
    console.log(`  ${TABS.length} sections checked`);
  }

  await page.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`Screenshots in ${outDir}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
