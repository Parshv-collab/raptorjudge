# Architecture

RaptorJudge is a React + TypeScript single-page app on a **self-hosted Convex**
backend. Convex is the database *and* the function runtime: there is no separate
Node/Python API server to write or deploy. Docker Compose runs PostgreSQL, the
Convex backend, the Convex dashboard, a one-shot bootstrap container, and an
nginx-served Vite build.

---

## 1. System overview

```
                        ┌──────────────────────────────────────┐
   browser              │  frontend (nginx :3000)              │
   ───────────────────▶ │  • serves the Vite build             │
                        │  • CSP / nosniff / no-referrer       │
                        │  • proxies /api/* → backend:3211     │
                        │  • proxies /ws_api → backend:3210    │
                        └──────────────┬───────────────────────┘
                                       │
                    Convex client API  │  HTTP actions (/api/*)
                    (queries/mutations │  (REST + auth + OIDC)
                     /actions/sync)    │
                                       ▼
                        ┌──────────────────────────────────────┐
                        │  backend (Convex, :3210 / :3211)     │
                        │  schema + queries + mutations        │
                        │  actions + HTTP router               │
                        └──────────────┬───────────────────────┘
                                       │ POSTGRES_URL
                                       ▼
                        ┌──────────────────────────────────────┐
                        │  db (PostgreSQL 16, volume db_data)  │
                        └──────────────────────────────────────┘

                        ┌──────────────────────────────────────┐
                        │  bootstrap (one-shot)                │
                        │  1. publish Convex Auth RS256 keys   │
                        │  2. push function bundle (= migration)│
                        │  3. verify real functions answer      │
                        │  4. seed fixtures                     │
                        └──────────────────────────────────────┘
```

The browser reaches Convex **directly** for reactive data (`VITE_CONVEX_URL`,
default `http://localhost:3210`) and goes through nginx for the REST surface
(`/api/*` → `backend:3211`). The SPA calls `/api/*` relatively, so no backend
origin is hardcoded in frontend code.

---

## 2. Docker services and networking

| Service | Image / build | Ports | Role |
|---|---|---|---|
| `db` | `postgres:16` | — | Convex's persistent store (`db_data`) |
| `backend` | `ghcr.io/get-convex/convex-backend:latest` | `3210` client API, `3211` HTTP actions, `8000` alias | Database + function runtime + HTTP router |
| `dashboard` | `ghcr.io/get-convex/convex-dashboard:latest` | `6791` | Operator dashboard |
| `admin_key` | same image as `backend` | — | One-shot: runs the backend image's own `generate_admin_key.sh` and writes the key to the `admin_key` volume (always exits 0) |
| `bootstrap` | `build: backend/Dockerfile` | — | One-shot: auth keys → deploy → verify → seed |
| `frontend` | `build: frontend/Dockerfile` | `3000` | nginx serving the SPA and proxying `/api/*` |

All six share the bridge network `dogfood-network`. Startup order is enforced by
health/exit gates, not sleeps:

```
db (healthy) ─▶ backend (healthy, /version) ─▶ admin_key (exits 0) ─▶ bootstrap (exits 0) ─▶ frontend
                                    └──▶ dashboard (in parallel, once the backend is healthy)
```

`bootstrap` is the schema migration step. Convex has no migration files: pushing
the function bundle creates/updates every table and index in
`src/convex/schema.ts`. After the push it *verifies* the bundle by invoking real
functions (`users:me`, `events:listPublic`) and fails closed on
`Could not find public function` — `convex deploy` can silently target the wrong
deployment, which would otherwise leave the SPA failing every query.

`POSTGRES_URL` deliberately omits the database name: the backend appends it from
`INSTANCE_NAME` (`dogfood` → `dogfood`).

`frontend` waits on `service_completed_successfully` from `bootstrap` for the same
reason. An SPA pointed at an empty backend *looks* fine and then fails every
query — so the stack refuses to serve until the functions are live.

---

## 3. Backend domains

