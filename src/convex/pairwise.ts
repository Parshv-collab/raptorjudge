import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, requireRole } from "./lib/common";
import { appendAudit } from "./lib/audit";
import { bradleyTerry, nextMatch, type PairwiseMatchRecord } from "../lib/algorithms/pairwise";

/**
 * Pairwise comparison mode (Bonus, +5).
 * Judges duel submissions head-to-head; Bradley-Terry (MM algorithm) turns
 * the match history into latent strengths and a global ranking.
 */

async function loadMatches(ctx: any, eventId: string): Promise<PairwiseMatchRecord[]> {
  const rows = await ctx.db
    .query("pairwiseMatches")
    .withIndex("by_event", (q: any) => q.eq("eventId", eventId))
    .collect();
  return rows.map((r: any) => ({
    submissionAId: String(r.submissionAId),
    submissionBId: String(r.submissionBId),
    winnerId: r.winnerId || null,
  }));
}

export const leaderboard = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const submitted = subs.filter((s) => s.status === "submitted");
    const matches = await loadMatches(ctx, args.eventId);
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

/** Next suggested match for the current judge (most informative pair). */
export const nextPair = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "judge", "organizer", "admin");
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const submitted = subs.filter((s) => s.status === "submitted");
    const matches = await loadMatches(ctx, args.eventId);
    const items = submitted.map((s) => String(s._id));
    const bt = bradleyTerry(matches, items);
    const pair = nextMatch(items, matches, bt.ratings);
    if (!pair) return null;
    const describe = (id: string) => {
      const s = submitted.find((x) => String(x._id) === id)!;
      return {
        id,
        title: s.title,
        tagline: s.tagline,
        description: s.description,
        repositoryUrl: s.repositoryUrl,
        videoUrl: s.videoUrl,
        demoUrl: s.demoUrl,
      };
    };
    return { a: describe(pair.a), b: describe(pair.b) };
  },
});

export const submitMatch = mutation({
  args: {
    eventId: v.id("events"),
    submissionAId: v.id("submissions"),
    submissionBId: v.id("submissions"),
    winnerId: v.optional(v.id("submissions")), // omit = tie
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "judge", "organizer", "admin");
    if (args.submissionAId === args.submissionBId) {
      throw new Error("A submission cannot compete with itself");
    }
    await ctx.db.insert("pairwiseMatches", {
      eventId: args.eventId,
      judgeId: user._id,
      submissionAId: args.submissionAId,
      submissionBId: args.submissionBId,
      winnerId: args.winnerId ? String(args.winnerId) : "",
      createdAt: Date.now(),
    });
    await appendAudit(ctx, {
      eventId: args.eventId,
      actorId: user._id,
      action: "pairwise.match",
      targetType: "submission",
      targetId: String(args.winnerId ?? "tie"),
      afterState: JSON.stringify({
        a: String(args.submissionAId),
        b: String(args.submissionBId),
      }),
    });
    return { ok: true };
  },
});

/** Match history for the current judge. */
export const myMatches = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "judge", "organizer", "admin");
    const rows = await ctx.db
      .query("pairwiseMatches")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const mine = rows.filter((r) => r.judgeId === user._id);
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const titleOf = (id: string) => subs.find((s) => String(s._id) === id)?.title ?? "—";
    return mine.map((r) => ({
      id: String(r._id),
      a: titleOf(String(r.submissionAId)),
      b: titleOf(String(r.submissionBId)),
      winner: r.winnerId ? titleOf(r.winnerId) : "tie",
      createdAt: r.createdAt,
    }));
  },
});
