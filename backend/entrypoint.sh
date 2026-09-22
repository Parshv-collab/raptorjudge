#!/bin/sh
# RaptorJudge — one-shot bootstrap for a self-hosted Convex backend.
#
# Convex has no SQL migration files: pushing the function bundle
# (`convex deploy`) IS the schema migration — it creates/updates every table
# and index declared in src/convex/schema.ts. After the push we optionally seed
# the deterministic Dogfood 2026 fixtures.
#
# Always invoked as `sh ./backend/entrypoint.sh` so it does not depend on the
# executable bit surviving a copy.
set -eu

BACKEND_URL="${CONVEX_SELF_HOSTED_URL:-http://backend:3210}"

echo "==> waiting for the self-hosted Convex backend at ${BACKEND_URL} ..."
attempt=0
until curl -fsS "${BACKEND_URL}/version" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "${attempt}" -ge 60 ]; then
    echo "ERROR: Convex backend was not ready after 120s" >&2
    exit 1
  fi
  sleep 2
done
echo "    backend is up."

if [ -z "${CONVEX_SELF_HOSTED_ADMIN_KEY:-}" ]; then
  cat >&2 <<'MSG'
ERROR: CONVEX_SELF_HOSTED_ADMIN_KEY is not set.

Self-hosted Convex mints admin keys from the backend itself, so this is a
one-time bootstrap step — it cannot be provisioned by an environment variable.
Run it once, with the backend up:

    docker compose up -d db backend
    docker compose exec backend ./generate_admin_key.sh

Copy the printed key into `.env` as CONVEX_SELF_HOSTED_ADMIN_KEY=<key>, then
run `docker compose up --build` again.

The frontend deliberately does NOT start until this succeeds: an app served
against a backend with no functions looks fine and then fails on every query
with "Could not find public function".
MSG
  exit 1
fi

# --- Convex Auth signing keys ----------------------------------------------
# `npx @convex-dev/auth` does not support self-hosted deployments, so we mint
# the RS256 keypair locally and publish it to the deployment ourselves.
if [ "${SKIP_AUTH_KEYS:-false}" != "true" ]; then
  if npx convex env get JWT_PRIVATE_KEY >/dev/null 2>&1; then
    echo "==> Convex Auth signing keys already present, skipping."
  else
    echo "==> generating and publishing Convex Auth signing keys ..."
    node scripts/generate-auth-keys.mjs --emit-env-set > /tmp/auth-keys.sh
    sh /tmp/auth-keys.sh
  fi
  if [ -n "${SITE_URL:-}" ]; then
    npx convex env set SITE_URL "${SITE_URL}" >/dev/null 2>&1 || true
  fi
fi

# --- migrations ------------------------------------------------------------
echo "==> deploying Convex functions (schema migration) ..."
npx convex deploy

# --- verify the bundle is actually live ------------------------------------
# Convex deploy is a no-op if it silently targets the wrong deployment, which
# leaves the SPA throwing "Could not find public function for 'users:me'".
# Probe a known query so a partial deploy fails here instead of in the browser.
echo "==> verifying the deployed function bundle ..."
verify_out=$(npx convex run users:me '{}' 2>&1 || true)
case "${verify_out}" in
  *"Could not find public function"*)
    echo "ERROR: functions did not land on the backend — 'users:me' is missing." >&2
    echo "       See the 'npx convex deploy' output above." >&2
    exit 1
    ;;
esac
echo "    functions are live."

# --- seed ------------------------------------------------------------------
if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "==> seeding Dogfood 2026 fixtures ..."
  npx convex run seed:seed
fi

echo "==> backend bootstrap complete."
