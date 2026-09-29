import { describe, it, expect } from "vitest";
import {
  MAX_TAG_COUNT,
  MAX_URL_LENGTH,
  isSafeHttpUrl,
  normalizeTags,
  requireText,
  sanitizeText,
  validateUrl,
} from "../src/lib/validation";
import { resolveReturnTo, safeReturnTo } from "../src/lib/safeRedirect";

/** Item 66: untrusted participant input must not become a stored XSS vector. */
describe("isSafeHttpUrl", () => {
  it("accepts http(s) URLs and intentionally empty fields", () => {
    expect(isSafeHttpUrl("https://github.com/raptors/raptorflow")).toBe(true);
    expect(isSafeHttpUrl("http://localhost:3000/demo")).toBe(true);
    expect(isSafeHttpUrl("")).toBe(true);
    expect(isSafeHttpUrl("   ")).toBe(true);
  });

  it("rejects every scheme that can execute or exfiltrate", () => {
    for (const bad of [
      "javascript:alert(document.cookie)",
      "JavaScript:alert(1)",
      "  javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "blob:https://evil.example/abc",
    ]) {
      expect(isSafeHttpUrl(bad)).toBe(false);
    }
  });

  it("rejects protocol-relative and backslash-relative URLs", () => {
    expect(isSafeHttpUrl("//evil.example")).toBe(false);
    expect(isSafeHttpUrl("/\\evil.example")).toBe(false);
    expect(isSafeHttpUrl("\\\\evil.example")).toBe(false);
  });

  it("rejects non-URL strings and non-strings", () => {
    expect(isSafeHttpUrl("not a url")).toBe(false);
    expect(isSafeHttpUrl(undefined)).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
    expect(isSafeHttpUrl(42)).toBe(false);
  });

  it("rejects over-long URLs", () => {
    expect(isSafeHttpUrl(`https://example.com/${"a".repeat(MAX_URL_LENGTH)}`)).toBe(false);
  });
});

describe("validateUrl / requireText enforcement", () => {
  it("names the offending field in the error", () => {
    expect(() => validateUrl("Repository URL", "javascript:alert(1)")).toThrow(
      /Repository URL must be a valid http\(s\) URL/,
    );
  });

  it("allows an omitted optional URL but not a required one", () => {
    expect(validateUrl("Demo URL", "")).toBe("");
    expect(() => validateUrl("Demo URL", "", true)).toThrow(/required/);
  });

  it("trims and stores the valid URL", () => {
    expect(validateUrl("Repository URL", "  https://example.com/x  ")).toBe("https://example.com/x");
  });

  it("rejects blank required text and over-long text", () => {
    expect(() => requireText("Title", "   ", { required: true })).toThrow(/Title is required/);
    expect(() => requireText("Title", "x".repeat(20), { max: 10 })).toThrow(/at most 10/);
  });
});

describe("sanitizeText", () => {
  it("strips control characters", () => {
    expect(sanitizeText("a\u0000b\u001fc")).toBe("abc");
  });

  it("collapses whitespace in single-line fields", () => {
    expect(sanitizeText("Raptor\nFlow   rocks\t", true)).toBe("Raptor Flow rocks");
  });

  it("keeps paragraph breaks in multi-line fields", () => {
    expect(sanitizeText("line one\r\nline two", false)).toBe("line one\nline two");
  });
});

describe("normalizeTags", () => {
  it("trims, de-duplicates case-insensitively and joins", () => {
    expect(normalizeTags(" devtools , ci ,DevTools,,")).toBe("devtools,ci");
  });

  it("bounds the tag count", () => {
    const tooMany = Array.from({ length: MAX_TAG_COUNT + 1 }, (_, i) => `t${i}`).join(",");
    expect(() => normalizeTags(tooMany)).toThrow(/At most/);
  });

  it("allows an empty tag list", () => {
    expect(normalizeTags("")).toBe("");
  });
});

/** Item 69: the returnTo parameter must never change the origin. */
describe("safeReturnTo", () => {
  const fallback = "/";

  it("keeps ordinary same-origin paths", () => {
    for (const path of ["/", "/organizer", "/gallery/dogfood-2026", "/project/abc?tab=scores#top"]) {
      expect(safeReturnTo(path, fallback)).toBe(path);
    }
  });

  it("rejects absolute URLs to other origins", () => {
    for (const evil of [
      "https://evil.example",
      "http://evil.example/steal",
      "HTTPS://EVIL.EXAMPLE",
      "javascript:alert(1)",
      "data:text/html,<script>x</script>",
      "mailto:someone@evil.example",
    ]) {
      expect(safeReturnTo(evil, fallback)).toBe(fallback);
    }
  });

  it("rejects protocol-relative and backslash variants", () => {
    for (const evil of ["//evil.example", "/\\evil.example", "\\\\evil.example", "/\\/evil.example"]) {
      expect(safeReturnTo(evil, fallback)).toBe(fallback);
    }
  });

  it("rejects percent-encoded separators and malformed escapes", () => {
    expect(safeReturnTo("/%2F%2Fevil.example", fallback)).toBe(fallback);
    expect(safeReturnTo("/%5Cevil.example", fallback)).toBe(fallback);
    expect(safeReturnTo("/%E0%A4%A", fallback)).toBe(fallback);
  });

  it("rejects values that are not paths", () => {
    for (const bad of ["", "   ", "auth", "?x=1", "#top", "org/../etc"]) {
      expect(safeReturnTo(bad, fallback)).toBe(fallback);
    }
  });

  it("rejects embedded control characters", () => {
    expect(safeReturnTo("/ok\nLocation: https://evil.example", fallback)).toBe(fallback);
    expect(safeReturnTo("/ok\ttab", fallback)).toBe(fallback);
  });

  it("rejects a scheme-looking colon in the first segment", () => {
    expect(safeReturnTo("/foo:bar", fallback)).toBe(fallback);
  });

  it("handles null, undefined and over-long input", () => {
    expect(safeReturnTo(null, fallback)).toBe(fallback);
    expect(safeReturnTo(undefined, fallback)).toBe(fallback);
    expect(safeReturnTo(`/${"a".repeat(3000)}`, fallback)).toBe(fallback);
  });
});

describe("resolveReturnTo", () => {
  it("falls back to the documented default for bad input and bad defaults", () => {
    expect(resolveReturnTo("https://evil.example", "/organizer")).toBe("/organizer");
    expect(resolveReturnTo(null, "https://evil.example")).toBe("/");
    expect(resolveReturnTo("/judge", "/organizer")).toBe("/judge");
  });
});
