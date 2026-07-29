"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createCargoSubmissionAction,
  deleteCargoSubmissionAction,
  setCargoPaidAction,
  updateCargoSubmissionAction,
} from "@/lib/actions/cargo";
import { formatCargoAnswer } from "@/lib/cargo/submit";

export type AdminCargoRow = {
  id: string;
  status: "new" | "reviewed" | "closed";
  paid: boolean;
  paidAt: string | null;
  submitterName: string | null;
  email: string | null;
  phone: string | null;
  answers: Record<string, string | number | boolean | string[]>;
  notes: string | null;
  googleResponseId: string | null;
  submittedAt: string | null;
  createdAt: string;
};

type AnswerPair = { key: string; value: string };
type Mode = "closed" | "view" | "edit" | "create";

const fieldClass =
  "w-full min-w-0 border-0 border-b border-line bg-transparent py-2 text-sm text-foreground outline-none transition focus:border-accent";

const btnClass =
  "inline-flex items-center justify-center rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent";

const DEFAULT_FIELDS: AnswerPair[] = [
  { key: "Cargo description", value: "" },
  { key: "Origin", value: "" },
  { key: "Destination", value: "" },
  { key: "Weight (kg)", value: "" },
  { key: "Pieces", value: "" },
];

function statusLabel(status: AdminCargoRow["status"]) {
  if (status === "new") return "New";
  if (status === "reviewed") return "Reviewed";
  return "Closed";
}

function statusClass(status: AdminCargoRow["status"]) {
  if (status === "new") return "bg-amber-50 text-amber-900 border-amber-200";
  if (status === "reviewed") return "bg-sky-50 text-sky-900 border-sky-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function answersToPairs(answers: AdminCargoRow["answers"]): AnswerPair[] {
  const pairs = Object.entries(answers).map(([key, value]) => ({
    key: key.replace(/\s+/g, " ").trim(),
    value: formatCargoAnswer(value) === "—" ? "" : formatCargoAnswer(value),
  }));
  return pairs.length > 0 ? pairs : [{ key: "", value: "" }];
}

