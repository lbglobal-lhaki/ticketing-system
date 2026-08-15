import { get, put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { htmlToPdf } from "@/lib/documents/pdf";
import {
  invoicePdfOptions,
  renderAirfareInvoiceHtml,
  type BookingDocumentData,
} from "@/lib/documents/templates";

export function isBlobConfigured() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN?.trim() ||
      (process.env.BLOB_STORE_ID?.trim() &&
        (process.env.VERCEL_OIDC_TOKEN?.trim() || process.env.VERCEL)),
  );
}

export function invoicePdfPathname(invoiceNumber: string) {
  return `invoices/${invoiceNumber}.pdf`;
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

/** Fetch an existing private invoice PDF from Blob, or null if missing. */
export async function fetchInvoicePdfFromBlob(
  urlOrPathname: string,
): Promise<Buffer | null> {
  try {
    const result = await get(urlOrPathname, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return streamToBuffer(result.stream);
  } catch (error) {
    console.error("[blob] fetch invoice pdf failed", error);
    return null;
  }
}

/**
 * Upload (or overwrite) an invoice PDF in private Blob storage and persist
 * the URL/pathname on the Invoice row.
 */
export async function uploadInvoicePdfToBlob(opts: {
  invoiceNumber: string;
  pdf: Buffer;
}) {
  const pathname = invoicePdfPathname(opts.invoiceNumber);
  const blob = await put(pathname, opts.pdf, {
    access: "private",
    contentType: "application/pdf",
    allowOverwrite: true,
    addRandomSuffix: false,
  });

  await prisma.invoice.update({
    where: { invoiceNumber: opts.invoiceNumber },
    data: {
      pdfBlobUrl: blob.url,
      pdfBlobPathname: blob.pathname,
    },
  });

  return blob;
}

/**
 * Returns the invoice PDF bytes, preferring Blob storage when configured.
 * Regenerates + uploads when missing or when forceRefresh is set.
 */
export async function getOrCreateInvoicePdf(
  data: BookingDocumentData,
  opts?: { forceRefresh?: boolean },
): Promise<Buffer> {
  if (!data.invoice) {
    throw new Error("Invoice missing for PDF generation");
  }

  const invoiceNumber = data.invoice.invoiceNumber;

  if (!opts?.forceRefresh && isBlobConfigured()) {
    const stored = await prisma.invoice.findUnique({
      where: { invoiceNumber },
      select: { pdfBlobUrl: true, pdfBlobPathname: true },
    });
    const key = stored?.pdfBlobPathname || stored?.pdfBlobUrl;
    if (key) {
      const existing = await fetchInvoicePdfFromBlob(key);
      if (existing) return existing;
    }
  }

  const pdf = await htmlToPdf(
    renderAirfareInvoiceHtml(data),
    invoicePdfOptions(data),
  );

  if (isBlobConfigured()) {
    try {
      await uploadInvoicePdfToBlob({ invoiceNumber, pdf });
    } catch (error) {
      // Still return the PDF so email/view works even if Blob is misconfigured.
      console.error("[blob] upload invoice pdf failed", error);
    }
  } else {
    console.info(
      "[blob] skipped — set BLOB_READ_WRITE_TOKEN (local) or connect Blob store on Vercel",
    );
  }

  return pdf;
}

/** Clear stored Blob pointers so the next render regenerates a fresh PDF. */
export async function invalidateInvoicePdfBlob(invoiceId: string) {
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { pdfBlobUrl: null, pdfBlobPathname: null },
  });
}
