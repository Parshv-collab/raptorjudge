import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  EVENT_STAGES,
  requireOrganizer,
  requireUser,
  type EventStage,
} from "./lib/common";
import { appendAudit } from "./lib/audit";

/**
 * Events (T1). Lifecycle is a linear state machine:
 * draft → registration → hacking → judging → voting → published → archived.
 * Every transition is audited.
 */

export const listAll = query({
  args: {},
  handler: async (ctx) => ctx.db.query("events").collect(),
});

export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("events").collect();
    return all.filter((e) => e.status !== "draft");
  },
});

export const get = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    // Vote tallies are never stored on the event doc, so no leak path here.
    return event;
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

export const create = mutation({
  args: {
    slug: v.string(),
    title: v.string(),
    tagline: v.string(),
    description: v.string(),
    registrationStart: v.number(),
    registrationEnd: v.number(),
    submissionDeadline: v.number(),
    judgingStart: v.number(),
    judgingEnd: v.number(),
    votingStart: v.number(),
    votingEnd: v.number(),
    timezone: v.optional(v.string()),
    settings: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    const existing = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (existing) throw new Error(`Event slug already exists: ${args.slug}`);
    const eventId = await ctx.db.insert("events", {
      slug: args.slug,
      title: args.title,
      tagline: args.tagline,
      description: args.description,
      status: "draft",
      registrationStart: args.registrationStart,
      registrationEnd: args.registrationEnd,
      submissionDeadline: args.submissionDeadline,
      judgingStart: args.judgingStart,
      judgingEnd: args.judgingEnd,
      votingStart: args.votingStart,
      votingEnd: args.votingEnd,
      timezone: args.timezone ?? "UTC",
      settings: args.settings ?? "max_team_size=4,voting_type=quadratic",
    });
    await appendAudit(ctx, {
      actorId: actor._id,
      action: "event.create",
      targetType: "event",
      targetId: String(eventId),
      afterState: JSON.stringify({ slug: args.slug, title: args.title }),
    });
    return eventId;
  },
});

/** Advance (or rewind) the lifecycle stage — audited, organizer/admin only. */
export const setStage = mutation({
  args: { eventId: v.id("events"), stage: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (!(EVENT_STAGES as readonly string[]).includes(args.stage)) {
      throw new Error(`Invalid stage: ${args.stage}`);
    }
    const before = event.status;
    await ctx.db.patch(args.eventId, { status: args.stage });
    await appendAudit(ctx, {
      eventId: args.eventId,
      actorId: actor._id,
      action: "event.stage_change",
      targetType: "event",
      targetId: String(args.eventId),
      beforeState: before,
      afterState: args.stage,
    });
    return { ok: true, from: before, to: args.stage };
  },
});

export const update = mutation({
  args: {
    eventId: v.id("events"),
    title: v.optional(v.string()),
    tagline: v.optional(v.string()),
    description: v.optional(v.string()),
    submissionDeadline: v.optional(v.number()),
    settings: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    const before = JSON.stringify(event);
    await ctx.db.patch(args.eventId, {
      title: args.title ?? event.title,
      tagline: args.tagline ?? event.tagline,
      description: args.description ?? event.description,
      submissionDeadline: args.submissionDeadline ?? event.submissionDeadline,
      settings: args.settings ?? event.settings,
    });
    await appendAudit(ctx, {
      eventId: args.eventId,
      actorId: actor._id,
      action: "event.update",
      targetType: "event",
      targetId: String(args.eventId),
      beforeState: before,
      afterState: JSON.stringify({ ...event, ...args }),
    });
    return { ok: true };
  },
});
