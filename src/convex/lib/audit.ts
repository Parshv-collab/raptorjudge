import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { sha256Hex } from "../crypto";
import { auditChainMaterial, AUDIT_GENESIS } from "../../lib/auditChain";

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
  // `order("desc").first()` is the newest row in Convex's own document order,
  // which is the order the verifier walks (`lib/auditChain.ts`).
  const prevHash = prev?.entryHash ?? AUDIT_GENESIS;
  const timestamp = Date.now();
  const beforeState = entry.beforeState ?? "";
  const afterState = entry.afterState ?? "";
  const actorId = entry.actorId ? String(entry.actorId) : "";
  const eventId = entry.eventId ? String(entry.eventId) : "";
  const ipAddress = entry.ipAddress ?? "local";

  // The hashed material is shared with the verifier so the two cannot drift.
  const entryHash = await sha256Hex(
    auditChainMaterial(
      {
        timestamp,
        eventId,
        actorId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        beforeState,
        afterState,
        ipAddress,
      },
      prevHash,
    ),
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
