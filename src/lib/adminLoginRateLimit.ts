import { createHash } from "crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 60 * 1000;

function hashIp(ip: string) {
  return createHash("sha256").update(`admin-login:${ip}`).digest("hex");
}

export async function getAdminLoginClientIp() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = h.get("x-real-ip")?.trim();
  return forwarded || realIp || "unknown";
}

export async function getAdminLoginThrottle(ip: string): Promise<
  | { ok: true }
  | { ok: false; retryAfterSec: number; message: string }
> {
  const key = hashIp(ip);
  const row = await prisma.adminLoginGuard.findUnique({ where: { key } });
  if (!row) return { ok: true };

  const now = Date.now();
  if (row.lockedUntil && row.lockedUntil.getTime() > now) {
    const retryAfterSec = Math.ceil((row.lockedUntil.getTime() - now) / 1000);
    return {
      ok: false,
      retryAfterSec,
      message: `Too many failed login attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`,
    };
  }

  return { ok: true };
}

export async function recordAdminLoginFailure(ip: string) {
  const key = hashIp(ip);
  const now = new Date();
  const existing = await prisma.adminLoginGuard.findUnique({ where: { key } });

  if (!existing) {
    await prisma.adminLoginGuard.create({
      data: {
        key,
        failedCount: 1,
        windowStartedAt: now,
        lockedUntil: null,
      },
    });
    return;
  }

  const windowExpired =
    now.getTime() - existing.windowStartedAt.getTime() > WINDOW_MS;
  const failedCount = windowExpired ? 1 : existing.failedCount + 1;
  const lock =
    failedCount >= MAX_ATTEMPTS
      ? new Date(now.getTime() + LOCKOUT_MS)
      : existing.lockedUntil && existing.lockedUntil.getTime() > now.getTime()
        ? existing.lockedUntil
        : null;

  await prisma.adminLoginGuard.update({
    where: { key },
    data: {
      failedCount,
      windowStartedAt: windowExpired ? now : existing.windowStartedAt,
      lockedUntil: lock,
    },
  });
}

export async function clearAdminLoginFailures(ip: string) {
  const key = hashIp(ip);
  await prisma.adminLoginGuard.deleteMany({ where: { key } });
}
