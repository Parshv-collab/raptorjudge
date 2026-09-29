# Design

RaptorJudge uses a **dark editorial** language: a near-black canvas (`#0a0a0b`),
flat elevated surfaces separated by 1px hairlines, one hot accent (`#ff2d55`)
reserved for interactive elements, sharp radii (6/8px), and tight typographic
hierarchy in Inter Tight with JetBrains Mono for every number, ID and token.
It is confident and dense — the accent marks what you can *do*, never what you
should *read*. There are no gradients, no glass, no pastel washes, no 16px+
radii, and shadows only on modal overlays.

---

## 1. Tokens

Defined once in `src/styles/design-tokens.css` as CSS custom properties under
`:root` and mirrored in `tailwind.config.js`, so raw CSS and Tailwind utilities
resolve to the same values. **No component may hardcode a color** — everything
goes through a token or its Tailwind mirror (`bg-canvas`, `bg-surface-1`,
`bg-surface-2`, `border-line`, `border-line-strong`, `text-primary`,
`text-secondary`, `text-muted`, `accent`, `accent-hover`, `success`, `warning`,
`danger`, `backdrop`).

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#0a0a0b` | page canvas |
| `--color-surface-1` | `#111113` | cards, tables, panels |
| `--color-surface-2` | `#17171a` | nested rows, inputs, hovers |
| `--color-border` | `#232328` | default 1px hairline |
| `--color-border-strong` | `#2e2e34` | hovered/selected edges |
| `--color-text-primary` | `#f4f4f5` | headings, values, body |
| `--color-text-secondary` | `#a1a1aa` | labels, descriptions |
| `--color-text-muted` | `#85858e` | micro-labels, timestamps (was `#52525b`: 2.3–2.6:1, below WCAG AA; now 4.9–5.4:1) |
| `--color-accent` | `#ff2d55` | interactive only: primary buttons, active tab, links, progress fill |
| `--color-accent-hover` | `#ff4568` | hover state of the accent |
| `--color-on-accent` | `#ffffff` | the one foreground token allowed *on* the accent fill (button labels, mark tiles, the focused skip link) |
| `--color-success` | `#22c55e` | live/valid/published states |
| `--color-warning` | `#f59e0b` | advisory banners, pending states |
| `--color-danger` | `#ef4444` | destructive / validation |
| `--color-backdrop` | `rgba(0,0,0,0.6)` | modal + mobile-drawer scrim |
| `--focus-ring` | `2px solid var(--color-accent)` | opaque accent outline, 2px offset, on `:focus-visible`; clears WCAG 2.2 §1.4.11 / §2.4.13 at 4.85–5.43:1 |

Radii: `--radius-button`/`--radius-input` 6px, `--radius-card` 8px,
`--radius-auth` 12px (the sign-in card only), `--radius-pill` 999px — no 16px+
radii anywhere. Shadow: `--shadow-modal` (`0 8px 32px rgba(0,0,0,0.5)`) exists
only for modals and dropdowns; flat surfaces rely on borders. Motion:
`--duration-fast` 150ms (hover), `--duration-state` 200ms (state change),
`--ease-out` cubic-bezier(0,0,0.2,1).

Layout tokens: `--sidebar-width` 240px, `--topbar-height` 64px,
`--content-max` 1200px.

**Rule of thumb:** accent for interactive things only. A non-interactive heading
or value is `text-primary`; a label is `text-secondary`; a timestamp or overline
is `text-muted`. Pink on static text is a bug. Semantic colors appear as tinted
banners/badges (`success/5` fill + `success/30` border) or as plain colored text
for status — never as large fills.

Utility classes in `src/index.css`: `.tnum` (tabular numerals for every numeric
column), `.wordmark` (logo lockup), `.skip-link`, modal choreography
(`modal-fade-in` / `modal-rise-in`), `.skeleton` shimmer, and the Sonner
`toast-slide-in` mapping.

---

## 2. Typography and spacing

- **Families:** Inter Tight Variable for everything, JetBrains Mono Variable for
  IDs, scores, weights, ratings, timestamps and code. Both are loaded locally via
  `@fontsource-variable/*` imports in `src/index.css` — no CDN fetch, so the UI
  renders identically offline.
- **Scale:** display 56/1.1/−0.03em (landing hero), h1 36/−0.02em, h2 24/−0.01em,
  h3 18, body 15/1.5, small 13, mono 13/500. Exposed as Tailwind `text-display`,
  `text-h1`, `text-h2`, `text-h3`; weights and tracking are baked into the
  utilities.
