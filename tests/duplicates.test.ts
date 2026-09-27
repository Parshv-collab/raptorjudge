import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DUPLICATE_REJECT_MESSAGE,
  decideDuplicateWrite,
  findDuplicateMatches,
  normalizeRepositoryUrl,
  normalizeTitle,
  type SubmissionIdentity,
} from "../src/lib/algorithms/duplicates";

const fixtures = JSON.parse(
  readFileSync(join(process.cwd(), "fixtures.json"), "utf8"),
) as {
  projects: {
    id: string;
    team: string;
    track: string;
    title: string;
    summary: string;
    repo_url: string;
    submitted_at: string;
  }[];
};

function fixtureIdentities(): SubmissionIdentity[] {
  // Oldest first, which is the order the Convex layer feeds the detector.
  return [...fixtures.projects]
    .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
    .map((p) => ({
      submissionId: p.id,
      title: p.title,
      repositoryUrl: p.repo_url,
      teamId: p.team,
    }));
}

describe("normalizeTitle", () => {
  it("collapses case, whitespace and punctuation", () => {
    expect(normalizeTitle("  Dry   Harbour! ")).toBe(normalizeTitle("dry harbour"));
    expect(normalizeTitle("A/B — Test")).toBe("abtest");
  });

  it("returns an empty key for an empty title so it never matches", () => {
    expect(normalizeTitle("   ")).toBe("");
  });
});

describe("normalizeRepositoryUrl", () => {
  it("treats clone/HTTPS/ssh URLs for one repository as identical", () => {
    const variants = [
      "https://github.com/acme/project",
      "http://www.github.com/acme/project/",
      "git@github.com:acme/project.git",
      "https://github.com/acme/project.git#readme",
      "https://GitHub.com/acme/project?tab=readme",
    ];
    const keys = new Set(variants.map(normalizeRepositoryUrl));
    expect(keys.size).toBe(1);
  });

  it("returns an empty key for an empty URL", () => {
    expect(normalizeRepositoryUrl("")).toBe("");
  });
});

