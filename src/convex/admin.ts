import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser, requireOrganizer, requireUser, ROLES, type Role } from "./lib/common";
import { appendAudit } from "./lib/audit";
import { randomHex } from "./crypto";

/**
 * Platform KV keys that must never leave the server (security).
 *
 * The `platform` table doubles as a secret store, so echoing every row to a
 * client leaked the certificate-signing key (`cert_secret`) — which would let
 * anyone forge a verifiable certificate — plus session hashes, rate-limit
 * counters and per-judge specialisations.
 */
const SECRET_PLATFORM_KEYS = new Set(["cert_secret"]);
const SECRET_PLATFORM_PREFIXES = [
  "session:",
  "ratelimit:",
  "lookup:",
  "invite:",
  "judge_tracks:",
  "rubric_lock:",
];

/**
 * Project `platform` rows down to what may leave the server.
 * Pure and exported so the T5 self-check (`sec.platform_secrets`) can prove the
 * projection against the live table rather than trusting this function by
 * inspection.
 */
export function projectPublicSettings(
  rows: { key: string; value: string }[],
): Record<string, string> {
  const settings: Record<string, string> = {};
  for (const r of rows) {
    if (SECRET_PLATFORM_KEYS.has(r.key)) continue;
    if (SECRET_PLATFORM_PREFIXES.some((p) => r.key.startsWith(p))) continue;
    settings[r.key] = r.value;
  }
  return settings;
}

export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    // Signed-in only: this surfaces deployment-wide configuration.
    await requireUser(ctx);
    const rows = await ctx.db.query("platform").collect();
    return projectPublicSettings(rows);
  },
});

/** Reference data (professions, experience levels…). Signed-in readers only. */
export const listLookups = query({
  args: { type: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const row = await ctx.db
      .query("platform")
      .withIndex("by_key", (q) => q.eq("key", `lookup:${args.type}`))
      .unique();
    if (!row) return [];
    return JSON.parse(row.value) as { id: string; code: string; label: string; active: boolean; sortOrder: number }[];
  },
});

export const createLookup = mutation({
  args: { type: v.string(), code: v.string(), label: v.string(), sortOrder: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    if (actor.role !== "admin") throw new Error("Admin required");
    const key = `lookup:${args.type}`;
    const row = await ctx.db
      .query("platform")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const list = row ? (JSON.parse(row.value) as any[]) : [];
    const newEntry = {
      id: randomHex(8),
      code: args.code,
      label: args.label,
      active: true,
      sortOrder: args.sortOrder ?? list.length + 1,
    };
    list.push(newEntry);
    if (row) {
      await ctx.db.patch(row._id, { value: JSON.stringify(list) });
    } else {
      await ctx.db.insert("platform", { key, value: JSON.stringify(list) });
    }
    return newEntry;
  },
});

export const updateLookup = mutation({
  args: { type: v.string(), id: v.string(), label: v.string(), active: v.boolean(), sortOrder: v.number() },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    if (actor.role !== "admin") throw new Error("Admin required");
    const key = `lookup:${args.type}`;
    const row = await ctx.db
      .query("platform")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!row) throw new Error("Lookup table not found");
    const list = JSON.parse(row.value) as any[];
    const idx = list.findIndex((x) => x.id === args.id);
    if (idx === -1) throw new Error("Lookup entry not found");
    const before = list[idx];
    list[idx] = { ...before, label: args.label, active: args.active, sortOrder: args.sortOrder };
    await ctx.db.patch(row._id, { value: JSON.stringify(list) });
    await appendAudit(ctx, {
      actorId: actor._id,
      action: "admin.lookup_update",
      targetType: "lookup",
      targetId: `${args.type}:${args.id}`,
      beforeState: JSON.stringify(before),
      afterState: JSON.stringify(list[idx]),
    });
    return { ok: true };
  },
});

export const deactivateLookup = mutation({
  args: { type: v.string(), id: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    if (actor.role !== "admin") throw new Error("Admin required");
    const key = `lookup:${args.type}`;
    const row = await ctx.db
      .query("platform")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!row) throw new Error("Lookup table not found");
    const list = JSON.parse(row.value) as any[];
    const idx = list.findIndex((x) => x.id === args.id);
    if (idx !== -1) {
      list[idx].active = !list[idx].active;
      await ctx.db.patch(row._id, { value: JSON.stringify(list) });
    }
    return { ok: true };
  },
});

