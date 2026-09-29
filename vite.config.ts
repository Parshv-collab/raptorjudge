// `defineConfig` comes from `vitest/config`, not `vite`, so the `test` block
// below is type-checked. It re-exports Vite's own `defineConfig` with Vitest's
// extra keys added, so this is still a valid `vite.config.ts` for the dev
// server and the build.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import viteTsconfigPaths from "vite-tsconfig-paths";

// Freebuff requirement: HMR stays disabled in this managed environment.
// `preview.hmr` is not a valid Vite option, so it is set only on `server`.
export default defineConfig({
  plugins: [react(), viteTsconfigPaths()],
  define: {
    __CONVEX_URL__: JSON.stringify("__CONVEX_URL_PLACEHOLDER__"),
  },
  server: {
    host: "0.0.0.0",
    hmr: false,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: true,
  },
  // Vitest owns `tests/` only. The Playwright specs in `e2e/` are also named
  // `*.spec.ts`, so vitest's default glob would collect them, hand them to
  // Playwright's `test()`, and fail the whole unit run with "Playwright Test did
  // not expect test() to be called here". The two runners are separate tools
  // (`npm test` and `npm run test:e2e`) and must not share a file set.
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
