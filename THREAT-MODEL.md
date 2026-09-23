# Threat Model

## Scope and trust boundaries

The browser is untrusted. Convex functions, the Convex database, and the Docker network are the trusted application boundary. Public HTTP actions and webhooks cross an external boundary. Organizers and admins are privileged application users; judges and participants are restricted role principals.

## STRIDE analysis

| Threat | Attack description | Mitigation or status | Location |
|---|---|---|---|
| Spoofing / account enumeration | An attacker probes sign-in responses to discover accounts. | Unknown email, wrong password, and lockout are collapsed to one error. Sign-up is intentionally different. | `src/convex/lib/signInErrors.ts`, `Auth.tsx` |
| Spoofing / session hijacking | A stolen browser token is reused. | Tokens use Convex JWT validation and are stored in sessionStorage rather than localStorage. Session theft protection beyond browser storage is **not implemented**. | `src/lib/tokenStorage.ts`, `src/convex/lib/jwt.ts` |
| Tampering / CSRF | A cross-site request attempts to mutate state. | Convex Auth session validation and same-origin browser deployment reduce exposure. A separate CSRF token layer is **not implemented**. | `src/main.tsx`, `frontend/nginx.conf` |
| Repudiation | A privileged actor denies changing event state or data. | Mutations append hash-chained audit rows with actor, target, before, and after state. | `src/convex/lib/audit.ts`, `src/convex/audit.ts` |
| Information disclosure / submission scraping | Public endpoints expose drafts or private submissions. | Gallery and result queries apply event-stage and publication checks. A formal per-request scraping rate limiter is **not implemented**. | `src/convex/submissions.ts`, `src/convex/httpPublic.ts` |
| Elevation / role abuse | A participant or judge tries to use organizer functions. | Shared `requireRole` and `requireOrganizer` checks run inside Convex functions. | `src/convex/lib/common.ts`, `src/convex/lib/rbac.ts` |
| Invite abuse | A code is guessed, reused, or used after a team is full. | Random hexadecimal codes, indexed lookup, membership duplication checks, one-team-per-event checks, and max-team-size checks are enforced. Invite expiry and explicit revocation are **not implemented**. | `src/convex/teams.ts` |
| Sybil voting and ballot stuffing | One actor creates many votes or spends more credits than allowed. | Votes are keyed by user/event, points and credits are tracked, and client IP/user-agent hashes are stored. Strong identity proof and distributed Sybil detection are **not implemented**. | `src/convex/voting.ts`, `schema.ts` |
| Judge collusion | Judges coordinate or score conflicted work. | Assignment conflict sets exclude own and teammate teams; assignments are isolated by judge; audit records score submission. Collusion outside these controls is **not implemented**. | `src/lib/algorithms/assignment.ts`, `src/convex/judging.ts` |
| Webhook replay | An attacker replays a valid delivery. | Delivery IDs, timestamps, nonces, HMAC signatures, and a five-minute window are checked. Receiver-side replay storage is the receiver's responsibility. | `src/convex/lib/webhookSignature.ts`, `src/convex/webhooks.ts` |
| Open redirect | A return URL sends a user to an attacker domain after sign-in. | `resolveReturnTo` accepts same-origin paths and rejects absolute, protocol-relative, backslash, control-character, and encoded-separator variants. | `src/lib/safeRedirect.ts`, `src/pages/Auth.tsx` |
| Sensitive browser storage | Persistent local storage leaks session credentials. | Session and refresh tokens use sessionStorage, with legacy local keys purged at startup. | `src/lib/tokenStorage.ts`, `src/main.tsx` |
| Business-logic abuse | Concurrent joins, scores, votes, or certificate issuance race each other. | Convex serializable mutations retry conflicting transactions; certificate issuance is additionally idempotent. | `src/convex/teams.ts`, `voting.ts`, `certificates.ts` |
| SSRF | A webhook target accesses cloud metadata or internal infrastructure. | HTTP(S)-only validation, credential rejection, and metadata-address blocking are implemented. Loopback/private receivers remain allowed for self-hosting. | `src/lib/webhookTarget.ts` |
| Untrusted CI | A pull request executes with write secrets or broad permissions. | Workflows use read permissions, pinned actions, and `pull_request`; a live CI review is **not implemented** in this sandbox. | `.github/workflows/ci.yml` |
| Unpinned dependencies | A build silently changes dependency code. | `package.json` uses exact versions and `npm ci` uses the lockfile. Container image digests are not pinned. | `package.json`, `package-lock.json`, `docker-compose.yml` |
| Checks failing open | A skipped security check is treated as success. | Acceptance and security checks report skipped gates rather than converting them to passes. | `src/convex/acceptance.ts`, `src/convex/lib/securityChecks.ts` |
| Missing timeouts | Network calls hang workers. | Webhook delivery, bootstrap probes, and nginx proxies have timeouts. A global request timeout policy is **not implemented**. | `src/convex/webhooks.ts`, `backend/entrypoint.sh`, `frontend/nginx.conf` |
| Unsecured endpoints | A caller reaches private export or ranking data without authorization. | HTTP handlers verify JWTs or require published state; exports use private CORS and no-store. | `src/convex/http.ts`, `src/convex/exports.ts` |
| Race conditions | Concurrent team capacity or scoring requests overwrite state. | Convex mutation serialization and explicit duplicate checks protect the main write paths. Formal load testing is **not implemented**. | Convex mutations and `tests/` |

## Out of scope

Physical host compromise, PostgreSQL administrator compromise, malicious Docker images, and availability attacks against a self-hosted installation are out of scope. The repository does not implement a WAF, distributed rate limiter, external identity proof, or formal incident-response system.

## Known gaps

The most material gaps are invite expiration/revocation, distributed rate limiting, explicit CSRF tokens, external Sybil resistance, and a versioned export contract. These are documented limitations rather than assumed protections.

## References

[1]: src/convex/lib/rbac.ts "Role authorization"
[2]: src/convex/lib/audit.ts "Hash-chained audit helper"
[3]: src/lib/safeRedirect.ts "Open redirect validation"
[4]: src/lib/tokenStorage.ts "Session token storage"
[5]: src/lib/webhookTarget.ts "Webhook target validation"
[6]: src/convex/lib/webhookSignature.ts "Webhook signature verification"
[7]: frontend/nginx.conf "Browser security headers and proxy timeouts"
