# AUDIT-2 — full-stack parity audit (issue 44)

Second audit pass, run after issues 32–43 landed. Six areas were checked the way
issue 44 words them: broken links, typos and label mismatches, backend↔frontend
parity, route guards, naming consistency, and empty/loading/error states.

Method: static review of `src/App.tsx` (route table), `src/components/layout/AppShell.tsx`
(nav), every `<Link to>` / `navigate()` target and every `api.*` reference in
`src/`, plus `bun convex dev --once` / `bun tsc -b --noEmit` / `bun run test` to
keep the type-level parity claims honest. Checks that a script can do are
described as such so they can be re-run.

`FIXED` marks something changed in this pass. Everything else is either
confirmed-correct or a deliberate decision, recorded here rather than silently
left alone. Nothing in this pass touches `run.py`, `fixtures.json`, `spec.md`,
`.dogfood.toml`, `nginx.conf`, the acceptance route (`/api/v1/gallery/:slug`) or
the `sample-hack-2026` fixture event, so T1/T2 stay on their existing code paths.

---

## 1. Broken links

- **Route table**: 25 routes in `src/App.tsx`. Every `<Link to>` / `navigate()`
  target in `src/` was inventoried and matched against it: `/`, `/auth`,
  `/invite/:token`, `/events`, `/terms`, `/privacy`, `/help`, `/e/:slug`,
  `/gallery/:slug`, `/project/:id`, `/verify`, `/home`, `/search`, `/profile`,
  `/settings`, `/security`, `/dashboard`, `/workspace`, `/workspace/chat`,
  `/results`, `/results/:slug`, `/judge`, `/judge/pairwise`, `/judge/score/:id`,
  `/organizer`, `/organizer/events`, `/organizer/events/new`,
  `/organizer/events/:slug`, `/organizer/events/:slug/edit`, `/organizer/judges`,
  `/admin`, `/admin/users`, `/admin/events`, `/admin/audit`, `/admin/invites`,
  `/admin/settings`, `/admin/judging`, `/admin/winner-overrides`, `/admin/help`,
  `/embed/gallery/:slug`. **Zero unresolved targets.**
- **FIXED — organizer sidebar "Results" was a dead entry.** It pointed at
  `/organizer/events` (byte-identical to the "Events" entry above it, so it
  navigated to the page you were already on) and carried `match: () => false`,
  which meant it could never render as active. Per-event results live inside an
  event's management page, and there is no cross-event organizer results
  surface, so the honest fix was to delete the entry rather than invent a
  destination. Results remain reachable at `/organizer/events → Manage →
  Results`.
- **FIXED — organizer sidebar "Submissions" mislabelled its destination.** It
  linked to `/events`, which is the *public* event list; there is no
  cross-event submissions page. Relabelled **"Public events"** so the label
  matches the page (an organizer reaches submissions through the event they own).
  No `/admin` link renders outside admin context; the only `/organizer` links
  outside organizer pages are the role-gated redirects in `ParticipantDashboard`
  / `AdminDashboard` / `RoleHome` and the admin-only "Create event" button
  (admin is inside the `/organizer/*` guard).

## 2. Typos and label mismatches

- **FIXED — `/events` H1 vs sidebar label.** `Browse.tsx` headed the page
  "Browse events" while the participant *and* organizer sidebar entry that leads
  there says "Events". The H1 is now **"Events"**, so the sidebar label and the
  page title agree.
- **FIXED — admin "Overrides".** Sidebar said "Overrides"; the page H1 says
  "Winner overrides". Label aligned to the H1.
- **FIXED — `/events` card deadline was wrong for non-submission stages.** The
  browse card printed `Deadline: <submissionDeadline>` for every event, which is
  meaningless once an event is judging, voting or published — the exact defect
  issue 36 fixed in the organizer table, still present on the public list. Both
  now use `nextDeadline()` from `src/lib/eventStatus.ts`.
- **Coming Soon** (`src/lib/eventStatus.ts`) is the display label for the real
  `coming_soon` lifecycle status (registration has not opened yet). Intentional;
  kept.
- No lorem ipsum, and no `TODO`/`FIXME` in user-visible strings (`grep -rniE
  "lorem ipsum|TODO|FIXME" src/` → no UI strings). Copy was re-read for grammar
  and tense; no further changes needed.
