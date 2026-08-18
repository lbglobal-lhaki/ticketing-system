import { randomBytes } from "crypto";
import { getBrand } from "@/lib/branding";
import { brandLogoAttachment, EMAIL_LOGO_CID } from "@/lib/email/inlineLogo";

export type EmailAttachment = {
  filename: string;
  /** String for text-based attachments (HTML), Buffer for binary ones (PDF). */
  content: string | Buffer;
  contentType?: string;
  /** Inline CID so HTML can use `src="cid:…"`. */
  cid?: string;
  contentDisposition?: "inline" | "attachment";
};

/** Which real inbox sends this email. */
export type MailboxName = "ticketing" | "accounts";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
  /** Defaults to "ticketing" when omitted. */
  mailbox?: MailboxName;
};

type MailboxConfig = {
  address: string;
  displayName: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
};

const MAILBOX_ENV_PREFIX: Record<MailboxName, string> = {
  ticketing: "TICKETING",
  accounts: "ACCOUNTS",
};

/** Reads TICKETING_SMTP_* / ACCOUNTS_SMTP_* — two real Gmail inboxes. */
function readMailboxConfig(mailbox: MailboxName): MailboxConfig | null {
  const prefix = MAILBOX_ENV_PREFIX[mailbox];
  const user = process.env[`${prefix}_SMTP_USER`]?.trim();
  // Gmail app passwords are shown as "xxxx xxxx xxxx xxxx" — spaces are
  // decorative. Some SMTP servers reject them, so strip before auth.
  const pass = process.env[`${prefix}_SMTP_PASS`]?.trim().replace(/\s+/g, "");
  if (!user || !pass) return null;

  const brand = getBrand();
  const defaultDisplayName =
    mailbox === "accounts"
      ? `${brand.issuingAgent} Accounts`
      : brand.reservationsTeam;

  return {
    address: process.env[`${prefix}_EMAIL`]?.trim() || user,
    displayName:
      process.env[`${prefix}_DISPLAY_NAME`]?.trim() || defaultDisplayName,
    // Per-mailbox host/port/secure > shared GOOGLE_SMTP_* > Gmail defaults.
    host:
      process.env[`${prefix}_SMTP_HOST`]?.trim() ||
      process.env.GOOGLE_SMTP_HOST?.trim() ||
      "smtp.gmail.com",
    port: Number(
      process.env[`${prefix}_SMTP_PORT`] || process.env.GOOGLE_SMTP_PORT || "465",
    ),
    secure:
      (process.env[`${prefix}_SMTP_SECURE`] ?? process.env.GOOGLE_SMTP_SECURE) !==
      "false",
    user,
    pass,
  };
}

export function isMailboxConfigured(mailbox: MailboxName) {
  return Boolean(readMailboxConfig(mailbox));
}

export function isEmailConfigured() {
  return (
    isMailboxConfigured("ticketing") ||
    isMailboxConfigured("accounts") ||
    Boolean(
      process.env.RESEND_API_KEY?.trim() ||
        (process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim()),
    )
  );
}

/** Legacy single-sender fallback, used only if the mailbox above isn't set. */
function legacyFromAddress() {
  const brand = getBrand();
  return (
    process.env.EMAIL_FROM?.trim() ||
    `${brand.reservationsTeam} <${brand.supportEmail}>`
  );
}

function domainOf(address: string) {
  const domain = address.split("@")[1]?.trim().toLowerCase();
  return domain || "lbglobal.com.au";
}

function nodemailerAttachments(input: SendEmailInput) {
  return input.attachments?.map((a) => ({
    filename: a.filename,
    content: a.content,
    contentType: a.contentType || "text/html",
    cid: a.cid,
    contentDisposition:
      a.contentDisposition ?? (a.cid ? "inline" : "attachment"),
  }));
}

