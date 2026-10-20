import type { Prisma } from "@/generated/prisma/client";
import {
  canIssueCargoConfirmation,
  canonicalNotificationKey,
  type CargoNotificationKind,
} from "@/lib/cargo/lifecycle";
import { prisma } from "@/lib/db";
import { deliverCargoNotification } from "@/lib/email/cargoMail";

type Tx = Prisma.TransactionClient;

export async function enqueueCargoNotification(
  cargoId: string,
  kind: CargoNotificationKind,
  options?: { forceResend?: boolean; tx?: Tx },
) {
  const db = options?.tx ?? prisma;
  const cargo = await db.cargoSubmission.findUnique({
    where: { id: cargoId },
    select: {
      id: true,
      paid: true,
      paymentStatus: true,
      bookingStatus: true,
    },
  });
  if (!cargo) throw new Error("Cargo booking not found");

  if (kind === "confirmation" && !canIssueCargoConfirmation(cargo)) {
    throw new Error(
      "Official confirmation can only be issued after payment is verified",
    );
  }

  if (options?.forceResend) {
    return db.cargoNotification.create({
      data: {
        cargoId,
        kind,
        status: "pending",
        idempotencyKey: `${canonicalNotificationKey(cargoId, kind)}:resend:${Date.now()}`,
      },
    });
  }

  const idempotencyKey = canonicalNotificationKey(cargoId, kind);
  const existing = await db.cargoNotification.findUnique({
    where: { idempotencyKey },
  });
  if (existing) return existing;

  try {
    return await db.cargoNotification.create({
      data: {
        cargoId,
        kind,
        status: "pending",
        idempotencyKey,
      },
    });
  } catch (error) {
    const duplicate =
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002";
    if (!duplicate) throw error;
    const raced = await db.cargoNotification.findUnique({
      where: { idempotencyKey },
    });
    if (raced) return raced;
    throw error;
  }
}

/**
 * Claim and send pending/failed notifications for a parcel.
 * Safe to call after redirects, retries, and page refreshes.
 */
export async function processCargoNotifications(parcelNumber: string) {
  const cargo = await prisma.cargoSubmission.findUnique({
    where: { parcelNumber },
    select: { id: true },
  });
  if (!cargo) return { processed: 0, sent: 0, failed: 0 };

  const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
  await prisma.cargoNotification.updateMany({
    where: {
      cargoId: cargo.id,
      status: "processing",
      updatedAt: { lt: staleBefore },
    },
    data: { status: "pending" },
  });

  const rows = await prisma.cargoNotification.findMany({
    where: {
      cargoId: cargo.id,
      status: { in: ["pending", "failed"] },
    },
    orderBy: { createdAt: "asc" },
  });

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await processCargoNotification(row.id);
    if (result.status === "sent") sent += 1;
    else if (result.status === "failed") failed += 1;
  }

  return { processed: rows.length, sent, failed };
}

export async function processCargoNotification(id: string) {
  const claimed = await prisma.cargoNotification.updateMany({
    where: { id, status: { in: ["pending", "failed"] } },
    data: { status: "processing", attempts: { increment: 1 } },
  });
  if (claimed.count !== 1) {
    const current = await prisma.cargoNotification.findUnique({
      where: { id },
    });
    return { status: current?.status ?? "missing" };
  }

  const row = await prisma.cargoNotification.findUnique({
    where: { id },
    include: {
      cargo: {
        select: {
          parcelNumber: true,
          paid: true,
          paymentStatus: true,
          bookingStatus: true,
        },
      },
    },
  });
  if (!row) return { status: "missing" as const };

  if (
    row.kind === "confirmation" &&
    !canIssueCargoConfirmation(row.cargo)
  ) {
    await prisma.cargoNotification.update({
      where: { id: row.id },
      data: {
        status: "failed",
        lastError:
          "Official confirmation blocked — payment is not verified",
      },
    });
    return { status: "failed" as const };
  }

  try {
    const delivery = await deliverCargoNotification(
      row.cargo.parcelNumber,
      row.kind,
    );
    if (!delivery.ok) {
      await prisma.cargoNotification.update({
        where: { id: row.id },
        data: {
          status: "failed",
          lastError: delivery.error?.slice(0, 500) || "Email could not be sent",
        },
      });
      return { status: "failed" as const };
    }

    const sentAt = new Date();
    await prisma.$transaction([
      prisma.cargoNotification.update({
        where: { id: row.id },
        data: { status: "sent", sentAt, lastError: null },
      }),
      prisma.cargoSubmission.update({
        where: { id: row.cargoId },
        data:
          row.kind === "confirmation"
            ? { confirmationSentAt: sentAt }
            : { invoiceSentAt: sentAt },
      }),
    ]);
    return { status: "sent" as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Notification delivery failed";
    await prisma.cargoNotification.update({
      where: { id: row.id },
      data: { status: "failed", lastError: message.slice(0, 500) },
    });
    return { status: "failed" as const };
  }
}

export async function processCargoLifecycleEvent(
  parcelNumber: string,
  event: "BOOKING_CREATED" | "PAYMENT_VERIFIED" | "NOTIFICATION_FAILED",
  options?: { forceResend?: boolean; cargoId?: string },
) {
  const cargo =
    options?.cargoId
      ? await prisma.cargoSubmission.findUnique({
          where: { id: options.cargoId },
        })
      : await prisma.cargoSubmission.findUnique({
          where: { parcelNumber },
        });
  if (!cargo) {
    return { ok: false as const, error: "Cargo booking not found" };
  }

  try {
    if (event === "BOOKING_CREATED") {
      await enqueueCargoNotification(cargo.id, "acknowledgement", {
        forceResend: options?.forceResend,
      });
    } else if (event === "PAYMENT_VERIFIED") {
      await enqueueCargoNotification(cargo.id, "confirmation", {
        forceResend: options?.forceResend,
      });
    } else {
      await prisma.cargoNotification.updateMany({
        where: {
          cargoId: cargo.id,
          status: "failed",
        },
        data: { status: "pending" },
      });
    }

    const result = await processCargoNotifications(cargo.parcelNumber);
    if (result.failed > 0 && result.sent === 0) {
      const latest = await prisma.cargoNotification.findFirst({
        where: { cargoId: cargo.id, status: "failed" },
        orderBy: { updatedAt: "desc" },
      });
      return {
        ok: false as const,
        error: latest?.lastError || "Email delivery failed",
        ...result,
      };
    }
    return { ok: true as const, ...result };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not queue notification";
    console.error("processCargoLifecycleEvent", { parcelNumber, event, error });
    return { ok: false as const, error: message };
  }
}
