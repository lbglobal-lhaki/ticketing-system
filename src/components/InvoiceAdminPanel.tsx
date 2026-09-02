"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteInvoiceAction,
  deleteInvoiceModalAction,
  generateAirfareInvoiceModalAction,
  generateTravelDocumentModalAction,
  markInvoicePaidAction,
  markInvoiceUnpaidAction,
  reactivateInvoiceAction,
  saveInvoiceDocumentModalAction,
  sendAirfareInvoiceEmailAction,
  sendAirfareInvoiceEmailModalAction,
  sendTravelDocumentEmailAction,
  sendTravelDocumentEmailModalAction,
} from "@/lib/actions/invoices";
import { formatAud } from "@/lib/pricing";
import { EXTRA_BAG_AUD, extraBaggageCentsForBags } from "@/lib/pricing/baggage";
import { FieldError, labeledControlClass } from "@/components/forms/FieldError";
import {
  BulkSelectBar,
  SelectAllCheckbox,
  useBulkSelection,
} from "@/components/BulkSelectBar";
import { SubmitButton } from "@/components/SubmitButton";
import { Spinner } from "@/components/Spinner";
import { ListFilterBar, NoMatches } from "@/components/admin/ListFilterBar";
import { Button } from "@/components/ui/Button";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import {
  Menu,
  MenuDivider,
  MenuItem,
  MenuLabel,
} from "@/components/ui/Menu";
import {
  GstModeFields,
  resolveGstMode,
} from "@/components/GstModeFields";

export type AdminInvoiceRow = {
  id: string;
  invoiceNumber: string;
  status: "unpaid" | "paid" | "cancelled" | "failed";
  paymentMethod: "card" | "bank_transfer" | "cash";
  amountCents: number;
  fareCents: number;
  serviceFeeCents: number;
  airfareCents: number;
  airportTaxesCents: number;
  extraBaggageCents: number;
  extraBaggageKg: number;
  travelInsuranceCents: number;
  otherChargesCents: number;
  gstRateBps: number;
  gstIncluded: boolean;
  gstOverrideCents: number;
  accountNumber: string;
  businessTpn: string;
  routeLabel: string;
  seatLabel: string;
  nameRef: string;
  endorsementText: string;
  fareCalculationLine: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  passportNumber: string;
  nationality: string;
  notes: string;
  bankReference: string | null;
  stripePaymentIntentId: string | null;
  dueAt: string | null;
  sentAt: string | null;
  travelDocSentAt: string | null;
  paidAt: string | null;
  markedPaidByAdmin: boolean;
  createdAt: string;
  bookingRef: string;
  bookingId: string;
  cabinClass: "economy" | "business";
};

type DocTab = "travel" | "airfare";

function aud(cents: number) {
  return (cents / 100).toFixed(2);
}

function dueInputValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fieldClass =
  "w-full min-w-0 border-0 border-b border-line bg-transparent py-2 text-sm text-foreground outline-none transition focus:border-accent";

function docBaseUrl(invoice: AdminInvoiceRow, tab: DocTab) {
  return tab === "travel"
    ? `/documents/eticket/${encodeURIComponent(invoice.bookingRef)}`
    : `/documents/invoice/${encodeURIComponent(invoice.invoiceNumber)}`;
}

function previewUrl(invoice: AdminInvoiceRow, tab: DocTab, bust: number) {
  return `${docBaseUrl(invoice, tab)}?preview=${bust}`;
}

/** Forces a save-to-disk instead of the inline view the preview iframe uses. */
function downloadUrl(invoice: AdminInvoiceRow, tab: DocTab) {
  return `${docBaseUrl(invoice, tab)}?download=1`;
}

