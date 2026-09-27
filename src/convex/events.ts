import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { getCurrentUser, requireOrganizer, requireUser } from "./lib/common";
import { appendAudit } from "./lib/audit";

const eventArgs = {
  slug: v.string(), title: v.string(), tagline: v.string(), description: v.string(),
  registrationStart: v.optional(v.number()), registrationEnd: v.optional(v.number()), submissionDeadline: v.optional(v.number()),
  judgingStart: v.optional(v.number()), judgingEnd: v.optional(v.number()), votingStart: v.optional(v.number()), votingEnd: v.optional(v.number()),
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
// `get({ eventId })` was removed: every caller resolved an event by slug
// (`getBySlug`) or through a public variant, so it was an unused public read
// that duplicated `assertEventVisible` gating.
export const getBySlug = query({ args: { slug: v.string() }, handler: async (ctx, args) => {
  const event = await ctx.db.query("events").withIndex("by_slug", (q) => q.eq("slug", args.slug)).unique();
  if (!event) return null;
  await assertEventVisible(ctx, event);
  return event;
} });

/**
 * Role isolation: a draft event is unpublished, so only the people running it
 * may read it. Every other page (gallery, event page, embed) treats a draft as
 * absent rather than revealing the announcement early. Non-draft stages stay
 * fully public — the lifecycle, not this check, governs what they may contain.
 */
async function assertEventVisible(ctx: QueryCtx, event: Doc<"events">) {
  if (event.status !== "draft") return;
  const viewer = await getCurrentUser(ctx);
  if (viewer && (viewer.role === "organizer" || viewer.role === "admin")) return;
  throw new Error("Event not found");
}

export const create = mutation({ args: eventArgs, handler: async (ctx, args) => {
  const actor = await requireOrganizer(ctx);
  const existing = await ctx.db.query("events").withIndex("by_slug", (q) => q.eq("slug", args.slug)).unique();
  if (existing) throw new Error(`Event slug already exists: ${args.slug}`);
  const now = Date.now();
  const regStart = args.registrationOpens ?? args.registrationStart ?? now;
  const regEnd = args.registrationCloses ?? args.registrationEnd ?? (now + 86400000);
  const subOpens = args.submissionOpens ?? regStart;
  const subDeadline = args.submissionDeadline ?? regEnd;
  const judgeStart = args.judgingStarts ?? args.judgingStart ?? subDeadline;
  const judgeEnd = args.judgingEnds ?? args.judgingEnd ?? (judgeStart + 86400000);
  const resAnnounced = args.resultsAnnounced ?? args.votingStart ?? args.votingEnd ?? judgeEnd;

  const eventId = await ctx.db.insert("events", {
    ...args,
    tagline: args.tagline || args.shortDescription || "",
    description: args.description || args.fullDescription || "",
    shortDescription: args.shortDescription || args.tagline || "",
    fullDescription: args.fullDescription || args.description || "",
    registrationStart: regStart,
    registrationEnd: regEnd,
    registrationOpens: regStart,
    registrationCloses: regEnd,
    submissionOpens: subOpens,
    submissionDeadline: subDeadline,
    judgingStart: judgeStart,
    judgingEnd: judgeEnd,
    judgingStarts: judgeStart,
    judgingEnds: judgeEnd,
    votingStart: resAnnounced,
    votingEnd: resAnnounced,
    resultsAnnounced: resAnnounced,
    status: "draft",
    timezone: args.timezone ?? "UTC",
    settings: args.settings ?? "max_team_size=4,voting_type=quadratic",
    organizerId: actor._id,
    minTeamSize: args.minTeamSize ?? 1,
    maxTeamSize: args.maxTeamSize ?? 4,
    soloAllowed: args.soloAllowed ?? true,
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
  const regStart = patch.registrationOpens ?? patch.registrationStart ?? event.registrationOpens ?? event.registrationStart;
  const regEnd = patch.registrationCloses ?? patch.registrationEnd ?? event.registrationCloses ?? event.registrationEnd;
  const subOpens = patch.submissionOpens ?? event.submissionOpens ?? regStart;
  const subDeadline = patch.submissionDeadline ?? event.submissionDeadline;
  const judgeStart = patch.judgingStarts ?? patch.judgingStart ?? event.judgingStarts ?? event.judgingStart;
  const judgeEnd = patch.judgingEnds ?? patch.judgingEnd ?? event.judgingEnds ?? event.judgingEnd;
  const resAnnounced = patch.resultsAnnounced ?? patch.votingStart ?? patch.votingEnd ?? event.resultsAnnounced;

  await ctx.db.patch(eventId, {
    ...patch,
    tagline: patch.tagline || patch.shortDescription || event.tagline,
    description: patch.description || patch.fullDescription || event.description,
    shortDescription: patch.shortDescription || patch.tagline || event.shortDescription,
    fullDescription: patch.fullDescription || patch.description || event.fullDescription,
    registrationStart: regStart,
    registrationEnd: regEnd,
    registrationOpens: regStart,
    registrationCloses: regEnd,
    submissionOpens: subOpens,
    submissionDeadline: subDeadline,
    judgingStart: judgeStart,
    judgingEnd: judgeEnd,
    judgingStarts: judgeStart,
    judgingEnds: judgeEnd,
    votingStart: resAnnounced,
    votingEnd: resAnnounced,
    resultsAnnounced: resAnnounced,
  });
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
  await ctx.db.patch(args.eventId, { status: args.stage }); await appendAudit(ctx, { eventId: args.eventId, actorId: actor._id, action: "event.stage_change", targetType: "event", targetId: String(args.eventId), beforeState: event.status, afterState: args.stage });
  // Announcing results is the one transition subscribers act on: it changes the
  // public gallery for everyone, so it gets a webhook of its own.
  if (args.stage === "published" && event.status !== "published") {
    await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
      eventId: args.eventId,
      eventType: "results.published",
      payload: JSON.stringify({ eventId: String(args.eventId), slug: event.slug, title: event.title, publishedAt: Date.now() }),
    });
  }
  return { ok: true };
} });

export const adminTransferOwnership = mutation({ args: { eventId: v.id("events"), newOrganizerId: v.id("users") }, handler: async (ctx, args) => {
  const actor = await requireOrganizer(ctx);
  if (actor.role !== "admin") throw new Error("Admin required");
  const event = await ctx.db.get(args.eventId); if (!event) throw new Error("Event not found");
  const target = await ctx.db.get(args.newOrganizerId); if (!target) throw new Error("User not found");
  await ctx.db.patch(args.eventId, { organizerId: args.newOrganizerId });
  await appendAudit(ctx, { eventId: args.eventId, actorId: actor._id, action: "event.admin_transfer_ownership", targetType: "event", targetId: String(args.eventId), beforeState: JSON.stringify({ organizerId: event.organizerId }), afterState: JSON.stringify({ organizerId: args.newOrganizerId }) });
  return { ok: true };
} });

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const getStorageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return ctx.storage.getUrl(args.storageId);
  },
});


