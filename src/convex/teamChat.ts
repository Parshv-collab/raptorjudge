import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/common";

/**
 * Team Chat & File Sharing — private to the team's own members.
 *
 * Role isolation (Phase 3): "non-team-member cannot see team chat" is enforced
 * here, server-side, for **every** non-member including organizers and admins.
 * There is deliberately no staff back door: what a team says privately to itself
 * is not part of the judging record. Moderation happens through comments and
 * duplicate flags, which are event-scoped and auditable.
 */

/** Longest chat message accepted (keeps a single row bounded and renderable). */
export const MAX_CHAT_MESSAGE_LENGTH = 2000;

async function assertTeamMember(ctx: any, teamId: string, userId: string) {
  const members = await ctx.db
    .query("teamMembers")
    .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
    .collect();
  if (!members.some((m: any) => m.userId === userId)) {
    throw new Error("Forbidden: team chat is private to the team's own members");
  }
}

export const listMessages = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await assertTeamMember(ctx, args.teamId, user._id);

    const messages = await ctx.db
      .query("teamMessages")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    const users = await ctx.db.query("users").collect();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const out = [];
    for (const msg of messages) {
      const author = userMap.get(String(msg.userId));
      let fileUrl = null;
      if (msg.fileStorageId) {
        fileUrl = await ctx.storage.getUrl(msg.fileStorageId);
      }

      out.push({
        id: String(msg._id),
        teamId: String(msg.teamId),
        userId: String(msg.userId),
        authorName: author?.name || author?.email || "Team Member",
        authorAvatar: author?.avatarUrl || undefined,
        content: msg.content,
        fileUrl,
        fileName: msg.fileName,
        fileType: msg.fileType,
        createdAt: msg.createdAt,
      });
    }

    return out.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const sendMessage = mutation({
  args: {
    teamId: v.id("teams"),
    content: v.string(),
    fileStorageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    fileType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await assertTeamMember(ctx, args.teamId, user._id);

    const content = args.content.trim();
    if (!content && !args.fileStorageId) {
      throw new Error("Message content or file attachment required.");
    }
    if (content.length > MAX_CHAT_MESSAGE_LENGTH) {
      throw new Error(`Message must be at most ${MAX_CHAT_MESSAGE_LENGTH} characters`);
    }

    return ctx.db.insert("teamMessages", {
      teamId: args.teamId,
      userId: user._id,
      content,
      fileStorageId: args.fileStorageId,
      fileName: args.fileName,
      fileType: args.fileType,
      createdAt: Date.now(),
    });
  },
});

export const generateUploadUrl = mutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    // Only a team member may mint an upload URL for that team's thread.
    await assertTeamMember(ctx, args.teamId, user._id);
    return ctx.storage.generateUploadUrl();
  },
});

/**
 * The current user's chat-capable teams, with a message count and last activity.
 * Backs the team-chat landing list at `/workspace/chat`.
 */
export const myTeamChat = query({
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
      const event = await ctx.db.get(team.eventId);
      const latest = await ctx.db
        .query("teamMessages")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .collect();
      teams.push({
        teamId: String(team._id),
        teamName: team.name,
        eventId: String(team.eventId),
        eventTitle: event?.title ?? "—",
        messageCount: latest.length,
        lastMessageAt: latest.reduce((acc, msg) => Math.max(acc, msg.createdAt), 0),
      });
    }
    return teams;
  },
});
