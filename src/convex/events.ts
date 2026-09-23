import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOrganizer, requireUser } from "./lib/common";
import { appendAudit } from "./lib/audit";

const eventArgs = {
  slug: v.string(), title: v.string(), tagline: v.string(), description: v.string(),
  registrationStart: v.number(), registrationEnd: v.number(), submissionDeadline: v.number(),
  judgingStart: v.number(), judgingEnd: v.number(), votingStart: v.number(), votingEnd: v.number(),
  timezone: v.optional(v.string()), settings: v.optional(v.string()), bannerUrl: v.optional(v.string()),
  hostName: v.optional(v.string()), shortDescription: v.optional(v.string()), fullDescription: v.optional(v.string()),
  rules: v.optional(v.string()), registrationOpens: v.optional(v.number()), registrationCloses: v.optional(v.number()),
  submissionOpens: v.optional(v.number()), judgingStarts: v.optional(v.number()), judgingEnds: v.optional(v.number()),
  resultsAnnounced: v.optional(v.number()), minTeamSize: v.optional(v.number()), maxTeamSize: v.optional(v.number()),
  soloAllowed: v.optional(v.boolean()), coverImageRequired: v.optional(v.boolean()),
};

export const listAll = query({ args: {}, handler: async (ctx) => { await requireOrganizer(ctx); return ctx.db.query("events").collect(); } });
export const listMine = query({ args: {}, handler: async (ctx) => {
  const user = await requireOrganizer(ctx);
  const all = await ctx.db.query("events").collect();
  return (user.role === "admin" ? all : all.filter((e) => e.organizerId === user._id));
} });
export const listPublic = query({ args: {}, handler: async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.status !== "draft") });
export const get = query({ args: { eventId: v.id("events") }, handler: async (ctx, args) => { const event = await ctx.db.get(args.eventId); if (!event) throw new Error("Event not found"); return event; } });
export const getBySlug = query({ args: { slug: v.string() }, handler: async (ctx, args) => ctx.db.query("events").withIndex("by_slug", (q) => q.eq("slug", args.slug)).unique() });

export const create = mutation({ args: eventArgs, handler: async (ctx, args) => {
  const actor = await requireOrganizer(ctx);
  const existing = await ctx.db.query("events").withIndex("by_slug", (q) => q.eq("slug", args.slug)).unique();
  if (existing) throw new Error(`Event slug already exists: ${args.slug}`);
  const now = Date.now();
  const eventId = await ctx.db.insert("events", {
    ...args, tagline: args.tagline || args.shortDescription || "", description: args.description || args.fullDescription || "",
    status: "draft", timezone: args.timezone ?? "UTC", settings: args.settings ?? "max_team_size=4,voting_type=quadratic",
    organizerId: actor._id, minTeamSize: args.minTeamSize ?? 1, maxTeamSize: args.maxTeamSize ?? 4, soloAllowed: args.soloAllowed ?? true,
    coverImageRequired: args.coverImageRequired ?? false,
  });
  await appendAudit(ctx, { eventId, actorId: actor._id, action: "event.create", targetType: "event", targetId: String(eventId), afterState: JSON.stringify({ slug: args.slug, title: args.title, createdAt: now }) });
  return eventId;
} });

export const update = mutation({ args: { eventId: v.id("events"), ...eventArgs }, handler: async (ctx, args) => {
  const actor = await requireOrganizer(ctx); const event = await ctx.db.get(args.eventId); if (!event) throw new Error("Event not found");
  const { eventId, ...patch } = args; const before = JSON.stringify(event);
  const duplicate = await ctx.db.query("events").withIndex("by_slug", (q) => q.eq("slug", patch.slug)).unique();
  if (duplicate && duplicate._id !== eventId) throw new Error("Event slug already exists");
  await ctx.db.patch(eventId, { ...patch, tagline: patch.tagline || patch.shortDescription || event.tagline, description: patch.description || patch.fullDescription || event.description });
  await appendAudit(ctx, { eventId, actorId: actor._id, action: "event.update", targetType: "event", targetId: String(eventId), beforeState: before, afterState: JSON.stringify(patch) });
  return { ok: true };
} });

export const publish = mutation({ args: { eventId: v.id("events") }, handler: async (ctx, args) => {
  const actor = await requireOrganizer(ctx); const event = await ctx.db.get(args.eventId); if (!event) throw new Error("Event not found");
  await ctx.db.patch(args.eventId, { status: "registration", publishedAt: Date.now() });
  await appendAudit(ctx, { eventId: args.eventId, actorId: actor._id, action: "event.publish", targetType: "event", targetId: String(args.eventId), beforeState: event.status, afterState: "registration" });
  return { ok: true };
} });
export const unpublish = mutation({ args: { eventId: v.id("events") }, handler: async (ctx, args) => {
  const actor = await requireOrganizer(ctx); const event = await ctx.db.get(args.eventId); if (!event) throw new Error("Event not found");
  await ctx.db.patch(args.eventId, { status: "draft", publishedAt: undefined });
  await appendAudit(ctx, { eventId: args.eventId, actorId: actor._id, action: "event.unpublish", targetType: "event", targetId: String(args.eventId), beforeState: event.status, afterState: "draft" });
  return { ok: true };
} });
export const deleteEvent = mutation({ args: { eventId: v.id("events") }, handler: async (ctx, args) => {
  const actor = await requireOrganizer(ctx); const event = await ctx.db.get(args.eventId); if (!event) throw new Error("Event not found");
  if (event.status !== "draft") throw new Error("Only draft events can be deleted");
  await ctx.db.delete(args.eventId); await appendAudit(ctx, { actorId: actor._id, action: "event.delete", targetType: "event", targetId: String(args.eventId), beforeState: JSON.stringify(event), afterState: "deleted" }); return { ok: true };
} });

export const setStage = mutation({ args: { eventId: v.id("events"), stage: v.string() }, handler: async (ctx, args) => {
  const actor = await requireOrganizer(ctx); const event = await ctx.db.get(args.eventId); if (!event) throw new Error("Event not found");
  const stages = ["draft", "registration", "hacking", "judging", "voting", "published", "archived"]; if (!stages.includes(args.stage)) throw new Error("Invalid stage");
  await ctx.db.patch(args.eventId, { status: args.stage }); await appendAudit(ctx, { eventId: args.eventId, actorId: actor._id, action: "event.stage_change", targetType: "event", targetId: String(args.eventId), beforeState: event.status, afterState: args.stage }); return { ok: true };
} });