export const updateSettings = mutation({
  args: { key: v.string(), value: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    if (actor.role !== "admin") throw new Error("Admin required");
    const existing = await ctx.db
      .query("platform")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value });
    } else {
      await ctx.db.insert("platform", { key: args.key, value: args.value });
    }
    await appendAudit(ctx, {
      actorId: actor._id,
      action: "platform.update_settings",
      targetType: "setting",
      targetId: args.key,
      afterState: args.value,
    });
    return { ok: true };
  },
});

import { sha256Hex } from "./crypto";

/**
 * Per-role invite lifetimes (issue 24). Admin invites are the most powerful
 * (and most dangerous), so they expire fastest; judge/participant invites last
 * a week, which is the usual registration-window length.
 */
export const INVITE_TTL_MS: Record<string, number> = {
  admin: 2 * 24 * 60 * 60 * 1000,
  organizer: 5 * 24 * 60 * 60 * 1000,
  judge: 7 * 24 * 60 * 60 * 1000,
  participant: 7 * 24 * 60 * 60 * 1000,
};

export const listInvites = query({
  args: {},
  handler: async (ctx) => {
    await requireOrganizer(ctx);
    const invites = await ctx.db.query("invites").collect();
    const users = await ctx.db.query("users").collect();
    const now = Date.now();
    // Issue 24: expired-but-unused invites stay listed (with `expired: true`)
    // so an admin can see them and regenerate, instead of silently vanishing.
    return invites
      .filter((inv) => !inv.usedAt && !inv.revokedAt)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((inv) => {
        const creator = users.find((u) => u._id === inv.createdBy);
        return {
          id: String(inv._id),
          email: inv.email ?? "—",
          role: inv.role,
          createdBy: creator?.email ?? "—",
          createdAt: inv.createdAt,
          expiresAt: inv.expiresAt,
          expired: now >= inv.expiresAt,
        };
      });
  },
});

export const createInvite = mutation({
  args: { email: v.optional(v.string()), role: v.string(), eventId: v.optional(v.id("events")) },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    if (actor.role !== "admin" && actor.role !== "organizer") throw new Error("Unauthorized");
    const token = randomHex(32);
    const tokenHash = await sha256Hex(token);
    const now = Date.now();
    // Issue 24: TTL is per role — admin 2d, organizer 5d, judge/participant 7d.
    const ttl = INVITE_TTL_MS[args.role] ?? 7 * 24 * 60 * 60 * 1000;
    const expiresAt = now + ttl;

    const id = await ctx.db.insert("invites", {
      email: args.email,
      role: args.role,
      eventId: args.eventId,
      tokenHash,
      createdBy: actor._id,
      createdAt: now,
      expiresAt,
    });

    await appendAudit(ctx, {
      actorId: actor._id,
      action: "invite.create",
      targetType: "invite",
      targetId: String(id),
      afterState: JSON.stringify({ email: args.email, role: args.role, ttlDays: ttl / 86_400_000 }),
    });

    const url = `/invite/${token}`;
    return { id: String(id), token, url, expiresAt };
  },
});

/**
 * Reissue an expired (or about-to-expire) invite: the old token is revoked and
 * a fresh one is minted with the same recipient, role and event (issue 24).
 * One audited mutation, so the revocation and reissue can never drift apart.
 */
export const regenerateInvite = mutation({
  args: { inviteId: v.id("invites") },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    if (actor.role !== "admin" && actor.role !== "organizer") throw new Error("Unauthorized");
    const previous = await ctx.db.get(args.inviteId);
    if (!previous) throw new Error("Invite not found");
    if (previous.usedAt) throw new Error("This invite has already been used");
    if (!previous.revokedAt) {
      await ctx.db.patch(previous._id, { revokedAt: Date.now() });
    }

    const token = randomHex(32);
    const tokenHash = await sha256Hex(token);
    const now = Date.now();
    const ttl = INVITE_TTL_MS[previous.role] ?? 7 * 24 * 60 * 60 * 1000;
    const id = await ctx.db.insert("invites", {
      email: previous.email,
      role: previous.role,
      eventId: previous.eventId,
      tokenHash,
      createdBy: actor._id,
      createdAt: now,
      expiresAt: now + ttl,
    });

    await appendAudit(ctx, {
      actorId: actor._id,
      action: "invite.regenerate",
      targetType: "invite",
      targetId: String(id),
      beforeState: JSON.stringify({ replacedId: String(previous._id), role: previous.role }),
      afterState: JSON.stringify({ email: previous.email, role: previous.role, ttlDays: ttl / 86_400_000 }),
    });

    return { id: String(id), token, url: `/invite/${token}`, expiresAt: now + ttl };
  },
});

