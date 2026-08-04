export type BankTransferDetails = {
  accountName: string;
  bsb: string;
  accountNumber: string;
  bankName: string;
  swiftCode: string;
  bankAddress: string;
};

export function getBankTransferDetails(): BankTransferDetails | null {
  const accountName = process.env.BANK_ACCOUNT_NAME?.trim();
  const bsb = process.env.BANK_BSB?.trim();
  const accountNumber = process.env.BANK_ACCOUNT_NUMBER?.trim();
  const bankName = process.env.BANK_NAME?.trim() || "Commonwealth Bank";
  const swiftCode =
    process.env.BANK_SWIFT?.trim() ||
    process.env.BANK_SWIFT_CODE?.trim() ||
    "CTBAAU2S";
  const bankAddress =
    process.env.BANK_ADDRESS?.trim() ||
    "Commonwealth Bank of Australia, 217a Main St, Osborne Park WA 6017";

  if (!accountName || !bsb || !accountNumber) return null;

  return { accountName, bsb, accountNumber, bankName, swiftCode, bankAddress };
}

export function isBankTransferConfigured() {
  return getBankTransferDetails() !== null;
}

export { makeInvoiceNumber } from "@/lib/branding";

/** Prefer full booking reference (template style). */
export function makeBankReference(bookingRef: string) {
  return bookingRef;
}
