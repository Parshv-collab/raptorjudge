import { expect, test } from "@playwright/test";
import { ACCOUNTS, ROLE_HOME, signIn } from "./helpers";

/**
 * The event lifecycle in the console.
 *
 * These assert the *user-visible* half of the policy in
 * `src/lib/eventLifecycle.ts` — the half a unit test cannot see. The rules:
 *
 *   · Once results are published, the organizer is not offered any way to walk
 *     them back. Not disabled-with-a-tooltip: absent. Retracting announced
 *     results is an admin action with a written reason.
 *   · Everywhere else the organizer gets a stage picker containing only the
 *     transitions the server would accept (built from `allowedStageTargets`).
 *
 * Nothing here mutates a seeded event: the demo stack's stages are load-bearing
 * for other specs (`public.spec.ts` expects `test-hack-voting` to be voting), so
 * these assert what the console *offers* rather than clicking through it. The
 * mutations themselves are covered by `tests/eventLifecycle.test.ts` and by
 * `events.adminUnpublish`'s own arguments (admin-only, non-empty reason).
 */

/** Locator for the Lifecycle card's stage picker. */
function stagePicker(page: import("@playwright/test").Page) {
  return page.getByLabel("Move to stage");
}

/**
 * The labels in the stage picker, in order.
 *
 * `Dropdown` renders its `placeholder` as a disabled first option, so the
 * placeholder is filtered out here rather than asserted around in every test.
 */
async function stageOptions(page: import("@playwright/test").Page): Promise<string[]> {
  const labels = await stagePicker(page).locator("option").allInnerTexts();
  return labels.filter((label) => label !== "Select an option");
}

/** Skip the whole file on a stack seeded without the staged demo events. */
async function openManagedEvent(
  page: import("@playwright/test").Page,
  slug: string,
  heading: string,
) {
  await page.goto(`/organizer/events/${slug}`);
  const title = page.getByRole("heading", { level: 1, name: heading });
  await title.waitFor({ timeout: 10_000 }).catch(() => {});
  test.skip(!(await title.isVisible()), "this deployment was seeded without TEST_EVENTS");
}

test.describe("lifecycle guards", () => {
  test("a published event offers the organizer no way to retract its results", async ({ page }) => {
    await signIn(page, ACCOUNTS.organizer);
    await page.waitForURL(ROLE_HOME.organizer);
    await openManagedEvent(page, "test-hack-results", "Test Hack — Results");

    // The header's unpublish control is gone entirely. It used to read
    // "Unpublish to draft" for *any* non-draft event, which meant an organizer
    // could take a published event back to draft and silently re-order the
    // public gallery and un-badge the winner.
    await expect(page.getByRole("button", { name: "Unpublish to draft" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Publish event" })).toHaveCount(0);

    // The lifecycle picker offers exactly one destination — archiving it — and
    // says why nothing else is available.
    await expect(stagePicker(page)).toBeVisible();
    await expect(stagePicker(page)).toContainText("Results published — current");
    await expect(page.getByText(/Only an administrator can retract them/i)).toBeVisible();

    expect(await stageOptions(page)).toEqual(["Results published — current", "Archived"]);
  });

  test("the published event's results tab offers no backwards buttons either", async ({ page }) => {
    await signIn(page, ACCOUNTS.organizer);
    await page.waitForURL(ROLE_HOME.organizer);
    await openManagedEvent(page, "test-hack-results", "Test Hack — Results");

    // The section rail is a `tablist` of `role="tab"` buttons, so the section
    // is addressed as a tab, not as a button.
    const sections = page.getByRole("complementary", { name: "Event sections" });
    await sections.getByRole("tab", { name: "Results" }).click();

    // "Back to judging" used to appear whenever the event was not already
    // judging — including here, where the server now refuses it.
    await expect(page.getByRole("button", { name: "Back to judging" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Publish results" })).toHaveCount(0);
    await expect(
      page.getByText(/Results are live and final\. An administrator can retract them/i),
    ).toBeVisible();
  });

  test("an early event still offers the unpublish the organizer actually owns", async ({ page }) => {
    await signIn(page, ACCOUNTS.organizer);
    await page.waitForURL(ROLE_HOME.organizer);
    await openManagedEvent(page, "test-hack-registration", "Test Hack — Registration");

    // Announced but not started: stepping back to draft is legitimate, and the
    // one-step-back rule in the policy allows exactly this.
    await expect(page.getByRole("button", { name: "Unpublish to draft" })).toBeVisible();

    // The middle of the run — hacking and community voting — had no control at
    // all before the Lifecycle card existed, so an organizer could not take an
    // event from registration to judging without touching the database.
    const options = await stageOptions(page);
    expect(options).toContain("Hacking");
    expect(options).toContain("Community voting");
    expect(options).toContain("Draft");
  });

  test("an event nobody has acted on yet still offers nothing backwards past one phase", async ({ page }) => {
    await signIn(page, ACCOUNTS.organizer);
    await page.waitForURL(ROLE_HOME.organizer);
    // The hacking-stage demo event: submissions are the point of the phase, so
    // pulling it back to draft (two phases) is refused — the picker offers
    // registration, one step back, and not draft.
    await openManagedEvent(page, "test-hack-submissions", "Test Hack — Submissions");

    await expect(page.getByRole("button", { name: "Unpublish to draft" })).toHaveCount(0);
    const options = await stageOptions(page);
    expect(options).toContain("Registration open");
    expect(options).not.toContain("Draft");
  });

  test("an admin retracts published results through a reason, not a toggle", async ({ page }) => {
    await signIn(page, ACCOUNTS.admin);
    await page.waitForURL(ROLE_HOME.admin);
    await page.goto("/admin/events");

    const table = page.getByRole("table", { name: "All events" });
    await expect(table).toBeVisible();
    // Skip on a stack without the staged demo events, which is where the only
    // published event lives.
    await table.getByRole("cell", { name: "Test Hack — Results" }).waitFor({ timeout: 10_000 }).catch(() => {});
    test.skip(
      (await table.getByRole("cell", { name: "Test Hack — Results" }).count()) === 0,
      "this deployment was seeded without TEST_EVENTS",
    );

    const row = table.getByRole("row").filter({ hasText: "Test Hack — Results" });
    const retract = row.getByRole("button", { name: "Retract results" });
    await expect(retract).toBeVisible();
    // The one-click "Unpublish" is not what a published event gets.
    await expect(row.getByRole("button", { name: "Unpublish", exact: true })).toHaveCount(0);

    await retract.click();
    await expect(
      page.getByRole("heading", { name: "Retract published results" }),
    ).toBeVisible();
    // The reason is required — the confirm stays disabled until one is written,
    // and the mutation refuses an empty one server-side regardless.
    const confirm = page.getByRole("button", { name: "Retract results" }).last();
    await expect(confirm).toBeDisabled();
    await page
      .getByLabel("Why are these results being retracted?")
      .fill("Rubric was wrong");
    await expect(confirm).toBeEnabled();

    // Cancel rather than confirm: the seeded demo stack's stages are used by
    // other specs, so this spec must leave the data exactly as it found it.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "Retract published results" })).toHaveCount(0);
  });
});
