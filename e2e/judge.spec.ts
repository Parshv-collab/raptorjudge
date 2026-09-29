import { expect, test } from "@playwright/test";
import { ACCOUNTS, ROLE_HOME, signIn } from "./helpers";

/**
 * Judge surfaces.
 *
 * Facts this suite is built on, read from the source rather than guessed:
 *
 *   · The seed creates one **completed** assignment per fixture score row
 *     (`createAssignment({ …, status: "completed" })` in `src/convex/seed.ts`),
 *     so a seeded judge's queue is populated and every card shows the "Scored"
 *     badge and a "View score" button.
 *   · Fixture judge `jdg_01` — Tomas Varga, `tomas.varga@example.org` — has
 *     exactly one score row on the default stack, for the project
 *     **"Dry Harbour"**. That is the one project title this suite asserts on for
 *     judge A. Note "Dry Harbour" is a *duplicated* title in `fixtures.json`
 *     (two submissions carry it), and `myQueue` lists a judge's assignments
 *     across every event, so on a TEST_EVENTS=true stack the heading can match
 *     more than once — presence checks use `.first()`, absence checks do not.
 *   · `judging.myQueue` does **not** filter by lifecycle stage: a `closed` event
 *     still lists its assignments, with `canScore: false` and a "Closed …"
 *     window label. So judge A sees a real queue on `sample-hack-2026`.
 *   · `JudgePortal.tsx` renders `PageHeader` "Judging queue" (or "My scores"
 *     with `?view=scores`) and the h2 "Assigned projects" / "Submitted scores".
 */

test("judge sees their assigned queue", async ({ page }) => {
  await signIn(page, ACCOUNTS.judgeA);
  await page.waitForURL(ROLE_HOME.judge);

  await expect(page.getByRole("heading", { level: 1, name: "Judging queue" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Assigned projects" }),
  ).toBeVisible();

  // jdg_01's fixture assignment. `.first()` because "Dry Harbour" is a
  // duplicated title in the fixtures (two submissions carry it), and
  // `myQueue` lists a judge's assignments across *every* event — so on a
  // TEST_EVENTS=true stack this heading can match more than once. Taking the
  // first is correct for "is my project on screen"; see the isolation test
  // below for why the absence assertions deliberately do NOT do this.
  await expect(page.getByRole("heading", { name: "Dry Harbour" }).first()).toBeVisible();
  // The assignment is completed, so the card offers a read-only view.
  await expect(page.getByText("Scored", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View score" }).first(),
  ).toBeVisible();
});

test("judge sees their own submitted scores", async ({ page }) => {
  await signIn(page, ACCOUNTS.judgeA);
  await page.waitForURL(ROLE_HOME.judge);

  // The rail's "My Scores" entry is the same route with `?view=scores`.
  await page.getByRole("link", { name: "My Scores" }).click();
  await page.waitForURL(/\/judge\?view=scores/);

  await expect(page.getByRole("heading", { level: 1, name: "My scores" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Submitted scores" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dry Harbour" }).first()).toBeVisible();
});

test("judge queue is scoped to the signed-in judge", async ({ page }) => {
  // The fixture pairings give judge A (jdg_01) exactly one project and judge B
  // (jdg_02) six, with **no overlap**, so each queue is uniquely identifiable.
  // This is the UI half of the isolation `run.py` T2 proves over HTTP: a queue
  // query that leaked across judges would put "Dry Harbour" on judge B's screen
  // and put judge B's projects on judge A's.

  await signIn(page, ACCOUNTS.judgeA);
  await page.waitForURL(ROLE_HOME.judge);
  await expect(page.getByRole("heading", { name: "Dry Harbour" }).first()).toBeVisible();
  // Judge A scored one project, so judge B's titles must be absent entirely.
  // These stay exact-count assertions: `.first()` would make them pass on the
  // very first match, which is precisely the leak they exist to catch.
  await expect(page.getByRole("heading", { name: "Copper Kiln" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Salt Ledger" })).toHaveCount(0);
});

test("a second judge only sees their own assignments", async ({ page }) => {
  await signIn(page, ACCOUNTS.judgeB);
  await page.waitForURL(ROLE_HOME.judge);

  await expect(page.getByRole("heading", { name: "Copper Kiln" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Salt Ledger" })).toBeVisible();
  // Judge A's single project must not appear on judge B's screen.
  await expect(page.getByRole("heading", { name: "Dry Harbour" })).toHaveCount(0);
});

/**
 * The `/api/*` HTTP front door.
 *
 * In the deployed stack nginx serves it on the app's own origin, so a relative
 * request is what a browser makes and that is the default here. The Vite dev
 * server has no such proxy and answers every unknown path with the SPA shell —
 * `200 text/html` — which cannot exercise this route at all; the Convex
 * deployment serves the same router on its own site origin, which is
 * `VITE_CONVEX_SITE_URL` in this workspace and `CONVEX_SITE_ORIGIN` in a
 * self-hosted stack. `E2E_SITE_URL` overrides both. When none is configured the
 * test below skips with that reason rather than asserting against HTML.
 */
const SITE_URL = (
  process.env.E2E_SITE_URL ||
  process.env.VITE_CONVEX_SITE_URL ||
  process.env.CONVEX_SITE_ORIGIN ||
  ""
).replace(/\/+$/, "");

test("the peer-scores endpoint fails closed for an anonymous caller", async ({ request }) => {
  // `/api/judging/judges/{judgeId}/scores` resolves the caller from a session
  // cookie or bearer token and returns 401 without one, so an unauthenticated
  // read can never surface another judge's scores.
  //
  // The *authenticated* 403 for a peer judge is covered by `run.py` T2
  // ("judge cannot see peer scores"), which drives the same route with seeded
  // session cookies. Asserting the 401 here proves the browser-facing route
  // fails closed; the 403 belongs to the HTTP suite, not duplicated here.
  const path = "/api/judging/judges/some-judge-id/scores";
  const res = await request.get(SITE_URL ? `${SITE_URL}${path}` : path);

  test.skip(
    (res.headers()["content-type"] ?? "").includes("text/html"),
    "this origin has no /api front door (the dev server answers unknown paths with the SPA shell) — set E2E_SITE_URL to the Convex site origin",
  );

  expect(res.status()).toBe(401);
  const body = await res.text();
  expect(body).toContain("unauthenticated");
  // No score payload of any kind may appear in the refusal.
  expect(body).not.toContain("score");
  expect(body).not.toContain("criteria");
});

test("judge score page is not reachable for a non-judge role", async ({ page }) => {
  await signIn(page, ACCOUNTS.participant);
  await page.waitForURL(ROLE_HOME.participant);

  // `/judge/score/:id` is guarded by `requiredRole="judge"`.
  await page.goto("/judge/score/anything");
  await page.waitForURL(ROLE_HOME.participant);
  expect(page.url()).not.toContain("/judge");
});
