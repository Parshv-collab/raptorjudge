import React, { forwardRef } from "react";

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverEffect?: boolean;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className = "", hoverEffect = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`
          glass-panel rounded-card p-6 transition-all duration-200
          ${hoverEffect ? "hover:-translate-y-1 hover:shadow-glass-hover hover:border-white/90" : ""}
          ${className}
        `}
        {...props}
      >
        {children}
      </div>
    );
  }
);

GlassCard.displayName = "GlassCard";
