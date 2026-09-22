import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOrganizer, requireEvent } from "./lib/common";
import { appendAudit } from "./lib/audit";

/** Tracks & prizes (T1). Managed by organizers, referenced by teams/judges. */

export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) =>
    ctx.db
      .query("tracks")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect(),
});

export const create = mutation({
  args: {
    eventId: v.id("events"),
    name: v.string(),
    description: v.string(),
    prizeDescription: v.optional(v.string()),
    prizeAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx);
    await requireEvent(ctx, args.eventId);
    return ctx.db.insert("tracks", {
      eventId: args.eventId,
      name: args.name,
      description: args.description,
      prizeDescription: args.prizeDescription ?? "",
      prizeAmount: args.prizeAmount ?? 0,
    });
  },
});

export const update = mutation({
  args: {
    trackId: v.id("tracks"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    prizeDescription: v.optional(v.string()),
    prizeAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx);
    const track = await ctx.db.get(args.trackId);
    if (!track) throw new Error("Track not found");
    await ctx.db.patch(args.trackId, {
      name: args.name ?? track.name,
      description: args.description ?? track.description,
      prizeDescription: args.prizeDescription ?? track.prizeDescription,
      prizeAmount: args.prizeAmount ?? track.prizeAmount,
    });
    return { ok: true };
  },
});
