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
 * One wrinkle worth knowing about: the admin rail used to list **two** entries
 * labelled "Settings" — `ROLE_NAV.admin` points one at `/admin/settings` and the
 * shared `ACCOUNT_NAV` pointed the other at `/settings`. The account row is now
 * labelled "Account settings" (its own page H1), so every label in the rail is
 * unique. The `/admin` Overview row is still matched by `href`, because the
 * wordmark also links to `/admin`.
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
    // Click by label where the label is unique. `/admin` needs `href` instead,
    // because it is both the Overview row and the wordmark's `homeHref`.
    const link =
      item.href === "/admin"
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
    await expect(rail.getByRole("link", { name: item.label, exact: true })).toBeVisible();
  }
  // The duplicate-row bug this file used to work around: two rail rows reading
  // "Settings" but pointing at different pages. Locked shut.
  await expect(rail.getByRole("link", { name: "Settings", exact: true })).toHaveCount(1);
  await expect(rail.getByRole("link", { name: "Account settings", exact: true })).toHaveCount(1);
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

  // The five `Test Hack — …` events only exist when the stack was seeded with
  // TEST_EVENTS=true, which is off by default. This used to be driven by an
  // E2E_TEST_EVENTS env var, which is a trap: running against a TEST_EVENTS=true
  // stack without remembering to set it made this assert that events which
  // *do* exist are absent, and fail. Detect the deployment instead of asking
  // the operator to describe it.
  const rows = await table.getByRole("row").count();
  const testEventsOn = (await table.getByRole("cell", { name: /Test Hack/ }).count()) > 0;

  if (testEventsOn) {
    // Sample Hack 2026 plus the five staged demo events, plus a header row.
    await expect(table.getByRole("cell", { name: "Test Hack — Judging" })).toBeVisible();
    expect(rows).toBeGreaterThanOrEqual(7);
  } else {
    await expect(table.getByRole("cell", { name: "Test Hack — Judging" })).toHaveCount(0);
    // One header row plus the single seeded event.
    expect(rows).toBe(2);
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
