# Deploying RaptorJudge

RaptorJudge is designed to be run with one `docker compose up --build` on a host
you control. This page covers everything past the sandbox default:
the one-time bootstrap key, serving it to a real hostname, the environment
variables that actually matter, and how to back up or reset.

There is **no cloud dependency at runtime**. The only build-time dependencies are
the container images and npm packages, so a machine that can reach its own
registry mirror builds this offline.

## 1. Preflight

| Requirement | Why |
|---|---|
| Docker Engine 24+ with the Compose v2 plugin | The stack is five services with health-gated startup |
| ~3 GB RAM and ~4 GB disk | Convex backend + PostgreSQL + a Vite build |
| Ports `3000`, `3210`, `3211`, `6791` free on the host | SPA, Convex client API, HTTP actions, Convex dashboard |

Check what a fresh machine will run before it spends a build:

```bash
cp env.example .env
docker compose config --quiet && echo "compose file is valid"
```

## 2. The admin key

Self-hosted Convex mints its function-push admin key **from the backend process
itself** — it is not derived from `INSTANCE_SECRET`, so it cannot be a template
variable. `docker compose up` now does this for you: the `admin_key` service
runs the backend image's own `generate_admin_key.sh` and hands the key to
`bootstrap` through a shared volume. There is no manual step.

Leave `CONVEX_SELF_HOSTED_ADMIN_KEY` blank in `.env` and the generated key is
used for that run only. To **persist** it across `docker compose down -v`, copy
the value the bootstrap log prints:

```
==> To keep it across 'docker compose down -v', add this line to .env:
==>   CONVEX_SELF_HOSTED_ADMIN_KEY=<key>
```

The only reason to do this by hand is if the `admin_key` service cannot run:

```bash
docker compose up -d db backend
docker compose exec backend ./generate_admin_key.sh   # prints the key
# paste it into .env as CONVEX_SELF_HOSTED_ADMIN_KEY=<key>
docker compose up --build
```

`bootstrap` still fails loudly with these instructions when no key can be found
at all, rather than starting the frontend against an empty backend. That is
deliberate: an SPA served without functions looks fine and then fails every query
with `Could not find public function`.

`bootstrap` also generates and publishes the Convex Auth RS256 keypair
(`JWT_PRIVATE_KEY` + `JWKS`) needed to sign sessions, then pushes the function
bundle (which *is* the schema migration for Convex), verifies real functions
answer, and seeds the fixtures. It is a one-shot container
(`restart: "no"`); the frontend waits on `service_completed_successfully`.

## 3. Serving a real hostname or LAN IP

`VITE_*` values are inlined by Vite at **build** time, so pointing the app at a
different origin means rebuilding the frontend image with matching values.

```bash
# .env
CONVEX_CLOUD_ORIGIN=http://raptorjudge.internal:3210   # browser → Convex client API
CONVEX_SITE_ORIGIN=http://raptorjudge.internal:3211    # browser → REST /api/*
TRUSTED_ORIGINS=http://raptorjudge.internal:3000       # what the backend accepts
VITE_CONVEX_URL=http://raptorjudge.internal:3210       # baked into the bundle
SITE_URL=http://raptorjudge.internal:3000
```

```bash
docker compose build frontend bootstrap
docker compose up -d
```

Notes:

- **All four origins must describe how a *browser* reaches the stack.** The
  container-internal hostname (`backend`) is never what a browser should be told.
- `TRUSTED_ORIGINS` is a comma-separated allowlist; add every hostname users will
  type, and keep the scheme right — `http` and `https` are different origins.
- Behind TLS termination (any reverse proxy), set the origins to the `https://`
  URLs your users see and forward `X-Forwarded-Proto`. nginx already forwards it
  on the `/api/` route and sets `X-Frame-Options`, COOP and a strict CSP.
- The Convex dashboard on `:6791` is an operator tool. Bind it to localhost or
  put it behind your own auth before exposing it; it can read everything.

## 4. Environment variable reference

`.env` is read by Compose for `${VAR}` substitution. `.env` is not committed.

