import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";
import { renderCargoDocumentHtml } from "@/lib/documents/cargoDocument";
import { htmlToPdf } from "@/lib/documents/pdf";

export const maxDuration = 30;

function asAnswers(
  value: unknown,
): Record<string, string | number | boolean | string[]> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, string | number | boolean | string[]>;
  }
  return {};
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await isAdminAuthed())) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { id } = await context.params;
    const row = await prisma.cargoSubmission.findUnique({ where: { id } });
    if (!row) {
      return new NextResponse("Cargo submission not found", { status: 404 });
    }

    const data = {
      id: row.id,
      status: row.status,
      submitterName: row.submitterName,
      email: row.email,
      phone: row.phone,
      answers: asAnswers(row.answers),
      notes: row.notes,
      googleResponseId: row.googleResponseId,
      submittedAt: row.submittedAt,
      createdAt: row.createdAt,
    };

    const pdf = await htmlToPdf(renderCargoDocumentHtml(data));
    const ref = row.id.slice(-10).toUpperCase();
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Cargo-${ref}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("cargo document failed", error);
    return new NextResponse("Could not render cargo PDF", { status: 500 });
  }
}
