import { getBrand } from "@/lib/branding";
import { formatCargoAnswer } from "@/lib/cargo/submit";

export type CargoDocumentData = {
  id: string;
  status: "new" | "reviewed" | "closed";
  submitterName: string | null;
  email: string | null;
  phone: string | null;
  answers: Record<string, string | number | boolean | string[]>;
  notes: string | null;
  googleResponseId: string | null;
  submittedAt: Date | null;
  createdAt: Date;
};

function esc(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function longDate(date: Date) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Australia/Sydney",
  }).format(date);
}

function statusLabel(status: CargoDocumentData["status"]) {
  if (status === "new") return "New";
  if (status === "reviewed") return "Reviewed";
  return "Closed";
}

/** A4 print/PDF HTML for a cargo enquiry. */
export function renderCargoDocumentHtml(data: CargoDocumentData) {
  const brand = getBrand();
  const when = data.submittedAt || data.createdAt;
  const answerRows = Object.entries(data.answers);

  const styles = `
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #fff;
      color: #111;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: 28px 36px 88px;
      position: relative;
    }
    .topbar { height: 10px; background: #0b2c5a; margin: -28px -36px 22px; }
    .brand {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #0b2c5a;
    }
    h1 {
      margin: 10px 0 6px;
      font-size: 28px;
      letter-spacing: 0.02em;
    }
    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 24px;
      margin: 18px 0 22px;
      font-size: 13px;
      line-height: 1.55;
    }
    .meta strong { display: inline-block; min-width: 88px; }
    .badge {
      display: inline-block;
      margin-top: 4px;
      padding: 3px 8px;
      border: 1px solid #0b2c5a;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #0b2c5a;
    }
    h2 {
      margin: 0 0 10px;
      font-size: 13px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #0b2c5a;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12.5px;
      margin-bottom: 18px;
    }
    th, td {
      border-bottom: 1px solid #d7dde5;
      padding: 9px 6px;
      text-align: left;
      vertical-align: top;
    }
    th {
      width: 38%;
      color: #445;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.04em;
    }
    .notes {
      border: 1px solid #c5ced8;
      padding: 12px 14px;
      font-size: 12.5px;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .footer {
      position: absolute;
      left: 36px; right: 36px; bottom: 22px;
      border-top: 2px solid #f5c518;
      padding-top: 10px;
      font-size: 11px;
      color: #333;
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Cargo ${esc(data.id)}</title>
  <style>${styles}</style>
</head>
<body>
  <section class="page">
    <div class="topbar"></div>
    <div class="brand">${esc(brand.issuingAgent)} · Cargo</div>
    <h1>Cargo enquiry</h1>
    <div class="badge">${esc(statusLabel(data.status))}</div>

    <div class="meta">
      <div><strong>Received:</strong> ${esc(longDate(when))}</div>
      <div><strong>Ref:</strong> ${esc(data.id.slice(-10).toUpperCase())}</div>
      <div><strong>Name:</strong> ${esc(data.submitterName || "—")}</div>
      <div><strong>Email:</strong> ${esc(data.email || "—")}</div>
      <div><strong>Phone:</strong> ${esc(data.phone || "—")}</div>
      <div><strong>Source:</strong> ${esc(data.googleResponseId ? "Google Form" : "Admin")}</div>
    </div>

    <h2>Form answers</h2>
    <table>
      <tbody>
        ${
          answerRows.length === 0
            ? `<tr><td colspan="2">No answers recorded.</td></tr>`
            : answerRows
                .map(
                  ([key, value]) =>
                    `<tr><th>${esc(key)}</th><td>${esc(formatCargoAnswer(value))}</td></tr>`,
                )
                .join("")
        }
      </tbody>
    </table>

    ${
      data.notes
        ? `<h2>Admin notes</h2><div class="notes">${esc(data.notes)}</div>`
        : ""
    }

    <div class="footer">
      <span>${esc(brand.agentPhonePrimary)} | ${esc(brand.agentPhoneSecondary)}</span>
      <span>${esc(brand.agentWebsite)}</span>
      <span>${esc(brand.agentEmail)}</span>
    </div>
  </section>
</body>
</html>`;
}
