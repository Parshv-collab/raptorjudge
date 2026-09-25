import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireOrganizer } from "./lib/common";
import { normalizeScores, type JudgeScoreSet } from "../lib/algorithms/normalization";

/**
 * Data export / import (T2 CSV + T4 bulk JSON). CSVs are generated server-side
 * so exports match the API exactly (100% API-first: same data, same filters).
 */

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export const submissionsCsv = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx);
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const teams = await ctx.db.query("teams").collect();
    const tracks = await ctx.db
      .query("tracks")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const rows = subs.map((s) => ({
      id: s._id,
      title: s.title,
      team: teams.find((t) => t._id === s.teamId)?.name ?? "",
      track: tracks.find((t) => t._id === s.trackId)?.name ?? "Open",
      status: s.status,
      repository_url: s.repositoryUrl,
      video_url: s.videoUrl,
      demo_url: s.demoUrl,
      tags: s.tags,
      submitted_at: s.submittedAt ? new Date(s.submittedAt).toISOString() : "",
    }));
    return toCsv(rows);
  },
});

export const scoresCsv = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx);
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
    const rows = scores.map((s) => ({
      submission: subs.find((x) => x._id === s.submissionId)?.title ?? "",
      judge: users.find((u) => u._id === s.judgeId)?.name ?? "",
      criterion: criteria.find((c) => c._id === s.criterionId)?.name ?? "",
      weight: criteria.find((c) => c._id === s.criterionId)?.weight ?? "",
      score: s.score,
      submitted_at: new Date(s.submittedAt).toISOString(),
    }));
    return toCsv(rows);
  },
});

export const rankingsCsv = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx);
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

    // build per-judge weighted vectors
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
    const rows = norm.submissions.map((s, i) => ({
      rank: i + 1,
      submission: subs.find((x) => String(x._id) === s.submissionId)?.title ?? s.submissionId,
      raw_mean: s.rawMean.toFixed(4),
      z_normalized: s.zNormalized.toFixed(4),
      minmax_normalized: s.minMaxNormalized.toFixed(4),
      bayesian_adjusted: s.bayesianAdjusted.toFixed(4),
    }));
    return toCsv(rows);
  },
});

export const assignmentsCsv = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx);
    const rows = await ctx.db
      .query("judgeAssignments")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const users = await ctx.db.query("users").collect();
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const csv = toCsv(
      rows.map((r) => ({
        judge: users.find((u) => u._id === r.judgeId)?.name ?? "",
        submission: subs.find((s) => s._id === r.submissionId)?.title ?? "",
        status: r.status,
        assigned_at: new Date(r.assignedAt).toISOString(),
        completed_at: r.completedAt ? new Date(r.completedAt).toISOString() : "",
      })),
    );
    return csv;
  },
});

/** Full JSON export of an event (bulk export, T4). */
export const eventJson = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    const [tracks, teams, subs, criteria, assignments, scores, votes, matches] = await Promise.all([
      ctx.db.query("tracks").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("teams").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("submissions").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("rubricCriteria").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("judgeAssignments").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("judgeScores").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("communityVotes").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("pairwiseMatches").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
    ]);
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        event,
        tracks,
        teams,
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
