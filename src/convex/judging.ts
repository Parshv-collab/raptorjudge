import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  assertJudgingOpen,
  requireOrganizer,
  requireUser,
  requireRole,
} from "./lib/common";
import { assertWithinWindow } from "./lib/timeWindows";
import { appendAudit } from "./lib/audit";
import { planJudgeAssignments, type AssignmentPlan } from "../lib/algorithms/assignment";
import { DEFAULT_RUBRIC } from "./lib/defaultRubric";
import { hmacSha256Hex, safeEqualHex } from "./crypto";
import { isResultsPublished, rankEventProjects } from "./lib/results";

async function getCertSecretReadOnly(ctx: any): Promise<string> {
  const row = await ctx.db
    .query("platform")
    .withIndex("by_key", (q: any) => q.eq("key", "cert_secret"))
    .unique();
  if (row) return row.value;
  return "raptor-cert-default-secret-key-fallback";
}

/** Default per-judge ceiling for the algorithmic assigner. */
export const DEFAULT_JUDGE_LOAD_CAP = 8;

/** Stages in which the rubric is frozen because scoring has started. */
const RUBRIC_FROZEN_STAGES = ["judging", "voting", "published", "archived"];

function rubricLockKey(eventId: string) {
  return `rubric_lock:${eventId}`;
}

function judgeTracksKey(judgeId: string) {
  return `judge_tracks:${judgeId}`;
}

/**
 * Judging engine (T2): rubrics, algorithmic assignments, score capture,
 * judge progress. Role isolation: judges see only their own assigned
 * submissions, and only while the event is in the judging stage.
 *
 * Access matrix (see JUDGING.md → "Role Isolation"):
 *   myQueue / submitScores / pairwise.*  judge · organizer · admin
 *   progress / allScores / preview / runAssignment / rubric edits / flags
 *                                        organizer · admin
 *   rubric reads                          anyone (rubric is published in the UI)
 */

/** Rubric lock state: explicit lock wins, otherwise the lifecycle stage freezes it. */
async function rubricLockState(ctx: any, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  const row = await ctx.db
    .query("platform")
    .withIndex("by_key", (q: any) => q.eq("key", rubricLockKey(String(eventId))))
    .unique();
  const explicitlyLocked = row?.value === "locked";
  const stageLocked = event ? RUBRIC_FROZEN_STAGES.includes(event.status) : false;
  return {
    explicitlyLocked,
    stageLocked,
    locked: explicitlyLocked || stageLocked,
    reason: explicitlyLocked
      ? "Locked by an organizer"
      : stageLocked
        ? `Frozen because the event is in the "${event?.status}" stage`
        : null,
  };
}

/**
 * Refuse a rubric write while the rubric is frozen.
 * A stage freeze can only be undone by moving the event back (organizer), an
 * explicit lock only by `unlockRubric` (admin).
 */
async function assertRubricEditable(ctx: any, eventId: Id<"events">, actorRole: string) {
  const state = await rubricLockState(ctx, eventId);
  if (!state.locked) return;
  if (actorRole === "admin" && !state.explicitlyLocked) return;
  throw new Error(
    state.explicitlyLocked
      ? "The rubric is locked. An admin must unlock it before criteria can change."
      : `The rubric is frozen: ${state.reason}. Move the event back a stage to edit it.`,
  );
}

// ---------------------------------------------------------------- rubrics ---

/**
 * The event rubric, with the weight audit the organizer UI needs.
 * `weightSum` / `weightValid` are the live validation signal (weights must sum
 * to exactly 1.0), and `locked` / `lockReason` drive the frozen-rubric UI.
 */
export const getRubric = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const criteria = await ctx.db
      .query("rubricCriteria")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    const lock = await rubricLockState(ctx, args.eventId);
    const stored = criteria.sort((a, b) => a.sortOrder - b.sortOrder);
    const rows = stored.length > 0
      ? stored.map((c) => ({
          id: String(c._id),
          _id: String(c._id),
          name: c.name,
          description: c.description,
          weight: c.weight,
          minScore: c.minScore,
          maxScore: c.maxScore,
          sortOrder: c.sortOrder,
        }))
      : DEFAULT_RUBRIC.criteria.map((c) => ({ ...c }));

    const weightSum = rows.reduce((acc, c) => acc + (c.weight ?? 0), 0);
    return {
      criteria: rows,
      isDefault: stored.length === 0,
      locked: lock.locked,
      lockedByStage: lock.stageLocked,
      lockedExplicitly: lock.explicitlyLocked,
      lockReason: lock.reason,
      weightSum,
      weightValid: Math.abs(weightSum - 1) <= 0.001,
    };
  },
});

