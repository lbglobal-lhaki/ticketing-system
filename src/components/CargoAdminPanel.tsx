"use client";

import { useMemo, useState } from "react";
import {
  createCargoSubmissionAction,
  deleteCargoSubmissionAction,
  updateCargoSubmissionAction,
} from "@/lib/actions/cargo";
import { formatCargoAnswer } from "@/lib/cargo/submit";

export type AdminCargoRow = {
  id: string;
  status: "new" | "reviewed" | "closed";
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

const fieldClass =
  "w-full min-w-0 border-0 border-b border-line bg-transparent py-2 text-sm text-foreground outline-none transition focus:border-accent";

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

function previewAnswers(answers: AdminCargoRow["answers"]) {
  const entries = Object.entries(answers).slice(0, 2);
  if (entries.length === 0) return "—";
  return entries
    .map(([k, v]) => `${k}: ${formatCargoAnswer(v)}`)
    .join(" · ");
}

function answersToPairs(
  answers: AdminCargoRow["answers"],
): AnswerPair[] {
  const pairs = Object.entries(answers).map(([key, value]) => ({
    key,
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
          <input
            name="answerValue"
            value={pair.value}
            onChange={(e) => {
              const next = [...pairs];
              next[index] = { ...next[index], value: e.target.value };
              onChange(next);
            }}
            placeholder="Answer"
            className={fieldClass}
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "create">("view");
  const [filter, setFilter] = useState<"all" | AdminCargoRow["status"]>("all");
  const [pairs, setPairs] = useState<AnswerPair[]>(DEFAULT_FIELDS);

  const filtered = useMemo(() => {
    if (filter === "all") return submissions;
    return submissions.filter((s) => s.status === filter);
  }, [filter, submissions]);

  const active = useMemo(
    () => submissions.find((s) => s.id === activeId) ?? null,
    [activeId, submissions],
  );

  function openCreate() {
    setActiveId(null);
    setMode("create");
    setPairs(DEFAULT_FIELDS.map((p) => ({ ...p })));
  }

  function openView(id: string) {
    setActiveId(id);
    setMode("view");
  }

  function openEdit(row: AdminCargoRow) {
    setActiveId(row.id);
    setMode("edit");
    setPairs(answersToPairs(row.answers));
  }

  function closeModal() {
    setActiveId(null);
    setMode("view");
  }

  const showModal = mode === "create" || active;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight">
            Cargo enquiries
          </h2>
          <p className="mt-1 text-sm text-muted">
            Google Form submissions and manual cargo entries. Preview as PDF,
            edit details, or add a new enquiry.
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

      {filtered.length === 0 ? (
        <p className="border border-dashed border-line bg-white/60 px-4 py-8 text-center text-sm text-muted">
          No cargo submissions yet. Add one manually or wait for a Google Form
          response.
        </p>
      ) : (
        <div className="overflow-x-auto border border-line bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-line bg-slate-50 text-xs uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Received</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Preview</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-line/70 align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {new Date(row.submittedAt || row.createdAt).toLocaleString(
                      "en-AU",
                      { dateStyle: "medium", timeStyle: "short" },
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {row.submitterName || "—"}
                  </td>
                  <td className="px-4 py-3">{row.email || "—"}</td>
                  <td className="px-4 py-3">{row.phone || "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${statusClass(row.status)}`}
                    >
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="max-w-[14rem] truncate px-4 py-3 text-muted">
                    {previewAnswers(row.answers)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <a
                        href={`/documents/cargo/${row.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-accent underline-offset-2 hover:underline"
                      >
                        PDF
                      </a>
                      <button
                        type="button"
                        onClick={() => openView(row.id)}
                        className="text-sm font-medium text-accent underline-offset-2 hover:underline"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="text-sm font-medium text-accent underline-offset-2 hover:underline"
                      >
                        Edit
                      </button>
                      <form action={deleteCargoSubmissionAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <button
                          type="submit"
                          className="text-sm font-medium text-red-700 underline-offset-2 hover:underline"
                          onClick={(e) => {
                            if (
                              !confirm(
                                "Delete this cargo enquiry permanently?",
                              )
                            ) {
                              e.preventDefault();
                            }
                          }}
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
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
                {active && mode !== "create" && (
                  <p className="mt-1 text-sm text-muted">
                    Received{" "}
                    {new Date(
                      active.submittedAt || active.createdAt,
                    ).toLocaleString("en-AU")}
                    {active.googleResponseId ? " · Google Form" : " · Admin"}
                  </p>
                )}
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
                <dl className="mt-5 space-y-3 border-t border-line pt-4">
                  <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
                    <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                      Status
                    </dt>
                    <dd className="text-sm">{statusLabel(active.status)}</dd>
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

                <div className="mt-6 flex flex-wrap gap-3 border-t border-line pt-4">
                  <a
                    href={`/documents/cargo/${active.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-cta rounded-xl px-4 py-2.5 text-sm"
                  >
                    Preview PDF
                  </a>
                  <button
                    type="button"
                    onClick={() => openEdit(active)}
                    className="border border-line px-4 py-2.5 text-sm"
                  >
                    Edit
                  </button>
                  <form action={deleteCargoSubmissionAction}>
                    <input type="hidden" name="id" value={active.id} />
                    <button
                      type="submit"
                      className="border border-red-200 px-4 py-2.5 text-sm text-red-700"
                      onClick={(e) => {
                        if (
                          !confirm("Delete this cargo enquiry permanently?")
                        ) {
                          e.preventDefault();
                        }
                      }}
                    >
                      Delete
                    </button>
                  </form>
                </div>
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
                    <a
                      href={`/documents/cargo/${active.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="border border-line px-4 py-2.5 text-sm"
                    >
                      Preview PDF
                    </a>
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
