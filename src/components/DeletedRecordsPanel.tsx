"use client";

import { useMemo, useState } from "react";

export type DeletedEntityType = "flight" | "booking" | "invoice" | "cargo";

export type AdminDeletedRecordRow = {
  id: string;
  entityType: DeletedEntityType;
  entityId: string;
  label: string;
  summary: string;
  deletedAt: string;
  deletedBy: string;
  snapshot: unknown;
};

type MiniTab = "all" | DeletedEntityType;

const MINI_TABS: { id: MiniTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "flight", label: "Flights" },
  { id: "booking", label: "Bookings" },
  { id: "invoice", label: "Invoices" },
  { id: "cargo", label: "Cargo" },
];

const ENTITY_LABEL: Record<DeletedEntityType, string> = {
  flight: "Flight",
  booking: "Booking",
  invoice: "Invoice",
  cargo: "Cargo",
};

const ENTITY_BADGE_CLASS: Record<DeletedEntityType, string> = {
  flight: "bg-sky-100 text-sky-800",
  booking: "bg-violet-100 text-violet-800",
  invoice: "bg-amber-100 text-amber-800",
  cargo: "bg-emerald-100 text-emerald-800",
};

function fmt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DeletedRecordsPanel({
  records,
}: {
  records: AdminDeletedRecordRow[];
}) {
  const [miniTab, setMiniTab] = useState<MiniTab>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<MiniTab, number> = {
      all: records.length,
      flight: 0,
      booking: 0,
      invoice: 0,
      cargo: 0,
    };
    for (const r of records) c[r.entityType]++;
    return c;
  }, [records]);

  const visible = useMemo(
    () =>
      miniTab === "all"
        ? records
        : records.filter((r) => r.entityType === miniTab),
    [records, miniTab],
  );

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight">
          Deleted
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Every flight, booking, invoice, and cargo enquiry deleted from the
          dashboard is logged here with a full snapshot of the record — the
          delete itself is permanent, but the trail isn&apos;t.
        </p>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-line">
        {MINI_TABS.map((item) => {
          const active = miniTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setMiniTab(item.id)}
              className={`relative px-3.5 py-2.5 text-sm font-medium transition ${
                active ? "text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {item.label}
              <span className="ml-1.5 text-xs text-muted">
                {counts[item.id]}
              </span>
              {active && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 bg-accent" />
              )}
            </button>
          );
        })}
      </nav>

      {visible.length === 0 ? (
        <div className="border border-dashed border-line bg-surface/70 px-6 py-14 text-center text-sm text-muted">
          {miniTab === "all"
            ? "Nothing has been deleted yet."
            : `No deleted ${ENTITY_LABEL[miniTab as DeletedEntityType].toLowerCase()}s yet.`}
        </div>
      ) : (
        <ul className="divide-y divide-line border-y border-line bg-surface/60">
          {visible.map((record) => {
            const expanded = expandedId === record.id;
            return (
              <li key={record.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={`px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.08em] ${ENTITY_BADGE_CLASS[record.entityType]}`}
                      >
                        {ENTITY_LABEL[record.entityType]}
                      </span>
                      <p className="font-[family-name:var(--font-syne)] text-base font-semibold tracking-tight">
                        {record.label}
                      </p>
                    </div>
                    {record.summary && (
                      <p className="text-sm text-muted">{record.summary}</p>
                    )}
                    <p className="text-xs text-muted">
                      Deleted {fmt(record.deletedAt)} · by {record.deletedBy}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId(expanded ? null : record.id)
                    }
                    className="shrink-0 self-start border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent hover:text-foreground"
                  >
                    {expanded ? "Hide details" : "View details"}
                  </button>
                </div>

                {expanded && (
                  <pre className="mt-3 max-h-80 overflow-auto border border-line bg-white p-3 text-xs leading-relaxed text-foreground/80">
                    {JSON.stringify(record.snapshot, null, 2)}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
