import { internalQuery, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { hmacSha256Hex, safeEqualHex, seededShuffle, seedFromString, sha256Hex } from "./crypto";
import { normalizeScores, type JudgeScoreSet } from "../lib/algorithms/normalization";
import { bradleyTerry, type PairwiseMatchRecord } from "../lib/algorithms/pairwise";
import { appendAudit } from "./lib/audit";
import { assertRoleChangeAllowed } from "./lib/rbac";
import { runSecurityChecks } from "./lib/securityChecks";
import { verifyAuditChain } from "../lib/auditChain";

/**
 * Internal helpers backing the public REST routes in http.ts.
 * They expose ONLY public, non-sensitive data. Any privileged operation is
 * re-guarded inside the bridge mutations (role checks against the verified
 * userId resolved from the session token).
 */

/**
 * Load a user by id, for the HTTP layer.
 *
 * The previous `userByToken` decoded the JWT payload *without verifying the
 * signature* and looked the subject up — so a forged token was enough to act
 * as any user, including an admin (security items 63 + 70). Verification now
 * happens in the httpAction, which passes only the signature-verified `sub`
 * here; this function therefore never sees attacker-controlled input beyond
 * an id that has already been authenticated.
 */
export const userById = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    try {
      return await ctx.db.get(args.userId as Id<"users">);
    } catch {
      // Malformed id (not a users table id) — no user, no error.
      return null;
    }
  },
});

export const userBySessionHash = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("platform")
      .withIndex("by_key", (q) => q.eq("key", `session:${args.tokenHash}`))
      .unique();
    if (!row) return null;
    const session = JSON.parse(row.value);
    if (session.expiresAt && Date.now() > session.expiresAt) return null;
    return ctx.db.get(session.userId as Id<"users">);
  },
});

export const getJudgeScoresForUser = internalQuery({
  args: { judgeId: v.string() },
  handler: async (ctx, args) => {
    const scores = await ctx.db.query("judgeScores").collect();
    const mine = scores.filter((s) => String(s.judgeId) === args.judgeId);
    const users = await ctx.db.query("users").collect();
    const criteria = await ctx.db.query("rubricCriteria").collect();
    const subs = await ctx.db.query("submissions").collect();
    return mine.map((s) => ({
      submission: subs.find((x) => String(x._id) === String(s.submissionId))?.title ?? "",
      judge: users.find((u) => String(u._id) === String(s.judgeId))?.name ?? "",
      criterion: criteria.find((c) => String(c._id) === String(s.criterionId))?.name ?? "",
      score: s.score,
      comment: s.privateNotes,
    }));
  },
});

/**
 * Public event lookup for the REST surface.
 *
 * A `draft` event is unpublished, so the public API treats it as absent — the
 * same rule `events.getBySlug` applies for signed-in callers. Without this,
 * an unannounced event's title and schedule would be readable over REST while
 * the SPA correctly hid it.
 */
export const getEventBySlugPublic = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    return event && event.status !== "draft" ? event : null;
  },
});

export const eventDetailPublic = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db.query("events").withIndex("by_slug", (q) => q.eq("slug", args.slug)).unique();
    if (!event || event.status === "draft") return null;
    const tracks = await ctx.db
      .query("tracks")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect();
    const rubric = await ctx.db
      .query("rubricCriteria")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect();
    return {
      slug: event.slug,
      title: event.title,
      tagline: event.tagline,
      description: event.description,
      status: event.status,
      timeline: {
        registrationStart: event.registrationStart,
        registrationEnd: event.registrationEnd,
        submissionDeadline: event.submissionDeadline,
        judgingStart: event.judgingStart,
        judgingEnd: event.judgingEnd,
        votingStart: event.votingStart,
        votingEnd: event.votingEnd,
      },
      tracks,
      rubric,
    };
  },
});

