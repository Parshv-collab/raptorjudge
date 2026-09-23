// End-to-end auth verification against a running deployment:
//
//   1. sign in each seeded demo account, then use the issued JWT to call
//      users.me and confirm identity resolution + role;
//   2. confirm failed sign-ins do not disclose whether an address is
//      registered (security item 56) — a wrong password on a real account, a
//      wrong password on another real account, and an address with no account
//      at all must all produce the *same* client-visible message.
//
// Run it after `npm run seed` (or against the Docker stack) with:
//   node scripts/auth-verify.mjs
// Exits non-zero on any failure, so it is CI-friendly.
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const url = process.env.VITE_CONVEX_URL;
if (!url) {
  console.error("VITE_CONVEX_URL is not set — cannot reach the Convex backend.");
  process.exit(1);
}
const client = new ConvexHttpClient(url);

const accounts = [
  ["admin@raptors.dev", "admin"],
  ["organizer@raptors.dev", "organizer"],
  ["judge1@raptors.dev", "judge"],
  ["participant1@raptors.dev", "participant"],
];

let failures = 0;

// ---------------------------------------------------------------- sign in ---
for (const [email, expectRole] of accounts) {
  try {
    const res = await client.action(anyApi.auth.signIn, {
      provider: "password",
      params: { flow: "signIn", email, password: "dogfood2026" },
    });
    const token = res?.tokens?.token;
    if (!token) throw new Error("no token in response");

    client.setAuth(token);
    const me = await client.query(anyApi.users.me, {});
    const role = me?.role ?? "none";
    const name = me?.name ?? "none";
    const ok = role === expectRole;
    console.log(`${ok ? "✓" : "✗"} ${email}: role=${role} (expected ${expectRole}) name="${name}"`);
    if (!ok) failures++;
  } catch (err) {
    console.log(`✗ ${email}: FAILED — ${err.message}`);
    failures++;
  }
}

// ------------------------------------------- no account enumeration (item 56) ---
/**
 * The client-visible reason, stripped of Convex's envelope. Convex prefixes a
 * request-id header and appends a stack trace, so the interesting text is the
 * first line that is neither.
 */
function reasonOf(message) {
  const lines = String(message ?? "").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("[Request ID:")) continue;
    if (line.startsWith("at ")) continue;
    if (line === "Called by client") continue;
    if (line === "Server Error") continue;
    return line.replace(/^Uncaught Error:\s*/, "");
  }
  return "<no message>";
}

/** The failure reason for a sign-in attempt, or a sentinel on unexpected success. */
async function signInFailure(email, password) {
  try {
    await client.action(anyApi.auth.signIn, {
      provider: "password",
      params: { flow: "signIn", email, password },
    });
    return { signedIn: true, message: "<signed in>" };
  } catch (err) {
    return { signedIn: false, message: reasonOf(err.message) };
  }
}

const probes = [
  ["wrong password (admin account)", await signInFailure("admin@raptors.dev", "definitely-not-it")],
  ["wrong password (participant account)", await signInFailure("participant1@raptors.dev", "definitely-not-it")],
  ["address with no account", await signInFailure("nobody-here@raptors.dev", "dogfood2026")],
];

console.log("\naccount enumeration check (item 56):");
for (const [label, result] of probes) {
  console.log(`${result.signedIn ? "✗" : "·"} ${label} → "${result.message}"`);
}

const messages = new Set(probes.map(([, r]) => r.message));
const signedInAnywhere = probes.some(([, r]) => r.signedIn);
if (signedInAnywhere) {
  console.log("✗ a probe signed in with a wrong password — check the password provider");
  failures++;
}
if (messages.size === 1) {
  console.log(`✓ all ${probes.length} failures report the same message (no account enumeration)`);
} else {
  console.log(`✗ ${messages.size} distinct messages leaked registration state`);
  failures++;
}

console.log(`\n${failures === 0 ? "all auth checks passed" : `${failures} check(s) failed`}.`);
process.exit(failures === 0 ? 0 : 1);
