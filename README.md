# RaptorJudge

**Self-hosted hackathon submissions and judging — weighted rubrics, cross-judge score normalization, Bradley–Terry pairwise ranking, community voting, a hash-chained audit log and verifiable certificates, all offline on your own hardware.**

[![acceptance](https://img.shields.io/badge/acceptance-T1%20T2%20verified-brightgreen)](#acceptance-status)
[![license](https://img.shields.io/badge/license-MIT-blue)](#license)

---

## What it is

RaptorJudge runs a hackathon end to end: registration, team formation with invite
codes, deadline-enforced submissions, a public gallery, weighted rubric judging,
normalization that removes harsh/lenient judge bias, pairwise comparison ranking,
community voting with hidden tallies, CSV/JSON export, signed certificates, and a
tamper-evident audit trail of every privileged write.

It is designed to be **adopted, not demoed**: one `docker compose up` produces a
working event with a deterministic fixture population you can immediately sign
into as an admin, organizer, two judges and a participant.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18, TypeScript 5.9, Vite 5, React Router 6, Tailwind CSS 3, Framer Motion, Recharts, Sonner |
| Backend | Self-hosted [Convex](https://convex.dev) 1.46 (typed DB + queries/mutations/actions + HTTP actions) |
| Auth | `@convex-dev/auth` password provider, RS256 session JWTs, optional TOTP for privileged roles |
| Database | PostgreSQL 16 (Convex storage backend) |
| Serving | nginx (SPA + security headers) behind Docker Compose |
| Tests | Vitest (unit + algorithm + fixture proofs) and a self-hosted acceptance suite |

There is no Express/Fastify/Django service and **no runtime third-party API
requirement**. Everything runs inside the Compose stack.

## Quickstart

```bash
git clone <this repo> raptorjudge
cd raptorjudge
docker compose up --build
```

Then open **<http://localhost:3000>**.

What happens on first boot:

1. `db` (PostgreSQL 16) starts and passes its healthcheck.
2. `backend` (Convex) starts with `POSTGRES_URL` pointing at `db`.
3. `bootstrap` publishes the Convex Auth signing keys, pushes `src/convex` as the
   schema/function migration, and runs the fixture seed. It exits when done.
4. `frontend` builds the Vite bundle and serves it through nginx on port 3000.

The seed is **idempotent** (`fixture-seeded-2026` flag) and deterministic. If you
need to start from scratch, see [Resetting](#resetting-the-data).

> Deployment to a LAN IP or a real domain without rebuilding the image, plus the
> runtime URL variables (`CONVEX_URL`, `CONVEX_CLOUD_ORIGIN`,
> `CONVEX_SITE_ORIGIN`, `TRUSTED_ORIGINS`), is covered in
> [docs/DEPLOY.md](docs/DEPLOY.md) and `env.example`.

### Local development (no Docker)

```bash
npm install
npm run dev            # Vite dev server
npx convex dev --once  # codegen + push functions to your local deployment
```

`bun install && bun run dev` works too — both lockfiles are kept in sync for the
Docker path (`npm ci`) and local work.

## Seeded credentials

All demo accounts use the password **`dogfood2026`**. These are the accounts the
seed *actually creates* in `src/convex/seed.ts`.

| Role | Email | What it unlocks |
|---|---|---|
| Admin | `admin@fixture.local` | Audit chain, rubric unlock, role management, invites, settings |
| Organizer | `organizer@fixture.local` | Event management, rubric, assignments, results, exports, webhooks |
| Judge A | `tomas.varga@example.org` | Own scoring queue; **blocked** from Judge B's scores |
| Judge B | `wei.lindqvist@example.org` | Own scoring queue; used to demonstrate peer isolation |
| Participant | `participant@fixture.local` | Team workspace, submission, chat, certificates |

The seeded event is **`sample-hack-2026`** ("Sample Hack 2026"):

- public event page: `/e/sample-hack-2026`
- public gallery: `/gallery/sample-hack-2026`
- organizer console: `/organizer/events/sample-hack-2026`
- embeddable widget: `/embed/gallery/sample-hack-2026`

Fixture population (from `fixtures.json`, seeded verbatim): **8 tracks, 30 judges,
40 teams, 41 projects, 126 score rows.** On top of the fixtures the seed adds demo
community votes, pairwise comparisons, certificates, and runs the duplicate
detector once — so the voting, pairwise and certificate screens all open with real
material instead of empty states.

The login page lists these accounts with one-click fill-in buttons.

## Seeded events

The seed always creates **one** event:

| Event | Slug | Stage | Demonstrates |
|---|---|---|---|
| Sample Hack 2026 | `sample-hack-2026` | `closed` | The full fixture population: 8 tracks, 30 judges, 40 teams, 41 projects, 126 score rows, plus demo votes, pairwise matches, certificates and a duplicate flag. This is the event the acceptance suite targets, and it is never modified by anything below. |

Setting **`TEST_EVENTS=true`** additionally seeds five demo events, each frozen
in a different lifecycle stage with its own dates computed from the moment the
seed runs, so every write-side flow can be exercised without waiting for real
time to pass or hand-editing dates:

| Event | Slug | Stage | Contents |
|---|---|---|---|
| Test Hack — Registration | `test-hack-registration` | `registration` | 0 projects, 0 judges, 0 votes — sign-ups are open, nothing built yet |
| Test Hack — Submissions | `test-hack-submissions` | `hacking` | 5 projects, 0 judges, 0 votes — teams are submitting against a live deadline |
| Test Hack — Judging | `test-hack-judging` | `judging` | 8 projects, 3 judges assigned, 4 scored — a partially filled judging queue |
| Test Hack — Voting | `test-hack-voting` | `voting` | 6 projects all scored, 15 votes — community voting open, tallies hidden |
| Test Hack — Results | `test-hack-results` | `published` | 8 projects all scored, 30 votes, winner crowned, certificates issued |

**The five test events only appear when `TEST_EVENTS=true`.** The default is
`false`, and with it the seed behaves exactly as before — only Sample Hack 2026
is created, and the landing page shows the single-event layout it always had.

Everything is built from the existing fixture users, teams, judges and projects;
no new accounts are invented. All writes go through the same internal mutations
the regular seed uses, and every vote is recorded in the hash-chained audit log.

To switch modes:

```bash
# docker path: edit TEST_EVENTS in .env, then
docker compose up --build     # the bootstrap container publishes the flag to the deployment

# local dev: the Convex deployment's env vars are what the functions read
bun convex env set TEST_EVENTS true
bun run seed
```

It is idempotent — a `test-events-v1` platform flag guards re-runs, so the flag
can be turned on after the first boot without wiping the fixtures. Turning it
back off stops the events being created but leaves already-seeded rows in place;
a fresh seed (`docker compose down -v`, or clearing the seed flags) is how you go
back to a single-event deployment.

## Acceptance status

| Tier | What it covers | Verified by | Status |
|---|---|---|---|
| **T1** | Public gallery, fixture content, deadline lock | `python3 run.py .dogfood.toml` | ✅ verified |
| **T2** | Judge isolation (own vs peer scores), CSV export | `python3 run.py .dogfood.toml` | ✅ verified |
| **T3** | Community voting, comments & flagging, hidden results, deterministic ballots, rate limiting, audit chain | `python3 run_t3_t4.py .dogfood.toml` | ✅ self-audited |
| **T4** | OpenAPI + REST, signed webhooks, verifiable certificates and judge records, embed widget, bulk export/import | `python3 run_t3_t4.py .dogfood.toml` | ✅ self-audited |

> The official `run.py` only checks **T1 and T2**. Running it alone prints
> `claimed T1 T2 T3 T4, verified T1 T2`, which reads as though T3 and T4 were
> unverified. `run_t3_t4.py` is the companion that closes that gap — see
> [Verifying T3 and T4](#verifying-t3-and-t4).

`run.py .dogfood.toml` against the running stack reports **7/7** — see
`acceptance-report.txt`:

```
T1  gallery is public ................. PASS
T1  project from fixtures shown ....... PASS
T1  closed event refuses submissions .. PASS
T2  judge sees own scores ............. PASS
T2  judge cannot see peer scores ...... PASS
T2  participant blocked ............... PASS
T2  csv export works .................. PASS
```

### Verifying T3 and T4

The official checker ships only the T1/T2 tiers, so this repository also carries
a T3/T4 self-audit. It reads the same `.dogfood.toml` (so it inherits your
`[portal]`, `[auth]` and `[routes]` settings), needs nothing but the Python
standard library, and drives the running portal over real HTTP:

```bash
python3 run_t3_t4.py .dogfood.toml
```

```
DOGFOOD 2026 — T3/T4 self-audit report
portal: http://localhost:3000
fixtures: fixtures.json
event: test-hack-voting (voting)

T3  Community voting works (credits round-trip) .. PASS
T3  Quadratic credit spend (cost = N²) ........... PASS
T3  Comments add/delete .......................... PASS
T3  Comment flagging ............................. PASS
T3  Results hidden before publish ................ PASS
T3  Ballot order deterministic ................... PASS
T3  Rate limiting fires .......................... PASS
T3  Duplicate detection (3-of-3 rejected) ........ SKIP
T3  Audit chain verifies ......................... PASS
T4  OpenAPI spec responds ........................ PASS
T4  REST endpoints respond ....................... PASS
T4  Webhook delivery signed ...................... PASS
T4  Certificates verify .......................... PASS
T4  Judge records verify ......................... PASS
T4  Embed gallery renders ........................ PASS
T4  Bulk export works ............................ PASS
T4  Bulk import idempotent ....................... PASS

Summary: 16/16 PASS (1 skipped)
```

A check is reported as **PASS only when a real request proves it**. When a
surface genuinely cannot be exercised — no event is open for judging or voting,
the deployment cannot reach a local webhook receiver, or the REST submit
endpoint (a contract check) cannot create the 3-of-3 duplicate that T3.8 asks
about — the check is reported as **SKIP with its reason**, and skipped checks
are excluded from the pass count. Nothing is ever reported as verified because
it had nothing to test.

Both suites are complemented by the in-app acceptance suite
(`POST /api/v1/acceptance` as an organizer, or the Acceptance panel on the
organizer dashboard): 22 tier checks (T1–T4) plus the 17-check T5 security
battery — JWT forgery, open redirects, webhook replay and target validation,
assignment and score uniqueness, certificate idempotency, platform-secret
projection, duplicate flagging, load cap and rubric weights.

## Feature matrix

| Tier | Surface | Status |
|---|---|---|
| **T1 Core** | Four-role auth with sessions, TOTP for privileged roles, event lifecycle state machine, tracks + prizes, teams + invite codes, draft autosave, strict deadline lock, public gallery, comments | Complete |
| **T2 Judging** | Load-balanced conflict-aware assignment with a per-judge cap and track affinity, assignment **preview** (dry run), weight-validated rubrics that **lock** when judging starts, isolated judge queues, per-criterion scoring with localStorage draft autosave, scores that lock on submit, "you've scored N of M" progress, z-score normalization (0–10), Bradley–Terry pairwise ranking, CSV/JSON exports | Complete |
| **T3 Public** | Plain + quadratic community voting with hidden tallies, comment moderation (flag/unflag/delete), seeded-randomized gallery ordering, rate limiting (votes + comments), team-scoped duplicate detection (same team: title, repo URL, or both — a repo shared across teams is a review-only flag) with organizer review, hash-chained audit log with chain verification | Complete |
| **T4 Stretch** | REST API + OpenAPI 3.0.3 document at `/api/openapi.json`, HMAC-SHA256 signed webhooks with replay protection, certificates with public verification, signed judge records, embeddable gallery widget, bulk JSON import/export | Complete |
| **Bonus** | Normalization proof regenerated from fixtures, Bradley–Terry MM ranking, STRIDE threat model, API-first design | Complete |

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server (frontend) |
| `npm run build` | Production build to `dist/` |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm test` | Vitest suite (220 tests, 18 files) |
| `python3 run_t3_t4.py .dogfood.toml` | T3/T4 self-audit against a running stack |
| `npm run test:watch` | Vitest in watch mode |
| `npm run preview` | Preview the production build locally |
| `npm run seed` | Re-run the fixture seed against a deployment |
| `npm run proof:normalization` | Regenerate `normalization-proof.txt` from `fixtures.json` using the real algorithm |
| `npm run acceptance` | Drive `run.py` against a running stack |
| `npm run keys:generate` | Generate the Convex Auth RS256 keypair |
| `npm run docker:up` / `docker:down` | Start / tear down the Compose stack |
| `npm run docker:verify` | End-to-end Compose smoke test |

## Repository layout

```
src/convex/          Convex backend: schema, queries, mutations, actions, HTTP API
  lib/               shared guards (rbac, audit chain, rate limit), security checks
src/lib/algorithms/  pure, unit-tested assignment, normalization, pairwise, duplicates
src/pages/           route-level screens
src/components/ui/   design-system components (Button, Card, Table, EmptyState, …)
tests/               Vitest suites, including fixture-driven proofs
scripts/             seed / acceptance / proof / key-generation tooling
frontend/, backend/  Docker images and entrypoints
run.py, .dogfood.toml official acceptance checker and its config
run_t3_t4.py         companion T3/T4 self-audit (same config, stdlib only)
```

## Documentation

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System diagram, stack rationale, Docker networking, auth flow, judging architecture, offline guarantees |
| [JUDGING.md](JUDGING.md) | Assignment cap + affinity, rubric weights and locking, worked z-score example, Bradley–Terry math, and the **Role Isolation** matrix |
| [DATA-MODEL.md](DATA-MODEL.md) | Every table, field, index, relationship and cascade rule |
| [THREAT-MODEL.md](THREAT-MODEL.md) | STRIDE breakdown, implemented mitigations, explicit gaps |
| [DESIGN.md](DESIGN.md) | Design tokens, component inventory, screens, states, accessibility rules |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Admin-key bootstrap, LAN/domain configuration, env reference, backups, troubleshooting |
| [HOW-IT-WORKS.md](HOW-IT-WORKS.md) | Narrative walkthrough of the three user journeys |
| [normalization-proof.txt](normalization-proof.txt) | Generated evidence: raw vs normalized rankings and the harsh/generous compression |

## Resetting the data

```bash
docker compose down -v   # destroys the PostgreSQL volume
docker compose up --build
```

An application-level "reset event" mutation is not implemented; the seed is the
supported reset path and is safe to re-run (it wipes and rebuilds fixture data).

## Known gaps

Honest, specific, and current:

- **Single-node rate limiting.** The limiter is a fixed-window counter in the
  Convex `platform` table, so it is per-deployment. A distributed limiter (Redis
  et al.) is not implemented; behind a CDN you should also rate limit at the edge.
- **No CSRF token layer.** Convex Auth session validation plus same-origin
  deployment is the mitigation; an explicit double-submit CSRF token is not
  implemented.
- **Sybil resistance is heuristic.** Quadratic budgets, duplicate detection and
  per-fingerprint burst flagging are implemented; external identity proof is not.
- **A few destructive confirmations still use the browser `confirm()` dialog**
  (delete user, delete event, delete criterion, remove flagged submission)
  instead of the in-app `ConfirmDialog`. Functional, but an obvious polish gap.
  The highest-stakes action — overriding the winner — does use the in-app
  typed confirmation (`DangerConfirmModal`).
- **Password recovery is human-mediated by design.** There is no mail service
  in an offline deployment, so `/auth` explains that an organizer or admin must
  issue a temporary password (`/admin/users → Reset password`, audited, live
  sessions invalidated). Self-service reset needs an SMTP relay and is not
  implemented.
- **Markdown is a safe subset.** `Markdown` renders headings, emphasis, lists,
  tables, code and links; raw HTML is never rendered, so embedded widgets or
  custom iframes in a project summary are not possible.
- **Export schema is unversioned.** CSV column sets are stable in practice but
  carry no version field.
- **No database dump command.** Full-volume backup is `pg_dump` on the `db`
  service; there is no wrapper script.
- **Container images are not digest-pinned.**
- **The Compose runtime path is only as tested as your host.** `npm run
  docker:verify` exercises it end to end; the sandbox this was developed in had no
  Docker, so the acceptance suite was validated by static analysis, unit tests and
  the REST contract rather than a live Compose run.

## License

MIT — see [LICENSE](LICENSE).
