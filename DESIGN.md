# Design

RaptorJudge uses a **light liquid-glass** language: a near-white canvas
(`#f5f5f7`), drifting pastel blobs behind translucent panels, generous radii, soft
shadows, `Inter` typography and a single hot accent (`#ff0055`) reserved for
interactive elements. It is calm and legible first — the accent marks what you can
*do*, never what you should *read*.

---

## 1. Tokens

Defined once in `src/index.css` as CSS custom properties under `:root` and
mirrored in `tailwind.config.js` so both raw CSS and Tailwind utilities resolve to
the same values.

| Token | Value | Use |
|---|---|---|
| `--bg-base` | `#f5f5f7` | page canvas |
| `--text-primary` | `#1d1d1f` | headings, body, values |
| `--text-secondary` | `#6e6e73` | labels, helper text, metadata |
| `--accent` | `#ff0055` | interactive only: primary buttons, active tab, links, slider fill |
| `--accent-hover` | `#e0004b` | hover state of the accent |
| `--error` | `#e63946` | destructive / validation |
| `--radius-card` | `20px` | cards and panels |
| `--radius-input` | `12px` | inputs, textareas, selects |
| `--radius-button` | `12px` | buttons |
| `--glass-bg` | `rgba(255,255,255,0.55)` | translucent panel fill |
| `--glass-border` | `rgba(255,255,255,0.7)` | hairline highlight edge |
| `--glass-shadow` | `0 8px 32px rgba(0,0,0,.08), inset 0 1px 0 rgba(255,255,255,.9)` | panel elevation |
| `--glass-blur` | `blur(30px) saturate(180%)` | backdrop filter |

Tailwind mirrors: `bg-bg-base`, `text-primary`, `text-secondary`, `accent`
(+ `accent-hover`), `error`, `glass-surface`, `glass-border`, `rounded-card`,
`rounded-input`, `rounded-button`, `shadow-glass`, `shadow-glass-hover`.

**Rule of thumb:** accent for interactive things only. A non-interactive heading
or value is `text-primary`; a label or caption is `text-secondary`. Pink on static
text is a bug.

**Accent scale.** The accent has a small fixed ladder, used consistently rather
than ad-hoc: `#ff0055` base, `#e0004b` hover, `#c40041` pressed/active, and
`#ff5588` / `#ff6699` as the gradient partner for the logo mark, primary
progress fill and avatar fallback. Error follows the same shape: `#e63946` base,
`#cc2b37` hover. Nothing else is hardcoded — anything new should reuse a token or
one of these steps.

Semantic status colors are used sparingly and only inside a tinted banner:
`emerald` for success/locked, `amber` for warnings (default rubric, oversized
load, unconverged ranking), `red`/`error` for destructive or blocking states.

Utility classes: `.glass-panel` (translucent surface + blur + highlight edge +
shadow) and `.focus-ring-accent` (2–3px accent focus ring).

---

## 2. Typography and spacing

- **Family:** `Inter` with system fallbacks. No webfont fetch, so the UI renders
  identically offline.
- **Scale in use:** page title `text-2xl`/`text-3xl font-black tracking-tight`;
  section heading `text-lg`/`text-base font-bold`; card heading `text-sm
  font-bold`; body `text-sm`; helper/label `text-xs`; micro-label `text-[10px]
  font-bold uppercase tracking-wider`.
- **Numbers:** `font-mono` for scores, means, weights and ratings so columns align.
- **Rhythm:** cards `p-6` (24px) with `p-8` on hero cards; gaps `gap-6` (24px)
  between cards and `gap-2`/`gap-3` (8/12px) inside them. Container is centered
  with `1.5rem` padding and a `1400px` 2xl breakpoint.
- **Radii:** cards 20px, inputs and buttons 12px — never mix a square input into a
  rounded card.

---

## 3. Component inventory

`src/components/ui/` **is** the design system:

| Component | Notes |
|---|---|
| `Button` | variants `primary` (accent) / `secondary` (glass) / `ghost` / `danger`; sizes `sm`/`md`/`lg`; `isLoading` swaps in a spinner and disables |
| `GlassCard` | the panel primitive: glass fill, blur, hairline edge, soft shadow |
| `Tabs` | underline-style tab strip used by the organizer console and admin |
| `Modal` | focus-trapped dialog; `ConfirmDialog` is the destructive variant |
| `Input`, `PasswordInput` | label + hint + error slots, `focus-ring-accent` |
| `Dropdown` | native-select-backed for reliability, styled to match inputs |
| `Checkbox`, `ChipGroup` | multi-select for tags and judge specialisations |
| `Alert` | inline tinted message (info / success / warning / error) |
| `ProgressBar` | used for judge progress and per-judge load; supports `max` |
| `SkeletonCard` | the loading primitive — `lines` controls height |
| `EmptyState` | default icon + title + description + optional action button |
| `StatCard` | metric tile for dashboards |
| `Avatar` | initials fallback when no image is set |

Layout and theming live in `src/components/layout/AppShell.tsx` (navigation,
profile menu, responsive mobile nav, footer, theme toggle),
`src/components/theme/ThemeProvider.tsx` (applies the theme class) and
`src/components/ErrorBoundary.tsx` (catches render errors and offers a reload
instead of a blank page).

