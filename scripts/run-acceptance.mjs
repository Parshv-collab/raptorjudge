// Runs the server-side acceptance suite as the seeded organizer and prints a
// tier-by-tier report: `bun run acceptance`.
//
// Signs in through the same Convex Auth credentials the UI uses, then invokes
// the `acceptance.runSuite` mutation with the issued JWT. Exits non-zero if any
// check fails, so it is CI-friendly.
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { api } from "../src/convex/_generated/api.js";

const url = process.env.VITE_CONVEX_URL;
if (!url) {
  console.error("VITE_CONVEX_URL is not set — cannot reach the Convex backend.");
  process.exit(1);
}

const client = new ConvexHttpClient(url);

// Sign in as the organizer (same credentials the UI uses).
let token;
try {
  const res = await client.action(anyApi.auth.signIn, {
    provider: "password",
    params: { flow: "signIn", email: "organizer@raptors.dev", password: "dogfood2026" },
  });
  token = res?.tokens?.token;
} catch (err) {
  console.error(`sign-in failed: ${err.message}`);
  console.error("Seed the fixtures first with `bun run seed`.");
  process.exit(1);
}
if (!token) {
  console.error("sign-in returned no token — seed the fixtures first (`bun run seed`).");
  process.exit(1);
}
client.setAuth(token);

let report;
try {
  report = await client.mutation(api.acceptance.runSuite, {});
} catch (err) {
  console.error(`acceptance run failed: ${err.message}`);
  process.exit(1);
}

const pad = (s, n) => String(s).padEnd(n);
for (const c of report.checks) {
  const detail = c.detail ? ` — ${c.detail}` : "";
  console.log(
    `${c.pass ? "\u2713" : "\u2717"} [${pad(c.tier, 6)}] ${pad(c.id, 20)} ${c.description}${detail}`,
  );
}

const failed = report.checks.filter((c) => !c.pass);
console.log(`\n${report.summary}`);
process.exit(failed.length === 0 ? 0 : 1);
