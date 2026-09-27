import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { createAccount, invalidateSessions, modifyAccountCredentials } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { appendAudit } from "./lib/audit";
import { randomHex } from "./crypto";

/**
 * Admin password reset (self-hosted deployments have no mail service, so the
 * recovery path is a human).
 *
 * The credentials themselves live in `@convex-dev/auth`'s `authAccounts` table
 * and only the library can hash a new secret correctly — so this is an **action**
 * that reuses the same `modifyAccountCredentials` call the seed uses, rather
 * than a mutation that pokes at hashes by hand ("never roll your own crypto").
 *
 * Guarantees:
 *  - admin only (checked server-side through the auth identity, not a client flag)
 *  - the temporary password is shown once and never stored in plaintext anywhere
 *  - live sessions are invalidated, so a stolen session cannot outlive the reset
 *  - every reset appends to the hash-chained audit log
 */

const MIN_PASSWORD_LENGTH = 8;

/** Human-friendly temporary password: no ambiguous glyphs, 4×4 chars. */
function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const raw = randomHex(16).replace(/[^0-9a-f]/g, "").padEnd(16, "a").slice(0, 16);
  const chars = raw
    .split("")
    .map((hex) => alphabet[parseInt(hex, 16) % alphabet.length])
    .join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
}

/**
 * Every handler in this module carries an explicit return type: the action
 * below calls `internal.adminReset.*`, and an inferred return type would make
 * this module's type depend on `fullApi`, which depends back on this module — a
 * mutual inference cycle TypeScript degrades to `any`, poisoning every query
 * type in the app. Same reason `seed.seed` is annotated.
 */

/** Resolve the calling admin, or throw. Runs in the action's own deployment. */
export const actorForReset = internalQuery({
  args: {},
  handler: async (ctx): Promise<{ id: Id<"users">; email: string; name: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const actor = await ctx.db.get(userId);
    if (!actor) throw new Error("Unauthenticated");
    if (actor.role !== "admin") throw new Error("Admin required");
    return { id: actor._id, email: actor.email, name: actor.name };
  },
});

export const targetForReset = internalQuery({
  args: { userId: v.id("users") },
  handler: async (
    ctx,
    args,
  ): Promise<{ id: Id<"users">; email: string; name: string; role: string | null }> => {
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");
    return { id: target._id, email: target.email, name: target.name, role: target.role ?? null };
  },
});

export const recordReset = internalMutation({
  args: {
    actorId: v.id("users"),
    userId: v.id("users"),
    email: v.string(),
    generated: v.boolean(),
  },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    await appendAudit(ctx, {
      actorId: args.actorId,
      action: "user.admin_password_reset",
      targetType: "user",
      targetId: String(args.userId),
      afterState: JSON.stringify({
        email: args.email,
        temporary: args.generated,
        sessionsInvalidated: true,
      }),
    });
    return { ok: true };
  },
});

/**
 * Reset a user's password. With no `newPassword`, a temporary one is generated
 * and returned **once**; with one, it must satisfy the 8-character minimum.
 */
export const adminResetPassword = action({
  args: { userId: v.id("users"), newPassword: v.optional(v.string()) },
  handler: async (
    ctx,
    args,
  ): Promise<{
    ok: true;
    email: string;
    name: string;
    validFor: string;
    tempPassword: string;
  }> => {
    const actor = await ctx.runQuery(internal.adminReset.actorForReset, {});
    const target = await ctx.runQuery(internal.adminReset.targetForReset, { userId: args.userId });

    const typed = (args.newPassword ?? "").trim();
    if (typed && typed.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const tempPassword = typed || generateTempPassword();
    const account = { id: target.email, secret: tempPassword };

    try {
      await modifyAccountCredentials(ctx, { provider: "password", account });
    } catch {
      // No password account yet (invited staff, or an account created by another
      // provider): create one, linking it to the existing user by email.
      try {
        await createAccount(ctx, {
          provider: "password",
          account,
          profile: { email: target.email, name: target.name },
          shouldLinkViaEmail: true,
        });
      } catch {
        throw new Error(`Could not reset the password for ${target.email}`);
      }
    }

    // A reset must end existing sessions — otherwise "reset" would not revoke
    // access for whoever already had it.
    await invalidateSessions(ctx, { userId: args.userId });

    await ctx.runMutation(internal.adminReset.recordReset, {
      actorId: actor.id,
      userId: args.userId,
      email: target.email,
      generated: !typed,
    });

    return {
      ok: true,
      email: target.email,
      name: target.name,
      validFor: "This password is shown once — copy it now.",
      tempPassword,
    };
  },
});
