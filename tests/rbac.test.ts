import { describe, it, expect } from "vitest";
import { assignableRoles, evaluateRoleChange } from "../src/convex/lib/rbac";

/**
 * Item 57: a participant must not be able to become an admin, and nobody may
 * change roles mid-event. The escalation this closes was real — the REST
 * role-switch bridge let a caller patch their own row.
 */
const base = {
  actorRole: "organizer",
  currentRole: "participant",
  nextRole: "judge",
  isTeamMember: false,
  hasJudgeWork: false,
};

describe("evaluateRoleChange", () => {
  it("allows an organizer to promote a free participant to judge", () => {
    expect(evaluateRoleChange(base)).toEqual({ allowed: true });
  });

  it("allows for the actor to be an admin", () => {
    expect(evaluateRoleChange({ ...base, actorRole: "admin" })).toEqual({ allowed: true });
  });

  it("refuses to grant admin to anyone but an admin", () => {
    const decision = evaluateRoleChange({ ...base, nextRole: "admin" });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/Only an admin/);
  });

  it("allows an admin to grant admin", () => {
    expect(evaluateRoleChange({ ...base, actorRole: "admin", nextRole: "admin" })).toEqual({
      allowed: true,
    });
  });

  it("refuses self-promotion from a participant", () => {
    const decision = evaluateRoleChange({
      ...base,
      actorRole: "participant",
      currentRole: "participant",
      nextRole: "admin",
    });
    expect(decision.allowed).toBe(false);
  });

  it("refuses participants granting any role", () => {
    for (const nextRole of ["judge", "organizer", "admin"]) {
      const decision = evaluateRoleChange({ ...base, actorRole: "participant", nextRole });
      expect(decision.allowed).toBe(false);
    }
  });

  it("refuses a role change while the account is on a team (mid-event)", () => {
    const decision = evaluateRoleChange({ ...base, isTeamMember: true, nextRole: "judge" });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/cannot change mid-event/);
  });

  it("refuses changing a judge with live assignments to another role", () => {
    const decision = evaluateRoleChange({
      ...base,
      currentRole: "judge",
      nextRole: "participant",
      hasJudgeWork: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/assignments/);
  });

  it("allows demoting a judge once their assignments are cleared", () => {
    expect(
      evaluateRoleChange({
        ...base,
        currentRole: "judge",
        nextRole: "participant",
        hasJudgeWork: false,
      }),
    ).toEqual({ allowed: true });
  });

  it("treats a no-op change as allowed (idempotent)", () => {
    expect(
      evaluateRoleChange({ ...base, currentRole: "judge", nextRole: "judge", isTeamMember: true }),
    ).toEqual({ allowed: true });
  });

  it("refuses unknown roles", () => {
    const decision = evaluateRoleChange({ ...base, nextRole: "root" });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/Unknown role/);
  });

  it("refuses non-admins touching an admin account", () => {
    const decision = evaluateRoleChange({
      ...base,
      currentRole: "admin",
      nextRole: "participant",
    });
    expect(decision.allowed).toBe(false);
  });

  it("never allows a participant to escalate to judge through any path", () => {
    const escalationPaths = [
      { actorRole: "participant", currentRole: "participant", nextRole: "judge" },
      { actorRole: "participant", currentRole: "participant", nextRole: "organizer" },
      { actorRole: "participant", currentRole: "participant", nextRole: "admin" },
    ];
    for (const path of escalationPaths) {
      expect(evaluateRoleChange({ ...base, ...path, isTeamMember: false, hasJudgeWork: false }).allowed).toBe(
        false,
      );
    }
  });
});

describe("assignableRoles", () => {
  it("gives admins everything and organisers the working set", () => {
    expect(assignableRoles("admin")).toEqual(["participant", "judge", "organizer", "admin"]);
    expect(assignableRoles("organizer")).toEqual(["participant", "judge", "organizer"]);
    expect(assignableRoles("judge")).toEqual([]);
    expect(assignableRoles("participant")).toEqual([]);
  });
});
