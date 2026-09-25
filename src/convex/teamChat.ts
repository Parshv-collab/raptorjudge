import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/common";

/** Team Chat & File Sharing (Private to Team Members Only) */

export const listMessages = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    // Verify caller is a member of this team or staff
    const members = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    const isMember = members.some((m) => m.userId === user._id);
    const isStaff = user.role === "admin" || user.role === "organizer";

    if (!isMember && !isStaff) {
      throw new Error("Forbidden: Team chat is private to team members only.");
    }

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

    // Enforce team membership
    const members = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    const isMember = members.some((m) => m.userId === user._id);
    const isStaff = user.role === "admin" || user.role === "organizer";

    if (!isMember && !isStaff) {
      throw new Error("Forbidden: Team chat is private to team members only.");
    }

    const content = args.content.trim();
    if (!content && !args.fileStorageId) {
      throw new Error("Message content or file attachment required.");
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
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return ctx.storage.generateUploadUrl();
  },
});
