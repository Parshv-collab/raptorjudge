import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AUDIT_GENESIS,
  auditChainMaterial,
  auditChainOrder,
  verifyAuditChain,
  type AuditChainRow,
} from "../src/lib/auditChain";

/** The digest the Convex layer uses (SHA-256 hex), injected for the walk. */
const hash = async (value: string) => createHash("sha256").update(value).digest("hex");

interface EntrySeed {
  id: string;
  creationTime: number;
  /** Wall-clock timestamp written into the entry (millisecond resolution). */
  timestamp: number;
  action: string;
  afterState?: string;
}

/**
 * Build a chain the way `appendAudit` does: each entry links to the newest entry
 * that existed when it was written (creation order), not to the largest
 * timestamp.
 */
async function buildChain(seeds: EntrySeed[]): Promise<AuditChainRow[]> {
  // Keep every field: the projection below is what decides the link order, and
  // dropping fields here is exactly the bug this suite exists to catch.
  const ordered = auditChainOrder(
    seeds.map((s) => ({
      _id: s.id,
      _creationTime: s.creationTime,
      timestamp: s.timestamp,
      action: s.action,
      afterState: s.afterState ?? "",
    })),
  );
  const rows: AuditChainRow[] = [];
  let prevHash = AUDIT_GENESIS;
  for (const seed of ordered) {
    const row: AuditChainRow = {
      _id: seed._id,
      _creationTime: seed._creationTime,
      timestamp: seed.timestamp,
      eventId: null,
      actorId: null,
      action: seed.action,
      targetType: "submission",
      targetId: seed._id,
      beforeState: "",
      afterState: seed.afterState,
      ipAddress: "local",
      prevHash,
      entryHash: "",
    };
    row.entryHash = await hash(auditChainMaterial(row, prevHash));
    rows.push(row);
    prevHash = row.entryHash;
  }
  return rows;
}

/**
 * A log where every entry carries the SAME millisecond timestamp — which the
 * fixture seed and a vote burst both produce — and whose ids deliberately do not
 * sort into creation order.
 */
const tiedSeeds: EntrySeed[] = [
  { id: "z9", creationTime: 1_000, timestamp: 5_000, action: "a" },
  { id: "m4", creationTime: 1_000, timestamp: 5_000, action: "b" },
  { id: "a1", creationTime: 1_000, timestamp: 5_000, action: "c" },
  { id: "q7", creationTime: 1_002, timestamp: 5_000, action: "d" },
];

describe("auditChainOrder", () => {
  it("orders by creation time, then id — never by the timestamp field", () => {
    const ordered = auditChainOrder([
      { _id: "b", _creationTime: 2 },
      { _id: "a", _creationTime: 1 },
      { _id: "c", _creationTime: 1 },
    ]);
    expect(ordered.map((r) => r._id)).toEqual(["a", "c", "b"]);
  });

  it("does not mutate the caller's array", () => {
    const rows = [{ _id: "b", _creationTime: 2 }, { _id: "a", _creationTime: 1 }];
    auditChainOrder(rows);
    expect(rows.map((r) => r._id)).toEqual(["b", "a"]);
  });
});

describe("verifyAuditChain", () => {
  it("verifies a chain whose entries share a millisecond timestamp", async () => {
    const chain = await buildChain(tiedSeeds);
    const verdict = await verifyAuditChain(chain, hash);
    expect(verdict).toEqual({ valid: true, entries: 4, brokenAt: null, reason: null });
  });

  it("verifies regardless of the order rows come back in", async () => {
    const chain = await buildChain(tiedSeeds);
    const shuffled = [chain[2], chain[0], chain[3], chain[1]];
    const verdict = await verifyAuditChain(shuffled, hash);
    expect(verdict.valid).toBe(true);
  });

  it("still reports a tampered entry, and names it", async () => {
    const chain = await buildChain(tiedSeeds);
    const tampered = chain.map((row) =>
      row._id === "m4" ? { ...row, afterState: "edited after the fact" } : row,
    );
    const verdict = await verifyAuditChain(tampered, hash);
    expect(verdict.valid).toBe(false);
    expect(verdict.brokenAt).toBe("m4");
    expect(verdict.reason).toContain("do not match the stored hash");
  });

  it("reports the entry after a deleted one as the broken link", async () => {
    const chain = await buildChain(tiedSeeds);
    // Link order is creation time then id: a1 → m4 → z9 → q7. Dropping m4
    // leaves z9 pointing at an entry that is no longer in the log.
    expect(chain.map((row) => row._id)).toEqual(["a1", "m4", "z9", "q7"]);
    const withGap = chain.filter((row) => row._id !== "m4");
    const verdict = await verifyAuditChain(withGap, hash);
    expect(verdict.valid).toBe(false);
    expect(verdict.brokenAt).toBe("z9");
    expect(verdict.reason).toContain("broken link");
  });

  it("verifies an empty log and a single-entry log", async () => {
    expect(await verifyAuditChain([], hash)).toEqual({
      valid: true,
      entries: 0,
      brokenAt: null,
      reason: null,
    });
    const one = await buildChain([tiedSeeds[0]]);
    expect((await verifyAuditChain(one, hash)).valid).toBe(true);
  });
});
