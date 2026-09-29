import React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "accent";
}

const variantStyles: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-surface-2 text-secondary border-line",
  success: "bg-success/10 text-success border-success/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  danger: "bg-danger/10 text-danger border-danger/30",
  accent: "bg-accent/10 text-accent border-accent/30",
};

export const Badge: React.FC<BadgeProps> = ({ variant = "default", className = "", children, ...props }) => {
  return (
    <span
      className={`
        inline-flex items-center rounded-pill border px-2.5 py-0.5
        text-[11px] font-medium uppercase tracking-[0.05em] leading-5
        ${variantStyles[variant]}
        ${className}
      `}
      {...props}
    >
      {children}
    </span>
  );
};
