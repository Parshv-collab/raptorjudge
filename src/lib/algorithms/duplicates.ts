/**
 * Duplicate submission detection (T3.6).
 *
 * A hackathon needs to catch the same project filed twice — a team re-submitting
 * under two names, or a solo entrant duplicating a teammate's entry — **without**
 * drowning organizers in false positives. On a 15,000-project event, matching on
 * title alone across every team flags every "dogfood" or "untitled" entry, so the
 * rule is team-scoped:
 *
 *   | situation                              | outcome                                    |
 *   |----------------------------------------|--------------------------------------------|
 *   | same team, same normalized title       | duplicate (`duplicate_title`)              |
 *   | same team, same repository URL         | duplicate (`duplicate_repository`)         |
 *   | same team, both                        | duplicate (`duplicate_title_and_repository`)|
 *   | different team, suspicious repo URL    | review only (`duplicate_repo_url_cross_team`)|
 *   | different team, same title             | not reported                               |
 *
 * The comparison is deliberately pure and dependency-free so it is unit-testable
 * (`tests/duplicates.test.ts`) and reusable from the Convex layer
 * (`submissions.checkDuplicates`) and from the acceptance suite.
 *
 * AGENTS.md/fixtures.json: `prj_07` and `prj_41` are both titled "Dry Harbour",
 * share a `repo_url` **and** a team, so the detector must report `prj_41` as a
 * duplicate of `prj_07`.
 */

export interface SubmissionIdentity {
  submissionId: string;
  title: string;
  repositoryUrl: string;
  teamId: string;
  teamName?: string;
}

export type DuplicateKind = "title" | "repository" | "title+repository" | "cross_team_repository";

/** Machine-readable flag code, safe to store on a `flags` row or assert in tests. */
export type DuplicateCode =
  | "duplicate_title"
  | "duplicate_repository"
  | "duplicate_title_and_repository"
  | "duplicate_repo_url_cross_team";

/** `duplicate` blocks nothing by itself; `review` is a plagiarism hint. */
export type DuplicateSeverity = "duplicate" | "review";

export interface DuplicateMatch {
  /** The later submission that duplicates an earlier one. */
  submissionId: string;
  /** The earlier submission it duplicates. */
  duplicatesSubmissionId: string;
  kind: DuplicateKind;
  code: DuplicateCode;
  severity: DuplicateSeverity;
  /** The team that owns the flagged submission. */
  teamId: string;
  /** Organizer-facing explanation, prefixed with {@link DuplicateCode}. */
  reason: string;
}

/** Lowercase, collapse whitespace, drop punctuation — "Dry  Harbour!" → "dryharbour". */
export function normalizeTitle(title: string): string {
  return (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/**
 * Canonical repository identity: lowercase, scheme/userinfo/query/fragment
 * removed, `www.` dropped, trailing `.git` and slashes stripped. Different
 * clone URLs for one repository collapse to the same key.
 */
export function normalizeRepositoryUrl(url: string): string {
  let value = (url ?? "").trim().toLowerCase();
  if (value.length === 0) return "";
  const hadScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(value);
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // scheme
  value = value.replace(/^[^/@]*@/, ""); // userinfo
  // scp-style SSH remotes (`git@host:owner/repo`) carry no scheme, so their
  // host separator is a colon rather than a slash. Turn it into a slash so the
  // SSH and HTTPS forms of one repository collapse to the same key.
  if (!hadScheme) value = value.replace(/^([^/:]+):(?!\/)/, "$1/");
  value = value.replace(/^www\./, "");
  value = value.split(/[?#]/)[0]; // query + fragment
  value = value.replace(/\.git$/, "");
  value = value.replace(/\/+$/, "");
  return value;
}

/** Badge copy for a flag code. */
export function duplicateLabelFor(code: DuplicateCode): string {
  return code === "duplicate_repo_url_cross_team" ? "Cross-team repo" : "Duplicate";
}

function label(sub: SubmissionIdentity): string {
  const team = sub.teamName ? ` (${sub.teamName})` : "";
  return `"${sub.title}"${team}`;
}

/**
 * Return one {@link DuplicateMatch} per redundant submission. Submissions are
 * processed in the order supplied (callers pass them oldest-first), and each
 * submission is matched against the earliest row it duplicates, so a group of
 * three identical entries yields two matches rather than three.
 */
export function findDuplicateMatches(submissions: SubmissionIdentity[]): DuplicateMatch[] {
  // Keyed by `teamId|titleKey`: a shared title only counts inside one team.
  const byTeamTitle = new Map<string, SubmissionIdentity>();
  // Repositories are global, because a shared repo across teams is exactly the
  // signal we want — but it is recorded as a review hint, not a duplicate.
  const byRepo = new Map<string, SubmissionIdentity>();
  const matches: DuplicateMatch[] = [];

  for (const sub of submissions) {
    const titleKey = normalizeTitle(sub.title);
    const repoKey = normalizeRepositoryUrl(sub.repositoryUrl);
    const teamTitleKey = titleKey ? `${sub.teamId}|${titleKey}` : "";

    const titleHit = teamTitleKey ? byTeamTitle.get(teamTitleKey) : undefined;
    const repoHit = repoKey ? byRepo.get(repoKey) : undefined;
    const sameTeamRepoHit = repoHit && repoHit.teamId === sub.teamId ? repoHit : undefined;
    const crossTeamRepoHit = repoHit && repoHit.teamId !== sub.teamId ? repoHit : undefined;

    if (titleHit || sameTeamRepoHit) {
      const original = titleHit ?? sameTeamRepoHit!;
      const bothMatch =
        Boolean(titleHit) && Boolean(sameTeamRepoHit) &&
        titleHit!.submissionId === sameTeamRepoHit!.submissionId;
      const kind: DuplicateKind = bothMatch
        ? "title+repository"
        : titleHit
          ? "title"
          : "repository";
      const code: DuplicateCode = bothMatch
        ? "duplicate_title_and_repository"
        : titleHit
          ? "duplicate_title"
          : "duplicate_repository";
      const detail =
        kind === "title"
          ? `same team and same title "${sub.title}" as ${label(original)}`
          : kind === "repository"
            ? `same team and same repository URL as ${label(original)}`
            : `same team, same title "${sub.title}" and same repository URL as ${label(original)}`;
      matches.push({
        submissionId: sub.submissionId,
        duplicatesSubmissionId: original.submissionId,
        kind,
        code,
        severity: "duplicate",
        teamId: sub.teamId,
        reason: `${code} — ${detail}`,
      });
    } else if (crossTeamRepoHit) {
      // Possible plagiarism: two teams filed the same repository. Review only —
      // a shared starter template is legitimate often enough that this must
      // never auto-disqualify anyone.
      matches.push({
        submissionId: sub.submissionId,
        duplicatesSubmissionId: crossTeamRepoHit.submissionId,
        kind: "cross_team_repository",
        code: "duplicate_repo_url_cross_team",
        severity: "review",
        teamId: sub.teamId,
        reason: `duplicate_repo_url_cross_team — repository URL also used by ${label(crossTeamRepoHit)} (review only)`,
      });
    }

    // First writer wins, so every entry points at the earliest original.
    if (teamTitleKey && !byTeamTitle.has(teamTitleKey)) byTeamTitle.set(teamTitleKey, sub);
    if (repoKey && !byRepo.has(repoKey)) byRepo.set(repoKey, sub);
  }

  return matches;
}
