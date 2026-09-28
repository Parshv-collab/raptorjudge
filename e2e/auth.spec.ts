import { expect, test } from "@playwright/test";
import {
  ACCOUNTS,
  ROLE_HOME,
  SEED_PASSWORD,
  expectNoAuthError,
  sidebar,
  signIn,
  signOut,
} from "./helpers";

/**
 * Authentication and role routing.
 *
 * These go through the real sign-in form rather than a seeded session cookie,
 * because the cookie path is what `run.py` already proves and the *form* is
 * what had no coverage at all. Each role is asserted against the console it must
 * land on (`src/lib/roles.ts`), which is the regression that matters: a role
 * dropped onto another role's console, or back onto the marketing page.
 */

test("sign in as participant lands on the participant dashboard", async ({ page }) => {
  await signIn(page, ACCOUNTS.participant);
  await page.waitForURL(ROLE_HOME.participant);
  await expectNoAuthError(page);
  // `ParticipantDashboard.tsx` PageHeader: "Welcome back, <first name>".
  await expect(
    page.getByRole("heading", { level: 1, name: /Welcome back/i }),
  ).toBeVisible();
});

test("sign in as organizer lands on the organizer console", async ({ page }) => {
  await signIn(page, ACCOUNTS.organizer);
  await page.waitForURL(ROLE_HOME.organizer);
  await expectNoAuthError(page);
  // `OrganizerDashboard.tsx` PageHeader title.
  await expect(
    page.getByRole("heading", { level: 1, name: "Organizer overview" }),
  ).toBeVisible();
  // The organizer rail carries the cross-event judges roster (issue 35).
  await expect(sidebar(page).getByRole("link", { name: "Judges", exact: true })).toBeVisible();
});

test("sign in as judge lands on the judge portal", async ({ page }) => {
  await signIn(page, ACCOUNTS.judgeA);
  await page.waitForURL(ROLE_HOME.judge);
  await expectNoAuthError(page);
  // `JudgePortal.tsx` PageHeader title when not in `?view=scores` mode.
  await expect(
    page.getByRole("heading", { level: 1, name: "Judging queue" }),
  ).toBeVisible();
});

test("sign in as admin lands on the admin console", async ({ page }) => {
  await signIn(page, ACCOUNTS.admin);
  await page.waitForURL(ROLE_HOME.admin);
  await expectNoAuthError(page);
  // `AdminDashboard.tsx` PageHeader title.
  await expect(
    page.getByRole("heading", { level: 1, name: "System administration" }),
  ).toBeVisible();
  // Only the admin rail carries winner overrides (issue 44 relabelled it).
  await expect(
    sidebar(page).getByRole("link", { name: "Winner overrides", exact: true }),
  ).toBeVisible();
});

test("a wrong password is rejected and the visitor stays on /auth", async ({ page }) => {
  await page.goto("/auth");
  await page.getByLabel(/^Email address/).fill(ACCOUNTS.participant);
  await page.getByLabel(/^Password/).fill("definitely-not-the-password");
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();

  // The fixture authenticator rejects it and renders the error `Alert`
  // (role="alert") rather than navigating anywhere.
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/auth/);
});

test("sign out clears the session and returns to /auth", async ({ page }) => {
  await signIn(page, ACCOUNTS.participant);
  await page.waitForURL(ROLE_HOME.participant);

  await signOut(page);
  await expect(page).toHaveURL(/\/auth/);

  // The session is really gone: going back to the protected route bounces to
  // sign-in again instead of rendering the dashboard from a cached render.
  await page.goto("/dashboard");
  await page.waitForURL(/\/auth\?returnTo=/);
});

test("a protected route is not rendered for a signed-out visitor", async ({ page }) => {
  await page.goto("/admin");
  await page.waitForURL(/\/auth\?returnTo=/);
  expect(decodeURIComponent(new URL(page.url()).searchParams.get("returnTo") ?? "")).toBe(
    "/admin",
  );
  // The admin console itself must never have mounted.
  await expect(page.getByRole("heading", { name: "All system events" })).toHaveCount(0);
});

test("participant cannot access /admin", async ({ page }) => {
  await signIn(page, ACCOUNTS.participant);
  await page.waitForURL(ROLE_HOME.participant);

  // `ProtectedRoute` sends a wrong role to `roleHomePath(role)` — /dashboard —
  // never into someone else's console.
  await page.goto("/admin");
  await page.waitForURL(ROLE_HOME.participant);
  expect(page.url()).not.toContain("/admin");
  await expectNoAuthError(page);
});

test("participant cannot access the organizer console", async ({ page }) => {
  await signIn(page, ACCOUNTS.participant);
  await page.waitForURL(ROLE_HOME.participant);

  await page.goto("/organizer/events");
  await page.waitForURL(ROLE_HOME.participant);
  expect(page.url()).not.toContain("/organizer");
});

test("judge cannot access /admin", async ({ page }) => {
  await signIn(page, ACCOUNTS.judgeA);
  await page.waitForURL(ROLE_HOME.judge);

  await page.goto("/admin/users");
  await page.waitForURL(ROLE_HOME.judge);
  expect(page.url()).not.toContain("/admin");
});

test("a signed-in participant is sent away from the marketing page", async ({ page }) => {
  await signIn(page, ACCOUNTS.participant);
  await page.waitForURL(ROLE_HOME.participant);

  // `LandingGate`: an authenticated visitor never sees the hero.
  await page.goto("/");
  await page.waitForURL(ROLE_HOME.participant);
  await expect(
    page.getByRole("heading", { level: 1, name: /Hackathon judging/i }),
  ).toHaveCount(0);
});

test("the seeded password is the documented one", async ({ page }) => {
  // Guards the suite itself: if the seed's SEED_PASSWORD ever changes, every
  // spec above fails with a confusing "element not found" rather than an
  // obvious auth error, so pin it with one readable test.
  expect(SEED_PASSWORD).toBe("dogfood2026");

  await signIn(page, ACCOUNTS.participant, SEED_PASSWORD);
  await page.waitForURL(ROLE_HOME.participant);
});
