"use client";

import { useRef, useState, type ReactNode } from "react";
import { BookButton } from "@/components/BookButton";
import { FareDetailsModal } from "@/components/fares/FareDetailsModal";
import {
  BaggageIcon,
  CalendarIcon,
  CoinIcon,
  SeatIcon,
} from "@/components/fares/FareIcons";
import type { FareProduct } from "@/lib/fares/products";
import { formatAud } from "@/lib/pricing";

type FareComparisonRowProps = {
  products: FareProduct[];
  flightId: string;
  returnFlightId?: string;
  supportEmail: string;
  disabled?: boolean;
  adults?: number;
  children?: number;
  infants?: number;
  title?: string;
  subtitle?: string;
};

export function FareComparisonRow({
  products,
  flightId,
  returnFlightId,
  supportEmail,
  disabled,
  adults = 1,
  children = 0,
  infants = 0,
  title = "Choose your fare",
  subtitle = "Chartered flight fares for Perth ⇄ Paro — compare rules, then select.",
}: FareComparisonRowProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const activeProduct = products.find((p) => p.id === detailsId) ?? null;

  function scrollBy(dir: -1 | 1) {
    scrollerRef.current?.scrollBy({ left: dir * 280, behavior: "smooth" });
  }

  if (products.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-line bg-white px-5 py-10 text-center">
        <p className="font-semibold">No fare products available</p>
        <p className="mt-1 text-sm text-muted">
          Ask admin to activate charter fares for this cabin.
        </p>
      </section>
    );
  }

  return (
    <section className="relative min-w-0">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-[family-name:var(--font-syne)] text-xl font-semibold tracking-tight sm:text-2xl">
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        <div className="hidden shrink-0 gap-2 md:flex">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label="Previous fare options"
            className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-white text-lg text-muted shadow-sm transition hover:border-accent hover:text-accent"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label="Next fare options"
            className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-white text-lg text-muted shadow-sm transition hover:border-accent hover:text-accent"
          >
            ›
          </button>
        </div>
      </div>

      <div className="relative -mx-4 px-4 sm:mx-0 sm:px-0">
        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-4 [&::-webkit-scrollbar]:hidden"
        >
          {products.map((product) => (
            <FareCard
              key={product.id}
              product={product}
              flightId={flightId}
              returnFlightId={returnFlightId}
              adults={adults}
              children={children}
              infants={infants}
              disabled={disabled || !product.available}
              onMoreDetails={() => setDetailsId(product.id)}
            />
          ))}
        </div>
      </div>

      <div className="mt-2 flex justify-center gap-2 md:hidden">
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="Previous fare options"
          className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-white text-lg text-muted transition hover:border-accent hover:text-accent"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="Next fare options"
          className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-white text-lg text-muted transition hover:border-accent hover:text-accent"
        >
          ›
        </button>
      </div>

      <FareDetailsModal
        open={Boolean(activeProduct)}
        product={activeProduct}
        supportEmail={supportEmail}
        onClose={() => setDetailsId(null)}
      />
    </section>
  );
}

function FareCard({
  product,
  flightId,
  returnFlightId,
  adults,
  children,
  infants,
  disabled,
  onMoreDetails,
}: {
  product: FareProduct;
  flightId: string;
  returnFlightId?: string;
  adults: number;
  children: number;
  infants: number;
  disabled?: boolean;
  onMoreDetails: () => void;
}) {
  const ribbon = product.recommended
    ? "Recommended"
    : product.mostPopular
      ? "Most Popular"
      : null;
  const elevated = Boolean(ribbon);

  return (
    <article
      className={`card-elevated relative flex w-[min(85vw,18rem)] shrink-0 snap-start flex-col rounded-2xl bg-white p-4 sm:w-[18rem] sm:p-5 ${
        elevated
          ? "card-featured border-2 border-accent/40 pt-9 shadow-[0_12px_32px_rgba(37,99,235,0.14)]"
          : "border border-line"
      }`}
    >
      {ribbon ? (
        <div
          className={`absolute inset-x-0 top-0 rounded-t-[14px] px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-white ${
            product.mostPopular ? "badge-promo justify-center" : "badge-info justify-center"
          }`}
          style={{
            backgroundImage: product.mostPopular
              ? "linear-gradient(135deg, #EF4444 0%, #991B1B 100%)"
              : "linear-gradient(135deg, #2563EB 0%, #1E3A8A 100%)",
            borderRadius: "14px 14px 0 0",
          }}
        >
          {ribbon}
        </div>
      ) : null}

      <p className="text-sm font-bold uppercase tracking-[0.14em] text-foreground">
        {product.name}
      </p>
      <p className="mt-1 text-sm text-muted">{product.cabinLabel}</p>
      {product.tagline ? (
        <p className="mt-1 text-xs font-medium text-accent">{product.tagline}</p>
      ) : null}
      <div className="my-4 h-px bg-line" />
      <p className="font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {product.available ? formatAud(product.priceCents) : "TBA"}
      </p>
      {product.notes ? (
        <p className="mt-1 text-xs text-muted">{product.notes}</p>
      ) : null}

      <div className="mt-4">
        {disabled ? (
          <button
            type="button"
            disabled
            className="min-h-11 w-full rounded-full bg-line/70 px-4 py-3 text-sm font-semibold text-muted"
          >
            Unavailable
          </button>
        ) : (
          <BookButton
            flightId={flightId}
            returnFlightId={returnFlightId}
            fareProductId={product.id}
            adults={adults}
            children={children}
            infants={infants}
            label="Select Fares"
            buttonClassName={
              elevated
                ? "btn-cta min-h-11 w-full px-4 py-3 text-sm disabled:cursor-not-allowed"
                : "btn-secondary min-h-11 w-full px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            }
          />
        )}
      </div>

      <ul className="mt-5 space-y-3 text-sm">
        <RuleRow
          icon={<CalendarIcon className="text-accent" />}
          label="Flight/Date Change"
          value={product.highlights.flightChange}
        />
        <RuleRow
          icon={<CoinIcon className="text-accent" />}
          label="Refund"
          value={product.highlights.refund}
        />
        <RuleRow
          icon={<BaggageIcon className="text-accent" />}
          label="Checked Baggage"
          value={product.highlights.baggage}
        />
        <RuleRow
          icon={<BaggageIcon className="text-accent" />}
          label="Cabin Baggage"
          value={product.highlights.cabinBaggage}
        />
        <RuleRow
          icon={<SeatIcon className="text-accent" />}
          label="Seat Selection"
          value={product.highlights.seatSelection}
        />
        <RuleRow
          icon={<MealIcon className="text-accent" />}
          label="Meal"
          value={product.highlights.meal}
        />
      </ul>

      <button
        type="button"
        onClick={onMoreDetails}
        className="mt-5 inline-flex min-h-11 items-center text-left text-sm font-semibold text-accent transition hover:text-accent-deep"
      >
        More Details →
      </button>
    </article>
  );
}

function RuleRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="theme-icon-chip mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted">{label}</span>
        <span className="break-words font-medium text-foreground">{value}</span>
      </span>
    </li>
  );
}

function MealIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M4 3v8a3 3 0 0 0 3 3h1V3M8 14v7M16 3v18M16 3c2.5 0 4 2 4 5s-1.5 5-4 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
