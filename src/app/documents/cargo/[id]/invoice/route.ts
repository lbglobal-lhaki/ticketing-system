import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";
import { renderCargoInvoiceHtml } from "@/lib/documents/cargoInvoice";
import { cargoInvoicePdfOptions } from "@/lib/documents/templates";
import { htmlToPdf } from "@/lib/documents/pdf";

export const maxDuration = 30;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await isAdminAuthed())) {
      return new NextResponse(
        "Unauthorized — sign in to Admin first, then open the invoice again.",
        { status: 401 },
      );
    }

    const { id } = await context.params;
    const row = await prisma.cargoSubmission.findUnique({
      where: { id },
      include: {
        flight: {
          select: {
            airline: true,
            flightNumber: true,
            origin: true,
            destination: true,
            departureAt: true,
            arrivalAt: true,
          },
        },
      },
    });
    if (!row) {
      return new NextResponse("Cargo booking not found", { status: 404 });
    }

    const html = renderCargoInvoiceHtml(row);
    const url = new URL(request.url);
    const isPreview = url.searchParams.has("preview");
    const isDownload = url.searchParams.get("download") === "1";

    if (isPreview && !isDownload) {
      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
        },
      });
    }

    try {
      const pdf = await htmlToPdf(html, cargoInvoicePdfOptions());
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${isDownload ? "attachment" : "inline"}; filename="Cargo-Invoice-${row.parcelNumber}.pdf"`,
          "Cache-Control": "private, no-store",
        },
      });
    } catch (pdfError) {
      console.error("cargo invoice PDF failed; serving HTML", pdfError);
      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
        },
      });
    }
  } catch (error) {
    console.error("cargo invoice document failed", error);
    return new NextResponse("Could not render cargo invoice", { status: 500 });
  }
}
