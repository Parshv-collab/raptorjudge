import React, { useState, useRef, useEffect } from "react";
import { Outlet, Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import { Avatar } from "@/components/ui/Avatar";

function HeaderSearch() {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchTerm.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const events = useQuery(api.events.listPublic, {});
  const matchedEvents = (events || [])
    .filter((e: any) => debouncedQuery && e.title.toLowerCase().includes(debouncedQuery.toLowerCase()))
    .slice(0, 5);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchTerm.trim()) {
      setOpen(false);
      navigate(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
    }
  };

  return (
    <div className="relative hidden lg:block w-48 xl:w-60">
      <input
        type="text"
        placeholder="Search events..."
        value={searchTerm}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className="w-full px-3 py-1.5 text-xs rounded-full bg-white/50 border border-white/80 focus-ring-accent text-[#1d1d1f]"
      />
      {open && debouncedQuery && matchedEvents.length > 0 && (
        <div className="absolute left-0 top-full mt-2 w-full glass-panel rounded-card border-white/90 shadow-xl p-2 z-50 flex flex-col gap-1 text-xs">
          {matchedEvents.map((evt: any) => (
            <Link
              key={evt._id}
              to={`/e/${evt.slug}`}
              onClick={() => setOpen(false)}
              className="p-2 rounded-input hover:bg-white/80 font-bold text-[#1d1d1f] truncate"
            >
              {evt.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const skip = isLoading || !isAuthenticated;
  const me = useQuery(api.users.me, skip ? "skip" : {}) ?? null;
  const skipAdminSettings = skip || !me || (me.role !== "admin" && me.role !== "organizer");
  const settingsQuery = useQuery(api.admin.getSettings, skipAdminSettings ? "skip" : {});
  const settings = settingsQuery ?? {};
  const navigate = useNavigate();
  const location = useLocation();

  const siteName = settings["site_name"] || "RaptorJudge";
  const copyrightText = settings["footer_copyright"] || "© 2026 RaptorJudge";

  useEffect(() => {
    document.title = siteName;
  }, [siteName]);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close menus on route change
  useEffect(() => {
    setMobileOpen(false);
    setProfileOpen(false);
  }, [location.pathname, location.hash]);

  const role = me?.role ?? "participant";

  // Role-based navigation links
  const navLinksByRole = {
    participant: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "My Events", href: "/dashboard#events" },
      { label: "Browse", href: "/events" },
    ],
    judge: [
      { label: "Judge Portal", href: "/judge" },
    ],
    organizer: [
      { label: "Dashboard", href: "/organizer" },
      { label: "Events", href: "/organizer/events" },
    ],
    admin: [
      { label: "Dashboard", href: "/admin" },
      { label: "Events", href: "/admin/events" },
      { label: "Users", href: "/admin/users" },
      { label: "Invites", href: "/admin/invites" },
      { label: "Settings", href: "/admin/settings" },
      { label: "Judging", href: "/admin/judging" },
      { label: "Audit", href: "/admin/audit" },
    ],
  };

  const currentNavLinks = navLinksByRole[role] || navLinksByRole.participant;

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <div className="min-h-screen flex flex-col relative text-[#1d1d1f]">
      {/* Drifting Pastel Background Blobs Container */}
      <div className="pastel-bg-container" aria-hidden="true">
        <div className="pastel-blob pastel-blob-1" />
        <div className="pastel-blob pastel-blob-2" />
        <div className="pastel-blob pastel-blob-3" />
      </div>

      {/* Sticky Liquid Glass Navigation Top Bar */}
      <header className="sticky top-0 z-40 w-full glass-panel border-b border-white/60 shadow-sm transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo (Left) */}
          <Link
            to="/"
            className="flex items-center gap-2.5 font-extrabold text-lg text-[#1d1d1f] hover:opacity-90 transition-opacity focus-ring-accent rounded-button p-1"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#ff0055] to-[#ff5588] text-white flex items-center justify-center font-black text-sm shadow-sm shadow-[#ff0055]/30">
              {siteName.charAt(0)}
            </div>
            <span className="tracking-tight">
              {siteName}
            </span>
          </Link>

          {/* Persistent Search Input for Authenticated Users */}
          {isAuthenticated && <HeaderSearch />}

          {/* Role-based Center Nav Links (Desktop) */}
          <nav className="hidden md:flex items-center gap-1 bg-white/40 p-1 rounded-full border border-white/70 backdrop-blur-md">
            {currentNavLinks.map((link) => (
              <NavLink
                key={link.label}
                to={link.href}
                end={link.href === "/"}
                className={({ isActive }) => `
                  px-4 py-1.5 text-xs font-semibold rounded-full transition-all duration-150 focus-ring-accent
                  ${
                    isActive
                      ? "bg-white text-[#1d1d1f] shadow-sm font-bold"
                      : "text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-white/40"
                  }
                `}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          {/* Right Header Controls (Profile Dropdown / Auth CTA / Hamburger) */}
          <div className="flex items-center gap-3">
            {isLoading || (isAuthenticated && me === undefined) ? (
              <div className="w-8 h-8 rounded-full bg-black/10 animate-pulse motion-reduce:animate-none" />
            ) : !isAuthenticated || me === null ? (
              <Link
                to="/auth"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#ff0055] hover:bg-[#e0004b] rounded-button shadow-sm shadow-[#ff0055]/30 transition-all focus-ring-accent"
              >
                Sign in
              </Link>
            ) : (
              <div className="relative" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setProfileOpen((prev) => !prev)}
                  aria-expanded={profileOpen}
                  aria-haspopup="true"
                  aria-label="User profile menu"
                  className="flex items-center gap-2.5 p-1 rounded-full hover:bg-white/50 transition-all focus-ring-accent border border-white/80 shadow-sm"
                >
                  <Avatar src={me.avatarUrl} name={me.name || me.email} size="sm" />
                  <span className="hidden sm:inline text-xs font-semibold text-[#1d1d1f] pr-1.5 max-w-[120px] truncate">
                    {me.name || me.email}
                  </span>
                  <svg
                    className={`w-3.5 h-3.5 text-[#6e6e73] transition-transform duration-200 hidden sm:block ${
                      profileOpen ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Profile Dropdown Menu */}
                {profileOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-2 w-56 glass-panel rounded-card border-white/90 shadow-xl p-1.5 animate-fade-in z-50 flex flex-col gap-0.5 text-xs font-medium"
                  >
                    <div className="px-3 py-2 border-b border-black/5 mb-1">
                      <p className="font-bold text-[#1d1d1f] truncate">{me.name}</p>
                      <p className="text-[11px] text-[#6e6e73] truncate">{me.email}</p>
                      <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-[#ff0055]/10 text-[#ff0055]">
                        {me.role || "participant"}
                      </span>
                    </div>

                    <Link
                      to="/profile"
                      role="menuitem"
                      className="px-3 py-2 rounded-input hover:bg-white/80 text-[#1d1d1f] flex items-center gap-2 transition-colors"
                    >
                      Profile
                    </Link>

                    <Link
                      to="/settings"
                      role="menuitem"
                      className="px-3 py-2 rounded-input hover:bg-white/80 text-[#1d1d1f] flex items-center gap-2 transition-colors"
                    >
                      Settings
                    </Link>

                    <Link
                      to="/security"
                      role="menuitem"
                      className="px-3 py-2 rounded-input hover:bg-white/80 text-[#1d1d1f] flex items-center gap-2 transition-colors"
                    >
                      Security
                    </Link>

                    <Link
                      to="/help"
                      role="menuitem"
                      className="px-3 py-2 rounded-input hover:bg-white/80 text-[#1d1d1f] flex items-center gap-2 transition-colors"
                    >
                      Help
                    </Link>

                    <div className="my-1 border-t border-black/5" />

                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleSignOut}
                      className="w-full px-3 py-2 rounded-input hover:bg-[#e63946]/10 text-[#e63946] font-semibold text-left flex items-center gap-2 transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-expanded={mobileOpen}
              aria-label="Toggle navigation menu"
              className="md:hidden p-2 rounded-input text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-white/50 transition-colors focus-ring-accent"
            >
              {mobileOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Stacked Navigation */}
        {mobileOpen && (
          <div className="md:hidden glass-panel border-t border-white/60 px-4 pt-2 pb-4 flex flex-col gap-1.5 animate-fade-in">
            {currentNavLinks.map((link) => (
              <NavLink
                key={link.label}
                to={link.href}
                end={link.href === "/"}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => `
                  px-4 py-2.5 text-xs font-semibold rounded-input transition-colors
                  ${
                    isActive
                      ? "bg-white text-[#1d1d1f] font-bold shadow-sm"
                      : "text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-white/40"
                  }
                `}
              >
                {link.label}
              </NavLink>
            ))}
          </div>
        )}
      </header>

      {/* Main Content Body Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Glass Footer */}
      <footer className="w-full glass-panel border-t border-white/60 py-8 mt-12 text-xs text-[#6e6e73]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 font-bold text-[#1d1d1f]">
            <span>{copyrightText}.</span>
            <span className="font-normal text-[#6e6e73]">All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6 font-medium">
            <Link to="/help" className="hover:text-[#1d1d1f] transition-colors">
              Help
            </Link>
            <a href="mailto:contact@raptorjudge.local" className="hover:text-[#1d1d1f] transition-colors">
              Contact
            </a>
            <Link to="/terms" className="hover:text-[#1d1d1f] transition-colors">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-[#1d1d1f] transition-colors">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
