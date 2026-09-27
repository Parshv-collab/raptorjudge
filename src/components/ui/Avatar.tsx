import React from "react";

export interface AvatarProps {
  src?: string;
  name?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Deterministic tint per name so avatar groups don't read as a single blob. */
const TINTS = [
  "bg-accent/15 text-accent",
  "bg-success/15 text-success",
  "bg-warning/15 text-warning",
  "bg-surface-2 text-secondary",
];

function tintFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return TINTS[Math.abs(hash) % TINTS.length];
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name = "User",
  size = "md",
  className = "",
}) => {
  const getInitials = (n: string) => {
    const parts = n.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "U";
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const sizeClasses = {
    sm: "w-8 h-8 text-[11px] font-semibold",
    md: "w-10 h-10 text-[13px] font-semibold",
    lg: "w-14 h-14 text-base font-semibold",
  };

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`rounded-full object-cover border border-line shrink-0 bg-surface-2 ${sizeClasses[size]} ${className}`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`rounded-full shrink-0 flex items-center justify-center select-none border border-line ${tintFor(name)} ${sizeClasses[size]} ${className}`}
    >
      {getInitials(name)}
    </div>
  );
};
