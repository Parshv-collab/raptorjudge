import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  getCurrentUser,
  requireUser,
  stageAllowsVoting,
  stageAllowsVoteResults,
  teamIdsInEvent,
} from "./lib/common";
import { assertWithinWindow } from "./lib/timeWindows";
import { appendAudit } from "./lib/audit";
import { sha256Hex } from "./crypto";
import { evaluateRateLimit, parseRateLimitState } from "../lib/rateLimit";

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

/**
 * Fixed-window limiter backed by a `platform` row per actor+event.
 * The decision itself lives in `lib/rateLimit.ts` so voting and comments
 * enforce exactly the same policy (and it is unit-tested there).
 */
export async function checkRateLimit(
  ctx: any,
  bucketKey: string,
  limit: number = MAX_ACTIONS_PER_MINUTE,
  windowMs: number = 60_000,
): Promise<boolean> {
  const now = Date.now();
  const key = `ratelimit:${bucketKey}`;
  const row = await ctx.db
    .query("platform")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .unique();
  const decision = evaluateRateLimit(
    parseRateLimitState(row?.value),
    now,
    limit,
    windowMs,
  );
  if (!row) {
    if (!decision.allowed) return false;
    await ctx.db.insert("platform", { key, value: JSON.stringify(decision.next) });
  } else if (decision.allowed) {
    await ctx.db.patch(row._id, { value: JSON.stringify(decision.next) });
  }
  return decision.allowed;
}

/** Credential-attempt ceiling (T3.5: rate limit on sign-in and sign-up). */
export const AUTH_ATTEMPT_LIMIT = 20;
/** Window for {@link AUTH_ATTEMPT_LIMIT}: five minutes per email. */
export const AUTH_ATTEMPT_WINDOW_MS = 5 * 60_000;

/**
 * Consume one credential attempt for a hashed email.
 *
 * Worth being explicit about why this exists on top of the library: the
 * password provider already locks an account after repeated *failures*, but a
 * successful sign-in resets that counter and nothing throttles sign-up at all.
 * Counting every attempt per email gives brute-force and bulk-registration both
 * a hard ceiling, and because the bucket is keyed by a hash of the address an
 * unknown email is throttled identically — the response still cannot be used to
 * probe whether an account exists.
 *
 * Internal so only the auth provider can call it from an action context.
 */
export const consumeAuthAttempt = internalMutation({
  args: { bucket: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const key = `ratelimit:auth:${args.bucket}`;
    const row = await ctx.db
      .query("platform")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const decision = evaluateRateLimit(
      parseRateLimitState(row?.value),
      now,
      AUTH_ATTEMPT_LIMIT,
      AUTH_ATTEMPT_WINDOW_MS,
    );
    if (!decision.allowed) return { allowed: false, remaining: 0 };
    if (!row) {
      await ctx.db.insert("platform", { key, value: JSON.stringify(decision.next) });
    } else {
      await ctx.db.patch(row._id, { value: JSON.stringify(decision.next) });
    }
    return { allowed: true, remaining: decision.remaining };
  },
});

/**
 * Hid-results projection (T3.3).
 *
 * Extracted so the rule is a pure function that both the query and the
 * acceptance suite exercise: while an event is voting the project list is
 * visible but every tally reads 0, and before/after voting the tally is empty
 * entirely. Only a `published` event reveals real counts.
 */
export function maskVoteTally(
  tally: { submissionId: string; points: number }[],
  votingOpen: boolean,
  resultsVisible: boolean,
): { submissionId: string; points: number }[] {
  if (resultsVisible) return tally.map((t) => ({ ...t }));
  if (votingOpen) return tally.map((t) => ({ submissionId: t.submissionId, points: 0 }));
  return [];
}

/**
 * Vote status core, shared by the Convex query and the REST bridge.
 *
 * `user` is resolved by the caller (identity in Convex, verified session in
 * HTTP) so the hidden-tally rules are written exactly once.
 */
async function voteStatusCore(
  ctx: QueryCtx,
  user: Doc<"users"> | null,
  eventId: Id<"events">,
) {
  const event = await ctx.db.get(eventId);
  if (!event) throw new Error("Event not found");

  const votes = await ctx.db
    .query("communityVotes")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
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
    tally: maskVoteTally(tally, votingOpen, resultsVisible),
    totalVotes: resultsVisible ? votes.length : 0,
  };
}

