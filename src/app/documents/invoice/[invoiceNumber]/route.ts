import { NextResponse } from "next/server";
import { canAccessBooking } from "@/lib/documentAccess";
import { prisma } from "@/lib/db";
import { getOrCreateInvoicePdf } from "@/lib/documents/invoiceBlob";
import { renderAirfareInvoiceHtml } from "@/lib/documents/templates";
import { loadBookingDocumentData } from "@/lib/email/bookingMail";

export const maxDuration = 60;

export async function GET(
  request: Request,
  context: { params: Promise<{ invoiceNumber: string }> },
) {
  try {
    const { invoiceNumber } = await context.params;
    const url = new URL(request.url);
    const token = url.searchParams.get("t");
    // Admin preview iframes append `?preview=<bust>` — always render the
    // current template instead of serving a possibly stale cached PDF.
    const isPreview = url.searchParams.has("preview");
    // Admin "Download" links append `?download=1` — same PDF, but tell the
    // browser to save it instead of opening inline (which is what the
    // preview iframe needs, so this can't just always be "attachment").
    const isDownload = url.searchParams.get("download") === "1";
    const invoice = await prisma.invoice.findUnique({
      where: { invoiceNumber: decodeURIComponent(invoiceNumber) },
      select: {
        bookingId: true,
        booking: {
          select: {
            accessToken: true,
            quote: { select: { sessionId: true } },
          },
        },
      },
    });
    if (!invoice) {
      return new NextResponse("Airfare invoice not found", { status: 404 });
    }

    const allowed = await canAccessBooking({
      accessToken: invoice.booking.accessToken,
      quoteSessionId: invoice.booking.quote?.sessionId,
      providedToken: token,
    });
    if (!allowed) {
      return new NextResponse(
        "Unauthorized — open this invoice from your confirmation email or booking page.",
        { status: 401 },
      );
    }

    const data = await loadBookingDocumentData(invoice.bookingId);
    if (!data?.invoice) {
      return new NextResponse("Airfare invoice not found", { status: 404 });
    }

    // Admin modal preview uses `?preview=` — serve HTML so Save/reload is
    // instant. Chromium PDF generation is reserved for download / customer
    // views (that was taking 1–2 minutes per preview refresh).
    if (isPreview && !isDownload) {
      return new NextResponse(renderAirfareInvoiceHtml(data), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
        },
      });
    }

    try {
      const pdf = await getOrCreateInvoicePdf(data, {
        forceRefresh: false,
      });
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${isDownload ? "attachment" : "inline"}; filename="Airfare-Invoice-${data.invoice.invoiceNumber}.pdf"`,
          "Cache-Control": "private, no-store",
        },
      });
    } catch (pdfError) {
      // Chromium can fail on cold serverless starts — fall back to HTML so
      // customers can still view / print the invoice.
      console.error("airfare invoice pdf failed; serving HTML", pdfError);
      return new NextResponse(renderAirfareInvoiceHtml(data), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
        },
      });
    }
  } catch (error) {
    console.error("airfare invoice document failed", error);
    return new NextResponse("Could not render airfare invoice", {
      status: 500,
    });
  }
}