| Module | Responsibility |
|---|---|
| `auth.ts`, `auth.config.ts`, `mfa.ts`, `lib/authProvider.ts`, `lib/signInErrors.ts` | Credentials auth, uniform failure messages, the attempt throttle's client-facing copy, optional TOTP, provider guard |
| `users.ts`, `adminReset.ts`, `lib/rbac.ts`, `lib/common.ts`, `lib/timeWindows.ts` | Profiles, audited password reset, the shared authorization guards and the event-window predicates |
| `events.ts`, `tracks.ts`, `teams.ts`, `teamChat.ts`, `participate.ts` | Lifecycle + stage machine, prize tracks, teams + invite codes, private team chat, enrollment |
| `submissions.ts`, `comments.ts`, `voting.ts` | Draft autosave + deadline lock + gallery + duplicate detection; comment moderation; plain/quadratic voting with hidden tallies |
| `judging.ts`, `normalization.ts`, `pairwise.ts` | Rubrics + locking, assignment, scoring, z-score normalization, Bradley–Terry |
| `certificates.ts`, `webhooks.ts`, `exports.ts`, `imports.ts`, `audit.ts`, `admin.ts`, `winnerOverrides.ts` | Certificates, signed webhook delivery, CSV/JSON export, bulk import, hash-chained audit, invites + settings, winner-override queue |
| `branding.ts`, `notifications.ts`, `help.ts`, `lib/defaultRubric.ts` | Allowlisted platform branding read by the shell, the per-user notification feed, seeded help content, the default rubric |
| `http.ts`, `httpPublic.ts`, `lib/jwt.ts`, `lib/wellKnown.ts`, `lib/secretBox.ts` | REST router, bearer/session verification, OIDC discovery, at-rest sealing |
| `lib/securityChecks.ts`, `acceptance.ts`, `crons.ts`, `seed.ts` | The self-check batteries, retention crons, the seeded fixture world |
| `crypto.ts`, `lib/audit.ts`, `lib/results.ts` | SHA-256 / HMAC / mulberry32 seeded PRNG, the audit-chain writer, the one ranking helper every surface shares |

Pure, dependency-free algorithm modules live outside Convex in
`src/lib/algorithms/` (`assignment.ts`, `normalization.ts`, `pairwise.ts`,
`duplicates.ts`) so they can be unit-tested directly and reused by the proof
script. The Convex layer only gathers inputs and persists results.

---

## 4. Frontend structure

- `src/main.tsx` — Convex client, `ConvexAuthProvider` with a `sessionStorage`
  token store, `BrowserRouter`, the Sonner toaster, and the global stylesheet.
- `src/App.tsx` — the route table (43 path-bearing routes; 27 of them wrapped in
  `ProtectedRoute`, `/home` in `Protected`).
  Public routes sit under the `AppShell` layout; `/auth` and `/invite/:token` use a
  minimal layout; `/embed/gallery/:slug` is outside both so it can be iframed.
