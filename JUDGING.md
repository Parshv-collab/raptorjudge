# Judging

How a project gets a score, in order: **assign → rubric → score → normalize →
rank → publish**. Each stage is enforced server-side and each write is audited.

---

## 1. Judge assignment

Two implementations share one pure planner
(`src/lib/algorithms/assignment.ts`):

| Path | Function | Use |
|---|---|---|
| Preview (dry run, writes nothing) | `judging.previewAssignment` — query | Review the plan before committing |
| Commit | `judging.runAssignment` — mutation | Replaces the event's assignments |
| Manual top-up | `judging.assignProjects` | Add specific projects to one judge |
| Withdraw | `judging.removeJudgeFromEvent` | Drop one judge's assignments for one event |

`planJudgeAssignments` is deterministic for a given `seed` (default `42`) so the
same fixture data always yields the same plan.

### Goals, in priority order

1. **Coverage** — every submission gets at least `k` judges (`k = 3` by default,
   validated to `1 ≤ k ≤ 10`).
2. **Load balance** — the spread between the busiest and quietest judge is
   minimized.
3. **Track affinity** — a judge whose specialisations include the submission's
   track is preferred over an equally-loaded generalist.
4. **Conflict of interest** — a judge never reviews their own team, a teammate's
   team, or a team sharing a member with theirs.

### The per-judge load cap

`maxAssignmentsPerJudge` defaults to **8** (`DEFAULT_JUDGE_LOAD_CAP`). It is a
hard ceiling, not a target: the planner refuses to hand a judge a ninth project
even if that leaves a submission short. The cap is raised to at least `k` if a
lower value is passed, and `runAssignment` rejects `cap < k` outright.

Both entry points report the consequences instead of hiding them:

- `capReached` — judges that hit the cap while work was still queued.
- `unstaffedSubmissions` — submissions that would end up below `k`.
- `maxAssignmentsPerJudge` — the cap actually applied.

`conflictsAvoided` distinguishes *why* a submission could not be filled
(conflict of interest vs load cap), because the fix is different in each case.

### Track affinity

Each judge's specialisations live in the `platform` key/value table as
`judge_tracks:<userId>` (a JSON array of track names) rather than a schema
column, which keeps the deployed schema unchanged. Organizers edit them per
planner via `judging.setJudgeTracks`, which validates every name against the
event's real tracks and rejects unknown ones. `buildAssignmentInputs` folds them
into `affinityTracks` before planning.

### Algorithm

**Round 1 — fill to `k`.** Submissions are processed round-robin. For each one,
candidates are the judges who are eligible (no conflict), not already on that
submission, and below the cap. Candidates sort by ascending workload, then by
track affinity (match first), then by seeded jitter. The first candidate wins.
Ties are therefore broken the same way on every run.

**Round 2 — balance.** While the heaviest and lightest judge differ by more than
one assignment, the planner looks for a submission held by the heavy judge that
the light judge could legally take (eligible, not already assigned) and moves it.
A 100-iteration guard bounds the loop.

Complexity is `O(S · J · k)` for round 1 and `O(100 · S)` for round 2 — trivial
for hundreds of submissions.

---

## 2. Rubrics

A rubric is the set of `rubricCriteria` rows for an event: name, description,
`weight`, `minScore`, `maxScore`, `sortOrder`.

### Weight validation

Weights **must sum to 1.000** (±0.001). `judging.getRubric` returns the live
audit — `weightSum` and `weightValid` — and `upsertCriterion` enforces it:

- `weight` must be `> 0` and `≤ 1`.
- `minScore < maxScore`, `minScore ≥ 0`.
- Name 2–60 characters, description ≤ 500.
- The projected sum (siblings + the new weight) must equal 1.000, **unless**
  `allowWeightMismatch: true` is passed to save an intentional draft. Nothing is
  ever stored silently broken.

The organizer UI mirrors this before the write: the criterion modal shows the
projected sum live, green at 1.000 and amber otherwise, and only reveals the
"save as draft anyway" checkbox when the sum is off.

### Defaults

If an event has no criteria, `getRubric` returns `DEFAULT_RUBRIC` and flags
`isDefault: true`; the judge screen says so. `customizeRubric` materializes the
default into real rows when the organizer wants to edit it.

### Locking

