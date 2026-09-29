// Generates the RS256 signing keypair Convex Auth needs on a deployment.
//
// Convex Auth normally publishes these itself via `npx @convex-dev/auth`, but
// that command does not support self-hosted deployments, so for
// `docker compose up` we mint them locally and push them with
// `npx convex env set` (see backend/entrypoint.sh).
//
// Usage:
//   node scripts/generate-auth-keys.mjs                 # .env-style output
//   node scripts/generate-auth-keys.mjs --emit-env-set   # `npx convex env set` commands
//
// Pure Node — no dependencies, no network, so it works fully offline.
import { createPublicKey, generateKeyPairSync } from "node:crypto";

const emitEnvSet = process.argv.includes("--emit-env-set");

// RS256 == RSASSA-PKCS1-v1_5 + SHA-256; 2048 bits is the conventional minimum.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

// Node can export the public half straight to JWK ({ kty, n, e }).
const publicJwk = createPublicKey(privateKey).export({ format: "jwk" });

// JWT_PRIVATE_KEY must be a single line: PKCS#8 PEM with newlines as spaces.
const jwtPrivateKey = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString()
  .trimEnd()
  .replace(/\n/g, " ");

// Shape copied from Convex Auth's own generateKeys.mjs.
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicJwk }] });

// Base64/JWKS contain no single quotes, so single-quoting is shell-safe.
//
// The value goes in over **stdin**, not as an argument: a PEM private key starts
// with `-----BEGIN PRIVATE KEY-----`, and the CLI parses an argument that begins
// with `--` as an option (`error: unknown option '-----BEGIN PRIVATE KEY-----…'`).
// Piping is also what the CLI documents for secrets, since it keeps the value
// out of the process list and shell history.
if (emitEnvSet) {
  const pipe = (name, value) =>
    `printf '%s' '${value}' | npx convex env set ${name}\n`;
  process.stdout.write("set -eu\n");
  process.stdout.write(pipe("JWT_PRIVATE_KEY", jwtPrivateKey));
  process.stdout.write(pipe("JWKS", jwks));
} else {
  process.stdout.write(`JWT_PRIVATE_KEY="${jwtPrivateKey}"\n`);
  process.stdout.write(`JWKS=${jwks}\n`);
}
