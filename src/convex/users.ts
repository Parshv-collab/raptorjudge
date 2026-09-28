import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser, requireOrganizer, requireUser, type Role } from "./lib/common";
import { assertRoleChangeAllowed } from "./lib/rbac";
import { appendAudit } from "./lib/audit";

/**
 * Users & RBAC (T1).
 * Self-registration creates participants; judge/organizer accounts are seeded
 * or redeemed via invite codes. Admin can change roles (audited).
 */

export const me = query({
  args: {},
  handler: async (ctx) => {
    const authUserId = await getAuthUserId(ctx);
    if (authUserId) {
      const byId = await ctx.db.get(authUserId);
      if (byId && byId.role !== undefined) return byId;
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const byToken = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (byToken && byToken.role !== undefined) return byToken;

    if (!identity.email) return null;

    const byEmail = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email!))
      .unique();
    if (byEmail && byEmail.role !== undefined) return byEmail;

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

/**
 * The caller's avatar as a displayable URL (issue 38).
 *
 * `users.avatarUrl` stores a Convex storage id (or, for legacy rows, an http
 * URL). Rendering the raw id in an `<img>` produces a broken image, which is
 * exactly what the sidebar did — it had no avatar at all. Resolving the id to
 * a signed storage URL here means every surface (profile, sidebar, chat) shows
 * the same picture with one server round trip.
 */
export const myAvatarUrl = query({
  args: {},
  handler: async (ctx): Promise<string | null> => {
    const user = await getCurrentUser(ctx);
    if (!user?.avatarUrl) return null;
    if (/^https?:/i.test(user.avatarUrl)) return user.avatarUrl;
    try {
      return await ctx.storage.getUrl(user.avatarUrl as Id<"_storage">);
    } catch {
      return null;
    }
  },
});

export const setRole = mutation({
  args: { userId: v.id("users"), role: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");

    await assertRoleChangeAllowed(ctx, {
      actorRole: actor.role ?? "participant",
      targetUserId: args.userId,
      currentRole: target.role,
      nextRole: args.role,
    });

    const before = target.role;
    await ctx.db.patch(args.userId, { role: args.role as Role });
    await appendAudit(ctx, {
      actorId: actor._id,
      action: "user.role_change",
      targetType: "user",
      targetId: String(args.userId),
      beforeState: JSON.stringify({ role: before ?? null, email: target.email }),
      afterState: JSON.stringify({ role: args.role }),
    });
    return { userId: args.userId, before, after: args.role, actor: actor.email };
  },
});

import { internalQuery } from "./_generated/server";

export const isUserDisabled = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return false;
    // Only an explicit admin disable counts. `role === undefined` is the normal
    // state of a fresh self-registered account (roles are granted by invite,
    // seed or an admin) — treating it as "disabled" used to reject every
    // sign-up's first re-login with ACCOUNT_DISABLED.
    return user.disabledAt !== undefined || user.disabled_at !== undefined;
  },
});

export const adminDisable = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    if (actor.role !== "admin") throw new Error("Admin required");
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");
    const now = Date.now();
    await ctx.db.patch(args.userId, { role: undefined, disabledAt: now, disabled_at: now });
    await appendAudit(ctx, {
      actorId: actor._id,
      action: "user.admin_disable",
      targetType: "user",
      targetId: String(args.userId),
      beforeState: JSON.stringify({ email: target.email, role: target.role }),
      afterState: "disabled",
    });
    return { ok: true };
  },
});

export const adminEnable = mutation({
  args: { userId: v.id("users"), role: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    if (actor.role !== "admin") throw new Error("Admin required");
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");
    const newRole = (args.role as Role) ?? "participant";
    await ctx.db.patch(args.userId, { role: newRole, disabledAt: undefined, disabled_at: undefined });
    await appendAudit(ctx, {
      actorId: actor._id,
      action: "user.admin_enable",
      targetType: "user",
      targetId: String(args.userId),
      beforeState: JSON.stringify({ email: target.email, role: target.role }),
      afterState: JSON.stringify({ role: newRole }),
    });
    return { ok: true };
  },
});

export const adminForceLogout = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    if (actor.role !== "admin") throw new Error("Admin required");
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");
    await ctx.db.patch(args.userId, { tokenIdentifier: undefined });
    await appendAudit(ctx, {
      actorId: actor._id,
      action: "user.admin_force_logout",
      targetType: "user",
      targetId: String(args.userId),
      afterState: "tokens_invalidated",
    });
    return { ok: true };
  },
});

export const adminDelete = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    if (actor.role !== "admin") throw new Error("Admin required");
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");
    await ctx.db.delete(args.userId);
    await appendAudit(ctx, {
      actorId: actor._id,
      action: "user.admin_delete",
      targetType: "user",
      targetId: String(args.userId),
      beforeState: JSON.stringify({ email: target.email }),
      afterState: "deleted",
    });
    return { ok: true };
  },
});

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

/** Delete / disable own account (GDPR consent withdrawal). */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await ctx.db.patch(user._id, {
      role: undefined,
      tokenIdentifier: undefined,
      bio: "Account scheduled for deletion",
    });
    await appendAudit(ctx, {
      actorId: user._id,
      action: "user.delete",
      targetType: "user",
      targetId: String(user._id),
      beforeState: JSON.stringify({ email: user.email, role: user.role }),
      afterState: "deleted",
    });
    return { ok: true };
  },
});
