import { Outlet, Link, NavLink, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import {
  Terminal,
  Moon,
  Sun,
  LogOut,
  User,
  Shield,
  Gavel,
  Users,
  LayoutDashboard,
  Repeat,
  ShieldCheck,
} from "lucide-react";
import { useTheme } from "../theme/ThemeProvider";

const ROLES = ["participant", "judge", "organizer", "admin"] as const;

/** Role switcher for reviewers: one click to test each role's experience. */
function RoleSwitcher({ current, userId }: { current: string; userId: any }) {
  const [open, setOpen] = useState(false);
  const switchRole = useMutation(api.users.setRole);
  const navigate = useNavigate();

  const icons: Record<string, React.ReactNode> = {
    participant: <Users size={13} />,
    judge: <Gavel size={13} />,
    organizer: <LayoutDashboard size={13} />,
    admin: <Shield size={13} />,
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-secondary-foreground transition hover:border-primary/50"
        title="Quick switch role (demo convenience)"
      >
        <Repeat size={12} />
        {current}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-md border border-border bg-popover p-1 shadow-xl">
          {ROLES.map((r) => (
            <button
              key={r}
              className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 font-mono text-xs transition hover:bg-secondary ${
                r === current ? "text-primary" : "text-muted-foreground"
              }`}
              onClick={async () => {
                setOpen(false);
                await switchRole({ userId, role: r });
                navigate(r === "participant" ? "/workspace" : r === "judge" ? "/judge" : "/organizer");
              }}
            >
              {icons[r]}
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const { theme, toggle } = useTheme();
  const me = useQuery(api.users.me, {}) ?? null;
  const navigate = useNavigate();

  const navLink = ({ isActive }: { isActive: boolean }) =>
    `font-mono text-[13px] transition hover:text-primary ${isActive ? "text-primary" : "text-muted-foreground"}`;

  const homeHref = me?.role === "judge" ? "/judge" : me?.role === "organizer" || me?.role === "admin" ? "/organizer" : "/workspace";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground">
                <Terminal size={16} />
              </span>
              <span className="font-mono text-sm font-bold tracking-tight">
                Raptor<span className="text-primary">Judge</span>
              </span>
            </Link>
            <nav className="hidden items-center gap-5 md:flex">
              <NavLink to="/e/dogfood-2026" className={navLink}>
                event
              </NavLink>
              <NavLink to="/gallery/dogfood-2026" className={navLink}>
                gallery
              </NavLink>
              <NavLink to="/verify" className={navLink}>
                verify
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={toggle}
              className="rounded-md border border-border p-1.5 text-muted-foreground transition hover:text-primary"
              title="Toggle theme"
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            {isAuthenticated && me ? (
              <>
                {(me.role === "admin" || me.role === "organizer") && (
                  <Link
                    to="/security"
                    className="hidden items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/50 hover:text-primary sm:flex"
                    title="Account security — two-factor authentication"
                  >
                    <ShieldCheck size={13} />
                    security
                  </Link>
                )}
                {me.role === "admin" && <RoleSwitcher current={me.role} userId={me._id} />}
                <Link
                  to={homeHref}
                  className="hidden items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/50 hover:text-primary sm:flex"
                >
                  <User size={13} />
                  {me.name}
                </Link>
                <button
                  onClick={async () => {
                    await signOut();
                    navigate("/");
                  }}
                  className="rounded-md border border-border p-1.5 text-muted-foreground transition hover:text-destructive"
                  title="Sign out"
                >
                  <LogOut size={15} />
                </button>
              </>
            ) : (
              !isLoading && (
                <Link
                  to="/auth"
                  className="rounded-md bg-primary px-3.5 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-primary-foreground transition hover:opacity-90"
                >
                  sign in
                </Link>
              )
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-border py-6">
        <div className="container flex flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
          <span className="font-mono">
            RaptorJudge — open-source hackathon platform · built for Hackathon Raptors · Dogfood 2026
          </span>
          <span className="font-mono">MIT licensed · self-hostable · offline-first</span>
        </div>
      </footer>
    </div>
  );
}