export const galleryPublic = internalQuery({
  args: {
    eventId: v.id("events"),
    search: v.optional(v.string()),
    randomize: v.optional(v.boolean()),
    seed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return [];
    const visible = ["closed", "judging", "voting", "published", "archived"].includes(event.status);
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    let cards: any[] = [];
    for (const s of subs) {
      if (s.status !== "submitted") continue;
      const team = await ctx.db.get(s.teamId);
      const track = s.trackId ? await ctx.db.get(s.trackId) : null;
      cards.push({
        id: String(s._id),
        title: s.title,
        tagline: s.tagline,
        tags: s.tags,
        teamName: team?.name ?? "Unknown team",
        trackName: track?.name ?? "Open",
        repositoryUrl: s.repositoryUrl,
        videoUrl: s.videoUrl,
        demoUrl: s.demoUrl,
        submittedAt: s.submittedAt ?? s.updatedAt,
      });
    }
    if (!visible) cards = [];
    if (args.search) {
      const q = args.search.toLowerCase();
      cards = cards.filter((c) =>
        [c.title, c.tagline, c.tags, c.teamName, c.trackName].join(" ").toLowerCase().includes(q),
      );
    }
    if (args.randomize) {
      cards = seededShuffle(cards, args.seed ?? seedFromString(String(args.eventId)));
    }
    return cards;
  },
});

export const verifyCertPublic = internalQuery({
  args: { certUuid: v.string(), signature: v.string() },
  handler: async (ctx, args) => {
    const cert = await ctx.db
      .query("certificates")
      .withIndex("by_uuid", (q) => q.eq("certUuid", args.certUuid))
      .unique();
    if (!cert) return { valid: false, reason: "certificate not found" };
    const secretRow = await ctx.db
      .query("platform")
      .withIndex("by_key", (q) => q.eq("key", "cert_secret"))
      .unique();
    if (!secretRow) return { valid: false, reason: "server not initialized" };
    // canonical payload must match certificates.ts canonicalPayload exactly
    const payload = [cert.certUuid, cert.recipientName, cert.certType, cert.title, cert.trackName, cert.rank, cert.issuedAt].join("|");
    const signatureHash = await hmacSha256Hex(secretRow.value, payload);
    // Constant-time comparison (security item 65): `===` short-circuits on the
    // first differing character, which leaks the expected digest byte by byte
    // to anyone able to time the endpoint.
    const valid = safeEqualHex(signatureHash, args.signature);
    return {
      valid,
      reason: valid ? null : "signature mismatch — certificate may be forged",
      certificate: valid
        ? {
            certUuid: cert.certUuid,
            recipientName: cert.recipientName,
            certType: cert.certType,
            title: cert.title,
            trackName: cert.trackName,
            rank: cert.rank,
            issuedAt: cert.issuedAt,
          }
        : null,
    };
  },
});

// ------------------------------------------------------------- analytics ---

export const normalizationPublic = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const scores = await ctx.db
      .query("judgeScores")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    if (scores.length === 0) return { ok: false, reason: "no scores yet" };
    const criteria = await ctx.db
      .query("rubricCriteria")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const weightOf = (cid: string) =>
      criteria.find((c) => String(c._id) === cid)?.weight ?? 1 / Math.max(1, criteria.length);
    const acc = new Map<string, Map<string, { sum: number; w: number }>>();
    for (const s of scores) {
      const jKey = String(s.judgeId);
      const sKey = String(s.submissionId);
      acc.set(jKey, acc.get(jKey) ?? new Map());
      const inner = acc.get(jKey)!;
      inner.set(sKey, inner.get(sKey) ?? { sum: 0, w: 0 });
      const cur = inner.get(sKey)!;
      cur.sum += s.score * weightOf(String(s.criterionId));
      cur.w += weightOf(String(s.criterionId));
    }
    const judgeSets: JudgeScoreSet[] = [...acc.entries()].map(([judgeId, inner]) => ({
      judgeId,
      scores: Object.fromEntries([...inner.entries()].map(([sid, { sum, w }]) => [sid, w > 0 ? sum / w : sum])),
    }));
    const result = normalizeScores(judgeSets);
    const users = await ctx.db.query("users").collect();
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const nameOf = (id: string) => users.find((u) => String(u._id) === id)?.name ?? id;
    const titleOf = (id: string) => subs.find((s) => String(s._id) === id)?.title ?? id;
    return {
      ok: true,
      result: {
        ...result,
        submissions: result.submissions.map((s) => ({ ...s, title: titleOf(s.submissionId) })),
        judgeCalibrations: result.judgeCalibrations.map((j) => ({ ...j, judgeName: nameOf(j.judgeId) })),
      },
    };
  },
});

