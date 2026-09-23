# Design

## Design language

RaptorJudge uses the **Terminal Raptor** visual language: a light-first liquid-glass surface treatment with translucent sticky navigation, bordered cards, restrained shadows, monospace labels, and green primary actions. The implementation also supports a dark theme through the `dark` class and the theme provider.

## Tokens

The tokens are defined in `src/index.css`. In the light theme, the base background is `hsl(42 33% 97%)`, glass/card surface is white, primary text is `hsl(160 30% 12%)`, secondary text is `hsl(160 12% 40%)`, borders and inputs are `hsl(160 14% 84%)`, the accent is `hsl(38 92% 55%)`, destructive/error is `hsl(0 78% 48%)`, and the focus ring is the primary green `hsl(160 84% 30%)`. The primary action color is `hsl(160 84% 30%)`; the success color is `hsl(152 60% 34%)`. The dark theme overrides these values with near-black green surfaces and brighter green primary text.

## Typography and spacing

Tailwind maps `sans` to Inter with system fallbacks and `mono` to JetBrains Mono with system fallbacks. Page titles generally use `text-3xl` with bold weight, section headings use `text-lg` or `text-xl` with semibold or bold weight, and body copy uses small muted text. The Tailwind container uses centered content with `1.5rem` padding and a `1400px` 2xl breakpoint. The base radius is `0.55rem`; lg, md, and sm radii derive from that token.

## Component inventory

`src/components/ui/` is not implemented in this repository. There is no local shadcn-style component inventory. Shared components currently live in `src/components/layout/AppShell.tsx`, `src/components/theme/ThemeProvider.tsx`, and `src/components/organizer/NormalizationPlayground.tsx`. `AppShell` supplies navigation, profile actions, theme switching, responsive navigation, the outlet, and the footer. `ThemeProvider` stores the selected theme and applies the `dark` class. `NormalizationPlayground` renders organizer normalization controls and charts.

## Screens inventory

| Route | Description | Access |
|---|---|---|
| `/` | Landing and product overview. | Public |
| `/auth` | Convex Auth sign-in, sign-up, demo seeding, and TOTP retry. | Public |
| `/e/:slug` | Public event overview with lifecycle, countdowns, tracks, prizes, rubric, and join action. | Public |
| `/gallery/:slug` | Public submission gallery with search and track filtering. | Public |
| `/project/:id` | Public project detail and comments. | Public, subject to backend visibility rules |
| `/home` | Role dispatcher. | Authenticated |
| `/dashboard` | Participant discovery dashboard. | Authenticated; non-participants redirect by role |
| `/workspace` | Participant team and submission workspace. | Authenticated |
| `/judge` | Judge progress and assigned queue. | Authenticated; backend role isolation applies |
| `/judge/score/:id` | Separate judge scoring form. | Authenticated |
| `/organizer` | Organizer summary, stats, events, and collapsed activity. | Authenticated |
| `/organizer/events` | Organizer event list. | Authenticated |
| `/organizer/events/new` | Event creation form. | Authenticated |
| `/organizer/events/:slug` | Event management, tracks, prizes, rubric, and lifecycle controls. | Authenticated |
| `/organizer/events/:slug/edit` | Event editing form. | Authenticated |
| `/admin` | Admin summary and linked user, event, audit, and settings views. | Authenticated; admin check in page and backend |
| `/security` | MFA and privileged account security. | Authenticated |
| `/verify` and `/verify/:uuid` | Certificate verification. | Public |
| `/embed/gallery/:slug` | Embeddable gallery view. | Public |

## States

Queries generally render a `loading…` state while Convex returns `undefined`. Participant dashboard and gallery have explicit empty states. Auth has inline authentication error and TOTP-required states. Mutations commonly show success or failure through Sonner toasts. The public gallery has an embargo state when results are not open. There is no shared error-boundary component; route-level errors are not uniformly implemented.

## Accessibility rules in force

Interactive controls in the simplified shell use visible labels or `aria-label`, and mobile controls use at least 44px minimum height or width. Inputs retain focus rings through Tailwind `focus:ring-2 focus:ring-ring`. The stylesheet includes reduced-motion handling and a reduced-transparency media query that disables backdrop blur. Contrast is controlled by the light and dark token pairs, but there is no automated contrast audit in the repository. Reduced transparency is supported at the global CSS level; focus-visible-specific styling is not separately implemented.

## Adding a page

Add the page under `src/pages/`, register it in `src/App.tsx`, and wrap authenticated pages with the existing `Protected` element. Use `AppShell` for normal routes so navigation, theme, profile, mobile menu, and footer remain consistent. Add backend queries or mutations under `src/convex/` and regenerate Convex bindings after deployment changes. Add a test under `tests/` when the behavior is deterministic and testable without a live Convex deployment.

## References

[1]: src/index.css "Global design tokens and accessibility media rules"
[2]: tailwind.config.js "Tailwind theme and typography configuration"
[3]: src/App.tsx "Route definitions and protected wrapper"
[4]: src/components/layout/AppShell.tsx "Shared application shell"
