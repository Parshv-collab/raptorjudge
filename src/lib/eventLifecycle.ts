/**
 * Event lifecycle policy — the pure half of "who may move an event where".
 *
 * The seven stages are a line, not a menu:
 *
 *     draft → registration → hacking → judging → voting → published → archived
 *
 * Two rules fall out of walking that line with a user's eye rather than a
 * developer's:
 *
 *  1. **Announcing a winner is not reversible by the person who announced it.**
 *     `published` is the point where the public gallery re-sorts by the final
 *     ranking and the winner badge goes live. Nobody announces a winner and
 *     then quietly retracts it, so no backwards move out of `published` or
 *     `archived` is offered to an organizer *or* an admin here. A genuine
 *     mistake (wrong rubric, half the scores missing) is recovered through
 *     `events.adminUnpublish`, which is admin-only, demands a written reason and
 *     lands in the audit chain.
 *
 *  2. **Correcting the phase you are standing in is normal; unwinding the whole
 *     event is not.** An organizer may move forwards freely, and may step back
 *     exactly one phase — fixing a scoring mistake during voting means
 *     `voting → judging`. Reopening registration two phases back, to a point
 *     people have already acted on, is refused and says why. Admins may move
 *     backwards without limit (they are the recovery path).
 *
 * Date edits get the same treatment: extending a deadline is friendly and
 * always allowed, shortening one that people have already worked to is not
 * (see {@link evaluateDeadlineChange}).
 *
 * Everything here is a pure function so the policy is unit-tested directly
 * (`tests/eventLifecycle.test.ts`) and the Convex mutations and the console UI
 * cannot drift apart: the UI builds its stage picker from
 * {@link allowedStageTargets}, which calls the same evaluator the server does.
 */

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

/** Position on the lifecycle line; higher is later. */
const STAGE_ORDER: Record<EventStage, number> = {
  draft: 0,
  registration: 1,
  hacking: 2,
  judging: 3,
  voting: 4,
  published: 5,
  archived: 6,
};

/** Labels shared by the console UI and the refusal messages. */
export const STAGE_LABELS: Record<EventStage, string> = {
  draft: "Draft",
  registration: "Registration open",
  hacking: "Hacking",
  judging: "Judging",
  voting: "Community voting",
  published: "Results published",
  archived: "Archived",
};

/** Stages whose results are public, and therefore final. */
export const RESULTS_FINAL_STAGES: readonly EventStage[] = ["published", "archived"];

export function isEventStage(value: string): value is EventStage {
  return (EVENT_STAGES as readonly string[]).includes(value);
}

/** True once the results are public (published or archived). */
export function isResultsFinal(stage: string): boolean {
  return (RESULTS_FINAL_STAGES as readonly string[]).includes(stage);
}

export interface StageTransitionQuery {
  /** The stage the event is in now. */
  from: string;
  /** The stage being requested. */
  to: string;
  /**
   * `organizer` or `admin`. Admins inherit organizer rights and add recovery.
   * Optional because a user doc can carry no role at all; anything other than
   * `admin` is treated as "not an admin".
   */
  actorRole?: string;
}

export interface PolicyDecision {
  allowed: boolean;
  /** Why it was refused, phrased for the user who tried it. */
  reason?: string;
}

/** Shown wherever a retraction is refused, pointing at the recovery path. */
export const RETRACT_HINT =
  "Results are published and final. An administrator can retract them from the admin events console, which records a reason in the audit log.";

export function evaluateStageTransition({ from, to, actorRole }: StageTransitionQuery): PolicyDecision {
  if (!isEventStage(to)) {
    return { allowed: false, reason: `"${to}" is not a stage this build knows about.` };
  }
  if (to === from) return { allowed: true };

  if (!isEventStage(from)) {
    // Data written by another build. An admin may normalise it; nobody else.
    return actorRole === "admin"
      ? { allowed: true }
      : {
          allowed: false,
          reason: `This event is in an unrecognised stage ("${from}"). An administrator can move it.`,
        };
  }

  const forward = STAGE_ORDER[to] > STAGE_ORDER[from];

  // Rule 1: once the results are out they are not walked back — not even by an
  // admin, who has `adminUnpublish` for the deliberate, audited case.
  if (isResultsFinal(from) && !forward) {
    return { allowed: false, reason: RETRACT_HINT };
  }

  // Rule 2a: forwards, including skips. The publication gate
  // (`assertPublishReady`) is what protects the transition that matters.
  if (forward) return { allowed: true };

  // Rule 2b: backwards, before the results are public. Admins may go anywhere.
  if (actorRole === "admin") return { allowed: true };

  const distance = STAGE_ORDER[from] - STAGE_ORDER[to];
  if (distance === 1) return { allowed: true };

  const previous = EVENT_STAGES[STAGE_ORDER[from] - 1];
  return {
    allowed: false,
    reason: `${STAGE_LABELS[to]} is ${distance} phases behind ${STAGE_LABELS[from]}. Step back one phase at a time (${STAGE_LABELS[previous]}), or ask an administrator.`,
  };
}

/**
 * Every stage `actorRole` may move an event out of `from` into, in lifecycle
 * order. The console builds its stage picker from this so a listed option can
 * never be one the server would refuse.
 */
export function allowedStageTargets(from: string, actorRole?: string): EventStage[] {
  return EVENT_STAGES.filter(
    (stage) => stage !== from && evaluateStageTransition({ from, to: stage, actorRole }).allowed,
  );
}

export interface DeadlineChangeQuery {
  registrationClosesBefore?: number | null;
  registrationClosesAfter?: number | null;
  submissionDeadlineBefore?: number | null;
  submissionDeadlineAfter?: number | null;
  /** Does the event already have teams? */
  hasTeams: boolean;
  /** Does the event already have submitted projects? */
  hasSubmissions: boolean;
}

/** True when both timestamps exist and the second is earlier than the first. */
function shortened(before?: number | null, after?: number | null): boolean {
  const from = typeof before === "number" ? before : null;
  const to = typeof after === "number" ? after : null;
  return from !== null && to !== null && to < from;
}

/**
 * Deadline edits are asymmetric on purpose.
 *
 * Moving a deadline *later* is the friendly direction — an organizer extending
 * a window so a team can finish, or pushing a judging week because a judge is
 * ill. Moving it *earlier* is not: once people have registered or submitted,
 * a shortened deadline retroactively invalidates work they already did, and
 * there is no way for them to find out except by being locked out. So the two
 * shortening cases are refused, and every other edit passes.
 */
export function evaluateDeadlineChange(query: DeadlineChangeQuery): PolicyDecision {
  if (query.hasSubmissions && shortened(query.submissionDeadlineBefore, query.submissionDeadlineAfter)) {
    return {
      allowed: false,
      reason:
        "Projects have already been submitted — the submission deadline can be moved later, but not earlier. Extending is safe; shortening would lock out work that was on time.",
    };
  }
  if (query.hasTeams && shortened(query.registrationClosesBefore, query.registrationClosesAfter)) {
    return {
      allowed: false,
      reason:
        "Teams have already registered — registration can be closed later, but not earlier. Extending is safe; shortening would cut off people who were already in.",
    };
  }
  return { allowed: true };
}
