import { defineConfig, devices } from "@playwright/test";

/**
 * Browser end-to-end tests.
 *
 * This is the only layer that renders a React page and asserts on what a user
 * actually sees. Everything else — 227 Vitest tests over pure backend logic and
 * algorithms, `run.py` (T1/T2) and `run_t3_t4.py` (T3/T4) over HTTP — passes
 * happily through a broken import, a component that throws on mount, or a route
 * that no longer exists. That is the gap these close.
 *
 * **These tests need a running stack.** Start it first:
 *
 *     docker compose up -d
 *     bunx playwright install chromium
 *     bun run test:e2e
 *
 * Without a server on `E2E_BASE_URL` every spec fails with a connection error.
 * That is expected and is not a reason to skip.
 */
export default defineConfig({
  testDir: "./e2e",
  // Serial: the app rate-limits per user+event (see `checkRateLimit`), and several
  // specs sign in as the *same* seeded accounts. Parallel workers would trip the
  // limiter against each other and produce a flaky, order-dependent suite.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