/** Explicitly lock the rubric ahead of judging (organizer/admin, audited). */
export const lockRubric = mutation({
  args: { eventId: v.id("events"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    await assertJudgingOpen(ctx, args.eventId);
    await setPlatform(ctx, rubricLockKey(String(args.eventId)), "locked");
    await appendAudit(ctx, {
      eventId: args.eventId,
      actorId: actor._id,
      action: "rubric.lock",
      targetType: "event",
      targetId: String(args.eventId),
      afterState: JSON.stringify({ note: args.note ?? "" }),
    });
    return { ok: true, locked: true };
  },
});

/** Unlock an explicitly locked rubric (admin only, per the T2 requirement). */
export const unlockRubric = mutation({
  args: { eventId: v.id("events"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");
    await assertJudgingOpen(ctx, args.eventId);
    await setPlatform(ctx, rubricLockKey(String(args.eventId)), "unlocked");
    await appendAudit(ctx, {
      eventId: args.eventId,
      actorId: actor._id,
      action: "rubric.unlock",
      targetType: "event",
      targetId: String(args.eventId),
      afterState: JSON.stringify({ note: args.note ?? "" }),
    });
    return { ok: true, locked: false };
  },
});

/** Insert-or-update a `platform` key/value row. */
async function setPlatform(ctx: any, key: string, value: string) {
  const existing = await ctx.db
    .query("platform")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .unique();
  if (existing) await ctx.db.patch(existing._id, { value });
  else await ctx.db.insert("platform", { key, value });
}

export const rubricForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const res = await ctx.db
      .query("rubricCriteria")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    if (res.length > 0) return res;
    return DEFAULT_RUBRIC.criteria.map((c) => ({
      _id: c.id as never,
      eventId: args.eventId,
      name: c.name,
      description: c.description,
      weight: c.weight,
      minScore: c.minScore,
      maxScore: c.maxScore,
      sortOrder: c.sortOrder,
    }));
  },
});

export const customizeRubric = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    await assertJudgingOpen(ctx, args.eventId);
    const existing = await ctx.db
      .query("rubricCriteria")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    if (existing.length === 0) {
      for (const c of DEFAULT_RUBRIC.criteria) {
        await ctx.db.insert("rubricCriteria", {
          eventId: args.eventId,
          name: c.name,
          description: c.description,
          weight: c.weight,
          minScore: c.minScore,
          maxScore: c.maxScore,
          sortOrder: c.sortOrder,
        });
      }
    }

    await appendAudit(ctx, {
      eventId: args.eventId,
      actorId: actor._id,
      action: "rubric.customize",
      targetType: "event",
      targetId: String(args.eventId),
    });

    return { ok: true };
  },
});

export const deleteCriterion = mutation({
  args: { eventId: v.id("events"), criterionId: v.id("rubricCriteria") },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    await assertJudgingOpen(ctx, args.eventId);
    await assertRubricEditable(ctx, args.eventId, actor.role ?? "participant");
    const criterion = await ctx.db.get(args.criterionId);
    if (!criterion) throw new Error("Criterion not found");
    const criteria = await ctx.db
      .query("rubricCriteria")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    if (criteria.length <= 1) {
      throw new Error("At least 1 criterion required");
    }
    await ctx.db.delete(args.criterionId);
    await appendAudit(ctx, {
      eventId: args.eventId,
      actorId: actor._id,
      action: "rubric.delete_criterion",
      targetType: "criterion",
      targetId: String(args.criterionId),
    });
    return { ok: true };
  },
});

