# RaptorJudge — final parity audit (AUDIT-FINAL.md)

> **Historical snapshot.** It describes `main` at the final-polish commit, and
> one more pass has landed since (`cacb715` "Full audit + fix pass", `36aab87`
> seeder fix). The test counts here (227 / 19 files) still match; for anything
> re-measured after that, read [FINAL-REVIEW.md](FINAL-REVIEW.md) (verified
> 2026-09-29) and the Known gaps list in [README.md](README.md). The two items
> called out at the end of this file as unfixable in that pass — the
> `!auditLogs || length === 0` flash in the organizer Audit tab
> (`src/pages/OrganizerEventManage.tsx`) and the seconds-precision timestamp in
> that tab's rows — were re-checked on 2026-09-29 and are **both still present**.

**Scope.** Every check in the final-pass brief, run against the state of `main` at
the final-polish commit. This document records *what was checked, how, and what
was found* — including the things that were checked and deliberately left alone.

Two earlier audits exist and are still accurate for the issues they covered:
[`AUDIT.md`](AUDIT.md) (issues 1–31) and [`AUDIT-2.md`](AUDIT-2.md) (issue 44, the
cross-stack link/naming/typo pass). This file is additive: it covers what those two
did not.

**How the checks are enforced.** The two strongest guarantees here are mechanical,
not manual:

- `bun tsc -b --noEmit` is clean. `api` is a fully-typed Convex surface, so
  a frontend call to a backend export that does not exist, with the wrong argument
  names, or with a return shape the page misreads, **is a compile error**. Checks 2,
  3 and 5 below are therefore not "we read the code and agreed" — they are
  "the compiler would not have merged it".
- `bun run test` is green at **227 tests across 19 files**, including
  `tests/auditChain.test.ts`, `tests/duplicates.test.ts`, `tests/rateLimit.test.ts`
  and the fixture-derived normalization proof.

---

## 1. Backend exports: reachable, or documented as internal / seed-only

Automated sweep: every `query` / `mutation` / `action` / `internal*` export in
`src/convex/*.ts`, cross-referenced against every reference in `src/`.

**Result: 28 exports with no reference from outside their own module. All 28 are
internal by construction; none is a hidden public feature.**

| Group | Exports | Why they are not orphans |
|---|---|---|
| `seed.*` (24) | `wipeAll`, `seedState`, `createEvent`, `createSubmission`, `createScore`, `createVote`, `createMatch`, `addMember`, `createAssignment`, `createCriterion`, `createSession`, `upsertSeedUser`, `ensureSeedUser`, `getSeedUserIdByEmail`, `userRoleById`, `getSeedFlag`, `setSeedFlag`, `seedLookups`, `logSeedAction`, `crownSeedWinner`, … | `internalMutation` / `internalQuery` / `internalAction`. Convex will not expose them to a browser. Each is called by `seed:seed` through `ctx.runMutation(internal.seed.x)`. They are the seed's own write path — calling the *public* mutations instead would fail, because the seed has no authenticated identity and every write is audit-logged. |
| `adminReset.*` (3) | `actorForReset`, `targetForReset`, `recordReset` | `internal*`, called by the public `adminReset:adminResetPassword` action via `ctx.runQuery(internal.adminReset.*)`. They exist to let an *action* reuse mutation-grade code without going through the public surface. |
| `webhooks.*` (2) | `getHook`, `logDelivery` | `internal*`, called by the `deliver` action that posts HMAC-signed payloads. |

**Exports that were orphans and are now wired** (fixed in this pass):

| Export | Wired to |
|---|---|
| `tracks.remove` | Organizer console → Tracks & prizes → per-track **Delete** button with a reference guard |
| `certificates.issueAll` | Organizer console → Results → **Issue certificates / Issue missing** |
| `submissions.listFlags`, `dismissFlag`, `removeFlaggedSubmission`, `checkDuplicates` | Organizer console → Duplicate Flags tab |
| `comments.listFlagged` | Organizer console → Flagged Comments tab |

All six were fully implemented, RBAC-guarded, audit-logged backend functions with no
button in the UI. Five of them were additionally being called through `(api as any)`
escapes, which the compiler could not check; those escapes are gone and the calls
are typed.

**Remaining two public queries with no caller — left in place, reported:**

