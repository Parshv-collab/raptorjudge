import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The keypair generator has one job that is easy to get subtly wrong: getting a
 * PEM private key into a deployment environment variable. Passing it as an
 * argument made the CLI parse `-----BEGIN PRIVATE KEY-----` as an option
 * (`error: unknown option '-----BEGIN …'`), which silently left JWT_PRIVATE_KEY
 * unset on a fresh stack — sign-in then failed with no obvious cause. These
 * tests pin the shape that works: the value goes in over stdin.
 */
function emitEnvSet(): string {
  return execFileSync("node", ["scripts/generate-auth-keys.mjs", "--emit-env-set"], {
    encoding: "utf8",
  });
}

describe("generate-auth-keys --emit-env-set", () => {
  const script = emitEnvSet();
  const lines = script.trimEnd().split("\n");

  it("fails fast and only touches the two auth variables", () => {
    expect(lines[0]).toBe("set -eu");
    const names = lines.slice(1).map((line) => line.match(/env set (\w+)/)?.[1]);
    expect(names).toEqual(["JWT_PRIVATE_KEY", "JWKS"]);
  });

  it("pipes each value over stdin instead of passing it as an argument", () => {
    for (const line of lines.slice(1)) {
      expect(line).toMatch(/^printf '%s' '.+' \| npx convex env set [A-Z_]+$/);
      expect(line).not.toMatch(/env set [A-Z_]+ '/);
    }
  });

  it("emits an RSA private key the CLI cannot mistake for a flag, and a JWKS", () => {
    expect(script).toContain("-----BEGIN PRIVATE KEY-----");
    expect(script).toContain("-----END PRIVATE KEY-----");
    expect(script).toMatch(/"keys":\[\{"use":"sig"/);
    // No argument ever starts with `--`, which is what the CLI rejected.
    for (const line of lines.slice(1)) {
      expect(line).not.toMatch(/env set [A-Z_]+ +'--/);
    }
  });

  it("produces a shell script that parses", () => {
    // Writing it to a file and letting `sh -n` parse it is the cheapest way to
    // assert the emitted script is valid POSIX shell.
    const path = join(mkdtempSync(join(tmpdir(), "raptorjudge-keys-")), "keys.sh");
    writeFileSync(path, script);
    expect(() => execFileSync("sh", ["-n", path], { encoding: "utf8" })).not.toThrow();
  });
});
