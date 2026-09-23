import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./lib/common";
import { normalizeScores, type JudgeScoreSet } from "../lib/algorithms/normalization";

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
    const scores = await ctx.db
      .query("judgeScores")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    if (scores.length === 0) {
      return { ok: false, reason: "no scores recorded yet", result: null };
    }
    const criteria = await ctx.db
      .query("rubricCriteria")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const weightOf = (criterionId: string) =>
      criteria.find((c) => String(c._id) === criterionId)?.weight ?? 1 / Math.max(1, criteria.length);

    // per (judge, submission): weighted mean of criterion scores
    const perJudge = new Map<string, Map<string, number>>();
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
    for (const [judgeId, inner] of acc) {
      perJudge.set(judgeId, new Map());
      for (const [subId, { sum, w }] of inner) {
        perJudge.get(judgeId)!.set(subId, w > 0 ? sum / w : sum);
      }
    }

    const judgeSets: JudgeScoreSet[] = [...perJudge.entries()].map(([judgeId, m]) => ({
      judgeId,
      scores: Object.fromEntries(m),
    }));

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
