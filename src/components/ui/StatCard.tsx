import React from "react";

export interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: React.ReactNode;
  href?: string;
  className?: string;
}

/** Stat tile: overline label, large tnum figure, optional icon/href. */
export const StatCard: React.FC<StatCardProps> = ({ label, value, subtext, icon, href, className = "" }) => {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{label}</span>
        {icon && <div className="text-muted [&>svg]:w-4 [&>svg]:h-4">{icon}</div>}
      </div>
      <div className="mt-3 text-[2rem] leading-none font-semibold tracking-[-0.02em] text-primary tnum">
        {value}
      </div>
      {subtext && <div className="mt-2 text-[13px] text-secondary">{subtext}</div>}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        className={`block bg-surface-1 border border-line rounded-card p-6 transition-colors duration-fast hover:border-line-strong ${className}`}
      >
        {body}
      </a>
    );
  }

  return <div className={`bg-surface-1 border border-line rounded-card p-6 ${className}`}>{body}</div>;
};
