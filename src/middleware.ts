import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "ts_session";

function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const existing = request.cookies.get(SESSION_COOKIE)?.value?.trim();
  const secure = process.env.NODE_ENV === "production";

  // Always mint a real UUID — never keep/share the legacy "anonymous" value.
  if (!existing || existing === "anonymous") {
    response.cookies.set(
      SESSION_COOKIE,
      crypto.randomUUID(),
      sessionCookieOptions(secure),
    );
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$).*)",
  ],
};
