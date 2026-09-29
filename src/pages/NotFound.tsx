import { Link } from "react-router-dom";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { roleHomePath } from "@/lib/roles";

/**
 * 404.
 *
 * A signed-in visitor who mistypes a URL (or follows a stale link) must not be
 * dumped on the public marketing page — `/` routes an authenticated user to
 * their own console anyway, so the primary action below is role-aware and the
 * secondary one is a plain way home.
 */
export default function NotFound() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.users.me, isLoading || !isAuthenticated ? "skip" : {});
  const home = isAuthenticated ? roleHomePath(me?.role) ?? "/home" : null;

  return (
    <div className="min-h-[60vh] flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full text-center flex flex-col items-center">
        <p className="font-mono text-display text-accent leading-none">404</p>
        <h1 className="text-h1 text-primary mt-6">Page not found</h1>
        <p className="text-sm text-secondary mt-2 mb-8 leading-relaxed max-w-sm">
          {home
            ? "That link does not match any page in this workspace. Nothing was lost — your work is untouched."
            : "The page or resource you were looking for does not exist or may have been moved."}
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link to={home ?? "/"}>
            <Button variant="primary" size="md">
              {home ? "Back to my dashboard" : "Return to homepage"}
            </Button>
          </Link>
          {home && (
            <Link to="/events">
              <Button variant="secondary" size="md">
                Browse events
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
