# How It Works

## 1. Where everything lives

`src/pages` contains route-level screens. `src/components/layout/AppShell.tsx` contains global navigation and the responsive shell. `src/convex` contains database schema, queries, mutations, actions, HTTP handlers, and domain modules. `src/lib/algorithms` contains assignment, normalization, and Bradley–Terry code. `src/lib` contains validation, JWT, TOTP, safe redirects, token storage, and webhook checks. `tests` contains deterministic unit tests. `backend/entrypoint.sh` and `docker-compose.yml` define startup and bootstrap.

## 2. Startup sequence

`docker compose up` starts PostgreSQL first and waits for its health check. The Convex backend starts next and uses PostgreSQL as its store. The Convex dashboard waits for the backend. The bootstrap image then publishes auth keys, pushes the Convex schema and function bundle, and optionally seeds demo fixtures. The frontend waits for bootstrap success, builds through its Dockerfile, and nginx serves the SPA on port 3000. The exact key and seed steps are in `backend/entrypoint.sh`.

## 3. User journeys

### A. Participant signs up

The form is rendered by `src/pages/Auth.tsx`. It calls `useAuthActions().signIn` with `flow: signUp`. Convex Auth creates the account and session records defined by `authTables`; the application user row is populated by the auth integration. The client stores tokens through `src/lib/tokenStorage.ts`, then navigates to the safe return path. `/home` dispatches the participant to `/dashboard`.

### B. Participant joins an event

A public event is rendered by `EventPublic.tsx`. Its Join Event link points to `/workspace?event=slug`, or to `/auth?returnTo=...` when the visitor is signed out. After authentication, `ParticipantWorkspace.tsx` loads the selected slug through `events.getBySlug`. The participant creates a team with `teams.create` or joins an existing team through `teams.joinByInviteCode`. The latter looks up the indexed invite code, checks role, capacity, duplicate membership, and one-team-per-event rules, then writes `teamMembers`.

### C. A team is formed

The leader submits a team name in the workspace. `teams.create` checks the event and current memberships, generates a random hexadecimal invite code, writes the team and leader membership, and returns the code. The workspace displays it for copying. A teammate pastes that code into the same workspace and calls `joinByInviteCode`.

### D. A project is submitted

A team member edits the submission form in `ParticipantWorkspace.tsx`. **Save
draft** calls `submissions.saveDraft` explicitly, which upserts a `status:
"draft"` row so work survives a refresh without being judged or listed in the
gallery. The **Submit for judging** button calls `submissions.submit`, which
re-checks team membership, validates every URL scheme and length, enforces the
event deadline and stage, sets `submittedAt` and flips the status to `submitted`.
After submission the form is locked (`isLocked = status === "submitted" ||
deadlinePassed`), and the deadline raises the same lock on its own. Submitting
also re-runs duplicate detection and writes a `flags` row if the title or
repository URL matches another submission in the event.

### E. An organizer creates an event

`EventForm.tsx` collects identity, description, schedule, and participation values. It converts date fields to timestamps and calls `events.create`; edit mode calls `events.update`. The mutation requires organizer access, validates lifecycle values, writes the event, and appends an audit record. The organizer can then use `/organizer/events/:slug` to publish, add tracks and prize amounts, and edit rubric criteria.

### F. An organizer assigns judges

The organizer opens the Judges tab, sets `k` (judges per project) and the
per-judge load cap (default 8), and presses **Preview**. `judging.previewAssignment`
is a dry-run: it runs the real planner and returns per-judge load, coverage,
conflicts avoided, which judges would hit the cap, and which projects would go
unstaffed — writing nothing. Satisfied, the organizer presses **Distribute
fairly**, which calls `judging.runAssignment`: it gathers eligible judges,
submitted work, team memberships and `judge_tracks:` specialisations, runs
`planJudgeAssignments` (fill to `k` by ascending workload, then track affinity,
then seeded jitter; then affinity-aware balancing swaps that respect the cap),
replaces the event's assignments and appends an audit entry with the workload,
cap and conflict counts.

### G. A judge scores a project

