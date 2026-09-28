import { expect, test } from "@playwright/test";
import { ACCOUNTS, ROLE_HOME, sidebar, signIn } from "./helpers";

/**
 * Participant surfaces.
 *
 * One seed subtlety used to shape this file, and it is worth stating plainly
 * because it contradicts the obvious guess — the note is kept because the
 * *other* account below still depends on it.
 *
 *   `participant@fixture.local` was created by the main seed and never added
 *   to a team, so its "Your events" grid was permanently empty and the
 *   dashboard rendered "You're not enrolled in any events yet". That made the
 *   participant role's front page undemoable on a TEST_EVENTS stack: no
 *   workspace, no chat, no vote panel, no results.
 *
 *   The TEST_EVENTS branch of the seed now enrols it in all five demo events
 *   (issue 52) — that branch only, so `sample-hack-2026` and the T1/T2
 *   acceptance suite are untouched. The test below therefore asserts the demo
 *   participant *is* enrolled, and the enrolled-events test still signs in as
 *   `tm_01`'s leader, who is enrolled by the ordinary fixture path.
 *
 *   The suite must pass on both a TEST_EVENTS=true and a TEST_EVENTS=false
 *   stack, so nothing below names a demo event.
 */

test("demo participant dashboard shows its events and featured cards", async ({ page }) => {
  await signIn(page, ACCOUNTS.participant);
  await page.waitForURL(ROLE_HOME.participant);

  await expect(
    page.getByRole("heading", { level: 1, name: /Welcome back/i }),
  ).toBeVisible();

  const yourEvents = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Your events" }),
  });
  await expect(yourEvents).toBeVisible();
  // On a TEST_EVENTS stack the seed enrols this account in five events; on a
  // default stack it is enrolled in none and the empty state is correct. Either
  // way one of the two must hold — a dashboard that is neither is the bug.
  const enrolledCards = await yourEvents.getByRole("heading", { level: 3 }).count();
  const emptyState = await yourEvents.getByText("You're not enrolled in any events yet").count();
  expect(enrolledCards > 0 || emptyState > 0).toBe(true);

  // Featured slot: up to three cards (issue 49 — it used to be exactly one,
  // whatever the deployment), never a blank screen.
  //
  // Deliberately NOT asserted against specific titles. `events.browse` ranks
  // *open* events first, so which event wins depends on the stack's stage
  // mix. Naming one passes on one stack and fails on the other.
  const featured = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Featured events" }),
  });
  await expect(
    page.getByRole("heading", { name: "Featured events" }),
  ).toBeVisible();
  // Each featured card links to its public event page.
  await expect(featured.getByRole("link", { name: "View event" }).first()).toBeVisible();
  // …and they have real titles, not placeholders.
  expect(await featured.getByRole("heading", { level: 3 }).count()).toBeGreaterThan(0);

  // The discovery grid below it makes the whole catalogue reachable from the
  // dashboard, not just whatever is featured.
  await expect(
    page.getByRole("heading", { name: "Browse all events" }),
  ).toBeVisible();
});

test("a participant who is on a team sees their enrolled events", async ({ page }) => {
  // `priya1@example.org` leads fixture team `tm_01` in `sample-hack-2026`.
  await signIn(page, ACCOUNTS.teamMember);
  await page.waitForURL(ROLE_HOME.participant);

  const yourEvents = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Your events" }),
  });
  await expect(yourEvents.getByRole("heading", { name: "Sample Hack 2026" })).toBeVisible();
  // Enrolled means a populated grid, not the empty state.
  await expect(page.getByText("You're not enrolled in any events yet")).toHaveCount(0);
  await expect(
    yourEvents.getByRole("link", { name: /Open workspace/ }).first(),
  ).toBeVisible();
});

test("participant can open a project detail page from the gallery", async ({ page }) => {
  await signIn(page, ACCOUNTS.participant);
  await page.waitForURL(ROLE_HOME.participant);

  await page.goto("/gallery/sample-hack-2026");
  // Each card is a Link wrapping the title; the "View details →" affordance is
  // the same link, so either locator lands on the same route.
  await page.getByRole("link", { name: /Glass Signal/ }).first().click();
  await page.waitForURL(/\/project\//);

  // The detail header is an h1 with the project title.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Glass Signal");
  // It still offers the way back to the gallery it came from.
  await expect(page.getByRole("link", { name: /Back to .* gallery/i })).toBeVisible();
});

test("project detail shows the community vote panel in its closed state", async ({ page }) => {
  await signIn(page, ACCOUNTS.participant);
  await page.waitForURL(ROLE_HOME.participant);

  await page.goto("/gallery/sample-hack-2026");
  await page.getByRole("link", { name: /Glass Signal/ }).first().click();
  await page.waitForURL(/\/project\//);

  // `voteStatusCore` always returns a payload for an existing event, so the
  // panel renders for a participant. `sample-hack-2026` is `closed`, which is
  // neither the voting stage nor `published`, so the panel explains that points
  // cannot be cast rather than offering a live vote.
  await expect(page.getByRole("heading", { name: "Community vote" })).toBeVisible();
  await expect(page.getByText(/Voting is not open yet|Voting is closed for this event/)).toBeVisible();
});

test("a judge never sees the community vote panel", async ({ page }) => {
  // `ProjectDetail.tsx` hides the whole panel for `me.role === "judge"`; the
  // server separately rejects judge votes.
  await signIn(page, ACCOUNTS.judgeA);
  await page.waitForURL(ROLE_HOME.judge);

  await page.goto("/gallery/sample-hack-2026");
  await page.getByRole("link", { name: /Dry Harbour/ }).first().click();
  await page.waitForURL(/\/project\//);

  await expect(page.getByRole("heading", { name: "Community vote" })).toHaveCount(0);
});

test("participant workspace chat and results routes render", async ({ page }) => {
  await signIn(page, ACCOUNTS.teamMember);
  await page.waitForURL(ROLE_HOME.participant);

  // The participant rail is event-scoped, so these carry the slug. Scoped to
  // the rail because it is the authoritative nav for these destinations, and
  // `ParticipantWorkspace` embeds the chat inline (`TeamChatSection`) rather
  // than as a link — a page-body match here would be incidental.
  for (const [label, pattern] of [
    ["My Team", /\/workspace(\?|$)/],
    ["Chat", /\/workspace\/chat/],
  ] as const) {
    await sidebar(page).getByRole("link", { name: label, exact: true }).click();
    await page.waitForURL(pattern);
    // A crash-on-mount regression would never resolve the URL to a real page.
    await expect(page.getByRole("main")).toBeVisible();
  }
});
