"use client";

import { useMemo, useState } from "react";
import { updateCargoSubmissionAction } from "@/lib/actions/cargo";
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

const fieldClass =
  "w-full min-w-0 border-0 border-b border-line bg-transparent py-2 text-sm text-foreground outline-none transition focus:border-accent";

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

export function CargoAdminPanel({
  submissions,
}: {
  submissions: AdminCargoRow[];
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | AdminCargoRow["status"]>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return submissions;
    return submissions.filter((s) => s.status === filter);
  }, [filter, submissions]);

  const active = useMemo(
    () => submissions.find((s) => s.id === activeId) ?? null,
    [activeId, submissions],
  );

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight">
            Cargo enquiries
          </h2>
          <p className="mt-1 text-sm text-muted">
            Submissions from the Google Cargo form. Review and update status
            here — bookings are created separately for now.
          </p>
        </div>
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
      </div>

      {filtered.length === 0 ? (
        <p className="border border-dashed border-line bg-white/60 px-4 py-8 text-center text-sm text-muted">
          No cargo submissions yet. Once the Google Form Apps Script is
          connected, new responses appear here.
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
                <th className="px-4 py-3 font-medium" />
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
                  <td className="max-w-[16rem] truncate px-4 py-3 text-muted">
                    {previewAnswers(row.answers)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setActiveId(row.id)}
                      className="text-sm font-medium text-accent underline-offset-2 hover:underline"
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cargo-detail-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveId(null);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                  Cargo submission
                </p>
                <h3
                  id="cargo-detail-title"
                  className="mt-1 font-[family-name:var(--font-syne)] text-xl font-semibold"
                >
                  {active.submitterName || active.email || "Untitled enquiry"}
                </h3>
                <p className="mt-1 text-sm text-muted">
                  Received{" "}
                  {new Date(
                    active.submittedAt || active.createdAt,
                  ).toLocaleString("en-AU")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveId(null)}
                className="text-sm text-muted hover:text-foreground"
              >
                Close
              </button>
            </div>

            <dl className="mt-5 space-y-3 border-t border-line pt-4">
              {Object.entries(active.answers).map(([key, value]) => (
                <div key={key} className="grid gap-1 sm:grid-cols-[10rem_1fr]">
                  <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                    {key}
                  </dt>
                  <dd className="text-sm text-foreground whitespace-pre-wrap">
                    {formatCargoAnswer(value)}
                  </dd>
                </div>
              ))}
            </dl>

            <form
              action={updateCargoSubmissionAction}
              className="mt-6 space-y-4 border-t border-line pt-4"
            >
              <input type="hidden" name="id" value={active.id} />
              <label className="block space-y-1 text-sm">
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                  Status
                </span>
                <select
                  name="status"
                  defaultValue={active.status}
                  className={fieldClass}
                >
                  <option value="new">New</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                  Admin notes
                </span>
                <textarea
                  name="notes"
                  rows={3}
                  defaultValue={active.notes || ""}
                  placeholder="Internal notes for the team…"
                  className={`${fieldClass} resize-y`}
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="btn-cta rounded-xl px-4 py-2.5 text-sm"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setActiveId(null)}
                  className="border border-line px-4 py-2.5 text-sm text-muted"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
