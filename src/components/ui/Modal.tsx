"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { IconButton } from "@/components/ui/Button";
import { XIcon } from "@/components/ui/icons";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export type ModalProps = {
  open?: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Rendered in the sticky footer, right-aligned. */
  footer?: ReactNode;
  children: ReactNode;
  size?: "md" | "lg" | "xl";
  /** Set false where the existing dialog did not close on backdrop click. */
  closeOnOverlayClick?: boolean;
  className?: string;
};

const SIZES = {
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-6xl",
};

/**
 * Dialog shell with a real focus trap.
 *
 * The dashboard's existing modals set `role="dialog"` + `aria-modal` but never
 * trapped focus, so Tab walked out into the page behind the overlay. This keeps
 * Tab/Shift+Tab inside, moves focus in on open, restores it on close, and
 * closes on Escape.
 */
export function Modal({
  open = true,
  onClose,
  title,
  description,
  footer,
  children,
  size = "lg",
  closeOnOverlayClick = true,
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = panel?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const list = Array.from(nodes).filter((n) => n.offsetParent !== null);
      if (list.length === 0) return;
      const firstEl = list[0]!;
      const lastEl = list[list.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={closeOnOverlayClick ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex max-h-[min(94svh,52rem)] w-full flex-col overflow-hidden",
          "rounded-t-modal border border-line bg-surface shadow-ui-lg sm:rounded-modal",
          SIZES[size],
          className,
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-foreground">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-sm text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton
            label="Close"
            icon={<XIcon className="size-4" />}
            onClick={onClose}
          />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer ? (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-background/60 px-5 py-3.5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