export const upsertCriterion = mutation({
  args: {
    eventId: v.id("events"),
    criterionId: v.optional(v.id("rubricCriteria")),
    name: v.string(),
    description: v.string(),
    weight: v.number(),
    minScore: v.number(),
    maxScore: v.number(),
    /** Set true to save a rubric that does not yet sum to 1.0 (organizer intent). */
    allowWeightMismatch: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    await assertJudgingOpen(ctx, args.eventId);
    await assertRubricEditable(ctx, args.eventId, actor.role ?? "participant");

    const name = args.name.trim();
    if (name.length < 2 || name.length > 60) {
      throw new Error("Criterion name must be 2-60 characters");
    }
    if (args.description.length > 500) {
      throw new Error("Criterion description must be at most 500 characters");
    }
    if (!Number.isFinite(args.weight) || args.weight <= 0 || args.weight > 1) {
      throw new Error("Weight must be greater than 0 and at most 1.0");
    }
    if (!Number.isFinite(args.minScore) || !Number.isFinite(args.maxScore) || args.minScore >= args.maxScore) {
      throw new Error("Minimum score must be lower than maximum score");
    }
    if (args.minScore < 0) throw new Error("Minimum score cannot be negative");

    // Weight audit: warn (default) or accept explicitly. Never store silently
    // broken weights — a rubric whose weights do not sum to 1.0 distorts every
    // weighted total the judges see.
    const siblings = (
      await ctx.db
        .query("rubricCriteria")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect()
    ).filter((c) => c._id !== args.criterionId);
    const projected = siblings.reduce((acc, c) => acc + c.weight, 0) + args.weight;
    if (Math.abs(projected - 1) > 0.001 && !args.allowWeightMismatch) {
      throw new Error(
        `Weights would sum to ${projected.toFixed(3)} instead of 1.000. ` +
          "Adjust the weights, or confirm to save a draft rubric.",
      );
    }

    if (args.criterionId) {
      await ctx.db.patch(args.criterionId, {
        name,
        description: args.description,
        weight: args.weight,
        minScore: args.minScore,
        maxScore: args.maxScore,
      });
      await appendAudit(ctx, {
        eventId: args.eventId,
        actorId: actor._id,
        action: "rubric.update_criterion",
        targetType: "criterion",
        targetId: String(args.criterionId),
        afterState: JSON.stringify({
          name,
          weight: args.weight,
          range: [args.minScore, args.maxScore],
        }),
      });
      return args.criterionId;
    }
    const id = await ctx.db.insert("rubricCriteria", {
      eventId: args.eventId,
      name,
      description: args.description,
      weight: args.weight,
      minScore: args.minScore,
      maxScore: args.maxScore,
      sortOrder: siblings.length,
    });
    await appendAudit(ctx, {
      eventId: args.eventId,
      actorId: actor._id,
      action: "rubric.add_criterion",
      targetType: "criterion",
      targetId: String(id),
      afterState: JSON.stringify({ name, weight: args.weight }),
    });
    return id;
  },
});

// ------------------------------------------------------------ assignments ---

/**
 * Judge track specialisation.
 *
 * Stored in the `platform` key/value table as `judge_tracks:<userId>` instead of
 * a new column so the (already deployed) schema does not have to change. The
 * assigner reads it automatically; organizers can override it per event.
 */
export const getJudgeTracks = query({
  args: {},
  handler: async (ctx) => {
    await requireOrganizer(ctx);
    const rows = await ctx.db.query("platform").collect();
    const out: Record<string, string[]> = {};
    for (const row of rows) {
      if (!row.key.startsWith("judge_tracks:")) continue;
      try {
        const parsed = JSON.parse(row.value);
        if (Array.isArray(parsed)) out[row.key.slice("judge_tracks:".length)] = parsed.map(String);
      } catch {
        // Ignore malformed rows rather than failing the whole query.
      }
    }
    return out;
  },
});

/** Set the tracks a judge specialises in (organizer/admin, audited). */
export const setJudgeTracks = mutation({
  args: { eventId: v.id("events"), judgeId: v.id("users"), tracks: v.array(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    await assertJudgingOpen(ctx, args.eventId);
    const tracks = await ctx.db
      .query("tracks")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const valid = new Set(tracks.map((t) => t.name));
    const cleaned = Array.from(new Set(args.tracks.map((t) => t.trim()).filter((t) => t.length > 0)));
    const unknown = cleaned.filter((name) => !valid.has(name));
    if (unknown.length > 0) {
      throw new Error(`Unknown track(s): ${unknown.join(", ")}`);
    }

    await setPlatform(ctx, judgeTracksKey(String(args.judgeId)), JSON.stringify(cleaned));
    await appendAudit(ctx, {
      eventId: args.eventId,
      actorId: actor._id,
      action: "judging.set_tracks",
      targetType: "judge",
      targetId: String(args.judgeId),
      afterState: JSON.stringify({ tracks: cleaned }),
    });
    return { ok: true, tracks: cleaned };
  },
});

/** Everything the assignment planner needs, gathered from the database. */
async function buildAssignmentInputs(ctx: any, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  if (!event) throw new Error("Event not found");

  const subs = await ctx.db
    .query("submissions")
    .withIndex("by_event", (q: any) => q.eq("eventId", eventId))
    .collect();
  const submitted = subs.filter((s: any) => s.status === "submitted");

  const judges = (await ctx.db.query("users").collect()).filter(
    (u: any) => u.role === "judge",
  );

  const teamRows = await ctx.db
    .query("teams")
    .withIndex("by_event", (q: any) => q.eq("eventId", eventId))
    .collect();
  const memberRows = await ctx.db.query("teamMembers").collect();
  const teamMembersMap: Record<string, string[]> = {};
  const judgeTeamMemberships: Record<string, string[]> = {};
  const judgeUserIds = new Set(judges.map((j: any) => j._id));
  for (const t of teamRows) teamMembersMap[String(t._id)] = [];
  for (const m of memberRows) {
    const tid = String(m.teamId);
    if (tid in teamMembersMap) teamMembersMap[tid].push(String(m.userId));
    if (judgeUserIds.has(m.userId)) {
      (judgeTeamMemberships[String(m.userId)] ??= []).push(tid);
    }
  }

  const tracks = await ctx.db
    .query("tracks")
    .withIndex("by_event", (q: any) => q.eq("eventId", eventId))
    .collect();

  // Judge specialisations: `judge_tracks:<userId>` platform rows.
  const platformRows = await ctx.db.query("platform").collect();
  const tracksByJudge: Record<string, string[]> = {};
  for (const row of platformRows) {
    if (!row.key.startsWith("judge_tracks:")) continue;
    try {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) tracksByJudge[row.key.slice("judge_tracks:".length)] = parsed.map(String);
    } catch {
      // Ignore malformed rows.
    }
  }

  return {
    event,
    submitted,
    judges,
    trackNames: tracks.map((t: any) => t.name),
    tracks,
    planInput: {
      submissions: submitted.map((s: any) => {
        const track = s.trackId ? tracks.find((t: any) => t._id === s.trackId) : null;
        return {
          submissionId: String(s._id),
          teamId: String(s.teamId),
          trackName: track?.name ?? "Open",
        };
      }),
      judges: judges.map((j: any) => ({
        judgeId: String(j._id),
        affinityTracks: tracksByJudge[String(j._id)] ?? [],
      })),
      teamMembers: teamMembersMap,
      judgeTeamMemberships,
    },
  };
}

