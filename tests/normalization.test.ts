import { describe, it, expect } from "vitest";
import {
  normalizeScores,
  spearmanRho,
  type JudgeScoreSet,
} from "../src/lib/algorithms/normalization";

describe("spearmanRho", () => {
  it("is 1 for monotonically identical rankings", () => {
    const a = new Map([
      ["x", 3],
      ["y", 2],
      ["z", 1],
    ]);
    const b = new Map([
      ["x", 30],
      ["y", 20],
      ["z", 10],
    ]);
    expect(spearmanRho(a, b)).toBeCloseTo(1, 10);
  });

  it("is -1 for a reversed ranking", () => {
    const a = new Map([
      ["x", 3],
      ["y", 2],
      ["z", 1],
    ]);
    const b = new Map([
      ["x", 1],
      ["y", 2],
      ["z", 3],
    ]);
    expect(spearmanRho(a, b)).toBeCloseTo(-1, 10);
  });

  it("returns 0 when fewer than two ids overlap", () => {
    expect(spearmanRho(new Map([["x", 1]]), new Map([["x", 1]]))).toBe(0);
  });
});

describe("normalizeScores", () => {
  // Dr. Strict is low-variance and harsh; Prof. Generous is high and tight.
  const judges: JudgeScoreSet[] = [
    { judgeId: "strict", scores: { s1: 2, s2: 4, s3: 6 } }, // mean 4, sigma 2
    { judgeId: "lenient", scores: { s1: 8, s2: 9, s3: 10 } }, // mean 9, sigma 1
  ];

  it("standardizes each judge so the proof metrics vanish", () => {
    const r = normalizeScores(judges);
    expect(r.proof.maxJudgeMeanZ).toBeLessThan(1e-9);
    expect(r.proof.maxJudgeSigmaZ).toBeLessThan(1e-9);
  });

  it("rescales z-scores onto the target distribution N(75, 12^2)", () => {
    const r = normalizeScores(judges, { targetMean: 75, targetSigma: 12 });
    const z = (id: string) => r.submissions.find((s) => s.submissionId === id)!.zNormalized;
    // Both judges give their own minimum to s1 (z = -1) → 75 - 12.
    expect(z("s1")).toBeCloseTo(63, 6);
    expect(z("s2")).toBeCloseTo(75, 6);
    expect(z("s3")).toBeCloseTo(87, 6);
  });

  it("orders submissions by normalized score, strongest first", () => {
    const r = normalizeScores(judges);
    expect(r.submissions.map((s) => s.submissionId)).toEqual(["s3", "s2", "s1"]);
  });

  it("reports a calibration entry per judge and a rank delta per submission", () => {
    const r = normalizeScores(judges);
    expect(r.judgeCalibrations).toHaveLength(2);
    expect(r.rankDeltas).toHaveLength(3);
    expect(r.judgeCalibrations.map((j) => j.judgeId).sort()).toEqual(["lenient", "strict"]);
  });

  it("agrees with min-max scaling when rankings are consistent", () => {
    const r = normalizeScores(judges);
    expect(r.proof.methodAgreementRho).toBeCloseTo(1, 10);
  });

  it("handles a single judge with no variance without NaN", () => {
    const r = normalizeScores([{ judgeId: "solo", scores: { only: 5 } }]);
    expect(r.judgeCalibrations[0].sigma).toBe(0);
    expect(r.submissions[0].zNormalized).toBeCloseTo(75, 6);
    expect(Number.isFinite(r.submissions[0].bayesianAdjusted)).toBe(true);
  });

  it("leaves every submission finite across all three methods", () => {
    const r = normalizeScores(judges);
    for (const s of r.submissions) {
      expect(Number.isFinite(s.rawMean)).toBe(true);
      expect(Number.isFinite(s.zNormalized)).toBe(true);
      expect(Number.isFinite(s.minMaxNormalized)).toBe(true);
      expect(Number.isFinite(s.bayesianAdjusted)).toBe(true);
    }
  });
});
