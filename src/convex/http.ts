import { httpRouter, type HttpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { buildOpenIdConfiguration, mountAuthHttpRoutes, DISCOVERY_CACHE_CONTROL, type RouterLike } from "./lib/wellKnown";
import { userIdFromSubject, verifyJwt } from "./lib/jwt";

/**
 * REST API (T4: 100% API-first). Public reads are open; authenticated
 * endpoints take the session JWT via Authorization: Bearer. Because Convex
 * httpActions do not propagate identity into nested calls, we resolve the
 * caller's user explicitly from their token and pass the verified userId to
 * internal bridge mutations (never trusting client-supplied ids).
 *
 * Token verification (security items 63 + 70)
 * ------------------------------------------
 * This file used to base64-decode the JWT payload and trust it. A hand-written
 * `{"sub":"<admin id>|<x>"}` therefore reached organizer-only exports and the
 * acceptance suite — a fail-open check that left every token-gated endpoint
 * effectively unsecured. `resolveUser` now verifies the RS256 signature against
 * the deployment's own JWKS (plus alg/exp/iss/aud) before any row is read; see
 * src/convex/lib/jwt.ts. Any failure is a denial.
 */

const http = httpRouter();

// ------------------------------------------------------------------ auth ---
/**
 * Mount Convex Auth's HTTP routes, upgrading its OIDC discovery document.
 *
 * `auth.addHttpRoutes(http)` registers `/.well-known/openid-configuration`
 * itself, and `HttpRouter.route` throws on a duplicate path+method, so we
 * cannot simply register a better document afterwards. Instead we hand
 * addHttpRoutes() a thin shim that keeps every route it defines and its exact
 * handler — except the discovery document, whose handler we replace with the
 * full RFC 8414 / OIDC Discovery 1.0 document from lib/wellKnown.ts.
 *
 * Net effect: `/.well-known/jwks.json` (required for JWT verification) and any
 * future OAuth routes stay owned by the library, while strict clients stop
 * failing with "Auth provider discovery … failed — Failed to parse server
 * response".
 */
function addAuthHttpRoutes(router: HttpRouter) {
  mountAuthHttpRoutes(
    router as unknown as RouterLike,
    // Freebuff's installed @convex-dev/auth owns jwks.json + any OAuth routes.
    (shim) => auth.addHttpRoutes(shim as unknown as HttpRouter),
    // The one handler we replace: a static, complete discovery document.
    () =>
      httpAction(async () =>
        new Response(
          JSON.stringify(
            buildOpenIdConfiguration(process.env.CONVEX_SITE_URL ?? ""),
          ),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": DISCOVERY_CACHE_CONTROL,
            },
          },
        ),
      ),
  );
}

addAuthHttpRoutes(http);

/**
 * CORS policy (security item 67: no excessive exposure).
 *
 * Public, unauthenticated reads are safe to expose to any origin. Endpoints
 * that act on a bearer token do NOT advertise `*`: a browser from an unknown
 * origin gets no `Access-Control-Allow-Origin` header and cannot read the
 * response at all, so a page that somehow obtained a token cannot use it
 * cross-origin. Configure extra origins with `CORS_ALLOWED_ORIGINS`
 * (comma-separated) or `PUBLIC_ORIGIN`.
 */
const PUBLIC_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * Response headers applied to every REST answer (security items 65 + 70).
 *
 * `nosniff` stops a browser from re-interpreting a JSON or CSV body as HTML
 * (the classic stored-XSS-via-content-type route); `no-referrer` keeps a URL
 * that carries a certificate id or an `Authorization`-adjacent query string out
 * of third-party Referer logs. Neither weakens the API — both are
 * response-only. They are mirrored for the SPA by frontend/nginx.conf, which
 * adds the origin-wide policy (CSP, frame-ancestors) in production.
 */
const BASE_SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

/**
 * Sentinel meaning "do not emit this header". `json()` drops empty values, so a
 * privileged response can cancel a header the public defaults would otherwise
 * have set (notably `Access-Control-Allow-Origin: *`).
 */
const UNSET = "";

