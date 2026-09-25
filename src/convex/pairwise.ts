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

/**
 * Bradley-Terry leaderboard.
 *
 * Staff-only until results publish (security item 70) — the latent strengths
 * are effectively the answer key while judging is still running.
 */
export const leaderboard = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    const published = event.status === "published" || event.status === "archived";
    // Before publish the latent strengths are the answer key, so only the
    // people running the event may read them — a judge must not be able to
    // watch the ranking their own comparisons are producing.
    const isOrganizer = user.role === "organizer" || user.role === "admin";
    if (!published && !isOrganizer) {
      throw new Error("Rankings are not published yet");
    }
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

    // Integrity: both sides must be submitted projects of this event, and the
    // winner must be one of the two competitors. Without the winner check a
    // caller could record a win for an unrelated project and skew the ranking.
    const [a, b] = await Promise.all([
      ctx.db.get(args.submissionAId),
      ctx.db.get(args.submissionBId),
    ]);
    for (const side of [a, b]) {
      if (!side) throw new Error("Submission not found");
      if (String(side.eventId) !== String(args.eventId)) {
        throw new Error("Both submissions must belong to this event");
      }
      if (side.status !== "submitted") {
        throw new Error("Only submitted projects can be compared");
      }
    }
    if (args.winnerId && args.winnerId !== args.submissionAId && args.winnerId !== args.submissionBId) {
      throw new Error("The winner must be one of the two compared projects");
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
