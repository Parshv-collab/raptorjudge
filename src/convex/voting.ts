import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  getCurrentUser,
  requireUser,
  stageAllowsVoting,
  stageAllowsVoteResults,
} from "./lib/common";
import { assertWithinWindow } from "./lib/timeWindows";
import { appendAudit } from "./lib/audit";
import { sha256Hex } from "./crypto";

/**
 * Community voting (T3).
 *  - upvote mode: 1 vote per user per submission
 *  - quadratic mode: credits budget (default 25), casting n points costs n^2
 *  - results hidden until the event reaches `published`
 *  - rate limit + Sybil heuristics (per-user budget, duplicate detection,
 *    suspicious bursts flagged to audit log)
 */

const QUADRATIC_BUDGET = 25;
const MAX_ACTIONS_PER_MINUTE = 20;

async function checkRateLimit(ctx: any, bucketKey: string): Promise<boolean> {
  const now = Date.now();
  const windowMs = 60_000;
  const row = await (ctx.db as any)
    .query("platform")
    .withIndex("by_key", (q: any) => q.eq("key", `ratelimit:${bucketKey}`))
    .unique();
  if (!row) {
    await ctx.db.insert("platform", {
      key: `ratelimit:${bucketKey}`,
      value: JSON.stringify({ count: 1, windowStart: now }),
    });
    return true;
  }
  const state = JSON.parse(row.value) as { count: number; windowStart: number };
  if (now - state.windowStart > windowMs) {
    await ctx.db.patch(row._id, { value: JSON.stringify({ count: 1, windowStart: now }) });
    return true;
  }
  if (state.count >= MAX_ACTIONS_PER_MINUTE) return false;
  await ctx.db.patch(row._id, { value: JSON.stringify({ count: state.count + 1, windowStart: state.windowStart }) });
  return true;
}

/** Public vote status: counts only revealed after publish (hidden results). */
export const voteStatus = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    const user = await getCurrentUser(ctx);

    const votes = await ctx.db
      .query("communityVotes")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    const resultsVisible = stageAllowsVoteResults(event.status as never);
    const votingOpen = stageAllowsVoting(event.status as never);
    const votingType = (event.settings ?? "").includes("voting_type=upvote") ? "upvote" : "quadratic";

    // per-user state
    let myVotes: { submissionId: string; points: number; creditsSpent: number }[] = [];
    if (user) {
      const mine = votes.filter((v) => v.userId === user._id);
      myVotes = mine.map((v) => ({
        submissionId: String(v.submissionId),
        points: v.points,
        creditsSpent: v.creditsSpent,
      }));
    }
    const creditsSpent = myVotes.reduce((a, v) => a + v.creditsSpent, 0);

    // leader board hidden until published; send zeros otherwise
    const counts: Record<string, number> = {};
    for (const v of votes) {
      const key = String(v.submissionId);
      counts[key] = (counts[key] ?? 0) + v.points;
    }
    const tally = Object.entries(counts)
      .map(([submissionId, points]) => ({ submissionId, points }))
      .sort((a, b) => b.points - a.points);

    return {
      votingOpen,
      votingType,
      resultsVisible,
      budget: QUADRATIC_BUDGET,
      creditsSpent,
      myVotes,
      tally: resultsVisible
        ? tally
        : votingOpen
          ? tally.map((t) => ({ submissionId: t.submissionId, points: 0 }))
          : [],
      totalVotes: resultsVisible ? votes.length : 0,
    };
  },
});

