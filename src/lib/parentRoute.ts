/**
 * Where does "back" go from here?
 *
 * `navigate(-1)` alone is wrong in a SPA: a user who opened a detail page from
 * a shared link has no history entry to go back to, and a user who arrived via
 * a redirect lands somewhere unexpected. So the parent of every non-root screen
 * is declared explicitly here, and the back control only falls back to browser
 * history for pages this map does not know.
 */

export interface ParentRoute {
  /** Target path, or an empty string to mean "browser history". */
  to: string;
  /** Short label for the parent, e.g. "Admin overview". */
  label: string;
}

/** Screens that are their own destination — no back control. */
const ROOT_PATHS = new Set([
  "/",
  "/admin",
  "/organizer",
  "/judge",
  "/dashboard",
  "/profile",
  "/events",
  "/help",
  "/auth",
]);

const ADMIN: ParentRoute = { to: "/admin", label: "Admin overview" };
const ORGANIZER: ParentRoute = { to: "/organizer", label: "Organizer overview" };
const JUDGE: ParentRoute = { to: "/judge", label: "Judging queue" };
const DASHBOARD: ParentRoute = { to: "/dashboard", label: "Dashboard" };
const EVENTS: ParentRoute = { to: "/organizer/events", label: "Events" };

const RULES: { test: RegExp; parent: (match: RegExpMatchArray) => ParentRoute }[] = [
  // --------------------------------------------------------------- admin ---
  { test: /^\/admin\/winner-overrides$/, parent: () => ADMIN },
  { test: /^\/admin\/(users|events|audit|invites|settings|judging)$/, parent: () => ADMIN },

  // ----------------------------------------------------------- organizer ---
  { test: /^\/organizer\/events$/, parent: () => ORGANIZER },
  { test: /^\/organizer\/events\/new$/, parent: () => EVENTS },
  { test: /^\/organizer\/events\/[^/]+\/edit$/, parent: (m) => ({ to: `/organizer/events/${m[1]}`, label: "Event console" }) },
  { test: /^\/organizer\/events\/([^/]+)$/, parent: () => EVENTS },

  // --------------------------------------------------------------- judge ---
  { test: /^\/judge\/(pairwise|scores)$/, parent: () => JUDGE },
  { test: /^\/judge\/score\/[^/]+$/, parent: () => JUDGE },

  // --------------------------------------------------------- participant ---
  { test: /^\/workspace$/, parent: () => DASHBOARD },
  { test: /^\/workspace\/chat$/, parent: () => ({ to: "/workspace", label: "My team" }) },

  // --------------------------------------------------------------- public ---
  { test: /^\/gallery\/([^/]+)$/, parent: (m) => ({ to: `/e/${m[1]}`, label: "Event page" }) },
  { test: /^\/search$/, parent: () => ({ to: "/events", label: "Events" }) },

  // -------------------------------------------------------------- account ---
  { test: /^\/(settings|security)$/, parent: () => ({ to: "/profile", label: "Profile" }) },
];

/** The explicit parent of a path, `{to: ""}` to mean history, or `null` for roots. */
export function parentRouteFor(pathname: string): ParentRoute | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  for (const rule of RULES) {
    const match = path.match(rule.test);
    if (match) return rule.parent(match);
  }
  if (ROOT_PATHS.has(path)) return null;
  // Unknown non-root screen (legal pages, the public event page, a 404…):
  // history is the only sensible answer.
  return { to: "", label: "Back" };
}
