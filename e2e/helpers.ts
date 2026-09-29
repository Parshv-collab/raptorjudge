import { expect, type Page } from "@playwright/test";

/**
 * Shared helpers for the browser suite.
 *
 * Every assertion here is written against a string that a user can actually see
 * in the rendered page, read out of the page source rather than guessed:
 *
 *   · `Auth.tsx` labels the fields "Email address" and "Password" (the `*`
 *     required marker lives *inside* the `<label>`, so the accessible name is
 *     "Password *" — these regexes anchor on the start to avoid the "Confirm
 *     password" field that exists in sign-up mode).
 *   · Three separate elements on `/auth` read "Sign in": the `<h1>`, the
 *     sign-in/sign-up mode switch, and the submit button. The submit is
 *     therefore scoped to the form — it is the only one of the three that lives
 *     inside `<form onSubmit={handleSignInSubmit}>`.
 *   · `AppShell.tsx` signs out through a button labelled `aria-label="Sign out"`.
 */

/** Password shared by every seeded account (`SEED_PASSWORD` in `src/convex/seed.ts`). */
export const SEED_PASSWORD = "dogfood2026";

/**
 * Storage keys the auth provider uses, mirrored from `src/main.tsx`
 * (`TOKEN_KEY_PREFIX` + `storageNamespace`). `sessionStorage` is per tab, so
 * this is how a cached session is carried from one test's page to the next.
 */
const TOKEN_KEY_PREFIX = "__convexAuth";
const AUTH_NAMESPACE = "raptorjudge";

/**
 * Sessions already established in this worker, keyed by email.
 *
 * Replayed into the next page's `sessionStorage` so each account authenticates
 * once per run rather than once per test.
 */
const tokenCache = new Map<string, SessionTokens>();

/** The five demo accounts created by the seed, plus one real team member. */
export const ACCOUNTS = {
  admin: "admin@fixture.local",
  organizer: "organizer@fixture.local",
  judgeA: "tomas.varga@example.org",
  judgeB: "wei.lindqvist@example.org",
  participant: "participant@fixture.local",
  /**
   * `participant@fixture.local` is created by the seed but is deliberately
   * never added to a team, so its dashboard shows the "You're not enrolled in
   * any events yet" empty state. This is the leader of fixture team `tm_01`, so
   * it is a participant who really is enrolled — used by the test that needs
   * the "Your events" grid to be populated.
   */
  teamMember: "priya1@example.org",
} as const;

/** Where each role lands after a successful sign-in (`src/lib/roles.ts`). */
export const ROLE_HOME = {
  admin: /\/admin(\/|$|\?)/,
  organizer: /\/organizer(\/|$|\?)/,
  judge: /\/judge(\/|$|\?)/,
  participant: /\/dashboard(\/|$|\?)/,
} as const;

/**
 * The console each seeded account lands on after signing in, mirroring
 * `roleHomePath` in `src/lib/roles.ts`. Only used to give a *replayed* session a
 * document to land on (see {@link signIn}); anything not listed falls back to
 * `/home`, which redirects by role.
 */
const ACCOUNT_HOME: Record<string, string> = {
  [ACCOUNTS.admin]: "/admin",
  [ACCOUNTS.organizer]: "/organizer",
  [ACCOUNTS.judgeA]: "/judge",
  [ACCOUNTS.judgeB]: "/judge",
  [ACCOUNTS.participant]: "/dashboard",
  [ACCOUNTS.teamMember]: "/dashboard",
};

/**
 * The two tokens the provider keeps in `sessionStorage`.
 *
 * **Both** are needed to resume a session, which is not obvious and cost this
 * suite real flakiness:
 *
 *   `ConvexProviderWithAuth` installs its auth callback from an effect that
 *   runs *before* `AuthProvider`'s effect has read `sessionStorage`, so the
 *   first token fetch the Convex client makes always comes back empty. The
 *   client reacts to that by immediately forcing a refresh —
 *   `AuthenticationManager.setConfig` → `initialRefetch` →
 *   `fetchToken({ forceRefreshToken: true })` — and that path goes straight to
 *   the stored **refresh token**, never to the JWT. With no refresh token on
 *   disk the refresh fails, `onAuthChange(false)` fires, and the app renders
 *   the sign-in page with the session sitting right there in storage.
 *
 * That is also why a browser reload keeps a session alive: the refresh token is
 * present and is exchanged for a fresh JWT on the way up.
 */
const JWT_KEY = `${TOKEN_KEY_PREFIX}JWT_${AUTH_NAMESPACE}`;
const REFRESH_KEY = `${TOKEN_KEY_PREFIX}RefreshToken_${AUTH_NAMESPACE}`;

interface SessionTokens {
  jwt: string;
  refreshToken: string;
}

/** Read both tokens out of the page, or `null` if either is missing. */
async function readTokens(page: Page): Promise<SessionTokens | null> {
  try {
    return await page.evaluate(
      ([jwtKey, refreshKey]) => {
        const jwt = window.sessionStorage.getItem(jwtKey);
        const refreshToken = window.sessionStorage.getItem(refreshKey);
        return jwt && refreshToken ? { jwt, refreshToken } : null;
      },
      [JWT_KEY, REFRESH_KEY] as const,
    );
  } catch {
    // Navigation in flight destroyed the execution context.
    return null;
  }
}

