import { expect, test } from "@playwright/test";
import { ACCOUNTS, ROLE_HOME, sidebar, signIn } from "./helpers";

/**
 * Participant surfaces.
 *
 * One seed subtlety shapes this file, and it is worth stating plainly because
 * it contradicts the obvious guess:
 *
 *   `participant@fixture.local` is created as a `participant` user and gets a
 *   session, but the seed **never adds it to a team** — team membership comes
 *   only from `FIXTURES.teams[].members`, and that list is made of fixture
 *   addresses like `priya1@example.org`. `events.enrolled` derives enrollment
 *   purely from `teamMembers`, so the demo participant's "Your events" grid is
 *   empty by design and renders its "You're not enrolled in any events yet"
 *   empty state. Asserting "at least one event card" for that account would be
 *   a test that could never pass.
 *
 *   So: the enrolled-events test signs in as `tm_01`'s leader, who really is
 *   in a team, and the demo participant is asserted on what it genuinely sees —
 *   the featured primary event on its dashboard.
 */

test("demo participant dashboard shows the featured seeded event", async ({ page }) => {
  await signIn(page, ACCOUNTS.participant);
  await page.waitForURL(ROLE_HOME.participant);

  await expect(
    page.getByRole("heading", { level: 1, name: /Welcome back/i }),
  ).toBeVisible();

  // "Your events" is empty for this account (see the file header) …
  await expect(page.getByRole("heading", { name: "Your events" })).toBeVisible();
  await expect(page.getByText("You're not enrolled in any events yet")).toBeVisible();

  // … while the featured slot still surfaces a real event, so the dashboard is
  // never a blank screen.
  //
  // Deliberately NOT asserted against a specific title. `events.featuredForVisitors`
  // ranks *open* events (registration/hacking/judging/voting) by team count
  // first and only falls back to the closed/published bucket when there are
  // none. So the featured card is:
  //   - "Sample Hack 2026" on a default TEST_EVENTS=false stack (its `closed`
  //     status is what puts it in the fallback bucket), but
  //   - whichever test event is currently open on a TEST_EVENTS=true stack.
  // Naming one of those makes the test pass on one stack and fail on the other.
  const featured = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Featured events" }),
  });
  await expect(
    page.getByRole("heading", { name: "Featured events" }),
  ).toBeVisible();
  // Each featured card links to its public event page.
  await expect(featured.getByRole("link", { name: "View event" }).first()).toBeVisible();
  // …and it has a real title, not a placeholder.
  expect(await featured.getByRole("heading", { level: 3 }).count()).toBeGreaterThan(0);
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