describe("findDuplicateMatches", () => {
  it("flags prj_41 as a duplicate of prj_07 in the real fixtures (T3.6)", () => {
    const matches = findDuplicateMatches(fixtureIdentities());
    const flagged = matches.find((m) => m.submissionId === "prj_41");

    expect(flagged).toBeDefined();
    expect(flagged?.duplicatesSubmissionId).toBe("prj_07");
    // Same team, same title AND same repository URL in fixtures.json.
    expect(flagged?.kind).toBe("title+repository");
    expect(flagged?.code).toBe("duplicate_title_and_repository");
    expect(flagged?.severity).toBe("duplicate");
    expect(flagged?.reason).toContain("duplicate_title");
    // The original must never be reported as its own duplicate.
    expect(matches.some((m) => m.submissionId === "prj_07")).toBe(false);
  });

  it("treats two projects from one team with one title as duplicates", () => {
    const matches = findDuplicateMatches([
      { submissionId: "a", title: "Dry Harbour", repositoryUrl: "https://x/a", teamId: "t1" },
      { submissionId: "b", title: "dry  harbour!", repositoryUrl: "https://x/b", teamId: "t1" },
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0].code).toBe("duplicate_title");
    expect(matches[0].severity).toBe("duplicate");
    expect(matches[0].duplicatesSubmissionId).toBe("a");
  });

  it("treats two projects from one team on one repository as duplicates", () => {
    const matches = findDuplicateMatches([
      { submissionId: "a", title: "Alpha", repositoryUrl: "https://github.com/acme/one", teamId: "t1" },
      { submissionId: "b", title: "Beta", repositoryUrl: "git@github.com:acme/one.git", teamId: "t1" },
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0].code).toBe("duplicate_repository");
    expect(matches[0].kind).toBe("repository");
  });

  it("does NOT flag the same title filed by two different teams", () => {
    // 15k projects on one event: "dogfood" is a title, not plagiarism.
    const matches = findDuplicateMatches([
      { submissionId: "a", title: "Dogfood", repositoryUrl: "https://x/a", teamId: "t1" },
      { submissionId: "b", title: "dogfood", repositoryUrl: "https://x/b", teamId: "t2" },
      { submissionId: "c", title: "Dog Food", repositoryUrl: "https://x/c", teamId: "t3" },
    ]);
    expect(matches).toHaveLength(0);
  });

  it("flags a repository shared across teams as review-only, not a duplicate", () => {
    const matches = findDuplicateMatches([
      { submissionId: "a", title: "Alpha", repositoryUrl: "https://github.com/acme/shared", teamId: "t1" },
      { submissionId: "b", title: "Beta", repositoryUrl: "https://github.com/acme/shared", teamId: "t2" },
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0].code).toBe("duplicate_repo_url_cross_team");
    expect(matches[0].severity).toBe("review");
    expect(matches[0].kind).toBe("cross_team_repository");
    expect(matches[0].reason).toContain("duplicate_repo_url_cross_team");
  });

  it("reports one match per redundant submission in a same-team group", () => {
    const group: SubmissionIdentity[] = [
      { submissionId: "a", title: "Dry Harbour", repositoryUrl: "https://x/y", teamId: "t1" },
      { submissionId: "b", title: "dry-harbour", repositoryUrl: "https://x/z", teamId: "t1" },
      { submissionId: "c", title: "Dry Harbour!", repositoryUrl: "https://x/w", teamId: "t1" },
    ];
    const matches = findDuplicateMatches(group);
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.submissionId)).toEqual(["b", "c"]);
    expect(matches.every((m) => m.duplicatesSubmissionId === "a")).toBe(true);
  });

  it("does not flag blank titles or blank URLs as duplicates of each other", () => {
    const matches = findDuplicateMatches([
      { submissionId: "a", title: "", repositoryUrl: "", teamId: "t1" },
      { submissionId: "b", title: "", repositoryUrl: "", teamId: "t1" },
    ]);
    expect(matches).toHaveLength(0);
  });

  it("finds exactly one duplicate pair across the whole fixture set", () => {
    const matches = findDuplicateMatches(fixtureIdentities());
    expect(matches).toHaveLength(1);
    expect(matches.filter((m) => m.severity === "review")).toHaveLength(0);
  });
});

describe("decideDuplicateWrite (issue 18 write-path rules)", () => {
  it("rejects a 3-of-3 match (team + title + repo)", () => {
    const decision = decideDuplicateWrite(
      { title: "Dry Harbour", repositoryUrl: "https://github.com/acme/one" },
      { title: "dry harbour", repositoryUrl: "https://github.com/acme/one/" },
    );
    expect(decision).toEqual({ action: "reject", code: "duplicate_title_and_repository" });
  });

  it("flags a 2-of-3 match on title only", () => {
    const decision = decideDuplicateWrite(
      { title: "Dry Harbour", repositoryUrl: "https://github.com/acme/other" },
      { title: "Dry  Harbour!", repositoryUrl: "https://github.com/acme/one" },
    );
    expect(decision).toEqual({ action: "flag", code: "duplicate_title" });
  });

  it("flags a 2-of-3 match on repository only", () => {
    const decision = decideDuplicateWrite(
      { title: "Different Name", repositoryUrl: "git@github.com:acme/one.git" },
      { title: "Dry Harbour", repositoryUrl: "https://github.com/acme/one" },
    );
    expect(decision).toEqual({ action: "flag", code: "duplicate_repository" });
  });

  it("allows a team-only match (1 of 3)", () => {
    const decision = decideDuplicateWrite(
      { title: "Fresh Idea", repositoryUrl: "https://github.com/acme/new" },
      { title: "Dry Harbour", repositoryUrl: "https://github.com/acme/one" },
    );
    expect(decision).toEqual({ action: "allow" });
  });

  it("never matches on blank titles or blank URLs", () => {
    const decision = decideDuplicateWrite(
      { title: "", repositoryUrl: "" },
      { title: "", repositoryUrl: "" },
    );
    expect(decision).toEqual({ action: "allow" });
  });

  it("exposes a stable user-facing reject message", () => {
    expect(DUPLICATE_REJECT_MESSAGE).toBe("This project is already submitted by your team.");
  });
});
