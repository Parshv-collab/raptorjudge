/**
 * Webhook target validation (security items 64 + 67).
 *
 * A webhook is the one place where this platform makes an *outbound* request to
 * an address a user typed in, which makes it the natural SSRF/leak vector:
 *
 *  - a target URL that is not http(s) would still be handed to `fetch`, so a
 *    stored `file:`/`gopher:`/`data:` value is an attempt at protocol smuggling;
 *  - credentials embedded in the URL (`https://user:pass@host/…`) are both a
 *    credential leak (they end up in delivery logs) and a redirect-vs-origin
 *    confusion trick;
 *  - cloud instance-metadata endpoints (`169.254.169.254`,
 *    `metadata.google.internal`, `fd00:ec2::254`) hand out short-lived cloud
 *    credentials to anything that can reach them, so a webhook pointed at one
 *    is a credential-exfiltration primitive rather than a notification;
 *  - an unbounded URL is a simple resource-exhaustion input.
 *
 * Loopback and private RFC1918 targets stay *allowed*: this is a self-hosted,
 * offline-first platform and routing a hook to a receiver on the operator's own
 * network is the normal case. The blocklist is deliberately narrow — metadata
 * services and non-http(s) schemes only.
 *
 * Pure and dependency-free so it is unit-tested directly and reused by the
 * acceptance suite.
 */

/** Arbitrary but generous ceiling; matches the participant URL cap. */
export const MAX_WEBHOOK_URL_LENGTH = 2048;

/** Hostnames/IPs that serve instance credentials rather than notifications. */
const BLOCKED_HOSTS = new Set([
  "metadata.google.internal", // GCP
  "metadata.goog",
  "instance-data", // AWS legacy alias
  "169.254.169.254", // AWS/GCP/Azure IMDS
  "169.254.170.2", // AWS ECS task credentials
  "fd00:ec2::254", // AWS IMDSv2 IPv6
  "100.100.100.200", // Alibaba Cloud metadata
]);

/** Schemes we are willing to hand to `fetch` for delivery. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Why `url` may not be used as a webhook target, or `null` when it is fine.
 * The reason strings are safe to log and to return to an organizer.
 */
export function blockedWebhookReason(url: unknown): string | null {
  if (typeof url !== "string") return "targetUrl must be a string";
  const trimmed = url.trim();
  if (trimmed.length === 0) return "targetUrl is required";
  if (trimmed.length > MAX_WEBHOOK_URL_LENGTH) {
    return `targetUrl must be at most ${MAX_WEBHOOK_URL_LENGTH} characters`;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "targetUrl must be an absolute http(s) URL";
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return "targetUrl must use http or https";
  }
  // `new URL("http://user:pass@host")` parses happily; ours must not.
  if (parsed.username || parsed.password) {
    return "targetUrl must not embed credentials";
  }
  if (!parsed.hostname) return "targetUrl must include a host";

  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTS.has(host)) {
    return "targetUrl must not point at a cloud metadata service";
  }
  // `0.0.0.0` and the unspecified IPv6 address are not routable receivers.
  if (host === "0.0.0.0" || host === "::") {
    return "targetUrl must not use an unspecified address";
  }
  return null;
}

/** True when `url` is an acceptable webhook delivery target. */
export function isSafeWebhookTarget(url: unknown): boolean {
  return blockedWebhookReason(url) === null;
}

/** Validating accessor for write paths; throws with the blocked reason. */
export function assertWebhookTargetUrl(url: unknown): string {
  const reason = blockedWebhookReason(url);
  if (reason) throw new Error(reason);
  return String(url).trim();
}
