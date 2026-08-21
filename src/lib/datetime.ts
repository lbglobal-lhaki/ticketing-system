function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseDateTimeParts(value: string) {
  const match = value
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    throw new Error("Invalid date/time");
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? "0"),
  };
}

/** Format a Date for hold/due fields in the viewer's local timezone. */
export function toDateTimeLocalValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Flight schedules are published as local wall-clock (KB920 departs 09:00,
 * arrives 00:25+1). Store those digits as UTC so DST / server TZ cannot add
 * an hour on save, and so tickets print the same numbers the admin typed.
 */
export function toFlightDateTimeLocalValue(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function parseFlightDateTime(value: string): Date {
  const { year, month, day, hour, minute, second } = parseDateTimeParts(value);
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid date/time");
  }
  return d;
}

/**
 * Parse `<input type="datetime-local" />` as a real instant in the admin's
 * timezone. Used for hold expiry / invoice due — not flight schedules.
 *
 * Prefer `timeZone` (IANA, DST-aware for that date). `tzOffsetMinutes` is the
 * legacy "offset right now" path and is wrong across DST changes.
 */
export function parseDateTimeLocal(
  value: string,
  tzOffsetMinutes = 0,
  timeZone?: string,
): Date {
  const { year, month, day, hour, minute, second } = parseDateTimeParts(value);
  if (timeZone) {
    return zonedWallClockToUtc(
      year,
      month,
      day,
      hour,
      minute,
      second,
      timeZone,
    );
  }
  const utcMs =
    Date.UTC(year, month - 1, day, hour, minute, second) +
    tzOffsetMinutes * 60_000;
  const d = new Date(utcMs);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid date/time");
  }
  return d;
}

/** Offset of `timeZone` at instant `date`: local-as-UTC-ms minus UTC-ms. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    num("year"),
    num("month") - 1,
    num("day"),
    num("hour"),
    num("minute"),
    num("second"),
  );
  return asUtc - date.getTime();
}

function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = wallAsUtc - tzOffsetMs(new Date(wallAsUtc), timeZone);
  instant = wallAsUtc - tzOffsetMs(new Date(instant), timeZone);
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid date/time");
  }
  return d;
}

/** Calendar date in the viewer's local timezone (`YYYY-MM-DD`). */
export function toLocalYmd(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Calendar date of a stored flight wall-clock (`YYYY-MM-DD`). */
export function toFlightYmd(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const FLIGHT_TZ = "UTC";

/** Admin flights list — the wall-clock the admin typed. */
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
    hour12: false,
    timeZone: FLIGHT_TZ,
  });
}

export function formatFlightClock(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
    timeZone: FLIGHT_TZ,
  }).format(d);
}

export function formatFlightDate(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: FLIGHT_TZ,
  }).format(d);
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
