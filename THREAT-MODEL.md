# Threat Model

## Scope and trust boundaries

```
untrusted                        │ trusted
─────────────────────────────────┼─────────────────────────────────────────
browser / any HTTP client        │ Convex functions + the database they guard
webhook receivers we call        │ the Docker network between services
                                 │ nginx as the browser-policy terminator
                                 │
privileged users (organizer,     │ restricted principals (judge, participant)
admin) — trusted to act,         │ — must be unable to reach privileged
never trusted to be correct      │ state or peer data
```

The browser is untrusted and so is every request it sends: the checker and the
T5 battery call the API directly, so hiding a control in React is not a control.
Authorization lives in `src/convex/lib/common.ts` (`requireUser` / `requireRole` /
`requireOrganizer`) and is asserted server-side for every endpoint listed in
[JUDGING.md §7](JUDGING.md#7-role-isolation).

## Top threats at a glance

The full STRIDE table below has 35 rows. These ten are the ones that decide
whether the deployment is safe to hand to a real event; the rest are defence in
depth. **Residual** is what is still true after the mitigation ships — "None"
means the control is enforced server-side and asserted by a test, not merely
implemented.

| # | Threat | Category | Impact | Mitigation | Residual |
|---|--------|----------|--------|------------|----------|
| 1 | Peer judge scores exposed | Information disclosure | **High** | `judging.myQueue` is scoped to the caller's own `judgeId`; `progress` / `judgesOverview` require organizer. Asserted by `run.py` T2 over HTTP and by `tests/rbac.test.ts` | None |
| 2 | Participant or judge calls an organizer/admin function | Elevation | **High** | `requireUser` / `requireRole` / `requireOrganizer` inside every function in `src/convex/lib/common.ts`; `unlockRubric` and `setRole` are admin-only | None |
| 3 | Stolen browser session token replayed | Spoofing | **High** | RS256 JWT verified server-side before `sub` is read; tokens in `sessionStorage`, not `localStorage`; TOTP available for privileged roles | Session revocation is manual — no session list, so a lost device is removed by an admin password reset |
| 4 | A privileged actor edits history to hide a change | Tampering / Repudiation | **High** | Append-only hash chain (`entryHash` folds in `prevHash`); `audit.verifyChain` recomputes it and names the first break; every privileged write appends actor, target, before and after | Detects, does not prevent — a database owner with write access can still rewrite rows; only the break is reported |
| 5 | Rubric weights change after judges have scored | Tampering | **High** | Stage lock + explicit lock, both reported by `getRubric`; every criterion write passes `assertRubricEditable`; weights must sum to 1.000 | An admin can unlock and edit mid-event; the change is audit-logged but not reversible |
| 6 | Invite token guessed, reused or replayed to gain a role | Elevation | **High** | Only the token hash is stored; plaintext shown once; expired/used/revoked rejected; the invited email must match the signed-in account; the role comes from a server-side allowlist, never the client | Invite lookup has no rate limit — see Known gaps |
| 7 | Webhook pointed at cloud metadata or internal infrastructure | SSRF | **High** | `lib/webhookTarget.ts`: HTTPS/HTTP only, credentials-in-URL rejected, metadata addresses blocked | Loopback and RFC1918 receivers stay allowed **on purpose** — self-hosting means a same-network receiver is normal |
| 8 | Stored script injection through a comment or project field | Injection | **High** | React escapes by default; `Markdown` renders a safe subset with raw HTML never enabled and an `http(s)`/`mailto`/`tel`/relative href allowlist; CSP forbids inline and external script | None for the rendered paths; Markdown is a subset, so author-supplied HTML/iframes are dropped rather than sanitised |
| 9 | Results or tallies read before publication | Information disclosure | Medium | Vote tallies masked until `published`; `normalization.analyze` requires organizer; the Bradley–Terry leaderboard is organizer/admin-only pre-publish | None — enforced in the query, not the UI |
| 10 | Certificate signing key or session hashes read out of the KV table | Information disclosure | Medium | The settings projection strips `cert_secret` and every `session:` / `ratelimit:` / `lookup:` / `invite:` / `judge_tracks:` / `rubric_lock:` row; `sec.platform_secrets` asserts it on live data | Secrets are stored in the same database as the data they protect — no separate KMS or secret manager |

## STRIDE analysis

| # | Threat | Attack description | Mitigation / status | Where |
|---|---|---|---|---|
| 1 | **Spoofing** — enumeration | Probe sign-in responses to discover registered addresses | Unknown address, wrong password and lockout all collapse into one message; sign-up is deliberately exempt | `lib/signInErrors.ts`, `auth.ts` |
| 2 | **Spoofing** — brute force | Guess passwords or bulk-create accounts | Fixed-window throttle on every sign-in/sign-up attempt keyed by `sha256(email)` (20 per 5 min, **successful attempts included**) on top of the library's failure lockout; scrypt hashing. The surfaced message is the throttle's own, not a generic failure — `lib/signInErrors.ts` | `voting.consumeAuthAttempt`, `auth.ts` |
| 3 | **Spoofing** — session hijack | Reuse a stolen browser token | RS256 session JWTs verified server-side before any `sub` is trusted; tokens live in `sessionStorage`, not `localStorage`; legacy local tokens purged at boot; privileged roles can require TOTP | `lib/jwt.ts`, `lib/tokenStorage.ts`, `main.tsx`, `mfa.ts` |
| 4 | **Spoofing** — forged token | Mint an unsigned/`alg:none` JWT and call the REST API | Signature verified against the published JWKS; forged tokens are rejected before `sub` is read | `lib/jwt.ts`, `sec.token_forgery` |
| 5 | **Tampering** — CSRF | Cross-site request mutates state | Convex Auth session validation plus same-origin deployment and a strict CSP (`script-src 'self'`). An explicit double-submit CSRF token is **not implemented** | `main.tsx`, `frontend/nginx.conf` |
| 6 | **Tampering** — audit rewrite | A privileged actor edits or deletes history to hide an action | Audit log is append-only and hash-chained (`entryHash` includes `prevHash`); `audit.verifyChain` recomputes the chain and reports the first break | `lib/audit.ts`, `audit.ts` |
| 7 | **Tampering** — rubric drift | Weights change after judges have scored | Stage lock + explicit admin-clearable lock; every criterion write passes `assertRubricEditable`; weights must sum to 1.000 | `judging.ts`, `sec.rubric_weights` |
| 8 | **Tampering** — ranking skew | Record a pairwise win for an unrelated project | Both sides must exist, belong to the event and be submitted; the winner must be one of the two | `pairwise.ts` |
| 9 | **Repudiation** | A privileged actor denies a change | Mutations append hash-chained rows with actor, target, before and after state | `lib/audit.ts` |
| 10 | **Information disclosure** — peer scores | Judge A reads Judge B's scores or assignments | `myQueue` is scoped to the caller's own `judgeId`; `progress`/`judgesOverview` require organizer; the acceptance checker exercises judge-A-allowed / judge-B-blocked | `judging.ts` |
| 11 | **Information disclosure** — draft scraping | Read unpublished submissions or an unannounced event | `submissions.byEvent` requires organizer; `events.get`/`getBySlug` refuse draft events to non-staff; gallery follows event stage + submission status | `submissions.ts`, `events.ts` |
| 12 | **Information disclosure** — hidden results | Read tallies or rankings before publication | Vote tallies are masked until `published`; normalization requires organizer; the Bradley–Terry leaderboard is organizer/admin-only pre-publish | `voting.ts`, `normalization.ts`, `pairwise.ts` |
| 13 | **Information disclosure** — secret rows | Read the certificate signing key or session hashes out of the KV table | The settings projection strips `cert_secret` and every `session:` / `ratelimit:` / `lookup:` / `invite:` / `judge_tracks:` / `rubric_lock:` row; `sec.platform_secrets` asserts it on live data | `admin.ts`, `securityChecks.ts` |
| 14 | **Information disclosure** — private team chat | A non-member (or staff) reads a team's channel | Chat resolves membership itself and refuses non-members, staff included; the upload URL is membership-gated too | `teamChat.ts` |
| 15 | **Information disclosure** — invite codes | Harvest invite codes from a team list | `teams.listByEvent` nulls `inviteCode` unless the caller is a member or staff; `getTeam` returns a limited card to non-members | `teams.ts` |
| 16 | **Information disclosure** — exports | Read CSV/JSON of scores or rankings without a role | Every export requires organizer; private CORS headers and `no-store` | `exports.ts`, `http.ts` |
| 17 | **Denial of service** — spam | Flood votes, comments or sign-ups | Fixed-window limiter (20/min) for votes and comments and (20/5 min) for credential attempts, backed by `platform` rows; Sybil burst heuristics flag suspicious fingerprints to the audit log | `lib/rateLimit.ts`, `voting.ts`, `comments.ts` |
| 18 | **Elevation** — role abuse | Participant or judge calls organizer/admin functions | Shared role guards inside every function; `unlockRubric` and `setRole` are admin-only; `webhooks.dispatch` requires organizer; `users.list` requires organizer | `lib/common.ts`, `judging.ts`, `admin.ts`, `webhooks.ts` |
| 19 | **Elevation** — invite abuse | Guess, reuse, or replay a role invitation | Only the token **hash** is stored; plaintext shown once; expired, used and revoked invites are rejected; the invited email must match the signed-in account; the role is applied server-side from a validated role list and never chosen by the client; granting and consuming are one transaction; `revokeInvite` and `invite.accept` are audited | `admin.ts` (invites table) |
| 20 | **Elevation** — account takeover via lockout bypass | Enumerate lockouts to learn which accounts exist | The lockout state reports the same uniform message as any other failure | `lib/signInErrors.ts` |
| 21 | **Integrity** — duplicate submissions | Submit the same project twice to farm awards | Title **or** repository-URL duplicate detection in the same event, first-writer-wins, written to `flags` and surfaced for organizer review; `sec.duplicate_flags` asserts no duplicate sits unflagged | `lib/algorithms/duplicates.ts`, `submissions.ts` |
| 22 | **Integrity** — assignment collisions | One judge silently scores a project twice (double weight in normalization) | `runAssignment` de-duplicates (judge, submission) pairs; `sec.assignment_uniqueness` asserts it on live data | `judging.ts`, `securityChecks.ts` |
| 23 | **Integrity** — score revision | A judge revises a score after seeing other results | `submitScores` rejects a second submission for a completed assignment; only staff can correct explicitly | `judging.ts` |
| 24 | **Integrity** — Sybil voting | One actor creates many votes or overspends credits | Per-user quadratic budget, one-vote-per-submission in upvote mode, hashed IP/user-agent fingerprints, burst flagging to audit. External identity proof is **not implemented** | `voting.ts` |
| 25 | **Integrity** — load starvation | One judge absorbs the whole event (or a project gets no judges) | Hard per-judge cap (default 8) with `capReached` / `unstaffedSubmissions` reporting; `k` and `cap` validated; `sec.assignment_load_cap` re-runs the planner over live data | `lib/algorithms/assignment.ts`, `judging.ts` |
| 26 | **Webhook replay** | Replay a captured delivery | HMAC-SHA256 over payload + timestamp + nonce with a bounded window; receiver-side replay storage is the receiver's responsibility | `lib/webhookSignature.ts`, `webhooks.ts` |
| 27 | **SSRF** | Point a webhook at cloud metadata or internal infra | HTTP(S)-only, credential rejection in the URL, metadata-address blocking. Loopback/private receivers stay allowed **on purpose** — self-hosting means a receiver on the same network is normal | `lib/webhookTarget.ts` |
| 28 | **Open redirect** | A `returnTo` sends a user to an attacker domain after sign-in | `resolveReturnTo` accepts same-origin paths and rejects absolute, protocol-relative, backslash, control-character and encoded-separator variants | `lib/safeRedirect.ts` |
| 29 | **Injection** — stored script | A comment or field carries a payload | React escapes by default; `Markdown` renders a safe subset with raw HTML never enabled and `http(s)`/`mailto`/`tel`/relative hrefs only; CSP forbids inline and external scripts (`script-src 'self'`, `object-src 'none'`, `base-uri 'self'`) | `frontend/nginx.conf`, `src/components/ui/Markdown.tsx` |
| 30 | **Input abuse** | Oversized or malformed input | Bounded lengths and validated link schemes on submissions, comments, chat and criteria; `sec.input_bounds` / `sec.link_schemes` assert them | `submissions.ts`, `comments.ts`, `judging.ts`, `securityChecks.ts` |
| 31 | **Business logic races** | Concurrent joins, scores or certificate issuance | Convex mutations are transactional and retry on conflict; certificate issuance is additionally idempotent on `(event, user, type)`. Formal load testing is **not implemented** | Convex runtime, `certificates.ts` |
| 32 | **Supply chain** | A dependency or image changes under you | Exact dependency versions plus lockfile (`npm ci`); container image **digests are not pinned** | `package.json`, `package-lock.json`, `docker-compose.yml` |
| 33 | **Untrusted CI** | A PR runs with write secrets | Workflows use read permissions, pinned actions and `pull_request`. A live CI review is **not implemented** in this sandbox | `.github/workflows/ci.yml` |
| 34 | **Fail-open checks** | A skipped security check silently counts as a pass | Skipped checks are excluded from the pass count, and a check with no input reports `skipped`, never `pass` | `acceptance.ts`, `securityChecks.ts` |
| 35 | **Missing timeouts** | A hung network call stalls bootstrap or delivery | Every probe has explicit connect/read timeouts and a retry cap; webhook delivery and nginx proxies are bounded; `bootstrap` fails rather than hanging | `backend/entrypoint.sh`, `webhooks.ts`, `frontend/nginx.conf` |

## Out of scope

Physical host compromise, PostgreSQL administrator compromise, malicious
container images, and availability attacks against a self-hosted installation.
There is no WAF, no distributed rate limiter, no external identity proof, and no
formal incident-response process.

## Known gaps (explicit, not assumed-protected)

| Gap | Impact | Why it is acceptable here |
|---|---|---|
| No CSRF token layer | A same-site-less deployment loses the second CSRF defense | Convex Auth session validation + same-origin deployment + strict CSP; add a double-submit token before exposing cookies cross-site |
| Rate limiter is per-deployment | A CDN/multi-replica setup can multiply the effective limit | Fixed windows in the database are O(1) and cannot be flushed; add an edge limit if you front it with a proxy fleet |
| Sybil resistance is heuristic | A determined actor with many identities can still vote | Quadratic budget + duplicate detection + fingerprint burst flagging raise cost; real identity proof is a product decision |
| Export schema unversioned | A downstream consumer can break on a column change | Column sets are stable in practice; version the header before external use |
| Images not digest-pinned | A moved tag changes the build silently | Pin digests in `docker-compose.yml` for a production deployment |
| Invites carry no rate limit | An attacker can guess tokens fast | Tokens are ≥ 128-bit random and only hashes are stored, so guessing is infeasible; the throttle on credential attempts does not cover invite lookup |
| No formal load testing | Concurrency limits are reasoned, not measured | Convex serializes mutations; the hot paths are bounded loops over event-sized data |

## References

1. `src/convex/lib/rbac.ts`, `src/convex/lib/common.ts` — role authorization
2. `src/convex/lib/audit.ts`, `src/convex/audit.ts` — hash-chained audit trail
3. `src/lib/safeRedirect.ts` — open-redirect validation
4. `src/lib/tokenStorage.ts` — session token storage
5. `src/lib/webhookTarget.ts`, `src/convex/lib/webhookSignature.ts` — webhook SSRF and replay
6. `src/lib/rateLimit.ts`, `src/convex/voting.ts` — rate limiting policy and storage
7. `src/convex/lib/securityChecks.ts` — the T5 self-check battery
8. `frontend/nginx.conf` — browser security headers and proxy timeouts
