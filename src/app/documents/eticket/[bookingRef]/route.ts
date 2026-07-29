import { NextResponse } from "next/server";
import { canAccessBooking } from "@/lib/documentAccess";
import { prisma } from "@/lib/db";
import { renderTravelDocumentHtml } from "@/lib/documents/templates";
import { htmlToPdf } from "@/lib/documents/pdf";
import { loadBookingDocumentData } from "@/lib/email/bookingMail";

export const maxDuration = 60;

export async function GET(
  request: Request,
  context: { params: Promise<{ bookingRef: string }> },
) {
  try {
    const { bookingRef } = await context.params;
    const token = new URL(request.url).searchParams.get("t");
    const booking = await prisma.booking.findUnique({
      where: { bookingRef: decodeURIComponent(bookingRef) },
      select: {
        id: true,
        accessToken: true,
        quote: { select: { sessionId: true } },
      },
    });
    if (!booking) {
      return new NextResponse("Travel document not found", { status: 404 });
    }

    const allowed = await canAccessBooking({
      accessToken: booking.accessToken,
      quoteSessionId: booking.quote?.sessionId,
      providedToken: token,
    });
    if (!allowed) {
      return new NextResponse(
        "Unauthorized — open this document from your confirmation email or booking page.",
        { status: 401 },
      );
    }

    const data = await loadBookingDocumentData(booking.id);
    if (!data) {
      return new NextResponse("Travel document not found", { status: 404 });
    }

    const html = renderTravelDocumentHtml(data);
    try {
      const pdf = await htmlToPdf(html);
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="E-Ticket-Itinerary-${data.bookingRef}.pdf"`,
          "Cache-Control": "private, no-store",
        },
      });
    } catch (pdfError) {
      console.error("eticket pdf failed; serving HTML", pdfError);
      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
        },
      });
    }
  } catch (error) {
    console.error("eticket document failed", error);
    return new NextResponse("Could not render travel document", {
      status: 500,
    });
  }
}
