import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { sha256Hex } from "../crypto";

/**
 * Append-only, tamper-evident audit log (T3).
 *
 * Each entry stores the hash of the previous entry; the entry hash covers the
 * whole chain, so editing or removing any historical entry breaks every hash
 * after it. Verification lives in audit.ts (public query).
 */
export async function appendAudit(
  ctx: MutationCtx,
  entry: {
    eventId?: Id<"events"> | null;
    actorId?: Id<"users"> | null;
    action: string;
    targetType: string;
    targetId: string;
    beforeState?: string;
    afterState?: string;
    ipAddress?: string;
  },
): Promise<void> {
  const prev = await ctx.db.query("auditLogs").order("desc").first();
  const prevHash = prev?.entryHash ?? "GENESIS";
  const timestamp = Date.now();
  const beforeState = entry.beforeState ?? "";
  const afterState = entry.afterState ?? "";
  const actorId = entry.actorId ? String(entry.actorId) : "";
  const eventId = entry.eventId ? String(entry.eventId) : "";
  const ipAddress = entry.ipAddress ?? "local";

  const entryHash = await sha256Hex(
    [prevHash, timestamp, eventId, actorId, entry.action, entry.targetType, entry.targetId, beforeState, afterState, ipAddress].join("|"),
  );

  await ctx.db.insert("auditLogs", {
    eventId: entry.eventId ?? undefined,
    actorId: entry.actorId ?? undefined,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    beforeState,
    afterState,
    ipAddress,
    prevHash,
    entryHash,
    timestamp,
  });
}
