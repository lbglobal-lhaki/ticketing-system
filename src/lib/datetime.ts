function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Format a Date for <input type="datetime-local" /> in local time. */
export function toDateTimeLocalValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Parse `<input type="datetime-local" />` using the browser's timezone
 * offset (minutes from `Date#getTimezoneOffset`). Without this, Node/UTC
 * servers treat "2026-08-05T14:30" as UTC and flight times shift on save.
 */
export function parseDateTimeLocal(
  value: string,
  tzOffsetMinutes = 0,
): Date {
  const match = value
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    throw new Error("Invalid date/time");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");
  // Components are wall-clock in the admin's TZ; offset converts to UTC ms.
  const utcMs =
    Date.UTC(year, month - 1, day, hour, minute, second) +
    tzOffsetMinutes * 60_000;
  const d = new Date(utcMs);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid date/time");
  }
  return d;
}

/** Admin flights list — date + time in en-AU. */
export function formatFlightDateTime(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function searchWindow(date: string) {
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);
  const windowStart = new Date(dayStart);
  windowStart.setUTCDate(windowStart.getUTCDate() - 1);
  const windowEnd = new Date(dayEnd);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 14);
  return { windowStart, windowEnd };
}
