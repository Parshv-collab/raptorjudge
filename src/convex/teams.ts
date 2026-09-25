import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser, requireUser, parseSettings } from "./lib/common";

import { assertWithinWindow } from "./lib/timeWindows";
import { appendAudit } from "./lib/audit";
import { randomHex } from "./crypto";

/** Teams & invites (T1). Invite codes are 12-hex random, single-team-join per event. */

/**
 * Teams in an event.
 *
 * Role isolation: the team document carries the **invite code**, which is a
 * capability — anyone holding it can join the team. The roster is therefore
 * public (participants browse teams to find one to join) but the invite code is
 * only included for members of that team and for organizers/admins.
 */
export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const isStaff = user?.role === "organizer" || user?.role === "admin";
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    const myTeamIds = new Set<string>();
    if (user) {
      const memberships = await ctx.db
        .query("teamMembers")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
      for (const m of memberships) myTeamIds.add(String(m.teamId));
    }

    const out = [];
    for (const t of teams) {
      const members = await ctx.db
        .query("teamMembers")
        .withIndex("by_team", (q) => q.eq("teamId", t._id))
        .collect();
      const canSeeCode = isStaff || myTeamIds.has(String(t._id));
      out.push({
        _id: t._id,
        eventId: t.eventId,
        name: t.name,
        trackId: t.trackId,
        inviteCode: canSeeCode ? t.inviteCode : null,
        memberCount: members.length,
        isMine: myTeamIds.has(String(t._id)),
      });
    }
    return out;
  },
});

/** Teams the current user belongs to, with member details. */
export const myTeams = query({
  args: { eventId: v.optional(v.id("events")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const teams = [];
    for (const m of memberships) {
      const team = await ctx.db.get(m.teamId);
      if (!team) continue;
      if (args.eventId && team.eventId !== args.eventId) continue;
      const members = await ctx.db
        .query("teamMembers")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .collect();
      const memberUsers = [];
      for (const mem of members) {
        const u = await ctx.db.get(mem.userId);
        if (u) memberUsers.push({ userId: mem.userId, name: u.name, email: u.email, memberRole: mem.memberRole });
      }
      teams.push({
        ...team,
        members: memberUsers,
        myRole: m.memberRole,
      });
    }
    return teams;
  },
});

/**
 * A single team. Role isolation: the roster (member names **and emails**) is only
 * returned to the team's own members and to organizers/admins — an arbitrary
 * signed-in participant must not be able to enumerate other people's emails.
 */
export const getTeam = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");
    const members = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    const isMember = members.some((m) => m.userId === user._id);
    const isStaff = user.role === "organizer" || user.role === "admin";

    if (!isMember && !isStaff) {
      return {
        _id: team._id,
        eventId: team.eventId,
        name: team.name,
        trackId: team.trackId,
        memberCount: members.length,
        members: [],
        isMember: false,
        canViewRoster: false,
      };
    }

    const memberUsers = [];
    for (const m of members) {
      const u = await ctx.db.get(m.userId);
      if (u) {
        memberUsers.push({
          userId: m.userId,
          name: u.name,
          // Email is only exposed to organizers/admins; teammates already
          // share a workspace, so they get names and roles instead.
          email: isStaff ? u.email : undefined,
          memberRole: m.memberRole,
        });
      }
    }
    return {
      ...team,
      inviteCode: isMember || isStaff ? team.inviteCode : null,
      members: memberUsers,
      isMember,
      canViewRoster: true,
    };
  },
});

export const create = mutation({
  args: {
    eventId: v.id("events"),
    name: v.string(),
    trackId: v.optional(v.id("tracks")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.role === "judge") throw new Error("Judges cannot join teams");
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    assertWithinWindow(event, "registration");

    // one team per event per user
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const m of memberships) {
      const t = await ctx.db.get(m.teamId);
      if (t && t.eventId === args.eventId) {
        throw new Error("You already belong to a team in this event");
      }
    }

    const inviteCode = randomHex(6);

    const teamId = await ctx.db.insert("teams", {
      eventId: args.eventId,
      name: args.name,
      inviteCode,
      trackId: args.trackId,
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
      action: "team.create",
      targetType: "team",
      targetId: String(teamId),
      afterState: JSON.stringify({ name: args.name }),
    });
    return { teamId, inviteCode };
  },
});

export const joinByInviteCode = mutation({
  args: { inviteCode: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.role === "judge") throw new Error("Judges cannot join teams");
    const team = await ctx.db
      .query("teams")
      .withIndex("by_invite", (q) => q.eq("inviteCode", args.inviteCode.trim().toLowerCase()))
      .unique();
    if (!team) throw new Error("Invalid invite code");
    const event = await ctx.db.get(team.eventId);
    if (!event) throw new Error("Event not found");
    assertWithinWindow(event, "registration");
    const settings = parseSettings(event.settings);
    const maxTeamSize = Number(settings["max_team_size"] ?? 4);

    const members = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", team._id))
      .collect();
    if (members.some((m) => m.userId === user._id)) {
      throw new Error("Already a member of this team");
    }
    if (members.length >= maxTeamSize) throw new Error(`Team is full (max ${maxTeamSize})`);

    // enforce one team per event
    for (const m of await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()) {
      const t = await ctx.db.get(m.teamId);
      if (t && t.eventId === team.eventId) {
        throw new Error("You already belong to a team in this event");
      }
    }

    await ctx.db.insert("teamMembers", {
      teamId: team._id,
      userId: user._id,
      memberRole: "member",
      joinedAt: Date.now(),
    });
    await appendAudit(ctx, {
      eventId: team.eventId,
      actorId: user._id,
      action: "team.join",
      targetType: "team",
      targetId: String(team._id),
      afterState: JSON.stringify({ user: user.email }),
    });
    return { teamId: team._id, teamName: team.name };
  },
});

/** Leave team (leader must transfer ownership first if last member). */
export const leave = mutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect()
      .then((rows) => rows.find((m) => m.userId === user._id));
    if (!membership) throw new Error("You are not a member of this team");
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");

    const members = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    if (membership.memberRole === "leader" && members.length > 1) {
      throw new Error("Transfer leadership before leaving (use teams.transferLeadership)");
    }
    await ctx.db.delete(membership._id);
    if (members.length === 1) {
      // last member leaving deletes the team (and any draft submission)
      const submissions = await ctx.db
        .query("submissions")
        .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
        .collect();
      for (const s of submissions) await ctx.db.delete(s._id);
      await ctx.db.delete(args.teamId);
    }
    await appendAudit(ctx, {
      eventId: team.eventId,
      actorId: user._id,
      action: "team.leave",
      targetType: "team",
      targetId: String(args.teamId),
      beforeState: JSON.stringify({ user: user.email }),
    });
    return { ok: true };
  },
});

export const transferLeadership = mutation({
  args: { teamId: v.id("teams"), newLeaderId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const members = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    const mine = members.find((m) => m.userId === user._id);
    if (!mine || mine.memberRole !== "leader") throw new Error("Only the leader can transfer leadership");
    const target = members.find((m) => m.userId === args.newLeaderId);
    if (!target) throw new Error("Target member not in team");
    await ctx.db.patch(mine._id, { memberRole: "member" });
    await ctx.db.patch(target._id, { memberRole: "leader" });
    return { ok: true };
  },
});
