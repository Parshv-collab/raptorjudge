import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireOrganizer, requireUser, type Role } from "./lib/common";

/**
 * Users & RBAC (T1).
 * Self-registration creates participants; judge/organizer accounts are seeded
 * or redeemed via invite codes. Admin can change roles (audited).
 */

export const me = query({
  args: {},
  handler: async (ctx) => {
    // 1) Convex Auth session JWT: `sub = "<users._id>|<sessionId>"`.
    const authUserId = await getAuthUserId(ctx);
    if (authUserId) {
      const byId = await ctx.db.get(authUserId);
      if (byId) return byId;
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // 2) direct tokenIdentifier match (other providers / seeded users).
    const byToken = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (byToken) return byToken;

    if (!identity.email) return null;

    // 3) fall back to matching by email
    const byEmail = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email!))
      .unique();
    if (byEmail) return byEmail;

    // Self-provisioning on first login: the user row is created by Convex Auth
    // sign-up itself, so surface a transient participant view here (queries
    // cannot write). The role lands on the row via auth's profile insert.
    return {
      _id: "" as never,
      _creationTime: 0,
      email: identity.email,
      name: (identity.name ?? identity.email.split("@")[0]) as string,
      role: "participant" as const,
      tokenIdentifier: identity.tokenIdentifier,
    };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireOrganizer(ctx);
    return ctx.db.query("users").collect();
  },
});

/** Set role (admin only) — used by the seed and the admin role manager. */
export const setRole = mutation({
  args: { userId: v.id("users"), role: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");
    const before = target.role;
    await ctx.db.patch(args.userId, { role: args.role as Role });
    return { userId: args.userId, before, after: args.role, actor: actor.email };
  },
});

/** Update own profile (bio / avatar). */
export const updateProfile = mutation({
  args: { bio: v.optional(v.string()), avatarUrl: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await ctx.db.patch(user._id, {
      bio: args.bio ?? user.bio,
      avatarUrl: args.avatarUrl ?? user.avatarUrl,
    });
    return { ok: true };
  },
});