function AnswerFieldsEditor({
  pairs,
  onChange,
}: {
  pairs: AnswerPair[];
  onChange: (next: AnswerPair[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
          Form fields
        </p>
        <button
          type="button"
          onClick={() => onChange([...pairs, { key: "", value: "" }])}
          className="text-xs font-medium text-accent underline-offset-2 hover:underline"
        >
          + Add field
        </button>
      </div>
      {pairs.map((pair, index) => (
        <div
          key={`pair-${index}`}
          className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]"
        >
          <input
            name="answerKey"
            value={pair.key}
            onChange={(e) => {
              const next = [...pairs];
              next[index] = { ...next[index], key: e.target.value };
              onChange(next);
            }}
            placeholder="Question"
            className={fieldClass}
            required={index === 0}
          />
          <textarea
            name="answerValue"
            value={pair.value}
            onChange={(e) => {
              const next = [...pairs];
              next[index] = { ...next[index], value: e.target.value };
              onChange(next);
            }}
            placeholder="Answer"
            rows={2}
            className={`${fieldClass} resize-y`}
          />
          <button
            type="button"
            onClick={() => onChange(pairs.filter((_, i) => i !== index))}
            className="text-xs text-muted hover:text-red-700"
            disabled={pairs.length <= 1}
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

export function CargoAdminPanel({
  submissions,
}: {
  submissions: AdminCargoRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("closed");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | AdminCargoRow["status"]>("all");
  const [pairs, setPairs] = useState<AnswerPair[]>(DEFAULT_FIELDS);
  const [localError, setLocalError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "all") return submissions;
    return submissions.filter((s) => s.status === filter);
  }, [filter, submissions]);

  const active = useMemo(
    () => submissions.find((s) => s.id === activeId) ?? null,
    [activeId, submissions],
  );

  function openCreate() {
    setLocalError(null);
    setActiveId(null);
    setMode("create");
    setPairs(DEFAULT_FIELDS.map((p) => ({ ...p })));
  }

  function openView(id: string) {
    setLocalError(null);
    setActiveId(id);
    setMode("view");
  }

  function openEdit(row: AdminCargoRow) {
    setLocalError(null);
    setActiveId(row.id);
    setMode("edit");
    setPairs(answersToPairs(row.answers));
  }

  function closeModal() {
    setMode("closed");
    setActiveId(null);
    setLocalError(null);
  }

  function openPreview(id: string) {
    // Prefer PDF; route falls back to HTML if Chromium fails in local/dev.
    window.open(`/documents/cargo/${id}`, "_blank", "noopener,noreferrer");
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this cargo enquiry permanently?")) return;
    setLocalError(null);
    const fd = new FormData();
    fd.set("id", id);
    startTransition(() => {
      // Server action redirects back to /admin?tab=cargo on success.
      void deleteCargoSubmissionAction(fd);
    });
  }

  function handleSetPaid(id: string, paid: boolean) {
    setLocalError(null);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("paid", paid ? "true" : "false");
    startTransition(() => {
      void setCargoPaidAction(fd);
    });
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight">
            Cargo enquiries
          </h2>
          <p className="mt-1 text-sm text-muted">
            Google Form submissions and manual entries. Mark paid when payment
            is received.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
            Filter
            <select
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value as "all" | AdminCargoRow["status"])
              }
              className="mt-1 block w-full border border-line bg-white px-3 py-2 text-sm text-foreground sm:w-40"
            >
              <option value="all">All</option>
              <option value="new">New</option>
              <option value="reviewed">Reviewed</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <button
            type="button"
            onClick={openCreate}
            className="btn-cta rounded-xl px-4 py-2.5 text-sm"
          >
            Add cargo form
          </button>
        </div>
      </div>

      {localError && (
        <p className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {localError}
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="border border-dashed border-line bg-white/60 px-4 py-8 text-center text-sm text-muted">
          No cargo submissions yet. Add one manually or wait for a Google Form
          response.
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((row) => (
            <li
              key={row.id}
              className="border border-line bg-white px-4 py-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">
                      {row.submitterName || row.email || "Untitled enquiry"}
                    </p>
                    <span
                      className={`inline-block border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${statusClass(row.status)}`}
                    >
                      {statusLabel(row.status)}
                    </span>
                    <span
                      className={`inline-block border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                        row.paid
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : "border-amber-200 bg-amber-50 text-amber-900"
                      }`}
                    >
                      {row.paid ? "Paid" : "Unpaid"}
                    </span>
                  </div>
                  <p className="text-sm text-muted">
                    {new Date(row.submittedAt || row.createdAt).toLocaleString(
                      "en-AU",
                      { dateStyle: "medium", timeStyle: "short" },
                    )}
                    {row.email ? ` · ${row.email}` : ""}
                    {row.phone ? ` · ${row.phone}` : ""}
                  </p>
                  <p className="text-sm text-muted">
                    {Object.keys(row.answers).length} field
                    {Object.keys(row.answers).length === 1 ? "" : "s"}
                    {row.googleResponseId ? " · Google Form" : " · Admin"}
                    {row.paid && row.paidAt
                      ? ` · Paid ${new Date(row.paidAt).toLocaleDateString("en-AU")}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btnClass}
                    disabled={pending}
                    onClick={() => handleSetPaid(row.id, !row.paid)}
                  >
                    {row.paid ? "Mark unpaid" : "Mark paid"}
                  </button>
                  <button
                    type="button"
                    className={btnClass}
                    onClick={() => openPreview(row.id)}
                  >
                    Preview PDF
                  </button>
                  <button
                    type="button"
                    className={btnClass}
                    onClick={() => openView(row.id)}
                  >
                    View
                  </button>
                  <button
                    type="button"
                    className={btnClass}
                    onClick={() => openEdit(row)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`${btnClass} border-red-200 text-red-700 hover:border-red-400 hover:text-red-800`}
                    disabled={pending}
                    onClick={() => handleDelete(row.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {mode !== "closed" && (mode === "create" || active) && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cargo-detail-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                  {mode === "create"
                    ? "New cargo form"
                    : mode === "edit"
                      ? "Edit cargo"
                      : "Cargo submission"}
                </p>
                <h3
                  id="cargo-detail-title"
                  className="mt-1 font-[family-name:var(--font-syne)] text-xl font-semibold"
                >
                  {mode === "create"
                    ? "Add enquiry"
                    : active?.submitterName ||
                      active?.email ||
                      "Untitled enquiry"}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-sm text-muted hover:text-foreground"
              >
                Close
              </button>
            </div>

            {mode === "view" && active && (
              <>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-cta rounded-xl px-4 py-2.5 text-sm"
                    onClick={() => openPreview(active.id)}
                  >
                    Preview PDF
                  </button>
                  <button
                    type="button"
                    className={btnClass}
                    disabled={pending}
                    onClick={() => handleSetPaid(active.id, !active.paid)}
                  >
                    {active.paid ? "Mark unpaid" : "Mark paid"}
                  </button>
                  <button
                    type="button"
                    className={btnClass}
                    onClick={() => openEdit(active)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`${btnClass} border-red-200 text-red-700`}
                    onClick={() => handleDelete(active.id)}
                  >
                    Delete
                  </button>
                </div>
                <dl className="mt-5 space-y-3 border-t border-line pt-4">
                  <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
                    <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                      Status
                    </dt>
                    <dd className="text-sm">{statusLabel(active.status)}</dd>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
                    <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                      Payment
                    </dt>
                    <dd className="text-sm">
                      {active.paid
                        ? `Paid${active.paidAt ? ` · ${new Date(active.paidAt).toLocaleString("en-AU")}` : ""}`
                        : "Unpaid"}
                    </dd>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
                    <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                      Name
                    </dt>
                    <dd className="text-sm">{active.submitterName || "—"}</dd>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
                    <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                      Email
                    </dt>
                    <dd className="text-sm">{active.email || "—"}</dd>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
                    <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                      Phone
                    </dt>
                    <dd className="text-sm">{active.phone || "—"}</dd>
                  </div>
                  {Object.entries(active.answers).map(([key, value]) => (
                    <div
                      key={key}
                      className="grid gap-1 sm:grid-cols-[10rem_1fr]"
                    >
                      <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                        {key}
                      </dt>
                      <dd className="whitespace-pre-wrap text-sm text-foreground">
                        {formatCargoAnswer(value)}
                      </dd>
                    </div>
                  ))}
                  {active.notes && (
                    <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
                      <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                        Admin notes
                      </dt>
                      <dd className="whitespace-pre-wrap text-sm">
                        {active.notes}
                      </dd>
                    </div>
                  )}
                </dl>
              </>
            )}

            {(mode === "edit" || mode === "create") && (
              <form
                action={
                  mode === "create"
                    ? createCargoSubmissionAction
                    : updateCargoSubmissionAction
                }
                className="mt-5 space-y-4 border-t border-line pt-4"
              >
                {mode === "edit" && active && (
                  <input type="hidden" name="id" value={active.id} />
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1 text-sm">
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                      Name
                    </span>
                    <input
                      name="submitterName"
                      defaultValue={
                        mode === "edit" ? active?.submitterName || "" : ""
                      }
                      className={fieldClass}
                      placeholder="Shipper / contact name"
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                      Email
                    </span>
                    <input
                      type="email"
                      name="email"
                      defaultValue={mode === "edit" ? active?.email || "" : ""}
                      className={fieldClass}
                      placeholder="email@example.com"
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                      Phone
                    </span>
                    <input
                      name="phone"
                      defaultValue={mode === "edit" ? active?.phone || "" : ""}
                      className={fieldClass}
                      placeholder="+61 …"
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                      Status
                    </span>
                    <select
                      name="status"
                      defaultValue={
                        mode === "edit" ? active?.status || "new" : "new"
                      }
                      className={fieldClass}
                    >
                      <option value="new">New</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="closed">Closed</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 pt-6 text-sm">
                    <input
                      type="checkbox"
                      name="paid"
                      value="true"
                      defaultChecked={
                        mode === "edit" ? Boolean(active?.paid) : false
                      }
                      className="size-4 border-line"
                    />
                    <span>Payment received</span>
                  </label>
                </div>

                <AnswerFieldsEditor pairs={pairs} onChange={setPairs} />

                <label className="block space-y-1 text-sm">
                  <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                    Admin notes
                  </span>
                  <textarea
                    name="notes"
                    rows={3}
                    defaultValue={mode === "edit" ? active?.notes || "" : ""}
                    placeholder="Internal notes for the team…"
                    className={`${fieldClass} resize-y`}
                  />
                </label>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    className="btn-cta rounded-xl px-4 py-2.5 text-sm"
                  >
                    {mode === "create" ? "Create" : "Save changes"}
                  </button>
                  {mode === "edit" && active && (
                    <button
                      type="button"
                      className={btnClass}
                      onClick={() => openPreview(active.id)}
                    >
                      Preview PDF
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeModal}
                    className="border border-line px-4 py-2.5 text-sm text-muted"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
