// End-to-end auth verification: sign in each seeded demo account, then use the
// issued JWT to call users.me and confirm identity resolution + role.
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const url = process.env.VITE_CONVEX_URL;
const client = new ConvexHttpClient(url);

const accounts = [
  ["admin@raptors.dev", "admin"],
  ["organizer@raptors.dev", "organizer"],
  ["judge1@raptors.dev", "judge"],
  ["participant1@raptors.dev", "participant"],
];

let pass = 0;
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
    console.log(
      `${ok ? "✓" : "✗"} ${email}: role=${role} (expected ${expectRole}) name="${name}"`
    );
    if (ok) pass++;
  } catch (err) {
    console.log(`✗ ${email}: FAILED — ${err.message}`);
  }
}
console.log(`\n${pass}/${accounts.length} accounts verified.`);
process.exit(pass === accounts.length ? 0 : 1);
