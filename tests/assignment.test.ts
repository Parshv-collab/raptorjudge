import { describe, it, expect } from "vitest";
import {
  planJudgeAssignments,
  type AssignmentPlanInput,
  type JudgeInfo,
  type SubmissionInfo,
} from "../src/lib/algorithms/assignment";

const judges: JudgeInfo[] = [
  { judgeId: "j1", affinityTracks: ["AI"] },
  { judgeId: "j2", affinityTracks: [] },
  { judgeId: "j3", affinityTracks: ["Open Source"] },
];

const submissions: SubmissionInfo[] = [
  { submissionId: "s1", teamId: "t1", trackName: "AI" },
  { submissionId: "s2", teamId: "t2", trackName: "AI" },
  { submissionId: "s3", teamId: "t3", trackName: "Open Source" },
  { submissionId: "s4", teamId: "t4", trackName: "Wildcards" },
];

describe("planJudgeAssignments", () => {
  it("assigns exactly k judges to every submission when conflicts allow", () => {
    const plan = planJudgeAssignments({
      submissions,
      judges,
      teamMembers: {},
      judgeTeamMemberships: {},
      minJudgesPerSubmission: 2,
      seed: 7,
    });
    for (const s of submissions) {
      expect(plan.assignments[s.submissionId]).toHaveLength(2);
    }
    expect(plan.totalAssignments).toBe(8);
    expect(plan.minJudgesMet).toBe(true);
  });

  it("never assigns a judge to their own team's submission", () => {
    const plan = planJudgeAssignments({
      submissions,
      judges,
      teamMembers: { t1: ["u1"], t2: ["u2"], t3: ["u3"], t4: ["u4"] },
      judgeTeamMemberships: { j1: ["t1"], j2: [], j3: [] },
      minJudgesPerSubmission: 2,
      seed: 3,
    });
    expect(plan.assignments["s1"]).not.toContain("j1");
  });

  it("also excludes teammates' teams (shared members)", () => {
    const plan = planJudgeAssignments({
      submissions,
      judges,
      // u1 sits on both t1 and t2, so judge j1 (on t1) must avoid t2 as well.
      teamMembers: { t1: ["u1"], t2: ["u1"], t3: ["u3"], t4: ["u4"] },
      judgeTeamMemberships: { j1: ["t1"], j2: [], j3: [] },
      minJudgesPerSubmission: 2,
      seed: 3,
    });
    expect(plan.assignments["s1"]).not.toContain("j1");
    expect(plan.assignments["s2"]).not.toContain("j1");
  });

  it("never lists the same judge twice for one submission", () => {
    const plan = planJudgeAssignments({
      submissions,
      judges,
      teamMembers: {},
      judgeTeamMemberships: {},
      minJudgesPerSubmission: 3,
      seed: 5,
    });
    for (const s of submissions) {
      const list = plan.assignments[s.submissionId];
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it("keeps workloads balanced (spread at most 1 for even splits)", () => {
    const plan = planJudgeAssignments({
      submissions,
      judges,
      teamMembers: {},
      judgeTeamMemberships: {},
      minJudgesPerSubmission: 2,
      seed: 11,
    });
    const loads = Object.values(plan.workload);
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1);
  });

  it("is deterministic for a given seed", () => {
    const args: AssignmentPlanInput = {
      submissions,
      judges,
      teamMembers: {},
      judgeTeamMemberships: {},
      minJudgesPerSubmission: 3,
      seed: 99,
    };
    expect(planJudgeAssignments(args).assignments).toEqual(
      planJudgeAssignments(args).assignments,
    );
  });

  it("flags submissions it cannot staff because of conflicts", () => {
    const plan = planJudgeAssignments({
      submissions: [{ submissionId: "solo", teamId: "t1", trackName: "AI" }],
      judges: [{ judgeId: "j1", affinityTracks: [] }],
      teamMembers: { t1: ["u1"] },
      judgeTeamMemberships: { j1: ["t1"] },
      minJudgesPerSubmission: 1,
      seed: 1,
    });
    expect(plan.minJudgesMet).toBe(false);
    expect(plan.conflictsAvoided.length).toBeGreaterThan(0);
  });

  it("prefers a track-matching judge on the first pick", () => {
    // j1 is the AI specialist; with no workload pressure it should get an AI sub.
    const plan = planJudgeAssignments({
      submissions: [{ submissionId: "s1", teamId: "t1", trackName: "AI" }],
      judges,
      teamMembers: {},
      judgeTeamMemberships: {},
      minJudgesPerSubmission: 1,
      seed: 42,
    });
    expect(plan.assignments["s1"]).toEqual(["j1"]);
  });
});
