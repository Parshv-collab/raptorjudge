import React, { useState, useRef, useEffect } from "react";
import { Outlet, Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import { Avatar } from "@/components/ui/Avatar";

export function AppShell() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const me = useQuery(api.users.me, {}) ?? null;
  const navigate = useNavigate();
  const location = useLocation();

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

  // Role-based navigation links (max 3 per role, exact matching specs)
  const navLinksByRole = {
    participant: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "My Events", href: "/dashboard#events" },
      { label: "Browse", href: "/" },
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
              R
            </div>
            <span className="tracking-tight">
              Raptor<span className="text-[#ff0055]">Judge</span>
            </span>
          </Link>

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
            {isAuthenticated && me ? (
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
                      <svg className="w-4 h-4 text-[#6e6e73]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Profile
                    </Link>

                    <Link
                      to="/settings"
                      role="menuitem"
                      className="px-3 py-2 rounded-input hover:bg-white/80 text-[#1d1d1f] flex items-center gap-2 transition-colors"
                    >
                      <svg className="w-4 h-4 text-[#6e6e73]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Settings
                    </Link>

                    <Link
                      to="/security"
                      role="menuitem"
                      className="px-3 py-2 rounded-input hover:bg-white/80 text-[#1d1d1f] flex items-center gap-2 transition-colors"
                    >
                      <svg className="w-4 h-4 text-[#6e6e73]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      Security
                    </Link>

                    <Link
                      to="/help"
                      role="menuitem"
                      className="px-3 py-2 rounded-input hover:bg-white/80 text-[#1d1d1f] flex items-center gap-2 transition-colors"
                    >
                      <svg className="w-4 h-4 text-[#6e6e73]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Help
                    </Link>

                    <div className="my-1 border-t border-black/5" />

                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleSignOut}
                      className="w-full px-3 py-2 rounded-input hover:bg-[#e63946]/10 text-[#e63946] font-semibold text-left flex items-center gap-2 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : !isLoading ? (
              <Link
                to="/auth"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#ff0055] hover:bg-[#e0004b] rounded-button shadow-sm shadow-[#ff0055]/30 transition-all focus-ring-accent"
              >
                Sign in
              </Link>
            ) : null}

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
            <span>© 2026 RaptorJudge.</span>
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
