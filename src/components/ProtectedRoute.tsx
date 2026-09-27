import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { roleHomePath } from "@/lib/roles";

export type RequiredRole = "admin" | "organizer" | "judge" | "participant";

export interface ProtectedRouteProps {
  /** Role(s) allowed to render `children`. Omit to accept any signed-in role. */
  requiredRole?: RequiredRole | RequiredRole[];
  children: React.ReactNode;
}

function RouteSkeleton() {
  return (
    <div className="max-w-3xl flex flex-col gap-6">
      <SkeletonCard lines={2} />
      <SkeletonCard lines={4} />
    </div>
  );
}

/**
 * Role guard (T1 + T2 role isolation, UI side).
 *
 * Three outcomes, decided **before** any protected markup is rendered:
 *
 *  1. no session          → `/auth?returnTo=<path>` so the intended screen
 *                           survives the sign-in round-trip
 *  2. session, wrong role → the visitor's **own** dashboard
 *  3. role matches        → `children`
 *
 * The role comes from `users.me`, and children are only rendered once that
 * query has resolved, so typing `/admin` as a participant can never flash the
 * admin console. This is *only* defence in depth: every privileged query and
 * mutation still re-checks the caller's role server-side.
 */
export function ProtectedRoute({ requiredRole, children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const location = useLocation();

  const allowed = React.useMemo<RequiredRole[]>(
    () => (requiredRole ? (Array.isArray(requiredRole) ? requiredRole : [requiredRole]) : []),
    [requiredRole],
  );

  const me = useQuery(api.users.me, isLoading || !isAuthenticated ? "skip" : {});

  if (isLoading) return <RouteSkeleton />;

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/auth?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  // Session present, role still resolving — hold the skeleton rather than
  // rendering anything the guard might be about to reject.
  if (me === undefined) return <RouteSkeleton />;

  if (allowed.length === 0) return <>{children}</>;

  const role = (me?.role ?? undefined) as RequiredRole | undefined;
  if (!role || !allowed.includes(role)) {
    // Wrong role (or no role yet) — send them to their own console, never into
    // someone else's. `roleHomePath` returns null for unknown roles, and
    // `/home` re-resolves the role server-side.
    return <Navigate to={roleHomePath(role) ?? "/home"} replace />;
  }

  return <>{children}</>;
}
