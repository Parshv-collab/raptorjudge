import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, getCurrentUser } from "./lib/common";
import { assertWithinWindow } from "./lib/timeWindows";
import { appendAudit } from "./lib/audit";
import { randomHex } from "./crypto";

/** Participant solo registration & team seeking logic (Issue 27). */

export const getParticipantState = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const participant = await ctx.db
      .query("event_participants")
      .withIndex("by_event_user", (q) => q.eq("eventId", args.eventId).eq("userId", user._id))
      .unique();
    return participant;
  },
});

export const joinSolo = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.role === "judge") throw new Error("Judges cannot register as participants");
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");

    if (event.soloAllowed === false) {
      throw new Error("Solo participation is not enabled for this event");
    }

    assertWithinWindow(event, "registration");

    // Check existing team membership
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const m of memberships) {
      const t = await ctx.db.get(m.teamId);
      if (t && t.eventId === args.eventId) {
        throw new Error("You are already part of a team for this event");
      }
    }

    // Check existing participant row
    const existingPart = await ctx.db
      .query("event_participants")
      .withIndex("by_event_user", (q) => q.eq("eventId", args.eventId).eq("userId", user._id))
      .unique();

    if (!existingPart) {
      await ctx.db.insert("event_participants", {
        eventId: args.eventId,
        userId: user._id,
        status: "joined_solo",
        lookingForTeam: false,
        createdAt: Date.now(),
      });
    } else {
      await ctx.db.patch(existingPart._id, { status: "joined_solo" });
    }

    // Create single-member team for user so submission draft flow works
    const teamName = user.name ? `${user.name} (Solo)` : "Solo Participant";
    const inviteCode = randomHex(6);

    const teamId = await ctx.db.insert("teams", {
      eventId: args.eventId,
      name: teamName,
      inviteCode,
      createdBy: user._id,
    });

    await ctx.db.insert("teamMembers", {
      teamId,
      userId: user._id,
      memberRole: "leader",
      joinedAt: Date.now(),
    });

    await appendAudit(ctx, {
      eventId: args.eventId,
      actorId: user._id,
      action: "participate.join_solo",
      targetType: "event_participant",
      targetId: String(user._id),
      afterState: JSON.stringify({ status: "joined_solo", teamId }),
    });

    return { ok: true, teamId };
  },
});

export const toggleLookingForTeam = mutation({
  args: { eventId: v.id("events"), lookingForTeam: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("event_participants")
      .withIndex("by_event_user", (q) => q.eq("eventId", args.eventId).eq("userId", user._id))
      .unique();

    if (!existing) {
      await ctx.db.insert("event_participants", {
        eventId: args.eventId,
        userId: user._id,
        status: "joined_solo",
        lookingForTeam: args.lookingForTeam,
        createdAt: Date.now(),
      });
    } else {
      await ctx.db.patch(existing._id, { lookingForTeam: args.lookingForTeam });
    }

    return { ok: true, lookingForTeam: args.lookingForTeam };
  },
});
