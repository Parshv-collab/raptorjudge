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

**`Auth provider discovery of http://…:3211 failed — Failed to parse server response`**

`auth.addHttpRoutes(http)` from `@convex-dev/auth` serves
`/.well-known/openid-configuration`, but its document has only three fields
(`issuer`, `jwks_uri`, `authorization_endpoint`). That is enough for Convex's own
JWT verification and **not** a valid OIDC Discovery 1.0 / RFC 8414 document, so
strict clients reject it.

`src/convex/http.ts` now hands `addHttpRoutes()` a thin shim that keeps every
route it registers — including `/.well-known/jwks.json`, which JWT verification
depends on — and swaps only the discovery handler for a complete document built
by `src/convex/lib/wellKnown.ts` (static, derived from `CONVEX_SITE_URL`, no
network). Verify it:

```bash
curl -s http://localhost:3211/.well-known/openid-configuration | python3 -m json.tool
curl -s http://localhost:3000/.well-known/openid-configuration   # through nginx
```

Expected: `response_types_supported`, `subject_types_supported`,
`id_token_signing_alg_values_supported`, `token_endpoint`, `userinfo_endpoint`,
`scopes_supported`, … — 13 fields, not 3. The acceptance suite checks this too
(`T5 · sec.oidc_discovery`).

---

## Security hardening

The hardening pass (`T5` in the acceptance report) is deliberately boring:
standard controls, no external service, all verifiable offline.

| Concern | What the platform does | Where |
|---|---|---|
| 2FA for privileged roles | Optional **TOTP** (RFC 6238) for `admin`/`organizer` accounts. The secret is stored AES-256-GCM sealed; sign-in demands a code *before* a session is minted, with a ±30s window and a 5-attempt/5-minute lockout | `src/lib/totp.ts`, `src/convex/lib/secretBox.ts`, `src/convex/mfa.ts`, `src/pages/Security.tsx` |
| Account enumeration | Unknown address, wrong password and lockout all return the single message `Invalid email or password`; sign-up is exempt on purpose | `src/convex/lib/signInErrors.ts` |
| No secret leakage of the failure kind | TOTP failures use their own markers (`TOTP_REQUIRED`, `INVALID_TOTP_CODE`, `TOTP_LOCKED`, `TOTP_UNAVAILABLE`) because the password already passed | same |
| Privilege escalation | Only an admin can grant `admin`; the REST role-switch bridge is admin-only and audited (it used to be self-service) | `src/convex/lib/rbac.ts` |
| Mid-event role switching | Refused while an account is on a team, or while a judge holds assignments | same |
| Double scoring | One assignment per (judge, submission); one score row per (assignment, criterion); a judge cannot re-open a completed assignment | `src/convex/judging.ts` |
| Idempotency | Certificate issuance is keyed on (event, recipient, type, title, rank) — re-running returns the original UUID + signature, so verification links stay valid | `src/convex/certificates.ts` |
| Webhook replay | Each delivery is signed over `timestamp.delivery-id.body` with a 128-bit nonce; receivers reject anything older than 5 minutes | `src/convex/lib/webhookSignature.ts` |
| CI supply chain | Actions pinned to commit SHAs, workflow default `permissions: contents: read`, `pull_request` only (never `pull_request_target`), no secrets in any step | `.github/workflows/ci.yml` |
| Dependency pinning | Every dependency and devDependency is an exact version, installed with `npm ci` strictly from the lockfile | `package.json` |
| Fail-closed checks | Every gate denies by default: a skipped check is reported as skipped and never counted as a pass, and no bootstrap step is `\|\| true`-ed | `src/convex/lib/securityChecks.ts`, `src/convex/acceptance.ts`, `backend/entrypoint.sh` |
| Bearer-token verification | Session JWTs are **RS256-verified against the deployment's own JWKS** (alg/exp/iss/aud) before any row is read. The REST layer used to base64-decode the payload and trust it, so a hand-written `{"sub":"<admin id>"}` reached organizer-only endpoints | `src/convex/lib/jwt.ts`, `src/convex/http.ts` |
| Unsecured endpoints | Normalized scores, pairwise rankings and the acceptance report are staff-token or `published`-gated; exports require an organizer token and answer with a private CORS policy (no `Access-Control-Allow-Origin: *`, `no-store`) | `src/convex/http.ts`, `src/convex/acceptance.ts` |
| Sensitive browser storage | Session + refresh tokens live in **`sessionStorage`** — per tab, gone when the tab closes — never `localStorage`; legacy `__convexAuth*` entries are purged at boot and there is a non-persistent in-memory fallback | `src/lib/tokenStorage.ts`, `src/main.tsx` |
| Open redirects | `?returnTo=` accepts a same-origin path only; absolute, protocol-relative (`//evil`), backslash, control-character and percent-encoded-separator variants all fall back to a role home | `src/lib/safeRedirect.ts`, `src/pages/Auth.tsx` |
| Invalid input | Participant text and links are validated at write time: http(s)-only URLs (a stored `javascript:` URL is XSS waiting to happen), length caps, control-character stripping, bounded tag lists | `src/lib/validation.ts`, `src/convex/submissions.ts` |
| Missing timeouts | Every outbound request is bounded: webhook delivery 10 s (`AbortSignal.timeout`), bootstrap probes `--connect-timeout 3 --max-time 5` with a 60-attempt cap, Convex CLI steps under `timeout`, nginx `proxy_connect_timeout`/`proxy_read_timeout` | `src/convex/webhooks.ts`, `backend/entrypoint.sh`, `frontend/nginx.conf` |
| Outbound request safety (SSRF) | Webhook targets must be `http(s)`, must not embed credentials, and may never point at a cloud metadata service (`169.254.169.254`, `fd00:ec2::254`, `metadata.google.internal`, …). Loopback/private receivers stay allowed because self-hosting is the point | `src/lib/webhookTarget.ts` |
| No third-party runtime requests | The Google Fonts stylesheet is gone: first paint never depends on an external network, and no visitor IP/Referer leaks to a third party. Fonts fall back to the system stack | `index.html` |
| Browser hardening | CSP (`script-src 'self'`, `object-src 'none'`, `base-uri`/`form-action` locked), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `frame-ancestors 'self'` with an explicit opt-in for `/embed/…`, `server_tokens off` | `frontend/nginx.conf` |

