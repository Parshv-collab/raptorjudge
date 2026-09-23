import React from "react";
import { GlassCard } from "./GlassCard";

export interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: React.ReactNode;
  trend?: { value: string; positive: boolean };
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtext,
  icon,
  trend,
  className = "",
}) => {
  return (
    <GlassCard className={`flex flex-col justify-between ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#6e6e73]">
          {label}
        </span>
        {icon && <div className="p-2 rounded-xl bg-white/60 text-[#ff0055]">{icon}</div>}
      </div>
      <div className="mt-3">
        <div className="text-3xl font-extrabold tracking-tight text-[#1d1d1f]">
          {value}
        </div>
        {(subtext || trend) && (
          <div className="mt-1.5 flex items-center gap-2 text-xs font-medium">
            {trend && (
              <span className={trend.positive ? "text-emerald-600" : "text-[#e63946]"}>
                {trend.positive ? "↑" : "↓"} {trend.value}
              </span>
            )}
            {subtext && <span className="text-[#6e6e73]">{subtext}</span>}
          </div>
        )}
      </div>
    </GlassCard>
  );
};
