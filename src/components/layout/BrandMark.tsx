import type React from "react";
import type { Branding } from "@/lib/branding";

/**
 * The logo tile: the configured `logo_url` when it loads, otherwise the first
 * letter of the configured site name.
 *
 * It is rendered at four sites — the app shell's public header, its mobile top
 * bar, its desktop rail, and the `MinimalLayout` header that `/auth` and
 * `/invite/:token` use — so the "no logo configured, or the URL 404s" rule
 * lives here once instead of being re-typed at each one. `logoBroken` is owned
 * by the caller, which resets it when `branding.logoUrl` changes so a corrected
 * URL is retried rather than staying permanently suppressed.
 */
const BrandMark: React.FC<{
  branding: Branding;
  logoBroken: boolean;
  onLogoError: () => void;
  size: "sm" | "md" | "lg";
  /** Extra classes for placements that also pin the tile from shrinking. */
  className?: string;
}> = ({ branding, logoBroken, onLogoError, size, className = "" }) => {
  const tile = {
    sm: "w-6 h-6 text-[11px]",
    md: "w-7 h-7 text-[13px]",
    /** The sign-in card, where the mark is the page's single focal point. */
    lg: "w-9 h-9 text-[15px]",
  }[size];
  if (branding.logoUrl && !logoBroken) {
    return (
      <img
        src={branding.logoUrl}
        alt={`${branding.siteName} logo`}
        className={`${tile} rounded-btn object-cover ${className}`}
        onError={onLogoError}
      />
    );
  }
  return (
    <span
      className={`${tile} rounded-btn bg-accent text-white flex items-center justify-center font-bold ${className}`}
    >
      {branding.siteName.trim().charAt(0).toUpperCase() || "R"}
    </span>
  );
};

export default BrandMark;
