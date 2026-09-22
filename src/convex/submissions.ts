import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  getCurrentUser,
  requireUser,
  assertSubmissionWindow,
} from "./lib/common";
import { appendAudit } from "./lib/audit";
import { seededShuffle, seedFromString } from "./crypto";

/** Submissions (T1). Drafts autosave until deadline; gallery is public. */

interface GalleryCard {
  id: string;
  title: string;
  tagline: string;
  tags: string;
  teamName: string;
  trackName: string;
  repositoryUrl: string;
  videoUrl: string;
  demoUrl: string;
  submittedAt: number;
  likesHidden: boolean;
}

/** Public gallery (no auth): submitted projects only, searchable, seeded-randomizable. */
export const publicGallery = query({
  args: {
    eventId: v.id("events"),
    search: v.optional(v.string()),
    trackId: v.optional(v.id("tracks")),
    seed: v.optional(v.number()),
    randomize: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    // Gallery becomes visible once hacking closes (judging stage onward).
    const visible = ["judging", "voting", "published", "archived"].includes(event.status);
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    let cards: (GalleryCard & { status: string; teamId: string })[] = [];
    for (const s of subs) {
      if (s.status !== "submitted") continue;
      const team = await ctx.db.get(s.teamId);
      const track = s.trackId ? await ctx.db.get(s.trackId) : null;
      cards.push({
        id: String(s._id),
        title: s.title,
        tagline: s.tagline,
        tags: s.tags,
        teamName: team?.name ?? "Unknown team",
        trackName: track?.name ?? "Open",
        repositoryUrl: s.repositoryUrl,
        videoUrl: s.videoUrl,
        demoUrl: s.demoUrl,
        submittedAt: s.submittedAt ?? s.updatedAt,
        status: s.status,
        teamId: String(s.teamId),
        likesHidden: true, // vote counts never ship from the API until results publish
      });
    }
    if (!visible) cards = [];
    const q = (args.search ?? "").trim().toLowerCase();
    if (q) {
      cards = cards.filter((c) =>
        [c.title, c.tagline, c.tags, c.teamName, c.trackName]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    if (args.trackId) {
      const all = await ctx.db
        .query("tracks")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect();
      const names = all.filter((t) => String(t._id) === String(args.trackId)).map((t) => t.name);
      cards = cards.filter((c) => names.includes(c.trackName));
    }
    if (args.randomize) {
      const seed = args.seed ?? seedFromString(String(args.eventId));
      cards = seededShuffle(cards, seed);
    }
    return cards;
  },
});

/** All submissions for an event (organizer/admin). */
export const byEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const out = [];
    for (const s of subs) {
      const team = await ctx.db.get(s.teamId);
      const track = s.trackId ? await ctx.db.get(s.trackId) : null;
      out.push({
        ...s,
        teamName: team?.name ?? "—",
        trackName: track?.name ?? "Open",
      });
    }
    return out;
  },
});

/** My team's submission for an event (participant view; includes drafts). */
export const mySubmission = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const m of memberships) {
      const team = await ctx.db.get(m.teamId);
      if (!team || team.eventId !== args.eventId) continue;
      const subs = await ctx.db
        .query("submissions")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .collect();
      const sub = subs[0];
      if (!sub) return { team, submission: null };
      const track = sub.trackId ? await ctx.db.get(sub.trackId) : null;
      const event = await ctx.db.get(args.eventId);
      return {
        team,
        submission: { ...sub, trackName: track?.name ?? "Open" },
        event,
      };
    }
    return null;
  },
});

/** Public single-submission view (only when submitted, or for members/organizers). */
export const detail = query({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.submissionId);
    if (!sub) throw new Error("Submission not found");
    const event = await ctx.db.get(sub.eventId);
    const team = await ctx.db.get(sub.teamId);
    const track = sub.trackId ? await ctx.db.get(sub.trackId) : null;
    const user = await getCurrentUser(ctx);
    let canEdit = false;
    if (user) {
      const membership = await ctx.db
        .query("teamMembers")
        .withIndex("by_team", (q) => q.eq("teamId", sub.teamId))
        .collect();
      if (user.role === "admin" || user.role === "organizer") canEdit = true;
      if (membership.some((m) => m.userId === user._id)) canEdit = true;
    }
    const isPublic = sub.status === "submitted" && event && event.status !== "draft";
    if (!isPublic && !canEdit) throw new Error("Not available");
    return {
      ...sub,
      teamName: team?.name ?? "—",
      trackName: track?.name ?? "Open",
      canEdit,
    };
  },
});