function allowedOrigins(): string[] {
  return (process.env.CORS_ALLOWED_ORIGINS ?? process.env.PUBLIC_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter((origin) => origin.length > 0 && origin !== "*");
}

/**
 * Headers for a privileged response. Same-origin use is unaffected (no Origin
 * header, or an Origin on the allowlist); unknown cross-origin callers get
 * nothing. `no-store` keeps tokens/scoring data out of shared caches.
 */
function privateHeaders(request: Request): Record<string, string> {
  const origin = (request.headers.get("Origin") ?? "").replace(/\/+$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
    // Explicitly cancel the public `*` from PUBLIC_CORS: a cross-origin caller
    // must not be able to read a privileged body, and an error response should
    // not advertise that the endpoint is open either.
    "Access-Control-Allow-Origin": UNSET,
  };
  if (origin && allowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
  }
  return headers;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response => {
  const merged: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...BASE_SECURITY_HEADERS,
    ...PUBLIC_CORS,
    ...headers,
  };
  const finalHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (value !== UNSET) finalHeaders[key] = value;
  }
  return new Response(JSON.stringify(body), { status, headers: finalHeaders });
};

/**
 * CSV download for an organizer-only export (security items 65 + 70).
 *
 * The exports used to answer with `Access-Control-Allow-Origin: *`, which let
 * any page read the full scoring export with the victim's session implicitly
 * attached to the request. They now carry the same private policy as the other
 * privileged endpoints: no wildcard, `no-store`, and no cross-origin read
 * unless the origin is explicitly allowlisted.
 */
const csvResponse = (body: string, request: Request): Response =>
  new Response(body, {
    headers: {
      ...privateHeaders(request),
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment",
    },
  });

/** Handlers are always async so they satisfy PublicHttpAction's Promise<Response>. */
type Handler = (ctx: ActionCtx, request: Request) => Promise<Response>;

function route(path: string, method: "GET" | "POST" | "OPTIONS", handler: Handler) {
  http.route({
    path,
    method,
    handler: httpAction(handler),
  });
}

function routePrefix(pathPrefix: string, method: "GET" | "POST", handler: Handler) {
  http.route({
    pathPrefix,
    method,
    handler: httpAction(handler),
  });
}

// ------------------------------------------------------------ cors preflight ---
route("/api/v1/preflight", "OPTIONS", async () => new Response(null, { status: 204 }));

// ---------------------------------------------------------------- health ---
route("/api/health", "GET", async () =>
  json({
    ok: true,
    service: "raptorjudge",
    version: "1.0.0",
    mode: "offline",
    time: new Date().toISOString(),
  }),
);

