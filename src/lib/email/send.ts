import { getBrand } from "@/lib/branding";

export type EmailAttachment = {
  filename: string;
  /** String for text-based attachments (HTML), Buffer for binary ones (PDF). */
  content: string | Buffer;
  contentType?: string;
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
  const pass = process.env[`${prefix}_SMTP_PASS`]?.trim();
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

export async function sendEmail(
  input: SendEmailInput,
): Promise<{ ok: true; id?: string } | { ok: false; error: string; skipped?: boolean }> {
  try {
    if (!input.to) {
      return { ok: false, error: "Missing recipient email" };
    }

    const mailbox = input.mailbox ?? "ticketing";
    const mailboxConfig = readMailboxConfig(mailbox);

    if (mailboxConfig) {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: mailboxConfig.host,
        port: mailboxConfig.port,
        secure: mailboxConfig.secure,
        auth: { user: mailboxConfig.user, pass: mailboxConfig.pass },
      });
      const info = await transporter.sendMail({
        from: `${mailboxConfig.displayName} <${mailboxConfig.address}>`,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType || "text/html",
        })),
      });
      return { ok: true, id: info.messageId };
    }

    // Legacy fallback (pre-dual-mailbox setups): single RESEND_API_KEY or SMTP_*.
    if (process.env.RESEND_API_KEY?.trim()) {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const result = await resend.emails.send({
        from: legacyFromAddress(),
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: Buffer.isBuffer(a.content)
            ? a.content
            : Buffer.from(a.content, "utf8"),
          contentType: a.contentType || "text/html",
        })),
      });
      if (result.error) {
        return { ok: false, error: result.error.message };
      }
      return { ok: true, id: result.data?.id };
    }

    if (process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim()) {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS || "",
        },
      });
      const info = await transporter.sendMail({
        from: legacyFromAddress(),
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType || "text/html",
        })),
      });
      return { ok: true, id: info.messageId };
    }

    console.info("[email:skipped]", {
      to: input.to,
      subject: input.subject,
      mailbox,
      reason: `No ${MAILBOX_ENV_PREFIX[mailbox]}_SMTP_USER/_SMTP_PASS, RESEND_API_KEY, or SMTP_* configured`,
    });
    return {
      ok: false,
      skipped: true,
      error: `Email not configured for the "${mailbox}" mailbox. Set ${MAILBOX_ENV_PREFIX[mailbox]}_SMTP_USER / ${MAILBOX_ENV_PREFIX[mailbox]}_SMTP_PASS in .env`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send email";
    console.error("[email:error]", message);
    return { ok: false, error: message };
  }
}
