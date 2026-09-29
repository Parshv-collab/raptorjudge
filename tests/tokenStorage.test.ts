import { afterEach, describe, expect, it } from "vitest";
import {
  TOKEN_KEY_PREFIX,
  createMemoryStorage,
  createTokenStorage,
  purgeLegacyTokenStorage,
} from "../src/lib/tokenStorage";

/** Minimal in-memory `Storage` stand-in for the purge test. */
function fakeStorage(entries: Record<string, string>): Storage {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

/**
 * Security item 68 — auth tokens must not outlive the browser session in
 * persistent storage, and previously persisted ones must be cleaned up.
 */
describe("token storage (item 68)", () => {
  it("purges legacy token keys from localStorage and keeps unrelated keys", () => {
    const storage = fakeStorage({
      [`${TOKEN_KEY_PREFIX}JWT_httplocalhost3210`]: "legacy-jwt",
      [`${TOKEN_KEY_PREFIX}RefreshToken_httplocalhost3210`]: "legacy-refresh",
      "raptor-theme": "dark",
      "unrelated-key": "keep",
    });

    const removed = purgeLegacyTokenStorage(storage);

    expect(removed.sort()).toEqual([
      `${TOKEN_KEY_PREFIX}JWT_httplocalhost3210`,
      `${TOKEN_KEY_PREFIX}RefreshToken_httplocalhost3210`,
    ]);
    expect(storage.getItem("raptor-theme")).toBe("dark");
    expect(storage.getItem("unrelated-key")).toBe("keep");
    expect(storage.getItem(`${TOKEN_KEY_PREFIX}JWT_httplocalhost3210`)).toBeNull();
  });

  it("never throws when storage is unavailable or blocked", () => {
    expect(purgeLegacyTokenStorage(null)).toEqual([]);
    const hostile = {
      get length() {
        throw new Error("blocked");
      },
      key: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(purgeLegacyTokenStorage(hostile)).toEqual([]);
  });

  it("uses sessionStorage when it works, and never touches localStorage", () => {
    const session = fakeStorage({});
    const local = fakeStorage({});
    (globalThis as { window?: unknown }).window = { sessionStorage: session, localStorage: local };

    const storage = createTokenStorage();
    storage.setItem(`${TOKEN_KEY_PREFIX}JWT`, "token-value");

    expect(session.getItem(`${TOKEN_KEY_PREFIX}JWT`)).toBe("token-value");
    expect(local.getItem(`${TOKEN_KEY_PREFIX}JWT`)).toBeNull();
    expect(local.length).toBe(0);

    storage.removeItem(`${TOKEN_KEY_PREFIX}JWT`);
    expect(session.getItem(`${TOKEN_KEY_PREFIX}JWT`)).toBeNull();
  });

  it("falls back to non-persistent memory storage when sessionStorage throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    (globalThis as { window?: unknown }).window = { sessionStorage: throwing, localStorage: fakeStorage({}) };

    const storage = createTokenStorage();
    // The probe write throws, so we must land on the in-memory implementation.
    storage.setItem("k", "v");
    expect(storage.getItem("k")).toBe("v");
    storage.removeItem("k");
    expect(storage.getItem("k")).toBeNull();
  });

  it("memory storage round-trips and removes", () => {
    const storage = createMemoryStorage();
    expect(storage.getItem("missing")).toBeNull();
    storage.setItem("a", "1");
    storage.setItem("b", "2");
    expect(storage.getItem("a")).toBe("1");
    storage.removeItem("a");
    expect(storage.getItem("a")).toBeNull();
    expect(storage.getItem("b")).toBe("2");
  });
});
