/**
 * Single source of truth for "where does this role live".
 *
 * Used by the sign-in redirect, the route guards and the shell's wordmark link
 * so a role can never land on another role's console (or back on the marketing
 * page) because two files disagreed about the mapping.
 */
export type AppRole = "admin" | "organizer" | "judge" | "participant";

export const ROLE_HOME: Record<AppRole, string> = {
  admin: "/admin",
  organizer: "/organizer",
  judge: "/judge",
  participant: "/dashboard",
};

/** Home path for a role, or `null` when the role is unknown/missing. */
export function roleHomePath(role?: string | null): string | null {
  if (!role) return null;
  return ROLE_HOME[role as AppRole] ?? null;
}

/** Human label for a role, used in nav + badges. */
export function roleLabel(role?: string | null): string {
  return role || "unassigned";
}