function serializePlan(plan: AssignmentPlan, judges: any[], submitted: any[]) {
  const nameOf = (id: string) => judges.find((j: any) => String(j._id) === id)?.name ?? id;
  return {
    totalAssignments: plan.totalAssignments,
    minJudgesMet: plan.minJudgesMet,
    conflictsAvoided: plan.conflictsAvoided,
    capReached: plan.capReached.map((id) => ({ judgeId: id, name: nameOf(id) })),
    maxAssignmentsPerJudge: plan.maxAssignmentsPerJudge,
    unstaffedSubmissions: plan.unstaffedSubmissions.map((id) => ({
      submissionId: id,
      title: submitted.find((s: any) => String(s._id) === id)?.title ?? id,
    })),
    workload: Object.entries(plan.workload)
      .map(([judgeId, load]) => ({ judgeId, name: nameOf(judgeId), load }))
      .sort((a, b) => b.load - a.load),
    perSubmission: Object.entries(plan.assignments).map(([submissionId, judgeIds]) => ({
      submissionId,
      title: submitted.find((s: any) => String(s._id) === submissionId)?.title ?? submissionId,
      judgeIds,
      judgeNames: judgeIds.map(nameOf),
      judgeCount: judgeIds.length,
    })),
  };
}

/**
 * Dry-run the assignment engine without writing anything (T2.1).
 * The organizer reviews per-judge load, coverage and conflicts, then commits.
 */
export const previewAssignment = query({
  args: {
    eventId: v.id("events"),
    minJudgesPerSubmission: v.optional(v.number()),
    maxAssignmentsPerJudge: v.optional(v.number()),
    seed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx);
    const { submitted, judges, planInput } = await buildAssignmentInputs(ctx, args.eventId);
    if (submitted.length === 0) {
      return { ok: false, reason: "No submitted projects to assign", plan: null };
    }
    if (judges.length === 0) {
      return { ok: false, reason: "No judge accounts exist", plan: null };
    }
    const plan = planJudgeAssignments({
      ...planInput,
      minJudgesPerSubmission: args.minJudgesPerSubmission ?? 3,
      maxAssignmentsPerJudge: args.maxAssignmentsPerJudge ?? DEFAULT_JUDGE_LOAD_CAP,
      seed: args.seed,
    });
    return { ok: true, reason: null, plan: serializePlan(plan, judges, submitted) };
  },
});

