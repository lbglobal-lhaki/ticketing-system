import Link from "next/link";
import { FieldError } from "@/components/forms/FieldError";
import { CargoTermsText } from "@/components/cargo/CargoTermsText";
import { CARGO_TERMS_PDF_HREF } from "@/lib/cargo/termsContent";

export function CargoTermsAcceptance({
  error,
  checkboxClass,
}: {
  error?: string;
  checkboxClass: string;
}) {
  return (
    <div className="sm:col-span-2">
      <div className="overflow-hidden rounded-xl border border-line">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-background px-3.5 py-2.5">
          <p className="text-sm font-semibold text-foreground">
            Cargo Customer Terms &amp; Conditions
          </p>
          <div className="flex flex-wrap gap-x-3 text-xs font-medium">
            <Link
              href="/cargo/terms"
              target="_blank"
              rel="noreferrer"
              className="text-accent underline-offset-2 hover:underline"
            >
              Open full page
            </Link>
            <a
              href={CARGO_TERMS_PDF_HREF}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline-offset-2 hover:underline"
            >
              Download PDF
            </a>
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto bg-white px-3.5 py-3 text-[13px] leading-relaxed text-foreground">
          <CargoTermsText className="cargo-terms-embed [&_h3]:mt-4 [&_h3]:font-semibold [&_h3]:text-accent-deep [&_p]:mt-2 [&_p:first-child]:mt-0 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5" />
        </div>
      </div>
      <label className="mt-3 flex items-start gap-3 rounded-lg border border-line px-3.5 py-3 text-sm text-foreground">
        <input
          type="checkbox"
          name="termsAccepted"
          required
          data-field-key="termsAccepted"
          aria-invalid={error ? true : undefined}
          className={checkboxClass}
        />
        <span>
          I have read and accept the Cargo Customer Terms &amp; Conditions and
          confirm the details above are correct.
          <span className="text-accent-red"> *</span>
        </span>
      </label>
      <FieldError error={error} />
    </div>
  );
}
