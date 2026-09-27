import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";

/** Roles in ascending privilege order. */
export const ROLES = ["participant", "judge", "organizer", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Event lifecycle stages — linear state machine enforced by mutations. */
export const EVENT_STAGES = [
  "draft",
  "registration",
  "hacking",
  "judging",
  "voting",
  "published",
  "archived",
] as const;
export type EventStage = (typeof EVENT_STAGES)[number];

export function stageAllowsSubmissions(stage: EventStage): boolean {
  return stage === "hacking" || stage === "registration" || stage === "draft";
}

export function stageAllowsJudging(stage: EventStage): boolean {
  return stage === "judging";
}

export function stageAllowsVoting(stage: EventStage): boolean {
  return stage === "voting";
}

/** Vote counts are hidden until results are published (T3 hidden results). */
export function stageAllowsVoteResults(stage: EventStage): boolean {
  return stage === "published";
}

/**
 * Resolve the current user doc (or null) from the Convex Auth identity.
 *
 * Convex Auth's session JWT carries `sub = "<users._id>|<sessionId>"`, so we
 * resolve the primary key with its `getAuthUserId` helper first. The
 * tokenIdentifier / email lookups remain as fallbacks for other providers.
 */
export async function getCurrentUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users"> | null> {
  const authUserId = await getAuthUserId(ctx);
  if (authUserId) {
    const byId = await ctx.db.get(authUserId);
    if (byId) return byId;
  }

  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const byToken = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (byToken) return byToken;
  if (identity.email) {
    const byEmail = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email!))
      .unique();
    if (byEmail) return byEmail;
  }
  return null;
}

export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) throw new Error("Unauthenticated");
  return user;
}

export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  ...roles: Role[]
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  // Unroled users (fresh sign-ups) are participants by default.
  const effectiveRole: Role = user.role ?? "participant";
  if (!roles.includes(effectiveRole)) {
    throw new Error(`Forbidden: requires ${roles.join(" or ")} role`);
  }
  return user;
}

/** Admins can do everything organizers can. */
export async function requireOrganizer(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  return requireRole(ctx, "organizer", "admin");
}

export async function getEventBySlug(ctx: QueryCtx | MutationCtx, slug: string) {
  return ctx.db
    .query("events")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}

export async function requireEvent(ctx: QueryCtx | MutationCtx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  if (!event) throw new Error("Event not found");
  return event;
}

/**
 * Stages after which the event's results are final. Once an event reaches one
 * of these stages every judging-side write (assignments, rubric, scores,
 * pairwise) is rejected: the ranking the public sees must be the ranking the
 * judges produced, so a late edit can never retroactively change it.
 */
const JUDGING_LOCKED_STAGES = ["published", "archived", "closed"];

/**
 * Gate for every mutation that touches judging state (issue 21+25).
 *
 * Throws once the event is published/archived (or terminally closed) — before
 * any write happens. Events still in setup or live stages (draft, registration,
 * hacking, judging, voting) pass, so organizers can prepare assignments and
 * correct scores while the event is running.
 */
export async function assertJudgingOpen(ctx: MutationCtx, eventId: Id<"events">): Promise<Doc<"events">> {
  const event = await ctx.db.get(eventId);
  if (!event) throw new Error("Event not found");
  if (JUDGING_LOCKED_STAGES.includes(event.status)) {
    throw new Error(
      "Judging is locked: this event's results have been published and its scores can no longer change",
    );
  }
  return event;
}

/** Deadline gate for participant submission edits (T1 strict deadline enforcement). */
export async function assertSubmissionWindow(
  _ctx: MutationCtx,
  event: Doc<"events">,
  actorRole: Role,
): Promise<void> {
  const now = Date.now();
  const lateAllowed = (event.settings ?? "").includes("allow_late_submissions");
  if (actorRole === "admin" || actorRole === "organizer") return;
  if (stageAllowsSubmissions(event.status as EventStage) && now <= event.submissionDeadline) return;
  if (lateAllowed && now <= event.votingStart) return;
  throw new Error("Submissions are locked: the deadline has passed");
}

/** Members of a team (with user docs). */
export async function teamMembers(ctx: QueryCtx | MutationCtx, teamId: Id<"teams">) {
  const rows = await ctx.db
    .query("teamMembers")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .collect();
  return rows;
}

/** Parse `max_team_size=4,voting_type=quadratic` style settings string. */
export function parseSettings(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const kv of (s ?? "").split(",")) {
    const [k, v] = kv.split("=");
    if (k && v !== undefined) out[k.trim()] = v.trim();
  }
  return out;
}
