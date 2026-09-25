# Final Review — verification ledger

An honest record of **what is actually verified, how, and what is not**. Nothing
here is claimed unless it can be reproduced with a command in this repository.

Last verified: 2026-09-25.

---

## 1. How to reproduce

| Claim | Command | Result |
|---|---|---|
| TypeScript compiles | `bun tsc -b --noEmit` | clean (0 errors) |
| Unit + algorithm tests pass | `bun run test` | **202 passed / 202, 17 files** |
| Normalization proof matches the app | `bun run proof:normalization` | regenerates `normalization-proof.txt` from `fixtures.json` via the real algorithm module |
| Official acceptance suite | `python3 run.py .dogfood.toml` (stack running) | 7/7 — recorded in `acceptance-report.txt` |
| In-app tier + security suite | `POST /api/v1/acceptance` as organizer, or the Acceptance panel | 22 tier checks + 17 T5 security checks |

The 202 tests are the deterministic layer: pure algorithms
(`assignment`, `normalization`, `pairwise`, `duplicates`), security primitives
(`rbac`, `authGuard`, `jwt`, `totp`, `secretBox`, `webhookSignature`,
`webhookTarget`, `safeRedirect` via `inputValidation`, `rateLimit`, `tokenStorage`,
`wellKnown`, `authKeysScript`) and two fixture-driven proofs
(`normalizationProof`, `duplicates`).

---

## 2. Acceptance status (T1 + T2)

`run.py .dogfood.toml` drives seven checks against a running stack. All seven
pass; the recorded output is in `acceptance-report.txt`:

```
T1  gallery is public ................. PASS
T1  project from fixtures shown ....... PASS
T1  closed event refuses submissions .. PASS
T2  judge sees own scores ............. PASS
T2  judge cannot see peer scores ...... PASS
T2  participant blocked ............... PASS
T2  csv export works .................. PASS
```

These checks are the reason the judging and role-isolation work is conservative:
every change was reasoned against them, and the REST contract they exercise
(`http.ts` → `httpPublic.ts`) is verified before `sub` is trusted.

---

## 3. Fixture-driven facts

The seed creates one event from `fixtures.json`:

| Fact | Value |
|---|---|
| Event slug | `sample-hack-2026` ("Sample Hack 2026"), status `closed` |
| Population | 8 tracks, 30 judges, 40 teams, 41 projects, 126 score rows |
| Criteria | 3 — Functionality / Quality / Innovation, weight `1/3` each, range 1–5 |
| Seeded accounts | `admin@fixture.local`, `organizer@fixture.local`, `participant@fixture.local`, `tomas.varga@example.org` (judge A), `wei.lindqvist@example.org` (judge B) — password `dogfood2026` |
| Known duplicate | `prj_07` and `prj_41` are both "Dry Harbour" with the same repo URL; the detector flags **`prj_41`** (earliest wins) |
| Judge bias | harshest panel mean `2.000` vs most generous `4.222` — the normalization proof's raw gap of `2.222` points |
| On top of fixtures | demo community votes, pairwise comparisons, certificates, and one duplicate scan are seeded so voting / pairwise / certificate screens open with real data |

---

## 4. Judging engine

| Capability | Status | Evidence |
|---|---|---|
| Load-balanced, conflict-aware assignment | implemented | `lib/algorithms/assignment.ts` + `tests/assignment.test.ts` |
| Per-judge load cap (default 8) | implemented | cap enforced in the planner; `capReached`/`unstaffedSubmissions` returned; `sec.assignment_load_cap` re-runs it on live data |
| Track affinity | implemented | `judge_tracks:<userId>` platform rows → `affinityTracks` → tie-break |
| Assignment preview before commit | implemented | `judging.previewAssignment` (dry run) + preview modal |
| Rubric weights must sum to 1.000 | implemented | `upsertCriterion` validation + live modal feedback + `sec.rubric_weights` |
| Rubric lock (admin-only unlock) | implemented | stage lock + explicit lock; `assertRubricEditable` on every write |
| Judge queue scoped to own work | implemented | `myQueue` binds to caller `judgeId`; cross-judge requires organizer |
| Live weighted total | implemented | `JudgeScore.tsx` |
| Draft autosave + lock on submit | implemented | localStorage draft + `submitScores` refuses a completed assignment |
| Progress "N of M" | implemented | derived from the queue |
| Z-score normalization (0–10) | implemented | `normalizeScores` + `zToTenPoint`, proof regenerated |
| Bradley–Terry pairwise ranking | implemented | `pairwise.ts` MM + validity checks; organizer-only leaderboard pre-publish |

