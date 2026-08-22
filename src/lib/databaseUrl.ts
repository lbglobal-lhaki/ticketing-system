/**
 * Railway exposes DATABASE_URL (private / internal) and DATABASE_PUBLIC_URL
 * (TCP proxy). Vercel can only reach the public URL.
 *
 * Railway's proxy uses a cert chain Node's `pg` (v8.16+) would reject under
 * `sslmode=require`. `uselibpqcompat=true` keeps encrypt-without-verify,
 * which is what that proxy needs.
 */
export function resolveDatabaseUrl() {
  const publicUrl = process.env.DATABASE_PUBLIC_URL?.trim() || "";
  const url = process.env.DATABASE_URL?.trim() || "";
  let chosen = publicUrl || url;
  if (!chosen) return "";
  if (!/[?&]sslmode=/i.test(chosen)) {
    chosen += chosen.includes("?") ? "&sslmode=require" : "?sslmode=require";
  }
  if (!/[?&]uselibpqcompat=/i.test(chosen)) {
    chosen += "&uselibpqcompat=true";
  }
  return chosen;
}

export function databaseHost(connectionString: string) {
  try {
    return new URL(connectionString.replace(/^postgres(ql)?:/i, "https:"))
      .hostname;
  } catch {
    return "";
  }
}
