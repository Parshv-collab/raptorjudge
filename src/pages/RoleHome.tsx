import { Navigate } from "react-router-dom";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SkeletonCard } from "@/components/ui/SkeletonCard";

export default function RoleHome() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const me = useQuery(api.users.me, authLoading || !isAuthenticated ? "skip" : {});

  if (authLoading || me === undefined) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (!isAuthenticated || me === null) {
    return <Navigate to="/auth" replace />;
  }

  switch (me.role) {
    case "admin":
    case "organizer":
      return <Navigate to="/organizer" replace />;
    case "judge":
      return <Navigate to="/judge" replace />;
    case "participant":
      return <Navigate to="/dashboard" replace />;
    default:
      return <Navigate to="/auth" replace />;
  }
}
