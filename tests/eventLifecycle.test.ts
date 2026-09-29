import { describe, expect, it } from "vitest";
import {
  EVENT_STAGES,
  allowedStageTargets,
  evaluateDeadlineChange,
  evaluateStageTransition,
  isResultsFinal,
} from "../src/lib/eventLifecycle";

/**
 * The event lifecycle policy.
 *
 * These are the rules `events.setStage`, `events.publish`, `events.unpublish`
 * and `events.adminUnpublish` all funnel through, and the same evaluator the
 * organizer console builds its stage picker from — so a case proven here is
 * proven for the server and the UI at once.
 */

const ORGANIZER = "organizer";
const ADMIN = "admin";

/** Short helper: is this transition allowed, and does the reason mention X? */
function transition(from: string, to: string, role: string) {
  return evaluateStageTransition({ from, to, actorRole: role });
}

describe("forwards progress is always available", () => {
  it("lets an organizer step a draft through the whole lifecycle", () => {
    for (let i = 0; i < EVENT_STAGES.length - 1; i++) {
      const from = EVENT_STAGES[i];
      const to = EVENT_STAGES[i + 1];
      expect(transition(from, to, ORGANIZER).allowed, `${from} → ${to}`).toBe(true);
    }
  });

  it("lets an organizer skip ahead rather than forcing every stop", () => {
    // A small hackathon that collects submissions outside the app, or a team
    // event with no community vote, is still a legitimate event.
    expect(transition("registration", "judging", ORGANIZER).allowed).toBe(true);
    expect(transition("hacking", "published", ORGANIZER).allowed).toBe(true);
  });

  it("treats asking for the current stage as a no-op", () => {
    for (const stage of EVENT_STAGES) {
      expect(transition(stage, stage, ORGANIZER).allowed, stage).toBe(true);
    }
  });
});

describe("published results are final", () => {
  it("refuses every backwards move out of published, for organizers", () => {
    for (const to of ["draft", "registration", "hacking", "judging", "voting"]) {
      const decision = transition("published", to, ORGANIZER);
      expect(decision.allowed, `published → ${to}`).toBe(false);
      // The refusal has to tell the user where the recovery path is.
      expect(decision.reason).toMatch(/administrator|admin/i);
    }
  });

  it("refuses them for admins too — retraction is a separate, audited action", () => {
    // The point of the rule is that *no* stage write can silently walk results
    // back. An admin who means it uses `events.adminUnpublish`, which demands a
    // written reason and records it.
    for (const to of ["draft", "registration", "hacking", "judging", "voting"]) {
      expect(transition("published", to, ADMIN).allowed, `published → ${to}`).toBe(false);
    }
  });

  it("refuses to un-archive, and to revive an archived event", () => {
    expect(transition("archived", "published", ADMIN).allowed).toBe(false);
    expect(transition("archived", "voting", ORGANIZER).allowed).toBe(false);
  });

  it("still allows the two forward moves — publishing, then archiving", () => {
    expect(transition("voting", "published", ORGANIZER).allowed).toBe(true);
    expect(transition("published", "archived", ORGANIZER).allowed).toBe(true);
  });

  it("knows which stages count as final", () => {
    expect(EVENT_STAGES.filter(isResultsFinal)).toEqual(["published", "archived"]);
  });
});

describe("backwards, before publication", () => {
  it("lets an organizer step back exactly one phase", () => {
    expect(transition("voting", "judging", ORGANIZER).allowed).toBe(true);
    expect(transition("judging", "hacking", ORGANIZER).allowed).toBe(true);
    expect(transition("hacking", "registration", ORGANIZER).allowed).toBe(true);
    // The classic unpublish: the event has been announced but nobody has
    // started working, so taking it down costs nothing.
    expect(transition("registration", "draft", ORGANIZER).allowed).toBe(true);
  });

  it("refuses to unwind two or more phases", () => {
    // Reopening registration while a judging week is under way would re-open a
    // gate people have already passed through.
    const decision = transition("voting", "registration", ORGANIZER);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/one phase at a time/i);
    expect(transition("hacking", "draft", ORGANIZER).allowed).toBe(false);
    expect(transition("judging", "draft", ORGANIZER).allowed).toBe(false);
  });

  it("gives admins unlimited backwards movement — they are the recovery path", () => {
    expect(transition("voting", "registration", ADMIN).allowed).toBe(true);
    expect(transition("judging", "draft", ADMIN).allowed).toBe(true);
  });
});

