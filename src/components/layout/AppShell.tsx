import React, { useState, useEffect, useMemo } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { roleHomePath } from "@/lib/roles";
import { clearConvexAuthSessionKeys } from "@/lib/sessionCleanup";
import { formatDate } from "@/lib/format";

/** lucide icons, 20px in nav, 16px inline (spec: consistent icon sizing). */
import {
  LayoutDashboard,
  LayoutGrid,
  Users,
  CalendarDays,
  ClipboardList,
  Scale,
  Mail,
  Settings,
  ScrollText,
  Inbox,
  Swords,
  Star,
  MessageSquare,
  User as UserIcon,
  ShieldCheck,
  Menu,
  X,
  LogOut,
  Gauge,
  Crown,
  Bell,
  LifeBuoy,
  Trophy,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  /**
   * Predicate for the active state. Defaults to "pathname equals href or is
   * nested under it", which is wrong for two nav entries that share a path
   * (Queue vs My Scores) — those declare their own rule.
   */
  match?: (pathname: string, search: string) => boolean;
  /** Optional count badge (e.g. pending winner-override requests). */
  badge?: number;
}

/**
 * Role navigation — the *only* thing that differs between roles.
 *
 * Every role renders the same shell (240px rail, same padding, same active
 * indicator, same user block), so a participant, a judge, an organizer and an
 * admin see the same product with different labels. Slugs are the contract:
 * participant → Dashboard, Gallery, My Team, Chat, Profile.
 */
const ROLE_NAV: Record<string, NavItem[]> = {
  // Participant entries that depend on the selected event are built in
  // `buildParticipantNav` (issue 40); the static list here is the fallback.
  participant: [
    { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard size={20} strokeWidth={1.75} /> },
    { label: "Events", href: "/events", icon: <LayoutGrid size={20} strokeWidth={1.75} /> },
    { label: "My Team", href: "/workspace", icon: <Users size={20} strokeWidth={1.75} /> },
    { label: "Chat", href: "/workspace/chat", icon: <MessageSquare size={20} strokeWidth={1.75} /> },
    { label: "Results", href: "/results", icon: <Trophy size={20} strokeWidth={1.75} /> },
    // "Profile" is deliberately absent here: `ACCOUNT_NAV` renders it for every
    // role, and listing it in both places showed two identical rows that both
    // lit up on /profile.
  ],
  judge: [
    {
      label: "Queue",
      href: "/judge",
      icon: <Inbox size={20} strokeWidth={1.75} />,
      match: (pathname, search) => pathname === "/judge" && !search.includes("view=scores"),
    },
    {
      label: "Pairwise",
      href: "/judge/pairwise",
      icon: <Swords size={20} strokeWidth={1.75} />,
    },
    {
      label: "My Scores",
      href: "/judge?view=scores",
      icon: <Star size={20} strokeWidth={1.75} />,
      match: (pathname, search) => pathname === "/judge" && search.includes("view=scores"),
    },
  ],
  organizer: [
    { label: "Overview", href: "/organizer", icon: <Gauge size={20} strokeWidth={1.75} /> },
    { label: "Events", href: "/organizer/events", icon: <CalendarDays size={20} strokeWidth={1.75} /> },
    {
      // Issue 35: the judges roster is a real cross-event page, not a shortcut
      // back to the event list.
      label: "Judges",
      href: "/organizer/judges",
      icon: <Users size={20} strokeWidth={1.75} />,
    },
    // Issue 44: this entry used to read "Submissions" while pointing at the
    // public event list, and a sibling "Results" entry pointed back at
    // /organizer/events with `match: () => false` (so it never highlighted and
    // duplicated "Events"). Per-event submissions and results live inside an
    // event's management page; the only honest cross-event destination here is
    // the public list, so it is labelled for what it is.
    { label: "Public events", href: "/events", icon: <ClipboardList size={20} strokeWidth={1.75} /> },
  ],
  admin: [
    { label: "Overview", href: "/admin", icon: <LayoutDashboard size={20} strokeWidth={1.75} /> },
    { label: "Users", href: "/admin/users", icon: <Users size={20} strokeWidth={1.75} /> },
    { label: "Events", href: "/admin/events", icon: <CalendarDays size={20} strokeWidth={1.75} /> },
    { label: "Judging", href: "/admin/judging", icon: <Scale size={20} strokeWidth={1.75} /> },
    {
      // Issue 44: label matched the page H1 ("Winner overrides").
      label: "Winner overrides",
      href: "/admin/winner-overrides",
      icon: <Crown size={20} strokeWidth={1.75} />,
    },
    { label: "Invites", href: "/admin/invites", icon: <Mail size={20} strokeWidth={1.75} /> },
    { label: "Help Content", href: "/admin/help", icon: <LifeBuoy size={20} strokeWidth={1.75} /> },
    { label: "Settings", href: "/admin/settings", icon: <Settings size={20} strokeWidth={1.75} /> },
    { label: "Audit", href: "/admin/audit", icon: <ScrollText size={20} strokeWidth={1.75} /> },
  ],
};

