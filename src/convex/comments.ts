import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOrganizer, requireUser } from "./lib/common";
import { appendAudit } from "./lib/audit";
import { checkRateLimit } from "./voting";
import { MAX_COMMENT_LENGTH } from "../lib/validation";

/**
 * Comments (T3). Public discussion on submissions; flagging for moderation.
 *
 * Every write is rate limited (T3.5, shared with voting) and appended to the
 * audit chain, so a burst of spam leaves both a refusal and a trail.
 */

/** Comment-list core, shared by the public query and the REST bridge. */
async function listCommentsCore(ctx: any, submissionId: Id<"submissions">) {
  const rows = await ctx.db
    .query("comments")
    .withIndex("by_submission", (q: any) => q.eq("submissionId", submissionId))
    .collect();
  const out = [];
  for (const c of rows) {
    const user = await ctx.db.get(c.userId);
    out.push({
      id: String(c._id),
      content: c.content,
      isFlagged: c.isFlagged,
      createdAt: c.createdAt,
      authorName: user?.name ?? "—",
      authorId: String(c.userId),
    });
  }
  return out.sort((a: any, b: any) => a.createdAt - b.createdAt);
}

export const listForSubmission = query({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, args) => listCommentsCore(ctx, args.submissionId),
});

/** REST bridge read for `GET /api/v1/comments` (public, like the gallery). */
export const listInternal = internalQuery({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, args) => listCommentsCore(ctx, args.submissionId),
});

/**
 * Flagged comments awaiting moderation (organizer/admin only).
 *
 * Backs the "Flagged Comments" tab on the event management screen; without it
 * that tab only ever rendered its empty state.
 */
export const listFlagged = query({
  args: { eventId: v.optional(v.id("events")) },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx);
    const rows = await ctx.db.query("comments").collect();
    const out = [];
    for (const c of rows) {
      if (!c.isFlagged) continue;
      if (args.eventId) {
        const sub = await ctx.db.get(c.submissionId);
        if (!sub || sub.eventId !== args.eventId) continue;
      }
      const sub = await ctx.db.get(c.submissionId);
      const author = await ctx.db.get(c.userId);
      out.push({
        id: String(c._id),
        submissionId: String(c.submissionId),
        submissionTitle: sub?.title ?? "(removed)",
        authorName: author?.name ?? "—",
        content: c.content,
        createdAt: c.createdAt,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Add-comment core, shared by the Convex mutation and the REST bridge.
 *
 * `user` is resolved by the caller (identity in Convex, verified session in
 * HTTP) so the T3.5 rate limit and the audit trail behave identically on both
 * surfaces.
 */
async function addCommentCore(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: { submissionId: Id<"submissions">; content: string },
) {
  {
    const submission = await ctx.db.get(args.submissionId);
    if (!submission) throw new Error("Submission not found");
    const content = args.content.trim();
    if (content.length === 0 || content.length > MAX_COMMENT_LENGTH) {
      throw new Error(`Comment must be 1-${MAX_COMMENT_LENGTH} characters`);
    }

    // T3.5: same fixed-window limiter as voting (20 writes/minute/actor).
    if (!(await checkRateLimit(ctx, `comment:${user._id}`))) {
      await appendAudit(ctx, {
        eventId: submission.eventId,
        actorId: user._id,
        action: "comment.rate_limited",
        targetType: "submission",
        targetId: String(args.submissionId),
      });
      throw new Error("Rate limit exceeded: too many comments per minute");
    }

    const id = await ctx.db.insert("comments", {
      submissionId: args.submissionId,
      userId: user._id,
      content,
      isFlagged: false,
      createdAt: Date.now(),
    });
    await appendAudit(ctx, {
      eventId: submission.eventId,
      actorId: user._id,
      action: "comment.add",
      targetType: "comment",
      targetId: String(id),
      afterState: JSON.stringify({ submissionId: String(args.submissionId), length: content.length }),
    });
    return id;
  }
}

export const add = mutation({
  args: { submissionId: v.id("submissions"), content: v.string() },
  handler: async (ctx, args) => addCommentCore(ctx, await requireUser(ctx), args),
});

/** REST bridge for `POST /api/v1/comments`. */
export const addInternal = internalMutation({
  args: { userId: v.id("users"), submissionId: v.id("submissions"), content: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    return addCommentCore(ctx, user, args);
  },
});

/** Flag-comment core, shared by the Convex mutation and the REST bridge. */
async function flagCommentCore(
  ctx: MutationCtx,
  user: Doc<"users">,
  commentId: Id<"comments">,
) {
  const comment = await ctx.db.get(commentId);
  if (!comment) throw new Error("Comment not found");
  if (comment.isFlagged) throw new Error("This comment has already been flagged for review");
  await ctx.db.patch(commentId, { isFlagged: true });
  const submission = await ctx.db.get(comment.submissionId);
  await appendAudit(ctx, {
    eventId: submission?.eventId,
    actorId: user._id,
    action: "comment.flag",
    targetType: "comment",
    targetId: String(commentId),
    beforeState: JSON.stringify({ isFlagged: false }),
    afterState: JSON.stringify({ isFlagged: true }),
  });
  return { ok: true };
}

export const flag = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => flagCommentCore(ctx, await requireUser(ctx), args.commentId),
});

/** REST bridge for `POST /api/v1/comments/:id/flag`. */
export const flagInternal = internalMutation({
  args: { userId: v.id("users"), commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    return flagCommentCore(ctx, user, args.commentId);
  },
});

/** Clear a flag (organizer/admin moderation). */
export const unflag = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");
    await ctx.db.patch(args.commentId, { isFlagged: false });
    const submission = await ctx.db.get(comment.submissionId);
    await appendAudit(ctx, {
      eventId: submission?.eventId,
      actorId: actor._id,
      action: "comment.unflag",
      targetType: "comment",
      targetId: String(args.commentId),
      beforeState: JSON.stringify({ isFlagged: true }),
      afterState: JSON.stringify({ isFlagged: false }),
    });
    return { ok: true };
  },
});

/** Delete-comment core, shared by the Convex mutation and the REST bridge. */
async function deleteCommentCore(
  ctx: MutationCtx,
  user: Doc<"users">,
  commentId: Id<"comments">,
) {
  const comment = await ctx.db.get(commentId);
  if (!comment) throw new Error("Comment not found");
  if (comment.userId !== user._id && user.role !== "admin" && user.role !== "organizer") {
    throw new Error("Unauthorized to delete this comment");
  }
  const submission = await ctx.db.get(comment.submissionId);
  await ctx.db.delete(commentId);
  await appendAudit(ctx, {
    eventId: submission?.eventId,
    actorId: user._id,
    action: "comment.delete",
    targetType: "comment",
    targetId: String(commentId),
    beforeState: JSON.stringify({
      submissionId: String(comment.submissionId),
      authorId: String(comment.userId),
    }),
    afterState: "deleted",
  });
  return { ok: true };
}

export const deleteComment = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => deleteCommentCore(ctx, await requireUser(ctx), args.commentId),
});

/** REST bridge for `DELETE /api/v1/comments/:id`. */
export const deleteCommentInternal = internalMutation({
  args: { userId: v.id("users"), commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    return deleteCommentCore(ctx, user, args.commentId);
  },
});

// `canModerate` used to live here as a per-comment query. It had no callers:
// the project page already knows the viewer's own id and role (`users.me`) and
// decides moderation rights locally, while `comments.deleteComment` re-checks
// the same rule server-side. Removed rather than kept as an unused public read.
