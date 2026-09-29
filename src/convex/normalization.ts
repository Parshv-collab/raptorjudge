import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./lib/common";
import { normalizeScores, type JudgeScoreSet } from "../lib/algorithms/normalization";
import { judgeScoreSets } from "./lib/results";

/**
 * Normalization service (T2 + Bonus).
 * Builds per-judge score vectors from stored rubric scores (weighted by
 * criterion weight) and runs Z-score / min-max / Bayesian normalization with
 * rank-delta comparison and mathematical proof metrics.
 *
 * Access (security item 70)
 * ------------------------
 * This reveals each judge's calibration and the running ranking, so it is
 * limited to staff (judge/organizer/admin) until the event publishes results —
 * otherwise any signed-in participant could read the scoreboard mid-judging and
 * tune their submission to it.
 */
export const analyze = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    const published = event.status === "published" || event.status === "archived";
    const isStaff = user.role === "judge" || user.role === "organizer" || user.role === "admin";
    if (!published && !isStaff) {
      throw new Error("Judging results are not published yet");
    }
    // Per-judge weighted score vectors — shared with the results/ranking helper
    // (`lib/results.ts`) so the proof screen and the published leaderboard can
    // never disagree about how a score was computed.
    const judgeSets = await judgeScoreSets(ctx, args.eventId);
    if (judgeSets.length === 0) {
      return { ok: false, reason: "no scores recorded yet", result: null };
    }

    const result = normalizeScores(judgeSets);

    // resolve human names + titles for display
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
        rankDeltas: result.rankDeltas.map((d) => ({ ...d, title: titleOf(d.submissionId) })),
      },
    };
  },
});