/**
 * Participant navigation, scoped to the currently selected event (issue 40).
 *
 * Without this, "My Team", "Chat" and "Results" had no idea which event they
 * belonged to and dumped the user on a page that then guessed. Now every entry
 * carries the selected event slug in the URL, so switching events keeps you on
 * the same sub-page and any link is shareable.
 */
function buildParticipantNav(slug: string | null): NavItem[] {
  const query = slug ? `?event=${slug}` : "";
  return [
    { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard size={20} strokeWidth={1.75} /> },
    { label: "Events", href: "/events", icon: <LayoutGrid size={20} strokeWidth={1.75} /> },
    ...(slug
      ? [
          {
            label: "Gallery",
            href: `/gallery/${slug}`,
            icon: <LayoutGrid size={20} strokeWidth={1.75} />,
            match: (pathname: string) => pathname.startsWith("/gallery/"),
          },
        ]
      : []),
    {
      label: "My Team",
      href: `/workspace${query}`,
      icon: <Users size={20} strokeWidth={1.75} />,
      match: (pathname: string) => pathname === "/workspace",
    },
    {
      label: "Chat",
      href: `/workspace/chat${query}`,
      icon: <MessageSquare size={20} strokeWidth={1.75} />,
      match: (pathname: string) => pathname === "/workspace/chat",
    },
    {
      label: "Results",
      href: slug ? `/results/${slug}` : "/results",
      icon: <Trophy size={20} strokeWidth={1.75} />,
      match: (pathname: string) => pathname.startsWith("/results"),
    },
    // "Profile" comes from ACCOUNT_NAV below this group.
  ];
}

/** Account links shared by every role (bottom group). */
const ACCOUNT_NAV: NavItem[] = [
  { label: "Profile", href: "/profile", icon: <UserIcon size={20} strokeWidth={1.75} /> },
  { label: "Settings", href: "/settings", icon: <Settings size={20} strokeWidth={1.75} /> },
  { label: "Security", href: "/security", icon: <ShieldCheck size={20} strokeWidth={1.75} /> },
  { label: "Help", href: "/help", icon: <ClipboardList size={20} strokeWidth={1.75} /> },
];

