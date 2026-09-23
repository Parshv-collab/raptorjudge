import { describe, it, expect } from "vitest";
import {
  buildOpenIdConfiguration,
  isCompleteDiscoveryDocument,
  mountAuthHttpRoutes,
  DISCOVERY_PATH,
  REQUIRED_DISCOVERY_FIELDS,
  type RouterLike,
} from "../src/convex/lib/wellKnown";

/**
 * Phase 0 regression guard: @convex-dev/auth's built-in discovery document has
 * only three fields, which strict OIDC clients reject. These tests pin the two
 * things that would silently break auth again:
 *   1. the document we serve is complete, and
 *   2. our shim really replaces the library's discovery handler while leaving
 *      every other route (jwks.json especially) untouched.
 */

describe("buildOpenIdConfiguration", () => {
  const issuer = "http://127.0.0.1:3211";
  const doc = buildOpenIdConfiguration(issuer);

  it("is a complete OIDC Discovery / RFC 8414 document", () => {
    expect(isCompleteDiscoveryDocument(doc)).toBe(true);
  });

  it("carries every field a strict client requires", () => {
    for (const field of REQUIRED_DISCOVERY_FIELDS) {
      const value = (doc as unknown as Record<string, unknown>)[field];
      if (Array.isArray(value)) expect(value.length).toBeGreaterThan(0);
      else expect(typeof value).toBe("string");
    }
    // the exact three-field shape the library used to serve must now be rejected
    const incomplete = {
      issuer: doc.issuer,
      jwks_uri: doc.jwks_uri,
      authorization_endpoint: doc.authorization_endpoint,
    };
    expect(isCompleteDiscoveryDocument(incomplete)).toBe(false);
  });

  it("derives endpoint URLs from the issuer", () => {
    expect(doc.issuer).toBe(issuer);
    expect(doc.jwks_uri).toBe(`${issuer}/.well-known/jwks.json`);
    expect(doc.token_endpoint).toBe(`${issuer}/oauth/token`);
    expect(doc.userinfo_endpoint).toBe(`${issuer}/oauth/userinfo`);
  });

  it("never emits a duplicated slash when the issuer has a trailing slash", () => {
    const withSlash = buildOpenIdConfiguration(`${issuer}/`);
    expect(withSlash.issuer).toBe(issuer);
    expect(withSlash.jwks_uri).toBe(`${issuer}/.well-known/jwks.json`);
    expect(withSlash.token_endpoint).toBe(`${issuer}/oauth/token`);
  });

  it("advertises the values Convex Auth actually issues", () => {
    expect(doc.id_token_signing_alg_values_supported).toEqual(["RS256"]);
    expect(doc.code_challenge_methods_supported).toContain("S256");
    expect(doc.scopes_supported).toContain("openid");
  });
});

describe("isCompleteDiscoveryDocument", () => {
  it("rejects empty arrays and blank strings", () => {
    const doc = buildOpenIdConfiguration("http://x") as unknown as Record<string, unknown>;
    expect(isCompleteDiscoveryDocument({ ...doc, response_types_supported: [] })).toBe(false);
    expect(isCompleteDiscoveryDocument({ ...doc, issuer: "" })).toBe(false);
    expect(isCompleteDiscoveryDocument({})).toBe(false);
  });
});

/** Minimal recording router standing in for the real HttpRouter. */
function recordingRouter() {
  const routes: { path?: string; pathPrefix?: string; method: string; handler: unknown }[] = [];
  const router: RouterLike = {
    route(spec) {
      const duplicate = routes.some(
        (r) => r.path && r.path === spec.path && r.method === spec.method,
      );
      if (duplicate) throw new Error(`duplicate route ${spec.method} ${spec.path}`);
      routes.push(spec);
    },
  };
  return { router, routes };
}

describe("mountAuthHttpRoutes", () => {
  it("replaces only the discovery handler and keeps every other route", () => {
    const { router, routes } = recordingRouter();
    const ours = { tag: "full-discovery-document" };
    let replaced = 0;

    mountAuthHttpRoutes(
      router,
      (shim) => {
        // what auth.addHttpRoutes registers today
        shim.route({ path: DISCOVERY_PATH, method: "GET", handler: { tag: "library-3-field" } });
        shim.route({ path: "/.well-known/jwks.json", method: "GET", handler: { tag: "jwks" } });
      },
      () => {
        replaced++;
        return ours;
      },
    );

    const discovery = routes.find((r) => r.path === DISCOVERY_PATH);
    expect(discovery?.handler).toBe(ours);
    expect(replaced).toBe(1);
    expect(routes.find((r) => r.path === "/.well-known/jwks.json")?.handler).toEqual({ tag: "jwks" });
  });

  it("does not register the discovery path twice (HttpRouter throws on duplicates)", () => {
    const { router, routes } = recordingRouter();
    expect(() =>
      mountAuthHttpRoutes(
        router,
        (shim) => shim.route({ path: DISCOVERY_PATH, method: "GET", handler: {} }),
        () => ({}),
      ),
    ).not.toThrow();
    expect(routes.filter((r) => r.path === DISCOVERY_PATH)).toHaveLength(1);
  });

  it("passes through pathPrefix routes untouched", () => {
    const { router, routes } = recordingRouter();
    mountAuthHttpRoutes(
      router,
      (shim) =>
        shim.route({
          path: DISCOVERY_PATH,
          method: "GET",
          handler: {},
        }),
      () => ({}),
    );
    router.route({ pathPrefix: "/api/auth/", method: "POST", handler: { tag: "oauth" } });
    expect(routes.find((r) => r.pathPrefix === "/api/auth/")?.handler).toEqual({ tag: "oauth" });
  });
});
