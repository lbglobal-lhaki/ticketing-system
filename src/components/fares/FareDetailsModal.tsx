"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CrossIcon } from "@/components/fares/FareIcons";
import {
  FARE_DETAIL_TABS,
  fareFooterNotes,
  type FarePermitStatus,
  type FareProduct,
} from "@/lib/fares/products";

type FareDetailsModalProps = {
  product: FareProduct | null;
  open: boolean;
  onClose: () => void;
  supportEmail: string;
};

export function FareDetailsModal({
  product,
  open,
  onClose,
  supportEmail,
}: FareDetailsModalProps) {
  const [tab, setTab] = useState("change_refund");

  useEffect(() => {
    if (open) setTab("change_refund");
  }, [open, product?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !product) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/45 p-0 sm:items-center sm:p-4 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fare-modal-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(92svh,920px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_24px_80px_rgba(15, 23, 42,0.28)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="theme-banner relative shrink-0 px-4 py-5 text-white sm:px-7 sm:py-6">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-full bg-white/15 text-xl transition hover:bg-white/25 sm:right-4 sm:top-4"
          >
            ×
          </button>
          <p
            id="fare-modal-title"
            className="pr-12 font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight sm:text-3xl"
          >
            {product.name}
          </p>
          <p className="mt-1 text-sm text-white/85">
            {product.cabinLabel}
            {product.tagline ? ` · ${product.tagline}` : ""}
          </p>
        </header>

        <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-line px-3 py-3 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden">
          {FARE_DETAIL_TABS.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`shrink-0 rounded-full px-3.5 py-2.5 text-xs font-semibold transition sm:text-sm ${
                  active
                    ? "bg-surface text-accent-deep shadow-sm"
                    : "text-muted hover:bg-background hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          {tab === "change_refund" ? (
            <div className="space-y-0 overflow-hidden rounded-2xl border border-line">
              <PolicySection
                title="Flight and Date Change"
                bullets={product.change.bullets}
                status={product.change}
              />
              <div className="border-t border-line" />
              <PolicySection
                title="Cancellation and Refund"
                bullets={product.refund.bullets}
                status={product.refund}
              />
            </div>
          ) : null}

          {tab === "baggage" ? (
            <BulletCard title="Baggage" bullets={product.baggageBullets} />
          ) : null}
          {tab === "inclusions" ? (
            <BulletCard
              title="Inclusions"
              bullets={[
                `Checked baggage: ${product.highlights.baggage}`,
                `Carry-on (hand luggage): ${product.highlights.cabinBaggage}`,
                `Seat: ${product.highlights.seatSelection}`,
                `Meal: ${product.highlights.meal}`,
                ...product.perkLines,
              ]}
            />
          ) : null}
          {tab === "name_change" ? (
            <BulletCard title="Name Change" bullets={product.nameChangeBullets} />
          ) : null}
          {tab === "no_show" ? (
            <BulletCard title="No Show" bullets={product.noShowBullets} />
          ) : null}
        </div>

        <footer className="shrink-0 border-t border-line bg-surface px-4 py-4 text-xs leading-relaxed text-muted pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          <ul className="list-disc space-y-1.5 pl-4">
            {fareFooterNotes().map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <p className="mt-3 break-words">
            Questions? Call{" "}
            <span className="font-medium text-foreground">+61 2 9000 0000</span>{" "}
            or email{" "}
            <a
              href={`mailto:${supportEmail}`}
              className="break-all font-bold text-accent hover:text-accent-deep"
            >
              {supportEmail}
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}

function PolicySection({
  title,
  bullets,
  status,
}: {
  title: string;
  bullets: string[];
  status: FarePermitStatus;
}) {
  return (
    <div className="grid gap-4 p-4 sm:grid-cols-[1.4fr_1fr] sm:gap-0 sm:p-5">
      <div className="min-w-0 sm:pr-5">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-muted">
          {bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col items-center justify-center border-t border-line pt-4 text-center sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
        {status.permitted ? (
          <CheckIcon className="text-emerald-600" />
        ) : (
          <CrossIcon className="text-red-600" />
        )}
        <p
          className={`mt-2 text-sm font-bold ${
            status.permitted ? "text-emerald-700" : "text-red-700"
          }`}
        >
          {status.permitted ? "Permitted" : "Not Permitted"}
        </p>
        {status.feeLabel ? (
          <p className="mt-1 text-xs font-medium text-muted">{status.feeLabel}</p>
        ) : null}
      </div>
    </div>
  );
}

function BulletCard({ title, bullets }: { title: string; bullets: string[] }) {
  return (
    <div className="rounded-2xl border border-line p-4 sm:p-5">
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-muted">
        {bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
    </div>
  );
}
