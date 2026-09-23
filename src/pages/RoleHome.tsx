import { Navigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function RoleHome() {
  const me = useQuery(api.users.me, {});

  if (me === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="font-semibold text-xs text-[#6e6e73] animate-pulse">
          Resolving your workspace...
        </div>
      </div>
    );
  }

  switch (me?.role) {
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
