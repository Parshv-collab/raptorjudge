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
