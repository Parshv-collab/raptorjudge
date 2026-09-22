# RaptorJudge 🦖

**Open-source, self-hostable hackathon submission & judging platform** — built for Hackathon Raptors and the Dogfood 2026 challenge.

RaptorJudge handles the entire event lifecycle: registration and team formation, deadline-enforced submissions, algorithmic judge assignment, weighted rubric evaluation, cross-judge score normalization, Bradley-Terry pairwise ranking, community voting with anti-abuse controls, HMAC-signed webhooks, cryptographically verifiable certificates, and a tamper-evident audit log.

Everything runs **100% offline**: no external APIs, no cloud accounts, no third-party auth providers. The backend is [Convex](https://convex.dev) (self-hostable), the frontend is React + TypeScript + Tailwind.

---

## Quickstart

```bash
bun install
bun run dev          # Vite dev server (binds 0.0.0.0)
bun convex dev --once  # push Convex functions / regenerate types
```

Then open the app and click **"seed demo data"** on the sign-in page (or sign in directly — seeding is one click and idempotent).

### Seed credentials

All demo accounts share the password **`dogfood2026`**:

| Account | Email | Purpose |
|---|---|---|
| Admin | `admin@raptors.dev` | full control + one-click role switcher |
| Organizer | `organizer@raptors.dev` | run the event |
| Judge 1 (Harsh) | `judge1@raptors.dev` | Dr. Strict — mean ≈ 4.2 |
| Judge 2 (Lenient) | `judge2@raptors.dev` | Prof. Generous — mean ≈ 8.7 |
| Judge 3 (Balanced) | `judge3@raptors.dev` | Alice Balanced — mean ≈ 6.5 |
| Judge 4 | `judge4@raptors.dev` | Kai Edgecase — σ 1.4 |
| Participant | `participant1@raptors.dev` … `participant6@raptors.dev` | team workspace |

The seeded event is **Dogfood 2026** (`/e/dogfood-2026`) with 12 submitted projects across 4 tracks, biased judge scores (to demonstrate normalization), pairwise matches, quadratic community votes, comments, a webhook registration, and signed certificates.

---

## Feature tiers

### T1 · Core
- Credential auth & sessions (Convex Auth, offline JWT issuer)
- 4 roles: participant / judge / organizer / admin — enforced server-side on every function
- Event lifecycle state machine: `draft → registration → hacking → judging → voting → published → archived`
- Tracks & prizes, teams with invite codes, autosaving drafts, strict deadline enforcement
- Public searchable gallery (hidden until judging starts, seeded-randomizable ordering)

### T2 · Judging
- Judge assignment engine: balanced workloads, track affinity, conflict-of-interest prevention, `k` judges per submission
- Weighted rubrics (weights must sum to 1.0)
- Role isolation: judges only see their own queue; scores only within assigned submissions
- Organizer progress dashboard + reviewer heatmap (per judge × criterion means)
- Cross-judge normalization: **Z-score → N(75, 12²)**, per-judge min-max, Bayesian shrinkage — with proof metrics
- CSV exports (submissions / scores / rankings / assignments) matching the REST API byte-for-byte

### T3 · Public
- Community voting: plain upvote or **quadratic** (casting *n* points costs *n²* credits from a 25-credit budget)
- Vote results hidden until the event reaches `published`
- Rate limiting (20 actions/min/user), fingerprint hashing (no raw IPs stored), Sybil burst detection (≥8 votes / 5 min / fingerprint → audit alert)
- Comments with flagging
- **Append-only, hash-chained audit log** — every entry commits to the previous hash; verification endpoint recomputes the chain

### T4 · Platform
- 100% REST API covering all UI actions (`/api/v1/*`) + OpenAPI 3.0 spec at `/api/openapi.json`
- Webhooks with `X-RaptorJudge-Signature: sha256=HMAC(secret, body)` and delivery logs
- Verifiable certificates: HMAC-SHA256 over a canonical payload; public `/verify/:uuid?signature=…` page
- Bulk JSON export (full event snapshot), embeddable gallery widget at `/embed/gallery/:slug`

### Bonus
- **Normalization proof (+5)** — after z-scoring, `max|mean_j(z)| ≈ 0` and `max|σ_j(z) − 1| ≈ 0` are computed and displayed live
- **Bradley-Terry pairwise mode (+5)** — MM algorithm (`π_i ← W_i / Σ_{j≠i} n_ij/(π_i+π_j)`) with log-likelihood convergence reporting
- **STRIDE threat model (+3)** — anti-abuse controls mapped to the audit trail
- **100% API-first (+3)** — the UI consumes the same Convex functions the REST layer exposes

---

## REST API

Base path `/api/v1` — public reads, bearer-token writes:

```
GET  /api/health
GET  /api/openapi.json
GET  /api/v1/events/:slug
GET  /api/v1/gallery/:slug?search=&randomize=1&seed=
GET  /api/v1/normalization/:slug
GET  /api/v1/pairwise/:slug
GET  /api/v1/export/:slug/:kind        # submissions|scores|rankings|assignments|json (organizer token)
GET  /api/v1/certificates/verify/:uuid?signature=
POST /api/v1/acceptance                # organizer token — runs the tier-by-tier self-check suite
POST /api/v1/auth/switch-role
```

---

## Architecture

```
src/
  convex/            Convex backend (schema, auth, all domain functions, HTTP API)
    crypto.ts        Web-Crypto helpers (SHA-256, HMAC, seeded PRNG)
    lib/audit.ts     append-only hash-chained audit logger
    http.ts          REST router + OpenAPI
    seed.ts          deterministic fixture seeder (auth accounts + demo data)
  lib/algorithms/    pure, unit-testable algorithm cores
    assignment.ts    judge assignment planner
    normalization.ts z-score / min-max / Bayesian + proof metrics
    pairwise.ts      Bradley-Terry (MM) + matchmaker
  pages/             Landing, Auth, EventPublic, Gallery, ProjectDetail,
                     ParticipantWorkspace, JudgePortal, OrganizerDashboard,
                     Verify, EmbedGallery
  components/        AppShell, theme, NormalizationPlayground
```

Design principles: strict server-side RBAC on every Convex function, deadlines enforced in the backend (never the client), hidden vote tallies until publish, and no secret (webhook keys, cert HMAC secret) ever returned by a query.

## Scripts

```bash
bun run dev            # Vite dev server
bun run build          # production build (dist/)
bun run typecheck      # tsc -b --noEmit
bun run test           # vitest unit suite (algorithm cores: normalization, pairwise, assignment)
bun run seed           # (re)seed the deterministic Dogfood 2026 fixtures
bun run acceptance     # run the server-side acceptance suite as the organizer (CI-friendly, exits non-zero on failure)
bun convex dev --once  # push functions + regenerate types
```

## License

MIT — self-host it, fork it, run your whole hackathon on it.