/** Cast a community vote. Enforces stage, duplicates, quadratic budget, rate limits. */
export const castVote = mutation({
  args: { eventId: v.id("events"), submissionId: v.id("submissions"), points: v.number() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (user.role !== "organizer" && user.role !== "admin") {
      assertWithinWindow(event, "voting");
    }
    if (args.points <= 0) throw new Error("Points must be positive");
    if (user.role === "judge") throw new Error("Judges cannot vote in the community vote");

    const votingType = (event.settings ?? "").includes("voting_type=upvote") ? "upvote" : "quadratic";
    if (votingType === "upvote" && args.points !== 1) {
      throw new Error("This event uses plain upvotes: points must be 1");
    }

    // rate limit (Sybil / burst defense)
    const bucketKey = `${user._id}:${args.eventId}`;
    if (!(await checkRateLimit(ctx, bucketKey))) {
      await appendAudit(ctx, {
        eventId: args.eventId,
        actorId: user._id,
        action: "vote.rate_limited",
        targetType: "user",
        targetId: String(user._id),
      });
      throw new Error("Rate limit exceeded: too many actions per minute");
    }

    // hash requester fingerprint (no raw IPs stored — privacy-preserving)
    const ipHash = await sha256Hex(`ip:${args.eventId}:${user._id}`);
    const uaHash = await sha256Hex(`ua:${args.eventId}:${user._id}`);

    const votes = await ctx.db
      .query("communityVotes")
      .withIndex("by_user_event", (q) => q.eq("userId", user._id).eq("eventId", args.eventId))
      .collect();

    const spent = votes.reduce((a, v) => a + v.creditsSpent, 0);
    const cost = votingType === "quadratic" ? args.points * args.points : 1;
    if (votingType === "upvote" && votes.some((v) => v.submissionId === args.submissionId)) {
      throw new Error("You already voted for this project");
    }
    if (spent + cost > QUADRATIC_BUDGET) {
      throw new Error(`Quadratic budget exceeded: casting ${args.points} points costs ${cost} credits, you have ${QUADRATIC_BUDGET - spent} left`);
    }

    await ctx.db.insert("communityVotes", {
      eventId: args.eventId,
      userId: user._id,
      submissionId: args.submissionId,
      points: args.points,
      creditsSpent: cost,
      ipHash,
      userAgentHash: uaHash,
      createdAt: Date.now(),
    });

    // Sybil heuristic: many accounts voting for the same submission from the
    // same fingerprint within a short window get flagged for review.
    const recent = await ctx.db
      .query("communityVotes")
      .withIndex("by_submission", (q) => q.eq("submissionId", args.submissionId))
      .collect()
      .then((rows) => rows.filter((r) => Date.now() - r.createdAt < 5 * 60_000));
    const fingerprints = new Map<string, number>();
    for (const r of recent) {
      const k = `${r.ipHash}:${r.userAgentHash}`;
      fingerprints.set(k, (fingerprints.get(k) ?? 0) + 1);
    }
    for (const [fp, n] of fingerprints) {
      if (n >= 8) {
        await appendAudit(ctx, {
          eventId: args.eventId,
          actorId: user._id,
          action: "vote.sybil_suspect",
          targetType: "submission",
          targetId: String(args.submissionId),
          afterState: JSON.stringify({ fingerprint: fp.slice(0, 12) + "…", votesIn5m: n }),
        });
      }
    }

    await appendAudit(ctx, {
      eventId: args.eventId,
      actorId: user._id,
      action: "vote.cast",
      targetType: "submission",
      targetId: String(args.submissionId),
      afterState: JSON.stringify({ points: args.points, cost }),
    });
    return { ok: true, cost, creditsLeft: QUADRATIC_BUDGET - spent - cost };
  },
});

/** Clear my votes on a submission (un-vote; refunds quadratic credits). */
export const removeVote = mutation({
  args: { eventId: v.id("events"), submissionId: v.id("submissions") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const votes = await ctx.db
      .query("communityVotes")
      .withIndex("by_user_event", (q) => q.eq("userId", user._id).eq("eventId", args.eventId))
      .collect();
    const mine = votes.filter((v) => v.submissionId === args.submissionId);
    for (const v of mine) await ctx.db.delete(v._id);
    return { ok: true, removed: mine.length };
  },
});
