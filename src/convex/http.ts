import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

/**
 * REST API (T4: 100% API-first). Public reads are open; authenticated
 * endpoints take the session JWT via Authorization: Bearer. Because Convex
 * httpActions do not propagate identity into nested calls, we resolve the
 * caller's user explicitly from their token and pass the verified userId to
 * internal bridge mutations (never trusting client-supplied ids).
 */

const http = httpRouter();

// ------------------------------------------------------------------ auth ---
auth.addHttpRoutes(http);

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
  },
};

route("/api/openapi.json", "GET", async () => json(OPENAPI_SPEC));

/** Resolve the caller's user doc from their Bearer token (returns null if invalid). */
async function resolveUser(ctx: ActionCtx, request: Request) {
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    return await ctx.runQuery(internal.httpPublic.userByToken, { token });
  } catch {
    return null;
  }
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

routePrefix("/api/v1/normalization/", "GET", async (ctx, request) => {
  const url = new URL(request.url);
  const slug = url.pathname.replace("/api/v1/normalization/", "").replace(/\/$/, "");
  const event: any = await ctx.runQuery(internal.httpPublic.getEventBySlugPublic, { slug });
  if (!event) return json({ error: "event not found" }, 404);
  const result: any = await ctx.runQuery(internal.httpPublic.normalizationPublic, { eventId: event._id });
  return json(result);
});

routePrefix("/api/v1/pairwise/", "GET", async (ctx, request) => {
  const url = new URL(request.url);
  const slug = url.pathname.replace("/api/v1/pairwise/", "").replace(/\/$/, "");
  const event: any = await ctx.runQuery(internal.httpPublic.getEventBySlugPublic, { slug });
  if (!event) return json({ error: "event not found" }, 404);
  const result: any = await ctx.runQuery(internal.httpPublic.pairwisePublic, { eventId: event._id });
  return json(result);
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
    return json({ error: "organizer or admin token required" }, 403);
  }
  switch (kind) {
    case "submissions": {
      const csv: string = await ctx.runQuery(internal.httpPublic.exportSubmissionsCsv, { eventId: event._id });
      return new Response(csv, { headers: { "Content-Type": "text/csv", "Access-Control-Allow-Origin": "*" } });
    }
    case "scores": {
      const csv: string = await ctx.runQuery(internal.httpPublic.exportScoresCsv, { eventId: event._id });
      return new Response(csv, { headers: { "Content-Type": "text/csv", "Access-Control-Allow-Origin": "*" } });
    }
    case "rankings": {
      const csv: string = await ctx.runQuery(internal.httpPublic.exportRankingsCsv, { eventId: event._id });
      return new Response(csv, { headers: { "Content-Type": "text/csv", "Access-Control-Allow-Origin": "*" } });
    }
    case "assignments": {
      const csv: string = await ctx.runQuery(internal.httpPublic.exportAssignmentsCsv, { eventId: event._id });
      return new Response(csv, { headers: { "Content-Type": "text/csv", "Access-Control-Allow-Origin": "*" } });
    }
    case "json": {
      const data: string = await ctx.runQuery(internal.httpPublic.exportEventJson, { eventId: event._id });
      return new Response(data, { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
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

route("/api/v1/acceptance", "POST", async (ctx, request) => {
  const user = await resolveUser(ctx, request);
  if (!user || !(user.role === "organizer" || user.role === "admin")) {
    return json({ error: "organizer or admin token required" }, 403);
  }
  const result: any = await ctx.runMutation(internal.httpPublic.acceptanceBridge, { userId: user._id });
  return json(result);
});

route("/api/v1/auth/switch-role", "POST", async (ctx, request) => {
  const user = await resolveUser(ctx, request);
  if (!user) return json({ error: "token required" }, 401);
  const body = await request.json().catch(() => ({}));
  const result: any = await ctx.runMutation(internal.httpPublic.switchRoleBridge, {
    userId: user._id,
    role: String((body as any).role ?? "participant"),
  });
  return json(result, result.ok ? 200 : 400);
});

export default http;