describe("unknown input", () => {
  it("refuses a stage this build does not know", () => {
    expect(transition("voting", "frozen", ORGANIZER).allowed).toBe(false);
    expect(transition("voting", "frozen", ADMIN).allowed).toBe(false);
  });

  it("lets only an admin normalise an event sitting in an unknown stage", () => {
    expect(transition("legacy_stage", "voting", ORGANIZER).allowed).toBe(false);
    expect(transition("legacy_stage", "voting", ADMIN).allowed).toBe(true);
  });

  it("treats a missing role as unprivileged", () => {
    expect(transition("published", "voting", undefined as never).allowed).toBe(false);
  });
});

describe("allowedStageTargets matches the evaluator", () => {
  it("offers only what the server would accept", () => {
    for (const stage of EVENT_STAGES) {
      for (const role of [ORGANIZER, ADMIN]) {
        const targets = allowedStageTargets(stage, role);
        for (const target of targets) {
          expect(
            evaluateStageTransition({ from: stage, to: target, actorRole: role }).allowed,
            `${stage} → ${target} (${role})`,
          ).toBe(true);
        }
        // Nothing legal is missing from the list, and the current stage is not
        // in it (there is nothing to do).
        expect(targets).not.toContain(stage);
      }
    }
  });

  it("offers exactly one way on from a published event", () => {
    expect(allowedStageTargets("published", ORGANIZER)).toEqual(["archived"]);
    expect(allowedStageTargets("published", ADMIN)).toEqual(["archived"]);
  });

  it("offers the one-step-back unpublish on a registration-stage event", () => {
    expect(allowedStageTargets("registration", ORGANIZER)).toContain("draft");
    expect(allowedStageTargets("hacking", ORGANIZER)).not.toContain("draft");
  });
});

describe("deadline edits are asymmetric", () => {
  const day = 86_400_000;

  it("allows extending a submission deadline after work has been submitted", () => {
    expect(
      evaluateDeadlineChange({
        submissionDeadlineBefore: 10 * day,
        submissionDeadlineAfter: 12 * day,
        hasSubmissions: true,
        hasTeams: true,
      }).allowed,
    ).toBe(true);
  });

  it("refuses to shorten the submission deadline once projects exist", () => {
    const decision = evaluateDeadlineChange({
      submissionDeadlineBefore: 10 * day,
      submissionDeadlineAfter: 9 * day,
      hasSubmissions: true,
      hasTeams: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/submitted/i);
  });

  it("refuses to close registration earlier once teams have registered", () => {
    const decision = evaluateDeadlineChange({
      registrationClosesBefore: 5 * day,
      registrationClosesAfter: 3 * day,
      hasTeams: true,
      hasSubmissions: false,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/registered/i);
  });

  it("leaves an untouched event alone — shortening is harmless before anyone joins", () => {
    expect(
      evaluateDeadlineChange({
        registrationClosesBefore: 5 * day,
        registrationClosesAfter: 3 * day,
        submissionDeadlineBefore: 8 * day,
        submissionDeadlineAfter: 6 * day,
        hasTeams: false,
        hasSubmissions: false,
      }).allowed,
    ).toBe(true);
  });

  it("does not read a missing date as a shortening", () => {
    expect(
      evaluateDeadlineChange({
        submissionDeadlineBefore: 10 * day,
        submissionDeadlineAfter: undefined,
        hasSubmissions: true,
        hasTeams: true,
      }).allowed,
    ).toBe(true);
  });
});