/** True once the app has left `/auth` — i.e. the server accepted the session. */
async function sessionAccepted(page: Page): Promise<boolean> {
  try {
    await page.waitForURL((url) => !/^\/auth(\/|\?|$)/.test(url.pathname), { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Cache the tokens as they are *after* the boot-time refresh has rotated them.
 *
 * The refresh token the client holds is single-use: the boot that reads it
 * swaps it for a new one. Capturing the value the instant the page lands would
 * therefore cache a token that is already spent, and the next replay would be
 * refused. Polling for a beat past the landing captures the rotated pair.
 */
async function cacheTokens(page: Page, email: string): Promise<void> {
  let latest: SessionTokens | null = null;
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const tokens = await readTokens(page);
    if (tokens) latest = tokens;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (latest) tokenCache.set(email, latest);
}

/**
 * Sign in by actually filling the form in — no caching, no token replay.
 * Used by the tests whose subject *is* the sign-in screen.
 */
export async function signInViaForm(
  page: Page,
  email: string,
  password: string = SEED_PASSWORD,
): Promise<void> {
  await page.goto("/auth");
  await page.getByLabel(/^Email address/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  // Scoped to the form: the mode-switch button is also a "Sign in" button.
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
}

/**
 * Get `page` into `email`'s session, and wait for nothing else — callers
 * assert on the landing page themselves.
 *
 * The first time an account is used this really types credentials into the
 * form. Afterwards the issued JWT is cached and replayed into the next page's
 * `sessionStorage`, so each account authenticates once per run rather than once
 * per test.
 *
 * That is not just a speed-up. `auth.ts` charges every credential attempt —
 * successful ones included — against a per-address bucket
 * (`AUTH_ATTEMPT_LIMIT`, 20 per 5 minutes), so a suite that signed in afresh 11
 * times as `participant@fixture.local` passed on a clean stack and then failed
 * with a bare "Something went wrong" the moment it was re-run inside the
 * window. Caching keeps the suite deterministic no matter how often it is run.
 *
 * Three details make the cache actually work, and all three were missing:
 *
 *   1. **Both tokens are captured and replayed** — see {@link JWT_KEY} for why
 *      a JWT on its own cannot resume a session in this app.
 *   2. The tokens are read by polling storage, not by a single `evaluate` fired
 *      the instant the click is dispatched. The provider writes them a beat
 *      later (and again when the boot refresh rotates the refresh token), so
 *      the one-shot read came back `null`, nothing was ever cached, and every
 *      test re-submitted the form — the exact pattern this cache exists to
 *      prevent.
 *   3. A replayed session needs a document to land on. `addInitScript` only
 *      takes effect on the *next* navigation, so the cached branch performs one
 *      (`page.goto(ACCOUNT_HOME[email])`). Previously it returned with the page
 *      still on `about:blank`, which left every caller's `waitForURL` waiting.
 *
 * A replay that is refused (a refresh token that rotation already spent, a
 * session revoked since, an expired JWT) falls back to the form instead of
 * leaving the caller on `/auth`: the cache is an optimisation, never a
 * correctness dependency. Tests that care about the sign-in *form* itself use
 * `signInViaForm`, which never touches the cache.
 */
export async function signIn(
  page: Page,
  email: string,
  password: string = SEED_PASSWORD,
): Promise<void> {
  const cached = tokenCache.get(email);
  if (cached) {
    await page.addInitScript(
      ([jwtKey, jwt, refreshKey, refreshToken]) => {
        window.sessionStorage.setItem(jwtKey, jwt);
        window.sessionStorage.setItem(refreshKey, refreshToken);
      },
      [JWT_KEY, cached.jwt, REFRESH_KEY, cached.refreshToken] as const,
    );
    await page.goto(ACCOUNT_HOME[email] ?? "/home");
    if (await sessionAccepted(page)) {
      await cacheTokens(page, email);
      return;
    }
    // Refused — drop the stale pair and sign in the slow way rather than
    // letting the caller time out waiting for a page that will never render.
    tokenCache.delete(email);
  }

  await signInViaForm(page, email, password);
  if (!(await sessionAccepted(page))) {
    // Let the caller's own `waitForURL`/assertion report the failure.
    return;
  }
  await cacheTokens(page, email);
}

/**
 * The signed-in sidebar rail.
 *
 * `AppShell.tsx` renders `<aside aria-label="Primary">`, so this is a
 * `complementary` landmark. Nav assertions are scoped here because several
 * labels ("Settings", "Events", "Judges") also appear in page bodies, and
 * Playwright's strict mode fails a locator that resolves to more than one
 * element rather than silently picking the first.
 */
export function sidebar(page: Page) {
  return page.getByRole("complementary", { name: "Primary" });
}

/** Sign out through the sidebar rail's labelled button. */
export async function signOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/auth/);
}

/**
 * Assert the sign-in form reported no error.
 *
 * Scoped to `<main>` on purpose: `Alert` renders `role="alert"`, and so do some
 * Sonner toasts, but the toasts portal outside the layout's main column while
 * the auth error alert lives inside it. Unscoped this would match a "Signed out"
 * toast and fail a perfectly good test.
 */
export async function expectNoAuthError(page: Page): Promise<void> {
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
}