export const pairwisePublic = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const submitted = subs.filter((s) => s.status === "submitted");
    const rows = await ctx.db
      .query("pairwiseMatches")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const matches: PairwiseMatchRecord[] = rows.map((r) => ({
      submissionAId: String(r.submissionAId),
      submissionBId: String(r.submissionBId),
      winnerId: r.winnerId || null,
    }));
    const items = submitted.map((s) => String(s._id));
    const result = bradleyTerry(matches, items);
    return {
      ...result,
      ranking: result.ranking.map((r) => ({
        ...r,
        title: submitted.find((s) => String(s._id) === r.submissionId)?.title ?? "—",
      })),
      totalMatches: matches.length,
    };
  },
});

// --------------------------------------------------------------- exports ---

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export const exportSubmissionsCsv = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const teams = await ctx.db.query("teams").collect();
    const tracks = await ctx.db
      .query("tracks")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    return toCsv(
      subs.map((s) => ({
        id: s._id,
        title: s.title,
        team: teams.find((t) => t._id === s.teamId)?.name ?? "",
        track: tracks.find((t) => t._id === s.trackId)?.name ?? "Open",
        status: s.status,
        repository_url: s.repositoryUrl,
        submitted_at: s.submittedAt ? new Date(s.submittedAt).toISOString() : "",
      })),
    );
  },
});

export const exportScoresCsv = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const scores = await ctx.db
      .query("judgeScores")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const users = await ctx.db.query("users").collect();
    const criteria = await ctx.db
      .query("rubricCriteria")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    return toCsv(
      scores.map((s) => ({
        submission: subs.find((x) => x._id === s.submissionId)?.title ?? "",
        judge: users.find((u) => u._id === s.judgeId)?.name ?? "",
        criterion: criteria.find((c) => c._id === s.criterionId)?.name ?? "",
        weight: criteria.find((c) => c._id === s.criterionId)?.weight ?? "",
        score: s.score,
      })),
    );
  },
});

export const exportRankingsCsv = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const scores = await ctx.db
      .query("judgeScores")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    if (scores.length === 0) return "";
    const criteria = await ctx.db
      .query("rubricCriteria")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const weightOf = (cid: string) => criteria.find((c) => String(c._id) === cid)?.weight ?? 0;
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const acc = new Map<string, Map<string, { sum: number; w: number }>>();
    for (const s of scores) {
      const j = String(s.judgeId);
      const key = String(s.submissionId);
      acc.set(j, acc.get(j) ?? new Map());
      const inner = acc.get(j)!;
      inner.set(key, inner.get(key) ?? { sum: 0, w: 0 });
      const cur = inner.get(key)!;
      cur.sum += s.score * weightOf(String(s.criterionId));
      cur.w += weightOf(String(s.criterionId));
    }
    const judgeSets: JudgeScoreSet[] = [...acc.entries()].map(([judgeId, inner]) => ({
      judgeId,
      scores: Object.fromEntries([...inner.entries()].map(([sid, { sum, w }]) => [sid, w > 0 ? sum / w : sum])),
    }));
    const norm = normalizeScores(judgeSets);
    return toCsv(
      norm.submissions.map((s, i) => ({
        rank: i + 1,
        submission: subs.find((x) => String(x._id) === s.submissionId)?.title ?? s.submissionId,
        raw_mean: s.rawMean.toFixed(4),
        z_normalized: s.zNormalized.toFixed(4),
        minmax_normalized: s.minMaxNormalized.toFixed(4),
        bayesian_adjusted: s.bayesianAdjusted.toFixed(4),
      })),
    );
  },
});

