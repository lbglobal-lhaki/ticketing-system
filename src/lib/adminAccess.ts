/**
 * Role / tab helpers that are safe to import from client components.
 * Cookie signing and `next/headers` live in `@/lib/adminAuth` (server only).
 */

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