- **Numbers:** `font-mono` + `.tnum` for anything that would ever sit in a column
  with another number.
- **Rhythm:** page padding 32px desktop / 20px mobile, card padding 24px
  (`p-6`), section gap 48px (`gap-8` in the flow of a page), inline gap 12px.
  Content is capped at `max-w-content` (1200px) inside the main column.
- **Overlines:** 11px uppercase `tracking-[0.08em] text-muted` — the signature
  label style for stats and section intros.

---

## 3. Layout system

Every authenticated page renders inside `src/components/layout/AppShell.tsx`:
a **persistent 240px left sidebar** (wordmark, role-specific nav, account links,
user footer with sign-out) plus the main content column. The active item carries
a 2px accent left-border.

The sidebar is **one component for all four roles** — participant, judge,
organizer and admin differ only in nav labels/hrefs (`ROLE_NAV`), never in
geometry, padding, borders, hover state or the user block. Three responsive
modes, driven purely by classes:

| Viewport | Behaviour |
|---|---|
| ≥1024px | full 240px rail, labels visible |
| 768–1023px | icon-only rail (labels hidden, `title` tooltip, centered rows) |
| <768px | off-canvas drawer opened from the hamburger in the slim top bar |

The wordmark always points at the current role's own console (`/admin`,
`/organizer`, `/judge`, `/dashboard`) — never at the marketing page. Public
routes (landing, events, event page, gallery, verify, legal, auth) use the same
shell's public variant: slim top bar, no sidebar.

`src/components/ui/PageHeader.tsx` is the in-content top bar for every page:
an optional **back control**, h1 title, one-line muted description, actions
right, bottom hairline. The back target comes from the explicit parent map in
`src/lib/parentRoute.ts` (`/admin/users → /admin`, `/judge/score/:id → /judge`,
`/project/:id → /gallery/:slug`, `…/edit → …/:slug`, …); unknown non-root screens
fall back to `navigate(-1)`, and root screens render no control at all.

Role isolation is enforced twice: `src/components/ProtectedRoute.tsx` decides
*before* rendering (no session → `/auth?returnTo=…`, wrong role → the visitor's
own console, matching role → children) and every Convex query/mutation
re-checks the caller server-side.

---

## 4. Component inventory

`src/components/ui/` **is** the design system (see `index.ts` for the public
surface):

| Component | Notes |
|---|---|
| `Button` | variants `primary` (accent) / `secondary` (surface-2 + border) / `ghost` / `danger`; sizes `sm`/`md`/`lg`; `isLoading` swaps in a spinner and disables |
| `Card` | the flat panel primitive: surface-1, 1px border, 8px radius; `interactive` brightens the border on hover; `SectionHeader` pairs an overline with an h2 |
| `PageHeader` | h1 + description + actions for the top of every page |
| `Table` | `Table`/`THead`/`TH`/`TR`/`TD` — bordered container, uppercase 12px headers, `numeric` and `mono` cell modes, horizontal scroll |
| `StatCard` | overline label + 2rem `tnum` figure + subtext, optional icon/href |
| `Badge` | pill with tinted variants `default`/`success`/`warning`/`danger`/`accent` |
| `Tabs` | underline-style tab strip with optional count badges (organizer console) |
| `Modal` | scrim + rise-in dialog, `role="dialog" aria-modal="true"`, a **real focus trap** (Tab/Shift+Tab wrap, `data-autofocus` initial target, focus restored to the trigger on close), Escape/backdrop close, body scroll locked; `ConfirmDialog` is the in-app destructive variant with `requireTyping` |
| `DangerConfirmModal` | GitHub-style destructive confirmation for irreversible actions: body shows current vs proposed state and the primary button stays disabled until the operator retypes the target name exactly (case-sensitive) |
| `Markdown` | safe renderer for user-authored text (headings, bold/italic, lists, tables, code, links). No raw HTML (`rehype-raw` is never enabled), hrefs restricted to `http(s)`/`mailto`/`tel`/`#`/relative, links open with `rel="noopener noreferrer"` |
| `Input`, `PasswordInput`, `Textarea`, `Select`/`Dropdown` | label + hint + error slots; `aria-describedby` wired to whichever of the error / helper text is showing; the password reveal toggle stays in the tab order |
| `Checkbox`, `ChipGroup` | multi-select for tags, judge specialisations, filters |
| `Alert` | inline tinted message (info / success / warning / error) |
| `ProgressBar` | accent fill on a bordered track, `aria-label` defaulting to "Progress"; used for judge progress and per-judge load |
| `Skeleton`, `SkeletonCard`, `SkeletonText`, `SkeletonHeading`, `SkeletonStat`, `SkeletonTable` | shimmer loading primitives |
| `EmptyState` | icon + title + explanation + optional action button |
| `Avatar` | deterministic-tint initials fallback when no image is set |
| `QrCode` | dependency-free renderer for the TOTP enrolment `otpauth://` URI on `/security` |
| `Toast` | `AppToaster` plus `showSuccess/showWarning/showDanger/showInfo` helpers over Sonner |

