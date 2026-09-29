import { describe, expect, it } from "vitest";
import {
  MAX_WEBHOOK_URL_LENGTH,
  assertWebhookTargetUrl,
  blockedWebhookReason,
  isSafeWebhookTarget,
} from "../src/lib/webhookTarget";

/**
 * Security items 64 + 67 — the webhook target is the one user-supplied address
 * this platform makes an *outbound* request to, so the validator is tested from
 * both directions: what it must accept (a self-hosted receiver, including a
 * loopback/private one) and what it must refuse (protocol smuggling, credential
 * leakage, cloud metadata, unbounded input).
 */
describe("blockedWebhookReason", () => {
  it("accepts ordinary self-hosted https and http targets", () => {
    for (const url of [
      "https://hooks.raptors.dev/dogfood-2026",
      "http://receiver:8080/hook",
      "http://localhost:4000/notify",
      "http://127.0.0.1:9000/hook",
      "http://192.168.1.20:8080/hook", // private RFC1918: allowed by design
      "http://10.0.0.5/hook",
      "https://hooks.example/path?token=abc#frag",
    ]) {
      expect(blockedWebhookReason(url), url).toBeNull();
      expect(isSafeWebhookTarget(url), url).toBe(true);
    }
  });

  it("refuses non-http(s) schemes (protocol smuggling)", () => {
    for (const url of [
      "file:///etc/passwd",
      "gopher://127.0.0.1:6379/_INFO",
      "ftp://hooks.example/x",
      "data:text/plain,hello",
      "javascript:alert(1)",
      "ws://hooks.example/socket",
    ]) {
      expect(blockedWebhookReason(url), url).toMatch(/http or https|absolute http\(s\)/);
    }
  });

  it("refuses credentials embedded in the URL", () => {
    expect(blockedWebhookReason("https://user:pass@hooks.example/x")).toMatch(
      /must not embed credentials/,
    );
    expect(blockedWebhookReason("https://user@hooks.example/x")).toMatch(
      /must not embed credentials/,
    );
  });

  it("refuses cloud instance-metadata endpoints (SSRF → credential theft)", () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data/",
      "http://169.254.170.2/v2/credentials",
      "http://metadata.google.internal/computeMetadata/v1/",
      "http://METADATA.GOOGLE.INTERNAL./x",
      "http://100.100.100.200/latest/meta-data/",
      "http://[fd00:ec2::254]/latest/meta-data/",
      "http://0.0.0.0/hook",
    ]) {
      expect(blockedWebhookReason(url), url).toMatch(/metadata|unspecified/);
    }
  });

  it("refuses empty, relative, malformed and over-long targets", () => {
    expect(blockedWebhookReason("")).toMatch(/required/);
    expect(blockedWebhookReason("   ")).toMatch(/required/);
    expect(blockedWebhookReason("/relative/path")).toMatch(/absolute/);
    expect(blockedWebhookReason("hooks.example/x")).toMatch(/absolute/);
    expect(blockedWebhookReason("http://")).toMatch(/absolute/);
    expect(blockedWebhookReason(null)).toMatch(/string/);
    expect(blockedWebhookReason(undefined)).toMatch(/string/);
    expect(blockedWebhookReason(42)).toMatch(/string/);
    const long = `https://hooks.example/${"x".repeat(MAX_WEBHOOK_URL_LENGTH)}`;
    expect(blockedWebhookReason(long)).toMatch(/at most/);
  });

  it("tolerates surrounding whitespace but stores the trimmed value", () => {
    expect(assertWebhookTargetUrl("  https://hooks.example/x  ")).toBe("https://hooks.example/x");
  });

  it("throws the reason from assertWebhookTargetUrl so write paths cannot skip it", () => {
    expect(() => assertWebhookTargetUrl("file:///etc/passwd")).toThrow(/http or https/);
    expect(() => assertWebhookTargetUrl("http://169.254.169.254/")).toThrow(/metadata/);
  });
});
