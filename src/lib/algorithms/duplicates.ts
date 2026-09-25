/**
 * Duplicate submission detection (T3.6).
 *
 * A hackathon needs to catch the same project filed twice — a team re-submitting
 * under two names, or a solo entrant duplicating a teammate's entry. Two
 * submissions are duplicates when their **title** matches after normalization
 * OR their **repository URL** points at the same repository after normalization.
 *
 * The comparison is deliberately pure and dependency-free so it is unit-testable
 * (`tests/duplicates.test.ts`) and reusable from the Convex layer
 * (`submissions.checkDuplicates`) and from the acceptance suite.
 *
 * AGENTS.md/fixtures.json: `prj_07` and `prj_41` are both titled "Dry Harbour"
 * with the same `repo_url`, so the detector must report `prj_41` as a duplicate.
 */

export interface SubmissionIdentity {
  submissionId: string;
  title: string;
  repositoryUrl: string;
  teamId: string;
  teamName?: string;
}

export type DuplicateKind = "title" | "repository" | "title+repository";

export interface DuplicateMatch {
  /** The later submission that duplicates an earlier one. */
  submissionId: string;
  /** The earlier submission it duplicates. */
  duplicatesSubmissionId: string;
  kind: DuplicateKind;
  /** Human-readable, organizer-facing explanation. */
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

/**
 * Return one {@link DuplicateMatch} per redundant submission. Submissions are
 * processed in the order supplied (callers pass them oldest-first), and each
 * submission is matched against the earliest row it duplicates, so a group of
 * three identical entries yields two matches rather than three.
 */
export function findDuplicateMatches(submissions: SubmissionIdentity[]): DuplicateMatch[] {
  const byTitle = new Map<string, SubmissionIdentity>();
  const byRepo = new Map<string, SubmissionIdentity>();
  const matches: DuplicateMatch[] = [];

  for (const sub of submissions) {
    const titleKey = normalizeTitle(sub.title);
    const repoKey = normalizeRepositoryUrl(sub.repositoryUrl);
    const titleHit = titleKey ? byTitle.get(titleKey) : undefined;
    const repoHit = repoKey ? byRepo.get(repoKey) : undefined;

    if (titleHit || repoHit) {
      const original = titleHit ?? repoHit!;
      const bothTitles = Boolean(titleHit) && Boolean(repoHit);
      const kind: DuplicateKind = bothTitles
        ? "title+repository"
        : titleHit
          ? "title"
          : "repository";
      const detail =
        kind === "title"
          ? `same title "${sub.title}" as ${label(original)}`
          : kind === "repository"
            ? `same repository URL as ${label(original)}`
            : `same title "${sub.title}" and repository URL as ${label(original)}`;
      matches.push({
        submissionId: sub.submissionId,
        duplicatesSubmissionId: original.submissionId,
        kind,
        reason: `Possible duplicate: ${detail}`,
      });
    }

    // First writer wins, so every entry points at the earliest original.
    if (titleKey && !byTitle.has(titleKey)) byTitle.set(titleKey, sub);
    if (repoKey && !byRepo.has(repoKey)) byRepo.set(repoKey, sub);
  }

  return matches;
}

function label(sub: SubmissionIdentity): string {
  const team = sub.teamName ? ` (${sub.teamName})` : "";
  return `"${sub.title}"${team}`;
}
