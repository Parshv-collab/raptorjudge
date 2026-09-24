import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOrganizer } from "./lib/common";
import { appendAudit } from "./lib/audit";
import { randomHex } from "./crypto";

export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("platform").collect();
    const settings: Record<string, string> = {};
    for (const r of rows) {
      if (!r.key.startsWith("lookup:") && !r.key.startsWith("invite:")) {
        settings[r.key] = r.value;
      }
    }
    return settings;
  },
});

export const listLookups = query({
  args: { type: v.string() },
  handler: async (ctx, args) => {
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
    if (idx !== -1) {
      list[idx] = { ...list[idx], label: args.label, active: args.active, sortOrder: args.sortOrder };
      await ctx.db.patch(row._id, { value: JSON.stringify(list) });
    }
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

export const listInvites = query({
  args: {},
  handler: async (ctx) => {
    await requireOrganizer(ctx);
    const invites = await ctx.db.query("invites").collect();
    const users = await ctx.db.query("users").collect();
    return invites
      .filter((inv) => !inv.usedAt && !inv.revokedAt && Date.now() < inv.expiresAt)
      .map((inv) => {
        const creator = users.find((u) => u._id === inv.createdBy);
        return {
          id: String(inv._id),
          email: inv.email ?? "—",
          role: inv.role,
          createdBy: creator?.email ?? "—",
          createdAt: inv.createdAt,
          expiresAt: inv.expiresAt,
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
    const ttl = args.role === "admin" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
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
      afterState: JSON.stringify({ email: args.email, role: args.role }),
    });

    const url = `/invite/${token}`;
    return { id: String(id), token, url };
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
    };
  },
});

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
    await ctx.db.patch(inv._id, { usedAt: Date.now() });
    return {
      email: inv.email,
      role: inv.role,
      eventId: inv.eventId,
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
