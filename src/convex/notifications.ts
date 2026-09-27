import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireUser } from "./lib/common";

/**
 * Per-user notifications (issue 23.3).
 *
 * The only writer today is the results-publish transition in
 * `events.setStage`, which fans one row out to every participant of the event
 * via `notifyEventParticipants`. Rows are created with `readAt` unset; the bell
 * in the shell counts the unset ones.
 */

/**
 * Fan a notification out to many users. Internal so only server code can
 * create rows — clients can only read and mark their own read.
 */
export const createManyInternal = internalMutation({
  args: {
    userIds: v.array(v.id("users")),
    type: v.string(),
    eventId: v.optional(v.id("events")),
    message: v.string(),
    linkUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const userId of args.userIds) {
      await ctx.db.insert("notifications", {
        userId,
        type: args.type,
        eventId: args.eventId,
        message: args.message,
        linkUrl: args.linkUrl,
        createdAt: now,
      });
    }
    return { count: args.userIds.length };
  },
});

/** My notifications, newest first (signed-in callers only). */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((n) => ({
        id: String(n._id),
        type: n.type,
        eventId: n.eventId ? String(n.eventId) : null,
        message: n.message,
        linkUrl: n.linkUrl ?? null,
        createdAt: n.createdAt,
        readAt: n.readAt ?? null,
      }));
  },
});

/** Mark every unread notification of the caller as read. */
export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const n of unread) {
      if (!n.readAt) await ctx.db.patch(n._id, { readAt: now });
    }
    return { ok: true };
  },
});
