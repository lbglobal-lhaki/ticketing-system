import type { Metadata } from "next";
import Link from "next/link";
import { ServiceTabs } from "@/components/ServiceTabs";
import { CargoTermsText } from "@/components/cargo/CargoTermsText";
import { CARGO_TERMS_PDF_HREF } from "@/lib/cargo/termsContent";

export const metadata: Metadata = {
  title: "Cargo customer terms & conditions",
  description:
    "Terms and conditions for L&B Global and Drukair cargo between Paro and Perth.",
};

export default function CargoTermsPage() {
  return (
    <>
      <ServiceTabs active="cargo" />
      <main className="page-shell bg-background pb-safe">
        <section className="theme-banner">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
              Air cargo
            </p>
            <h1 className="mt-3 max-w-3xl font-[family-name:var(--font-syne)] text-3xl font-bold tracking-tight text-white sm:text-5xl">
              Cargo Customer Terms &amp; Conditions
            </h1>
            <p className="mt-4 max-w-2xl text-sm text-white/85 sm:text-base">
              These terms apply to every cargo booking with L&amp;B Global and
              Drukair between Paro and Perth. Read them before you book.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={CARGO_TERMS_PDF_HREF}
                target="_blank"
                rel="noreferrer"
                className="btn-cta inline-flex min-h-11 items-center px-5 text-sm"
              >
                Download PDF
              </a>
              <Link
                href="/cargo"
                className="btn-secondary inline-flex min-h-11 items-center px-5 text-sm"
              >
                Back to cargo booking
              </Link>
            </div>
          </div>
        </section>

        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
          <article className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.06)] sm:p-8">
            <CargoTermsText className="text-sm leading-relaxed text-foreground [&_h3]:mt-6 [&_h3]:font-[family-name:var(--font-syne)] [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-accent-deep [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5" />
          </article>
        </div>
      </main>
    </>
  );
}
