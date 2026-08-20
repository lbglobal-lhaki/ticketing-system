"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  type FormEvent,
} from "react";
import type { FormActionResult } from "@/lib/forms/formAction";

export type StickyFormAction = (
  prev: FormActionResult | null,
  formData: FormData,
) => Promise<FormActionResult>;

/**
 * Keep filled-in values when a server action returns a validation error.
 *
 * React 19 resets `<form action>` after the action finishes — even on failure.
 * `preventDefault` + dispatch avoids that reset. Callers still `redirect()` on
 * success, which is the intended navigation.
 */
export function useStickyAction(action: StickyFormAction) {
  const [state, dispatch, pending] = useActionState(action, null);

  useEffect(() => {
    if (!state || state.ok) return;
    const first = Object.keys(state.fieldErrors ?? {})[0];
    requestAnimationFrame(() => {
      const byKey = first
        ? document.querySelector<HTMLElement>(
            `[data-field-key="${CSS.escape(first)}"]`,
          )
        : null;
      const byName = first
        ? document.querySelector<HTMLElement>(
            `[name="${CSS.escape(first)}"]`,
          )
        : null;
      const invalid = document.querySelector<HTMLElement>(
        "[aria-invalid='true']",
      );
      const el = byKey ?? byName ?? invalid;
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      if (el && "focus" in el) el.focus();
    });
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      dispatch(formData);
    });
  }

  const failed = state?.ok === false;

  return {
    state,
    onSubmit,
    pending,
    fieldErrors: failed ? (state.fieldErrors ?? {}) : {},
    formError: failed ? state.error : undefined,
  };
}