async function sendViaNodemailer(
  input: SendEmailInput,
  config: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    fromName: string;
    fromAddress: string;
  },
): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });
    const info = await transporter.sendMail({
      from: {
        name: config.fromName,
        address: config.fromAddress,
      },
      // MAIL FROM must be the mailbox we authenticated as, or Gmail/Yahoo
      // treat the message as spoofed and dump it in spam.
      envelope: {
        from: config.user,
        to: input.to,
      },
      replyTo: config.fromAddress,
      // Nodemailer's default Message-ID uses the machine hostname
      // (e.g. DESKTOP-XXXX). That does not match lbglobal.com.au and is a
      // classic spam signal. Pin it to the From domain.
      messageId: `<${randomBytes(12).toString("hex")}@${domainOf(config.fromAddress)}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: nodemailerAttachments(input),
    });
    return { ok: true, id: info.messageId };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send email";
    console.error("[email:error]", message);
    return { ok: false, error: message };
  }
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<{ ok: true; id?: string } | { ok: false; error: string; skipped?: boolean }> {
  const to = input.to?.trim();
  if (!to) {
    return { ok: false, error: "Missing recipient email" };
  }
  const payload = { ...input, to };
  if (
    payload.html.includes(`cid:${EMAIL_LOGO_CID}`) &&
    !payload.attachments?.some((a) => a.cid === EMAIL_LOGO_CID)
  ) {
    const logo = brandLogoAttachment();
    if (logo) {
      payload.attachments = [logo, ...(payload.attachments ?? [])];
    }
  }

  const mailbox = payload.mailbox ?? "ticketing";
  const other: MailboxName = mailbox === "ticketing" ? "accounts" : "ticketing";
  const configs: { name: MailboxName; config: MailboxConfig }[] = [];
  const primary = readMailboxConfig(mailbox);
  if (primary) configs.push({ name: mailbox, config: primary });
  const fallback = readMailboxConfig(other);
  if (fallback) configs.push({ name: other, config: fallback });

  let lastError = "";
  for (const { name, config } of configs) {
    if (name !== mailbox) {
      console.warn(
        `[email] "${mailbox}" mailbox unavailable or failed; sending via "${name}"`,
      );
    }
    const result = await sendViaNodemailer(payload, {
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.user,
      pass: config.pass,
      // From address = the mailbox we log in as. A different TICKETING_EMAIL
      // would look like "sent on behalf of" and is a spam magnet.
      fromName: config.displayName,
      fromAddress: config.user,
    });
    if (result.ok) return result;
    lastError = result.error;
  }

  // Legacy fallback (pre-dual-mailbox setups): single RESEND_API_KEY or SMTP_*.
  if (process.env.RESEND_API_KEY?.trim()) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const result = await resend.emails.send({
        from: legacyFromAddress(),
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        attachments: payload.attachments?.map((a) => ({
          filename: a.filename,
          content: Buffer.isBuffer(a.content)
            ? a.content
            : Buffer.from(a.content, "utf8"),
          contentType: a.contentType || "text/html",
          contentId: a.cid,
        })),
      });
      if (result.error) {
        return { ok: false, error: result.error.message };
      }
      return { ok: true, id: result.data?.id };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to send email";
      console.error("[email:error]", message);
      return { ok: false, error: message };
    }
  }

  if (process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim()) {
    return sendViaNodemailer(payload, {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      user: process.env.SMTP_USER,
      pass: (process.env.SMTP_PASS || "").replace(/\s+/g, ""),
      fromName: getBrand().reservationsTeam,
      fromAddress: process.env.SMTP_USER,
    });
  }

  if (lastError) {
    return { ok: false, error: lastError };
  }

  console.info("[email:skipped]", {
    to: payload.to,
    subject: payload.subject,
    mailbox,
    reason: `No ${MAILBOX_ENV_PREFIX[mailbox]}_SMTP_USER/_SMTP_PASS, RESEND_API_KEY, or SMTP_* configured`,
  });
  return {
    ok: false,
    skipped: true,
    error: `Email not configured. Set ${MAILBOX_ENV_PREFIX[mailbox]}_SMTP_USER / ${MAILBOX_ENV_PREFIX[mailbox]}_SMTP_PASS in .env (or the accounts mailbox).`,
  };
}
