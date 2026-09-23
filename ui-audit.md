# Phase 0 UI Audit

This audit records the current JSX-rendered structure before the simplification pass. Counts are based on the source and assume an authenticated user in the role associated with each route. Shared shell controls are included in the navigation count; conditional content is noted where it changes the count.

| Page | Nav links | Tabs / sections | Buttons above fold | Stats / metrics | Primary action clear? | Verdict |
|---|---:|---:|---:|---:|---|---|
| `/dashboard` participant | 6 | 2 | 2 shell controls; dashboard actions are links | 2 card metadata fields | Yes — Browse events | Clean |
| `/workspace` participant | 6 | 2 main sections | About 4 in a team state | 0 separate stat cards | Yes — submit for judging | Cluttered |
| `/organizer` | 5 | 10 tabs plus lifecycle controls | About 19 | 4 | Yes — Create Event | Cluttered |
| `/organizer/events` | 5 | 3 major areas, no tabs | 1 prominent action | 2 table columns currently shown as em dashes | Yes — Create Event | Clean |
| `/organizer/events/:slug` | 5 | 11 tabs | About 13 | 4 overview cards | Yes — Publish / Unpublish | Cluttered |
| `/organizer/events/new` | 5 | 5 form sections | 2 shell controls; save is below the long form | 0 | Yes — Save as draft | Overwhelming |
| `/admin` | 6 | 7 tabs | About 11 including shell and role controls | 3 | Yes — Invite Organizer | Cluttered |
| `/judge` | 4 | 2 main areas plus conditional pairwise arena | About 5 before queue actions | About 3 plus conditional pairwise metrics | Yes — submit review on an expanded assignment | Cluttered |
| `/` landing | 6 for an authenticated participant | 5 major sections | About 5 button-like actions | 4 hero metrics | Yes — Try the live demo / Open the demo | Clean |
| `/e/:slug` | 6 for an authenticated participant | 6 major sections | 2 route CTAs | 3 conditional countdown cards | Yes — Browse projects | Clean |
| `/gallery/:slug` | 6 for an authenticated participant | 3 major sections | 5 track filter buttons in seeded data | 1 conditional count | Yes — Open a project card | Clean |

The largest simplification opportunities are the global navigation, `/organizer`, `/admin`, and `/judge`. The participant dashboard, public event page, and gallery already have a relatively clear hierarchy; they should remain structurally light.
