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

A team member edits the submission form in `ParticipantWorkspace.tsx`. A four-second debounce calls `submissions.saveDraft`. The final button calls `submissions.submit`. The mutation checks team membership, validates URLs and text, checks the event deadline and status, writes submittedAt, and changes the submission status. Submitted work is locked from ordinary participant edits.

### E. An organizer creates an event

`EventForm.tsx` collects identity, description, schedule, and participation values. It converts date fields to timestamps and calls `events.create`; edit mode calls `events.update`. The mutation requires organizer access, validates lifecycle values, writes the event, and appends an audit record. The organizer can then use `/organizer/events/:slug` to publish, add tracks and prize amounts, and edit rubric criteria.

### F. An organizer assigns judges

The organizer calls `judging.runAssignment` from the backend-backed organizer controls. The mutation gathers eligible judges, submitted work, team memberships, track affinity, and existing assignments. `planJudgeAssignments` fills each submission to `k` judges using workload, affinity, conflict filtering, and seeded tie-breaking, then performs workload-balancing swaps. It writes judge assignments and returns counts and conflict information.

### G. A judge scores a project

The judge queue comes from `judging.myQueue`, which limits the data to that judge's assignments. `/judge/score/:id` loads the assignment and rubric. Slider values are bounded by criterion min/max values. Submission calls `judging.submitScores`, which writes criterion scores and private notes and completes the assignment when all criteria are present.

### H. An organizer runs normalization

The normalization source function groups scores per judge, computes sample means and standard deviations, then produces z-score, min-max, and Bayesian values. Z-score output uses the target distribution N(75, 12²) by default. The organizer normalization UI invokes the relevant backend operation and displays proof statistics. The exact formulas are documented in `JUDGING.md` and implemented in `src/lib/algorithms/normalization.ts`.

### I. Results are published

The event lifecycle mutation `events.setStage` changes the event stage and records an audit entry. Public gallery and result visibility depend on lifecycle and submission checks. A separate result-publication mutation beyond stage changes is **not implemented**.

## 4. Why these decisions were made

Convex provides typed reactive queries, transactional mutations, and the self-hosted runtime in one system, so a separate REST server is unnecessary. Convex Auth supplies password sessions and JWT verification without a custom auth protocol. SessionStorage limits token persistence to a browser tab, unlike localStorage. The OIDC discovery document is custom-built because strict clients require more fields than the default helper returns. The audit log is hash-chained so tampering can be detected. Z-score is the default normalization because it directly addresses judge calibration differences and maps scores to an explicit common distribution.

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
