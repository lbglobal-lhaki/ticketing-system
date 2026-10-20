import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";
import { renderCargoConfirmationHtml } from "@/lib/documents/cargoConfirmation";
import { cargoInvoicePdfOptions } from "@/lib/documents/templates";
import { htmlToPdf } from "@/lib/documents/pdf";

export const maxDuration = 60;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await isAdminAuthed())) {
      return new NextResponse(
        "Unauthorized — sign in to Admin first, then open the confirmation again.",
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

    if (!row.paid || row.paymentStatus !== "paid" || row.bookingStatus !== "confirmed") {
      return new NextResponse(
        "Official confirmation is issued only after payment has been verified.",
        { status: 409 },
      );
    }

    const html = renderCargoConfirmationHtml(row);
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
          "Content-Disposition": `${isDownload ? "attachment" : "inline"}; filename="Cargo-Confirmation-${row.parcelNumber}.pdf"`,
          "Cache-Control": "private, no-store",
        },
      });
    } catch (pdfError) {
      console.error("cargo confirmation PDF failed; serving HTML", pdfError);
      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
        },
      });
    }
  } catch (error) {
    console.error("cargo confirmation document failed", error);
    return new NextResponse("Could not render cargo confirmation", {
      status: 500,
    });
  }
}
