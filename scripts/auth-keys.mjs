// Mirrors node_modules/@convex-dev/auth/dist/bin.cjs generateKeys() + setEnvVar()
// so the local backend gets JWT_PRIVATE_KEY and JWKS in the exact format the
// library expects. Run with: node scripts/auth-keys.mjs
import { generateKeyPair, exportPKCS8, exportJWK } from "jose";
import { execSync } from "node:child_process";

const { privateKey, publicKey } = await generateKeyPair("RS256");
const pkcs8 = await exportPKCS8(privateKey);
const JWT_PRIVATE_KEY = `${pkcs8.trimEnd().replace(/\n/g, " ")}`;
const jwk = await exportJWK(publicKey);
const JWKS = JSON.stringify({ keys: [{ use: "sig", ...jwk }] });

function setEnvVar(name, value) {
  const valueEscaped = value.replace(/"/g, '\\"');
  execSync(`npx convex env set -- ${name} "${valueEscaped}"`, { stdio: "inherit" });
}

setEnvVar("JWT_PRIVATE_KEY", JWT_PRIVATE_KEY);
setEnvVar("JWKS", JWKS);
console.log("Auth keys configured.");