### Transactionality

Convex mutations are serializable with optimistic concurrency control, so the
race-prone sequences (team join at capacity, concurrent score submission, vote
casting at the budget limit, certificate issuance) cannot interleave — a
conflicting mutation is retried rather than merged. Certificate issuance is
*additionally* idempotent, because a serializable-but-not-idempotent
"issue" would mint a second certificate on a retried request.

### Webhook signature verification

```
X-RaptorJudge-Event:      submission.created
X-RaptorJudge-Delivery:   <128-bit nonce>
X-RaptorJudge-Timestamp:  <unix ms>
X-RaptorJudge-Signature:  sha256=HMAC_SHA256(secret, "<timestamp>.<delivery>.<raw body>")
```

A receiver must:

1. reject the delivery when `|now − timestamp| > 5 minutes`;
2. reject a delivery id it has already processed inside that window;
3. recompute the HMAC over the raw body and compare in constant time.

`verifyDelivery()` in `src/convex/lib/webhookSignature.ts` is the reference
implementation, and the unit suite covers body tampering, timestamp refreshing
and replay.

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

### T5 · Security hardening
- Optional **TOTP two-factor** for admin/organizer accounts, secrets sealed with AES-256-GCM, enforced before the session is minted
- **No account enumeration**: wrong password, unknown address and lockout return one identical message
- Role-change policy: admin-only elevation, no role switching mid-event (a participant cannot become a judge)
- One assignment per (judge, submission), one score per criterion, no re-scoring a completed assignment
- **Idempotent certificate issuance** and replay-resistant, nonce-signed webhooks
- CI actions pinned to commit SHAs with least-privilege permissions; every dependency pinned to an exact version
- **Verified bearer tokens** (RS256 + JWKS, fail closed) and organizer-gated exports with a private CORS policy
- **No tokens in `localStorage`** — `sessionStorage` only, with legacy keys purged at boot
- **No open redirects** (`?returnTo=` is same-origin only) and **no external runtime requests**
- **Webhook SSRF guards**: http(s) only, credential-free, metadata endpoints refused
- Hardened response headers and CSP in front of the SPA

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
GET  /.well-known/openid-configuration      # complete OIDC discovery document
GET  /api/v1/events/:slug
GET  /api/v1/gallery/:slug?search=&randomize=1&seed=
GET  /api/v1/normalization/:slug
GET  /api/v1/pairwise/:slug
GET  /api/v1/export/:slug/:kind        # submissions|scores|rankings|assignments|json (organizer token)
GET  /api/v1/certificates/verify/:uuid?signature=
POST /api/v1/acceptance                # organizer token — tier-by-tier self-check suite (T1–T5)
POST /api/v1/auth/switch-role           # admin token only
```

Every UI action is also a Convex function of the same name, which is what the
100% API-first claim means: the REST layer is a thin, bearer-token wrapper over
the exact functions the React app calls.

---

## Architecture

```
src/
  convex/            Convex backend (schema, auth, all domain functions, HTTP API)
    auth.ts          Convex Auth + the hardening wrapper (uniform errors, TOTP gate)
    crypto.ts        Web-Crypto helpers (SHA-256, HMAC, seeded PRNG)
    mfa.ts           optional TOTP second factor (enroll / confirm / sign-in gate)
    http.ts          REST router + OpenAPI + the OIDC discovery document
    seed.ts          deterministic fixture seeder (auth accounts + demo data)
    lib/             audit chain, RBAC policy, OIDC discovery, secret box,
                     sign-in error policy, webhook signatures, security checks
  lib/               shared pure modules (imported by both sides)
    algorithms/      assignment planner, normalization, Bradley-Terry
    totp.ts          RFC 6238 TOTP + RFC 4648 base32 (no dependencies)
  pages/             Landing, Auth, EventPublic, Gallery, ProjectDetail,
                     ParticipantWorkspace, JudgePortal, OrganizerDashboard,
                     Security, Verify, EmbedGallery
  components/        AppShell, theme, NormalizationPlayground