- **FIXED — `OrganizerEvents` empty state was a bare paragraph.** It now uses the
  shared `EmptyState` component with separate copy for "no events at all" versus
  "no event matches this filter".

## 3. Backend ↔ frontend parity

- **`api.*` resolution**: 139 distinct `api.<module>.<fn>` references extracted
  from `src/`; every one resolves to a real `export const` in the corresponding
  `src/convex/*.ts`. No dead frontend calls.
- **FIXED — five `(api as any)` escapes removed**
  (`ParticipantWorkspace.tsx` ×3: `teamChat.listMessages`, `teamChat.sendMessage`,
  `teamChat.generateUploadUrl`; `TeamChat.tsx`: `teamChat.myTeamChat`;
  `AdminEvents.tsx`: `imports.eventFromJson`). All five functions exist and are
  typed by codegen, so the casts were only suppressing argument/return checking —
  exactly the mechanism that hides a silent parity break.
- **FIXED — a real return-type/args mismatch behind one of them.**
  `teamChat.myTeamChat` returned `teamId: String(team._id)` (a plain `string`)
  while `teamChat.listMessages` validates its argument as `v.id("teams")`. The
  frontend passed the first result straight into the second call, so the two
  only agreed because Convex's id validator tolerates a well-formed id string.
  The query now returns the typed id, and the round trip is checked by the
  compiler.
- **Case conventions**: no snake_case property reads in the frontend
  (`grep -rnE "\.(event_type|submission_deadline|repo_url|created_at|…)\b" src/pages
  src/components` → none). Fixture JSON keeps snake_case; it is never read
  directly by UI code.
- **Return fields**: every field the frontend reads is covered by Convex's
  generated types, and `bun tsc -b --noEmit` is clean — a field that did not
  exist would be a type error.
- **Orphans (zero frontend references)**: `certificates.issueAll`,
  `events.getStorageUrl`, `seed.seedState` and a set of seed/module helpers that
  are called directly inside their own module. **Left in place deliberately**:
  they are public API surface (callable from the CLI or a future client), the
  seed helpers are used by `seed.*` itself, and deleting public Convex exports
  is a larger risk than the dead weight it removes. Reported, not removed.
- **OpenAPI ↔ routes (the one genuine gap found earlier and fixed here)**: the
  T3/T4 REST routes added for issues 32–43 were live but undocumented, so
  `/api/openapi.json` was an incomplete contract. `OPENAPI_SPEC` in
  `src/convex/http.ts` now documents all fifteen
  (`/api/v1/events`, `/votes/status`, `/votes`, `/votes/revoke`, `/comments`
  GET+POST, `/comments/flag`, `/comments/delete`, `/audit/verify`,
  `/certificates/sample`, `/judge-records/sample`, `/judge-records/verify`,
  `/import`, `/webhooks`, `/webhooks/test`) with their security requirements and
  error responses.

## 4. Route guards

Every non-public route is wrapped in `ProtectedRoute` with the right role, and
the destination of every guard exists:

| Prefix | Guard | Notes |
|---|---|---|
| `/admin`, `/admin/*` | `requiredRole="admin"` | all 9 screens, including `/admin/winner-overrides` |
| `/organizer`, `/organizer/*` | `requiredRole={["organizer","admin"]}` | admins may operate any organizer surface by design |
| `/judge`, `/judge/pairwise`, `/judge/score/:id` | `requiredRole="judge"` | |
| `/dashboard`, `/workspace`, `/workspace/chat`, `/results`, `/results/:slug` | `requiredRole="participant"` | |
| `/home`, `/search`, `/profile`, `/settings`, `/security` | `Protected` (any signed-in role) | |
| `/`, `/events`, `/e/:slug`, `/gallery/:slug`, `/project/:id`, `/verify*`, `/help`, `/terms`, `/privacy`, `/auth`, `/invite/:token` | none (public by design) | the gallery is the acceptance surface and must stay public |
| `/embed/gallery/:slug` | none | rendered outside `AppShell` for iframe embedding |

- Signed-out users hitting a guarded route are sent to
  `/auth?returnTo=<path+query>`, so the destination survives the round trip; the
  `/auth` fallback is `/home`, which resolves to the role's own console via
  `RoleHome` (never back to the public landing page).