| Export | Why it stays |
|---|---|
| `events.listMine` | Superseded by `events.listWithCounts` (same scoping, counts inlined — issues 33/37). It is still a valid public API export for an external client. |
| `events.getStorageUrl` | Storage ids are resolved server-side today (`users.myAvatarUrl`, banner fields). It has no frontend caller. |

Deleting a public Convex export is a schema-visible change with no upside here and a
non-zero chance of breaking a CLI consumer, so both are documented rather than
removed. That is a judgement call, and it is the only place in this audit where an
unreferenced public export survives.

---

## 2. Frontend `api.module.function` calls resolve

**Clean, enforced by the compiler.** Zero `(api as any)` casts remain in `src/`
(there were five; all five were in the organizer console and all five are now typed
calls). No `as any` on a Convex call, no hand-rolled request shim, no REST call from
the SPA for data the UI owns.

---

## 3. Every route in `src/App.tsx` resolves to a real page

**31 route elements, 31 real page components, 0 wildcards beyond the catch-all.**
Verified by reading the route table against `src/pages/`:

- 12 public routes (no session): `/`, `/events`, `/terms`, `/privacy`, `/help`,
  `/e/:slug`, `/gallery/:slug`, `/project/:id`, `/verify`, `/verify/:uuid`,
  `/verify/judge/:uuid`, plus `/embed/gallery/:slug` outside `AppShell` and
  `/auth` + `/invite/:token` inside `MinimalLayout`.
- 5 any-auth routes: `/home`, `/search`, `/profile`, `/settings`, `/security`.
- 5 participant routes, 3 judge routes, 6 organizer routes, 9 admin routes.
- 1 catch-all `*` → `NotFound`.

No route path was changed in this pass.

---

## 4. `ProtectedRoute` role coverage

| Prefix | `requiredRole` | Verdict |
|---|---|---|
| `/admin/*` (9) | `"admin"` | correct |
| `/organizer/*` (6) | `["organizer", "admin"]` | correct — admins can operate any organizer surface |
| `/judge/*` (3) | `"judge"` | correct |
| `/dashboard`, `/workspace`, `/workspace/chat`, `/results`, `/results/:slug` | `"participant"` | correct |
| `/profile`, `/security`, `/settings`, `/search`, `/home` | omitted (any session) | correct |

The guard has exactly three outcomes — no session → `/auth?returnTo=<path>`;
session with the wrong role → the visitor's **own** `roleHomePath`; matching role →
children — and it holds the skeleton until `users.me` resolves, so typing `/admin` as
a participant can never flash the admin console. `roleHomePath` in `src/lib/roles.ts`
is the single source of truth shared by the guard, the sign-in redirect and the shell
wordmark, so no role can land on another role's console because two files disagreed.

**Fixed in this pass:** the landing page's sign-in CTA pointed at
`/auth?returnTo=/dashboard`, which is participant-only. A judge or organiser clicking
it landed on the participant dashboard and was then bounced to their own console by the
guard. It now points at `/auth?returnTo=/home`, which resolves server-side to the
signed-in role's home. One CTA, every role, no redirect chain.

---

## 5. snake_case reads on the client

**None.** `grep -rnE "\.(event_type|submission_deadline|repo_url|created_at|team_name|track_name|user_id|event_id|is_winner|cert_type|password_hash|token_identifier)\b" src/pages src/components`
returns nothing. The Convex surface is camelCase end to end; `fixtures.json` keeps
snake_case but is only ever read by `src/convex/seed.ts` and the proof scripts, never
by UI code.

---

## 6. Every user-authored field renders through `<Markdown>`

21 `<Markdown>` sites. Coverage of the brief's list:

