import React from "react";
import { GlassCard } from "./GlassCard";

export interface SkeletonCardProps {
  lines?: number;
  className?: string;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({ lines = 3, className = "" }) => {
  return (
    <GlassCard className={`animate-pulse space-y-4 ${className}`}>
      <div className="h-6 bg-black/10 rounded-md w-2/3"></div>
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-3.5 bg-black/5 rounded-md"
            style={{ width: i === lines - 1 ? "40%" : "100%" }}
          ></div>
        ))}
      </div>
      <div className="pt-2 flex justify-between items-center">
        <div className="h-8 bg-black/10 rounded-button w-24"></div>
        <div className="h-4 bg-black/5 rounded-full w-12"></div>
      </div>
    </GlassCard>
  );
};
