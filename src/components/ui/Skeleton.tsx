import React from "react";

export interface SkeletonProps {
  className?: string;
}

/** Shimmer block — compose freely to match the shape of the content it replaces. */
export const Skeleton: React.FC<SkeletonProps> = ({ className = "" }) => (
  <div className={`skeleton rounded-btn motion-reduce:animate-none ${className}`} aria-hidden="true" />
);

/** Generic card skeleton (heading + lines + footer action). */
export const SkeletonCard: React.FC<{ lines?: number; className?: string }> = ({
  lines = 3,
  className = "",
}) => (
  <div className={`border border-line rounded-card bg-surface-1 p-6 space-y-4 ${className}`}>
    <Skeleton className="h-6 w-2/3" />
    <div className="space-y-2.5">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3.5 ${i === lines - 1 ? "w-2/5" : "w-full"}`} />
      ))}
    </div>
    <div className="flex items-center justify-between pt-2">
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-3.5 w-12" />
    </div>
  </div>
);

export const SkeletonText: React.FC<{ className?: string }> = ({ className = "" }) => (
  <Skeleton className={`h-3.5 ${className}`} />
);

export const SkeletonHeading: React.FC<{ className?: string }> = ({ className = "" }) => (
  <Skeleton className={`h-7 ${className}`} />
);

export const SkeletonStat: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`border border-line rounded-card bg-surface-1 p-5 flex flex-col gap-2 ${className}`}>
    <Skeleton className="h-3 w-1/2" />
    <Skeleton className="h-8 w-3/4" />
  </div>
);

export const SkeletonTable: React.FC<{ rows?: number; className?: string }> = ({ rows = 5, className = "" }) => (
  <div className={`border border-line rounded-card bg-surface-1 p-6 space-y-3 ${className}`}>
    <Skeleton className="h-5 w-1/4 mb-4" />
    {Array.from({ length: rows }).map((_, i) => (
      <Skeleton key={i} className="h-10 w-full" />
    ))}
  </div>
);
