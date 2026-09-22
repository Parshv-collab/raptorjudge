# syntax=docker/dockerfile:1
#
# RaptorJudge bootstrap image.
#
# There is no application server to build here. The backend is Convex, which
# runs from the upstream `ghcr.io/get-convex/convex-backend` image (see
# docker-compose.yml). This image only carries the Convex CLI plus this repo's
# functions, so the stack can push its schema and seed itself on startup —
# the equivalent of "run migrations + seed" for a Convex backend.
#
# Single-stage is intentional: the artifact is the CLI + function sources, and
# `npm ci` needs the dev toolchain anyway.
#
# Build context is the repository root (the Convex functions live in
# src/convex/ inside the same npm package), so docker-compose.yml points
# `build.context` at `.` and `build.dockerfile` at this file.

FROM node:20-alpine

# curl backs the backend readiness wait in entrypoint.sh.
RUN apk add --no-cache curl

WORKDIR /app

# Dependencies first, so this layer caches across function-only changes.
# npm, not Bun — the project is standard Node/npm now.
COPY package.json package-lock.json ./
RUN npm ci

# Everything the Convex CLI needs to push this project.
COPY convex.json tsconfig.json tsconfig.node.json ./
COPY src/convex ./src/convex
COPY scripts/generate-auth-keys.mjs ./scripts/generate-auth-keys.mjs
COPY backend/entrypoint.sh ./backend/entrypoint.sh

ENV CONVEX_SELF_HOSTED_URL=http://backend:3210

CMD ["sh", "./backend/entrypoint.sh"]
