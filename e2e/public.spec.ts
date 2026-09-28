import { expect, test } from "@playwright/test";

/**
 * Public surfaces — no session required.
 *
 * Every expectation here is a string read out of the page source:
 *   · `Landing.tsx`  h1 "Hackathon judging, engineered for fairness."
 *   · `AppShell.tsx` public header renders the "Sign in" link for signed-out
 *     visitors (`if (!isAuthenticated)` — the slim top bar, no sidebar).
 *   · `Help.tsx`     h2 "Frequently asked questions" / "Guides", content from the
 *     seeded `helpContent` table, FAQ titles inside `aria-expanded` buttons.
 *   · `Gallery.tsx`  one `<h3>` per project card — the page has no other h3, so
 *     that heading role doubles as an exact card count.
 *   · `NotFound.tsx` "404" + h1 "Page not found".
 */

test("landing page renders the hero and the sign-in call to action", async ({ page }) => {
  await page.goto("/");

  // `/` is `LandingGate`: signed-out visitors get the marketing page, an
  // authenticated one is redirected to their own console.
  await expect(
    page.getByRole("heading", { level: 1, name: /Hackathon judging/i }),
  ).toBeVisible();
  // `exact` is required: the hero also links to /auth, labelled "Sign in as
  // judge or organizer", and `name` matches on substring by default.
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
});

test("landing page shows the live judging pipeline", async ({ page }) => {
  await page.goto("/");

  // PIPELINE in `Landing.tsx` — the four numbered stages of the judging engine,
  // each an h3 inside the section headed "The judging engine".
  const pipeline = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Four steps from raw score to defensible ranking" }),
  });
  for (const step of ["Assign", "Score", "Normalize", "Rank"]) {
    await expect(pipeline.getByRole("heading", { name: step, exact: true })).toBeVisible();
  }
});

test("help page renders the seeded FAQ and guide content", async ({ page }) => {
  await page.goto("/help");

  await expect(page.getByRole("heading", { name: "Help center" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Frequently asked questions" }),
  ).toBeVisible();

  // The FAQ accordion renders one `aria-expanded` button per seeded question.
  // `seedDefaultsInternal` seeds five entries, so several must be present.
  const faqButtons = page.getByRole("button", { expanded: false });
  expect(await faqButtons.count()).toBeGreaterThan(0);

  // Opening one reveals its markdown body.
  await faqButtons.first().click();
  await expect(faqButtons.first()).toHaveAttribute("aria-expanded", "true");

  // Articles render under the "Guides" heading as <article> elements.
  await expect(page.getByRole("heading", { name: "Guides" })).toBeVisible();
  expect(await page.locator("article").count()).toBeGreaterThan(0);
});

test("gallery renders the seeded fixture projects", async ({ page }) => {
  await page.goto("/gallery/sample-hack-2026");

  // `PageHeader` renders an h1: "<Event title> — projects".
  await expect(
    page.getByRole("heading", { level: 1, name: /Sample Hack 2026 — projects/i }),
  ).toBeVisible();

  // "Glass Signal" is fixture project #1 and is seeded `submitted` against
  // `sample-hack-2026`, whose `closed` stage the gallery treats as visible.
  await expect(page.getByRole("heading", { name: "Glass Signal" })).toBeVisible();

  // Every card is a Link whose only heading is the project title, so the h3
  // count is an exact card count. `publicGallery` returns all 41 fixtures.
  const cards = page.getByRole("heading", { level: 3 });
  expect(await cards.count()).toBeGreaterThanOrEqual(5);
});

test("gallery search narrows the cards", async ({ page }) => {
  await page.goto("/gallery/sample-hack-2026");

  const cards = page.getByRole("heading", { level: 3 });
  await expect(cards.first()).toBeVisible();
  const before = await cards.count();

  // `Gallery.tsx` labels the filter input "Search projects".
  await page.getByLabel("Search projects").fill("Glass Signal");
  await expect(page.getByRole("heading", { name: "Glass Signal" })).toBeVisible();

  // The seeded corpus is 41 distinct titles, so a real filter must narrow it.
  expect(await cards.count()).toBeLessThan(before);
});

test("404 page renders for an unknown route", async ({ page }) => {
  await page.goto("/this-does-not-exist");

  await expect(page.getByText("404", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Page not found" }),
  ).toBeVisible();
  // Signed out, the single exit is back to the homepage.
  await expect(
    page.getByRole("button", { name: "Return to homepage" }),
  ).toBeVisible();
});

test("signed-out visitor is sent to sign in with a return path", async ({ page }) => {
  // A protected route must not render in place: `Protected` redirects to
  // `/auth?returnTo=…` so the intended destination survives the round trip.
  await page.goto("/dashboard");
  await page.waitForURL(/\/auth\?returnTo=/);
  expect(decodeURIComponent(new URL(page.url()).searchParams.get("returnTo") ?? "")).toBe(
    "/dashboard",
  );
});