Once judging starts a rubric must not move under the judges' feet. Two
independent locks apply, and `getRubric` reports both:

| Lock | Trigger | Cleared by |
|---|---|---|
| Stage lock | Event stage is `judging`, `voting`, `published` or `archived` | Changing the stage back |
| Explicit lock | `judging.lockRubric` (organizer/admin) | `judging.unlockRubric` — **admin only** |

`getRubric.locked` is the OR of the two; `lockedByStage` / `lockedExplicitly`
say which. Every criterion write funnels through `assertRubricEditable`, so even
a direct API call cannot edit a locked rubric. Only an admin can unlock an
explicitly locked rubric — an organizer cannot silently unlock a rubric they
locked mid-event.

---

## 3. Scoring

`judging.myQueue` returns the caller's own assignments only. A judge cannot
request another judge's queue; passing a different `judgeId` requires organizer
or admin. Each item carries the submission, its team and track, its event, the
criteria, any previously saved scores, `canScore` (judging window open and not
already completed) and a `judgingWindowLabel` for closed windows.

The scoring form (`/judge/score/:id`):

- one slider per criterion, bounded by that criterion's min/max;
- a **live weighted total** (`Σ score × weight`) shown against the maximum
  attainable, with a percentage;
- **draft autosave** to `localStorage` under `raptorjudge:judge-draft:<assignmentId>`,
  hydrated on mount (localStorage value wins over the last saved scores so a
  refresh never loses work) and cleared when the score is submitted;
- **submit locks the score** — `submitScores` rejects a second submission from
  the same judge (`"You have already scored this submission"`), sets
  `status: "completed"` and `completedAt`, and disables the form;
- **progress**: "You've scored N of M" with a bar, derived from the queue.

Integrity rules enforced in `submitScores`:

- the assignment must belong to the calling judge (organizers/admins may correct
  scores explicitly);
- the judging window must be open for a judge;
- each criterion may appear at most once in the payload;
- `minScore ≤ score ≤ maxScore` per criterion;
- a duplicate criterion id is rejected rather than inserting a second row.

Private notes are stored per score row and are visible only to staff.

---

## 4. Z-score normalization

Different judges use the 1–5 slider differently. In the fixture data the harshest
panel — Tomas Varga (`jdg_01`) — averages **2.000** and the most generous, Wei
Lindqvist (`jdg_02`), **4.222** — more than two points apart on a five-point
scale. A raw average therefore measures *who happened to review you*.
Normalization removes that.

### Formula

For each judge `j` over their own scored projects:

```text
mu_j    = mean(raw scores of j)
sigma_j = sample standard deviation (n − 1), 0 when n = 1

z          = (raw − mu_j) / sigma_j
zNorm      = mean(z over the judges of a submission) × targetSigma + targetMean
           = mean(z) × 12 + 75                       (the "Z→75" column)

ten-point  = clamp(5 + 2z, 0, 10)                    (the headline ranking)
```

`tenPointNormalized` averages the per-judge ten-point mapping, so no single
judge's calibration can move a submission on its own.

### Degenerate cases

| Situation | Behavior |
|---|---|
| `sigma_j > 0` | z-score path |
| `sigma_j == 0` and the judge's range > 0 | min-max fallback: `(raw − lo) / (hi − lo) × 10` |
| `sigma_j == 0` and the judge is fully flat (one project, or all identical) | `5.0` — no signal to extract |

A judge with `sigma_j == 0` contributes `z = 0` on the z path, i.e. their score
is treated as perfectly average rather than infinitely good or bad.

### Worked example (from the fixture proof)

`jdg_01` — **Tomas Varga** (`tomas.varga@example.org`) — is the harsh panel: one
project, mean **2.000**, `sigma 0.000`. `jdg_02` — **Wei Lindqvist**
(`wei.lindqvist@example.org`) — is the generous panel: six projects, mean
**4.222**, `sigma 0.807`. Raw gap: **2.222** points.

Take one project from each panel and run the formula. Every number below is a
real fixture score:

