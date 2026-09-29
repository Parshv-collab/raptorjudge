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
#
# Fail-closed contract (security items 63 + 64)
# --------------------------------------------
# Every step here is a gate the frontend waits on (`service_completed_successfully`),
# so a step that *appears* to succeed while doing nothing leaves the stack
# serving an app whose backend has no functions — the exact "Could not find
# public function for 'users:me'" failure this script exists to prevent.
# Therefore:
#
#   * every network probe has an explicit connect/read timeout, so a hung TCP
#     connection can never block a check forever (a wait loop without one never
#     reaches its own retry cap);
#   * every CLI step that must succeed is explicitly checked and exits non-zero
#     on any error, partial or unexpected output — nothing is `|| true`-ed
#     except diagnostics;
#   * the bundle is verified by calling real functions afterwards, rather than
#     trusting the deploy's exit code alone.
set -eu

BACKEND_URL="${CONVEX_SELF_HOSTED_URL:-http://backend:3210}"

# Upper bound for a single Convex CLI round-trip (deploy, run, env). Generous,
# but finite: a wedged CLI must fail the bootstrap rather than hang the stack.
STEP_TIMEOUT="${STEP_TIMEOUT:-300}"

# curl options shared by every probe: fail on HTTP errors, and bound both the
# TCP connect and the whole request.
CURL_OPTS="-fsS --connect-timeout 3 --max-time 5"

# `timeout` also kills grandchildren if the CLI spawns children.
run_step() {
  timeout -k 5 "${STEP_TIMEOUT}" "$@"
}

# Is a deployment environment variable actually set?
#
# `npx convex env get` exits 0 for a missing variable — it just prints
# `✖ Environment variable "X" not found` to stdout. Testing only the exit code
# therefore reports *every* variable as present, which is exactly how a fresh
# stack ended up skipping the auth keypair and serving a sign-in page that
# cannot mint a session. Presence = exit 0, non-empty output, no "not found".
env_var_present() {
  out="$(run_step npx convex env get "$1" 2>/dev/null)" || return 1
  [ -n "${out}" ] || return 1
  case "${out}" in
    *"not found"*) return 1 ;;
  esac
  return 0
}

echo "JWT issuer expected: ${CONVEX_SITE_ORIGIN:-http://localhost:3211}"
echo "API accepted from: ${CONVEX_CLOUD_ORIGIN:-http://localhost:3210}"

echo "==> waiting for the self-hosted Convex backend at ${BACKEND_URL} ..."
attempt=0
until curl ${CURL_OPTS} "${BACKEND_URL}/version" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "${attempt}" -ge 60 ]; then
    echo "ERROR: Convex backend was not ready after 120s" >&2
    exit 1
  fi
  sleep 2
done
echo "    backend is up."

if [ -z "${CONVEX_SELF_HOSTED_ADMIN_KEY:-}" ]; then
  echo "==> CONVEX_SELF_HOSTED_ADMIN_KEY not set — checking for a generated one ..."
  # Self-hosted Convex mints the function-push key from the backend process, so
  # it cannot be a template variable and cannot be derived from INSTANCE_SECRET.
  # The `admin_key` service (docker-compose.yml) runs the backend image's own
  # `generate_admin_key.sh` for us and writes the result here, which is what
  # makes a fresh clone boot without a manual step. An explicit key in `.env`
  # always wins, so this only ever fills a gap.
  ADMIN_KEY_FILE="${ADMIN_KEY_FILE:-/keygen/admin_key}"
  if [ -s "${ADMIN_KEY_FILE}" ]; then
    CONVEX_SELF_HOSTED_ADMIN_KEY="$(tr -d '\r\n' < "${ADMIN_KEY_FILE}")"
    export CONVEX_SELF_HOSTED_ADMIN_KEY
    if [ -n "${CONVEX_SELF_HOSTED_ADMIN_KEY}" ]; then
      echo "    using the admin key generated on first boot."
      echo "==> To keep it across 'docker compose down -v', add this line to .env:"
      echo "==>   CONVEX_SELF_HOSTED_ADMIN_KEY=${CONVEX_SELF_HOSTED_ADMIN_KEY}"
    fi
  fi
fi

if [ -z "${CONVEX_SELF_HOSTED_ADMIN_KEY:-}" ]; then
  cat >&2 <<'MSG'
ERROR: CONVEX_SELF_HOSTED_ADMIN_KEY is not set, and none could be generated.

