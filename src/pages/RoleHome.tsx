import { Navigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

import { SkeletonCard } from "@/components/ui/SkeletonCard";

export default function RoleHome() {
  const me = useQuery(api.users.me, {});

  if (me === undefined) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (me === null) {
    return <Navigate to="/auth" replace />;
  }

  switch (me.role) {
    case "admin":
      return <Navigate to="/admin" replace />;
    case "organizer":
      return <Navigate to="/organizer" replace />;
    case "judge":
      return <Navigate to="/judge" replace />;
    default:
      return <Navigate to="/dashboard" replace />;
  }
}