/** Create or update the team's draft submission. Deadline-enforced. */
export const saveDraft = mutation({
  args: {
    eventId: v.id("events"),
    title: v.optional(v.string()),
    tagline: v.optional(v.string()),
    description: v.optional(v.string()),
    repositoryUrl: v.optional(v.string()),
    videoUrl: v.optional(v.string()),
    demoUrl: v.optional(v.string()),
    tags: v.optional(v.string()),
    customFields: v.optional(v.string()),
    trackId: v.optional(v.id("tracks")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    assertSubmissionWindow(ctx, event, user.role ?? "participant");

    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    let teamId: Id<"teams"> | null = null;
    for (const m of memberships) {
      const t = await ctx.db.get(m.teamId);
      if (t && t.eventId === args.eventId) {
        teamId = m.teamId;
        break;
      }
    }
    if (!teamId) throw new Error("Join or create a team first");

    const existing = await ctx.db
      .query("submissions")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    const draft = existing[0];

    if (draft && draft.status === "submitted") {
      throw new Error("Already submitted — withdraw or contact an organizer to edit");
    }

    if (!draft) {
      const id = await ctx.db.insert("submissions", {
        eventId: args.eventId,
        teamId,
        trackId: args.trackId,
        title: args.title ?? "",
        tagline: args.tagline ?? "",
        description: args.description ?? "",
        repositoryUrl: args.repositoryUrl ?? "",
        videoUrl: args.videoUrl ?? "",
        demoUrl: args.demoUrl ?? "",
        tags: args.tags ?? "",
        customFields: args.customFields ?? "{}",
        status: "draft",
        updatedAt: Date.now(),
      });
      await appendAudit(ctx, {
        eventId: args.eventId,
        actorId: user._id,
        action: "submission.draft_create",
        targetType: "submission",
        targetId: String(id),
      });
      return id;
    }

    await ctx.db.patch(draft._id, {
      trackId: args.trackId ?? draft.trackId,
      title: args.title ?? draft.title,
      tagline: args.tagline ?? draft.tagline,
      description: args.description ?? draft.description,
      repositoryUrl: args.repositoryUrl ?? draft.repositoryUrl,
      videoUrl: args.videoUrl ?? draft.videoUrl,
      demoUrl: args.demoUrl ?? draft.demoUrl,
      tags: args.tags ?? draft.tags,
      customFields: args.customFields ?? draft.customFields,
      updatedAt: Date.now(),
    });
    return draft._id;
  },
});

/** Submit the draft for judging. Requires minimum fields; deadline-enforced. */
export const submit = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    assertSubmissionWindow(ctx, event, user.role ?? "participant");

    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    let teamId: Id<"teams"> | null = null;
    for (const m of memberships) {
      const t = await ctx.db.get(m.teamId);
      if (t && t.eventId === args.eventId) {
        teamId = m.teamId;
        break;
      }
    }
    if (!teamId) throw new Error("Join or create a team first");

    const existing = await ctx.db
      .query("submissions")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    const draft = existing[0];
    if (!draft) throw new Error("Create a draft first");

    if (!draft.title.trim() || !draft.description.trim()) {
      throw new Error("Title and description are required before submitting");
    }

    await ctx.db.patch(draft._id, {
      status: "submitted",
      submittedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      eventId: args.eventId,
      actorId: user._id,
      action: "submission.submit",
      targetType: "submission",
      targetId: String(draft._id),
      beforeState: draft.status,
      afterState: "submitted",
    });
    return { ok: true, submissionId: draft._id };
  },
});

/** Withdraw back to draft (before deadline only). */
export const withdraw = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    assertSubmissionWindow(ctx, event, user.role ?? "participant");
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const m of memberships) {
      const t = await ctx.db.get(m.teamId);
      if (!t || t.eventId !== args.eventId) continue;
      const subs = await ctx.db
        .query("submissions")
        .withIndex("by_team", (q) => q.eq("teamId", t._id))
        .collect();
      const sub = subs[0];
      if (sub) {
        await ctx.db.patch(sub._id, { status: "draft", submittedAt: undefined });
        await appendAudit(ctx, {
          eventId: args.eventId,
          actorId: user._id,
          action: "submission.withdraw",
          targetType: "submission",
          targetId: String(sub._id),
          beforeState: "submitted",
          afterState: "draft",
        });
        return { ok: true };
      }
    }
    throw new Error("No submission found");
  },
});
