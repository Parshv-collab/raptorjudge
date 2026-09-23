import { Navigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * Post-authentication landing route.
 *
 * `/auth` needs a destination that is *inside* the product rather than the
 * public landing page, but which one depends on the role — and the role is only
 * known after sign-in. Resolving it here keeps the redirect target static and
 * same-origin (no user-controlled redirect) while still dropping each account
 * into the right workspace.
 */
export default function RoleHome() {
  const me = useQuery(api.users.me, {});

  if (me === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="font-mono text-sm text-muted-foreground animate-pulse">
          resolving your workspace…
        </div>
      </div>
    );
  }

  switch (me?.role) {
    case "admin":
    case "organizer":
      return <Navigate to="/organizer" replace />;
    case "judge":
      return <Navigate to="/judge" replace />;
    default:
      return <Navigate to="/workspace" replace />;
  }
}
