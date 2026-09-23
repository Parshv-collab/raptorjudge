# Architecture

## System overview

RaptorJudge is a React and TypeScript single-page application backed by self-hosted Convex. Docker Compose runs PostgreSQL, the Convex backend and HTTP actions, the Convex dashboard, a one-shot bootstrap container, and an nginx-served Vite build. The browser talks to Convex through `VITE_CONVEX_URL`; nginx proxies ordinary HTTP action paths to the backend.

## Docker services and network

`db` is PostgreSQL 16 and persists `db_data`. `backend` is the upstream `ghcr.io/get-convex/convex-backend:latest` image. It exposes client API port 3210 and HTTP actions port 3211, with port 8000 as an alias for HTTP actions. `dashboard` is the Convex dashboard on port 6791. `bootstrap` builds `backend/Dockerfile`, publishes auth keys, pushes `src/convex` as the schema/function migration, and seeds fixtures. `frontend` builds the Vite app and serves it through nginx on port 3000; it waits for bootstrap success. All services share `dogfood-network`. PostgreSQL is connected to Convex through `POSTGRES_URL`.

## Backend domains

Convex functions are grouped by source file. `auth.ts`, `auth.config.ts`, `mfa.ts`, and `lib/authProvider.ts` implement authentication. `users.ts` and `lib/rbac.ts` implement profiles and roles. `events.ts`, `tracks.ts`, and `teams.ts` implement lifecycle, prize tracks, teams, and invite codes. `submissions.ts`, `comments.ts`, and `voting.ts` implement participant work, comments, and public votes. `judging.ts`, `normalization.ts`, and `pairwise.ts` implement assignment, scoring, calibration, and pairwise ranking. `webhooks.ts`, `certificates.ts`, `audit.ts`, and `exports.ts` implement the stretch and integrity surfaces. `http.ts`, `httpPublic.ts`, `lib/jwt.ts`, and `lib/wellKnown.ts` provide HTTP routes, JWT checks, and OIDC discovery.

## Frontend structure

`src/main.tsx` creates the Convex client and Convex Auth provider, configures session-based token storage, and mounts the browser router. `src/App.tsx` declares public and protected routes. `src/components/layout/AppShell.tsx` provides the global shell and role-aware mobile navigation. `src/pages` contains route-level screens. `src/lib` contains validation, token storage, TOTP, safe redirects, and algorithm implementations used in tests and Convex code. State is local React state plus Convex reactive queries and mutations; there is no Redux store.

## Auth and role routing

Sign-up and sign-in are handled by `Auth.tsx` through `useAuthActions().signIn` with the Convex password provider. The server's auth provider writes the account/session records and can require TOTP before minting a session. The client stores tokens in `sessionStorage` through `src/lib/tokenStorage.ts`; legacy local-storage Convex tokens are purged. `Protected` in `App.tsx` waits for Convex auth and renders `Auth` if unauthenticated. `/home` renders `RoleHome`, which sends participants to `/dashboard`, judges to `/judge`, organizers to `/organizer`, and admins to `/admin`. Backend functions repeat role checks and do not rely on frontend routing.

## Key data flows

Creating an event starts in `EventForm.tsx`, which converts form values to timestamps and calls `events.create` or `events.update`. The mutation validates organizer access and writes the event plus an audit record. A public event page links a participant to `/workspace?event=slug`; the workspace loads the selected event and calls `teams.create` or `teams.joinByInviteCode`. Team creation writes a team and leader membership and returns the invite code.

A participant edits a submission in `ParticipantWorkspace.tsx`. Autosave calls `submissions.saveDraft`; final submission calls `submissions.submit`. The mutation validates URLs and fields, checks team membership and the submission deadline, and changes the status. Gallery visibility is controlled by event stage and submission status.

An organizer runs `judging.runAssignment`, which gathers submissions, judges, team membership, and track affinity before calling `planJudgeAssignments`. The resulting assignments are written to Convex. A judge loads `judging.myQueue`, opens `/judge/score/:id`, adjusts criterion sliders, and calls `judging.submitScores`. Organizers run normalization through the normalization backend and source algorithm; resulting data is returned for dashboards and exports. Results publication is represented by event lifecycle stages; a separate result-publication workflow is **not implemented**.

## Offline guarantees

The Compose stack is self-hosted and does not require cloud accounts or third-party runtime APIs. PostgreSQL and Convex data persist in Docker volumes. The source documents a Google Fonts dependency as removed, and the frontend uses local/system font fallbacks. A fully tested air-gapped installation procedure is **not implemented** because the repository still depends on container image availability and npm packages during build.

## Technical decisions

Convex was chosen because it combines the typed database, reactive queries, mutations, authorization boundary, and HTTP action runtime needed by the application. Convex Auth avoids a custom password/session protocol. Session storage is used instead of local storage to reduce credential persistence after a browser tab closes. The custom OIDC discovery document exists because the built-in provider document is too small for strict OIDC clients. The audit log is hash-chained so later rows can detect tampering. Z-score normalization is the primary default because the source explicitly maps per-judge calibration to a common target distribution.

## References

[1]: docker-compose.yml "Compose services and dependencies"
[2]: src/main.tsx "Frontend bootstrap"
[3]: src/App.tsx "Routing and protected wrapper"
[4]: src/pages/Auth.tsx "Auth form and redirect flow"
[5]: src/convex/events.ts "Event mutations"
[6]: src/convex/teams.ts "Team creation and invitation flow"
[7]: src/convex/submissions.ts "Submission mutations"
[8]: src/convex/judging.ts "Judge lifecycle"
