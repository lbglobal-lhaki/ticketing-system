/** Short terminal label for tickets and email, e.g. "1". */
export function formatTerminal(value?: string | null) {
  const t = (value ?? "").trim();
  return t || "–";
}

export function terminalIsSet(value?: string | null) {
  return Boolean((value ?? "").trim());
}
