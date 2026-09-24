# RaptorJudge

RaptorJudge is a self-hosted hackathon submission and judging platform for organizers, judges, participants, and administrators. It covers event lifecycle management, team formation, deadline-enforced submissions, weighted judging, normalization, pairwise ranking, community voting, audit logs, webhooks, certificates, and public galleries.

## Stack

The frontend is React, TypeScript, Vite, React Router, Tailwind, and Convex React. The backend is self-hosted Convex with Convex Auth. Docker Compose runs PostgreSQL as Convex storage, the Convex backend, the Convex dashboard, a one-shot bootstrap/seed service, and nginx serving the frontend. There is no separate Express, Fastify, or Python API server, and there is no runtime third-party API requirement.

## Quickstart

```bash
docker compose up --build
```

Open `http://localhost:3000`. On a fresh installation, complete the one-time self-hosted Convex admin-key bootstrap described in `backend/entrypoint.sh` and `env.example` before expecting the bootstrap container to publish functions. The frontend waits for bootstrap completion.

## Deploying Anywhere (Runtime URL Config)

RaptorJudge is fully portable and can be deployed on `localhost`, a LAN IP, or a public domain without rebuilding the frontend Docker image.

Configure environment variables at container startup:

```bash
# LAN IP Deployment Example:
HOST_IP=192.168.1.50
CONVEX_CLOUD_ORIGIN=http://${HOST_IP}:3210 \
CONVEX_SITE_ORIGIN=http://${HOST_IP}:3211 \
CONVEX_URL=http://${HOST_IP}:3210 \
TRUSTED_ORIGINS=http://${HOST_IP}:3000 \
docker compose up -d
```

- `CONVEX_URL`: Read by `frontend/entrypoint.sh` and substituted into the built JS bundle at runtime.
- `CONVEX_CLOUD_ORIGIN`: Used by Convex client connections and dashboard.
- `CONVEX_SITE_ORIGIN`: Expected JWT issuer origin for Convex Auth verification.
- `TRUSTED_ORIGINS`: Comma-separated list of trusted origins merged into the backend CORS allowlist.

For local development without Docker:

```bash
npm install
npm run dev
npx convex dev --once
```

## Seeded credentials

All seeded demo accounts use `dogfood2026` as the password. The seed includes the following roles and accounts.

| Role | Account | Purpose |
|---|---|---|
| Admin | `admin@raptors.dev` | Platform administration and role switcher |
| Organizer | `organizer@raptors.dev` | Event and judging management |
| Judge | `judge1@raptors.dev` through `judge4@raptors.dev` | Assigned scoring and calibration fixtures |
| Participant | `participant1@raptors.dev` through `participant6@raptors.dev` | Team workspace and submissions |

The seeded Dogfood 2026 event is available at `/e/dogfood-2026`. The exact fixture population is defined in `src/convex/seed.ts`.

## Feature matrix

| Tier | Implemented surface |
|---|---|
| T1 Core | Auth, four roles, event lifecycle, tracks and prize pools, teams and invite codes, submission drafts, deadline checks, public gallery, and comments |
| T2 Judging | Judge assignment, weighted rubric criteria, isolated queues, progress, score submission, normalization, pairwise ranking, and CSV exports |
| T3 Public | Community voting, comments, publication visibility, hash-chained audit logs, and public project/gallery routes. A distributed rate limiter is not implemented. |
| T4 Stretch | Webhooks, signed certificates, REST/HTTP actions, embeddable gallery, and bulk export. Bulk import is not implemented. |

## Tests and checks

Run the unit suite with:

```bash
npm test
```

Run static validation and the production build with:

```bash
npm run typecheck
npm run build
```

The test suite covers assignment, auth guards, input validation, JWT, normalization, pairwise ranking, RBAC, secret storage, TOTP, webhook signatures and targets, and OIDC support.

## Resetting data

Docker volumes hold PostgreSQL and Convex data. To destroy local data and reseed from scratch:

```bash
docker compose down -v
docker compose up --build
```

This is destructive. A selective application-level reset command is not implemented.

## Known limitations

The active source contains some advanced organizer panels that are not all exposed in the simplified top-level dashboard. Rubric locking, invite expiry/revocation, a distributed rate limiter, external Sybil resistance, formal import, a versioned export schema, and a separate result-publication mutation are not implemented. A full database dump command is not implemented. Live Convex deployment verification requires a configured self-hosted or cloud deployment.

## License

The project footer and README identify the project as MIT licensed. A root `LICENSE` file is not present in this checkout.

## References

[1]: docker-compose.yml "Docker Compose services"
[2]: backend/entrypoint.sh "Bootstrap and deployment sequence"
[3]: src/convex/seed.ts "Seeded fixtures and credentials"
[4]: package.json "Project scripts and dependencies"
[5]: src/App.tsx "Application routes"
