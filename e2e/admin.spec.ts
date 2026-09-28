import { expect, test } from "@playwright/test";
import { ACCOUNTS, ROLE_HOME, sidebar, signIn } from "./helpers";

/**
 * Admin surfaces.
 *
 * The admin rail is `ROLE_NAV.admin` in `AppShell.tsx`. Labels and hrefs are
 * copied from that constant rather than from the task brief, which guessed
 * "Overrides" where the rail actually says "Winner overrides" (relabelled in
 * issue 44 to match the page H1).
 *
 * One wrinkle worth knowing about: the admin rail lists **two** entries labelled
 * "Settings" — `ROLE_NAV.admin` points one at `/admin/settings` and the shared
 * `ACCOUNT_NAV` points the other at `/settings`. That is the same class of
 * duplicated-row bug phase 2 fixed for "Profile", and it is left in place here
 * because the tests describe the app as it is, not as it should be. Every nav
 * assertion below therefore clicks by `href`, which is unambiguous, and checks
 * the label separately where the label itself is unique.
 */

/** `ROLE_NAV.admin`, in rail order. */
const ADMIN_NAV = [
  { label: "Overview", href: "/admin" },
  { label: "Users", href: "/admin/users" },
  { label: "Events", href: "/admin/events" },
  { label: "Judging", href: "/admin/judging" },
  { label: "Winner overrides", href: "/admin/winner-overrides" },
  { label: "Invites", href: "/admin/invites" },
  { label: "Help Content", href: "/admin/help" },
  { label: "Settings", href: "/admin/settings" },
  { label: "Audit", href: "/admin/audit" },
] as const;

test("admin sidebar navigation works", async ({ page }) => {
  await signIn(page, ACCOUNTS.admin);
  await page.waitForURL(ROLE_HOME.admin);

  const rail = sidebar(page);
  await expect(rail).toBeVisible();

  for (const item of ADMIN_NAV) {
    // Click by label where the label is unique. Two entries need `href`
    // instead: "Settings" exists twice in the admin rail, and `/admin` is both
    // the Overview row and the wordmark's `homeHref`.
    const link =
      item.label === "Settings" || item.href === "/admin"
        ? rail.locator(`a[href="${item.href}"]:not([aria-label])`)
        : rail.getByRole("link", { name: item.label, exact: true });
    await expect(link).toBeVisible();
    await link.click();
    // Each destination must actually resolve — a dead route would leave the
    // previous URL in place or render the 404 in place of the page.
    await page.waitForURL(new RegExp(`${item.href.replace(/\//g, "\\/")}(/|\\?|$)`));
    await expect(page.getByRole("main")).toBeVisible();
    // Admin pages must never render the public 404 while signed in as an admin.
    await expect(page.getByRole("heading", { name: "Page not found" })).toHaveCount(0);
  }
});

test("admin rail labels are the ones the pages are known by", async ({ page }) => {
  await signIn(page, ACCOUNTS.admin);
  await page.waitForURL(ROLE_HOME.admin);

  const rail = sidebar(page);
  for (const item of ADMIN_NAV) {
    // "Settings" is excluded: the rail has two of them (see the file header),
    // so a name-based assertion there would be ambiguous.
    if (item.label === "Settings") continue;
    await expect(rail.getByRole("link", { name: item.label, exact: true })).toBeVisible();
  }
});

test("admin events list shows the seeded event", async ({ page }) => {
  await signIn(page, ACCOUNTS.admin);
  await page.waitForURL(ROLE_HOME.admin);

  await page.goto("/admin/events");
  await expect(
    page.getByRole("heading", { level: 1, name: "All system events" }),
  ).toBeVisible();

  // `AdminEvents.tsx` renders `<Table caption="All events">` with one row per
  // event, so a cell is the user-visible handle on a seeded event.
  const table = page.getByRole("table", { name: "All events" });
  await expect(table).toBeVisible();
  await expect(table.getByRole("cell", { name: "Sample Hack 2026" })).toBeVisible();

  // The five `Test Hack — …` events are only seeded when TEST_EVENTS=true,
  // which is off by default, so they are asserted only when the suite is told
  // they exist. Set E2E_TEST_EVENTS=1 against a `TEST_EVENTS=true` stack.
  const testEventsOn = process.env.E2E_TEST_EVENTS === "1";
  const rows = await table.getByRole("row").count();
  // One header row plus at least the single seeded event.
  expect(rows).toBeGreaterThanOrEqual(2);
  if (testEventsOn) {
    await expect(table.getByRole("cell", { name: "Test Hack — Judging" })).toBeVisible();
    expect(rows).toBeGreaterThanOrEqual(7);
  } else {
    await expect(table.getByRole("cell", { name: "Test Hack — Judging" })).toHaveCount(0);
  }
});

test("admin events search filters the table", async ({ page }) => {
  await signIn(page, ACCOUNTS.admin);
  await page.waitForURL(ROLE_HOME.admin);

  await page.goto("/admin/events");
  const table = page.getByRole("table", { name: "All events" });
  await expect(table.getByRole("cell", { name: "Sample Hack 2026" })).toBeVisible();

  await page.getByLabel("Search events").fill("Sample Hack 2026");
  await expect(table.getByRole("cell", { name: "Sample Hack 2026" })).toBeVisible();
  await expect(table.getByRole("cell", { name: /Test Hack/ })).toHaveCount(0);
});

test("admin audit page renders the hash-chained log", async ({ page }) => {
  await signIn(page, ACCOUNTS.admin);
  await page.waitForURL(ROLE_HOME.admin);

  await page.goto("/admin/audit");
  await expect(page.getByRole("main")).toBeVisible();

  // The seed audit-logs every privileged write, so the page resolves to the
  // real table rather than its empty state. (`AdminAudit.tsx` guards on
  // `auditLogs === undefined` first, so the empty state cannot flash here.)
  await expect(page.getByRole("table", { name: "Audit log" })).toBeVisible();
  await expect(page.getByText("No audit records")).toHaveCount(0);
});

test("admin settings is honest about what it enforces", async ({ page }) => {
  await signIn(page, ACCOUNTS.admin);
  await page.waitForURL(ROLE_HOME.admin);

  await page.goto("/admin/settings");
  // The banner title was narrowed to the flags only, because branding *is*
  // enforced by `src/convex/branding.ts` + `src/lib/branding.ts`.
  await expect(
    page.getByText("Feature flags are stored, not enforced"),
  ).toBeVisible();
});
