"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createCargoSubmissionAction,
  deleteCargoSubmissionAction,
  setCargoPaidAction,
  updateCargoSubmissionAction,
} from "@/lib/actions/cargo";
import { CargoEmailNotices } from "@/components/CargoEmailNotices";
import { formatCargoAnswer } from "@/lib/cargo/submit";
import {
  BulkSelectBar,
  SelectAllCheckbox,
  useBulkSelection,
} from "@/components/BulkSelectBar";
import { SubmitButton } from "@/components/SubmitButton";
import { Spinner } from "@/components/Spinner";
import { ListFilterBar, NoMatches } from "@/components/admin/ListFilterBar";
import { SegmentedField } from "@/components/admin/SegmentedField";
import { FieldError, labeledControlClass } from "@/components/forms/FieldError";
import { useStickyAction } from "@/components/forms/useStickyAction";

export type AdminCargoRow = {
  id: string;
  parcelNumber: string;
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
type Mode = "closed" | "view" | "edit" | "create" | "emails";

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
  // Which row + action is in flight (e.g. "abc123:delete") — lets a specific
  // row's button show its own spinner instead of every row dimming the same way.
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const createSticky = useStickyAction(createCargoSubmissionAction);
  const updateSticky = useStickyAction(updateCargoSubmissionAction);
  const cargoSticky = mode === "create" ? createSticky : updateSticky;

  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return submissions.filter((s) => {
      if (filter !== "all" && s.status !== filter) return false;
      if (tokens.length === 0) return true;
      // Answers are free-form Google Form fields, so search their values too —
      // that's where the route, weight, and description actually live.
      const hay = [
        s.parcelNumber,
        s.submitterName ?? "",
        s.email ?? "",
        s.phone ?? "",
        s.notes ?? "",
        ...Object.entries(s.answers).map(
          ([key, value]) => `${key} ${formatCargoAnswer(value)}`,
        ),
      ]
        .join(" ")
        .toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [filter, query, submissions]);

  const filteredIds = useMemo(() => filtered.map((s) => s.id), [filtered]);
  const bulk = useBulkSelection(filteredIds);

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

  function openEmails(id: string) {
    setLocalError(null);
    setActiveId(id);
    setMode("emails");
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
    setPendingKey(`${id}:delete`);
    const fd = new FormData();
    fd.set("id", id);
    startTransition(() => {
      // Server action redirects back to /admin?tab=cargo on success.
      void deleteCargoSubmissionAction(fd);
    });
  }

  function handleSetPaid(id: string, paid: boolean) {
    setLocalError(null);
    setPendingKey(`${id}:paid`);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("paid", paid ? "true" : "false");
    startTransition(() => {
      void setCargoPaidAction(fd);
    });
  }

  function handleBulkDelete() {
    const ids = [...bulk.selected];
    if (ids.length === 0) return;
    if (
      !confirm(
        `Delete ${ids.length} cargo ${ids.length === 1 ? "enquiry" : "enquiries"} permanently?`,
      )
    ) {
      return;
    }
    setLocalError(null);
    const fd = new FormData();
    for (const id of ids) fd.append("id", id);
    startTransition(() => {
      void deleteCargoSubmissionAction(fd);
    });
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="max-w-2xl text-sm text-muted">
            Google Form submissions and manual entries. Each enquiry gets an
            auto-assigned parcel number. Use Emails for sender/receiver notices.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="btn-cta shrink-0 rounded-xl px-4 py-2.5 text-sm"
        >
          Add cargo form
        </button>
      </div>

      <ListFilterBar
        query={query}
        onQueryChange={setQuery}
        placeholder="Search parcel no., sender, email, route, description…"
        chips={[
          { value: "all", label: "All", count: submissions.length },
          {
            value: "new",
            label: "New",
            count: submissions.filter((s) => s.status === "new").length,
          },
          {
            value: "reviewed",
            label: "Reviewed",
            count: submissions.filter((s) => s.status === "reviewed").length,
          },
          {
            value: "closed",
            label: "Closed",
            count: submissions.filter((s) => s.status === "closed").length,
          },
        ]}
        activeChip={filter}
        onChipChange={(next) =>
          setFilter(next as "all" | AdminCargoRow["status"])
        }
        resultCount={filtered.length}
        totalCount={submissions.length}
        itemLabel="enquiry"
        itemLabelPlural="enquiries"
      />

      {localError && (
        <p className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {localError}
        </p>
      )}

      <BulkSelectBar
        count={bulk.selected.size}
        itemLabel="enquiry"
        pending={pending}
        onDelete={handleBulkDelete}
        onClear={bulk.clear}
      />

      {submissions.length === 0 ? (
        <p className="border border-dashed border-line bg-white/60 px-4 py-8 text-center text-sm text-muted">
          No cargo submissions yet. Add one manually or wait for a Google Form
          response.
        </p>
      ) : filtered.length === 0 ? (
        <NoMatches
          label="No cargo enquiries match that search."
          onReset={() => {
            setQuery("");
            setFilter("all");
          }}
        />
      ) : (
        <>
          <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted">
            <SelectAllCheckbox
              allSelected={bulk.allSelected}
              someSelected={bulk.someSelected}
              onToggle={bulk.toggleAll}
            />
            Select all ({filtered.length})
          </label>
          <ul className="space-y-3">
          {filtered.map((row) => (
            <li
              key={row.id}
              className="border border-line bg-white px-4 py-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.parcelNumber}`}
                    checked={bulk.selected.has(row.id)}
                    onChange={() => bulk.toggle(row.id)}
                    className="mt-1.5 size-4 shrink-0 accent-accent-deep"
                  />
                  <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-sm font-semibold tracking-wide text-accent-deep">
                      {row.parcelNumber}
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
                  <p className="font-semibold text-foreground">
                    {row.submitterName || row.email || "Untitled enquiry"}
                  </p>
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
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btnClass}
                    onClick={() => openView(row.id)}
                  >
                    View
                  </button>
                  <button
                    type="button"
                    className={`${btnClass} border-accent/40 text-accent-deep`}
                    onClick={() => openEmails(row.id)}
                  >
                    Emails
                  </button>
                  <button
                    type="button"
                    className={btnClass}
                    onClick={() => openPreview(row.id)}
                  >
                    PDF
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
                    className={`${btnClass} disabled:cursor-not-allowed disabled:opacity-60`}
                    disabled={pending}
                    onClick={() => handleSetPaid(row.id, !row.paid)}
                  >
                    {pending && pendingKey === `${row.id}:paid` ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Spinner className="size-3.5" />
                        Updating…
                      </span>
                    ) : row.paid ? (
                      "Unpaid"
                    ) : (
                      "Paid"
                    )}
                  </button>
                  <button
                    type="button"
                    className={`${btnClass} border-red-200 text-red-700 hover:border-red-400 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-60`}
                    disabled={pending}
                    onClick={() => handleDelete(row.id)}
                  >
                    {pending && pendingKey === `${row.id}:delete` ? (
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
            </li>
          ))}
          </ul>
        </>
      )}

      {mode === "emails" && active && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cargo-email-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                  Cargo emails
                </p>
                <h3
                  id="cargo-email-title"
                  className="mt-1 font-[family-name:var(--font-syne)] text-xl font-semibold"
                >
                  {active.parcelNumber}
                </h3>
                <p className="mt-1 truncate text-sm text-muted">
                  {active.submitterName || active.email || "Untitled enquiry"}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  className={btnClass}
                  onClick={() => openView(active.id)}
                >
                  View enquiry
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="text-sm text-muted hover:text-foreground"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
              <CargoEmailNotices
                cargoId={active.id}
                parcelNumber={active.parcelNumber}
              />
            </div>
          </div>
        </div>
      )}

      {mode !== "closed" &&
        mode !== "emails" &&
        (mode === "create" || active) && (
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
                    : active?.parcelNumber ||
                      active?.submitterName ||
                      active?.email ||
                      "Untitled enquiry"}
                </h3>
                {mode !== "create" && active && (
                  <p className="mt-1 text-sm text-muted">
                    {active.submitterName || active.email || "Untitled enquiry"}
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
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-cta rounded-xl px-4 py-2.5 text-sm"
                    onClick={() => openEmails(active.id)}
                  >
                    Emails
                  </button>
                  <button
                    type="button"
                    className={btnClass}
                    onClick={() => openPreview(active.id)}
                  >
                    Preview PDF
                  </button>
                  <button
                    type="button"
                    className={`${btnClass} disabled:cursor-not-allowed disabled:opacity-60`}
                    disabled={pending}
                    onClick={() => handleSetPaid(active.id, !active.paid)}
                  >
                    {pending && pendingKey === `${active.id}:paid` ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Spinner className="size-3.5" />
                        Updating…
                      </span>
                    ) : active.paid ? (
                      "Mark unpaid"
                    ) : (
                      "Mark paid"
                    )}
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
                    className={`${btnClass} border-red-200 text-red-700 disabled:cursor-not-allowed disabled:opacity-60`}
                    disabled={pending}
                    onClick={() => handleDelete(active.id)}
                  >
                    {pending && pendingKey === `${active.id}:delete` ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Spinner className="size-3.5" />
                        Deleting…
                      </span>
                    ) : (
                      "Delete"
                    )}
                  </button>
                </div>
                <dl className="mt-5 space-y-3 border-t border-line pt-4">
                  <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
                    <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                      Parcel number
                    </dt>
                    <dd className="font-mono text-sm font-semibold tracking-wide">
                      {active.parcelNumber}
                    </dd>
                  </div>
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
                onSubmit={cargoSticky.onSubmit}
                className="mt-5 space-y-4 border-t border-line pt-4"
              >
                {mode === "edit" && active && (
                  <input type="hidden" name="id" value={active.id} />
                )}

                {mode === "edit" && active && (
                  <p className="rounded-lg border border-line bg-slate-50 px-3 py-2 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                      Parcel number{" "}
                    </span>
                    <span className="font-mono font-semibold tracking-wide text-accent-deep">
                      {active.parcelNumber}
                    </span>
                    <span className="ml-2 text-xs text-muted">(auto-assigned)</span>
                  </p>
                )}
                {mode === "create" && (
                  <p className="text-sm text-muted">
                    A parcel number like{" "}
                    <span className="font-mono">CGO-YYYYMMDD-XXXXXX</span> will
                    be assigned automatically when you create this enquiry.
                  </p>
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
                      data-field-key="submitterName"
                      aria-invalid={
                        cargoSticky.fieldErrors.submitterName ? true : undefined
                      }
                      className={labeledControlClass(
                        fieldClass,
                        cargoSticky.fieldErrors.submitterName,
                      )}
                      placeholder="Shipper / contact name"
                    />
                    <FieldError error={cargoSticky.fieldErrors.submitterName} />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                      Email
                    </span>
                    <input
                      type="email"
                      name="email"
                      defaultValue={mode === "edit" ? active?.email || "" : ""}
                      data-field-key="email"
                      aria-invalid={cargoSticky.fieldErrors.email ? true : undefined}
                      className={labeledControlClass(
                        fieldClass,
                        cargoSticky.fieldErrors.email,
                      )}
                      placeholder="name@example.com"
                    />
                    <FieldError error={cargoSticky.fieldErrors.email} />
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
                  <SegmentedField
                    name="status"
                    label="Status"
                    defaultValue={
                      mode === "edit" ? active?.status || "new" : "new"
                    }
                    options={[
                      { value: "new", label: "New" },
                      { value: "reviewed", label: "Reviewed" },
                      { value: "closed", label: "Closed" },
                    ]}
                  />
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
                  {cargoSticky.formError ? (
                    <p className="w-full text-sm font-medium text-accent-red" role="alert">
                      {cargoSticky.formError}
                    </p>
                  ) : null}
                  <SubmitButton
                    pending={cargoSticky.pending}
                    pendingLabel={mode === "create" ? "Creating…" : "Saving…"}
                    className="btn-cta rounded-xl px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {mode === "create" ? "Create" : "Save changes"}
                  </SubmitButton>
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