// -------------------------------------------------------------- openapi ----
const OPENAPI_SPEC = {
  openapi: "3.0.3",
  info: {
    title: "RaptorJudge API",
    version: "1.0.0",
    description:
      "Hackathon submission & judging platform API. Auth, events, teams, submissions, judging, normalization, pairwise, voting, exports, certificates, webhooks, audit and acceptance.",
    license: { name: "MIT" },
  },
  servers: [{ url: "/" }],
  paths: {
    "/api/health": { get: { summary: "Health check", responses: { "200": { description: "OK" } } } },
    "/api/v1/gallery/{slug}": {
      get: {
        summary: "Public gallery for an event (searchable, seeded-randomizable)",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "randomize", in: "query", schema: { type: "string", enum: ["0", "1"] } },
          { name: "seed", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Gallery cards + event summary" } },
      },
    },
    "/api/v1/events/{slug}": {
      get: {
        summary: "Public event detail with tracks and rubric",
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Event detail" } },
      },
    },
    "/api/v1/normalization/{slug}": {
      get: {
        summary: "Cross-judge normalization analysis + proof metrics",
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Normalization result" } },
      },
    },
    "/api/v1/pairwise/{slug}": {
      get: {
        summary: "Bradley-Terry leaderboard with convergence metrics",
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "BT ranking" } },
      },
    },
    "/api/v1/export/{slug}/{kind}": {
      get: {
        summary: "CSV export (submissions|scores|rankings|assignments) or bulk JSON (json)",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
          { name: "kind", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Export payload" } },
      },
    },
    "/api/v1/certificates/verify/{uuid}": {
      get: {
        summary: "Verify a certificate signature (public)",
        parameters: [
          { name: "uuid", in: "path", required: true, schema: { type: "string" } },
          { name: "signature", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Verification result" } },
      },
    },
    "/api/v1/acceptance": {
      post: { summary: "Run the acceptance suite (organizer/admin)", responses: { "200": { description: "Tier report" } } },
    },
    "/.well-known/openid-configuration": {
      get: { summary: "OIDC discovery document (full, RFC 8414)", responses: { "200": { description: "OIDC discovery document" } } },
    },
  },
};

route("/api/openapi.json", "GET", async () => json(OPENAPI_SPEC));

/**
 * Resolve the caller's user doc from their Bearer token.
 *
 * Fails closed: an absent, malformed, forged, expired or wrongly-scoped token
 * yields null and the caller answers 401/403. Only a signature-verified `sub`
 * is ever turned into a database lookup, so ids supplied by the client are
 * never trusted.
 */
async function resolveUser(ctx: ActionCtx, request: Request) {
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const verified = await verifyJwt(token, {
    jwks: process.env.JWKS,
    issuer: process.env.CONVEX_SITE_URL,
    audience: "convex",
  });
  if (!verified.ok) {
    // Reason only — never the token itself.
    console.warn(`rejected API bearer token: ${verified.reason}`);
    return null;
  }

  const userId = userIdFromSubject(verified.claims.sub);
  if (!userId) return null;
  try {
    return await ctx.runQuery(internal.httpPublic.userById, { userId });
  } catch {
    return null;
  }
}

/** Roles allowed to read unpublished judging results. */
const STAFF_ROLES = ["judge", "organizer", "admin"];

/** Are normalized scores / pairwise rankings public yet? */
function resultsPublished(status: string): boolean {
  return status === "published" || status === "archived";
}

// ----------------------------------------------------------- public reads ---

routePrefix("/api/v1/gallery/", "GET", async (ctx, request) => {
  const url = new URL(request.url);
  const slug = url.pathname.replace("/api/v1/gallery/", "").replace(/\/$/, "");
  const search = url.searchParams.get("search") ?? undefined;
  const randomize = url.searchParams.get("randomize") === "1";
  const seedParam = url.searchParams.get("seed");
  const event: any = await ctx.runQuery(internal.httpPublic.getEventBySlugPublic, { slug });
  if (!event) return json({ error: "event not found" }, 404);
  const cards: any = await ctx.runQuery(internal.httpPublic.galleryPublic, {
    eventId: event._id,
    search,
    randomize,
    seed: seedParam ? Number(seedParam) : undefined,
  });
  return json({
    event: { slug: event.slug, title: event.title, tagline: event.tagline, status: event.status },
    cards,
  });
});

routePrefix("/api/v1/events/", "GET", async (ctx, request) => {
  const url = new URL(request.url);
  const slug = url.pathname.replace("/api/v1/events/", "").replace(/\/$/, "");
  const event: any = await ctx.runQuery(internal.httpPublic.eventDetailPublic, { slug });
  if (!event) return json({ error: "event not found" }, 404);
  return json(event);
});

/**
 * Normalization + pairwise results (security item 70).
 *
 * These disclose every judge's calibration, the weighted score vectors and the
 * current ranking. They used to be world-readable, which leaked judging results
 * before the event was published (and would let a participant tune their
 * submission to the running ranking). Now: staff token, or results published.
 */
async function gateJudgingResults(ctx: ActionCtx, request: Request, slug: string) {
  const event: any = await ctx.runQuery(internal.httpPublic.getEventBySlugPublic, { slug });
  if (!event) return { denied: json({ error: "event not found" }, 404) as Response };
  if (resultsPublished(event.status)) return { event };
  const user = await resolveUser(ctx, request);
  if (!user || !STAFF_ROLES.includes(user.role ?? "participant")) {
    return {
      denied: json(
        { error: "judging results are not published yet", status: event.status },
        user ? 403 : 401,
        privateHeaders(request),
      ) as Response,
    };
  }
  return { event };
}

routePrefix("/api/v1/normalization/", "GET", async (ctx, request) => {
  const url = new URL(request.url);
  const slug = url.pathname.replace("/api/v1/normalization/", "").replace(/\/$/, "");
  const gate = await gateJudgingResults(ctx, request, slug);
  if (gate.denied) return gate.denied;
  const event = gate.event as any;
  const result: any = await ctx.runQuery(internal.httpPublic.normalizationPublic, { eventId: event._id });
  return json(result, 200, resultsPublished(event.status) ? {} : privateHeaders(request));
});

routePrefix("/api/v1/pairwise/", "GET", async (ctx, request) => {
  const url = new URL(request.url);
  const slug = url.pathname.replace("/api/v1/pairwise/", "").replace(/\/$/, "");
  const gate = await gateJudgingResults(ctx, request, slug);
  if (gate.denied) return gate.denied;
  const event = gate.event as any;
  const result: any = await ctx.runQuery(internal.httpPublic.pairwisePublic, { eventId: event._id });
  return json(result, 200, resultsPublished(event.status) ? {} : privateHeaders(request));
});

routePrefix("/api/v1/export/", "GET", async (ctx, request) => {
  const url = new URL(request.url);
  const rest = url.pathname.replace("/api/v1/export/", "").replace(/\/$/, "");
  const [slug, kind] = rest.split("/");
  const event: any = await ctx.runQuery(internal.httpPublic.getEventBySlugPublic, { slug });
  if (!event) return json({ error: "event not found" }, 404);

  // Exports are organizer-gated; accept a bearer token (verified identity).
  const user = await resolveUser(ctx, request);
  if (!user || !(user.role === "organizer" || user.role === "admin")) {
    return json({ error: "organizer or admin token required" }, user ? 403 : 401, privateHeaders(request));
  }
  switch (kind) {
    case "submissions": {
      const csv: string = await ctx.runQuery(internal.httpPublic.exportSubmissionsCsv, { eventId: event._id });
      return csvResponse(csv, request);
    }
    case "scores": {
      const csv: string = await ctx.runQuery(internal.httpPublic.exportScoresCsv, { eventId: event._id });
      return csvResponse(csv, request);
    }
    case "rankings": {
      const csv: string = await ctx.runQuery(internal.httpPublic.exportRankingsCsv, { eventId: event._id });
      return csvResponse(csv, request);
    }
    case "assignments": {
      const csv: string = await ctx.runQuery(internal.httpPublic.exportAssignmentsCsv, { eventId: event._id });
      return csvResponse(csv, request);
    }
    case "json": {
      const data: string = await ctx.runQuery(internal.httpPublic.exportEventJson, { eventId: event._id });
      return new Response(data, {
        headers: { ...privateHeaders(request), "Content-Type": "application/json" },
      });
    }
    default:
      return json({ error: "unknown export kind" }, 404);
  }
});

routePrefix("/api/v1/certificates/verify/", "GET", async (ctx, request) => {
  const url = new URL(request.url);
  const uuid = url.pathname.replace("/api/v1/certificates/verify/", "").replace(/\/$/, "");
  const signature = url.searchParams.get("signature") ?? "";
  const result: any = await ctx.runQuery(internal.httpPublic.verifyCertPublic, { certUuid: uuid, signature });
  return json(result, result.valid ? 200 : 404);
});

// ---------------------------------------------------- authenticated posts ---

/**
 * Run a privileged bridge call and answer with a sanitized error (item 65).
 *
 * An httpAction that throws returns Convex's error envelope — message, request
 * id and stack — to the caller. That is operational detail no API consumer
 * needs, so failures are logged server-side and answered with a generic body.
 */
async function guardedBridge(
  request: Request,
  run: () => Promise<unknown>,
): Promise<Response> {
  try {
    return json((await run()) as unknown, 200, privateHeaders(request));
  } catch (err) {
    console.error(`API bridge call failed: ${err instanceof Error ? err.message : String(err)}`);
    return json({ error: "request failed" }, 400, privateHeaders(request));
  }
}

route("/api/v1/acceptance", "POST", async (ctx, request) => {
  const user = await resolveUser(ctx, request);
  if (!user || !(user.role === "organizer" || user.role === "admin")) {
    return json({ error: "organizer or admin token required" }, user ? 403 : 401, privateHeaders(request));
  }
  return guardedBridge(request, () =>
    ctx.runMutation(internal.httpPublic.acceptanceBridge, { userId: user._id }),
  );
});

route("/api/v1/auth/switch-role", "POST", async (ctx, request) => {
  const user = await resolveUser(ctx, request);
  if (!user) return json({ error: "token required" }, 401, privateHeaders(request));
  const body = await request.json().catch(() => ({}));
  // switchRoleBridge enforces admin-only elevation itself (item 57); this
  // endpoint used to be self-service, letting any caller promote themselves.
  return guardedBridge(request, () =>
    ctx.runMutation(internal.httpPublic.switchRoleBridge, {
      userId: user._id,
      role: String((body as any).role ?? "participant"),
    }),
  );
});

export default http;
