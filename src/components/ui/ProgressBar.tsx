import React from "react";

export interface ProgressBarProps {
  value: number;
  max?: number;
  showLabel?: boolean;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  showLabel = false,
  label,
  size = "md",
  className = "",
}) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const heightClasses = {
    sm: "h-1",
    md: "h-2",
  };

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`}>
      {(showLabel || label) && (
        <div className="flex justify-between items-center text-[13px] text-secondary">
          <span>{label ?? "Progress"}</span>
          <span className="tnum">{Math.round(percentage)}%</span>
        </div>
      )}
      {/* `label` is rendered visually above the bar; the same string names the
          progressbar itself, which would otherwise be an unnamed 0–8 gauge. */}
      <div
        className={`w-full bg-surface-2 rounded-pill overflow-hidden border border-line ${heightClasses[size]}`}
        role="progressbar"
        aria-label={label ?? "Progress"}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className="bg-accent h-full rounded-pill transition-[width] duration-state ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