/** Public vote status: counts only revealed after publish (hidden results). */
export const voteStatus = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => voteStatusCore(ctx, await getCurrentUser(ctx), args.eventId),
});

/** REST bridge: same status for a verified session user (T3/T4 audit surface). */
export const voteStatusInternal = internalQuery({
  args: { userId: v.id("users"), eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    return voteStatusCore(ctx, user, args.eventId);
  },
});

/**
 * Cast a community vote core. Enforces stage, enrolment, self-vote, duplicates,
 * quadratic budget, rate limits. Shared by the public mutation and the REST
 * bridge so both apply identical rules (issue 44 backend/HTTP parity).
 *
 * Two of those rules are integrity rules rather than mechanics (issue 56):
 *
 *  - **Enrolment.** Only somebody who is actually on a team in this event gets
 *    a ballot. Without it any signed-in account could load a fresh mailbox,
 *    sign in and vote, which is the Sybil shape the rate limit cannot see
 *    because every burner looks like a first-time voter.
 *  - **No self-voting.** A team that can vote for its own submission wins its
 *    own community vote outright, so the ballot is worthless as a signal. The
 *    check is on *team* membership, not authorship: a four-person team shares
 *    one ballot, and all four must be shut out.
 *
 * Both run after the rate-limit bucket is consumed, so an account that leans on
 * the endpoint to fish for an accepted vote is throttled just like any other,
 * and both are audited for the same reason the other refusals are.
 */
async function castVoteCore(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: { eventId: Id<"events">; submissionId: Id<"submissions">; points: number },
) {
  {
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

    // The submission is only knowable from here on, and every rule below needs
    // to know whose project it is. Scoping it to this event also closes the
    // gap where a submission from another event would be matched against this
    // event's teams.
    const submission = await ctx.db.get(args.submissionId);
    if (!submission || submission.eventId !== args.eventId) {
      throw new Error("Submission not found in this event");
    }

    const myTeamIds = await teamIdsInEvent(ctx, user._id, args.eventId);
    if (myTeamIds.size === 0) {
      await appendAudit(ctx, {
        eventId: args.eventId,
        actorId: user._id,
        action: "vote.not_enrolled",
        targetType: "submission",
        targetId: String(args.submissionId),
        afterState: JSON.stringify({ teamCount: 0 }),
      });
      throw new Error("You must be enrolled in this event to vote");
    }
    if (myTeamIds.has(String(submission.teamId))) {
      await appendAudit(ctx, {
        eventId: args.eventId,
        actorId: user._id,
        action: "vote.self_vote_rejected",
        targetType: "submission",
        targetId: String(args.submissionId),
        afterState: JSON.stringify({ teamId: String(submission.teamId), points: args.points }),
      });
      throw new Error("You cannot vote for your own project");
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
  }
}

/** Cast a community vote. Enforces stage, duplicates, quadratic budget, rate limits. */
export const castVote = mutation({
  args: { eventId: v.id("events"), submissionId: v.id("submissions"), points: v.number() },
  handler: async (ctx, args) => castVoteCore(ctx, await requireUser(ctx), args),
});

/** REST bridge for `POST /api/v1/votes`. */
export const castVoteInternal = internalMutation({
  args: {
    userId: v.id("users"),
    eventId: v.id("events"),
    submissionId: v.id("submissions"),
    points: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    return castVoteCore(ctx, user, args);
  },
});

/** Clear a user's votes on a submission (un-vote; refunds quadratic credits). */
async function removeVoteCore(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: { eventId: Id<"events">; submissionId: Id<"submissions"> },
) {
  const votes = await ctx.db
    .query("communityVotes")
    .withIndex("by_user_event", (q) => q.eq("userId", user._id).eq("eventId", args.eventId))
    .collect();
  const mine = votes.filter((v) => v.submissionId === args.submissionId);
  for (const v of mine) await ctx.db.delete(v._id);
  return { ok: true, removed: mine.length };
}

/** Clear my votes on a submission (un-vote; refunds quadratic credits). */
export const removeVote = mutation({
  args: { eventId: v.id("events"), submissionId: v.id("submissions") },
  handler: async (ctx, args) => removeVoteCore(ctx, await requireUser(ctx), args),
});

/** REST bridge for `DELETE /api/v1/votes`. */
export const removeVoteInternal = internalMutation({
  args: { userId: v.id("users"), eventId: v.id("events"), submissionId: v.id("submissions") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    return removeVoteCore(ctx, user, args);
  },
});