Self-hosted Convex mints admin keys from the backend itself, so this is a
one-time bootstrap step — it cannot be provisioned by an environment variable.
`docker compose up` normally does it for you via the `admin_key` service; that
service could not run, so do it by hand with the backend up:

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
#
# Publishing these keys is mandatory: without JWT_PRIVATE_KEY/JWKS every sign-in
# fails (sessions cannot be signed or verified), and the API's bearer-token
# verification has no key material to check against. So a failure here aborts
# the bootstrap instead of leaving a stack that serves a login page nobody can
# use.
if [ "${SKIP_AUTH_KEYS:-false}" != "true" ]; then
  if env_var_present JWT_PRIVATE_KEY; then
    echo "==> Convex Auth signing keys already present, skipping."
  else
    echo "==> generating and publishing Convex Auth signing keys ..."
    run_step node scripts/generate-auth-keys.mjs --emit-env-set > /tmp/auth-keys.sh
    if [ ! -s /tmp/auth-keys.sh ]; then
      echo "ERROR: key generation produced no env-set commands." >&2
      exit 1
    fi
    sh /tmp/auth-keys.sh
    # Both halves must land: without JWT_PRIVATE_KEY sessions cannot be signed,
    # and without JWKS the API's bearer-token verification has no key material.
    for required in JWT_PRIVATE_KEY JWKS; do
      if ! env_var_present "${required}"; then
        echo "ERROR: ${required} is still missing after publishing the keypair." >&2
        exit 1
      fi
    done
    echo "    auth signing keys published."
  fi
  if [ -n "${SITE_URL:-}" ]; then
    # No `|| true` here: a wrong SITE_URL breaks the OAuth redirect and the
    # sign-in page silently, so an operator must see the failure.
    if ! run_step npx convex env set SITE_URL "${SITE_URL}" >/dev/null 2>&1; then
      echo "ERROR: could not set SITE_URL on the deployment." >&2
      exit 1
    fi
  fi
fi

# --- TEST_EVENTS (issue 30) --------------------------------------------------
# Five extra demo events, one frozen in each lifecycle stage. Safe default is
# "false", which leaves the seed exactly as it was: only Sample Hack 2026.
#
# This has to be published to the *deployment*, not just passed to the
# container: Convex functions read process.env from the deployment's own
# environment variables, so without this the seed action and the public
# config query would both see TEST_EVENTS as unset and quietly do nothing.
# Always published (never conditional) so flipping the flag in docker-compose.yml
# / .env takes effect on the next `docker compose up`, including turning it off.
echo "==> publishing TEST_EVENTS=${TEST_EVENTS:-false} to the deployment ..."
if ! run_step npx convex env set TEST_EVENTS "${TEST_EVENTS:-false}" >/dev/null 2>&1; then
  echo "ERROR: could not set TEST_EVENTS on the deployment." >&2
  echo "       The seed would silently skip the multi-stage demo events." >&2
  exit 1
fi

# --- migrations ------------------------------------------------------------
echo "==> deploying Convex functions (schema migration) ..."
run_step npx convex deploy

# --- verify the bundle is actually live ------------------------------------
# `convex deploy` is a no-op if it silently targets the wrong deployment, which
# leaves the SPA throwing "Could not find public function for 'users:me'".
# Probe real functions (a query and a mutation-free read) so a partial deploy
# fails here instead of in the browser. Both the exit status and the output are
# checked: a CLI that prints an error but exits 0 must not pass the gate.
echo "==> verifying the deployed function bundle ..."
verify_bundle() {
  fn="$1"
  # A query that legitimately returns null prints nothing at all, so expecting
  # output unconditionally would fail on a healthy deployment.
  require_output="${2:-true}"
  if ! out="$(run_step npx convex run "${fn}" '{}' 2>&1)"; then
    echo "ERROR: '${fn}' could not be invoked after deploy." >&2
    echo "       ${out}" >&2
    exit 1
  fi
  case "${out}" in
    *"Could not find public function"* | *"Could not find function"* | *"is not a Convex function"*)
      echo "ERROR: functions did not land on the backend — '${fn}' is missing." >&2
      echo "       See the 'npx convex deploy' output above." >&2
      exit 1
      ;;
    *"ERROR"* | *"Failed to "* | *"error:"* | *"InvalidSecret"* | *"Unauthorized"*)
      echo "ERROR: '${fn}' reported an error after deploy:" >&2
      echo "       ${out}" >&2
      exit 1
      ;;
  esac
  if [ "${require_output}" = "true" ] && [ -z "${out}" ]; then
    echo "ERROR: '${fn}' returned no output — the deployment is not answering." >&2
    exit 1
  fi
}
# `users:me` is the function the SPA calls on boot; it returns null for an
# anonymous caller, so an empty result is a success here.
verify_bundle "users:me" false
# A public list query that always serialises something (`[]` when empty) — this
# is the one that proves the deployment is really answering.
verify_bundle "events:listPublic" true
echo "    functions are live."

# --- seed ------------------------------------------------------------------
if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "==> seeding Dogfood 2026 fixtures ..."
  # seed:seed is idempotent (it upserts by key), so re-running is safe; a real
  # failure still aborts the bootstrap rather than booting an empty event.
  run_step npx convex run seed:seed
else
  echo "==> SEED_ON_START=false, skipping fixtures."
fi

echo "==> backend bootstrap complete."