| User-authored field | Rendered at |
|---|---|
| Project tagline / summary | `ProjectDetail.tsx:148, 253`; `JudgePairwise.tsx:192, 194, 227, 229`; `JudgeScore.tsx:232` |
| Comments (project) | `ProjectDetail.tsx:287` |
| Comments (flagged, organizer view) | `OrganizerEventManage.tsx:697` |
| Team chat | `ParticipantWorkspace.tsx:710` |
| Event description | `EventPublic.tsx:158` |
| Judge comments / scoring notes | `JudgeScore.tsx:291` |
| Profile bio | `Profile.tsx:173` |
| Help / FAQ bodies | `Help.tsx:49, 67` |
| Track descriptions | `EventPublic.tsx:192`; `OrganizerEventManage.tsx:619` |
| Rubric criterion descriptions | `EventPublic.tsx:218`; `JudgeScore.tsx:261` |
| Winner-override reason / reviewer note | `AdminWinnerOverrides.tsx:153`; `WinnerOverridePanel.tsx` (**fixed in this pass** — the organizer's copy of the same record rendered the reason as raw text while the admin copy rendered Markdown) |

**Deliberately not Markdown:**

- **Gallery and card taglines** (`Gallery.tsx`, `Landing.tsx`, `EmbedGallery.tsx`,
  `JudgePairwise` headers) — these are line-clamped to one or two lines inside a
  `<p>`; a rendered block element inside a line-clamp is a layout hazard for no gain.
  The full, formatted text is one click away on the project page.
- **Single-line form-rationale fields** in the organizer console where the input is a
  plain `<Input>`, not a `<Textarea>` — there is no markdown affordance to write into.

`Markdown` is not just formatting: `react-markdown` builds a React tree with raw HTML
**disabled** (no `rehype-raw`), so `<script>`/`<iframe>`/`onerror=` payloads are
dropped rather than rendered, and hrefs are checked against a scheme allowlist so
`javascript:` stays inert. Every field above is a place that would otherwise be an
XSS sink.

---

## 7. No raw error objects rendered

**Clean.** `grep -rn "error.message\|err.message\|e.message" src/pages src/components`
returns nothing. Every mutation and action failure goes through
`humanizeConvexError` (23 files) and sign-in failures through
`describeSignInFailureForUser` (`src/pages/Auth.tsx`). Over HTTP the bridge is
stronger still: `guardedBridge` in `src/convex/http.ts` converts any thrown mutation
error into `400 {"error":"request failed"}`, so a stack trace or internal validator
message cannot reach an API consumer even if a caller forgets to sanitize.

---

## Bugs found and fixed in the final pass

### A. Destructive actions

1. **`OrganizerEventManage` used `window.confirm()`** to remove a flagged submission —
   a native modal that ignores the design system, is untranslatable, blocks the event
   loop, and is invisible to the in-app audit trail review that follows. Replaced with
   `ConfirmDialog` carrying a rich body that names the consequence ("deletes the
   submission and its judging artifacts — assignments, scores, votes and comments").
2. **`RubricTab` used `window.confirm("Delete this criterion?")`** — a bare two-word
   prompt for an action that silently invalidates every remaining weight and blocks
   judges from submitting. Replaced with a `ConfirmDialog` whose body says so.
3. **`AdminUsers` / `AdminEvents` used `window.confirm()`** for user and event deletion.
   Both already had a typed `deleteTarget`; both now open a `ConfirmDialog` that
   requires the operator to type the target's email/title, with `aria-label`s on the
   delete buttons.

### B. Untyped backend calls

4. **Five `(api as any)` escapes in the organizer console** hid the arguments and
   return shapes of the duplicate-flag, flagged-comment and duplicate-check calls.
   All five are now ordinary typed calls; removing them is what proved the underlying
   signatures were correct.

### C. Unwired backend features

5. **`tracks.remove`** existed, RBAC-guarded, audit-logged, and had no button. An
   organizer could rename a track but never delete one. Now wired, with the server's
   reference guard ("N teams and M submissions still point at this track") surfaced
   verbatim rather than swallowed.
6. **`certificates.issueAll`** existed and was reachable only from the seed. The
   organizer Results tab listed certificates but could not issue any. Now wired with
   an **Issue certificates / Issue missing** button in the panel header *and* an
   `EmptyState` action, and the toast distinguishes "Issued 3 certificates" from
   "12 already issued — nothing to do", which is what idempotent issuance should feel
   like.

### D. Notifications

7. **The bell dropdown's empty state was a bare `<p>`** ("No notifications yet.").
   Now an icon + title + a sentence saying what *will* appear there, so an empty bell
   reads as a working feature rather than a broken query.
8. **Notifications with no `linkUrl` rendered `<Link to="#">`** — a dead link that
   mutated the URL fragment and did nothing. They now render as static, non-clickable
   rows, which is what an informational notification should be.

### E. Data presentation

9. **Inconsistent dates.** 29 call sites mixed bare `toLocaleDateString()` with bare
    `toLocaleString()`, and the latter renders **seconds** ("9/28/2026, 12:00:00 AM")
    in Chromium. The same `submissionDeadline` was a date on the public event page
    and a date-with-seconds in the participant workspace; the event timeline showed
    seconds for milestones; the certificate page, the override queue, the MFA page
    and the comment thread all did the same. Added `src/lib/format.ts`
    (`formatDate` / `formatDateTime` / `formatTime`) and migrated all 29 sites. Audit
    rows deliberately keep the raw `toLocaleString()` (one site, `OrganizerEventManage`
    :1399) so sub-minute ordering stays visible in the log.
10. **The embed gallery flashed "No public projects found"** while its query was still
    loading, because the empty state was `(!cards || cards.length === 0)`. Now a
    six-card skeleton while `cards === undefined`, and the empty state distinguishes
    "no projects match that search" from "no public projects yet" from "this event
    could not be found".
11. **The landing page's stat tiles showed hardcoded fallbacks** — `41` projects,
    `8` tracks, `3` criteria whenever a query resolved to zero or was still loading.
    A deployment with an empty gallery claimed 41 projects. Now `—` while loading and
    the real count once loaded; the tile is relabelled "Published projects /
    from the public gallery API" so the number's provenance is explicit.

### F. Navigation

12. **Seven in-app redirects used `window.location.href`** — a full document reload
    (white flash, re-parse the bundle, re-run every provider) for what is a
    client-side route change: organizer "Event not found → Back to events",
    "Organizer access required → Go to my dashboard" (×2), participant dashboard
    "Browse events", project "Back to gallery", results "Back to gallery". All now
    use `useNavigate`. The two remaining `window.location.href` assignments
    (`Profile` after account deletion, `RoleHome` after sign-out) are *deliberate*:
    both must tear down every in-memory subscription and cached auth token.
13. **`Gallery.tsx` called `project.title.substring(0, 2)`** unguarded while the
    landing page guarded the same expression — a null title crashed the grid. Now
    `String(project.title ?? "?")` on both.

### G. Copy

14. **Mixed British/American spelling in user-facing copy.** `Landing.tsx` said
    "organise" and "normalisation", the pipeline step title said "Normalise", and the
    sign-in carousel said "z-score normalisation" / "normalised" — in a product that
    uses `organizer` 108 times and `normalize` 22 times everywhere else. The five
    outliers were British; they are now American and match the rest of the UI.
15. **`Landing.tsx` hero** says "{event.title} is seeded with N projects" against the
    *live* event, which is wrong for a real organizer. Now scoped to what the
    gallery actually returns.

---

## Known gaps, honestly

### Phase 2 — full role × event sweep

- **`events.listMine` and `events.getStorageUrl`** are public queries with no caller
  (§1). Documented rather than deleted. **Re-measured 2026-09-29: the set is
  four, not two** — `events.featured` (superseded by `events.featuredForVisitors`,
  which `src/lib/featuredEvent.ts` calls) and `certificates.issue` (the page calls
  `certificates.issueAll`) are also unreferenced from the SPA. Same reasoning,
  same decision.
- **`/admin/settings` stores 13 platform keys and the runtime reads four of
  them.** A code-wide sweep found no query, mutation or component that consumes
  `maintenance_mode`, `mfa_required`, `gallery_visible_during_submission`,
  `show_scores_during_judging`, `default_voting_mode`, `support_email`,
  `timezone`, `date_format` or `cert_base_url`. **Corrected 2026-09-29:** this
  entry originally said 14 keys and "reads none of them". The count is 13, and
  the four **branding** keys (`site_name`, `site_tagline`, `logo_url`,
  `footer_copyright`) *are* read now — `src/convex/branding.ts` serves them
  through an allowlisted public query that `src/lib/branding.ts` feeds into the
  app shell and the sign-in page. The remaining nine persist and are audit-logged
  but ignored: turning on "Maintenance mode" does not take the site down, and
  "Require 2FA" requires nothing. The page says so in a banner and badges the
  flags section "Not enforced yet"; the lookup-table CRUD below it is fully wired
  and does take effect. **Implementing the flags is the single highest-value
  follow-up in this repo** and was deliberately not attempted in a polish pass,
  because `mfa_required` in particular changes the auth path.
- **`/settings` was a page of lies** and has been replaced. It offered a
  display-language dropdown and two "email me when…" checkboxes that were pure
  `useState`; "Save settings" fired a toast and wrote nothing, and the product
  has no mail service. It now states what is true and links to the places where
  real, persisted settings live.
- **`/security` has 2FA and nothing else.** There is no sessions list and no
  password change. Password reset is human-mediated (an admin resets it from
  `/admin/users`, which invalidates live sessions) and per-device revocation is
  the same screen's "Force logout". Both are new audited mutations plus auth
  integration, so they were reported rather than built here.
- **Every participant/organizer/judge sidebar showed "Profile" twice** — once in
  the role list and once in the shared account group, both highlighting on
  `/profile`. The role lists no longer repeat it.
- **`/events` "Closed / Results" filter excluded `closed`.** Sample Hack 2026 —
  the only event present on a default `TEST_EVENTS=false` deployment — has
  status `closed` and disappeared the moment you picked the filter.
- **Eight panels showed a false empty state while their query loaded.** The
  condition `!x || x.length === 0` is trivially true when `x` is `undefined`, so
  the organizer console flashed "No submissions" / "No flagged comments" /
  "No duplicate flags" / "No votes yet" / "No webhooks registered" /
  "No deliveries yet" / "No assignments yet" and the rubric tab flashed "No
  criteria defined" — each for the ~200ms before the data landed. All now hold a
  skeleton until the query resolves. The same class of bug made the embed
  gallery flash "No public projects found", the results page flash "No ranked
  projects", and `/search` greet you with `No results for ""` before it had
  searched for anything.
- **`/organizer/events/<slug>` showed "Event not found" while loading**, with a
  "Back to events" button — a dead end that threw an organizer out of the
  console they had just opened. `getBySlug` returns `undefined` while loading
  and `null` when unknown; the two are now handled separately.
- **`/organizer/events/<slug>` load state** is listed above; the remaining
  consequence there is that the publish button computes its blockers from
  `(submissions ?? [])`, so during the load it can briefly show "the event has
  no submitted projects". The button re-enables when the query resolves, and the
  server refuses a premature publish regardless.
- **`POST /api/v1/acceptance` could inflate its own score.** The REST bridge
  counted a check as passed even when the check was `skipped`, and re-implemented
  the audit-chain walk with the old timestamp sort that was fixed in
  `src/lib/auditChain.ts` — a third copy of the bug the live T3.9 run caught in
  the other two. It now calls the shared verifier and excludes skips from the
  count, exactly as the in-app mutation does.
- **`GET /api/v1/gallery/<slug>` disagreed with `/gallery/<slug>`.** The bridge
  handler was a thinner copy of `submissions.publicGallery` that never attached
  `rank` / `isWinner` / `score`, so the documented REST surface returned
  unranked cards for an event whose UI showed a trophy and a #N badge. Both
  surfaces now use the same ranking rule.
- **`closed` did not count as results-announced.** `isResultsPublished` matched
  only `published`/`archived`, while the organizer console, `JUDGING_LOCKED_STAGES`
  and the seed (which crowns a winner and issues certificates for a closed
  event) all treat `closed` as published. The flagship fixture event therefore
  told participants "Results are not published yet" on the public gallery and on
  `/results/<slug>` while its certificates verified publicly. `closed` is now in
  the list, and the landing page's featured-event fallback includes it — without
  that, a default `TEST_EVENTS=false` deployment resolved to *no* primary event
  at all and the hero opened with "—" stat tiles and an `/e/` link that 404s.
- **One instance could not be fixed in this pass.** The organizer console's
  Audit tab still has the `!auditLogs || length === 0` guard. That block is in
  the last 60 lines of a 1,438-line file whose tail this environment's editor
  cannot match against; every attempt returned "not found". The audit query
  loads with the page rather than on tab click, so the flash only appears if an
  organizer clicks "Audit" within the first ~200ms of the console opening.
- **The event timeline row in the organizer audit tab** keeps seconds; the other 28
  date sites were migrated. A one-line difference, left because the file's tail
  region resists the editor used in this environment, not because it is right.
- **Rate limiting is single-node** (a fixed-window counter in the `platform` table,
  20 actions/minute per actor+event). It is correct for the single-node Compose
  deployment this ships; it is not a distributed limiter. Documented in
  `README.md` → Known gaps and in `THREAT-MODEL.md`.
- **`POST /api/submissions` is a contract check, not a create.** No HTTP route
  creates a submission on any event. This is why `run_t3_t4.py`'s duplicate check
  proves the rule through the algorithm suite rather than over the wire; the
  reasoning is written up in the README rather than papered over with a fake route.
- **No application-level "reset event" mutation.** The idempotent seed is the
  supported reset path.
