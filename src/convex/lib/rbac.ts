import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import type { Role } from "./common";

/**
 * Role-change policy (security item 57).
 *
 * Two abuses this closes:
 *
 *  1. **Privilege escalation.** `users.setRole` was reachable by organizers and
 *     the REST role-switch bridge let *any* authenticated caller patch *any*
 *     user's role — including themselves to `admin`. Granting `admin` is now
 *     admin-only, and changing your own role is admin-only too.
 *  2. **Mid-event role switching.** A participant with a team (or a judge with
 *     live assignments) flipping roles mid-event undermines judging integrity,
 *     so role changes are refused while the account is committed to an event.
 *
 * The decision itself is a pure function so the policy is unit-testable; the
 * Convex-specific gathering of facts lives in {@link assertRoleChangeAllowed}.
 */

export interface RoleChangeContext {
  /** Role of the person performing the change. */
  actorRole: string;
  /** Role currently stored on the target (undefined = fresh sign-up). */
  currentRole: string | undefined;
  /** Role being requested. */
  nextRole: string;
  /** Does the target belong to a team in any event? */
  isTeamMember: boolean;
  /** Does the target have judging assignments? */
  hasJudgeWork: boolean;
}

export interface RoleChangeDecision {
  allowed: boolean;
  reason?: string;
}

const VALID_ROLES: string[] = ["participant", "judge", "organizer", "admin"];

export function evaluateRoleChange(context: RoleChangeContext): RoleChangeDecision {
  const { actorRole, currentRole, nextRole, isTeamMember, hasJudgeWork } = context;

  if (!VALID_ROLES.includes(nextRole)) {
    return { allowed: false, reason: `Unknown role: ${nextRole}` };
  }

  // No-op changes are always fine (idempotent organizers).
  if (currentRole === nextRole) return { allowed: true };

  // Only an admin may mint another admin, and only an admin may hand out
  // elevated roles to themselves.
  if (nextRole === "admin" && actorRole !== "admin") {
    return { allowed: false, reason: "Only an admin can grant the admin role" };
  }

  // Privileged roles are admin-granted only; organizers may manage
  // participants/judges within their event.
  if ((nextRole === "organizer" || nextRole === "judge") && actorRole === "participant") {
    return { allowed: false, reason: "Participants cannot grant roles" };
  }

  const targetIsElevated = currentRole === "admin";

  // An enrolled participant is committed to their event: switching them to a
  // staff role mid-event would let them judge or vote on their own work.
  if (isTeamMember && (nextRole === "judge" || nextRole === "organizer" || nextRole === "admin")) {
    return {
      allowed: false,
      reason: "This account is registered on a team — roles cannot change mid-event",
    };
  }

  // A judge with live assignments must be unassigned before changing roles,
  // otherwise scores would be attributed to the wrong role.
  if (hasJudgeWork && nextRole !== "judge") {
    return {
      allowed: false,
      reason: "This judge has assignments in an event — clear them before changing roles",
    };
  }

  // Demoting a seeded admin (the recovery account) requires the actor to be an
  // admin — enforced above — and is otherwise allowed.
  if (targetIsElevated && actorRole !== "admin") {
    return { allowed: false, reason: "Only an admin can change an admin's role" };
  }

  return { allowed: true };
}

/** Gather the facts {@link evaluateRoleChange} needs for a target user. */
export async function gatherRoleChangeContext(
  ctx: MutationCtx,
  targetUserId: Id<"users">,
): Promise<{ isTeamMember: boolean; hasJudgeWork: boolean }> {
  const memberships = await ctx.db
    .query("teamMembers")
    .withIndex("by_user", (q) => q.eq("userId", targetUserId))
    .collect();
  const assignments = await ctx.db
    .query("judgeAssignments")
    .withIndex("by_judge", (q) => q.eq("judgeId", targetUserId))
    .collect();
  return { isTeamMember: memberships.length > 0, hasJudgeWork: assignments.length > 0 };
}

/**
 * Throwing wrapper used by every role-change entry point (the Convex mutation
 * and the REST bridge). Keeping both on the same path is the point: the REST
 * route previously bypassed the policy entirely.
 */
export async function assertRoleChangeAllowed(
  ctx: MutationCtx,
  params: {
    actorRole: string;
    targetUserId: Id<"users">;
    currentRole: string | undefined;
    nextRole: string;
  },
): Promise<void> {
  const facts = await gatherRoleChangeContext(ctx, params.targetUserId);
  const decision = evaluateRoleChange({
    actorRole: params.actorRole,
    currentRole: params.currentRole,
    nextRole: params.nextRole,
    ...facts,
  });
  if (!decision.allowed) throw new Error(decision.reason ?? "Role change refused");
}

/** Exported for the admin UI: which roles the actor may hand out. */
export function assignableRoles(actorRole: string): Role[] {
  switch (actorRole) {
    case "admin":
      return ["participant", "judge", "organizer", "admin"];
    case "organizer":
      return ["participant", "judge", "organizer"];
    default:
      return [];
  }
}