/** Assign projects to a specific judge manually/batch. */
export const assignProjects = mutation({
  args: {
    eventId: v.id("events"),
    judgeId: v.id("users"),
    submissionIds: v.array(v.id("submissions")),
  },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    await assertJudgingOpen(ctx, args.eventId);
    const now = Date.now();
    let count = 0;
    for (const subId of args.submissionIds) {
      const existing = await ctx.db
        .query("judgeAssignments")
        .withIndex("by_judge", (q) => q.eq("judgeId", args.judgeId))
        .collect();
      if (!existing.some((a) => a.submissionId === subId)) {
        await ctx.db.insert("judgeAssignments", {
          eventId: args.eventId,
          judgeId: args.judgeId,
          submissionId: subId,
          status: "assigned",
          assignedAt: now,
        });
        count++;
      }
    }
    await appendAudit(ctx, {
      eventId: args.eventId,
      actorId: actor._id,
      action: "judging.assign_manual",
      targetType: "judge",
      targetId: String(args.judgeId),
      afterState: JSON.stringify({ count }),
    });
    return { ok: true, count };
  },
});

/**
 * Algorithmic assignment engine (organizer/admin only, audited).
 *
 * Load-balanced, conflict-of-interest aware, track-affinity preferring and
 * capped at `maxAssignmentsPerJudge` (default 8) per judge. Judges whose
 * specialisation (set with `setJudgeTracks`) matches a project's track are
 * preferred, matching the `tracks` list carried by each judge in fixtures.json.
 * Run `previewAssignment` first to review the plan before committing.
 */
export const runAssignment = mutation({
  args: {
    eventId: v.id("events"),
    minJudgesPerSubmission: v.optional(v.number()),
    maxAssignmentsPerJudge: v.optional(v.number()),
    seed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    await assertJudgingOpen(ctx, args.eventId);
    const { submitted, judges, planInput } = await buildAssignmentInputs(ctx, args.eventId);
    if (submitted.length === 0) throw new Error("No submitted projects to assign");
    if (judges.length === 0) throw new Error("No judge accounts exist");

    const requestedK = args.minJudgesPerSubmission ?? 3;
    const cap = args.maxAssignmentsPerJudge ?? DEFAULT_JUDGE_LOAD_CAP;
    if (requestedK < 1 || requestedK > 10) throw new Error("Judges per submission must be between 1 and 10");
    if (cap < requestedK) {
      throw new Error(`The per-judge load cap (${cap}) cannot be lower than judges per submission (${requestedK})`);
    }

    const plan = planJudgeAssignments({
      ...planInput,
      minJudgesPerSubmission: requestedK,
      maxAssignmentsPerJudge: cap,
      seed: args.seed,
    });

    // replace existing assignments for this event
    const old = await ctx.db
      .query("judgeAssignments")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    for (const o of old) await ctx.db.delete(o._id);

    const now = Date.now();
    let inserted = 0;
    // Security item 57: a submission must never accumulate two assignments for
    // the same judge. A duplicate row would let one judge supply two score sets
    // (double weight in normalization) and would break per-assignment
    // uniqueness assumptions, so the plan is de-duplicated here.
    for (const [subId, judgeIds] of Object.entries(plan.assignments)) {
      for (const judgeId of Array.from(new Set(judgeIds))) {
        await ctx.db.insert("judgeAssignments", {
          eventId: args.eventId,
          judgeId: judgeId as never,
          submissionId: subId as never,
          status: "assigned",
          assignedAt: now,
        });
        inserted++;
      }
    }

    await appendAudit(ctx, {
      eventId: args.eventId,
      actorId: actor._id,
      action: "judging.assign",
      targetType: "event",
      targetId: String(args.eventId),
      afterState: JSON.stringify({
        totalAssignments: inserted,
        judgesPerSubmission: requestedK,
        loadCap: cap,
        workload: plan.workload,
        conflictsAvoided: plan.conflictsAvoided.length,
        capReached: plan.capReached,
      }),
    });
    return {
      totalAssignments: inserted,
      workload: plan.workload,
      minJudgesMet: plan.minJudgesMet,
      conflictsAvoided: plan.conflictsAvoided,
      capReached: plan.capReached,
      maxAssignmentsPerJudge: cap,
    };
  },
});

// ---------------------------------------------------------------- scoring ---

/**
 * Judge queue: the caller's own assigned submissions.
 *
 * Role isolation: a judge must never see another judge's assignments or their
 * draft scores. The queue is therefore always scoped to the caller's own
 * `judgeId`; only an organizer/admin may inspect a different judge's queue by
 * passing `judgeId` explicitly (used by the organizer judge-drilldown view).
 */
