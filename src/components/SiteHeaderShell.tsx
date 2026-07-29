import { Suspense } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { getCartCount } from "@/lib/cart";

function HeaderFallback({ cartCount }: { cartCount: number }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/30 bg-[rgba(255,255,255,0.75)] pt-[env(safe-area-inset-top,0px)] shadow-[0_4px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl">
      <div className="h-[3px] w-full bg-[linear-gradient(90deg,#2563EB_0%,#DC2626_100%)]" />
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <span className="font-[family-name:var(--font-syne)] text-base font-semibold tracking-tight text-foreground">
          {process.env.NEXT_PUBLIC_BRAND_SHORT_NAME || "L&B Global"}
        </span>
        <span className="text-sm text-muted">
          {cartCount > 0 ? `Cart · ${cartCount}` : " "}
        </span>
      </div>
    </header>
  );
}

export async function SiteHeaderShell() {
  let cartCount = 0;
  try {
    cartCount = await getCartCount();
  } catch (err) {
    console.error("getCartCount failed", err);
  }
  return (
    <Suspense fallback={<HeaderFallback cartCount={cartCount} />}>
      <SiteHeader cartCount={cartCount} />
    </Suspense>
  );
}
