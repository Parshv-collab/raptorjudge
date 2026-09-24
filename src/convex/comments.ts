import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/common";

/** Comments (T3). Public discussion on submissions; flagging for moderation. */

export const listForSubmission = query({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("comments")
      .withIndex("by_submission", (q) => q.eq("submissionId", args.submissionId))
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
      });
    }
    return out.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const add = mutation({
  args: { submissionId: v.id("submissions"), content: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const content = args.content.trim();
    if (content.length === 0 || content.length > 2000) {
      throw new Error("Comment must be 1-2000 characters");
    }
    return ctx.db.insert("comments", {
      submissionId: args.submissionId,
      userId: user._id,
      content,
      isFlagged: false,
      createdAt: Date.now(),
    });
  },
});

export const flag = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");
    await ctx.db.patch(args.commentId, { isFlagged: true });
    return { ok: true };
  },
});

export const deleteComment = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");
    if (comment.userId !== user._id && user.role !== "admin" && user.role !== "organizer") {
      throw new Error("Unauthorized to delete this comment");
    }
    await ctx.db.delete(args.commentId);
    return { ok: true };
  },
});
