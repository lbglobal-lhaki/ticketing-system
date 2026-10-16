import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const ADMIN_COOKIE = "ts_admin";

export type AdminRole = "admin" | "sub_admin";

export type AdminTab =
  | "analytics"
  | "flights"
  | "form"
  | "bookings"
  | "invoices"
  | "cargo"
  | "settings"
  | "deleted";

export const SUB_ADMIN_TABS: readonly AdminTab[] = [
  "bookings",
  "invoices",
  "cargo",
  "deleted",
];

const ALL_TABS: readonly AdminTab[] = [
  "analytics",
  "flights",
  "form",
  "bookings",
  "invoices",
  "cargo",
  "settings",
  "deleted",
];

function adminSecret() {
  return process.env.ADMIN_PASSWORD?.trim() || "";
}

function subAdminSecret() {
  return process.env.SUB_ADMIN_PASSWORD?.trim() || "";
}

function hmacHex(secret: string, value: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function signaturesMatch(a: string, b: string) {
  try {
    const left = Buffer.from(a, "utf8");
    const right = Buffer.from(b, "utf8");
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export function isSubAdminPasswordConfigured() {
  const sub = subAdminSecret();
  const admin = adminSecret();
  return Boolean(sub) && sub !== admin;
}

export function canAccessAdminTab(role: AdminRole, tab: AdminTab) {
  if (role === "admin") return true;
  return (SUB_ADMIN_TABS as readonly string[]).includes(tab);
}

export function homeTabForRole(role: AdminRole): AdminTab {
  return role === "admin" ? "flights" : "bookings";
}

export function tabsForRole(role: AdminRole): readonly AdminTab[] {
  return role === "admin" ? ALL_TABS : SUB_ADMIN_TABS;
}

/** Signed opaque session: token.role.hmac — never stores the password. */
export function createAdminSessionCookie(role: AdminRole = "admin"): string {
  const secret = role === "admin" ? adminSecret() : subAdminSecret();
  if (!secret) {
    throw new Error(
      role === "admin"
        ? "ADMIN_PASSWORD is not configured"
        : "SUB_ADMIN_PASSWORD is not configured",
    );
  }
  const token = randomBytes(32).toString("hex");
  const payload = `${token}.${role}`;
  const sig = hmacHex(secret, payload);
  return `${payload}.${sig}`;
}

export function readAdminSessionCookie(
  value: string | undefined,
): AdminRole | null {
  if (!value) return null;
  const parts = value.split(".");

  // Legacy cookie: token.sig, signed with ADMIN_PASSWORD only.
  if (parts.length === 2) {
    const [token, sig] = parts;
    const secret = adminSecret();
    if (!token || !sig || !secret) return null;
    if (signaturesMatch(sig, hmacHex(secret, token))) return "admin";
    return null;
  }

  if (parts.length !== 3) return null;
  const [token, role, sig] = parts;
  if (!token || !sig || (role !== "admin" && role !== "sub_admin")) return null;
  const secret = role === "admin" ? adminSecret() : subAdminSecret();
  if (!secret) return null;
  if (!signaturesMatch(sig, hmacHex(secret, `${token}.${role}`))) return null;
  if (role === "sub_admin" && !isSubAdminPasswordConfigured()) return null;
  return role;
}

export function verifyAdminSessionCookie(value: string | undefined): boolean {
  return readAdminSessionCookie(value) !== null;
}

export async function getAdminSession(): Promise<{ role: AdminRole } | null> {
  const jar = await cookies();
  const role = readAdminSessionCookie(jar.get(ADMIN_COOKIE)?.value);
  return role ? { role } : null;
}

export async function isAdminAuthed() {
  return (await getAdminSession()) !== null;
}

export async function requireAdmin() {
  if (!(await isAdminAuthed())) {
    redirect("/admin?error=Unauthorized");
  }
}

/** Flights, Add/Edit, Analytics, and Pricing — full admin login only. */
export async function requireFullAdmin() {
  const session = await getAdminSession();
  if (!session) redirect("/admin?error=Unauthorized");
  if (session.role !== "admin") {
    redirect(
      `/admin?tab=bookings&error=${encodeURIComponent(
        "That section is only available on the full admin login.",
      )}`,
    );
  }
}

export async function setAdminSessionCookie(role: AdminRole = "admin") {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, createAdminSessionCookie(role), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearAdminSessionCookie() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}
