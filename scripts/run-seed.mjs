// One-shot fixture seeder for local/CI use: `bun run seed`.
//
// Requires a running Convex backend (the Freebuff-managed `convex dev`
// session) with VITE_CONVEX_URL present in the environment. Idempotent — it
// wipes the demo tables and rebuilds the deterministic Dogfood 2026 dataset.
import { ConvexHttpClient } from "convex/browser";
import { api } from "../src/convex/_generated/api.js";

const url = process.env.VITE_CONVEX_URL;
if (!url) {
  console.error("VITE_CONVEX_URL is not set — cannot reach the Convex backend.");
  process.exit(1);
}

const client = new ConvexHttpClient(url);
console.log(`seeding Dogfood 2026 fixtures into ${url} …`);

const started = Date.now();
const result = await client.action(api.seed.seed, {});
const seconds = ((Date.now() - started) / 1000).toFixed(1);

console.log(`\u2713 seeded in ${seconds}s`);
console.log(JSON.stringify(result, null, 2));
console.log("\nSign in with any demo account (password: dogfood2026).");
