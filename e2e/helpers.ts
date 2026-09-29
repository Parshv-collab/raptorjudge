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
 *   · `AppShell.tsx` signs out through a button labelled `aria-label="Sign out"`,
 *     and renders the sidebar rail as `<aside aria-label="Primary">` — which,
 *     being inside the `isAuthenticated` branch, is also the cheapest proof that
 *     a session was actually accepted by the server (see `signIn`).
 */

/** Password shared by every seeded account (`SEED_PASSWORD` in `src/convex/seed.ts`). */
export const SEED_PASSWORD = "dogfood2026";

/**
 * Storage keys the auth provider uses, mirrored from `src/main.tsx`
 * (`TOKEN_KEY_PREFIX` + `storageNamespace`) and `src/lib/tokenStorage.ts`.
 * `sessionStorage` is per tab, so writing these into the next test's page is how
 * a cached session is carried across tests.
 */
const TOKEN_KEY_PREFIX = "__convexAuth";
const AUTH_NAMESPACE = "raptorjudge";
const JWT_KEY = `${TOKEN_KEY_PREFIX}JWT_${AUTH_NAMESPACE}`;
const REFRESH_KEY = `${TOKEN_KEY_PREFIX}RefreshToken_${AUTH_NAMESPACE}`;

/** Both halves of a Convex Auth session, as they sit in `sessionStorage`. */
interface Session {
  jwt: string;
  refresh: string;
}

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

/**
 * Where each account lands once signed in (`src/lib/roles.ts`).
 *
 * A replayed session has to be *driven* somewhere: `addInitScript` cannot make
 * the app navigate itself, so `signIn` opens the account's own console directly
 * instead of `/auth`. A missed entry only costs speed (that account falls back
 * to the form), never correctness.
 */
const ACCOUNT_HOME: Record<string, string> = {
  [ACCOUNTS.admin]: "/admin",
  [ACCOUNTS.organizer]: "/organizer",
  [ACCOUNTS.judgeA]: "/judge",
  [ACCOUNTS.judgeB]: "/judge",
  [ACCOUNTS.participant]: "/dashboard",
  [ACCOUNTS.teamMember]: "/dashboard",
};

/** Where each role lands after a successful sign-in (`src/lib/roles.ts`). */
export const ROLE_HOME = {
  admin: /\/admin(\/|$|\?)/,
  organizer: /\/organizer(\/|$|\?)/,
  judge: /\/judge(\/|$|\?)/,
  participant: /\/dashboard(\/|$|\?)/,
} as const;

/** Sessions already issued in this worker, keyed by email. */
const sessionCache = new Map<string, Session>();

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

/** Read whatever session the provider currently has in this page. */
async function readSession(page: Page): Promise<Partial<Session>> {
  return page.evaluate(
    ([jwtKey, refreshKey]: readonly [string, string]) => ({
      jwt: window.sessionStorage.getItem(jwtKey) ?? undefined,
      refresh: window.sessionStorage.getItem(refreshKey) ?? undefined,
    }),
    [JWT_KEY, REFRESH_KEY] as const,
  );
}

/**
 * Wait until the page is showing the signed-in shell.
 *
 * The rail lives inside `AppShell`'s `isAuthenticated` branch, so it appears
 * only once the Convex client has a token the server accepts *and* the role
 * query has resolved. That makes it a much better signal than the URL: a
 * replayed session arrives at `/admin` looking fine and is only redirected to
 * `/auth` a moment later, once the token fetch has failed.
 */
async function waitForSignedInShell(page: Page, timeout: number): Promise<boolean> {
  return page
    .getByRole("complementary", { name: "Primary" })
    .waitFor({ state: "visible", timeout })
    .then(() => true)
    .catch(() => false);
}

/**
 * Cache the live session for the next test.
 *
 * The refresh token is **single-use**: the provider rotates it on the first
 * token fetch after a replay, so the copy in storage a moment later is a
 * different one, and caching the pre-rotation value would hand the next test a
 * token the server has already spent. Re-reading until two consecutive reads
 * agree caches the value that is actually still valid. If a token never arrives
 * (or keeps changing), nothing is cached — the next test types the form again,
 * which is slow but correct.
 */
