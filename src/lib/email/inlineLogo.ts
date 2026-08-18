import { existsSync, readFileSync } from "fs";
import path from "path";
import type { EmailAttachment } from "@/lib/email/send";

/** CID referenced by `<img src="cid:lb-brand-logo">` in outbound HTML. */
export const EMAIL_LOGO_CID = "lb-brand-logo";

const LOGO_CANDIDATES = [
  ["public", "loogo.png"],
  ["public", "drukair_logo.png"],
];

function escapeAlt(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Logo tag for emails — CID, not a remote URL (Gmail blocks / 500s those). */
export function emailLogoImgHtml(alt: string) {
  return `<img src="cid:${EMAIL_LOGO_CID}" alt="${escapeAlt(alt)}" width="80" height="80" style="display:block;border:0;outline:none;text-decoration:none;width:80px;height:80px" />`;
}

export function brandLogoAttachment(): EmailAttachment | null {
  for (const parts of LOGO_CANDIDATES) {
    const file = path.join(process.cwd(), ...parts);
    if (!existsSync(file)) continue;
    return {
      filename: "logo.png",
      content: readFileSync(file),
      contentType: "image/png",
      cid: EMAIL_LOGO_CID,
      contentDisposition: "inline",
    };
  }
  return null;
}
