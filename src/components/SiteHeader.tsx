"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";

export function SiteHeader({ cartCount = 0 }: { cartCount?: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onCart = pathname === "/cart";
  const onAdmin = pathname.startsWith("/admin");
  const adminHref = onAdmin
    ? `/admin?${(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (!params.get("tab")) params.set("tab", "analytics");
        return params.toString();
      })()}`
    : "/admin?tab=analytics";

  return (
    <header className="sticky top-0 z-30 border-b border-white/30 bg-[rgba(255,255,255,0.75)] pt-[env(safe-area-inset-top,0px)] shadow-[0_4px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl">
      <div className="h-[3px] w-full bg-[linear-gradient(90deg,#2563EB_0%,#DC2626_100%)]" />
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 font-[family-name:var(--font-syne)] text-base font-semibold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 sm:gap-3 sm:text-lg"
        >
          <BrandLogo size={36} className="size-8 sm:size-9" />
          <span className="truncate">
            {process.env.NEXT_PUBLIC_BRAND_SHORT_NAME || "L&B Global"}
          </span>
        </Link>

        <nav className="flex shrink-0 items-center gap-1 sm:gap-3">
          <Link
            href="/"
            className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
              pathname === "/"
                ? "bg-[linear-gradient(135deg,rgba(37,99,235,0.12),rgba(220,38,38,0.08))] font-semibold text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            Search
          </Link>
          <Link
            href={adminHref}
            className={`btn-secondary inline-flex min-h-11 items-center gap-2 px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
              onAdmin ? "border-accent text-accent-deep" : ""
            }`}
          >
            <SignInIcon />
            Admin
          </Link>
          <Link
            href="/cart"
            aria-label={`Cart${cartCount > 0 ? `, ${cartCount} items` : ", empty"}`}
            className={`relative inline-flex size-11 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
              onCart
                ? "border-accent text-accent shadow-[0_4px_14px_rgba(37,99,235,0.2)]"
                : "border-line text-foreground hover:border-accent hover:text-accent"
            }`}
          >
            <CartIcon />
            {cartCount > 0 ? (
              <span className="badge-promo absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center px-1 text-[10px] font-bold leading-4">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            ) : null}
          </Link>
        </nav>
      </div>
    </header>
  );
}

function SignInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 17l5-5-5-5M15 12H3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 7h14l-1.5 9h-11L7 7Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M7 7 6 3H3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="10" cy="20" r="1.25" fill="currentColor" />
      <circle cx="17" cy="20" r="1.25" fill="currentColor" />
    </svg>
  );
}