---

## 4. Screens

| Route | Screen | Access |
|---|---|---|
| `/` | Landing — hero, feature grid, live fixture gallery preview, CTA into auth | Public |
| `/auth` | Sign-in / sign-up with one-click fixture credentials, TOTP retry | Public |
| `/invite/:token` | Invitation acceptance | Public |
| `/events` | Public event browse | Public |
| `/e/:slug` | Event overview: lifecycle, tracks, prizes, rubric, join | Public |
| `/gallery/:slug` | Submission gallery, seeded randomized order, search + track filter | Public |
| `/project/:id` | Project detail with comments and moderation | Public (stage rules) |
| `/verify`, `/verify/:uuid`, `/verify/judge/:uuid` | Certificate and judge-record verification | Public |
| `/embed/gallery/:slug` | Embeddable gallery widget (the only iframe-allowed route) | Public |
| `/help`, `/terms`, `/privacy` | Static pages | Public |
| `/home` | Role dispatcher | Authenticated |
| `/dashboard` | Participant home: enrolled events, submission state | Participant |
| `/workspace` | Team + submission workspace with draft autosave | Participant |
| `/workspace/chat` | Private team chat with attachments | Team members only |
| `/search` | Submission search | Authenticated |
| `/judge` | Judging queue and progress | Judge |
| `/judge/score/:id` | Scoring form: sliders, live weighted total, autosave, lock on submit | Judge |
| `/judge/pairwise` | Side-by-side pairwise judging and match history | Judge |
| `/organizer` | Organizer summary: stats, events, activity | Organizer |
| `/organizer/events` | Event list | Organizer |
| `/organizer/events/new`, `.../edit` | Event create/edit | Organizer |
| `/organizer/events/:slug` | Console: Overview, Tracks, Rubric, Judges, Submissions, Duplicates, Results, Webhooks, Audit | Organizer |
| `/admin`, `/admin/users`, `/admin/events`, `/admin/audit`, `/admin/invites`, `/admin/settings`, `/admin/judging` | Administration | Admin |
| `/profile`, `/settings`, `/security` | Own profile, preferences, sessions/password/MFA | Authenticated |
| `*` | Not found | Public |

---

## 5. States

Every list or table has four states, and no screen ships with only the happy one:

- **Loading** — `SkeletonCard`, never a bare "Loading…" string. Query-based
  screens distinguish `undefined` (loading) from `null`/empty (no data).
- **Empty** — `EmptyState` with an icon, a sentence explaining *why* it is empty
  and, where an action exists, a CTA (e.g. "Run duplicate scan", "Create event").
- **Error** — humanized via `humanizeConvexError`; raw Convex/stack text never
  reaches the user. Role-restricted queries surface a permission message rather
  than an empty screen.
- **Populated** — dense tables scroll horizontally on small screens
  (`overflow-x-auto` + `min-w-[…]`) instead of breaking the layout.

Mutations report through Sonner toasts (`richColors`, top-right): success for
completed work, error for refusals, and inline warnings for advisory conditions
(rubric weights not summing to 1, unconverged Bradley–Terry, judges at the load
cap).

---

## 6. Motion

Framer Motion and CSS keyframes are used for entrance and emphasis only:

- two/three pastel blobs drift on 25–30s loops behind the content;
- cards and lists fade/slide in once, and do not re-animate on data refresh;
- hover lifts a card slightly (`shadow-glass-hover`) and buttons darken the
  accent.

All of it is inside `@media (prefers-reduced-motion: reduce)`, which disables
blob animation, forces `scroll-behavior: auto` and collapses transition and
animation durations to `0.01ms`.

---

## 7. Accessibility rules in force

- **Focus** — every interactive element has a visible `focus-ring-accent` ring;
  focus is never removed without a replacement.
- **Labels** — icon-only buttons carry `aria-label`; form controls are bound to a
  `<label htmlFor>`; sliders expose `aria-valuemin/max/now/valuetext`.
- **Semantics** — decorative visuals are `aria-hidden`; images carry `alt`
  (project covers fall back to a titled placeholder).
- **Contrast** — `#1d1d1f` on `#f5f5f7` and white on `#ff0055` both clear WCAG AA
  for their sizes. There is no automated contrast audit in the repo.
- **Reduced transparency** — `@media (prefers-reduced-transparency: reduce)`
  drops backdrop blur and makes glass panels opaque.
- **Target size** — primary controls are at least 44px tall on touch layouts.

---

## 8. Adding a page

1. Add the file under `src/pages/`.
2. Register it in `src/App.tsx`. Authenticated routes must be wrapped in
   `Protected`; put public embeddable routes outside the `AppShell` layout.
3. Reuse `AppShell` for normal routes so navigation, theme, profile menu, mobile
   nav and footer stay consistent.
4. Build the UI from `src/components/ui/` primitives and the tokens above — no
   bespoke colors, radii or spacing scales.
5. Implement all four states (loading, empty, error, populated) and check 375px
   width before calling it done.
6. Backend work goes in `src/convex/`; after a deployment change, regenerate the
   Convex bindings. Add a test under `tests/` when the logic is deterministic.
