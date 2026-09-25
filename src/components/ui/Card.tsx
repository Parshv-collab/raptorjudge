import React, { forwardRef, useId } from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Renders a hover border-brighten and pointer cursor (clickable cards). */
  interactive?: boolean;
  padding?: "none" | "sm" | "md";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ interactive = false, padding = "md", className = "", children, ...props }, ref) => {
    const paddingStyles = {
      none: "",
      sm: "p-4",
      md: "p-6",
    };

    return (
      <div
        ref={ref}
        className={`
          bg-surface-1 border border-line rounded-card transition-colors duration-fast
          ${interactive ? "hover:border-line-strong cursor-pointer" : ""}
          ${paddingStyles[padding]}
          ${className}
        `}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

/** Section header inside a page: small overline + title + optional description. */
export const SectionHeader: React.FC<{
  overline?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}> = ({ overline, title, description, actions, className = "" }) => (
  <div className={`flex items-start justify-between gap-4 ${className}`}>
    <div className="flex flex-col gap-1">
      {overline && (
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{overline}</span>
      )}
      <h2 className="text-h2 text-primary">{title}</h2>
      {description && <p className="text-sm text-secondary max-w-2xl">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
  </div>
);