The judge queue comes from `judging.myQueue`, which is scoped to the caller's own
`judgeId` — a judge cannot see another judge's assignments or scores, and asking
for someone else's queue requires organizer or admin. `/judge/score/:id` loads the
assignment and the event rubric (`judging.getRubric`, one round-trip carrying the
criteria, the weight audit and the lock state). Sliders are bounded by each
criterion's min/max, and the weighted total updates live. Every keystroke is
autosaved to `localStorage` as a draft, so a refresh loses nothing. Submitting
calls `judging.submitScores`, which verifies the assignment belongs to the judge,
refuses a completed assignment (scores lock on submit), writes one row per
criterion plus private notes, marks the assignment `completed`, and audits it. The
header shows "You've scored N of M".

### H. An organizer reads results

The Results tab calls `normalization.analyze`, which groups scores per judge,
computes each judge's sample mean and standard deviation, then produces z-score,
min-max and Bayesian values together. Z-score output uses N(75, 12²) by default,
and each submission also carries a ten-point value (`clamp(5 + 2z, 0, 10)`) used
for the headline ranking. The tab renders the judge calibration table (mean, σ,
n — where the harsh and generous panels are obvious), the raw-vs-normalized
Spearman ρ, the judge-mean spread before → after normalization, and the
normalized leaderboard. Alongside it, `pairwise.leaderboard` shows the
Bradley–Terry ranking with win/match records and a convergence flag; it is
organizer/admin-only until the event is published, because the latent strengths
are effectively the answer key. The exact formulas are in [JUDGING.md](JUDGING.md)
and implemented in `src/lib/algorithms/normalization.ts` and
`src/lib/algorithms/pairwise.ts`.

### I. Results are published

`events.setStage` moves the event through
`draft → registration → submission → judging → voting → published → archived` and
appends an audit entry. Publication is the stage transition itself — there is no
separate "publish results" mutation, and none is needed: every visibility rule
keys off the stage in one place per domain. Moving to `published` reveals community
tallies (masked until then), opens the pairwise leaderboard to everyone, makes
judge records publicly readable, and allows certificates to be issued.

## 4. Why these decisions were made

Convex provides typed reactive queries, transactional mutations, and the self-hosted runtime in one system, so a separate REST server is unnecessary. Convex Auth supplies password sessions and JWT verification without a custom auth protocol. SessionStorage limits token persistence to a browser tab, unlike localStorage. The OIDC discovery document is custom-built because strict clients require more fields than the default helper returns. The audit log is hash-chained so tampering can be detected. Z-score is the default normalization because it directly addresses judge calibration differences and maps scores to an explicit common distribution.

## 4b. Role isolation in one sentence

Every access rule in the flows above is enforced inside the Convex function that
ows the data, never by hiding a button — the acceptance checker and the T5
security battery call the API directly, so a control that exists only in React
would be a false sense of safety. [JUDGING.md §7](JUDGING.md#7-role-isolation)
lists every endpoint and which roles may reach it.

## 5. How to extend

To add a page, create a file under `src/pages`, register it in `src/App.tsx`, and use `Protected` plus `AppShell` when it is authenticated. To add a Convex function, add it to the relevant `src/convex` domain file, update the schema if necessary, run Convex code generation, and add a frontend `api` call. To add a role, update the role union and RBAC helpers, role-home routing, shell navigation, seed fixtures, and tests. Authorization must be enforced in the Convex function rather than only in React.

## References

[1]: src/pages/Auth.tsx "Authentication UI"
[2]: src/pages/ParticipantWorkspace.tsx "Participant team and submission flow"
[3]: src/convex/teams.ts "Team and invite mutations"
[4]: src/convex/submissions.ts "Submission mutations"
[5]: src/pages/EventForm.tsx "Event form"
[6]: src/convex/events.ts "Event mutations"
[7]: src/lib/algorithms/assignment.ts "Assignment planner"
[8]: src/lib/algorithms/normalization.ts "Normalization implementation"
[9]: src/convex/judging.ts "Judging queries and mutations"