```text
harsh panel (Tomas Varga) — his only score row:
    raw = 2.000, mu = 2.000, sigma = 0.000
    sigma == 0 and the judge's range is flat (one project), so the degenerate
    branch fires: ten-point = 5.0 — no signal to extract, so no signal invented.
    On the raw scale that 2.000 is dead last of 41 projects.

generous panel (Wei Lindqvist) — his mean, and his best row:
    raw = 4.222  (his mean of 3.000, 3.667, 4.000, 4.667, 5.000, 5.000)
        z        = (4.222 − 4.222) / 0.807 = 0.000
        ten-point = clamp(5 + 2 × 0.000, 0, 10) = 5.000
    raw = 5.000  (his best row — only 0.778 above his own mean)
        z        = (5.000 − 4.222) / 0.807 = 0.964
        ten-point = clamp(5 + 2 × 0.964, 0, 10) = 6.928
```

The 0.778-point advantage the generous judge gave his best project is small on a
five-point slider and is worth **1.928 points of ten** once the panel is removed.
The harsh judge's lone 2.000 — last place on the raw scale — becomes exactly
5.000, because a one-project panel has no shape to standardize against. That is
the whole argument: without normalization, a project is ranked by the severity
of whoever happened to read it.

After standardization both panels have `mean_z = 0.000` exactly (verified across
all 30 judges by `maxJudgeMeanZ = 0.000000000000`), and the judge-severity gap
collapses from **0.420** to **0.000** (std dev of judge means).

### Companion methods

Computed alongside z-score, never instead of it:

- **Min-max** — each judge's own observed range stretched to `[0, 100]`
  (`50` when the range is flat).
- **Bayesian shrinkage** — `adjusted = (n × raw + k × globalMean) / (n + k)`
  with prior weight `k = 10`, so a judge with three scores moves a project less
  than one with thirty.

### Proof metrics

`NormalizationResult.proof` reports:

| Metric | Meaning |
|---|---|
| `maxJudgeMeanZ` | max `\|mean_z\|` over judges — should be 0 |
| `maxJudgeSigmaZ` | max `\|sigma_z − 1\|` — should be 0 |
| `rawVsNormalizedRho` | Spearman ρ between raw and normalized ranking — **< 1 by design** |
| `methodAgreementRho` | Spearman ρ between z and min-max — two independent methods agreeing |
| `judgeMeanSpreadRaw` / `Normalized` | std dev of judge means, before and after |
| `submissionSpreadRaw` / `Normalized` | std dev of submission scores, before and after |

`normalization-proof.txt` is generated from `fixtures.json` by
`npm run proof:normalization`, which transpiles and calls the **real** algorithm
module (not a reimplementation), so the published numbers cannot drift from the
app.

---

## 5. Bradley–Terry pairwise ranking

`/judge/pairwise` shows two projects side by side; the judge picks one or a tie.
`pairwise.submitMatch` stores the comparison in `pairwiseMatches`.

### Validity checks

Before recording a comparison the mutation verifies that both submissions exist,
both belong to the stated event, both are `submitted`, the two sides differ, and
**the winner is one of the two competitors** — otherwise a caller could record a
win for an unrelated project and skew the ranking.

### MM algorithm

```text
W_i = wins of i        (a tie contributes 0.5 to each side)
n_ij = matches between i and j

pi_i(next) = (W_i + a − 1) / (b + Σ_j n_ij / (pi_i + pi_j))

a = 1.5 (Gamma prior),  b = 1,  pi_i(0) = 1
stop when |Δ log-likelihood| < 1e-10, capped at 500 iterations
ratings are rescaled so the weakest positive rating is 100
```