- `/organizer/judges` (added in issue 35) is inside the organizer/admin guard.
- No route was added or renamed in this pass.

## 5. Naming consistency

Terms were picked per meaning and checked against every label, route, table and
column:

| Concept | Canonical term | Deliberately not used |
|---|---|---|
| A hackathon instance | **Event** — routes (`/events`, `/organizer/events`), tables (`events`), nav labels, page titles, field names | "Hackathon" as a *UI noun* |
| What a team files | **Submission** (the record: table `submissions`, organizer "Submissions" columns/tab, "submission deadline") / **Project** (the same content on public surfaces: `/gallery` cards, `/project/:id`, "projects") | "Entry", "Work", "Piece" |
| The person scoring | **Judge** (table `judges`, role `judge`, "Judges" nav, "Judge assignments") | "Reviewer" |
| A group of people | **Team** (table `teams`, `/workspace`, "My Team", `teamMessages`) | "Group" |

Two notes, both deliberate:

- **"Submission" vs "Project"** is a view distinction, not a terminology drift:
  the write-side/organizer vocabulary is the *submission* a team files, the
  public read-side vocabulary is the *project* the audience looks at. Both are
  used consistently within their surface; no screen mixes them.
- **"Hackathon" appears in prose** (landing copy, `/events` description, Terms,
  Privacy, the API description) while **"Event"** is the data/route noun. The
  product is a hackathon platform and those sentences read naturally; every
  *label, route, field and table* says event. Standardising the prose on "event"
  would cost clarity for no gain, so it is recorded here as the documented
  convention instead.
- "group" appears only as a UI grouping noun (`EventDiscovery`'s status groups),
  never as a domain term for a team.

## 6. Empty / loading / error states

- **Empty states**: every list has one, using the shared `EmptyState` —
  `AdminEvents`, `AdminUsers`, `AdminAudit`, `AdminInvites`, `AdminJudging`,
  `AdminHelp`, `AdminSettings`, `AdminWinnerOverrides`, `AdminDashboard`,
  `OrganizerEventManage` (11 panels), `OrganizerEvents`, `OrganizerJudges`,
  `ParticipantWorkspace`, `ParticipantDashboard`, `TeamChat`, `JudgePortal`,
  `JudgePairwise`, `Gallery`, `Results`, `Search`, `Browse`, `ProjectDetail`.
- **FIXED — `OrganizerEvents` treated "still loading" as "empty".** It only
  branched on `authLoading`, so an undefined query result rendered the
  "No events yet" empty state on the first paint of every visit. It now shows a
  skeleton until `listWithCounts` resolves.
- **Loading states**: every `useQuery` consumer renders a skeleton or an explicit
  loading branch while the result is `undefined` (verified page by page; the
  branch on `=== undefined` exists in `Browse`, `Gallery`, `AdminEvents`,
  `OrganizerJudges`, `TeamChat`, `Results`, and the dashboard screens).
- **Mutations**: every write path is wrapped in try/catch and surfaces the
  failure as `toast.error(humanizeConvexError(err))` (or an inline `Alert`),
  with a `busy` flag on the triggering button.
- **No raw error objects are rendered.** The only `{error}` interpolations are
  form-field validation *strings* (`Input`, `Select`, `Textarea`, `Checkbox`,
  `Dropdown`, `PasswordInput`, `Auth`); no screen prints an exception, a stack,
  or a Convex error envelope.

---

## Verification for this pass

```
bun convex dev --once      # codegen: clean
bun tsc -b --noEmit        # 0 errors
bun run test               # 220 passed / 18 files
```

Files changed by this audit:

- `src/convex/http.ts` — `OPENAPI_SPEC` now documents the 15 T3/T4 REST routes.
- `src/convex/teamChat.ts` — `myTeamChat` returns a typed `teamId`.
- `src/pages/ParticipantWorkspace.tsx`, `src/pages/TeamChat.tsx`,
  `src/pages/AdminEvents.tsx` — `(api as any)` casts removed.
- `src/components/layout/AppShell.tsx` — organizer "Submissions"→"Public events",
  dead "Results" entry removed, admin "Overrides"→"Winner overrides".
- `src/pages/Browse.tsx` — H1 "Events", `nextDeadline()` on the event cards.
- `src/pages/OrganizerEvents.tsx` — loading branch + `EmptyState`.
