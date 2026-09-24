import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOrganizer } from "./lib/common";
import { appendAudit } from "./lib/audit";
import { randomHex } from "./crypto";

export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    await requireOrganizer(ctx);
    const rows = await ctx.db.query("platform").collect();
    const settings: Record<string, string> = {};
    for (const r of rows) {
      settings[r.key] = r.value;
    }
    return settings;
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

export const listInvites = query({
  args: {},
  handler: async (ctx) => {
    await requireOrganizer(ctx);
    const rows = await ctx.db.query("platform").collect();
    const invites = rows
      .filter((r) => r.key.startsWith("invite:"))
      .map((r) => {
        const val = JSON.parse(r.value);
        return {
          code: r.key.replace("invite:", ""),
          ...val,
        };
      });
    return invites;
  },
});

export const createInvite = mutation({
  args: { email: v.string(), role: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    if (actor.role !== "admin" && actor.role !== "organizer") throw new Error("Unauthorized");
    const code = randomHex(8);
    const inviteData = {
      email: args.email,
      role: args.role,
      createdBy: actor.email,
      createdAt: Date.now(),
      status: "pending",
    };
    await ctx.db.insert("platform", {
      key: `invite:${code}`,
      value: JSON.stringify(inviteData),
    });
    await appendAudit(ctx, {
      actorId: actor._id,
      action: "invite.create",
      targetType: "invite",
      targetId: code,
      afterState: JSON.stringify(inviteData),
    });
    return { code, ...inviteData };
  },
});

export const revokeInvite = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    const existing = await ctx.db
      .query("platform")
      .withIndex("by_key", (q) => q.eq("key", `invite:${args.code}`))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    await appendAudit(ctx, {
      actorId: actor._id,
      action: "invite.revoke",
      targetType: "invite",
      targetId: args.code,
    });
    return { ok: true };
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
