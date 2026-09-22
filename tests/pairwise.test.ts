import { describe, it, expect } from "vitest";
import { bradleyTerry, nextMatch, type PairwiseMatchRecord } from "../src/lib/algorithms/pairwise";

describe("bradleyTerry", () => {
  it("recovers a consistent transitive ordering", () => {
    const matches: PairwiseMatchRecord[] = [
      { submissionAId: "a", submissionBId: "b", winnerId: "a" },
      { submissionAId: "b", submissionBId: "c", winnerId: "b" },
      { submissionAId: "a", submissionBId: "c", winnerId: "a" },
    ];
    const r = bradleyTerry(matches, ["a", "b", "c"]);
    expect(r.converged).toBe(true);
    expect(r.ranking.map((x) => x.submissionId)).toEqual(["a", "b", "c"]);
    expect(r.ratings.a).toBeGreaterThan(r.ratings.b);
    expect(r.ratings.b).toBeGreaterThan(r.ratings.c);
  });

  it("keeps an undefeated item finite via the gamma prior", () => {
    const matches: PairwiseMatchRecord[] = [
      { submissionAId: "a", submissionBId: "b", winnerId: "a" },
    ];
    const r = bradleyTerry(matches, ["a", "b"]);
    expect(Number.isFinite(r.ratings.a)).toBe(true);
    expect(r.ratings.a).toBeGreaterThan(r.ratings.b);
    expect(r.ranking[0].submissionId).toBe("a");
  });

  it("counts a tie as half a win for each side and rates them equally", () => {
    const matches: PairwiseMatchRecord[] = [
      { submissionAId: "a", submissionBId: "b", winnerId: null },
    ];
    const r = bradleyTerry(matches, ["a", "b"]);
    const a = r.ranking.find((x) => x.submissionId === "a")!;
    const b = r.ranking.find((x) => x.submissionId === "b")!;
    expect(a.wins).toBe(0.5);
    expect(b.wins).toBe(0.5);
    // MM iterates items sequentially, so symmetric ties converge to (near) equal
    // strengths rather than bit-identical ones.
    expect(r.ratings.a).toBeCloseTo(r.ratings.b, 3);
  });

  it("tracks the number of matches on each side", () => {
    const matches: PairwiseMatchRecord[] = [
      { submissionAId: "a", submissionBId: "b", winnerId: "a" },
      { submissionAId: "b", submissionBId: "a", winnerId: "b" },
    ];
    const r = bradleyTerry(matches, ["a", "b"]);
    expect(r.ranking.find((x) => x.submissionId === "a")!.matches).toBe(2);
    expect(r.ranking.find((x) => x.submissionId === "b")!.matches).toBe(2);
  });

  it("is deterministic for the same inputs", () => {
    const matches: PairwiseMatchRecord[] = [
      { submissionAId: "a", submissionBId: "b", winnerId: "a" },
      { submissionAId: "a", submissionBId: "c", winnerId: "c" },
      { submissionAId: "b", submissionBId: "c", winnerId: "b" },
    ];
    const r1 = bradleyTerry(matches, ["a", "b", "c"]);
    const r2 = bradleyTerry(matches, ["a", "b", "c"]);
    expect(r1.ratings).toEqual(r2.ratings);
    expect(r1.iterations).toBe(r2.iterations);
  });

  it("ignores matches that reference unknown items", () => {
    const matches: PairwiseMatchRecord[] = [
      { submissionAId: "a", submissionBId: "ghost", winnerId: "ghost" },
      { submissionAId: "a", submissionBId: "b", winnerId: "a" },
    ];
    const r = bradleyTerry(matches, ["a", "b"]);
    expect(r.ranking).toHaveLength(2);
    expect(r.ranking.find((x) => x.submissionId === "a")!.matches).toBe(1);
  });
});

describe("nextMatch", () => {
  it("returns null with fewer than two items", () => {
    expect(nextMatch(["solo"], [], { solo: 1 })).toBeNull();
  });

  it("prefers a fresh pairing over a frequently repeated one", () => {
    const repeated: PairwiseMatchRecord[] = Array.from({ length: 3 }, () => ({
      submissionAId: "a",
      submissionBId: "b",
      winnerId: "a",
    }));
    const ratings = { a: 1, b: 1, c: 1 };
    const m = nextMatch(["a", "b", "c"], repeated, ratings);
    expect(m).not.toBeNull();
    expect([m!.a, m!.b].sort().join("")).not.toBe("ab");
  });

  it("respects an explicit exclusion", () => {
    const ratings = { a: 1, b: 1, c: 1 };
    const m = nextMatch(["a", "b", "c"], [], ratings, { a: "a", b: "b" });
    expect(m).not.toBeNull();
    expect([m!.a, m!.b].sort().join("")).not.toBe("ab");
  });
});
