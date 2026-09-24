import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireOrganizer,
  requireUser,
  requireRole,
  stageAllowsJudging,
} from "./lib/common";
import { assertWithinWindow } from "./lib/timeWindows";
import { appendAudit } from "./lib/audit";
import { planJudgeAssignments } from "../lib/algorithms/assignment";

/**
 * Judging engine (T2): rubrics, algorithmic assignments, score capture,
 * judge progress. Role isolation: judges see only their own assigned
 * submissions, and only while the event is in the judging stage.
 */

// ---------------------------------------------------------------- rubrics ---

export const rubricForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) =>
    ctx.db
      .query("rubricCriteria")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect(),
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
  },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx);
    if (args.criterionId) {
      await ctx.db.patch(args.criterionId, {
        name: args.name,
        description: args.description,
        weight: args.weight,
        minScore: args.minScore,
        maxScore: args.maxScore,
      });
      return args.criterionId;
    }
    const existing = await ctx.db
      .query("rubricCriteria")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    return ctx.db.insert("rubricCriteria", {
      eventId: args.eventId,
      name: args.name,
      description: args.description,
      weight: args.weight,
      minScore: args.minScore,
      maxScore: args.maxScore,
      sortOrder: existing.length,
    });
  },
});

// ------------------------------------------------------------ assignments ---

/** Assign projects to a specific judge manually/batch. */
export const assignProjects = mutation({
  args: {
    eventId: v.id("events"),
    judgeId: v.id("users"),
    submissionIds: v.array(v.id("submissions")),
  },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
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

/** Trigger the algorithmic assignment engine (organizer/admin only, audited). */
export const runAssignment = mutation({
  args: {
    eventId: v.id("events"),
    minJudgesPerSubmission: v.optional(v.number()),
    judgeTrackAffinity: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");

    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const submitted = subs.filter((s) => s.status === "submitted");
    if (submitted.length === 0) throw new Error("No submitted projects to assign");

    const judges = (await ctx.db.query("users").collect()).filter(
      (u) => u.role === "judge",
    );
    if (judges.length === 0) throw new Error("No judge accounts exist");

    // team memberships for conflict-of-interest detection
    const teamRows = await ctx.db
      .query("teams")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const memberRows = await ctx.db.query("teamMembers").collect();
    const teamMembersMap: Record<string, string[]> = {};
    const judgeTeamMemberships: Record<string, string[]> = {};
    const judgeUserIds = new Set(judges.map((j) => j._id));
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
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    const affinity: Record<string, string[]> = {};
    if (args.judgeTrackAffinity) {
      // "judgeId|track1,track2;judgeId|track3"
      for (const part of args.judgeTrackAffinity.split(";")) {
        const [id, names] = part.split("|");
        if (id && names) affinity[id] = names.split(",").map((n) => n.trim());
      }
    }

    const plan = planJudgeAssignments({
      submissions: submitted.map((s) => {
        const track = s.trackId ? tracks.find((t) => t._id === s.trackId) : null;
        return {
          submissionId: String(s._id),
          teamId: String(s.teamId),
          trackName: track?.name ?? "Open",
        };
      }),
      judges: judges.map((j) => ({
        judgeId: String(j._id),
        affinityTracks: affinity[String(j._id)] ?? [],
      })),
      teamMembers: teamMembersMap,
      judgeTeamMemberships,
      minJudgesPerSubmission: args.minJudgesPerSubmission ?? 3,
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
        workload: plan.workload,
        conflictsAvoided: plan.conflictsAvoided.length,
      }),
    });
    return {
      totalAssignments: inserted,
      workload: plan.workload,
      minJudgesMet: plan.minJudgesMet,
      conflictsAvoided: plan.conflictsAvoided,
    };
  },
});

// ---------------------------------------------------------------- scoring ---

/** Judge queue: only my assigned submissions, only during judging stage. */
export const myQueue = query({
  args: { eventId: v.optional(v.id("events")) },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "judge", "organizer", "admin");
    const isStaff = user.role === "admin" || user.role === "organizer";

    let assignments;
    if (args.eventId) {
      const all = await ctx.db
        .query("judgeAssignments")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId!))
        .collect();
      assignments = isStaff ? all : all.filter((a) => a.judgeId === user._id);
    } else {
      const all = isStaff
        ? await ctx.db.query("judgeAssignments").collect()
        : await ctx.db
            .query("judgeAssignments")
            .withIndex("by_judge", (q) => q.eq("judgeId", user._id))
            .collect();
      assignments = all;
    }

    const out = [];
    let judgingOpen = false;

    for (const a of assignments) {
      const event = await ctx.db.get(a.eventId);
      if (!event) continue;
      const inJudging = stageAllowsJudging(event.status as never);
      if (inJudging) judgingOpen = true;

      const sub = await ctx.db.get(a.submissionId);
      if (!sub) continue;
      const team = await ctx.db.get(sub.teamId);
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
        assignmentId: String(a._id),
        status: a.status,
        submission: {
          id: String(sub._id),
          title: sub.title,
          tagline: sub.tagline,
          description: sub.description,
          repositoryUrl: sub.repositoryUrl,
          videoUrl: sub.videoUrl,
          demoUrl: sub.demoUrl,
          tags: sub.tags,
          teamName: team?.name ?? "—",
          trackName: track?.name ?? "Open",
        },
        scoredCriteria: scores.map((s) => ({ criterionId: String(s.criterionId), score: s.score, notes: s.privateNotes })),
        criteriaCount: criteria.length,
        locked: !inJudging && !isStaff,
      });
    }
    return { items: out, judgingOpen };
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
    }
    return { ok: true, complete };
  },
});

/** Organizer progress dashboard: per-judge completion and per-submission coverage. */
export const progress = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
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

/** All scores for an event (organizer view — feeds normalization + exports). */
export const allScores = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
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
    return scores.map((s) => ({
      scoreId: String(s._id),
      submissionId: String(s.submissionId),
      submissionTitle: subs.find((x) => x._id === s.submissionId)?.title ?? "—",
      judgeId: String(s.judgeId),
      judgeName: users.find((u) => u._id === s.judgeId)?.name ?? "—",
      criterionId: String(s.criterionId),
      criterionName: criteria.find((c) => c._id === s.criterionId)?.name ?? "—",
      score: s.score,
      submittedAt: s.submittedAt,
    }));
  },
});