export const myQueue = query({
  args: { eventId: v.optional(v.id("events")), judgeId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const isStaff = user.role === "admin" || user.role === "organizer";

    if (args.judgeId && String(args.judgeId) !== String(user._id)) {
      await requireOrganizer(ctx);
    }
    const judgeId = args.judgeId ?? user._id;

    let assignments;
    if (args.eventId) {
      const all = await ctx.db
        .query("judgeAssignments")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId!))
        .collect();
      assignments = all.filter((a) => a.judgeId === judgeId);
    } else {
      assignments = await ctx.db
        .query("judgeAssignments")
        .withIndex("by_judge", (q) => q.eq("judgeId", judgeId))
        .collect();
    }

    const out = [];
    const now = Date.now();
    const eventSet = new Set<string>();

    for (const a of assignments) {
      const event = await ctx.db.get(a.eventId);
      if (!event) continue;
      eventSet.add(String(event._id));

      const judgingStart = event.judgingStart ?? event.judgingStarts ?? 0;
      const judgingEnd = event.judgingEnd ?? event.judgingEnds ?? Infinity;

      const inWindow =
        event.status === "judging" || (now >= judgingStart && now <= judgingEnd);

      const canScore = (inWindow || isStaff) && a.status !== "completed";

      let judgingWindowLabel = "Open";
      if (!inWindow) {
        if (now < judgingStart && judgingStart > 0) {
          judgingWindowLabel = `Opens ${new Date(judgingStart).toLocaleDateString()}`;
        } else {
          judgingWindowLabel = `Closed ${judgingEnd < Infinity ? new Date(judgingEnd).toLocaleDateString() : ""}`.trim();
        }
      }

      const sub = await ctx.db.get(a.submissionId);
      if (!sub) continue;
      const team = await ctx.db.get(sub.teamId);
      let teamName: string | null = team?.name ?? null;
      if (!teamName) {
        const creator = await ctx.db.get(team?.createdBy ?? sub.teamId as never);
        teamName = creator?.name || creator?.email || "Solo";
      }

      const track = sub.trackId ? await ctx.db.get(sub.trackId) : null;

      const criteria = await ctx.db
        .query("rubricCriteria")
        .withIndex("by_event", (q) => q.eq("eventId", a.eventId))
        .collect();

      const scores = await ctx.db
        .query("judgeScores")
        .withIndex("by_assignment", (q) => q.eq("assignmentId", a._id))
        .collect();

      out.push({
        _id: String(a._id),
        assignmentId: String(a._id),
        status: a.status,
        assignedAt: a.assignedAt,
        eventId: String(event._id),
        eventTitle: event.title,
        eventSlug: event.slug,
        event: {
          _id: String(event._id),
          title: event.title,
          slug: event.slug,
        },
        teamName,
        canScore,
        judgingWindowLabel,
        submission: {
          _id: String(sub._id),
          id: String(sub._id),
          title: sub.title,
          tagline: sub.tagline,
          description: sub.description,
          repositoryUrl: sub.repositoryUrl,
          videoUrl: sub.videoUrl,
          demoUrl: sub.demoUrl,
          tags: sub.tags,
          teamName: teamName ?? "—",
          trackName: track?.name ?? "Open",
        },
        scoredCriteria: scores.map((s) => ({ criterionId: String(s.criterionId), score: s.score, notes: s.privateNotes })),
        criteriaCount: criteria.length,
        locked: !canScore && !isStaff && a.status === "completed",
      });
    }

    return {
      items: out,
      judgingOpen: out.some((i) => i.canScore),
      eventCount: eventSet.size,
    };
  },
});

