import type { Id } from "../_generated/dataModel";
import { normalizeScores, type JudgeScoreSet } from "../../lib/algorithms/normalization";
import { bradleyTerry, type PairwiseMatchRecord } from "../../lib/algorithms/pairwise";

/**
 * Final results (T2 + Bonus): when are they public, and who won?
 *
 * One module owns the answer so the public gallery, the project page, the
 * organizer console and the winner-override system can never disagree about
 * who is #1.
 *
 * Publication flag: an event announces results by entering `published` (or
 * `archived`). Before that, rankings exist internally but are never attached to
 * public data.
 *
 * Ranking method, in priority order:
 *  1. **Bradley–Terry** — if any pairwise comparisons were recorded for the
 *     event, the leaderboard is the latent-strength ordering.
 *  2. **Normalized z-score** — otherwise, per-judge z-scores rescaled to the
 *     0–10 scale (`normalizeScores`), highest first. Never the raw sum, which
 *     would let a lenient judge decide the winner.
 */

// `closed` is a results-announced state in this product, not a hidden one: the
// seed crowns a winner and issues certificates for a closed event, and the
// organizer console already treats it as published (`JUDGING_LOCKED_STAGES`).
// Leaving it out meant the flagship fixture event — `sample-hack-2026`, status
// `closed`, 41 projects, 126 score rows — showed "Results are not published yet"
// on the public gallery and on `/results/<slug>` while its certificates
// verified publicly.
export const PUBLISHED_STATUSES = ["published", "archived", "closed"];

/** True once the event has announced its results. */
export function isResultsPublished(event: { status?: string } | null | undefined): boolean {
  return !!event && PUBLISHED_STATUSES.includes(event.status ?? "");
}

/**
 * Stable gallery shuffle seed: event slug + calendar day. Deterministic (so the
 * order does not jump on every query) but not related to merit (so nobody can
 * infer standings from card position before publication).
 */
export function gallerySeedKey(event: { slug?: string; _id?: unknown }): string {
  const day = new Date().toISOString().slice(0, 10);
  return `${event.slug ?? String(event._id)}:${day}`;
}

/** Per-(judge, submission) weighted mean of the rubric scores. */
export async function judgeScoreSets(ctx: any, eventId: Id<"events">): Promise<JudgeScoreSet[]> {
  const scores = await ctx.db
    .query("judgeScores")
    .withIndex("by_event", (q: any) => q.eq("eventId", eventId))
    .collect();
  if (scores.length === 0) return [];

  const criteria = await ctx.db
    .query("rubricCriteria")
    .withIndex("by_event", (q: any) => q.eq("eventId", eventId))
    .collect();
  const fallbackWeight = 1 / Math.max(1, criteria.length);
  const weightOf = (criterionId: string) =>
    criteria.find((c: any) => String(c._id) === criterionId)?.weight ?? fallbackWeight;

  const acc = new Map<string, Map<string, { sum: number; w: number }>>();
  for (const s of scores) {
    const jKey = String(s.judgeId);
    const sKey = String(s.submissionId);
    if (!acc.has(jKey)) acc.set(jKey, new Map());
    const inner = acc.get(jKey)!;
    if (!inner.has(sKey)) inner.set(sKey, { sum: 0, w: 0 });
    const cur = inner.get(sKey)!;
    cur.sum += s.score * weightOf(String(s.criterionId));
    cur.w += weightOf(String(s.criterionId));
  }

  return [...acc.entries()].map(([judgeId, inner]) => ({
    judgeId,
    scores: Object.fromEntries(
      [...inner.entries()].map(([subId, { sum, w }]) => [subId, w > 0 ? sum / w : sum]),
    ),
  }));
}

async function loadPairwiseMatches(ctx: any, eventId: Id<"events">): Promise<PairwiseMatchRecord[]> {
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

export type RankingMethod = "pairwise" | "normalized";

export interface RankedProject {
  submissionId: string;
  /** 1-based position. Ties keep the order returned by the algorithm. */
  rank: number;
  /** Bradley–Terry rating, or the 0–10 normalized score, per `method`. */
  score: number;
  title?: string;
}

export interface EventRanking {
  method: RankingMethod;
  ranking: RankedProject[];
  /** True when an admin/organizer override decided #1. */
  overridden: boolean;
}

/**
 * Final ranking for one event, already applying a winner override when one is
 * set (the overridden project is pinned to #1 and the rest keep their computed
 * order — an override chooses the winner, it does not re-score the field).
 */
export async function rankEventProjects(
  ctx: any,
  eventId: Id<"events">,
  opts: { ignoreOverride?: boolean } = {},
): Promise<EventRanking> {
  const [event, subs, matches] = [
    await ctx.db.get(eventId),
    await ctx.db
      .query("submissions")
      .withIndex("by_event", (q: any) => q.eq("eventId", eventId))
      .collect(),
    await loadPairwiseMatches(ctx, eventId),
  ];
  const submitted = subs.filter((s: any) => s.status === "submitted");
  const titleOf = (id: string) => submitted.find((s: any) => String(s._id) === id)?.title;

  let method: RankingMethod = "normalized";
  let ordered: { submissionId: string; score: number }[] = [];

  if (matches.length > 0) {
    const board = bradleyTerry(matches, submitted.map((s: any) => String(s._id)));
    if (board.ranking.length > 0) {
      method = "pairwise";
      ordered = board.ranking.map((r) => ({ submissionId: r.submissionId, score: r.rating }));
    }
  }

  if (ordered.length === 0) {
    const sets = await judgeScoreSets(ctx, eventId);
    if (sets.length > 0) {
      const result = normalizeScores(sets);
      const submittedIds = new Set(submitted.map((s: any) => String(s._id)));
      ordered = result.submissions
        .filter((s) => submittedIds.has(s.submissionId))
        .sort((a, b) => b.tenPointNormalized - a.tenPointNormalized)
        .map((s) => ({ submissionId: s.submissionId, score: s.tenPointNormalized }));
    }
  }

  const overrideId =
    !opts.ignoreOverride && event?.winnerOverrideProjectId
      ? String(event.winnerOverrideProjectId)
      : null;
  const overridden = Boolean(overrideId) && ordered.some((o) => o.submissionId === overrideId);

  let ranking: RankedProject[] = ordered.map((o, i) => ({
    submissionId: o.submissionId,
    rank: i + 1,
    score: o.score,
    title: titleOf(o.submissionId),
  }));

  if (overrideId && overridden) {
    const pinned = ranking.find((r) => r.submissionId === overrideId)!;
    ranking = [{ ...pinned, rank: 1 }, ...ranking.filter((r) => r.submissionId !== overrideId).map((r, i) => ({ ...r, rank: i + 2 }))];
  }

  return { method, ranking, overridden };
}

/** `submissionId → rank` for fast lookup while mapping gallery cards. */
export function rankMap(ranking: RankedProject[]): Map<string, number> {
  return new Map(ranking.map((r) => [r.submissionId, r.rank]));
}
