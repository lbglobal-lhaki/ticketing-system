"use client";

import { useMemo, useState, useTransition } from "react";
import {
  loadDeletedRecordSnapshotAction,
  purgeDeletedRecordAction,
} from "@/lib/actions/deletedRecords";
import {
  BulkSelectBar,
  SelectAllCheckbox,
  useBulkSelection,
} from "@/components/BulkSelectBar";
import { SubmitButton } from "@/components/SubmitButton";
import { ListFilterBar, NoMatches } from "@/components/admin/ListFilterBar";

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
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<Record<string, unknown>>({});
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [snapshotPending, startSnapshotTransition] = useTransition();

  function toggleDetails(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setSnapshotError(null);
      return;
    }
    setExpandedId(id);
    setSnapshotError(null);
    if (snapshots[id] !== undefined) return;
    startSnapshotTransition(async () => {
      const result = await loadDeletedRecordSnapshotAction(id);
      if (!result.ok) {
        setSnapshotError(result.error);
        return;
      }
      setSnapshots((prev) => ({ ...prev, [id]: result.snapshot }));
    });
  }

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

  const visible = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return records.filter((r) => {
      if (miniTab !== "all" && r.entityType !== miniTab) return false;
      if (tokens.length === 0) return true;
      const hay =
        `${r.label} ${r.summary} ${r.deletedBy} ${ENTITY_LABEL[r.entityType]}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [records, miniTab, query]);

  const visibleIds = useMemo(() => visible.map((r) => r.id), [visible]);
  const bulk = useBulkSelection(visibleIds);

  function onBulkPurge() {
    const ids = [...bulk.selected];
    if (ids.length === 0) return;
    if (
      !confirm(
        `Permanently purge ${ids.length} entr${ids.length === 1 ? "y" : "ies"} from the Deleted log? This frees up database storage and cannot be undone — the audit trail for these will be gone for good.`,
      )
    ) {
      return;
    }
    const fd = new FormData();
    for (const id of ids) fd.append("id", id);
    startTransition(() => {
      void purgeDeletedRecordAction(fd);
    });
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="max-w-2xl text-sm text-muted">
          Every flight, booking, invoice, and cargo enquiry deleted from the
          dashboard is logged here with a full snapshot of the record. Use
          &ldquo;Delete forever&rdquo; to purge an entry from this log too —
          that permanently frees up database storage and can&apos;t be
          undone.
        </p>
      </div>

      <BulkSelectBar
        count={bulk.selected.size}
        itemLabel="entry"
        pending={pending}
        onDelete={onBulkPurge}
        onClear={bulk.clear}
      />

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

      <ListFilterBar
        query={query}
        onQueryChange={setQuery}
        placeholder="Search ref, description, who deleted it…"
        resultCount={visible.length}
        totalCount={counts[miniTab]}
        itemLabel="entry"
        itemLabelPlural="entries"
      />

      {visible.length === 0 ? (
        query.trim() ? (
          <NoMatches
            label="No deleted entries match that search."
            onReset={() => setQuery("")}
          />
        ) : (
          <div className="border border-dashed border-line bg-surface/70 px-6 py-14 text-center text-sm text-muted">
            {miniTab === "all"
              ? "Nothing has been deleted yet."
              : `No deleted ${ENTITY_LABEL[miniTab as DeletedEntityType].toLowerCase()}s yet.`}
          </div>
        )
      ) : (
        <>
          <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted">
            <SelectAllCheckbox
              allSelected={bulk.allSelected}
              someSelected={bulk.someSelected}
              onToggle={bulk.toggleAll}
            />
            Select all ({visible.length})
          </label>
          <ul className="divide-y divide-line border-y border-line bg-surface/60">
            {visible.map((record) => {
              const expanded = expandedId === record.id;
              return (
                <li key={record.id} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${record.label}`}
                        checked={bulk.selected.has(record.id)}
                        onChange={() => bulk.toggle(record.id)}
                        className="mt-1.5 size-4 shrink-0 accent-accent-deep"
                      />
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
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">
                      <button
                        type="button"
                        onClick={() => toggleDetails(record.id)}
                        className="tap-target rounded-control border border-line px-3 text-xs font-medium text-muted transition hover:border-accent hover:text-foreground"
                      >
                        {expanded ? "Hide details" : "View details"}
                      </button>
                      <form action={purgeDeletedRecordAction}>
                        <input type="hidden" name="id" value={record.id} />
                        <SubmitButton
                          pendingLabel="Purging…"
                          onClick={(e) => {
                            if (
                              !confirm(
                                `Permanently purge this ${ENTITY_LABEL[record.entityType].toLowerCase()} entry (${record.label}) from the Deleted log? This frees up database storage and cannot be undone.`,
                              )
                            ) {
                              e.preventDefault();
                            }
                          }}
                          className="tap-target rounded-control border border-line px-3 text-xs font-medium text-muted/70 transition hover:border-accent-red/40 hover:text-accent-red disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Delete forever
                        </SubmitButton>
                      </form>
                    </div>
                  </div>

                  {expanded && (
                    <pre className="mt-3 max-h-80 overflow-auto border border-line bg-white p-3 text-xs leading-relaxed text-foreground/80">
                      {snapshotPending && snapshots[record.id] === undefined
                        ? "Loading snapshot…"
                        : snapshotError && snapshots[record.id] === undefined
                          ? snapshotError
                          : JSON.stringify(
                              snapshots[record.id] ?? record.snapshot ?? {},
                              null,
                              2,
                            )}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