async function rememberSession(page: Page, email: string): Promise<void> {
  let previous: Partial<Session> | null = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const session = await readSession(page);
    if (session.jwt && session.refresh) {
      if (
        previous &&
        previous.jwt === session.jwt &&
        previous.refresh === session.refresh
      ) {
        sessionCache.set(email, { jwt: session.jwt, refresh: session.refresh });
        return;
      }
      previous = session;
    }
    await page.waitForTimeout(200);
  }
  sessionCache.delete(email);
}

/**
 * Get `page` into `email`'s session, and wait for nothing else — callers
 * assert on the landing page themselves.
 *
 * The first time an account is used in a worker this really types credentials
 * into the form. Afterwards **both** tokens are replayed into the next page's
 * `sessionStorage` before the bundle boots, so each account authenticates once
 * per run rather than once per test.
 *
 * That is not just a speed-up. `auth.ts` charges every credential attempt —
 * successful ones included — against a per-address bucket
 * (`AUTH_ATTEMPT_LIMIT`, 20 per 5 minutes), so an `admin.spec.ts` run (six
 * tests, six form submissions) passed on a clean stack and then failed on the
 * *third* test the moment the suite was re-run inside the window. Caching drops
 * a full run to a single attempt.
 *
 * Two details that the previous, JWT-only version got wrong, both of which made
 * the cache silently useless:
 *
 *   1. The token is read straight after the click, but the provider writes it
 *      asynchronously — so the read returned `null` and nothing was ever
 *      cached. `rememberSession` now runs only *after* the signed-in shell is
 *      up, by which point both tokens exist.
 *   2. A JWT alone cannot resume a session. On boot
 *      `ConvexProviderWithAuth` installs its auth callback in an effect that
 *      runs before `AuthProvider` reads storage, so the Convex client's first
 *      token fetch is always empty and `AuthenticationManager.setConfig` then
 *      forces a refresh (`initialRefetch` → `fetchToken({ forceRefreshToken:
 *      true })`). That path reads the **refresh token**: with none stored the
 *      refresh fails, the provider reports signed-out, and `/auth` renders with
 *      a perfectly valid JWT sitting in `sessionStorage`. (It is also why a
 *      browser reload keeps a session and a bare JWT does not.)
 *
 * Tests that care about the sign-in *form* itself use `signInViaForm`, which
 * never touches the cache.
 */
export async function signIn(
  page: Page,
  email: string,
  password: string = SEED_PASSWORD,
): Promise<void> {
  const home = ACCOUNT_HOME[email];
  const cached = sessionCache.get(email);

  if (cached && home) {
    await page.addInitScript(
      ([jwtKey, refreshKey, jwt, refresh]: readonly [string, string, string, string]) => {
        window.sessionStorage.setItem(jwtKey, jwt);
        window.sessionStorage.setItem(refreshKey, refresh);
      },
      [JWT_KEY, REFRESH_KEY, cached.jwt, cached.refresh] as const,
    );
    await page.goto(home);
    if (await waitForSignedInShell(page, 15_000)) {
      await rememberSession(page, email);
      return;
    }
    // The app refused the replay — an expired or already-spent token, or a
    // deployment that was re-seeded underneath us. Drop it and type the
    // credentials in instead; `/auth` wipes the stale keys on mount, so the
    // replayed copy cannot shadow the real sign-in.
    sessionCache.delete(email);
  }

  await signInViaForm(page, email, password);
  if (await waitForSignedInShell(page, 20_000)) {
    await rememberSession(page, email);
    return;
  }

  // Sign-in did not take. Say what the page said rather than leaving the
  // caller to fail later with a bare "waiting for /admin" — the interesting
  // case here is the throttle ("Too many attempts for this email…"), which is
  // a property of the stack, not of the test.
  const said = await page
    .getByRole("main")
    .getByRole("alert")
    .allInnerTexts()
    .catch(() => [] as string[]);
  throw new Error(
    `signIn(${email}) never reached the signed-in shell (page: ${page.url()}).` +
      (said.length ? ` The form said: ${said.join(" / ")}` : " The form showed no error."),
  );
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
