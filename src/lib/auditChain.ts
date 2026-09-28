/**
 * Hash-chain ordering + verification for the audit log (T3).
 *
 * `appendAudit` links each new entry to the newest row that exists at write time
 * — Convex's own document order (`_creationTime`, then `_id`) — so the chain can
 * only be walked in that same order.
 *
 * This module exists because of a real bug: the two verifiers sorted rows by the
 * wall-clock `timestamp` field with a `localeCompare` tie-break. Entries share a
 * millisecond constantly (the fixture seed writes ~130 entries in a few
 * milliseconds; a vote burst writes several in the same tick), and among rows
 * with an identical timestamp that tie-break does not match the order the chain
 * was linked in, so an intact log was reported as tampered. Keeping the order
 * rule, the hashed material and the walk in one place is what stops the writer
 * and the verifier from drifting apart again.
 *
 * Pure and dependency-free (the hash is injected) so it is unit-tested directly.
 */

/** The `prevHash` of the first entry in the chain. */
export const AUDIT_GENESIS = "GENESIS";

/** The fields an audit entry contributes to its own hash. */
export interface AuditChainFields {
  timestamp: number;
  eventId?: string | null;
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  beforeState: string;
  afterState: string;
  ipAddress: string;
}

/** A stored entry: its chain fields plus where it sits in the log. */
export interface AuditChainRow extends AuditChainFields {
  _id: string;
  _creationTime: number;
  prevHash: string;
  entryHash: string;
}

export interface AuditChainVerdict {
  valid: boolean;
  entries: number;
  brokenAt: string | null;
  /** Which check failed, for an operator reading the report. */
  reason: string | null;
}

/** Codepoint comparison — Convex orders ids this way, and ids are ASCII. */
function compareId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Put rows back into the order the chain was linked in: creation time, then id.
 *
 * Never sort by `timestamp` — see the module comment. A missing or non-finite
 * `_creationTime` is treated as 0 rather than left to produce a `NaN`
 * comparator, which would make the sort order arbitrary and the walk lie.
 */
export function auditChainOrder<T extends { _creationTime: number; _id: string }>(
  rows: readonly T[],
): T[] {
  const at = (row: { _creationTime: number }) =>
    Number.isFinite(row._creationTime) ? row._creationTime : 0;
  return [...rows].sort((a, b) => at(a) - at(b) || compareId(String(a._id), String(b._id)));
}

/**
 * The exact string an entry hash is computed over.
 *
 * Shared by the writer (`appendAudit`) and the verifier, so a change to the
 * hashed material can never silently invalidate every previously written entry.
 */
export function auditChainMaterial(row: AuditChainFields, prevHash: string): string {
  return [
    prevHash,
    row.timestamp,
    row.eventId ?? "",
    row.actorId ?? "",
    row.action,
    row.targetType,
    row.targetId,
    row.beforeState,
    row.afterState,
    row.ipAddress,
  ].join("|");
}

/**
 * Walk the whole chain: every link must point at the previous entry, and every
 * entry hash must recompute. Stops at the first broken entry.
 *
 * @param rows every stored entry, in any order
 * @param hash the digest function the chain was written with (injected so this
 *             stays pure and testable)
 */
export async function verifyAuditChain(
  rows: readonly AuditChainRow[],
  hash: (value: string) => Promise<string>,
): Promise<AuditChainVerdict> {
  const ordered = auditChainOrder(rows);
  let prevHash = AUDIT_GENESIS;

  for (const row of ordered) {
    if (row.prevHash !== prevHash) {
      return {
        valid: false,
        entries: ordered.length,
        brokenAt: String(row._id),
        reason: `broken link: entry points at ${row.prevHash.slice(0, 12)}…, chain expects ${prevHash.slice(0, 12)}…`,
      };
    }
    const recomputed = await hash(auditChainMaterial(row, prevHash));
    if (recomputed !== row.entryHash) {
      return {
        valid: false,
        entries: ordered.length,
        brokenAt: String(row._id),
        reason: "entry contents do not match the stored hash",
      };
    }
    prevHash = row.entryHash;
  }

  return { valid: true, entries: ordered.length, brokenAt: null, reason: null };
}
