#!/bin/sh
# Runtime verification of the Docker Compose stack (CI job `runtime`).
#
# Build-only checks cannot catch a stack that builds fine and then serves a
# broken app, so this script actually boots it and asserts the behaviour the
# security pass claims:
#
#   1. db + backend come up healthy, and the one-time self-hosted admin key is
#      minted from the backend itself (it cannot be provisioned by env var);
#   2. bootstrap pushes the function bundle and seeds the fixtures — the
#      frontend deliberately refuses to start until it succeeds;
#   3. /api/health answers 200 with JSON, and the strict-client OIDC discovery
#      document is complete (Phase 0);
#   4. the SPA is served on :3000 with its hardened headers (items 65 + 70);
#   5. privileged endpoints fail closed without a token — organizer exports
#      answer 401/403 and never advertise `Access-Control-Allow-Origin: *`,
#      an unsigned (`alg: none`) bearer token is rejected, and unpublished
#      judging results are not readable (items 63 + 70);
#   6. everything is torn down afterwards so a re-run starts clean.
#
# Always invoked as `sh ./scripts/ci-compose-runtime.sh` (no executable bit in
# CI checkouts). Exits non-zero on the first failed assertion and dumps the
# relevant container logs so the failure is diagnosable from CI output alone.
set -eu

SLUG="${EVENT_SLUG:-dogfood-2026}"
API="${API_BASE:-http://localhost:8000}"
SITE="${SITE_BASE:-http://localhost:3000}"

failures=0

say() { printf '\n=== %s\n' "$1"; }

pass() {
  printf '  ✓ %s\n' "$1"
}

fail() {
  printf '  ✗ %s\n' "$1" >&2
  failures=$((failures + 1))
}

expect_eq() {
  if [ "$2" = "$3" ]; then
    pass "$1 ($2)"
  else
    fail "$1: expected $3, got $2"
  fi
}

dump_logs() {
  say "container logs"
  docker compose logs --no-color --tail 60 || true
}

cleanup() {
  say "tearing down"
  docker compose down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ---------------------------------------------------- 1. backend + admin key ---
say "phase 1 — database + Convex backend"
docker compose up -d db backend

# Poll the published client-API port rather than parsing `docker compose ps`
# (its output format varies between compose versions).
say "waiting for the backend to answer on :3210"
attempt=0
until curl -fsS --max-time 5 http://localhost:3210/version >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "${attempt}" -ge 60 ]; then
    fail "backend never became healthy"
    docker compose ps
    dump_logs
    exit 1
  fi
  sleep 3
done
pass "backend is healthy"

# Self-hosted Convex mints admin keys from the backend itself; this is the
# documented one-time bootstrap step, done here so the job needs no secrets.
say "minting the self-hosted admin key"
ADMIN_KEY="$(docker compose exec -T backend ./generate_admin_key.sh 2>/dev/null | grep '|' | tail -1 | tr -d '\r')"
if [ -z "${ADMIN_KEY}" ]; then
  fail "could not mint an admin key from the backend"
  docker compose exec -T backend ./generate_admin_key.sh || true
  exit 1
fi
pass "admin key minted (${#ADMIN_KEY} chars, value not printed)"
# Compose reads .env; the key only lives for this job.
printf 'CONVEX_SELF_HOSTED_ADMIN_KEY=%s\n' "${ADMIN_KEY}" >> .env

# --------------------------------------------------- 2. bootstrap + frontend ---
say "phase 2 — bootstrap (schema push + seed) and frontend"
if ! docker compose up -d --build; then
  fail "docker compose up failed (bootstrap exit code is part of the definition)"
  dump_logs
  exit 1
fi

# The frontend only starts once bootstrap reports success, so wait on it.
say "waiting for the frontend to serve"
attempt=0
until curl -fsS --max-time 5 "${SITE}/" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "${attempt}" -ge 60 ]; then
    fail "frontend never came up (bootstrap likely failed)"
    docker compose ps
    dump_logs
    exit 1
  fi
  sleep 3
done
pass "frontend is serving ${SITE}"

# ------------------------------------------------------------- 3. health API ---
say "API health"
health_code="$(curl -sS --max-time 10 -o /tmp/health.json -w '%{http_code}' "${API}/api/health")"
expect_eq "GET /api/health status" "${health_code}" "200"
if grep -q '"ok":true' /tmp/health.json 2>/dev/null; then
  pass "/api/health body reports ok:true"
else
  fail "/api/health body missing ok:true — $(head -c 200 /tmp/health.json 2>/dev/null)"
fi

say "OIDC discovery document (Phase 0 — strict clients)"
discovery="$(curl -sS --max-time 10 "${API}/.well-known/openid-configuration")"
for field in token_endpoint userinfo_endpoint response_types_supported \
  subject_types_supported id_token_signing_alg_values_supported scopes_supported \
  code_challenge_methods_supported; do
  if printf '%s' "${discovery}" | grep -q "\"${field}\""; then
    pass "discovery document declares ${field}"
  else
    fail "discovery document is missing ${field} (incomplete document → 'Auth provider discovery … failed')"
  fi
done

# ------------------------------------------------------- 4. hardened headers ---
say "frontend security headers (items 65 + 70)"
headers="$(curl -sS --max-time 10 -D - -o /dev/null "${SITE}/")"
printf '%s' "${headers}" | grep -qi 'x-content-type-options: *nosniff' \
  && pass "X-Content-Type-Options: nosniff" \
  || fail "missing X-Content-Type-Options: nosniff"
