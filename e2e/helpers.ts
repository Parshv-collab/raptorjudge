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
 * Sign in through the real form and wait for the role's own console.
 *
 * Deliberately uses the UI rather than injecting a seeded session cookie: the
 * point of these tests is that the sign-in *screen* works, and the cookie path
 * is already covered by `run.py`.
 */
export async function signIn(
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
