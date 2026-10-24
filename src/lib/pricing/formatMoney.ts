function moneyNumber(cents: number) {
  return new Intl.NumberFormat("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.max(0, cents) / 100);
}

/** Customer-facing Australian dollars: `AUD $200.00`. */
export function formatAudAmount(cents: number) {
  return `AUD $${moneyNumber(cents)}`;
}

/** Customer-facing Bhutanese Ngultrum: `BTN Nu. 14,000.00`. */
export function formatBtnAmount(chetrum: number) {
  return `BTN Nu. ${moneyNumber(chetrum)}`;
}

/** Separate lines so tight UI (option cards) can stack AUD above BTN. */
export function dualCargoPriceParts(
  audCents: number,
  btnCents = 0,
  suffix = "",
) {
  return {
    aud: `${formatAudAmount(audCents)}${suffix}`,
    btn: btnCents > 0 ? `${formatBtnAmount(btnCents)}${suffix}` : "",
  };
}

/**
 * Show both published currencies when admin has set a BTN price.
 * Example: `AUD $200.00 and BTN Nu. 14,000.00`
 */
export function formatDualCargoPrice(
  audCents: number,
  btnCents = 0,
  suffix = "",
) {
  const { aud, btn } = dualCargoPriceParts(audCents, btnCents, suffix);
  return btn ? `${aud} and ${btn}` : aud;
}
