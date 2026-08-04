"use client";

import { useEffect, useState } from "react";

/**
 * Shared checkbox-selection state for an admin list/table. Selection is keyed
 * by row id and automatically drops ids that disappear from the list (e.g.
 * after a delete + reload), so a stale bulk-delete of an already-gone row is
 * never possible.
 */
export function useBulkSelection(ids: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const idsKey = ids.join("|");

  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const idSet = new Set(ids);
      const next = new Set([...prev].filter((id) => idSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // idsKey is a stable stand-in for the ids array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const allSelected = ids.length > 0 && selected.size === ids.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === ids.length && ids.length > 0 ? new Set() : new Set(ids),
    );
  }

  function clear() {
    setSelected(new Set());
  }

  return { selected, toggle, toggleAll, clear, allSelected, someSelected };
}

/** Checkbox for the "select all" header cell — renders an indeterminate dash when partially selected. */
export function SelectAllCheckbox({
  allSelected,
  someSelected,
  onToggle,
  label = "Select all",
  className,
}: {
  allSelected: boolean;
  someSelected: boolean;
  onToggle: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={allSelected}
      ref={(el) => {
        if (el) el.indeterminate = someSelected;
      }}
      onChange={onToggle}
      className={className ?? "size-4 accent-accent-deep"}
    />
  );
}

/** Floating action bar that appears once at least one row is selected. */
export function BulkSelectBar({
  count,
  itemLabel = "item",
  onDelete,
  onClear,
  pending,
}: {
  count: number;
  itemLabel?: string;
  onDelete: () => void;
  onClear: () => void;
  pending?: boolean;
}) {
  if (count === 0) return null;
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border border-accent/40 bg-accent/10 px-4 py-3 text-sm shadow-sm backdrop-blur">
      <p className="font-medium text-accent-deep">
        {count} {itemLabel}
        {count === 1 ? "" : "s"} selected
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onClear}
          disabled={pending}
          className="text-muted transition hover:text-foreground disabled:opacity-60"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="border border-red-300 bg-red-50 px-3 py-1.5 font-semibold text-red-700 transition hover:border-red-400 hover:bg-red-100 disabled:opacity-60"
        >
          {pending ? "Deleting…" : "Delete selected"}
        </button>
      </div>
    </div>
  );
}
