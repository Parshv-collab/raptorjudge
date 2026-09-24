import { defineConfig } from "vite";
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
});
