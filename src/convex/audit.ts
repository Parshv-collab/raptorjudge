import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireOrganizer, requireUser } from "./lib/common";
import { sha256Hex } from "./crypto";

/**
 * Audit log API (T3). Append-only; this module can only read and verify.
 * Chain verification recomputes each entry hash and walks prevHash links.
 */

export const list = query({
  args: {
    eventId: v.optional(v.id("events")),
    action: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx);
    let rows = await ctx.db.query("auditLogs").collect();
    if (args.eventId) rows = rows.filter((r) => String(r.eventId ?? "") === String(args.eventId));
    if (args.action) rows = rows.filter((r) => r.action === args.action);
    rows.sort((a, b) => b.timestamp - a.timestamp);
    const limited = rows.slice(0, args.limit ?? 100);
    const users = await ctx.db.query("users").collect();
    return limited.map((r) => ({
      id: String(r._id),
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      beforeState: r.beforeState,
      afterState: r.afterState,
      actorEmail: users.find((u) => String(u._id) === String(r.actorId ?? ""))?.email ?? "system",
      timestamp: r.timestamp,
      entryHash: r.entryHash,
      prevHash: r.prevHash,
    }));
  },
});

/** Verify the whole hash chain (tamper evidence). */
export const verifyChain = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("auditLogs").collect();
    rows.sort((a, b) => a.timestamp - b.timestamp || String(a._id).localeCompare(String(b._id)));
    let prevHash = "GENESIS";
    let valid = true;
    let brokenAt: string | null = null;
    for (const r of rows) {
      const recomputed = await sha256Hex(
        [prevHash, r.timestamp, r.eventId ?? "", r.actorId ?? "", r.action, r.targetType, r.targetId, r.beforeState, r.afterState, r.ipAddress].join("|"),
      );
      if (r.prevHash !== prevHash || recomputed !== r.entryHash) {
        valid = false;
        brokenAt = String(r._id);
        break;
      }
      prevHash = r.entryHash;
    }
    return { valid, entries: rows.length, brokenAt };
  },
});

export const actions = query({
  args: {},
  handler: async (ctx) => {
    await requireOrganizer(ctx);
    const rows = await ctx.db.query("auditLogs").collect();
    return [...new Set(rows.map((r) => r.action))].sort();
  },
});
