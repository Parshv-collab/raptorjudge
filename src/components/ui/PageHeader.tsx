import React from "react";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Adds a bottom border — use when the page body starts immediately below. */
  bordered?: boolean;
  className?: string;
}

/**
 * The in-content top bar: page title (h1, 24px), one-line muted description,
 * actions on the right. Sits inside the main content column — it never spans
 * the full viewport (the sidebar owns the left rail).
 */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, actions, bordered = true, className = "" }) => (
  <div
    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 ${
      bordered ? "border-b border-line" : ""
    } ${className}`}
  >
    <div className="min-w-0">
      <h1 className="text-h2 text-primary truncate">{title}</h1>
      {description && <p className="text-sm text-secondary mt-1">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
  </div>
);
