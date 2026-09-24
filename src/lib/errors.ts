/**
 * Formats Convex errors into user-friendly strings.
 * Strips request IDs, stack traces, handler filenames, and internal client wrappers.
 */
export function humanizeConvexError(err: unknown): string {
  if (!err) return "Something went wrong. Please try again.";

  let raw = "";
  if (typeof err === "string") {
    raw = err;
  } else if (err instanceof Error) {
    raw = err.message;
  } else if (typeof err === "object" && err !== null && "message" in err) {
    raw = String((err as { message: unknown }).message);
  } else {
    raw = String(err);
  }

  // Extract after "Uncaught Error:" if present
  if (raw.includes("Uncaught Error:")) {
    raw = raw.split("Uncaught Error:")[1];
  }

  // Strip from " at handler" onward
  if (raw.includes(" at handler")) {
    raw = raw.split(" at handler")[0];
  }

  // Strip leading [Request ID: ...] or CONVEX M(...) or Server Error prefixes
  raw = raw.replace(/^\[Request ID:[^\]]+\]\s*/i, "");
  raw = raw.replace(/^CONVEX\s+[A-Z]\([^)]+\)\]?\s*/i, "");
  raw = raw.replace(/^Server Error\s*/i, "");

  // Strip "Called by client" suffix
  raw = raw.replace(/\s*Called by client$/i, "");

  // Clean trailing punctuation / brackets leftover
  raw = raw.trim();

  if (!raw || raw === "Error") {
    return "Something went wrong. Please try again.";
  }

  return raw;
}
