import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { parentRouteFor } from "@/lib/parentRoute";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Adds a bottom border — use when the page body starts immediately below. */
  bordered?: boolean;
  className?: string;
  /** Explicit parent path. Overrides the built-in parent map. */
  backTo?: string;
  /** Label for the parent, e.g. "Admin overview". */
  backLabel?: string;
  /** Set to false to suppress the automatic back control. */
  back?: boolean;
}

/**
 * The in-content top bar: page title (h1, 24px), one-line muted description,
 * actions on the right. Sits inside the main content column — it never spans
 * the full viewport (the sidebar owns the left rail).
 *
 * Back control: every non-root screen gets one, resolved from an explicit
 * parent map (`src/lib/parentRoute.ts`) so `/admin/users` returns to `/admin`,
 * `/judge/score/:id` to `/judge` and `/project/:id` to the gallery, rather
 * than trusting browser history. Unknown non-root screens fall back to
 * `navigate(-1)`. Root screens (a role's own landing page) render nothing.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  bordered = true,
  className = "",
  backTo,
  backLabel,
  back = true,
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  const parent = React.useMemo(() => parentRouteFor(location.pathname), [location.pathname]);

  const explicit = backTo ? { to: backTo, label: backLabel ?? "Back" } : null;
  const resolved = explicit ?? (back ? parent : null);

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {resolved && (
        <button
          type="button"
          onClick={() => (resolved.to ? navigate(resolved.to) : navigate(-1))}
          className="group inline-flex items-center gap-2 self-start text-[13px] text-secondary hover:text-primary transition-colors duration-fast -ml-1 px-1 py-1 rounded-btn"
        >
          <ArrowLeft
            size={16}
            aria-hidden="true"
            className="transition-transform duration-fast group-hover:-translate-x-0.5"
          />
          <span>{resolved.label}</span>
        </button>
      )}

      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 ${
          bordered ? "border-b border-line" : ""
        }`}
      >
        <div className="min-w-0">
          <h1 className="text-h2 text-primary truncate">{title}</h1>
          {description && <p className="text-sm text-secondary mt-1">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
      </div>
    </div>
  );
};