Layout and theming live in `src/components/layout/AppShell.tsx` (sidebar, role
nav, mobile drawer, footer) and `src/components/ErrorBoundary.tsx` (catches
render errors and offers a reload in the token system instead of a blank page).
The palette itself is declared once in `src/styles/design-tokens.css` and
mirrored into `tailwind.config.js`; there is no runtime theme provider.

---

## 5. Screens

| Route | Screen | Access |
|---|---|---|
| `/` | Landing — hero, feature grid, live fixture gallery preview, CTA into auth | Public |
| `/auth` | Sign-in / sign-up (centered card, icon-in-input), conditional TOTP retry, humanized failure copy. No credentials are embedded or prefilled | Public |
| `/invite/:token` | Invitation acceptance | Public |
| `/events` | Public event browse | Public |
| `/e/:slug` | Event overview: lifecycle, tracks, prizes, rubric, join | Public |
| `/gallery/:slug` | Submission gallery — seeded per-day shuffle before publication, final ranking (pairwise, else normalized z-score) with winner/#N badges after, plus search + track filter | Public |
| `/project/:id` | Project detail with markdown description, comments and moderation; winner badge once results publish | Public (stage rules) |
| `/verify`, `/verify/:uuid`, `/verify/judge/:uuid` | Certificate and judge-record verification | Public |
| `/embed/gallery/:slug` | Embeddable gallery widget (the only iframe-allowed route) | Public |
| `/help`, `/terms`, `/privacy` | Static pages | Public |
| `/home` | Role dispatcher | Authenticated |
| `/dashboard` | Participant home: "Your events" as one horizontal snap-scroll row of equal-height cards, then the discovery list below it | Participant |
| `/workspace` | Team + submission workspace with draft autosave | Participant |
| `/workspace/chat` | Private team chat with attachments | Team members only |
| `/search` | Submission search | Authenticated |
| `/judge` | Judging queue and progress | Judge |
| `/judge/score/:id` | Scoring form: sliders, live weighted total, autosave, lock on submit | Judge |
| `/judge/pairwise` | Side-by-side pairwise judging and match history | Judge |
| `/organizer` | Organizer summary: stats, events, activity | Organizer |
| `/organizer/events` | Event list | Organizer |
| `/organizer/events/new`, `.../edit` | Event create/edit | Organizer |
| `/organizer/events/:slug` | Console: Overview, Tracks, Rubric, Judges, Voting, Webhooks, Flagged Comments, Duplicates, Submissions, Results (publication gate + winner override), Audit | Organizer |
| `/organizer/judges` | Cross-event judges roster (not a shortcut back to the event list) | Organizer |
| `/results`, `/results/:slug` | Published rankings for one event, or a chooser | Participant |
| `/admin`, `/admin/users`, `/admin/events`, `/admin/audit`, `/admin/invites`, `/admin/settings`, `/admin/judging` | Administration (users also carries the audited password reset) | Admin |
| `/admin/help` | Help-centre content editor (FAQ + articles) | Admin |
| `/admin/winner-overrides` | Winner-override review queue: pending badge, computed-vs-proposed winner, accept / reject with note | Admin |
| `/profile`, `/settings`, `/security` | Own profile, preferences, MFA enrollment | Authenticated |
| `*` | Not found | Public |

---

## 6. States

Every list or table has four states, and no screen ships with only the happy one:

- **Loading** — skeleton primitives (`SkeletonCard`, `SkeletonTable`,
  `SkeletonStat`), never a bare "Loading…" string. Query-based screens
  distinguish `undefined` (loading) from `null`/empty (no data).
