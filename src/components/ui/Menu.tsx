"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/components/ui/cn";

/**
 * Overflow ("…") menu used to demote secondary row actions.
 *
 * Purely presentational: each item renders whatever element the caller passes
 * — a `<form>`, a `<button>` with the original handler, a download `<a>` — so
 * the underlying actions keep their own behaviour. The menu only decides
 * whether they are on screen or one click away.
 */
export function Menu({
  label = "More actions",
  children,
  align = "right",
  className,
}: {
  label?: string;
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    panelRef.current
      ?.querySelector<HTMLElement>(
        'button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])',
      )
      ?.focus();
  }, [open]);

  function onPanelKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]),a[href]',
      ) ?? [],
    );
    if (items.length === 0) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "ArrowDown"
        ? items[(i + 1) % items.length]
        : items[(i - 1 + items.length) % items.length];
    next?.focus();
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "grid size-10 place-items-center rounded-control border border-transparent",
          "text-muted transition-colors hover:bg-line/50 hover:text-foreground",
          "focus-visible:outline-2 focus-visible:outline-offset-2",
          open && "bg-line/50 text-foreground",
        )}
      >
        <span aria-hidden className="text-lg leading-none tracking-widest">
          ⋯
        </span>
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="menu"
          onKeyDown={onPanelKeyDown}
          onClick={() => setOpen(false)}
          className={cn(
            "absolute top-[calc(100%+4px)] z-40 min-w-52 overflow-hidden",
            "rounded-card border border-line bg-surface py-1 shadow-ui-md",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Row inside a Menu. Renders its child as-is so the caller keeps ownership of
 * the action; this only supplies the hover/padding shell.
 */
export function MenuItem({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "danger";
  className?: string;
}) {
  return (
    <div
      role="none"
      className={cn(
        "[&_button]:w-full [&_a]:w-full",
        "[&_button]:flex [&_a]:flex [&_button]:items-center [&_a]:items-center [&_button]:gap-2 [&_a]:gap-2",
        "[&_button]:min-h-10 [&_a]:min-h-10 [&_button]:px-3 [&_a]:px-3 [&_button]:py-2 [&_a]:py-2",
        "[&_button]:text-left [&_a]:text-left [&_button]:text-sm [&_a]:text-sm",
        "[&_button]:transition-colors [&_a]:transition-colors",
        tone === "danger"
          ? "[&_button]:text-accent-red [&_a]:text-accent-red [&_button:hover]:bg-accent-red/8 [&_a:hover]:bg-accent-red/8"
          : "[&_button]:text-foreground [&_a]:text-foreground [&_button:hover]:bg-background [&_a:hover]:bg-background",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MenuDivider() {
  return <div role="none" className="my-1 h-px bg-line" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
      {children}
    </p>
  );
}