export const exportAssignmentsCsv = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("judgeAssignments")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const users = await ctx.db.query("users").collect();
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    return toCsv(
      rows.map((r) => ({
        judge: users.find((u) => u._id === r.judgeId)?.name ?? "",
        submission: subs.find((s) => s._id === r.submissionId)?.title ?? "",
        status: r.status,
        assigned_at: new Date(r.assignedAt).toISOString(),
        completed_at: r.completedAt ? new Date(r.completedAt).toISOString() : "",
      })),
    );
  },
});

export const exportEventJson = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    const [tracks, teams, subs, criteria, assignments, scores, votes, matches, members] = await Promise.all([
      ctx.db.query("tracks").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("teams").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("submissions").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("rubricCriteria").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("judgeAssignments").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("judgeScores").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("communityVotes").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("pairwiseMatches").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("teamMembers").collect(),
    ]);
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        event,
        tracks,
        teams,
        teamMembers: members.filter((m) => teams.some((t) => t._id === m.teamId)),
        submissions: subs,
        rubric: criteria,
        judgeAssignments: assignments,
        judgeScores: scores,
        communityVotes: votes,
        pairwiseMatches: matches,
      },
      null,
      2,
    );
  },
});

// ------------------------------------------------- T3/T4 audit surface -------
//
// The routes behind `run_t3_t4.py` need a handful of reads the SPA gets through
// Convex subscriptions. They are internal (never directly callable) and every
// staff-only one re-checks the role against the verified userId.

/** Public event list for `GET /api/v1/events` (T4.2). */
export const listEventsPublic = internalQuery({
  args: {},
  handler: async (ctx) => {
    const events = (await ctx.db.query("events").collect()).filter((e) => e.status !== "draft");
    return events.map((e) => ({
      slug: e.slug,
      title: e.title,
      tagline: e.tagline,
      status: e.status,
      registrationStart: e.registrationStart,
      registrationEnd: e.registrationEnd,
      submissionDeadline: e.submissionDeadline,
      votingStart: e.votingStart,
      votingEnd: e.votingEnd,
    }));
  },
});

/** Staff check for the audit surface. */
async function requireStaffUser(ctx: any, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user || (user.role !== "organizer" && user.role !== "admin")) {
    throw new Error("Forbidden: organizer or admin required");
  }
  return user;
}

/**
 * Audit hash-chain verification for `GET /api/v1/audit/verify` (T3.9).
 *
 * Shares the walk with `audit.verifyChain` and the unit tests
 * (`src/lib/auditChain.ts`) so the order the chain is read in cannot regress.
 */
export const auditVerifyPublic = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireStaffUser(ctx, args.userId);
    const rows = await ctx.db.query("auditLogs").collect();
    return await verifyAuditChain(rows, sha256Hex);
  },
});

/**
 * One issued certificate to verify for `GET /api/v1/certificates/sample`
 * (T4.4). Returns the uuid and its HMAC signature so the checker can prove a
 * genuine certificate verifies and a tampered one does not.
 */
export const certificateSamplePublic = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireStaffUser(ctx, args.userId);
    const cert = (await ctx.db.query("certificates").collect())[0];
    if (!cert) return null;
    return {
      certUuid: cert.certUuid,
      signature: cert.signatureHash,
      recipientName: cert.recipientName,
      title: cert.title,
    };
  },
});

// ------------------------------------------------------------- bridges -------

