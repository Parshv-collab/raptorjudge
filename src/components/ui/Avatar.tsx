import React from "react";

export interface AvatarProps {
  src?: string;
  name?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name = "User",
  size = "md",
  className = "",
}) => {
  const getInitials = (n: string) => {
    const parts = n.trim().split(" ").filter(Boolean);
    if (parts.length === 0) return "U";
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const sizeClasses = {
    sm: "w-8 h-8 text-xs font-semibold",
    md: "w-10 h-10 text-sm font-bold",
    lg: "w-14 h-14 text-lg font-bold",
  };

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`rounded-full object-cover border border-white/80 shadow-sm shrink-0 ${sizeClasses[size]} ${className}`}
      />
    );
  }

  return (
    <div
      className={`
        rounded-full bg-gradient-to-br from-[#ff0055] to-[#ff6699] text-white shrink-0
        flex items-center justify-center border border-white/80 shadow-sm select-none
        ${sizeClasses[size]} ${className}
      `}
    >
      {getInitials(name)}
    </div>
  );
};
