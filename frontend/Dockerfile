# syntax=docker/dockerfile:1
#
# Multi-stage build: Vite compiles the SPA, nginx:alpine serves the static
# output. There is no Node process at runtime.
#
# Build context is the repository root — this project is a single Vite package
# (the Convex functions in src/convex/ are part of it), so docker-compose.yml
# points `build.context` at `.` and `build.dockerfile` at this file.

# ---------------------------------------------------------------- build ----
FROM node:20-alpine AS build

WORKDIR /app

# Vite inlines `import.meta.env.VITE_*` at BUILD time, so the Convex origin is
# a build argument, not a runtime environment variable. Changing it means
# rebuilding: `docker compose build frontend`.
ARG VITE_CONVEX_URL=http://localhost:3210
ENV VITE_CONVEX_URL=${VITE_CONVEX_URL}

COPY package.json package-lock.json ./
RUN npm ci

# Config + sources needed by `vite build`.
COPY index.html \
     vite.config.ts \
     tsconfig.json \
     tsconfig.app.json \
     tsconfig.node.json \
     postcss.config.js \
     tailwind.config.js \
     ./
COPY src ./src

RUN npm run build

# ---------------------------------------------------------------- serve ----
FROM nginx:alpine AS runtime

# nginx listens on 3000 and proxies /api/* to the backend (see nginx.conf).
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
