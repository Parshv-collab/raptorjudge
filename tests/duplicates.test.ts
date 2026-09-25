import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
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
    // Same title AND same repository URL in fixtures.json.
    expect(flagged?.kind).toBe("title+repository");
    // The original must never be reported as its own duplicate.
    expect(matches.some((m) => m.submissionId === "prj_07")).toBe(false);
  });

  it("reports one match per redundant submission in a three-way group", () => {
    const group: SubmissionIdentity[] = [
      { submissionId: "a", title: "Dry Harbour", repositoryUrl: "https://x/y", teamId: "t1" },
      { submissionId: "b", title: "dry-harbour", repositoryUrl: "https://x/z", teamId: "t2" },
      { submissionId: "c", title: "Unrelated", repositoryUrl: "https://x/y", teamId: "t3" },
    ];
    const matches = findDuplicateMatches(group);
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.submissionId).sort()).toEqual(["b", "c"]);
    expect(matches.every((m) => m.duplicatesSubmissionId === "a")).toBe(true);
  });

  it("distinguishes a title-only match from a repository-only match", () => {
    const matches = findDuplicateMatches([
      { submissionId: "a", title: "Glass Signal", repositoryUrl: "https://x/a", teamId: "t1" },
      { submissionId: "b", title: "Glass Signal", repositoryUrl: "https://x/b", teamId: "t2" },
      { submissionId: "c", title: "Other", repositoryUrl: "https://x/a", teamId: "t3" },
    ]);
    expect(matches.find((m) => m.submissionId === "b")?.kind).toBe("title");
    expect(matches.find((m) => m.submissionId === "c")?.kind).toBe("repository");
  });

  it("does not flag blank titles or blank URLs as duplicates of each other", () => {
    const matches = findDuplicateMatches([
      { submissionId: "a", title: "", repositoryUrl: "", teamId: "t1" },
      { submissionId: "b", title: "", repositoryUrl: "", teamId: "t2" },
    ]);
    expect(matches).toHaveLength(0);
  });

  it("finds exactly one duplicate pair across the whole fixture set", () => {
    const matches = findDuplicateMatches(fixtureIdentities());
    expect(matches).toHaveLength(1);
  });
});
