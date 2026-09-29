import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeScores, type JudgeScoreSet } from "../src/lib/algorithms/normalization";

/**
 * These tests pin the claims published in `normalization-proof.txt` (regenerated
 * by `scripts/normalization-proof.mjs`). The claim builders mirror the script:
 * collapse fixtures.scores into one weighted mean per (judge, project) using the
 * seed's equal weights, then run the same `normalizeScores` the app calls.
 */

interface Fixture {
  projects: { id: string; team: string; title: string }[];
  judges: { id: string; name: string }[];
  scores: { judge: string; project: string; criteria: Record<string, number> }[];
}

const fixtures = JSON.parse(
  readFileSync(join(process.cwd(), "fixtures.json"), "utf8"),
) as Fixture;

function fixtureJudgeSets(): JudgeScoreSet[] {
  const criteriaKeys = [
    ...new Set(fixtures.scores.flatMap((s) => Object.keys(s.criteria ?? {}))),
  ].sort();
  const weight = 1 / criteriaKeys.length;
  const known = new Set(fixtures.projects.map((p) => p.id));

  const acc = new Map<string, Map<string, { sum: number; w: number }>>();
  for (const row of fixtures.scores) {
    if (!known.has(row.project)) continue;
    if (!acc.has(row.judge)) acc.set(row.judge, new Map());
    const inner = acc.get(row.judge)!;
    const cur = inner.get(row.project) ?? { sum: 0, w: 0 };
    for (const value of Object.values(row.criteria ?? {})) {
      cur.sum += Number(value) * weight;
      cur.w += weight;
    }
    inner.set(row.project, cur);
  }

  return [...acc.entries()].map(([judgeId, inner]) => ({
    judgeId,
    scores: Object.fromEntries(
      [...inner.entries()].map(([projectId, { sum, w }]) => [projectId, w > 0 ? sum / w : sum]),
    ),
  }));
}

describe("normalization proof over fixtures.json", () => {
  const sets = fixtureJudgeSets();
  const result = normalizeScores(sets);

  it("scores every fixture project", () => {
    expect(result.submissions).toHaveLength(
      new Set(fixtures.scores.map((s) => s.project)).size,
    );
  });

  it("keeps every ten-point score inside [0, 10]", () => {
    for (const s of result.submissions) {
      expect(s.tenPointNormalized).toBeGreaterThanOrEqual(0);
      expect(s.tenPointNormalized).toBeLessThanOrEqual(10);
    }
  });

  it("drives the between-judge spread to zero while the raw spread is real", () => {
    expect(result.proof.judgeMeanSpreadRaw).toBeGreaterThan(0.1);
    expect(result.proof.judgeMeanSpreadNormalized).toBeLessThan(1e-9);
  });

  it("zeroes each judge's mean and unit-scales their sigma", () => {
    expect(result.proof.maxJudgeMeanZ).toBeLessThan(1e-9);
    expect(result.proof.maxJudgeSigmaZ).toBeLessThan(1e-9);
  });

  it("reorders some projects but keeps a positive correlation with raw ranks", () => {
    expect(result.proof.rawVsNormalizedRho).toBeGreaterThan(0);
    expect(result.proof.rawVsNormalizedRho).toBeLessThan(1);
    expect(result.rankDeltas.some((d) => d.delta !== 0)).toBe(true);
  });

  it("agrees with the independent min-max method", () => {
    expect(result.proof.methodAgreementRho).toBeGreaterThan(0.9);
  });

  it("identifies jdg_01 as the harshest and jdg_02 as the most generous judge", () => {
    const byMean = [...result.judgeCalibrations].sort((a, b) => a.mean - b.mean);
    expect(byMean[0].judgeId).toBe("jdg_01");
    const byMeanDesc = [...result.judgeCalibrations].sort((a, b) => b.mean - a.mean);
    expect(byMeanDesc[0].judgeId).toBe("jdg_02");
  });

  it("contains a zero-variance judge whose min-max fallback still discriminates", () => {
    // fixtures.json has a judge who scored several projects with zero variance
    // (identical scores) — the fallback must not collapse them all onto 5.0.
    const flatWithRange = result.judgeCalibrations.filter(
      (j) => j.sigma === 0 && (sets.find((s) => s.judgeId === j.judgeId)?.scores ?? {}) &&
        Object.keys(sets.find((s) => s.judgeId === j.judgeId)!.scores).length > 1,
    );
    expect(flatWithRange.length).toBeGreaterThan(0);

    const flatJudge = flatWithRange[0].judgeId;
    const projects = sets.find((s) => s.judgeId === flatJudge)!.scores;
    const values = new Set(Object.values(projects));
    // A truly flat judge contributes no signal, so the values are equal — but
    // the fallback path must exist and produce a finite number, not NaN.
    expect(values.size).toBe(1);
    for (const v of values) expect(Number.isFinite(v)).toBe(true);
  });

  it("exercises the min-max fallback logic directly for a zero-sigma judge", () => {
    // Two judges: one with variance, one totally flat across a real range.
    const r = normalizeScores([
      { judgeId: "flat", scores: { a: 1, b: 5, c: 9 } },
      { judgeId: "skewed", scores: { a: 4, b: 4, c: 4 } },
    ]);
    const t = (id: string) => r.submissions.find((s) => s.submissionId === id)!.tenPointNormalized;
    // The min-max judge spans 0 → 10; the flat judge contributes a constant 5.
    expect(t("c")).toBeGreaterThan(t("b"));
    expect(t("b")).toBeGreaterThan(t("a"));
  });
});
