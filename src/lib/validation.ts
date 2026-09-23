/**
 * Validation for untrusted participant/official input (security item 66).
 *
 * The platform has no AI feature, so "invalid AI output" has no direct
 * analogue. What it *does* have is a lot of free text and URLs that are written
 * by participants and then rendered as links, headings and cards: submission
 * titles, taglines, tags, repository/demo/video URLs, comments. Those are the
 * same trusted-boundary problem, so this module is the platform's answer to it:
 *
 *  - URLs must be `http(s)` — a stored `javascript:` or `data:` URL becomes an
 *    XSS payload the moment a teammate, judge or visitor clicks the rendered
 *    link.
 *  - URLs are length-capped and must parse.
 *  - Free text is length-capped, control characters (including newlines in
 *    single-line fields) are stripped, and a field that is only whitespace is
 *    rejected.
 *
 * Everything here is pure so it is unit-tested directly.
 */

/** Longest URL we will store (browsers stop at ~2k; 2048 is a safe ceiling). */
export const MAX_URL_LENGTH = 2048;
export const MAX_TITLE_LENGTH = 120;
export const MAX_TAGLINE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 10_000;
/** `tag1,tag2` — bounded so a submission cannot smuggle a novel-sized blob. */
export const MAX_TAGS_LENGTH = 200;
export const MAX_TAG_COUNT = 12;
export const MAX_COMMENT_LENGTH = 2_000;
export const MAX_NAME_LENGTH = 120;

const UNSAFE_SCHEMES = /^\s*(javascript|data|vbscript|file|blob)\s*:/i;

/**
 * True when `url` is an empty string (link omitted) or a well-formed http(s)
 * URL. Anything else — including scheme-relative `//evil.com`, which browsers
 * resolve against the page origin — is rejected.
 */
export function isSafeHttpUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (trimmed === "") return true; // optional field, intentionally blank
  if (trimmed.length > MAX_URL_LENGTH) return false;
  if (UNSAFE_SCHEMES.test(trimmed)) return false;
  // Reject protocol-relative and back-slash variants before parsing: `//x`,
  // `/\x` and `\\x` are all treated as absolute by some browsers.
  if (/^[\\/]{2}/.test(trimmed)) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

/**
 * Normalise free text: strip control characters, collapse runs of whitespace
 * (newlines included when `singleLine`), and trim.
 */
export function sanitizeText(value: string, singleLine = true): string {
  let text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  text = singleLine ? text.replace(/\s+/g, " ") : text.replace(/\r\n?/g, "\n");
  return text.trim();
}

/**
 * Validate a free-text field. Returns the cleaned value or throws with a
 * message naming the field — the caller should pass a human label.
 */
export function requireText(
  label: string,
  value: string,
  options: { max?: number; singleLine?: boolean; required?: boolean } = {},
): string {
  const max = options.max ?? MAX_DESCRIPTION_LENGTH;
  const required = options.required ?? false;
  const cleaned = sanitizeText(value ?? "", options.singleLine ?? true);
  if (required && cleaned.length === 0) throw new Error(`${label} is required`);
  if (cleaned.length > max) throw new Error(`${label} must be at most ${max} characters`);
  return cleaned;
}

/** Validate a URL field (empty allowed unless `required`). */
export function validateUrl(label: string, url: string, required = false): string {
  const trimmed = (url ?? "").trim();
  if (!trimmed) {
    if (required) throw new Error(`${label} is required`);
    return "";
  }
  if (!isSafeHttpUrl(trimmed)) {
    throw new Error(`${label} must be a valid http(s) URL`);
  }
  return trimmed;
}

/**
 * Normalise a comma-separated tag list: trimmed, de-duplicated
 * case-insensitively, count- and length-bounded.
 */
export function normalizeTags(raw: string): string {
  const tags = (raw ?? "")
    .split(",")
    .map((tag) => tag.trim().replace(/\s+/g, " "))
    .filter((tag) => tag.length > 0);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(tag);
  }
  if (unique.length > MAX_TAG_COUNT) {
    throw new Error(`At most ${MAX_TAG_COUNT} tags are allowed`);
  }
  const joined = unique.join(",");
  if (joined.length > MAX_TAGS_LENGTH) {
    throw new Error(`Tags must be at most ${MAX_TAGS_LENGTH} characters in total`);
  }
  return joined;
}
