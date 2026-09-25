import React, { useState, useEffect } from "react";
import { Outlet, Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";

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
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

/** Role-specific primary navigation (spec: one nav per role). */
const ROLE_NAV: Record<string, NavItem[]> = {
  participant: [
    { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard size={20} strokeWidth={1.75} /> },
    { label: "Gallery", href: "/events", icon: <LayoutGrid size={20} strokeWidth={1.75} /> },
    { label: "My Team", href: "/workspace", icon: <Users size={20} strokeWidth={1.75} /> },
    { label: "Chat", href: "/workspace/chat", icon: <MessageSquare size={20} strokeWidth={1.75} /> },
    { label: "Profile", href: "/profile", icon: <UserIcon size={20} strokeWidth={1.75} /> },
  ],
  judge: [
    { label: "Queue", href: "/judge", icon: <Inbox size={20} strokeWidth={1.75} /> },
    { label: "Pairwise", href: "/judge/pairwise", icon: <Swords size={20} strokeWidth={1.75} /> },
    { label: "My Scores", href: "/judge", icon: <Star size={20} strokeWidth={1.75} /> },
  ],
  organizer: [
    { label: "Overview", href: "/organizer", icon: <Gauge size={20} strokeWidth={1.75} /> },
    { label: "Events", href: "/organizer/events", icon: <CalendarDays size={20} strokeWidth={1.75} /> },
    { label: "Judges", href: "/admin/users", icon: <Users size={20} strokeWidth={1.75} /> },
    { label: "Submissions", href: "/events", icon: <ClipboardList size={20} strokeWidth={1.75} /> },
    { label: "Results", href: "/events", icon: <Scale size={20} strokeWidth={1.75} /> },
    { label: "Profile", href: "/profile", icon: <UserIcon size={20} strokeWidth={1.75} /> },
  ],
  admin: [
    { label: "Overview", href: "/admin", icon: <LayoutDashboard size={20} strokeWidth={1.75} /> },
    { label: "Users", href: "/admin/users", icon: <Users size={20} strokeWidth={1.75} /> },
    { label: "Events", href: "/admin/events", icon: <CalendarDays size={20} strokeWidth={1.75} /> },
    { label: "Judging", href: "/admin/judging", icon: <Scale size={20} strokeWidth={1.75} /> },
    { label: "Invites", href: "/admin/invites", icon: <Mail size={20} strokeWidth={1.75} /> },
    { label: "Settings", href: "/admin/settings", icon: <Settings size={20} strokeWidth={1.75} /> },
    { label: "Audit", href: "/admin/audit", icon: <ScrollText size={20} strokeWidth={1.75} /> },
  ],
};

/** Account links shared by every role (bottom group). */
const ACCOUNT_NAV: NavItem[] = [
  { label: "Profile", href: "/profile", icon: <UserIcon size={20} strokeWidth={1.75} /> },
  { label: "Settings", href: "/settings", icon: <Settings size={20} strokeWidth={1.75} /> },
  { label: "Security", href: "/security", icon: <ShieldCheck size={20} strokeWidth={1.75} /> },
  { label: "Help", href: "/help", icon: <ClipboardList size={20} strokeWidth={1.75} /> },
];

export function AppShell() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const skip = isLoading || !isAuthenticated;
  const me = useQuery(api.users.me, skip ? "skip" : {}) ?? null;
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile drawer on route change.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const role = me?.role ?? "participant";
  const navLinks = ROLE_NAV[role] ?? ROLE_NAV.participant;

  useEffect(() => {
    document.title = "RaptorJudge";
  }, []);

  async function handleSignOut() {
    await signOut();
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
      <div className="lg:hidden sticky top-0 z-40 bg-canvas/90 backdrop-blur border-b border-line">
        <div className="h-14 px-4 flex items-center justify-between">
          <Link to="/home" className="flex items-center gap-2" aria-label="RaptorJudge home">
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
        {/* Sidebar: 240px fixed left rail */}
        <aside
          className={`
            fixed lg:sticky top-0 z-40 h-screen shrink-0 flex flex-col bg-canvas border-r border-line
            transition-transform duration-state ease-out
            ${mobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0
            w-sidebar
          `}
          aria-label="Primary"
        >
          {/* Wordmark */}
          <div className="h-16 flex items-center px-4 border-b border-line shrink-0">
            <Link to="/home" className="flex items-center gap-2.5 min-w-0" aria-label="RaptorJudge home">
              <span className="w-7 h-7 rounded-btn bg-accent text-white flex items-center justify-center text-[13px] font-bold shrink-0">
                R
              </span>
              <span className="wordmark text-[17px] truncate">RaptorJudge</span>
            </Link>
          </div>

          {/* Role nav */}
          <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-0.5">
            {navLinks.map((item) => (
              <NavLink
                key={item.label + item.href}
                to={item.href}
                className={({ isActive }) => `
                  group relative flex items-center gap-3 rounded-btn px-3 py-2.5 text-[13px] font-medium transition-colors duration-fast
                  ${isActive ? "text-primary bg-surface-2" : "text-secondary hover:text-primary hover:bg-surface-2"}
                `}
              >
                {({ isActive }) => (
                  <>
                    {/* Active accent left border (2px) */}
                    <span
                      aria-hidden="true"
                      className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-pill bg-accent transition-opacity duration-fast ${
                        isActive ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <span className="shrink-0">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}

            <div className="my-3 border-t border-line" aria-hidden="true" />

            {ACCOUNT_NAV.map((item) => (
              <NavLink
                key={item.label}
                to={item.href}
                className={({ isActive }) => `
                  flex items-center gap-3 rounded-btn px-3 py-2.5 text-[13px] font-medium transition-colors duration-fast
                  ${isActive ? "text-primary bg-surface-2" : "text-secondary hover:text-primary hover:bg-surface-2"}
                `}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* User footer */}
          <div className="border-t border-line p-3 shrink-0">
            <div className="flex items-center gap-3">
              <Avatar name={me?.name || me?.email || "User"} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-primary truncate">{me?.name || me?.email}</p>
                <Badge variant={role === "admin" ? "accent" : "default"} className="mt-1">
                  {role}
                </Badge>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                aria-label="Sign out"
                className="ml-auto p-2 rounded-btn text-muted hover:text-danger hover:bg-danger/10 transition-colors duration-fast"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </aside>

        {/* Drawer backdrop (mobile) */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-30 bg-backdrop backdrop-blur-[4px] lg:hidden"
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