- `src/components/ProtectedRoute.tsx` — the single role gate (`no session` →
  `/auth?returnTo=…`, `wrong role` → the visitor's own console).
- `src/components/ui/` — the design system: Button, Card, Table, StatCard, Badge,
  Tabs, Modal (+ `ConfirmDialog` / `DangerConfirmModal`), Input, PasswordInput,
  Textarea, Select, Dropdown, Checkbox, ChipGroup, Alert, ProgressBar, Skeleton
  family, EmptyState, Avatar, Toast, QrCode, PageHeader, Markdown. There is no
  third-party component library.
- `src/components/layout/`, `events/`, `participant/` — the app shell, the event
  discovery cards, and the participant-only panels.
- `src/pages/` — one file per route-level screen, plus `src/pages/organizer/` for
  the organizer's per-event tab panels.
- `src/lib/` — validation, safe redirects, token storage, TOTP, rate-limit policy,
  CSV, date formatting, derived event status, error humanization, and the
  algorithm modules above. Nothing in `src/lib/` imports Convex, so the same
  modules run in the browser, in mutations and in the Node proof script.

State is Convex reactive queries plus local React state. There is no Redux store
and no client-side cache to invalidate: a mutation that writes data re-renders
every subscribed component automatically.

---

## 5. Auth flow and role routing

```
sign-in form ─▶ signIn("password", { email, password, flow })
                        │
                        ├─ attempt throttle   (platform: ratelimit:auth:<sha256(email)>)
                        ├─ password verify    (scrypt, @convex-dev/auth)
                        ├─ account disabled?  → ACCOUNT_DISABLED
                        ├─ TOTP required?     → TOTP_REQUIRED (no session minted)
                        │   └─ retry with { totp } → verify → session
                        ▼
                   local JWT session (RS256, JWT_PRIVATE_KEY / JWKS)
                        ▼
                   browser token in sessionStorage
```

Two hardening layers sit between the library and the client:

1. **Uniform failures.** `InvalidAccountId`, `InvalidSecret` and
   `TooManyFailedAttempts` all collapse to one message, so sign-in cannot be used
   to enumerate accounts. Sign-up is exempt on purpose — registration must be
   able to say "that address is taken". The mapping lives in
   `lib/signInErrors.ts` and every error the UI shows is routed through
   `describeSignInFailureForUser`, so the throttle surfaces as its own sentence
   ("Too many attempts for this email…") instead of a generic failure.
2. **Credential-attempt throttle.** Every sign-in and sign-up attempt charges one
   slot from a fixed window keyed by `sha256(email)` — **20 attempts per 5
   minutes, and successful attempts count too**. The library's own lockout resets
   on a successful sign-in and does not cover sign-up; this closes both gaps, and
   an unregistered address is throttled at exactly the same point.

**Route protection.** `Protected` in `App.tsx` waits for Convex auth, then
redirects signed-out visitors to `/auth?returnTo=<path+query>` rather than
rendering the login form in place, so the destination survives the round-trip.
`/home` renders `RoleHome`, which dispatches participants to `/dashboard`, judges
to `/judge`, organizers to `/organizer` and admins to `/admin`. Every other
authenticated route is wrapped in `ProtectedRoute`
(`src/components/ProtectedRoute.tsx`), which adds the per-route `requiredRole`;
`/search` and every `/workspace`, `/judge`, `/organizer`, `/admin`, `/profile`,
`/settings`, `/security` route are gated.

**Role routing is a convenience, not a control.** Every backend function repeats
the check. See [JUDGING.md §7](JUDGING.md#7-role-isolation) for the endpoint
matrix.

---

## 6. Judging engine architecture

```
organizer                     judge                        organizer
─────────                     ─────                        ─────────
previewAssignment (query)
   └ planJudgeAssignments ────┐
runAssignment (mutation)      │  pure, seeded, unit-tested
   └ persists assignments ────┘
                              │
                     myQueue (own only)
                              ▼
                    submitScores ──▶ judgeScores (+ status=completed)
                              │
                              ▼
        normalization.analyze ──▶ normalizeScores (z, min-max, Bayesian)
                              │        │
                              │        └─ ten-point 5 + 2z ranking
                              ▼
        pairwise.leaderboard ──▶ bradleyTerry MM (organizer-only pre-publish)
                              ▼
                    stage = published  ──▶  tallies, records, certificates
```

Design decisions worth calling out:

- **Assignment is a pure function.** `planJudgeAssignments(input) → plan` takes a
  plain object and returns a plain object. It is deterministic for a given seed,
  so it is unit-tested (`tests/assignment.test.ts`) and re-run against live data
  by the `sec.assignment_load_cap` self-check.
- **Normalization is one module, three methods.** z-score is the primary method;
  min-max and Bayesian run alongside so the results screen can show whether the
  ranking is method-dependent. The published proof calls the same module, so it
  cannot drift.
- **Locks are server state.** A rubric lock is a `platform` row plus the event
  stage — not a UI flag. Every criterion write passes through
  `assertRubricEditable`.
- **Visibility follows the stage.** Hidden vote tallies, gated normalization,
  gated pairwise leaderboard and judge records all key off the event's `status`
  in one place per domain.

---

## 7. Offline guarantees

The stack is self-hosted and needs no cloud account or third-party runtime API:

- **No external service is called at runtime** — auth is local password auth,
  certificates and webhooks are signed locally with `crypto.subtle`, and
  normalization is arithmetic over local data.
- **Fonts are bundled, not fetched** — Inter Tight and JetBrains Mono ship as
  `@fontsource-variable/*` packages imported from `src/index.css`, so the UI does
  not depend on a font CDN.
- **Data persists** in the `db_data` and `convex_data` Docker volumes.
- **Webhook targets may be private addresses** (self-hosting means a receiver on
  the same network is the normal case); the validator blocks cloud-metadata
  addresses specifically rather than all RFC-1918 space.

Honest limits: the **build** needs the container images and npm packages (use a
registry mirror for an air-gapped install), the images are not digest-pinned, and
a fully scripted air-gap installation procedure is not included. Everything after
`docker compose up` runs with no network access.

---

## 8. Technical decisions

**Why Convex.** The app needs a typed database, reactive queries, an
authorization boundary and an HTTP action runtime in one deployable. Convex
provides all four and its schema is TypeScript, so a bad field reference is a
compile error rather than a runtime 500. It also self-hosts, which keeps the
"runs on your own hardware" promise real.

**Why PostgreSQL inside Convex.** The upstream Convex backend can persist to
PostgreSQL instead of its embedded SQLite; using it means the Compose stack has a
genuine, inspectable, dumpable source of truth that a host already knows how to
back up.

**Why nginx.** The SPA is static after build, and the browser-side security policy
(CSP, `nosniff`, `Referrer-Policy`, `frame-ancestors`, `X-Frame-Options`) belongs
in one place. nginx terminates that policy and proxies `/api/*` so the frontend
never hardcodes a backend origin.

**Why `sessionStorage` for tokens.** A token that survives a browser restart is a
standing credential; a per-tab token that dies with the tab is a smaller blast
radius. Legacy `localStorage` tokens are purged at startup.

**Why z-score normalization.** Raw averages measure judge severity as much as
project quality. Standardizing per judge removes the panel's personal scale
before averaging, which is the difference the fixture data demonstrates.

**Why hash-chain the audit log.** An append-only log that anyone can rewrite
proves nothing. Chaining each entry to its predecessor's hash makes tampering
detectable by recomputation, and `audit.verifyChain` is exposed so an operator can
prove it rather than trust it.

**Why a `platform` key/value table for locks and specialisations.** Adding a
column would be a schema change; the deployed schema is frozen in some
environments, and lock/specialisation state is naturally sparse. These rows are
stripped by the settings projection so they never reach a client.
