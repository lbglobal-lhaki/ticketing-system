"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  deleteCargoEmailNoticeAction,
  generateCargoEmailNoticesAction,
  listCargoEmailNoticesAction,
  sendCargoEmailNoticeAction,
  updateCargoEmailNoticeAction,
  type AdminCargoEmailNotice,
} from "@/lib/actions/cargoEmail";
import { Spinner } from "@/components/Spinner";

const fieldClass =
  "w-full min-w-0 border-0 border-b border-line bg-transparent py-2 text-sm text-foreground outline-none transition focus:border-accent";

const btnClass =
  "inline-flex items-center justify-center rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent disabled:opacity-60";

function roleLabel(role: AdminCargoEmailNotice["role"]) {
  return role === "sender" ? "Sender" : "Receiver";
}

export function CargoEmailNotices({
  cargoId,
  parcelNumber,
}: {
  cargoId: string;
  parcelNumber?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [notices, setNotices] = useState<AdminCargoEmailNotice[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pickupLocation, setPickupLocation] = useState("");
  const [arrivalNote, setArrivalNote] = useState("");
  const [draft, setDraft] = useState({
    toEmail: "",
    toName: "",
    subject: "",
    bodyHtml: "",
    bodyText: "",
    pickupLocation: "",
    arrivalNote: "",
  });
  const [previewBust, setPreviewBust] = useState(0);
  // Which specific action is running — shows a spinner + label on just that
  // button while every button stays disabled (via `pending`) to block races.
  const [pendingAction, setPendingAction] = useState<
    | "generate-sender"
    | "generate-receiver"
    | "generate-both"
    | "save"
    | "send"
    | "delete"
    | null
  >(null);

  const active = useMemo(
    () => notices.find((n) => n.id === activeId) ?? null,
    [notices, activeId],
  );

  function loadNotices(preferId?: string) {
    startTransition(async () => {
      try {
        const rows = await listCargoEmailNoticesAction(cargoId);
        setNotices(rows);
        if (preferId && rows.some((r) => r.id === preferId)) {
          setActiveId(preferId);
        } else if (activeId && rows.some((r) => r.id === activeId)) {
          // keep selection
        } else {
          setActiveId(rows[0]?.id ?? null);
        }
      } catch (error) {
        setErrorMsg(
          error instanceof Error ? error.message : "Could not load email notices",
        );
      }
    });
  }

  useEffect(() => {
    setNotices([]);
    setActiveId(null);
    setStatusMsg(null);
    setErrorMsg(null);
    loadNotices();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when cargo changes
  }, [cargoId]);

  useEffect(() => {
    if (!active) return;
    setDraft({
      toEmail: active.toEmail,
      toName: active.toName,
      subject: active.subject,
      bodyHtml: active.bodyHtml,
      bodyText: active.bodyText,
      pickupLocation: active.pickupLocation,
      arrivalNote: active.arrivalNote,
    });
    setPreviewBust(Date.now());
  }, [active]);

  function onGenerate(roles: Array<"sender" | "receiver">) {
    setStatusMsg(null);
    setErrorMsg(null);
    setPendingAction(
      roles.length === 2
        ? "generate-both"
        : roles[0] === "sender"
          ? "generate-sender"
          : "generate-receiver",
    );
    startTransition(async () => {
      const result = await generateCargoEmailNoticesAction({
        cargoId,
        roles,
        pickupLocation,
        arrivalNote,
        overwriteDrafts: true,
      });
      setPendingAction(null);
      if (!result.ok) {
        setErrorMsg(result.error);
        return;
      }
      setNotices((prev) => {
        const others = prev.filter(
          (n) => !result.notices.some((r) => r.id === n.id),
        );
        // Replace any draft for same role that was overwritten, keep sent history.
        const withoutOldDrafts = others.filter((n) => {
          if (n.status !== "draft") return true;
          return !result.notices.some((r) => r.role === n.role);
        });
        return [...result.notices, ...withoutOldDrafts].sort((a, b) =>
          a.createdAt < b.createdAt ? 1 : -1,
        );
      });
      setActiveId(result.notices[0]?.id ?? null);
      setStatusMsg(
        result.warning
          ? `Drafts ready. ${result.warning}`
          : `Generated ${result.notices.length} email draft(s). Review, edit, then send.`,
      );
      loadNotices(result.notices[0]?.id);
    });
  }

  function onSave() {
    if (!active) return;
    setStatusMsg(null);
    setErrorMsg(null);
    setPendingAction("save");
    startTransition(async () => {
      const result = await updateCargoEmailNoticeAction({
        id: active.id,
        ...draft,
      });
      setPendingAction(null);
      if (!result.ok) {
        setErrorMsg(result.error);
        return;
      }
      setNotices((prev) =>
        prev.map((n) => (n.id === result.notice.id ? result.notice : n)),
      );
      setStatusMsg("Draft saved — preview updated.");
      setPreviewBust(Date.now());
    });
  }

  function onSend() {
    if (!active) return;
    if (
      !confirm(
        `Send this ${roleLabel(active.role).toLowerCase()} email to ${draft.toEmail || active.toEmail}?`,
      )
    ) {
      return;
    }
    setStatusMsg(null);
    setErrorMsg(null);
    setPendingAction("send");
    startTransition(async () => {
      // Save latest edits before send.
      const saved = await updateCargoEmailNoticeAction({
        id: active.id,
        ...draft,
      });
      if (!saved.ok) {
        setPendingAction(null);
        setErrorMsg(saved.error);
        return;
      }
      const result = await sendCargoEmailNoticeAction(active.id);
      setPendingAction(null);
      if (!result.ok) {
        setErrorMsg(result.error);
        return;
      }
      setNotices((prev) =>
        prev.map((n) => (n.id === result.notice.id ? result.notice : n)),
      );
      setStatusMsg(
        result.warning
          ? result.warning
          : `Email sent to ${result.notice.toEmail}.`,
      );
    });
  }

  function onDelete(id: string) {
    if (!confirm("Delete this email notice?")) return;
    setStatusMsg(null);
    setErrorMsg(null);
    setPendingAction("delete");
    startTransition(async () => {
      const result = await deleteCargoEmailNoticeAction(id);
      setPendingAction(null);
      if (!result.ok) {
        setErrorMsg(result.error);
        return;
      }
      setNotices((prev) => prev.filter((n) => n.id !== id));
      if (activeId === id) setActiveId(null);
      setStatusMsg("Email notice deleted.");
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h4 className="font-[family-name:var(--font-syne)] text-lg font-semibold">
          Email notifications
          {parcelNumber ? (
            <span className="ml-2 font-mono text-base font-semibold tracking-wide text-accent-deep">
              {parcelNumber}
            </span>
          ) : null}
        </h4>
        <p className="mt-1 text-sm text-muted">
          Generate drafts for sender and receiver, edit, preview, then send.
          Nothing is emailed automatically.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
            Pickup location (for drafts)
          </span>
          <input
            value={pickupLocation}
            onChange={(e) => setPickupLocation(e.target.value)}
            placeholder="e.g. Paro Airport cargo counter"
            className={fieldClass}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
            Arrival / ready note
          </span>
          <input
            value={arrivalNote}
            onChange={(e) => setArrivalNote(e.target.value)}
            placeholder="e.g. Ready for pickup from 12 Aug"
            className={fieldClass}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-cta rounded-xl px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
          onClick={() => onGenerate(["sender", "receiver"])}
        >
          {pendingAction === "generate-both" ? (
            <span className="inline-flex items-center gap-1.5">
              <Spinner className="size-3.5" />
              Generating…
            </span>
          ) : (
            "Generate both drafts"
          )}
        </button>
        <button
          type="button"
          className={btnClass}
          disabled={pending}
          onClick={() => onGenerate(["sender"])}
        >
          {pendingAction === "generate-sender" ? (
            <span className="inline-flex items-center gap-1.5">
              <Spinner className="size-3.5" />
              Generating…
            </span>
          ) : (
            "Generate sender"
          )}
        </button>
        <button
          type="button"
          className={btnClass}
          disabled={pending}
          onClick={() => onGenerate(["receiver"])}
        >
          {pendingAction === "generate-receiver" ? (
            <span className="inline-flex items-center gap-1.5">
              <Spinner className="size-3.5" />
              Generating…
            </span>
          ) : (
            "Generate receiver"
          )}
        </button>
      </div>

      {statusMsg && (
        <p className="border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent-deep">
          {statusMsg}
        </p>
      )}
      {errorMsg && (
        <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMsg}
        </p>
      )}

      {notices.length === 0 ? (
        <p className="border border-dashed border-line bg-white/60 px-3 py-4 text-sm text-muted">
          No email drafts yet. Set pickup/arrival notes above, then generate.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
          <ul className="space-y-2">
            {notices.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(n.id)}
                  className={`w-full border px-3 py-2 text-left text-sm transition ${
                    activeId === n.id
                      ? "border-accent bg-accent/5"
                      : "border-line bg-white hover:border-accent"
                  }`}
                >
                  <span className="font-semibold">{roleLabel(n.role)}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {n.status === "sent" ? "Sent" : "Draft"} · {n.toEmail || "—"}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {active && (
            <div className="space-y-3 border border-line bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                  {roleLabel(active.role)} · {active.status}
                  {active.sentAt
                    ? ` · ${new Date(active.sentAt).toLocaleString("en-AU")}`
                    : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`${btnClass} disabled:cursor-not-allowed`}
                    disabled={pending}
                    onClick={onSave}
                  >
                    {pendingAction === "save" ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Spinner className="size-3.5" />
                        Saving…
                      </span>
                    ) : (
                      "Save"
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn-cta rounded-lg px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={pending}
                    onClick={onSend}
                  >
                    {pendingAction === "send" ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Spinner className="size-3.5" />
                        Sending…
                      </span>
                    ) : active.status === "sent" ? (
                      "Resend"
                    ) : (
                      "Send email"
                    )}
                  </button>
                  <button
                    type="button"
                    className={`${btnClass} border-red-200 text-red-700 disabled:cursor-not-allowed`}
                    disabled={pending}
                    onClick={() => onDelete(active.id)}
                  >
                    {pendingAction === "delete" ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Spinner className="size-3.5" />
                        Deleting…
                      </span>
                    ) : (
                      "Delete"
                    )}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1 text-sm sm:col-span-2">
                  <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                    To email
                  </span>
                  <input
                    value={draft.toEmail}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, toEmail: e.target.value }))
                    }
                    className={fieldClass}
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                    To name
                  </span>
                  <input
                    value={draft.toName}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, toName: e.target.value }))
                    }
                    className={fieldClass}
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                    Subject
                  </span>
                  <input
                    value={draft.subject}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, subject: e.target.value }))
                    }
                    className={fieldClass}
                  />
                </label>
              </div>

              <label className="block space-y-1 text-sm">
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                  Email HTML body (editable)
                </span>
                <textarea
                  value={draft.bodyHtml}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, bodyHtml: e.target.value }))
                  }
                  rows={12}
                  className={`${fieldClass} resize-y font-mono text-xs`}
                />
              </label>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                    Preview
                  </p>
                  <button
                    type="button"
                    className="text-xs text-accent underline-offset-2 hover:underline"
                    onClick={() => setPreviewBust(Date.now())}
                  >
                    Refresh preview
                  </button>
                </div>
                <iframe
                  key={`${active.id}-${previewBust}`}
                  title={`${roleLabel(active.role)} email preview`}
                  srcDoc={draft.bodyHtml}
                  className="h-72 w-full border border-line bg-white"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
