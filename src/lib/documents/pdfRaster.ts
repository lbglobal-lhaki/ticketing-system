import { readFileSync } from "fs";
import path from "path";
import { getPdfBrowser } from "@/lib/documents/pdf";

/**
 * Renders PDF pages to PNG buffers by running pdf.js inside the Chromium
 * instance we already launch for PDF generation. Dev/QA only — lets layout
 * regressions be inspected visually without any native canvas dependency.
 */
export async function rasterizePdf(
  pdf: Buffer,
  opts?: { maxPages?: number; scale?: number },
): Promise<Buffer[]> {
  const scale = opts?.scale ?? 1.4;
  const maxPages = opts?.maxPages ?? 0;

  const pdfJsPath = path.join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "build",
    "pdf.min.mjs",
  );
  const pdfJsSource = readFileSync(pdfJsPath, "utf8");
  const pdfWorkerSource = readFileSync(
    path.join(
      process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "build",
      "pdf.worker.min.mjs",
    ),
    "utf8",
  );

  const browser = await getPdfBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent("<!DOCTYPE html><html><body></body></html>", {
      waitUntil: "domcontentloaded",
    });
    await page.addScriptTag({ content: pdfJsSource, type: "module" });
    // The module tag defines window.pdfjsLib asynchronously.
    await page.waitForFunction(
      "typeof window.pdfjsLib !== 'undefined' || typeof pdfjsLib !== 'undefined'",
      { timeout: 15_000 },
    );

    const dataUris = await page.evaluate(
      async (
        base64: string,
        pageScale: number,
        limit: number,
        workerSource: string,
      ) => {
        const lib = (window as unknown as { pdfjsLib: any }).pdfjsLib;
        lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(
          new Blob([workerSource], { type: "text/javascript" }),
        );
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const doc = await lib.getDocument({ data: bytes }).promise;
        const total = limit > 0 ? Math.min(limit, doc.numPages) : doc.numPages;
        const out: string[] = [];
        for (let n = 1; n <= total; n++) {
          const pdfPage = await doc.getPage(n);
          const viewport = pdfPage.getViewport({ scale: pageScale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await pdfPage.render({ canvasContext: ctx, viewport }).promise;
          out.push(canvas.toDataURL("image/png"));
        }
        return out;
      },
      pdf.toString("base64"),
      scale,
      maxPages,
      pdfWorkerSource,
    );

    return dataUris.map((uri) =>
      Buffer.from(uri.replace(/^data:image\/png;base64,/, ""), "base64"),
    );
  } finally {
    await page.close().catch(() => {});
  }
}