/** Submit scores for one assignment. Judge must own the assignment; judging stage enforced. */
export const submitScores = mutation({
  args: {
    assignmentId: v.id("judgeAssignments"),
    scores: v.array(v.object({ criterionId: v.id("rubricCriteria"), score: v.number() })),
    privateNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "judge", "organizer", "admin");
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) throw new Error("Assignment not found");
    if (user.role === "judge" && assignment.judgeId !== user._id) {
      throw new Error("Forbidden: not your assignment");
    }
    await assertJudgingOpen(ctx, assignment.eventId);
    const event = await ctx.db.get(assignment.eventId);
    if (!event) throw new Error("Event not found");
    if (user.role === "judge") {
      assertWithinWindow(event, "judging");
    }
    // Security item 57: a judge scores each submission exactly once. Re-opening
    // a completed assignment would let a judge revise a score after seeing
    // other results; organizers/admins can still correct a score explicitly.
    if (user.role === "judge" && assignment.status === "completed") {
      throw new Error("You have already scored this submission");
    }

    const criteria = await ctx.db
      .query("rubricCriteria")
      .withIndex("by_event", (q) => q.eq("eventId", assignment.eventId))
      .collect();
    const now = Date.now();

    // Security item 57: collapse duplicate criterion ids in the request (last
    // one wins). Without this, the same criterion sent twice inserted two rows
    // because `existing` is read before the loop.
    const requested = new Map(args.scores.map((s) => [String(s.criterionId), s]));
    if (requested.size !== args.scores.length) {
      throw new Error("Each rubric criterion may only be scored once per submission");
    }

    // upsert one row per criterion
    const existing = await ctx.db
      .query("judgeScores")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", args.assignmentId))
      .collect();
    for (const s of args.scores) {
      const criterion = criteria.find((c) => c._id === s.criterionId);
      if (!criterion) throw new Error("Unknown criterion");
      if (s.score < criterion.minScore || s.score > criterion.maxScore) {
        throw new Error(`Score for ${criterion.name} must be between ${criterion.minScore} and ${criterion.maxScore}`);
      }
      const prior = existing.find((e) => e.criterionId === s.criterionId);
      if (prior) {
        await ctx.db.patch(prior._id, { score: s.score, submittedAt: now, privateNotes: args.privateNotes ?? prior.privateNotes });
      } else {
        await ctx.db.insert("judgeScores", {
          eventId: assignment.eventId,
          assignmentId: args.assignmentId,
          submissionId: assignment.submissionId,
          judgeId: user._id,
          criterionId: s.criterionId,
          score: s.score,
          privateNotes: args.privateNotes ?? "",
          submittedAt: now,
        });
      }
    }

    const scoredCount = new Set([...existing.map((e) => String(e.criterionId)), ...args.scores.map((s) => String(s.criterionId))]).size;
    const complete = scoredCount >= criteria.length && criteria.length > 0;
    await ctx.db.patch(args.assignmentId, {
      status: complete ? "completed" : "in_progress",
      completedAt: complete ? now : undefined,
    });

    if (complete && user.role === "judge") {
      await appendAudit(ctx, {
        eventId: assignment.eventId,
        actorId: user._id,
        action: "judging.score_submit",
        targetType: "assignment",
        targetId: String(args.assignmentId),
        afterState: JSON.stringify({ submissionId: String(assignment.submissionId), criteria: scoredCount }),
      });
      // Webhook event: a completed judging assignment is the unit subscribers
      // care about (partial saves stay internal). Enqueued, never fired inline.
      await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
        eventId: assignment.eventId,
        eventType: "score.recorded",
        payload: JSON.stringify({
          assignmentId: String(args.assignmentId),
          judgeId: String(user._id),
          submissionId: String(assignment.submissionId),
          criteriaScored: scoredCount,
          completedAt: now,
        }),
      });
    }
    return { ok: true, complete };
  },
});

/**
 * Organizer progress dashboard: per-judge completion, per-submission coverage
 * and the reviewer-bias heatmap. Organizer/admin only — the heatmap exposes
 * every judge's average score, which peers must never see.
 */
export const progress = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx);
    const assignments = await ctx.db
      .query("judgeAssignments")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const criteria = await ctx.db
      .query("rubricCriteria")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const users = await ctx.db.query("users").collect();
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const scores = await ctx.db
      .query("judgeScores")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    const perJudge = assignments.reduce<Record<string, { total: number; completed: number }>>((acc, a) => {
      const key = String(a.judgeId);
      acc[key] ??= { total: 0, completed: 0 };
      acc[key].total++;
      if (a.status === "completed") acc[key].completed++;
      return acc;
    }, {});

    const perSubmission = subs
      .filter((s) => s.status === "submitted")
      .map((s) => {
        const rel = assignments.filter((a) => a.submissionId === s._id);
        const scored = rel.filter((a) => a.status === "completed").length;
        return { submissionId: String(s._id), title: s.title, assigned: rel.length, completed: scored };
      });

    // reviewer heatmap: scores by (judge, criterion) — for bias detection
    const heatmap: Record<string, { count: number; sum: number }> = {};
    for (const s of scores) {
      const key = `${s.judgeId}:${s.criterionId}`;
      heatmap[key] ??= { count: 0, sum: 0 };
      heatmap[key].count++;
      heatmap[key].sum += s.score;
    }

    return {
      totalAssignments: assignments.length,
      completedAssignments: assignments.filter((a) => a.status === "completed").length,
      criteriaCount: criteria.length,
      perJudge: Object.entries(perJudge).map(([judgeId, v]) => ({
        judgeId,
        name: users.find((u) => String(u._id) === judgeId)?.name ?? "—",
        ...v,
        percent: v.total > 0 ? Math.round((v.completed / v.total) * 100) : 0,
      })),
      perSubmission,
      heatmap: Object.entries(heatmap).map(([key, v]) => {
        const [judgeId, criterionId] = key.split(":");
        return {
          judgeId,
          criterionId,
          judgeName: users.find((u) => String(u._id) === judgeId)?.name ?? "—",
          criterionName: criteria.find((c) => String(c._id) === criterionId)?.name ?? "—",
          avg: v.count > 0 ? v.sum / v.count : 0,
          count: v.count,
        };
      }),
    };
  },
});

