# RaptorJudge 🦖

**Open-source, self-hostable hackathon submission & judging platform** — built for Hackathon Raptors and the Dogfood 2026 challenge.

RaptorJudge handles the entire event lifecycle: registration and team formation, deadline-enforced submissions, algorithmic judge assignment, weighted rubric evaluation, cross-judge score normalization, Bradley-Terry pairwise ranking, community voting with anti-abuse controls, HMAC-signed webhooks, cryptographically verifiable certificates, and a tamper-evident audit log.

Everything runs **100% offline**: no external APIs, no cloud accounts, no third-party auth providers. The backend is [Convex](https://convex.dev) (self-hostable), the frontend is React + TypeScript + Tailwind, and the whole stack runs under Docker Compose. The toolchain is standard **Node.js 20 + npm**.

---

## Quickstart

```bash
docker compose up --build
```

Then open **http://localhost:3000** and click **"seed demo data"** on the sign-in page (seeding is one click and idempotent).

> **One-time bootstrap.** Self-hosted Convex mints its admin key *inside the
> backend*, so the very first run needs that key pasted into `.env` before the
> functions can be pushed. It is three commands — see
> [Docker & self-hosting](#docker--self-hosting).

<details>
<summary>Local development without Docker</summary>

```bash
npm install
npm run dev            # Vite dev server (binds 0.0.0.0)
npx convex dev --once  # push Convex functions / regenerate types
```

</details>

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

## Docker & self-hosting

`docker compose up` brings up the entire platform offline: no cloud account, no third-party service, and no outbound network access at runtime.

| Service | Image / build | Purpose | URL |
|---|---|---|---|
| `db` | `postgres:16` | Convex's persistent store | — |
| `backend` | `ghcr.io/get-convex/convex-backend:latest` | Convex backend (database + function runtime) and the `/api/*` REST layer | http://localhost:3210 (client API) · http://localhost:3211 (HTTP actions) |
| `dashboard` | `ghcr.io/get-convex/convex-dashboard:latest` | Convex admin dashboard | http://localhost:6791 |
| `bootstrap` | `backend/Dockerfile` | one-shot: publishes auth keys, pushes functions (the migration), seeds fixtures | — |
| `frontend` | `frontend/Dockerfile` (Vite → nginx) | the web app; nginx proxies `/api/*` to the backend | http://localhost:3000 |

### Why this shape

The brief this stack was built from assumed a Node/Python REST server plus Postgres and `bun:sqlite`. This project is not that, so the mapping is:

- **The backend is Convex**, an open-source database + serverless-function runtime. There is no Express/Fastify/uvicorn process to containerize — the backend *is* the upstream `convex-backend` image, so the `backend` service runs it directly rather than `build`-ing a server.
- **There is no `bun:sqlite` to migrate.** Convex owns its storage engine, defaulting to embedded SQLite and supporting Postgres as a production store. The compose `db` service is wired up as Convex's *real* backing store via `POSTGRES_URL`, not left as an unused container.
- **Migrations are function pushes.** Convex has no SQL migration files; `convex deploy` applies `src/convex/schema.ts`, which is exactly what `bootstrap` does on startup before seeding.

### One-time bootstrap

Self-hosted Convex derives its admin key from `INSTANCE_SECRET` inside the backend, and no environment variable provisions one, so the first run mints it once:

```bash
cp env.example .env                                   # env template (.env is git-ignored)
docker compose up -d db backend                       # start Postgres + Convex backend
docker compose exec backend ./generate_admin_key.sh   # mint the admin key
# → paste the printed key into .env as CONVEX_SELF_HOSTED_ADMIN_KEY=...
docker compose up --build                             # everything: push functions + seed
```

After that, `docker compose up` is the only command you need.

### Health checks

```bash
curl http://localhost:3000/api/health   # through nginx, the way the app calls it
curl http://localhost:8000/api/health   # 8000 is an alias for the HTTP-actions port
```

Expected: `{"ok":true,"service":"raptorjudge","version":"1.0.0","mode":"offline","time":"…"}`

### Configuration notes

- `VITE_CONVEX_URL` is inlined by Vite **at build time**. Repointing the app at another backend means `docker compose build frontend`.
- `CONVEX_CLOUD_ORIGIN` / `CONVEX_SITE_ORIGIN` must be the origins the **browser** uses to reach the backend. `CONVEX_SITE_ORIGIN` is what `src/convex/auth.config.ts` verifies session JWTs against.
- `INSTANCE_SECRET` is the root secret — rotate it (`openssl rand -hex 32`) for anything real. Rotating it invalidates all existing keys and sessions.
- Convex Auth's CLI does not support self-hosted deployments, so `bootstrap` mints the `JWT_PRIVATE_KEY` / `JWKS` pair itself (`npm run keys:generate`) and publishes it with `npx convex env set`.
- The only outbound request the app makes is the Google Fonts stylesheet in `index.html`; it degrades gracefully offline. Remove it or self-host the fonts for a fully air-gapped install.

### Troubleshooting

**`Could not find public function for 'users:me'` in the browser console**

The app is being served against a Convex backend that has no function bundle —
invariably because the one-time admin key bootstrap was not completed, so
`bootstrap` never pushed the functions.

`frontend` declares `depends_on: bootstrap: condition:
service_completed_successfully`, so this should stop nginx from starting at all
and `bootstrap` should have exited non-zero with instructions. If you already
have nginx running from an earlier `up`, check the bootstrap logs and re-run:

```bash
docker compose logs bootstrap
docker compose up -d db backend                       # backend must be up
docker compose exec backend ./generate_admin_key.sh   # mint the admin key
# → .env: CONVEX_SELF_HOSTED_ADMIN_KEY=<key>
docker compose up --build
```

The `bootstrap` container now also probes `users:me` after deploying, so a
deploy that silently no-ops fails the container instead of the browser.

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

docker-compose.yml   self-hosted stack: Postgres + Convex backend + dashboard + app
backend/             bootstrap image (function push + seed)  → backend/Dockerfile
tests/               vitest unit tests for the pure algorithm cores
```

Design principles: strict server-side RBAC on every Convex function, deadlines enforced in the backend (never the client), hidden vote tallies until publish, and no secret (webhook keys, cert HMAC secret) ever returned by a query.

## Scripts

```bash
npm run dev            # Vite dev server
npm run build          # production build (dist/)
npm run typecheck      # tsc -b --noEmit
npm test               # vitest unit suite (algorithm cores: normalization, pairwise, assignment)
npm run seed           # (re)seed the deterministic Dogfood 2026 fixtures
npm run acceptance     # server-side acceptance suite as the organizer (exits non-zero on failure)
npm run keys:generate  # mint a Convex Auth RS256 keypair (self-hosted deployments)
npx convex dev --once  # push functions + regenerate types

npm run docker:up      # docker compose up --build
npm run docker:down    # docker compose down -v
```

## License

MIT — self-host it, fork it, run your whole hackathon on it.
