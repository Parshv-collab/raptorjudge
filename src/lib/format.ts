/**
 * Shared, locale-aware date and time formatting.
 *
 * Before this existed, screens mixed bare `toLocaleDateString()` with bare
 * `toLocaleString()`, and the latter renders seconds ("9/28/2026, 12:00:00 AM")
 * in most browsers — noisy for a deadline or a comment, but legitimate for an
 * audit-log row. These helpers pick one shape per context so the same field
 * reads the same everywhere:
 *
 *   formatDate     →  "9/28/2026"           (calendar dates, deadlines)
 *   formatDateTime →  "9/28/2026, 12:00 AM" (moments, no seconds)
 *
 * Both respect the viewer's locale, and both degrade to an em dash rather than
 * "Invalid Date" when handed a missing or unparseable value.
 */

type DateInput = number | string | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Calendar date only, e.g. "9/28/2026". */
export function formatDate(value: DateInput, fallback = "—"): string {
  const d = toDate(value);
  return d ? d.toLocaleDateString() : fallback;
}

/** Date and time to the minute, e.g. "9/28/2026, 12:00 AM". */
export function formatDateTime(value: DateInput, fallback = "—"): string {
  const d = toDate(value);
  return d
    ? d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
    : fallback;
}

/** Clock time only, e.g. "12:00 AM". Used by chat bubbles and delivery logs. */
export function formatTime(value: DateInput, fallback = "—"): string {
  const d = toDate(value);
  return d
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : fallback;
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
  ["second", 1],
];

/**
 * How long ago something happened, e.g. "just now" / "12 minutes ago" /
 * "yesterday".
 *
 * Deliberately *not* used for the fields a judge or organizer reasons about —
 * deadlines, score timestamps and audit rows stay absolute, because "2 hours
 * ago" is useless when the question is whether a submission beat a cutoff. It
 * is for activity feeds, where the reader only wants to know whether something
 * is fresh. Pair it with `formatDateTime` in a `title` so the exact moment is
 * still one hover away.
 */
export function formatRelative(value: DateInput, fallback = "—"): string {
  const d = toDate(value);
  if (!d) return fallback;
  const deltaSeconds = (d.getTime() - Date.now()) / 1000;
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, secondsPerUnit] of RELATIVE_UNITS) {
    if (Math.abs(deltaSeconds) >= secondsPerUnit || unit === "second") {
      return formatter.format(Math.round(deltaSeconds / secondsPerUnit), unit);
    }
  }
  return fallback;
}
