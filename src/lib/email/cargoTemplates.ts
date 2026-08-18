import { getBrand } from "@/lib/branding";
import type { CargoShipmentSummary } from "@/lib/cargo/parties";
import { emailLogoImgHtml } from "@/lib/email/inlineLogo";

function esc(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function line(label: string, value: string) {
  if (!value.trim()) return "";
  return `<tr>
    <td style="padding:4px 0;color:#64748B;width:140px;vertical-align:top">${esc(label)}</td>
    <td style="padding:4px 0;color:#0F172A">${esc(value)}</td>
  </tr>`;
}

function textLine(label: string, value: string) {
  if (!value.trim()) return "";
  return `${label}: ${value}\n`;
}

export type CargoNoticeTemplateInput = {
  role: "sender" | "receiver";
  shipment: CargoShipmentSummary;
  /** Where the receiver collects cargo (admin can fill before generate). */
  pickupLocation?: string;
  /** When cargo is expected to arrive / be ready (admin can fill). */
  arrivalNote?: string;
};

/** Builds editable subject/html/text drafts — admin must send manually. */
export function cargoNotificationEmail(input: CargoNoticeTemplateInput) {
  const brand = getBrand();
  const { shipment, role } = input;
  const pickup =
    input.pickupLocation?.trim() ||
    (role === "receiver"
      ? `${shipment.destinationLabel} — confirm pickup with ${brand.issuingAgent}`
      : "");
  const arrival =
    input.arrivalNote?.trim() ||
    shipment.flightDate ||
    "To be confirmed by our cargo team";

  if (role === "sender") {
    const subject = `Cargo update — Parcel ${shipment.parcelNumber} to ${shipment.destinationLabel}`;
    const greeting = shipment.sender.name || "Customer";
    const html = `
  <div style="font-family:Georgia,serif;color:#0F172A;line-height:1.55;max-width:640px">
    <p style="margin:0 0 12px">
      ${emailLogoImgHtml(brand.shortName)}
    </p>
    <p style="color:#0b2c5a;letter-spacing:0.12em;text-transform:uppercase;font-size:12px">${esc(brand.issuingAgent)} · Cargo</p>
    <h1 style="font-size:22px;margin:8px 0 16px">Your cargo shipment update</h1>
    <p>Dear ${esc(greeting)},</p>
    <p>This is an update for your cargo shipment with <strong>${esc(brand.issuingAgent)}</strong>.</p>
    <h2 style="font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:#0b2c5a;border-bottom:1px solid #E2E8F0;padding-bottom:6px">Parcel details</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 16px">
      ${line("Parcel number", shipment.parcelNumber)}
      ${line("Route", `${shipment.originLabel} → ${shipment.destinationLabel}`)}
      ${line("Flight / timing", shipment.flightDate || arrival)}
      ${line("Packages", shipment.packages)}
      ${line("Weight", shipment.weight ? `${shipment.weight} kg` : "")}
      ${line("Description", shipment.description)}
    </table>
    <h2 style="font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:#0b2c5a;border-bottom:1px solid #E2E8F0;padding-bottom:6px">Where it is going</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 16px">
      ${line("Delivering to", shipment.destinationLabel)}
      ${line("Receiver", shipment.receiver.name)}
      ${line("Receiver phone", shipment.receiver.phone)}
      ${line("Receiver address", shipment.receiver.address)}
      ${line("Pickup / delivery point", pickup)}
    </table>
    <p style="font-size:13px;color:#64748B">If any detail looks incorrect, reply to this email or call us before the flight.</p>
    <p>Kind regards,<br/>${esc(brand.reservationsTeam)}<br/>${esc(brand.issuingAgent)}<br/>
    ${esc(brand.agentPhonePrimary)}${brand.agentPhoneSecondary ? ` · ${esc(brand.agentPhoneSecondary)}` : ""}<br/>
    ${esc(brand.agentEmail)}</p>
  </div>`;

    const text = `Dear ${greeting},

This is an update for your cargo shipment with ${brand.issuingAgent}.

Parcel number: ${shipment.parcelNumber}
Route: ${shipment.originLabel} → ${shipment.destinationLabel}
${textLine("Flight / timing", shipment.flightDate || arrival)}${textLine("Packages", shipment.packages)}${textLine("Weight", shipment.weight ? `${shipment.weight} kg` : "")}${textLine("Description", shipment.description)}
Delivering to: ${shipment.destinationLabel}
${textLine("Receiver", shipment.receiver.name)}${textLine("Receiver phone", shipment.receiver.phone)}${textLine("Receiver address", shipment.receiver.address)}${textLine("Pickup / delivery point", pickup)}
Kind regards,
${brand.reservationsTeam}
${brand.issuingAgent}
${brand.agentPhonePrimary}${brand.agentPhoneSecondary ? ` · ${brand.agentPhoneSecondary}` : ""}
${brand.agentEmail}`;

    return {
      subject,
      html,
      text,
      toEmail: shipment.sender.email,
      toName: shipment.sender.name,
      pickupLocation: pickup,
      arrivalNote: arrival,
    };
  }

  const subject = `Cargo ready for collection — Parcel ${shipment.parcelNumber}`;
  const greeting = shipment.receiver.name || "Customer";
  const html = `
  <div style="font-family:Georgia,serif;color:#0F172A;line-height:1.55;max-width:640px">
    <p style="margin:0 0 12px">
      ${emailLogoImgHtml(brand.shortName)}
    </p>
    <p style="color:#0b2c5a;letter-spacing:0.12em;text-transform:uppercase;font-size:12px">${esc(brand.issuingAgent)} · Cargo</p>
    <h1 style="font-size:22px;margin:8px 0 16px">Incoming cargo notification</h1>
    <p>Dear ${esc(greeting)},</p>
    <p>A cargo shipment is being sent to you via <strong>${esc(brand.issuingAgent)}</strong>. Please keep this parcel number for collection.</p>
    <h2 style="font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:#0b2c5a;border-bottom:1px solid #E2E8F0;padding-bottom:6px">Parcel details</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 16px">
      ${line("Parcel number", shipment.parcelNumber)}
      ${line("From", shipment.originLabel)}
      ${line("To", shipment.destinationLabel)}
      ${line("Expected arrival", arrival)}
      ${line("Packages", shipment.packages)}
      ${line("Weight", shipment.weight ? `${shipment.weight} kg` : "")}
      ${line("Description", shipment.description)}
    </table>
    <h2 style="font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:#0b2c5a;border-bottom:1px solid #E2E8F0;padding-bottom:6px">Sender</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 16px">
      ${line("Name", shipment.sender.name)}
      ${line("Phone", shipment.sender.phone)}
      ${line("Email", shipment.sender.email)}
      ${line("Address", shipment.sender.address)}
    </table>
    <h2 style="font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:#0b2c5a;border-bottom:1px solid #E2E8F0;padding-bottom:6px">Pickup</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 16px">
      ${line("Pickup location", pickup)}
      ${line("When", arrival)}
    </table>
    <p style="font-size:13px;color:#64748B">Bring photo ID that matches the receiver name. Contact us if you need to change collection arrangements.</p>
    <p>Kind regards,<br/>${esc(brand.reservationsTeam)}<br/>${esc(brand.issuingAgent)}<br/>
    ${esc(brand.agentPhonePrimary)}${brand.agentPhoneSecondary ? ` · ${esc(brand.agentPhoneSecondary)}` : ""}<br/>
    ${esc(brand.agentEmail)}</p>
  </div>`;

  const text = `Dear ${greeting},

A cargo shipment is being sent to you via ${brand.issuingAgent}.

Parcel number: ${shipment.parcelNumber}
From: ${shipment.originLabel}
To: ${shipment.destinationLabel}
Expected arrival: ${arrival}
${textLine("Packages", shipment.packages)}${textLine("Weight", shipment.weight ? `${shipment.weight} kg` : "")}${textLine("Description", shipment.description)}
Sender: ${shipment.sender.name}
${textLine("Sender phone", shipment.sender.phone)}${textLine("Sender email", shipment.sender.email)}${textLine("Sender address", shipment.sender.address)}
Pickup location: ${pickup}
When: ${arrival}

Kind regards,
${brand.reservationsTeam}
${brand.issuingAgent}
${brand.agentPhonePrimary}${brand.agentPhoneSecondary ? ` · ${brand.agentPhoneSecondary}` : ""}
${brand.agentEmail}`;

  return {
    subject,
    html,
    text,
    toEmail: shipment.receiver.email,
    toName: shipment.receiver.name,
    pickupLocation: pickup,
    arrivalNote: arrival,
  };
}