/**
 * Verifiable signed judge participation record (T4.4).
 *
 * Visibility: a judge may always read their own record, staff may read any,
 * and everyone else may read it once results are published. Before publish the
 * record stays private so participation counts cannot leak mid-event.
 */
export const judgeRecord = query({
  args: { eventId: v.id("events"), judgeId: v.id("users") },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");

    const isStaff = viewer.role === "admin" || viewer.role === "organizer";
    const isSelf = String(viewer._id) === String(args.judgeId);
    const resultsPublished = event.status === "published" || event.status === "archived";
    if (!isStaff && !isSelf && !resultsPublished) {
      throw new Error("Forbidden: judge records are published with the results");
    }

    const judge = await ctx.db.get(args.judgeId);
    if (!judge) throw new Error("Judge not found");

    const scores = await ctx.db
      .query("judgeScores")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const judgeScores = scores.filter((s) => s.judgeId === args.judgeId);

    const projectsScoredCount = new Set(judgeScores.map((s) => String(s.submissionId))).size;
    // Attestation time = the judge's last submission. Using `Date.now()` here
    // made the record look freshly issued on every read even though the
    // signature (and therefore the record) never changes.
    const issuedAt = judgeScores.reduce((max, s) => Math.max(max, s.submittedAt), 0);

    const secret = await getCertSecretReadOnly(ctx);
    const payloadStr = [
      judge._id,
      event._id,
      judge.name,
      event.title,
      projectsScoredCount,
      judgeScores.length,
    ].join("|");

    const signature = await hmacSha256Hex(secret, payloadStr);

    return {
      uuid: String(judge._id),
      judgeName: judge.name,
      eventName: event.title,
      eventSlug: event.slug,
      projectsScored: projectsScoredCount,
      totalScoresSubmitted: judgeScores.length,
      issuedAt,
      signature,
      verificationUrl: `/verify/judge/${judge._id}?signature=${signature}&eventId=${event._id}&projectsScored=${projectsScoredCount}&totalScores=${judgeScores.length}&judgeName=${encodeURIComponent(judge.name)}&eventName=${encodeURIComponent(event.title)}`,
    };
  },
});

// A `leaderboard` query briefly lived here. It duplicated the ranking that
// `submissions.publicGallery` already returns (same `rankEventProjects` helper,
// same `rank` / `isWinner` fields on every card) and nothing called it, so the
// public gallery remains the single ranked read for an event.

/**
 * Public verification of a judge record (the counterpart of
 * `certificates.verify` for the `/verify/judge/:uuid` link that `judgeRecord`
 * hands out).
 *
 * No identity required — the record is only readable by staff/self before
 * publication, but its *authenticity* must be checkable by anyone holding the
 * link. The signature covers judge, event and the two score counts; a tampered
 * URL fails the constant-time comparison instead of rendering a green banner.
 */
export const verifyJudgeRecord = query({
  args: {
    judgeId: v.string(),
    eventId: v.string(),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    const invalid = { valid: false, reason: "signature mismatch — record may be forged" };
    if (!args.judgeId || !args.eventId || !args.signature) {
      return { valid: false, reason: "judge, event and signature are all required" };
    }

    const judge = await ctx.db.get(args.judgeId as Id<"users">).catch(() => null);
    const event = await ctx.db.get(args.eventId as Id<"events">).catch(() => null);
    if (!judge || !event) return { valid: false, reason: "record not found" };

    const scores = await ctx.db
      .query("judgeScores")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect();
    const judgeScores = scores.filter((s) => s.judgeId === judge._id);
    const projectsScored = new Set(judgeScores.map((s) => String(s.submissionId))).size;

    // Identical payload to `judgeRecord` — the two must never drift.
    const payloadStr = [
      judge._id,
      event._id,
      judge.name,
      event.title,
      projectsScored,
      judgeScores.length,
    ].join("|");
    const secret = await getCertSecretReadOnly(ctx);
    const expected = await hmacSha256Hex(secret, payloadStr);
    const valid = safeEqualHex(expected, args.signature);

    if (!valid) return invalid;
    return {
      valid: true,
      reason: null,
      judgeName: judge.name,
      eventName: event.title,
      eventSlug: event.slug,
      projectsScored,
      totalScoresSubmitted: judgeScores.length,
      issuedAt: judgeScores.reduce((max, s) => Math.max(max, s.submittedAt), 0),
    };
  },
});