`pairwise.leaderboard` returns the ranking, the win/loss record per project and a
`converged` flag; the results tab warns when it is `false` ("more comparisons
will sharpen it").

### Visibility

The pairwise leaderboard is the **answer key while judging runs**, so
pre-publish it is readable by organizers and admins only. Judges see their own
match history (`pairwise.myMatches`) but not the latent strengths; everyone can
read the ranking once the event is `published` or `archived`.

---

## 6. Final ranking and publication

The results tab (`/organizer/events/:slug`, Results) shows, from live data:

- judges scored and projects ranked;
- raw-vs-normalized Spearman ρ;
- judge-mean spread before → after normalization;
- the judge calibration table (mean, σ, n) — the harsh/generous panels are
  visually obvious;
- the normalized leaderboard (`z → 0–10`), each row also showing the raw mean;
- the Bradley–Terry ranking with win/match records.

Publishing is the event stage transition to `published`: hidden tallies reveal,
the pairwise leaderboard opens up, judge records become readable by anyone with
the event, and certificates can be issued.

---

## 7. Role Isolation

Every boundary below is enforced **server-side**, in the Convex function itself.
Hiding a button in React is not a control: the acceptance checker and the T5
self-checks talk to the API directly. A wrong-role caller gets an error from
`requireRole` / `requireOrganizer` / `requireUser`, never a filtered success.

| Endpoint | Participant | Judge | Organizer | Admin |
|---|---|---|---|---|
| `judging.myQueue` (own) | empty queue | **own assignments** | own | own |
| `judging.myQueue` (other `judgeId`) | **403** | **403** | allowed | allowed |
| `judging.submitScores` | **403** | own assignment only | correct any | correct any |
| `judging.progress` | **403** | **403** | allowed | allowed |
| `judging.judgesOverview` | **403** | **403** | allowed | allowed |
| `judging.judgeRecord` | published only | own (always) | any | any |
| `judging.getRubric` | allowed | allowed | allowed | allowed |
| `judging.upsertCriterion` / `deleteCriterion` | **403** | **403** | allowed (unlocked) | allowed (unlocked) |
| `judging.lockRubric` | **403** | **403** | allowed | allowed |
| `judging.unlockRubric` | **403** | **403** | **403 (admin only)** | allowed |
| `judging.previewAssignment` / `runAssignment` | **403** | **403** | allowed | allowed |
| `judging.getJudgeTracks` / `setJudgeTracks` | **403** | **403** | allowed | allowed |
| `judging.assignProjects` / `removeJudgeFromEvent` | **403** | **403** | allowed | allowed |
| `pairwise.leaderboard` (unpublished) | **403** | **403** | allowed | allowed |
| `pairwise.nextPair` / `myMatches` / `submitMatch` | **403** | allowed | allowed | allowed |
| `submissions.byEvent` (incl. drafts) | **403** | **403** | allowed | allowed |
| `submissions.listFlags` / `checkDuplicates` / `dismissFlag` / `removeFlaggedSubmission` | **403** | **403** | allowed | allowed |
| `exports.*` (CSV/JSON) | **403** | **403** | allowed | allowed |
| `admin.getSettings` (secret-masked) | signed in | signed in | signed in | signed in |
| `admin.listInvites` / `createInvite` / `revokeInvite` | **403** | **403** | allowed | allowed |
| `users.list` | **403** | **403** | allowed | allowed |
| `users.setRole` | **403** | **403** | allowed | allowed |
| `normalization.analyze` | **403** | **403** | allowed | allowed |
| `audit.list` / `verifyChain` | **403** | **403** | allowed | allowed |
| `webhooks.dispatch` | **403** | **403** | allowed | allowed |
| `teamChat.listMessages` / `sendMessage` / `myTeamChat` | team members only (staff **excluded**) |  |  |  |
| `teams.getTeam` (roster + emails) | members | members | members + staff | members + staff |
| `teams.listByEvent` (invite code) | members only | members only | members only | members only |
| `submissions.publicGallery` | public (event stage rules) | public | public | public |
| `voting.cast` (tallies hidden until publish) | signed in | signed in | signed in | signed in |
| `comments.add` | signed in | signed in | signed in | signed in |
| `comments.listFlagged` / `unflag` | **403** | **403** | allowed | allowed |

This table is not aspirational — the same boundaries are asserted by the T5
security battery (`src/convex/lib/securityChecks.ts`) and covered by
`tests/rbac.test.ts`.

### The two checks that matter most

1. **Judge A cannot read Judge B's scores.** `myQueue` is scoped to the caller's
   own `judgeId`; `progress` and `judgesOverview` (the only endpoints that
   aggregate across judges — the raw per-criterion rows themselves are read only
   through an assignment the judge owns) require an organizer. The acceptance
   checker exercises this directly: judge A reads their own scores with `200`,
   judge B is blocked.
2. **Participants cannot reach judging or organizer endpoints.** Both return
   `403` from the shared role guards before any data is read.

### Non-team-member isolation

`teamChat` resolves team membership itself and refuses staff — an organizer
cannot read a team's private channel without being a member. `teams.getTeam`
returns a limited card (name, track, member count) to non-members, and only
exposes the roster with member emails to members and staff. There is no
cross-participant profile endpoint at all, so there is nothing to leak.