/** Acceptance suite bridge (role re-checked here against verified userId). */
export const acceptanceBridge = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || !(user.role === "organizer" || user.role === "admin")) {
      throw new Error("Forbidden: organizer or admin required");
    }
    // run the same checks as acceptance.ts runSuite
    const users = await ctx.db.query("users").collect();
    const roles = new Set(users.map((u) => u.role));
    const events = await ctx.db.query("events").collect();
    const event = events[0];
    const subs = event
      ? await ctx.db.query("submissions").withIndex("by_event", (q) => q.eq("eventId", event._id)).collect()
      : [];
    const submitted = subs.filter((s) => s.status === "submitted");
    const assignments = event
      ? await ctx.db.query("judgeAssignments").withIndex("by_event", (q) => q.eq("eventId", event._id)).collect()
      : [];
    const scores = event
      ? await ctx.db.query("judgeScores").withIndex("by_event", (q) => q.eq("eventId", event._id)).collect()
      : [];
    const auditRows = await ctx.db.query("auditLogs").collect();
    const certs = await ctx.db.query("certificates").collect();

    const checks = [
      { tier: "T1", id: "t1.roles", description: "All 4 roles present", pass: roles.size >= 4 },
      { tier: "T1", id: "t1.event", description: "Event with timeline exists", pass: !!event },
      { tier: "T1", id: "t1.submissions", description: "Submitted projects exist", pass: submitted.length > 0 },
      { tier: "T2", id: "t2.assignments", description: "Judge assignments cover submissions", pass: submitted.every((s) => assignments.some((a) => a.submissionId === s._id)) && assignments.length > 0 },
      { tier: "T2", id: "t2.scores", description: "Judge scores recorded", pass: scores.length > 0 },
      { tier: "T3", id: "t3.audit", description: "Audit log populated", pass: auditRows.length > 0 },
      { tier: "T3", id: "t3.audit_chain", description: "Audit hash chain intact", pass: (() => {
          let prev = "GENESIS";
          const sorted = [...auditRows].sort((a, b) => a.timestamp - b.timestamp);
          for (const r of sorted) {
            if (r.prevHash !== prev) return false;
            prev = r.entryHash;
          }
          return true;
        })() },
      { tier: "T4", id: "t4.certificates", description: "Signed certificates exist", pass: certs.every((c) => c.signatureHash.length === 64) && certs.length > 0 },
    ];

    // Shared with acceptance.runSuite so the REST report and the dashboard
    // report can never disagree about the hardening checks (T5).
    for (const check of await runSecurityChecks(ctx)) {
      checks.push(check);
    }

    const passed = checks.filter((c) => c.pass).length;
    return { runAt: Date.now(), summary: `${passed}/${checks.length} checks passed`, checks };
  },
});

/**
 * Role switch bridge for the REST API.
 *
 * Security item 57: this used to be self-service, so any authenticated caller
 * could POST their own id with `role: "admin"` and escalate. It now goes
 * through exactly the same policy as `users.setRole` (lib/rbac.ts): admin-only,
 * audited, and refused while the account is committed to an event.
 */
export const switchRoleBridge = internalMutation({
  args: { userId: v.id("users"), role: v.string() },
  handler: async (ctx, args) => {
    const actor = await ctx.db.get(args.userId);
    if (!actor) return { ok: false, error: "user not found" };
    if ((actor.role ?? "participant") !== "admin") {
      // Includes self-promotion: an admin may only be appointed by an admin.
      await appendAudit(ctx, {
        actorId: args.userId,
        action: "user.role_switch_denied",
        targetType: "user",
        targetId: String(args.userId),
        afterState: JSON.stringify({ requested: args.role }),
      });
      return { ok: false, error: "forbidden: admin only" };
    }

    try {
      await assertRoleChangeAllowed(ctx, {
        actorRole: "admin",
        targetUserId: args.userId,
        currentRole: actor.role,
        nextRole: args.role,
      });
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "role change refused" };
    }

    await ctx.db.patch(args.userId, { role: args.role as never });
    await appendAudit(ctx, {
      actorId: args.userId,
      action: "user.role_switch",
      targetType: "user",
      targetId: String(args.userId),
      beforeState: actor.role ?? "",
      afterState: args.role,
    });
    return { ok: true, role: args.role };
  },
});
