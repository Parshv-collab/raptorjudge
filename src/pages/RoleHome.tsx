import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { Button } from "@/components/ui/Button";
import { clearConvexAuthSessionKeys } from "@/lib/sessionCleanup";
import { roleHomePath } from "@/lib/roles";

/** How long the role query may stay unresolved before we call the session stale. */
const ROLE_RESOLVE_TIMEOUT_MS = 5000;

export default function RoleHome() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const me = useQuery(api.users.me, authLoading || !isAuthenticated ? "skip" : {});
  const [timedOut, setTimedOut] = useState(false);

  // Issue 17: bound the wait the same way the auth page does — a role query
  // that never settles (stale tokens) must surface an exit, not a spinner.
  useEffect(() => {
    if (authLoading || me !== undefined) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), ROLE_RESOLVE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [authLoading, me]);

  async function handleSignOut() {
    clearConvexAuthSessionKeys();
    try {
      await signOut();
    } catch {
      // Tokens may already be unusable; the manual wipe above is the fix.
    }
    window.location.href = "/auth";
  }

  if (authLoading || (me === undefined && !timedOut)) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  if (me === undefined && timedOut) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <div className="bg-surface-1 border border-line rounded-card p-8 flex flex-col items-center text-center gap-4">
          <div className="w-10 h-10 rounded-pill border-2 border-line border-t-accent animate-spin" aria-hidden="true" />
          <h1 className="text-h3 text-primary">Session may be stale</h1>
          <p className="text-[13px] text-secondary leading-relaxed">
            Your workspace is taking unusually long to load. Sign out and back in to refresh your
            session.
          </p>
          <Button variant="secondary" onClick={handleSignOut} className="mt-2">
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  if (me === null) {
    return <Navigate to="/auth" replace />;
  }

  if (me === undefined) {
    return <Navigate to="/auth" replace />;
  }

  // `roleHomePath` is the documented single source of truth for "where does
  // this role live", and the sign-in redirect, the route guards and the shell's
  // wordmark all use it. This component used to carry its own copy of the
  // mapping, and it disagreed: it sent an *admin* to `/organizer`, so signing in
  // put an admin on the admin console while clicking "Home" put them on the
  // organizer console. Now there is one answer for every path into the app.
  const home = roleHomePath(me.role);

  if (!home) {
    // Issue 17: fresh sign-ups have no role. Never bounce them back to /auth
    // (that used to loop) — say exactly what is wrong and how to fix it.
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <div className="bg-surface-1 border border-warning/40 rounded-card p-8 flex flex-col items-center text-center gap-4">
          <div className="w-12 h-12 rounded-full border border-warning/40 bg-warning/10 text-warning flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-h3 text-primary">Your account isn&apos;t assigned a role yet</h1>
          <p className="text-[13px] text-secondary leading-relaxed">
            Ask your organizer to invite you, or sign up via an invite link. Your account was
            created successfully — it just doesn&apos;t have a role attached yet.
          </p>
          <Button variant="secondary" onClick={handleSignOut} className="mt-2">
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return <Navigate to={home} replace />;
}
