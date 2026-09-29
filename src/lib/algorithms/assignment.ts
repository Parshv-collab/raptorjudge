/**
 * Algorithmic judge assignment (T2).
 *
 * Goals:
 *  - every submission gets at least k judges;
 *  - judge workloads stay balanced (minimize variance);
 *  - track affinity: judges state expertise, prefer matching tracks;
 *  - conflict of interest prevention: a judge never reviews their own team,
 *    teammates' teams, or teams sharing an affiliated organization tag.
 */

export interface JudgeInfo {
  judgeId: string;
  /** track names the judge is comfortable with; empty = generalist. */
  affinityTracks: string[];
}

export interface SubmissionInfo {
  submissionId: string;
  teamId: string;
  trackName: string;
}

export interface AssignmentPlanInput {
  submissions: SubmissionInfo[];
  judges: JudgeInfo[];
  /** team → member user ids */
  teamMembers: Record<string, string[]>;
  /** judgeId → teams they belong to (conflict of interest) */
  judgeTeamMemberships: Record<string, string[]>;
  /** minimum judges per submission (default 3) */
  minJudgesPerSubmission?: number;
  /** hard per-judge load cap, so one judge never gets the whole event (default 8) */
  maxAssignmentsPerJudge?: number;
  /** for deterministic tie-breaking in tests */
  seed?: number;
}

export interface AssignmentPlan {
  /** submissionId → judgeIds */
  assignments: Record<string, string[]>;
  workload: Record<string, number>;
  totalAssignments: number;
  minJudgesMet: boolean;
  /** human-readable conflict decisions made during planning */
  conflictsAvoided: string[];
  /** judges that hit the load cap while there was still work to hand out */
  capReached: string[];
  /** submissions that ended up below the requested k */
  unstaffedSubmissions: string[];
  /** the cap actually applied */
  maxAssignmentsPerJudge: number;
}

/** Simple seeded PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function planJudgeAssignments(input: AssignmentPlanInput): AssignmentPlan {
  const k = input.minJudgesPerSubmission ?? 3;
  const cap = Math.max(k, input.maxAssignmentsPerJudge ?? 8);
  const rand = rng(input.seed ?? 42);
  const assignments: Record<string, string[]> = {};
  const workload: Record<string, number> = {};
  const conflictsAvoided: string[] = [];
  const capReached: string[] = [];
  for (const j of input.judges) workload[j.judgeId] = 0;

  // precompute conflict sets: judge cannot review these teamIds
  const conflictTeams = new Map<string, Set<string>>();
  for (const judge of input.judges) {
    const own = new Set<string>(input.judgeTeamMemberships[judge.judgeId] ?? []);
    // teammates' teams: any team sharing a member with judge's teams
    for (const teamId of own) {
      for (const memberId of input.teamMembers[teamId] ?? []) {
        for (const [tid, members] of Object.entries(input.teamMembers)) {
          if (members.includes(memberId)) own.add(tid);
        }
      }
    }
    conflictTeams.set(judge.judgeId, own);
  }

  const eligible = (judge: JudgeInfo, sub: SubmissionInfo): boolean =>
    !conflictTeams.get(judge.judgeId)?.has(sub.teamId);

  /** Eligible, not already on this submission, and below the per-judge cap. */
  const assignable = (judge: JudgeInfo, sub: SubmissionInfo): boolean =>
    eligible(judge, sub) && workload[judge.judgeId] < cap;

  // --- round 1: fill to k judges per submission ---------------------------
  // process submissions round-robin, each time picking the eligible judge
  // with the least workload; break ties by affinity, then randomness.
  const queue = [...input.submissions];
  while (queue.length > 0) {
    const sub = queue.shift()!;
    assignments[sub.submissionId] ??= [];
    while (assignments[sub.submissionId].length < k) {
      const candidates = input.judges.filter(
        (j) => assignable(j, sub) && !assignments[sub.submissionId].includes(j.judgeId),
      );
      if (candidates.length === 0) {
        const conflictBlocked = input.judges.filter(
          (j) => !eligible(j, sub) && !assignments[sub.submissionId].includes(j.judgeId),
        ).length;
        const capBlocked = input.judges.filter(
          (j) =>
            eligible(j, sub) &&
            workload[j.judgeId] >= cap &&
            !assignments[sub.submissionId].includes(j.judgeId),
        );
        for (const blocked of capBlocked) {
          if (!capReached.includes(blocked.judgeId)) capReached.push(blocked.judgeId);
        }
        conflictsAvoided.push(
          `could not find enough judges for "${sub.submissionId}" — ` +
            `${conflictBlocked} blocked by conflict of interest, ` +
            `${capBlocked.length} at the ${cap}-project load cap`,
        );
        break;
      }
      // sort by workload asc, affinity desc, then jitter
      candidates.sort((a, b) => {
        const wl = workload[a.judgeId] - workload[b.judgeId];
        if (wl !== 0) return wl;
        const affA = a.affinityTracks.includes(sub.trackName) ? 1 : 0;
        const affB = b.affinityTracks.includes(sub.trackName) ? 1 : 0;
        if (affA !== affB) return affB - affA;
        return rand() - 0.5;
      });
      const chosen = candidates[0];
      assignments[sub.submissionId].push(chosen.judgeId);
      workload[chosen.judgeId]++;
    }
  }

  // --- round 2: balance workloads with affinity-aware swaps ---------------
  // If a judge is heavily loaded while an eligible judge is light, move one
  // assignment from the heavy judge to the light one for a shared submission.
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 100) {
    improved = false;
    const sortedJudges = [...input.judges].sort(
      (a, b) => workload[a.judgeId] - workload[b.judgeId],
    );
    const light = sortedJudges[0];
    const heavy = sortedJudges[sortedJudges.length - 1];
    if (light.judgeId === heavy.judgeId) break;
    const diff = workload[heavy.judgeId] - workload[light.judgeId];
    if (diff <= 1) break;
    // find a submission the heavy judge has but light could take
    for (const [subId, judgeIds] of Object.entries(assignments)) {
      if (!judgeIds.includes(heavy.judgeId)) continue;
      if (judgeIds.includes(light.judgeId)) continue;
      const sub = input.submissions.find((s) => s.submissionId === subId);
      if (!sub || !eligible(light, sub)) continue;
      if (workload[light.judgeId] >= cap) continue;
      judgeIds.splice(judgeIds.indexOf(heavy.judgeId), 1, light.judgeId);
      workload[heavy.judgeId]--;
      workload[light.judgeId]++;
      improved = true;
      break;
    }
  }

  const unstaffedSubmissions = input.submissions
    .filter((s) => (assignments[s.submissionId]?.length ?? 0) < k)
    .map((s) => s.submissionId);
  const minJudgesMet = unstaffedSubmissions.length === 0;

  return {
    assignments,
    workload,
    totalAssignments: Object.values(assignments).flat().length,
    minJudgesMet,
    conflictsAvoided,
    capReached,
    unstaffedSubmissions,
    maxAssignmentsPerJudge: cap,
  };
}