printf '%s' "${headers}" | grep -qi 'referrer-policy: *no-referrer' \
  && pass "Referrer-Policy: no-referrer" \
  || fail "missing Referrer-Policy: no-referrer"
printf '%s' "${headers}" | grep -qi 'content-security-policy:' \
  && pass "Content-Security-Policy present" \
  || fail "missing Content-Security-Policy"
printf '%s' "${headers}" | grep -qi 'x-powered-by' \
  && fail "X-Powered-By is disclosed" \
  || pass "no X-Powered-By disclosure"
printf '%s' "${headers}" | grep -qi 'server: *nginx/1' \
  && fail "nginx version is disclosed (server_tokens should be off)" \
  || pass "no server version disclosure"

# ------------------------------------------- 5. fail-closed privileged routes ---
say "privileged endpoints fail closed (items 63 + 70)"

export_code="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' "${API}/api/v1/export/${SLUG}/submissions")"
case "${export_code}" in
  401 | 403) pass "export without a token is refused (${export_code})" ;;
  *) fail "export without a token returned ${export_code} — expected 401/403" ;;
esac

export_headers="$(curl -sS --max-time 10 -D - -o /dev/null "${API}/api/v1/export/${SLUG}/submissions")"
if printf '%s' "${export_headers}" | grep -qi 'access-control-allow-origin: *\*'; then
  fail "privileged export advertises Access-Control-Allow-Origin: *"
else
  pass "privileged export does not advertise a wildcard CORS origin"
fi

acceptance_code="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' -X POST "${API}/api/v1/acceptance")"
case "${acceptance_code}" in
  401 | 403) pass "acceptance report without a token is refused (${acceptance_code})" ;;
  *) fail "acceptance report without a token returned ${acceptance_code} — expected 401/403" ;;
esac

# An unsigned token whose payload claims to be the seeded admin. The REST layer
# used to base64-decode and trust exactly this shape.
forged="$(node -e 'const b=(o)=>Buffer.from(JSON.stringify(o)).toString("base64url");process.stdout.write(`${b({alg:"none",typ:"JWT"})}.${b({sub:"admin|forged",iss:"http://127.0.0.1:3211",aud:"convex",exp:Math.floor(Date.now()/1000)+3600})}.`)')"
forged_code="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer ${forged}" -H 'Content-Type: application/json' \
  -d '{}' "${API}/api/v1/acceptance")"
case "${forged_code}" in
  401 | 403) pass "unsigned (alg: none) bearer token is rejected (${forged_code})" ;;
  *) fail "a forged bearer token returned ${forged_code} — expected 401/403" ;;
esac

say "judging results are gated until the event is published (item 70)"
event_status="$(curl -sS --max-time 10 "${API}/api/v1/events/${SLUG}" |
  node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{try{process.stdout.write(JSON.parse(s).status??"unknown")}catch{process.stdout.write("unknown")}})')"
results_code="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' "${API}/api/v1/normalization/${SLUG}")"
if [ "${event_status}" = "published" ] || [ "${event_status}" = "archived" ]; then
  expect_eq "published event exposes results (status=${event_status})" "${results_code}" "200"
else
  case "${results_code}" in
    401 | 403) pass "unpublished event (${event_status}) withholds results (${results_code})" ;;
    *) fail "unpublished event (${event_status}) returned ${results_code} for judging results — expected 401/403" ;;
  esac
fi

say "seeded data is reachable through the public read path"
detail="$(curl -sS --max-time 10 "${API}/api/v1/events/${SLUG}")"
for pair in tracks rubric; do
  n="$(printf '%s' "${detail}" | node -e \
    "let s='';process.stdin.on('data',(d)=>(s+=d)).on('end',()=>{try{process.stdout.write(String((JSON.parse(s).${pair}??[]).length))}catch{process.stdout.write('0')}})")"
  if [ "${n}" -gt 0 ]; then
    pass "event detail exposes ${n} seeded ${pair}"
  else
    fail "event detail has no ${pair} — the seed did not run"
  fi
done

# The gallery is deliberately hidden until judging starts (it would otherwise
# publish every team's work during the hacking stage). The seeded event sits in
# `hacking`, so an empty gallery here is the *correct* answer — and if the event
# ever is past that point, the seeded submissions must show up.
case "${event_status}" in
  judging | voting | published | archived)
    cards="$(curl -sS --max-time 10 "${API}/api/v1/gallery/${SLUG}" |
      node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{try{process.stdout.write(String((JSON.parse(s).cards??[]).length))}catch{process.stdout.write("0")}})')"
    if [ "${cards}" -gt 0 ]; then
      pass "public gallery serves ${cards} submissions (event is ${event_status})"
    else
      fail "gallery is empty although the event is ${event_status}"
    fi
    ;;
  *)
    hidden="$(curl -sS --max-time 10 "${API}/api/v1/gallery/${SLUG}" |
      node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{try{process.stdout.write(String((JSON.parse(s).cards??[]).length))}catch{process.stdout.write("0")}})')"
    if [ "${hidden}" -eq 0 ]; then
      pass "gallery stays hidden during ${event_status} (submissions are not published early)"
    else
      fail "gallery exposed ${hidden} submissions while the event is ${event_status}"
    fi
    ;;
esac

# ----------------------------------------------------------------- outcome ----
if [ "${failures}" -eq 0 ]; then
  say "runtime verification passed — the compose stack boots, seeds, serves, and fails closed"
  exit 0
fi

say "runtime verification FAILED (${failures} problem(s))"
docker compose ps
dump_logs
exit 1
