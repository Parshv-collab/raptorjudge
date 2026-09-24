import React from "react";
import { GlassCard } from "./GlassCard";

export interface SkeletonCardProps {
  lines?: number;
  className?: string;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({ lines = 3, className = "" }) => {
  return (
    <GlassCard className={`animate-pulse motion-reduce:animate-none space-y-4 ${className}`}>
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

export const SkeletonText: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`h-3.5 bg-black/10 rounded-md animate-pulse motion-reduce:animate-none ${className}`} />
);

export const SkeletonHeading: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`h-7 bg-black/10 rounded-md animate-pulse motion-reduce:animate-none ${className}`} />
);

export const SkeletonStat: React.FC<{ className?: string }> = ({ className = "" }) => (
  <GlassCard className={`animate-pulse motion-reduce:animate-none p-5 flex flex-col gap-2 ${className}`}>
    <div className="h-3 bg-black/10 rounded-md w-1/2" />
    <div className="h-8 bg-black/10 rounded-md w-3/4" />
  </GlassCard>
);

export const SkeletonTable: React.FC<{ rows?: number; className?: string }> = ({ rows = 5, className = "" }) => (
  <GlassCard className={`animate-pulse motion-reduce:animate-none p-6 space-y-3 ${className}`}>
    <div className="h-5 bg-black/10 rounded-md w-1/4 mb-4" />
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-10 bg-black/5 rounded-md w-full" />
    ))}
  </GlassCard>
);