- **Empty** — `EmptyState` with an icon, a sentence explaining *why* it is empty
  and, where an action exists, a CTA (e.g. "Run duplicate scan", "Distribute
  fairly").
- **Error** — humanized via `humanizeConvexError`; raw Convex/stack text never
  reaches the user. Role-restricted queries surface a permission message rather
  than an empty screen.
- **Populated** — dense tables scroll horizontally on small screens
  (`overflow-x-auto`) instead of breaking the layout; rows sit on surface-2 and
  brighten to surface-1 borders on hover.

Mutations report through Sonner toasts (`richColors`, top-right): success for
completed work, error for refusals, and inline warning banners for advisory
conditions (rubric weights not summing to 1, unconverged Bradley–Terry, judges at
the load cap, webhook secrets shown once).

---

## 7. Motion

Transitions only — nothing auto-plays and nothing bounces:

- 150ms ease-out on hover (border brighten, background lift, color shift);
- 200ms on state change (modal rise, toast slide, progress width);
- skeletons shimmer at 1.5s until data replaces them.

All of it is inside `@media (prefers-reduced-motion: reduce)`, which forces
`scroll-behavior: auto` and collapses transition and animation durations to
`0.01ms`.

---

## 8. Accessibility rules in force

- **Focus** — every interactive element gets the 2px opaque-accent
  `:focus-visible` ring with 2px offset; focus is never removed without a
  replacement. The offset is not decoration: it is what keeps the ring legible
  on an accent-filled button, where ring-on-fill would otherwise be 1:1 against
  the surface it is drawn over.
- **Labels** — icon-only buttons carry `aria-label`; form controls are bound to a
  `<label htmlFor>`; sliders expose `aria-valuemin/max/now/valuetext`; tabular
  data lives in real `<table>` markup with `<th scope="col">`.
- **Semantics** — decorative visuals are `aria-hidden`; images carry `alt`;
  modals are `role="dialog" aria-modal="true"` with Escape-to-close; status
  banners are `role="status"`.
- **Contrast** — the text palette clears WCAG AA everywhere it is used:
  `#f4f4f5` on the canvas measures 16.3–18.0:1, `#a1a1aa` 7.0–7.7:1 and the
  re-toned `#85858e` 4.9–5.4:1. The focus ring is measured, not asserted:
  `--focus-ring` is the opaque accent, which is **5.43:1** on the canvas and
  4.85–5.17:1 on the two card surfaces, against the 3:1 WCAG 2.2 §1.4.11 / §2.4.13
  ask. It replaced `rgba(255,45,85,0.4)`, which measured **1.70:1** on every one
  of those surfaces because a translucent colour composites toward whatever it
  is painted on. `tests/focusRing.test.ts` locks the token against a
  regression; `e2e/focusRing.spec.ts` re-measures it off a real screenshot in a
  real browser and holds the floor at 5.17:1 on `/auth` and 4.91:1 in the
  console. One token still does **not** clear AA and is recorded as a known gap
  rather than papered over: the white label on the accent fill (`#ff2d55`,
  **3.65:1** — and 3.33:1 in its hover state, against the 4.5:1 that a
  13–15px button label needs; near-black on the same fill measures 5.4:1).
  There is no automated contrast audit for text in the repo, so that one is
  hand-measured.

  One consequence worth recording, because it is not obvious: a `mask` on an
  ancestor composites **everything** inside it, including a focus ring. The
  sign-in backdrop's soft-pool mask used to sit on `.auth-grid`, and it was
  quietly rendering the card at 77–93% alpha at the edges of the pool — the
  submit button's ring measured 4.60:1 and the mode switch's 3.38:1. The
  pattern now lives on a masked `.auth-grid::before` behind the content, and
  `tests/focusRing.test.ts` fails if a mask, filter or opacity reappears on a
  selector that can contain controls.
- **Target size** — primary controls are at least 40px tall (44px on touch
  layouts); the mobile drawer is backdrop-dismissable and closes on navigation.
- **Keyboard** — every flow (menus, tabs, modals, scoring sliders) is reachable
  and operable without a pointer.

---

## 9. Adding a page

1. Add the file under `src/pages/` (shared organizer tab panels live in
   `src/pages/organizer/`).
2. Register it in `src/App.tsx`. Authenticated routes must be wrapped in
   `ProtectedRoute` (with `requiredRole` when the screen is not for every role;
   `/home` is the one dispatcher that uses `Protected`); put public embeddable
   routes outside the `AppShell` layout.
3. Reuse `AppShell` for normal routes so the sidebar, mobile drawer and footer
   stay consistent, and open with `PageHeader`.
4. Build the UI from `src/components/ui/` primitives and the tokens above — no
   bespoke colors, radii, shadows or spacing scales.
5. Implement all four states (loading, empty, error, populated) and check 375px
   width before calling it done.
6. Backend work goes in `src/convex/`; after a deployment change, regenerate the
   Convex bindings. Add a test under `tests/` when the logic is deterministic.
