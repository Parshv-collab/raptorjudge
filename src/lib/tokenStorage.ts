/**
 * Browser token storage (security item 68: sensitive browser storage).
 *
 * `ConvexAuthProvider` defaults to `window.localStorage` under a namespace
 * derived from the deployment URL. That persists the session JWT *and* the
 * refresh token across tabs, across restarts, and until someone clears site
 * data — so a shared/kiosk machine keeps a live organizer session, and any
 * XSS on the origin can read a long-lived credential straight out of
 * `localStorage`.
 *
 * This module gives the provider a `TokenStorage` backed by `sessionStorage`
 * instead:
 *
 *   - tokens die with the tab, so there is no long-lived credential lying
 *     around on disk between visits;
 *   - a second tab starts signed out rather than silently inheriting the
 *     first tab's session;
 *   - if `sessionStorage` is unavailable (Safari private mode, embedded
 *     webviews, storage disabled) we fall back to an in-memory map, which is
 *     still *not* persistent — never to `localStorage`.
 *
 * `purgeLegacyTokenStorage()` clears anything a previous build left behind in
 * `localStorage`; it runs once at boot so old refresh tokens stop lingering
 * after the upgrade.
 */

/** Minimal shape the provider needs — mirrors `TokenStorage` from @convex-dev/auth. */
export interface TokenStorage {
  getItem: (key: string) => string | undefined | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

/** Keys the provider writes. Used to find and purge legacy entries. */
export const TOKEN_KEY_PREFIX = "__convexAuth";

/**
 * In-memory `TokenStorage` used when `sessionStorage` is unavailable.
 * Deliberately non-persistent: losing the token is better than storing it.
 */
export function createMemoryStorage(): TokenStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/**
 * Build the storage the auth provider should use. Returns sessionStorage when
 * it actually works (some browsers expose the object but throw on write), and
 * the in-memory fallback otherwise. Never returns localStorage.
 */
export function createTokenStorage(): TokenStorage {
  try {
    const probe = `${TOKEN_KEY_PREFIX}_probe`;
    window.sessionStorage.setItem(probe, "1");
    window.sessionStorage.removeItem(probe);
    return {
      getItem: (key) => {
        try {
          return window.sessionStorage.getItem(key);
        } catch {
          return null;
        }
      },
      setItem: (key, value) => {
        try {
          window.sessionStorage.setItem(key, value);
        } catch {
          // Quota or policy error: dropping the write signs the tab out on
          // reload, which is the safe direction.
        }
      },
      removeItem: (key) => {
        try {
          window.sessionStorage.removeItem(key);
        } catch {
          /* nothing to do */
        }
      },
    };
  } catch {
    return createMemoryStorage();
  }
}

/**
 * Delete auth tokens left in `localStorage` by earlier builds. Never throws and
 * never touches non-auth keys (the theme preference lives there, and it is not
 * sensitive).
 */
export function purgeLegacyTokenStorage(storage?: Storage | null): string[] {
  const target = storage ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target) return [];
  const removed: string[] = [];
  try {
    for (let i = target.length - 1; i >= 0; i--) {
      const key = target.key(i);
      if (key && key.startsWith(TOKEN_KEY_PREFIX)) {
        target.removeItem(key);
        removed.push(key);
      }
    }
  } catch {
    // Storage blocked — nothing was persisted in the first place.
  }
  return removed;
}
