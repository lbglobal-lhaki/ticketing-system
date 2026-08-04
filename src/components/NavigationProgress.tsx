"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Slim progress bar fixed to the top of the viewport that runs on every
 * client-side navigation across the whole site — clicking any internal
 * link, browser back/forward, or a server action's redirect. This is the
 * one loading cue that's always present regardless of whether the
 * destination route has its own `loading.tsx`, so the app never looks
 * frozen while a page is switching.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPathnameRef = useRef(pathname);

  useEffect(() => {
    function clearTimers() {
      if (trickleRef.current) clearInterval(trickleRef.current);
      if (hideRef.current) clearTimeout(hideRef.current);
      if (safetyRef.current) clearTimeout(safetyRef.current);
    }

    function start() {
      clearTimers();
      setVisible(true);
      setProgress(15);
      trickleRef.current = setInterval(() => {
        setProgress((p) => (p >= 90 ? p : p + Math.max(1, (92 - p) / 10)));
      }, 200);
      // Belt-and-braces: if a click ends up not triggering a real route
      // change (e.g. a link whose own handler cancels navigation), don't
      // leave the bar stuck forever.
      safetyRef.current = setTimeout(() => {
        if (trickleRef.current) clearInterval(trickleRef.current);
        setVisible(false);
        setProgress(0);
      }, 8000);
    }

    function isNavigableAnchor(el: HTMLAnchorElement) {
      if (!el.href) return false;
      if (el.target && el.target !== "_self") return false;
      if (el.hasAttribute("download")) return false;
      const rawHref = el.getAttribute("href") || "";
      if (rawHref.startsWith("#") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) {
        return false;
      }
      let url: URL;
      try {
        url = new URL(el.href, window.location.href);
      } catch {
        return false;
      }
      if (url.origin !== window.location.origin) return false;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return false;
      }
      return true;
    }

    function onClick(e: MouseEvent) {
      // Note: don't gate on `e.defaultPrevented` — next/link always calls
      // preventDefault() to do its own client-side routing, and (because
      // its handler is attached closer to the target) it runs before this
      // document-level listener sees the bubbling event.
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!isNavigableAnchor(anchor)) return;
      start();
    }

    function onPopState() {
      start();
    }

    document.addEventListener("click", onClick);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPopState);
      clearTimers();
    };
  }, []);

  // The pathname only actually changes once the new route has taken over,
  // which is our signal that the navigation finished.
  useEffect(() => {
    if (prevPathnameRef.current === pathname) return;
    prevPathnameRef.current = pathname;
    if (trickleRef.current) clearInterval(trickleRef.current);
    if (safetyRef.current) clearTimeout(safetyRef.current);
    setProgress(100);
    hideRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 200);
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[3px] bg-transparent"
    >
      <div
        className="h-full bg-accent shadow-[0_0_8px_var(--accent)] transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
