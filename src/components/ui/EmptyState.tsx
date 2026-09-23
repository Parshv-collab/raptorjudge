import React from "react";
import { GlassCard } from "./GlassCard";
import { Button } from "./Button";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = "",
}) => {
  return (
    <GlassCard className={`flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto my-6 ${className}`}>
      {icon ? (
        <div className="p-4 rounded-2xl bg-[#ff0055]/10 text-[#ff0055] mb-4">
          {icon}
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-black/5 text-[#6e6e73] mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
      )}
      <h3 className="text-base font-bold text-[#1d1d1f] mb-1">{title}</h3>
      <p className="text-xs text-[#6e6e73] max-w-xs mb-6 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <Button variant="primary" size="md" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </GlassCard>
  );
};