docker-compose.yml   self-hosted stack: Postgres + Convex backend + dashboard + app
backend/             bootstrap image (function push + seed)  → backend/Dockerfile
tests/               vitest unit tests (algorithms, TOTP, secret box, RBAC,
                     webhook signatures, OIDC discovery, provider shape)
```

Design principles: strict server-side RBAC on every Convex function, deadlines enforced in the backend (never the client), hidden vote tallies until publish, and no secret (webhook keys, cert HMAC secret) ever returned by a query.

## Scripts

```bash
npm run dev            # Vite dev server
npm run build          # production build (dist/)
npm run typecheck      # tsc -b --noEmit
npm test               # vitest unit suite (162 tests)
npm run seed           # (re)seed the deterministic Dogfood 2026 fixtures
node scripts/auth-verify.mjs   # live: sign in each demo account + no-enumeration check
npm run acceptance     # server-side acceptance suite as the organizer (exits non-zero on failure)
npm run keys:generate  # mint a Convex Auth RS256 keypair (self-hosted deployments)
npx convex dev --once  # push functions + regenerate types

npm run docker:up      # docker compose up --build
npm run docker:down    # docker compose down -v
npm run docker:verify  # boot the stack, assert health/discovery/headers/fail-closed
```

## Verification

Three layers, each one runnable offline:

| Layer | Command | What it proves |
|---|---|---|
| Unit | `npm test` | algorithms (normalization, Bradley-Terry, assignment), TOTP/secret box, JWT verification, RBAC, input validation, redirect sanitizer, webhook signatures + replay, OIDC discovery, token storage (162 tests) |
| In-app | `npm run acceptance` (or the dashboard button) | tier-by-tier T1–T5 report computed against the live database; `T5` covers the hardening items, and a check with no input to inspect is reported as *skipped*, never as a pass |
| Runtime | `npm run docker:verify` | boots the whole Compose stack, mints the one-time admin key, waits for the schema push + seed, then asserts `/api/health`, the complete discovery document, the SPA's security headers, a non-empty public gallery, and that exports / the acceptance report / unsigned tokens / unpublished judging results all fail closed |

CI runs the first two as the `checks` job (plus a build-only `docker` job) and
the runtime one as the `runtime` job, which needs no repository secrets — it
mints the self-hosted admin key from the backend itself, exactly as a first
deploy does. Failed runtime runs dump container logs automatically.

## License

MIT — self-host it, fork it, run your whole hackathon on it.