export const revokeInvite = mutation({
  args: { inviteId: v.id("invites") },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    const existing = await ctx.db.get(args.inviteId);
    if (existing) {
      await ctx.db.patch(args.inviteId, { revokedAt: Date.now() });
    }
    await appendAudit(ctx, {
      actorId: actor._id,
      action: "invite.revoke",
      targetType: "invite",
      targetId: String(args.inviteId),
    });
    return { ok: true };
  },
});

export const getInviteByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const tokenHash = await sha256Hex(args.token);
    const inv = await ctx.db
      .query("invites")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!inv || inv.usedAt || inv.revokedAt || Date.now() > inv.expiresAt) {
      return null;
    }
    return {
      id: String(inv._id),
      email: inv.email ?? "",
      role: inv.role,
      eventId: inv.eventId ? String(inv.eventId) : null,
      expiresAt: inv.expiresAt,
    };
  },
});

/**
 * Redeem a staff invitation: grant the invited role to the signed-in caller.
 *
 * This is the *only* way a non-organizer can gain a privileged role, so the
 * checks matter more than the happy path:
 *
 *  - the token must be valid, unused, unrevoked and unexpired;
 *  - the caller must be signed in — the role is attached to a real identity, so
 *    it is called *after* sign-up, not before;
 *  - when the invite names an email, only that address may claim it (a leaked
 *    token is useless to anyone else);
 *  - the invited role must be one of the known roles, never free text from the
 *    invite row;
 *  - marking the invite used and granting the role happen in one transaction, so
 *    an invite can never be burnt without granting the role it carried.
 *
 * The role is applied server-side; the client cannot choose it.
 */
export const acceptInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const tokenHash = await sha256Hex(args.token);
    const inv = await ctx.db
      .query("invites")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!inv || inv.usedAt || inv.revokedAt || Date.now() > inv.expiresAt) {
      throw new Error("Invalid or expired invite token");
    }

    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("Create your account or sign in before accepting this invite");
    }
    if (inv.email && inv.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      throw new Error("This invite was issued to a different email address");
    }
    const role = inv.role as Role;
    if (!ROLES.includes(role)) {
      throw new Error("This invite carries an unknown role");
    }

    await ctx.db.patch(user._id, { role });
    await ctx.db.patch(inv._id, { usedAt: Date.now() });
    await appendAudit(ctx, {
      eventId: inv.eventId,
      actorId: user._id,
      action: "invite.accept",
      targetType: "user",
      targetId: String(user._id),
      afterState: JSON.stringify({ role, inviteId: String(inv._id) }),
    });

    return {
      ok: true,
      email: inv.email ?? user.email,
      role,
      eventId: inv.eventId ?? null,
    };
  },
});

export const reassignJudge = mutation({
  args: { assignmentId: v.id("judgeAssignments"), newJudgeId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    if (actor.role !== "admin" && actor.role !== "organizer") throw new Error("Unauthorized");
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) throw new Error("Assignment not found");
    const targetJudge = await ctx.db.get(args.newJudgeId);
    if (!targetJudge || targetJudge.role !== "judge") throw new Error("Invalid target judge");

    await ctx.db.patch(args.assignmentId, {
      judgeId: args.newJudgeId,
      status: "assigned",
    });

    await appendAudit(ctx, {
      eventId: assignment.eventId,
      actorId: actor._id,
      action: "judging.reassign",
      targetType: "assignment",
      targetId: String(args.assignmentId),
      beforeState: JSON.stringify({ oldJudgeId: assignment.judgeId }),
      afterState: JSON.stringify({ newJudgeId: args.newJudgeId }),
    });

    return { ok: true };
  },
});

export const listAllAssignments = query({
  args: {},
  handler: async (ctx) => {
    await requireOrganizer(ctx);
    const assignments = await ctx.db.query("judgeAssignments").collect();
    const events = await ctx.db.query("events").collect();
    const users = await ctx.db.query("users").collect();
    const subs = await ctx.db.query("submissions").collect();

    return assignments.map((a) => {
      const event = events.find((e) => e._id === a.eventId);
      const judge = users.find((u) => u._id === a.judgeId);
      const sub = subs.find((s) => s._id === a.submissionId);

      return {
        assignmentId: String(a._id),
        eventId: String(a.eventId),
        eventTitle: event?.title ?? "—",
        judgeId: String(a.judgeId),
        judgeName: judge?.name ?? "—",
        judgeEmail: judge?.email ?? "—",
        submissionId: String(a.submissionId),
        projectTitle: sub?.title ?? "—",
        status: a.status,
        assignedAt: a.assignedAt,
      };
    });
  },
});