---

## 5. Role isolation

Server-side, in the function (not the UI). The full endpoint matrix is in
[JUDGING.md §7](JUDGING.md#7-role-isolation); the boundaries are asserted by the
T5 battery and `tests/rbac.test.ts`.

The two that matter most are directly exercised by the acceptance checker:

- a judge reads **their own** scores (`200`) while another judge is blocked
  (`401/403`);
- a participant is blocked from judge and organizer endpoints entirely.

Additional boundaries verified in code: `submissions.byEvent` (drafts never leak),
`events.get`/`getBySlug` (draft events invisible to non-staff),
`judging.progress` / `allScores` / `normalization.analyze` (organizer only),
`pairwise.leaderboard` (organizer/admin until publish), `teamChat.*` (members
only, **staff excluded**), `teams.listByEvent` (invite code hidden),
`admin.getSettings` (secret rows stripped).

---

## 6. Tier completion

| Tier | Feature | Status |
|---|---|---|
| T1 | Auth, sessions, four roles, events, tracks/prizes, teams + invite codes, draft/submit, deadline lock, gallery, comments | Complete |
| T2 | Assignment (+cap, affinity, preview), rubric (+validation, lock), isolated queues, scoring (+autosave, lock, progress), z-score normalization, pairwise Bradley–Terry, CSV exports | Complete |
| T3 | Plain + quadratic voting with hidden tallies, comment moderation, seeded gallery order, rate limiting (vote / comment / sign-in / sign-up), duplicate detection, audit chain verification | Complete |
| T4 | REST API + OpenAPI, HMAC webhooks with replay protection, certificates + verification, signed judge records, embeddable widget, bulk import/export | Complete |
| Bonus | Normalization proof, Bradley–Terry, STRIDE threat model, API-first design | Complete |

---

## 7. Honest gaps

Carried forward from [README.md](README.md) and
[THREAT-MODEL.md](THREAT-MODEL.md); none of these is a hidden failure, and each
has a stated workaround:

- The **Compose runtime path was not executed in the development sandbox** (no
  Docker there). Docker correctness rests on static review of
  `docker-compose.yml`, `backend/entrypoint.sh` and `frontend/nginx.conf`, on unit
  tests, and on the REST contract — not on a live `docker compose up`. Run
  `npm run docker:verify` on a Docker host before trusting it.
- **CSRF double-submit token** not implemented (session validation + same-origin +
  CSP are the mitigations).
- **Distributed rate limiting** not implemented (fixed windows are per-deployment).
- **Sybil resistance is heuristic**, not identity-backed.
- **A few destructive confirmations** still use the browser `confirm()` dialog
  instead of the in-app `ConfirmDialog`.
- **Export columns are unversioned**; container **image digests are not pinned**;
  no **database dump wrapper** script.
- **No automated contrast audit** and no formal load testing.

---

## 8. What changed in this pass

See the README's feature matrix for the current state. The substantive changes
were: the judging engine's cap / affinity / preview / rubric locking, the
ten-point normalization and its regenerated proof, server-side role isolation
across `judging`, `submissions`, `teams`, `teamChat`, `comments`, `pairwise`,
`events`, `admin` and `webhooks`, the credential-attempt throttle, duplicate
detection with organizer flags, the organizer results view (normalization +
Bradley–Terry from live data), the judge scoring form, the `/workspace/chat`
route, and this documentation set.