/** Participant discovery: events where the current user belongs to a team. */
export const enrolled = query({ args: {}, handler: async (ctx) => {
  const user = await requireUser(ctx);
  const memberships = await ctx.db.query("teamMembers").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
  const eventIds = new Set<string>();
  for (const membership of memberships) {
    const team = await ctx.db.get(membership.teamId);
    if (team) eventIds.add(String(team.eventId));
  }
  const all = await ctx.db.query("events").collect();
  const teams = await ctx.db.query("teams").collect();
  const members = await ctx.db.query("teamMembers").collect();
  return all.filter((event) => eventIds.has(String(event._id))).map((event) => ({
    ...event,
    participantCount: members.filter((member) => teams.find((team) => team._id === member.teamId)?.eventId === event._id).length,
  }));
} });

/** Public discovery feed, ranked by current team-member count. */
export const featured = query({ args: {}, handler: async (ctx) => {
  const events = (await ctx.db.query("events").collect()).filter((event) => ["registration", "hacking", "judging", "voting", "published"].includes(event.status));
  const teams = await ctx.db.query("teams").collect();
  const members = await ctx.db.query("teamMembers").collect();
  return events.map((event) => ({
    ...event,
    participantCount: members.filter((member) => {
      const team = teams.find((candidate) => candidate._id === member.teamId);
      return team?.eventId === event._id;
    }).length,
  })).sort((a, b) => b.participantCount - a.participantCount).slice(0, 4);
} });
