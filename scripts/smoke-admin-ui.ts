/**
 * Drives the real admin dashboard in a browser: signs in, visits every tab,
 * opens the walk-in form / booking editor / invoice modal, and screenshots
 * each one. Catches the things static review can't — console errors, hydration
 * mismatches, controls that render but don't respond, layout that breaks.
 *
 * Needs the dev server running (npm run dev) and ADMIN_PASSWORD set.
 *
 * Run: npx tsx scripts/smoke-admin-ui.ts [baseUrl]
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import "dotenv/config";
import { getPdfBrowser } from "../src/lib/documents/pdf";

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
    console.log(`  ✓ ${msg}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${msg}`);
  }
}

async function main() {
  const base = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
  const password = process.env.ADMIN_PASSWORD?.trim();
  if (!password) {
    console.error("ADMIN_PASSWORD is not set — cannot sign in");
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), "tmp", "admin-ui");
  mkdirSync(outDir, { recursive: true });

  const browser = await getPdfBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  // Anything React logs as an error (hydration, key warnings, thrown handlers)
  // is a defect even when the page still paints.
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err: unknown) =>
    consoleErrors.push(
      `pageerror: ${err instanceof Error ? err.message : String(err)}`,
    ),
  );

  try {
    console.log("1) Sign in");
    await page.goto(`${base}/admin`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('input[name="password"]', { timeout: 20_000 });
    await page.type('input[name="password"]', password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 90_000 }),
      page.click('button[type="submit"]'),
    ]);
    // The dashboard streams in after the navigation commits — querying the
    // shell immediately raced the redirect and tore down the execution context.
    await page.waitForSelector("nav button", { timeout: 90_000 });
    assert(true, "signed in and dashboard shell rendered");

    for (const tab of TABS) {
      console.log(`\n2) Tab: ${tab}`);
      await page.goto(`${base}/admin?tab=${tab}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForSelector("nav button", { timeout: 30_000 });
      // Let client transitions//data settle before judging the paint.
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 400))),
      );

      const info = await page.evaluate(() => {
        const body = document.body;
        return {
          text: (body.innerText || "").slice(0, 4000),
          height: body.scrollHeight,
          // Horizontal overflow on a 1440px viewport = broken layout.
          overflowsX: document.documentElement.scrollWidth > window.innerWidth + 2,
          buttons: document.querySelectorAll("button, a[href]").length,
          inputs: document.querySelectorAll("input, select, textarea").length,
        };
      });

      assert(info.height > 400, `${tab}: content rendered (${info.height}px tall)`);
      assert(!info.overflowsX, `${tab}: no horizontal overflow at 1440px`);
      assert(info.buttons > 5, `${tab}: interactive controls present (${info.buttons})`);
      assert(
        !/Application error|Unhandled Runtime Error|NEXT_REDIRECT/i.test(info.text),
        `${tab}: no error boundary on screen`,
      );

      writeFileSync(
        path.join(outDir, `${tab}.png`),
        await page.screenshot({ fullPage: true, type: "png" }),
      );
    }

    console.log("\n3) Walk-in form interaction");
    await page.goto(`${base}/admin?tab=bookings`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector('form select[name="flightId"]', { timeout: 30_000 });
    const flightOptions = await page.evaluate(() => {
      const sel = document.querySelector<HTMLSelectElement>(
        'form select[name="flightId"]',
      );
      return sel ? sel.options.length : 0;
    });
    assert(flightOptions >= 1, `walk-in flight picker wired (${flightOptions} option(s))`);
    const addTraveller = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        /add (adult|child|infant)/i.test(b.textContent || ""),
      );
      if (!btn) return false;
      btn.click();
      return true;
    });
    assert(addTraveller, "traveller add button found and clicked");
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 300))),
    );
    const seatLine = await page.evaluate(
      () => (document.body.innerText.match(/Seats \(adults \+ children\):\s*(\d+)/) ?? [])[1],
    );
    assert(seatLine === "2", `seat counter updates live (showed ${seatLine})`);
    writeFileSync(
      path.join(outDir, "walkin-form.png"),
      await page.screenshot({ fullPage: true, type: "png" }),
    );

    console.log("\n4) Invoice modal");
    await page.goto(`${base}/admin?tab=invoices`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("nav button", { timeout: 30_000 });
    const openedModal = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(
        (b) => (b.textContent || "").trim() === "Edit / preview",
      );
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (openedModal) {
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 1200))),
      );
      const modal = await page.evaluate(() => ({
        hasIframe: Boolean(document.querySelector("iframe")),
        hasAirfare: Boolean(document.querySelector('input[name="airfareAud"]')),
        hasGst: Boolean(document.querySelector('input[name="gstMode"]')),
      }));
      assert(modal.hasIframe, "invoice modal renders the live preview iframe");
      assert(
        modal.hasAirfare,
        "money fields stay mounted (so a travel-tab save can't zero them)",
      );
      assert(modal.hasGst, "GST mode control present");
      writeFileSync(
        path.join(outDir, "invoice-modal.png"),
        await page.screenshot({ fullPage: true, type: "png" }),
      );
    } else {
      console.log("  – no invoices to open (skipped)");
    }

    console.log("\n5) Console health");
    const noisy = consoleErrors.filter(
      (e) => !/favicon|404 \(Not Found\)|Failed to load resource/i.test(e),
    );
    assert(
      noisy.length === 0,
      `no console/runtime errors${noisy.length ? `: ${noisy.slice(0, 3).join(" | ")}` : ""}`,
    );
  } finally {
    await page.close().catch(() => {});
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`Screenshots in ${outDir}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
