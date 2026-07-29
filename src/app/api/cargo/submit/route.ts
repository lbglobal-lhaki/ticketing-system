import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  cargoSubmitSchema,
  extractCargoContacts,
} from "@/lib/cargo/submit";

function authorize(request: Request): NextResponse | null {
  const secret = process.env.CARGO_FORM_SECRET?.trim();
  const auth = request.headers.get("authorization");
  const isProd = process.env.NODE_ENV === "production";

  if (!secret) {
    if (isProd) {
      return NextResponse.json(
        { error: "CARGO_FORM_SECRET is required in production" },
        { status: 503 },
      );
    }
    return null;
  }

  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = cargoSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const contacts = extractCargoContacts({
    answers: data.answers,
    name: data.name,
    email: data.email || undefined,
    phone: data.phone || undefined,
  });

  let submittedAt: Date | null = null;
  if (data.submittedAt) {
    const d = new Date(data.submittedAt);
    if (!Number.isNaN(d.getTime())) submittedAt = d;
  }

  const answersJson = data.answers as Prisma.InputJsonValue;

  try {
    if (data.googleResponseId) {
      const row = await prisma.cargoSubmission.upsert({
        where: { googleResponseId: data.googleResponseId },
        create: {
          googleResponseId: data.googleResponseId,
          answers: answersJson,
          submitterName: contacts.submitterName,
          email: contacts.email,
          phone: contacts.phone,
          submittedAt,
        },
        update: {
          answers: answersJson,
          submitterName: contacts.submitterName,
          email: contacts.email,
          phone: contacts.phone,
          ...(submittedAt ? { submittedAt } : {}),
        },
        select: { id: true },
      });
      return NextResponse.json({ ok: true, id: row.id });
    }

    const row = await prisma.cargoSubmission.create({
      data: {
        answers: answersJson,
        submitterName: contacts.submitterName,
        email: contacts.email,
        phone: contacts.phone,
        submittedAt,
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, id: row.id });
  } catch (error) {
    console.error("[cargo:submit]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save" },
      { status: 500 },
    );
  }
}