/** Default active rule: exact path, or nested under it. */
function defaultMatch(href: string) {
  const base = href.split("?")[0];
  return (pathname: string) => pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Nav row. Identical geometry for every role and in every state: 40px tall,
 * 20px icon, 13px medium label, 2px accent bar when active, same hover fill.
 *
 * Label visibility is responsive rather than prop-driven so the rail stays
 * icon-only between 768px and 1024px without a second component:
 *   <768px (drawer, full width) → label visible
 *   768–1023px (icon rail)      → label hidden, tooltip instead
 *   ≥1024px (240px rail)        → label visible
 */
const NavRow: React.FC<{ item: NavItem; active: boolean }> = ({ item, active }) => (
  <Link
    to={item.href}
    aria-current={active ? "page" : undefined}
    title={item.label}
    className={`
      group relative flex items-center justify-start md:justify-center lg:justify-start
      gap-3 rounded-btn px-3 py-2.5 text-[13px] font-medium
      transition-colors duration-fast
      ${active ? "text-primary bg-surface-2" : "text-secondary hover:text-primary hover:bg-surface-2"}
    `}
  >
    <span
      aria-hidden="true"
      className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-pill bg-accent transition-opacity duration-fast ${
        active ? "opacity-100" : "opacity-0"
      }`}
    />
    <span className="shrink-0">{item.icon}</span>
    <span className="truncate md:hidden lg:inline">{item.label}</span>
    {item.badge !== undefined && item.badge > 0 && (
      <span className="ml-auto md:absolute md:right-1 md:top-1 lg:static lg:ml-auto tnum text-[11px] font-semibold rounded-pill bg-accent text-white px-1.5 py-0.5">
        {item.badge}
      </span>
    )}
  </Link>
);

export function AppShell() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const skip = isLoading || !isAuthenticated;
  const me = useQuery(api.users.me, skip ? "skip" : {}) ?? null;
  // Issue 38: the sidebar avatar renders the uploaded picture, not just initials.
  const myAvatar = useQuery(api.users.myAvatarUrl, skip ? "skip" : {});
  const isAdmin = me?.role === "admin";
  const pendingOverrides = useQuery(
    api.winnerOverrides.pendingCount,
    skip || !isAdmin ? "skip" : {},
  );
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const notifications = useQuery(
    api.notifications.listMine,
    skip ? "skip" : {},
  );
  const unreadCount = (notifications ?? []).filter((n: any) => !n.readAt).length;
  const markAllRead = useMutation(api.notifications.markAllRead);

  // Close the mobile drawer on route change.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const role = me?.role ?? "participant";
  const homeHref = roleHomePath(role) ?? "/home";
  // Issue 21+25: once every live event has published its results there is
  // nothing left to compare, so the pairwise entry disappears instead of
  // leading judges into a screen whose writes are rejected server-side.
  const anyOpenEvent = useQuery(
    api.events.anyOpenForJudging,
    skip || role !== "judge" ? "skip" : {},
  );
  // Issue 23.1: "Results" only appears once this participant belongs to a team
  // in at least one event.
  const enrolled = useQuery(api.events.enrolled, skip || role !== "participant" ? "skip" : {});

  // Issue 40: the event a participant page is currently about — URL `?event=`
  // wins, then the most recent enrollment.
  const selectedEventSlug = useMemo(() => {
    if (role !== "participant") return null;
    const fromUrl = new URLSearchParams(location.search).get("event");
    if (fromUrl) return fromUrl;
    return enrolled?.[0]?.slug ?? null;
  }, [role, location.search, enrolled]);

  const baseNav = role === "participant" ? buildParticipantNav(selectedEventSlug) : (ROLE_NAV[role] ?? ROLE_NAV.participant);
  const navLinks = baseNav
    .filter((item) => item.label !== "Pairwise" || anyOpenEvent !== false)
    .filter((item) => item.label !== "Results" || (enrolled !== undefined && enrolled.length > 0))
    .map((item) =>
      item.label === "Overrides" ? { ...item, badge: pendingOverrides ?? 0 } : item,
    );

  useEffect(() => {
    document.title = "RaptorJudge";
  }, []);

  async function handleSignOut() {
    // Issue 17: Convex Auth's tokens live in sessionStorage under __convexAuth*;
    // kill them explicitly so a broken session cannot survive into the next
    // sign-in, then let the library tear down its own state.
    clearConvexAuthSessionKeys();
    try {
      await signOut();
    } catch {
      // Tokens already gone — the manual wipe above is what matters.
    }
    toast.success("Signed out");
    navigate("/auth");
  }

  if (!isAuthenticated) {
    // Public shell: slim top bar, no sidebar.
    return (
      <div className="min-h-screen flex flex-col bg-canvas text-primary">
        <header className="sticky top-0 z-40 bg-canvas/90 backdrop-blur border-b border-line">
          <div className="max-w-content mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2.5" aria-label="RaptorJudge home">
              <span className="w-7 h-7 rounded-btn bg-accent text-white flex items-center justify-center text-[13px] font-bold">
                R
              </span>
              <span className="wordmark text-[17px]">RaptorJudge</span>
            </Link>
            <nav className="flex items-center gap-5 text-sm">
              <Link to="/events" className="text-secondary hover:text-primary transition-colors duration-fast">
                Events
              </Link>
              <Link to="/verify" className="text-secondary hover:text-primary transition-colors duration-fast">
                Verify
              </Link>
              <Link
                to="/auth"
                className="h-9 px-4 inline-flex items-center rounded-btn bg-accent text-white hover:bg-accent-hover transition-colors duration-fast"
              >
                Sign in
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1 w-full max-w-content mx-auto px-5 lg:px-8 py-8">
          <Outlet />
        </main>
        <footer className="border-t border-line mt-12">
          <div className="max-w-content mx-auto px-5 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[13px] text-muted">
            <span>© 2026 RaptorJudge</span>
            <div className="flex items-center gap-6">
              <Link to="/help" className="hover:text-primary transition-colors duration-fast">
                Help
              </Link>
              <Link to="/terms" className="hover:text-primary transition-colors duration-fast">
                Terms
              </Link>
              <Link to="/privacy" className="hover:text-primary transition-colors duration-fast">
                Privacy
              </Link>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-primary">
      {/* Mobile top bar with hamburger (<768px) */}
      <div className="md:hidden sticky top-0 z-40 bg-canvas/90 backdrop-blur border-b border-line">
        <div className="h-14 px-4 flex items-center justify-between">
          <Link to={homeHref} className="flex items-center gap-2" aria-label="RaptorJudge home">
            <span className="w-6 h-6 rounded-btn bg-accent text-white flex items-center justify-center text-[11px] font-bold">
              R
            </span>
            <span className="wordmark text-[15px]">RaptorJudge</span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-expanded={mobileOpen}
            aria-label="Toggle navigation"
            className="p-2 rounded-btn text-secondary hover:text-primary hover:bg-surface-2 transition-colors duration-fast"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <div className="flex">
        {/*
          Sidebar: one component for all four roles.
            ≥1024px  full 240px rail with labels
            768–1023px icon-only rail (labels hidden, tooltips on hover)
            <768px   off-canvas drawer opened from the hamburger
          The rail keeps the same borders, padding and active indicator in all
          three modes — only the label visibility changes.
        */}
        <aside
          className={`
            fixed md:sticky top-0 z-40 h-screen shrink-0 flex flex-col bg-canvas border-r border-line
            transition-transform duration-state ease-out
            ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0
            w-sidebar md:w-16 lg:w-sidebar
          `}
          aria-label="Primary"
        >
          {/* Wordmark — links to this role's own console, never the landing page */}
          <div className="h-16 flex items-center px-4 md:px-0 lg:px-4 border-b border-line shrink-0 justify-start md:justify-center lg:justify-start">
            <Link
              to={homeHref}
              className="flex items-center gap-2.5 min-w-0"
              aria-label="Go to my dashboard"
              title="Go to my dashboard"
            >
              <span className="w-7 h-7 rounded-btn bg-accent text-white flex items-center justify-center text-[13px] font-bold shrink-0">
                R
              </span>
              <span className="wordmark text-[17px] truncate md:hidden lg:inline">RaptorJudge</span>
            </Link>
          </div>

          {/* Role nav + account nav */}
          <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-0.5">
            {navLinks.map((item) => (
              <NavRow
                key={item.label + item.href}
                item={item}
                active={
                  item.match
                    ? item.match(location.pathname, location.search)
                    : defaultMatch(item.href)(location.pathname)
                }
              />
            ))}

            <div className="my-3 border-t border-line" aria-hidden="true" />

            {ACCOUNT_NAV.map((item) => (
              <NavRow
                key={item.label}
                item={item}
                active={defaultMatch(item.href)(location.pathname)}
              />
            ))}
          </nav>

          {/* Notification bell (issue 23.3) */}
          <div className="px-3 pb-1 shrink-0 relative">
            <button
              type="button"
              onClick={() => setBellOpen((v) => !v)}
              aria-expanded={bellOpen}
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
              className={`relative w-full flex items-center gap-3 rounded-btn px-3 py-2.5 text-[13px] font-medium transition-colors duration-fast ${
                bellOpen ? "text-primary bg-surface-2" : "text-secondary hover:text-primary hover:bg-surface-2"
              }`}
            >
              <span className="shrink-0 relative">
                <Bell size={20} strokeWidth={1.75} />
                {unreadCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-pill bg-accent"
                  />
                )}
              </span>
              <span className="truncate md:hidden lg:inline">Notifications</span>
              {unreadCount > 0 && (
                <span className="ml-auto md:absolute md:right-3 lg:static lg:ml-auto tnum text-[11px] font-semibold rounded-pill bg-accent text-white px-1.5 py-0.5">
                  {unreadCount}
                </span>
              )}
            </button>

            {bellOpen && (
              <div className="md:hidden lg:block absolute left-3 right-3 bottom-full mb-2 z-50 rounded-card border border-line bg-canvas shadow-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 h-11 border-b border-line">
                  <span className="text-[13px] font-semibold text-primary">Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={() => markAllRead({})}
                      className="text-[12px] text-accent hover:text-accent-hover transition-colors duration-fast"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {(notifications ?? []).length === 0 ? (
                    <div className="px-4 py-8 flex flex-col items-center text-center gap-1.5">
                      <Bell size={20} strokeWidth={1.5} className="text-muted mb-1" aria-hidden="true" />
                      <p className="text-[13px] font-medium text-primary">No notifications yet</p>
                      <p className="text-[12px] text-muted max-w-[240px] leading-relaxed">
                        Assignment, score, vote and result updates for your events show up here.
                      </p>
                    </div>
                  ) : (
                    (notifications ?? []).slice(0, 12).map((n: any) => {
                      const body = (
                        <>
                          <p className="text-[13px] text-primary leading-snug">{n.message}</p>
                          <p className="text-[11px] text-muted mt-0.5 tnum">
                            {formatDate(n.createdAt)}
                          </p>
                        </>
                      );
                      const shell = `block px-4 py-3 border-b border-line last:border-0 transition-colors duration-fast ${
                        n.readAt ? "" : "bg-surface-1"
                      }`;
                      // A notification without a destination is informational only:
                      // render it as static text instead of a link that goes nowhere.
                      return n.linkUrl ? (
                        <Link
                          key={n.id}
                          to={n.linkUrl}
                          onClick={() => setBellOpen(false)}
                          className={`${shell} hover:bg-surface-2`}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div key={n.id} className={shell}>
                          {body}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User footer */}
          <div className="border-t border-line p-3 shrink-0">
            <div className="flex items-center gap-3 md:justify-center lg:justify-start">
              <Avatar src={myAvatar ?? undefined} name={me?.name || me?.email || "User"} size="sm" />
              <div className="min-w-0 flex-1 md:hidden lg:block">
                <p className="text-[13px] font-medium text-primary truncate">{me?.name || me?.email}</p>
                <Badge variant={role === "admin" ? "accent" : "default"} className="mt-1">
                  {role}
                </Badge>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                aria-label="Sign out"
                title="Sign out"
                className="ml-auto md:ml-0 lg:ml-auto p-2 rounded-btn text-muted hover:text-danger hover:bg-danger/10 transition-colors duration-fast"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </aside>

        {/* Drawer backdrop (mobile) */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-30 bg-backdrop backdrop-blur-[4px] md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Main column */}
        <div className="flex-1 min-w-0 flex flex-col">
          <main className="flex-1 w-full max-w-content mx-auto px-5 lg:px-8 py-8">
            <Outlet />
          </main>

          <footer className="border-t border-line py-6 text-center text-[13px] text-muted">
            © 2026 RaptorJudge
          </footer>
        </div>
      </div>
    </div>
  );
}