| Variable | Default | Purpose |
|---|---|---|
| `INSTANCE_SECRET` | dev placeholder | Backend root secret. **Rotate for anything real** (`openssl rand -hex 32`) — rotating invalidates existing keys and sessions |
| `CONVEX_SELF_HOSTED_ADMIN_KEY` | *(blank)* | Function-push key. **Leave blank** — `admin_key` generates one on first boot and `bootstrap` uses it. Set it only to persist across `docker compose down -v` |
| `CONVEX_CLOUD_ORIGIN` | `http://localhost:3210` | Browser → Convex client API (queries/mutations/sync) |
| `CONVEX_SITE_ORIGIN` | `http://localhost:3211` | Browser → HTTP actions (the `/api/*` REST surface) |
| `TRUSTED_ORIGINS` | `http://localhost:3000` | Origins the backend accepts requests from |
| `VITE_CONVEX_URL` | `http://localhost:3210` | Baked into the bundle; must equal `CONVEX_CLOUD_ORIGIN` for browser users |
| `SITE_URL` | `http://localhost:3000` | Site origin used by Convex Auth links |
| `SEED_ON_START` | `true` | Seed the deterministic fixture event on bootstrap |
| `SKIP_AUTH_KEYS` | `false` | Skip the automatic auth keypair step (only if you publish keys yourself) |
| `POSTGRES_URL` | `postgresql://dogfood:dogfood@db:5432` | Convex storage backend. **Must not include the database name** — the backend appends it from `INSTANCE_NAME` |

The database credentials default to `dogfood/dogfood`. Change them in
`docker-compose.yml` for a real deployment (this is the one place the brief
permits editing `docker-compose.yml`).

## 5. Backups and reset

Everything durable lives in two named volumes: `db_data` (PostgreSQL — the
source of truth) and `convex_data` (backend files). Back the SQL database up
directly:

```bash
docker compose exec -T db pg_dump -U dogfood dogfood > raptorjudge-$(date +%F).sql
```

A full reset destroys both volumes and re-seeds on the next boot:

```bash
docker compose down -v
docker compose up --build
```

Re-running the seed alone is also safe — it is idempotent and gated on the
`fixture-seeded-2026` flag — but the application-level "reset event" mutation
does not exist; the seed is the supported reset path.

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Could not find public function for 'users:me'` | Bootstrap has not pushed functions, or the frontend started before it finished | `docker compose logs bootstrap`; if it reports no admin key, set `CONVEX_SELF_HOSTED_ADMIN_KEY` in `.env` and re-run |
| Sign-in silently fails, no session | Auth keypair was never published | Check `bootstrap` output for `auth signing keys published`; ensure `SKIP_AUTH_KEYS` is not `true` unless you set the keys yourself |
| Blank page, unstyled | Frontend built against the wrong origin | Rebuild with `VITE_CONVEX_URL` set to the browser-visible `CONVEX_CLOUD_ORIGIN` |
| CORS / origin rejected | `TRUSTED_ORIGINS` does not list the exact origin (scheme + host + port) | Add it and restart the backend |
| `bootstrap` exits non-zero with a timeout | A CLI round-trip exceeded `STEP_TIMEOUT` (default 300s) | Investigate backend health first; raise `STEP_TIMEOUT` only after that |
| Dashboard shows no deployment | Dashboard points at the client API origin | Check `NEXT_PUBLIC_DEPLOYMENT_URL` resolves to `CONVEX_CLOUD_ORIGIN` |

Verify the running stack end to end after any change:

```bash
npm run docker:verify     # Compose smoke test
python3 run.py .dogfood.toml   # the official 7-check acceptance suite
```

## 7. Production hosting (Vite static build)

For a managed host that builds and serves static output rather than running
Compose:

- **Install:** the default package-manager install (no extra steps needed).
- **Build:** `vite build` — it must produce `dist/` and exit; it must not start a
  server. Serve `dist/` with the SPA fallback to `index.html` and copy the
  security headers from `frontend/nginx.conf`.
- **Backend:** still a self-hosted Convex deployment; point `VITE_CONVEX_URL` and
  the `CONVEX_*_ORIGIN` values at it and set `TRUSTED_ORIGINS` to the site
  origin. A static host alone is not a complete deployment — it needs the backend
  and its PostgreSQL store somewhere.
