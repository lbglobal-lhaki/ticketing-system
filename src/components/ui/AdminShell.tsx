"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { CountBadge } from "@/components/ui/Badge";
import { XIcon } from "@/components/ui/icons";

/*
 * Sidebar + content shell for the admin console.
 *
 * Presentation only. It receives the same nav items the tab strip rendered and
 * calls the same `onSelect` the tab buttons called, so routing, the `?tab=`
 * contract and the "Add flight resets the form" behaviour all stay where they
 * were — in AdminDashboard.
 */

export type NavItem = {
  id: string;
  label: string;
  /** Small trailing counter, e.g. unpaid invoices. */
  count?: number;
};

export type NavGroup = {
  /** Muted heading above the group; omit for an ungrouped block. */
  label?: string;
  items: NavItem[];
};

export function AdminShell({
  groups,
  activeId,
  onSelect,
  title,
  description,
  actions,
  children,
}: {
  groups: NavGroup[];
  activeId: string;
  onSelect: (id: string) => void;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const nav = (
    <nav aria-label="Admin sections" className="space-y-6">
      {groups.map((group, gi) => (
        <div key={group.label ?? `group-${gi}`}>
          {group.label ? (
            <p className="px-3 pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
              {group.label}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.id === activeId;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      // Choosing a destination dismisses the mobile drawer.
                      setDrawerOpen(false);
                      onSelect(item.id);
                    }}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-10 w-full items-center justify-between gap-2 rounded-control px-3 py-2",
                      "text-sm transition-colors",
                      "focus-visible:outline-2 focus-visible:outline-offset-2",
                      active
                        ? "font-semibold text-white shadow-[0_2px_8px_rgba(37,99,235,0.25)] [background-image:var(--grad-badge-info)]"
                        : "text-muted hover:bg-accent/8 hover:text-accent",
                    )}
                  >
                    <span className="truncate">{item.label}</span>
                    {item.count ? <CountBadge count={item.count} /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="mx-auto w-full max-w-[100rem] px-4 py-6 sm:px-6 lg:px-8">
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
        {/* Desktop rail */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-card border border-line bg-surface/80 p-3 shadow-ui-sm backdrop-blur-sm">
            {nav}
          </div>
        </aside>

        {/* Mobile drawer */}
        {drawerOpen ? (
          <div
            className="fixed inset-0 z-50 bg-foreground/40 lg:hidden"
            onClick={() => setDrawerOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Admin sections"
              onClick={(e) => e.stopPropagation()}
              className="h-full w-72 max-w-[85vw] overflow-y-auto border-r border-line bg-surface p-4 shadow-ui-lg"
            >
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold">Sections</p>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setDrawerOpen(false)}
                  className="grid size-10 place-items-center rounded-control text-muted hover:bg-line/50 hover:text-foreground"
                >
                  <XIcon className="size-4" />
                </button>
              </div>
              {nav}
            </div>
          </div>
        ) : null}

        <div className="min-w-0">
          <header className="flex flex-wrap items-start justify-between gap-4 pb-6">
            <div className="flex min-w-0 items-start gap-3">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open sections menu"
                aria-expanded={drawerOpen}
                className="grid size-10 shrink-0 place-items-center rounded-control border border-line text-muted transition-colors hover:text-foreground lg:hidden"
              >
                <span aria-hidden className="space-y-[3px]">
                  <span className="block h-px w-4 bg-current" />
                  <span className="block h-px w-4 bg-current" />
                  <span className="block h-px w-4 bg-current" />
                </span>
              </button>
              <div className="min-w-0">
                <h1 className="heading-gradient font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight">
                  {title}
                </h1>
                {description ? (
                  <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
                ) : null}
              </div>
            </div>
            {actions ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {actions}
              </div>
            ) : null}
          </header>

          <div className="min-w-0 pb-16">{children}</div>
        </div>
      </div>
    </div>
  );
}