export function InvoiceAdminPanel({ invoices }: { invoices: AdminInvoiceRow[] }) {
  const router = useRouter();
  // Local copy so Save can update the open modal without router.refresh()
  // (which reloads the entire admin dashboard and felt like a multi-minute hang).
  const [rows, setRows] = useState(invoices);
  const invoicesKey = invoices
    .map((i) => `${i.id}:${i.status}:${i.amountCents}:${i.sentAt ?? ""}:${i.travelDocSentAt ?? ""}:${i.paidAt ?? ""}`)
    .join("|");
  const [settledKey, setSettledKey] = useState(invoicesKey);
  if (invoicesKey !== settledKey) {
    setSettledKey(invoicesKey);
    setRows(invoices);
  }

  const [activeId, setActiveId] = useState<string | null>(null);
  const [docTab, setDocTab] = useState<DocTab>("travel");
  const [previewBust, setPreviewBust] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  // Which specific action is in flight — lets the modal disable every button
  // (no cross-action races) while only the one actually running shows a
  // spinner, instead of all four looking identically "stuck".
  const [pendingAction, setPendingAction] = useState<
    "save" | "generate" | "send" | "delete" | null
  >(null);
  // Remount uncontrolled fields after Generate/Save so DOM values match DB
  // (otherwise Save after Generate silently writes pre-Generate values).
  const [formRevision, setFormRevision] = useState(0);
  const [extraBags, setExtraBags] = useState(0);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const visibleRows = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((invoice) => {
      if (statusFilter !== "all" && invoice.status !== statusFilter) {
        return false;
      }
      if (tokens.length === 0) return true;
      const hay = [
        invoice.invoiceNumber,
        invoice.bookingRef,
        invoice.customerName,
        invoice.customerEmail,
        invoice.customerPhone,
        invoice.routeLabel,
        invoice.accountNumber,
        invoice.bankReference ?? "",
        invoice.cabinClass,
        invoice.paymentMethod,
      ]
        .join(" ")
        .toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [rows, query, statusFilter]);

  // Bulk selection only ever covers what the current search shows.
  const invoiceIds = useMemo(
    () => visibleRows.map((i) => i.id),
    [visibleRows],
  );
  const bulk = useBulkSelection(invoiceIds);

  const active = useMemo(
    () => rows.find((i) => i.id === activeId) ?? null,
    [activeId, rows],
  );

  useEffect(() => {
    if (active) setExtraBags(active.extraBaggageKg);
  }, [active?.id, active?.extraBaggageKg, formRevision]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveId(null);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [active]);

  function openEditor(invoiceId: string, tab: DocTab) {
    setActiveId(invoiceId);
    setDocTab(tab);
    setPreviewBust(Date.now());
    setFormRevision(0);
    setStatusMsg(null);
    setErrorMsg(null);
    setFieldErrors({});
  }

  function closeEditor() {
    setActiveId(null);
    setStatusMsg(null);
    setErrorMsg(null);
    setFieldErrors({});
  }

  function refreshPreviewOnly() {
    // Bust the iframe URL only — do NOT router.refresh() the whole admin page.
    setPreviewBust(Date.now());
  }

  function mergeInvoicePatch(
    patch: Partial<AdminInvoiceRow> & { id: string },
  ) {
    setRows((prev) =>
      prev.map((row) => (row.id === patch.id ? { ...row, ...patch } : row)),
    );
  }

  function onSave(formData: FormData) {
    setStatusMsg(null);
    setErrorMsg(null);
    setFieldErrors({});
    setPendingAction("save");
    startTransition(async () => {
      const result = await saveInvoiceDocumentModalAction(formData);
      setPendingAction(null);
      if (!result.ok) {
        setErrorMsg(result.error);
        setFieldErrors(
          "fieldErrors" in result && result.fieldErrors
            ? result.fieldErrors
            : {},
        );
        return;
      }
      if (result.invoice) mergeInvoicePatch(result.invoice);
      setFormRevision((n) => n + 1);
      setStatusMsg("Saved — preview updated.");
      refreshPreviewOnly();
    });
  }

  function onGenerate() {
    if (!active) return;
    setStatusMsg(null);
    setErrorMsg(null);
    setPendingAction("generate");
    const isTravel = docTab === "travel";
    startTransition(async () => {
      const result = isTravel
        ? await generateTravelDocumentModalAction(active.id)
        : await generateAirfareInvoiceModalAction(active.id);
      setPendingAction(null);
      if (!result.ok) {
        setErrorMsg(result.error);
        return;
      }
      if (result.invoice) mergeInvoicePatch(result.invoice);
      setFormRevision((n) => n + 1);
      setStatusMsg(
        isTravel
          ? "Travel document generated / refreshed."
          : "Airfare invoice generated / refreshed.",
      );
      refreshPreviewOnly();
    });
  }

  function onDelete() {
    if (!active) return;
    if (
      !confirm(
        `Delete invoice ${active.invoiceNumber} permanently? The booking stays; only this invoice is removed. It will be recorded in the Deleted tab.`,
      )
    ) {
      return;
    }
    setStatusMsg(null);
    setErrorMsg(null);
    setPendingAction("delete");
    startTransition(async () => {
      const result = await deleteInvoiceModalAction(active.id);
      if (!result.ok) {
        setPendingAction(null);
        setErrorMsg(result.error);
        return;
      }
      closeEditor();
      router.refresh();
    });
  }

  function onBulkDelete() {
    const ids = [...bulk.selected];
    if (ids.length === 0) return;
    if (
      !confirm(
        `Delete ${ids.length} invoice${ids.length === 1 ? "" : "s"} permanently? They will be recorded in the Deleted tab.`,
      )
    ) {
      return;
    }
    setStatusMsg(null);
    setErrorMsg(null);
    const fd = new FormData();
    for (const id of ids) fd.append("id", id);
    startTransition(() => {
      void deleteInvoiceAction(fd);
    });
  }

  function onSend() {
    if (!active) return;
    setStatusMsg(null);
    setErrorMsg(null);
    setPendingAction("send");
    const isTravel = docTab === "travel";
    startTransition(async () => {
      try {
        const result = isTravel
          ? await sendTravelDocumentEmailModalAction(active.id)
          : await sendAirfareInvoiceEmailModalAction(active.id);
        setPendingAction(null);
        if (!result.ok) {
          setErrorMsg(result.error);
          return;
        }
        if (
          "travelDocSentAt" in result &&
          typeof result.travelDocSentAt === "string" &&
          result.travelDocSentAt
        ) {
          mergeInvoicePatch({
            id: active.id,
            travelDocSentAt: result.travelDocSentAt,
          });
        }
        if (
          "sentAt" in result &&
          typeof result.sentAt === "string" &&
          result.sentAt
        ) {
          mergeInvoicePatch({ id: active.id, sentAt: result.sentAt });
        }
        setStatusMsg(
          "warning" in result && typeof result.warning === "string"
            ? result.warning
            : isTravel
              ? `Travel document emailed to ${active.customerEmail}.`
              : `Airfare invoice emailed to ${active.customerEmail}.`,
        );
      } catch (error) {
        setPendingAction(null);
        setErrorMsg(
          error instanceof Error
            ? error.message
            : "Failed to send email. Try again.",
        );
      }
    });
  }

  return (
    <section className="space-y-6">
      <BulkSelectBar
        count={bulk.selected.size}
        itemLabel="invoice"
        pending={pending}
        onDelete={onBulkDelete}
        onClear={bulk.clear}
      />

      {rows.length === 0 ? (
        <div className="border border-dashed border-line bg-surface/70 px-6 py-14 text-center text-sm text-muted">
          No invoices yet.
        </div>
      ) : (
        <>
          <ListFilterBar
            query={query}
            onQueryChange={setQuery}
            placeholder="Search invoice no., booking ref, name, email, route…"
            chips={[
              { value: "all", label: "All", count: rows.length },
              {
                value: "unpaid",
                label: "Unpaid",
                count: rows.filter((i) => i.status === "unpaid").length,
              },
              {
                value: "paid",
                label: "Paid",
                count: rows.filter((i) => i.status === "paid").length,
              },
              {
                value: "cancelled",
                label: "Cancelled",
                count: rows.filter((i) => i.status === "cancelled").length,
              },
              {
                value: "failed",
                label: "Failed",
                count: rows.filter((i) => i.status === "failed").length,
              },
            ]}
            activeChip={statusFilter}
            onChipChange={setStatusFilter}
            resultCount={visibleRows.length}
            totalCount={rows.length}
            itemLabel="invoice"
          />

          {visibleRows.length === 0 ? (
            <NoMatches
              label="No invoices match that search."
              onReset={() => {
                setQuery("");
                setStatusFilter("all");
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
            Select all ({visibleRows.length})
          </label>
        <ul className="divide-y divide-line border-y border-line bg-surface/60">
          {visibleRows.map((invoice) => (
            <li key={invoice.id} className="px-4 py-5 sm:px-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${invoice.invoiceNumber}`}
                    checked={bulk.selected.has(invoice.id)}
                    onChange={() => bulk.toggle(invoice.id)}
                    className="mt-1.5 size-4 shrink-0 accent-accent-deep"
                  />
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="font-[family-name:var(--font-syne)] text-lg font-semibold tracking-tight">
                      {invoice.invoiceNumber}
                    </p>
                    <span
                      className={`text-xs font-medium uppercase tracking-[0.12em] ${
                        invoice.status === "paid"
                          ? "text-accent"
                          : invoice.status === "unpaid"
                            ? "text-amber-800"
                            : "text-muted"
                      }`}
                    >
                      {invoice.status}
                      {invoice.markedPaidByAdmin ? " · admin" : ""}
                    </span>
                  </div>
                  <p className="text-sm text-foreground">
                    {invoice.customerName} · {invoice.customerEmail}
                  </p>
                  <p className="text-sm text-muted">
                    Booking {invoice.bookingRef} ·{" "}
                    {invoice.cabinClass === "business"
                      ? "Business"
                      : "Economy"}{" "}
                    ·{" "}
                    {invoice.paymentMethod === "card"
                      ? "Credit card"
                      : invoice.paymentMethod === "cash"
                        ? "Cash"
                        : "Bank transfer"}
                    {invoice.routeLabel ? ` · ${invoice.routeLabel}` : ""}
                  </p>
                  <p className="text-sm font-medium">
                    {formatAud(invoice.amountCents)}
                    {invoice.sentAt
                      ? ` · Sent ${new Date(invoice.sentAt).toLocaleString("en-AU")}`
                      : " · Not sent"}
                    {invoice.paidAt
                      ? ` · Paid ${new Date(invoice.paidAt).toLocaleString("en-AU")}`
                      : ""}
                  </p>
                </div>
                </div>

                {/*
                  Seven equally-loud buttons per row was the single biggest
                  source of noise on this page. "Edit / preview" — the one
                  reached for most — stays visible; the six view/download/
                  status/delete actions move into an overflow menu. Every
                  action, form, handler and confirm dialog is unchanged; only
                  where they sit on screen has.
                */}
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => openEditor(invoice.id, "travel")}
                  >
                    Edit / preview
                  </Button>

                  <Menu label={`Actions for ${invoice.invoiceNumber}`}>
                    <MenuLabel>View</MenuLabel>
                    <MenuItem>
                      <a
                        href={docBaseUrl(invoice, "travel")}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Travel document
                      </a>
                    </MenuItem>
                    <MenuItem>
                      <a
                        href={docBaseUrl(invoice, "airfare")}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Airfare invoice
                      </a>
                    </MenuItem>

                    <MenuDivider />
                    <MenuLabel>Download</MenuLabel>
                    <MenuItem>
                      <a href={downloadUrl(invoice, "travel")} download>
                        Travel document PDF
                      </a>
                    </MenuItem>
                    <MenuItem>
                      <a href={downloadUrl(invoice, "airfare")} download>
                        Airfare invoice PDF
                      </a>
                    </MenuItem>

                    <MenuDivider />
                    <MenuLabel>Send</MenuLabel>
                    <MenuItem>
                      <form action={sendTravelDocumentEmailAction}>
                        <input type="hidden" name="id" value={invoice.id} />
                        <SubmitButton pendingLabel="Sending…">
                          Send travel document
                        </SubmitButton>
                      </form>
                    </MenuItem>
                    <MenuItem>
                      <form action={sendAirfareInvoiceEmailAction}>
                        <input type="hidden" name="id" value={invoice.id} />
                        <SubmitButton pendingLabel="Sending…">
                          Send airfare invoice
                        </SubmitButton>
                      </form>
                    </MenuItem>

                    <MenuDivider />
                  {invoice.status === "cancelled" ? (
                    <>
                      <MenuItem>
                        <form action={reactivateInvoiceAction}>
                          <input type="hidden" name="id" value={invoice.id} />
                          <SubmitButton
                            pendingLabel="Reopening…"
                            onClick={(e) => {
                              if (
                                !confirm(
                                  `Reopen ${invoice.invoiceNumber} as unpaid and hold the seats again for 48 hours? If those seats have already been sold, this will fail.`,
                                )
                              ) {
                                e.preventDefault();
                              }
                            }}
                          >
                            Reactivate invoice
                          </SubmitButton>
                        </form>
                      </MenuItem>
                      <MenuItem>
                        <form action={markInvoicePaidAction}>
                          <input type="hidden" name="id" value={invoice.id} />
                          <SubmitButton
                            pendingLabel="Confirming…"
                            onClick={(e) => {
                              if (
                                !confirm(
                                  `Payment received after the hold expired. Re-hold seats if still available and mark ${invoice.invoiceNumber} paid?`,
                                )
                              ) {
                                e.preventDefault();
                              }
                            }}
                          >
                            Reactivate and mark paid
                          </SubmitButton>
                        </form>
                      </MenuItem>
                    </>
                  ) : invoice.status === "unpaid" || invoice.status === "failed" ? (
                    <MenuItem>
                      <form action={markInvoicePaidAction}>
                        <input type="hidden" name="id" value={invoice.id} />
                        <SubmitButton pendingLabel="Confirming…">
                          Mark paid
                        </SubmitButton>
                      </form>
                    </MenuItem>
                  ) : invoice.paymentMethod === "bank_transfer" ? (
                    <MenuItem>
                      <form action={markInvoiceUnpaidAction}>
                        <input type="hidden" name="id" value={invoice.id} />
                        <SubmitButton pendingLabel="Updating…">
                          Mark unpaid
                        </SubmitButton>
                      </form>
                    </MenuItem>
                  ) : null}

                  <MenuDivider />
                  <MenuItem tone="danger">
                    <form action={deleteInvoiceAction}>
                      <input type="hidden" name="id" value={invoice.id} />
                      <SubmitButton
                        pendingLabel="Deleting…"
                        onClick={(e) => {
                          if (
                            !confirm(
                              `Delete invoice ${invoice.invoiceNumber} permanently? It will be recorded in the Deleted tab.`,
                            )
                          ) {
                            e.preventDefault();
                          }
                        }}
                      >
                        Delete
                      </SubmitButton>
                    </form>
                  </MenuItem>
                  </Menu>
                </div>
              </div>
            </li>
          ))}
        </ul>
          </>
          )}
        </>
      )}

      {active && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="invoice-doc-modal-title"
          onClick={closeEditor}
        >
          <div
            className="flex max-h-[min(96svh,980px)] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <p
                  id="invoice-doc-modal-title"
                  className="font-[family-name:var(--font-syne)] text-xl font-semibold tracking-tight"
                >
                  {active.invoiceNumber}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {active.customerName} · Booking {active.bookingRef} ·{" "}
                  {active.cabinClass === "business" ? "Business" : "Economy"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                aria-label="Close"
                className="inline-flex size-10 items-center justify-center border border-line text-xl text-muted transition hover:border-accent hover:text-foreground"
              >
                ×
              </button>
            </header>

            <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-line px-4 py-3 sm:px-6">
              <button
                type="button"
                onClick={() => {
                  setDocTab("travel");
                  // Bust preview only — do NOT remount the form or unsaved
                  // edits on the other tab are wiped by defaultValue reset.
                  setPreviewBust(Date.now());
                }}
                className={`px-3 py-2 text-sm font-semibold transition ${
                  docTab === "travel"
                    ? "bg-accent-deep text-white"
                    : "border border-line text-muted hover:border-accent hover:text-foreground"
                }`}
              >
                Travel document
              </button>
              <button
                type="button"
                onClick={() => {
                  setDocTab("airfare");
                  setPreviewBust(Date.now());
                }}
                className={`px-3 py-2 text-sm font-semibold transition ${
                  docTab === "airfare"
                    ? "bg-accent-deep text-white"
                    : "border border-line text-muted hover:border-accent hover:text-foreground"
                }`}
              >
                Airfare invoice
              </button>
            </div>

            {(statusMsg || errorMsg) && (
              <div className="shrink-0 px-4 pt-3 sm:px-6">
                {statusMsg && (
                  <p className="text-sm text-accent-deep">{statusMsg}</p>
                )}
                {errorMsg && (
                  <p className="text-sm text-red-700">{errorMsg}</p>
                )}
              </div>
            )}

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
              <form
                key={`${active.id}-form-${formRevision}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  onSave(new FormData(e.currentTarget));
                }}
                data-skip-busy
                className="space-y-4 border-b border-line px-4 py-4 sm:px-6 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r"
              >
                <input type="hidden" name="id" value={active.id} />
                <input
                  type="hidden"
                  name="tzOffsetMinutes"
                  value={new Date().getTimezoneOffset()}
                />
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                  {docTab === "travel"
                    ? "Edit travel document fields"
                    : "Edit airfare invoice fields"}
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs text-muted sm:col-span-2">
                    Passenger name
                    <input
                      name="customerName"
                      required
                      defaultValue={active.customerName}
                      data-field-key="customerName"
                      aria-invalid={fieldErrors.customerName ? true : undefined}
                      className={labeledControlClass(
                        fieldClass,
                        fieldErrors.customerName,
                      )}
                    />
                    <FieldError error={fieldErrors.customerName} />
                  </label>
                  <label className="block text-xs text-muted">
                    Email
                    <input
                      name="customerEmail"
                      type="email"
                      required
                      defaultValue={active.customerEmail}
                      data-field-key="customerEmail"
                      aria-invalid={fieldErrors.customerEmail ? true : undefined}
                      className={labeledControlClass(
                        fieldClass,
                        fieldErrors.customerEmail,
                      )}
                    />
                    <FieldError error={fieldErrors.customerEmail} />
                  </label>
                  <label className="block text-xs text-muted">
                    Phone
                    <input
                      name="customerPhone"
                      defaultValue={active.customerPhone}
                      className={fieldClass}
                    />
                  </label>

                  {/* Keep both tab field sets mounted so switching tabs does
                      not drop unsaved edits (hidden inputs used to resubmit
                      stale `active` values from the last save). */}
                  <div
                    className={docTab === "travel" ? "contents" : "hidden"}
                  >
                      <label className="block text-xs text-muted">
                        Passport number
                        <input
                          name="passportNumber"
                          defaultValue={active.passportNumber}
                          className={fieldClass}
                        />
                      </label>
                      <label className="block text-xs text-muted">
                        Nationality
                        <input
                          name="nationality"
                          defaultValue={active.nationality}
                          className={fieldClass}
                        />
                      </label>
                      <label className="block text-xs text-muted">
                        Seat
                        <input
                          name="seatLabel"
                          defaultValue={active.seatLabel}
                          placeholder="12A"
                          className={fieldClass}
                        />
                      </label>
                      <label className="block text-xs text-muted">
                        Name REF
                        <input
                          name="nameRef"
                          defaultValue={active.nameRef}
                          className={fieldClass}
                        />
                      </label>
                      <label className="block text-xs text-muted sm:col-span-2">
                        Fare calculation line
                        <input
                          name="fareCalculationLine"
                          defaultValue={active.fareCalculationLine}
                          className={fieldClass}
                        />
                      </label>
                      <label className="block text-xs text-muted sm:col-span-2">
                        Endorsement / restrictions
                        <input
                          name="endorsementText"
                          defaultValue={active.endorsementText}
                          className={fieldClass}
                        />
                      </label>
                  </div>
                  <div
                    className={docTab === "airfare" ? "contents" : "hidden"}
                  >
                      <label className="block text-xs text-muted">
                        Airfare (AUD)
                        <input
                          name="airfareAud"
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={aud(
                            active.airfareCents || active.fareCents,
                          )}
                          className={fieldClass}
                        />
                      </label>
                      <label className="block text-xs text-muted">
                        Airport taxes (AUD)
                        <input
                          name="airportTaxesAud"
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={aud(active.airportTaxesCents)}
                          className={fieldClass}
                        />
                      </label>
                      <label className="block text-xs text-muted">
                        Extra bags
                        <input
                          name="extraBaggageKg"
                          type="number"
                          min={0}
                          max={20}
                          step="1"
                          value={extraBags}
                          onChange={(e) =>
                            setExtraBags(
                              Math.min(
                                20,
                                Math.max(0, Number(e.target.value) || 0),
                              ),
                            )
                          }
                          className={fieldClass}
                        />
                        <span className="mt-1 block font-normal">
                          ${EXTRA_BAG_AUD.toFixed(2)} each
                          {extraBags > 0
                            ? ` · ${formatAud(extraBaggageCentsForBags(extraBags))}`
                            : ""}
                        </span>
                      </label>
                      <label className="block text-xs text-muted">
                        Travel insurance (AUD)
                        <input
                          name="travelInsuranceAud"
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={aud(active.travelInsuranceCents)}
                          className={fieldClass}
                        />
                      </label>
                      <label className="block text-xs text-muted">
                        Other charges (AUD)
                        <input
                          name="otherChargesAud"
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={aud(active.otherChargesCents)}
                          className={fieldClass}
                        />
                      </label>
                      <label className="block text-xs text-muted">
                        Payment surcharge (AUD)
                        <input
                          name="serviceFeeAud"
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={aud(active.serviceFeeCents)}
                          className={fieldClass}
                        />
                      </label>
                      <label className="block text-xs text-muted">
                        Account number
                        <input
                          name="accountNumber"
                          defaultValue={active.accountNumber}
                          className={fieldClass}
                        />
                      </label>
                      <label className="block text-xs text-muted">
                        Business ABN
                        <input
                          name="businessTpn"
                          defaultValue={active.businessTpn}
                          placeholder="47 649 045 714"
                          className={fieldClass}
                        />
                      </label>
                      <label className="block text-xs text-muted">
                        Route label
                        <input
                          name="routeLabel"
                          defaultValue={active.routeLabel}
                          placeholder="Paro-Perth-Paro"
                          className={fieldClass}
                        />
                      </label>
                      <DateTimePicker
                        name="dueAt"
                        label="Invoice due date"
                        defaultValue={dueInputValue(active.dueAt)}
                        placeholder="No due date"
                        helper="Optional. Independent of the booking seat hold."
                      />
                      <GstModeFields
                        defaultMode={resolveGstMode(active)}
                        className="sm:col-span-2"
                      />
                      <label className="block text-xs text-muted sm:col-span-2">
                        Custom GST (AUD) — optional
                        <input
                          name="customGstAud"
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={
                            (active.gstOverrideCents ?? 0) > 0
                              ? aud(active.gstOverrideCents)
                              : ""
                          }
                          placeholder="Leave blank for mode above"
                          className={fieldClass}
                        />
                        <span className="mt-1 block text-xs text-muted">
                          Enter an amount to set GST exactly (added on top).
                          Clear the field and save to go back to None /
                          Exclusive / Inclusive.
                        </span>
                      </label>
                  </div>

                  <label className="block text-xs text-muted sm:col-span-2">
                    Notes
                    <textarea
                      name="notes"
                      rows={2}
                      defaultValue={active.notes}
                      className={`${fieldClass} resize-y`}
                    />
                  </label>
                </div>

                <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                  <button
                    type="submit"
                    disabled={pending}
                    className="bg-accent-deep px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pendingAction === "save" ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Spinner className="size-3.5" />
                        Saving…
                      </span>
                    ) : (
                      "Save & refresh preview"
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={onGenerate}
                    className="border border-line px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pendingAction === "generate" ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Spinner className="size-3.5" />
                        Generating…
                      </span>
                    ) : docTab === "travel" ? (
                      "Generate travel document"
                    ) : (
                      "Generate airfare invoice"
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={onSend}
                    className="border border-line px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pendingAction === "send" ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Spinner className="size-3.5" />
                        Sending…
                      </span>
                    ) : (
                      <>
                        {(docTab === "travel"
                          ? active.travelDocSentAt
                          : active.sentAt)
                          ? "Resend"
                          : "Send"}{" "}
                        {docTab === "travel"
                          ? "travel document"
                          : "airfare invoice"}
                      </>
                    )}
                  </button>
                  <a
                    href={previewUrl(active, docTab, previewBust)}
                    target="_blank"
                    rel="noreferrer"
                    className="border border-line px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground"
                  >
                    Open full page
                  </a>
                  <a
                    href={downloadUrl(active, docTab)}
                    download
                    className="border border-line px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground"
                  >
                    Download PDF
                  </a>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={onDelete}
                    className="border border-line px-4 py-2 text-sm font-medium text-muted/70 transition hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pendingAction === "delete" ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Spinner className="size-3.5" />
                        Deleting…
                      </span>
                    ) : (
                      "Delete invoice"
                    )}
                  </button>
                </div>
              </form>

              <div className="flex h-[75svh] flex-col bg-[#eef3f0] lg:h-auto lg:min-h-0">
                <div className="flex items-center justify-between gap-2 border-b border-line bg-white px-4 py-2 text-xs text-muted">
                  <span>
                    Live preview ·{" "}
                    {docTab === "travel" ? "Travel document" : "Airfare invoice"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewBust(Date.now())}
                    className="font-medium text-accent-deep hover:underline"
                  >
                    Reload
                  </button>
                </div>
                <iframe
                  key={`${active.id}-${docTab}-${previewBust}`}
                  title={
                    docTab === "travel"
                      ? "Travel document preview"
                      : "Airfare invoice preview"
                  }
                  src={previewUrl(active, docTab, previewBust)}
                  className="min-h-0 w-full flex-1 bg-white"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
