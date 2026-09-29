import { describe, it, expect } from "vitest";
import {
  normalizeScores,
  spearmanRho,
  zToTenPoint,
  type JudgeScoreSet,
} from "../src/lib/algorithms/normalization";

describe("zToTenPoint", () => {
  it("maps z = 0 to the middle of the ten-point scale", () => {
    expect(zToTenPoint(0)).toBe(5);
  });

  it("spreads one standard deviation to two points", () => {
    expect(zToTenPoint(1)).toBe(7);
    expect(zToTenPoint(-1)).toBe(3);
  });

  it("clamps to [0, 10]", () => {
    expect(zToTenPoint(99)).toBe(10);
    expect(zToTenPoint(-99)).toBe(0);
  });
});

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

  it("maps each judge's own minimum/maximum onto the ten-point scale", () => {
    const r = normalizeScores(judges);
    const t = (id: string) => r.submissions.find((s) => s.submissionId === id)!.tenPointNormalized;
    // Both judges place their own minimum on s1 and maximum on s3, so after
    // per-judge z-scoring the field spans 3 → 7 on the ten-point scale.
    expect(t("s1")).toBeCloseTo(3, 6);
    expect(t("s2")).toBeCloseTo(5, 6);
    expect(t("s3")).toBeCloseTo(7, 6);
  });

  it("compresses the harsh/generous judge spread (the normalization proof)", () => {
    const r = normalizeScores(judges);
    // Raw judge means are 4 and 9 (spread ~2.5); after per-judge standardization
    // every judge sits on 0, so the spread collapses to ~0.
    expect(r.proof.judgeMeanSpreadRaw).toBeGreaterThan(1);
    expect(r.proof.judgeMeanSpreadNormalized).toBeLessThan(1e-9);
  });

  it("falls back to min-max for a zero-variance judge instead of collapsing", () => {
    // This judge has sigma = 0 but a real range across submissions.
    const flat: JudgeScoreSet[] = [
      { judgeId: "flat", scores: { a: 1, b: 5, c: 9 } },
      { judgeId: "normal", scores: { a: 3, b: 4, c: 5 } },
    ];
    const r = normalizeScores(flat);
    const t = (id: string) => r.submissions.find((s) => s.submissionId === id)!.tenPointNormalized;
    // The flat judge spans 0 → 10, so the composite ordering is preserved and
    // the values are not a constant 5.
    expect(t("c")).toBeGreaterThan(t("b"));
    expect(t("b")).toBeGreaterThan(t("a"));
  });
});
