import { randomBytes, randomInt } from "crypto";

export function getBrand() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    "http://localhost:3000";
  const logoPath = "/drukair_logo.png";

  return {
    airlineName:
      process.env.BRAND_AIRLINE_NAME?.trim() ||
      "Drukair – Royal Bhutan Airlines",
    shortName: process.env.BRAND_SHORT_NAME?.trim() || "L&B Global",
    /** Public path for the brand mark (UI). */
    logoPath,
    /** Absolute logo URL for emails / external HTML. */
    logoUrl: `${siteUrl.replace(/\/$/, "")}${logoPath}`,
    bookingPrefix: process.env.BRAND_BOOKING_PREFIX?.trim() || "LBG",
    reservationsTeam:
      process.env.BRAND_RESERVATIONS_TEAM?.trim() || "Chartered Flight Team",
    supportEmail:
      process.env.BRAND_SUPPORT_EMAIL?.trim() || "ticketing@lbglobal.com.au",
    siteUrl,
    carryOnKg: process.env.BRAND_CARRY_ON_KG?.trim() || "7kg",
    checkedKg: process.env.BRAND_CHECKED_KG?.trim() || "23kg",
    arriveHoursBefore: Number(process.env.BRAND_ARRIVE_HOURS || "3"),
    /** Issuing agent shown on travel docs / airfare invoices (L&B Global). */
    issuingAgent:
      process.env.BRAND_ISSUING_AGENT?.trim() || "L&B Global",
    issuingAirline:
      process.env.BRAND_ISSUING_AIRLINE?.trim() || "DrukAir",
    agentPhonePrimary:
      process.env.BRAND_AGENT_PHONE_PRIMARY?.trim() || "+61 424 919 833",
    agentPhoneSecondary:
      process.env.BRAND_AGENT_PHONE_SECONDARY?.trim() || "+61 451 106 077",
    agentWebsite:
      process.env.BRAND_AGENT_WEBSITE?.trim() || "www.lbglobal.com.au",
    agentEmail:
      process.env.BRAND_AGENT_EMAIL?.trim() ||
      process.env.BRAND_SUPPORT_EMAIL?.trim() ||
      "ticketing@lbglobal.com.au",
    /** Where customers send bank-transfer payment screenshots for confirmation. */
    paymentProofEmail:
      process.env.BRAND_PAYMENT_PROOF_EMAIL?.trim() ||
      "accounts@lbglobal.com.au",
    invoiceAccountNumber:
      process.env.BRAND_INVOICE_ACCOUNT_NUMBER?.trim() || "CA216212900",
    invoiceBusinessTpn:
      process.env.BRAND_INVOICE_BUSINESS_TPN?.trim() || "LAC00357",
    charterTagline:
      process.env.BRAND_CHARTER_TAGLINE?.trim() ||
      "YOUR JOURNEY, OUR COMMITMENT",
  };
}

export function formatDocDate(date: Date) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(date);
}

export function formatDocDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Australia/Sydney",
  }).format(date);
}

export function formatDocTime(date: Date) {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Australia/Sydney",
  }).format(date);
}

/** Unguessable secret for document / confirmation links. */
export function makeAccessToken() {
  return randomBytes(24).toString("base64url");
}

export function makeBookingRef(prefix = getBrand().bookingPrefix) {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const rand = randomBytes(5).toString("hex").toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
}

export function makeTicketNumber() {
  const rand = randomInt(100_000_000, 1_000_000_000);
  return `ET-${rand}`;
}

export function makeInvoiceNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const rand = randomBytes(4).toString("hex").toUpperCase();
  return `INV-${stamp}-${rand}`;
}

/** Bank-transfer seat hold window (default 48 hours). */
export function bankHoldExpiresAt(from = new Date(), hours = 48) {
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

/** @deprecated use bankHoldExpiresAt — kept for call sites expecting a due date */
export function invoiceDueDate(from = new Date(), _days = 2) {
  return bankHoldExpiresAt(from, 48);
}
