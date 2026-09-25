import { QueryCtx } from "../_generated/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { hasGuardableAuthorize } from "./authProvider";
import { buildOpenIdConfiguration, isCompleteDiscoveryDocument } from "./wellKnown";
import { isSealed } from "./secretBox";
import { verifyDelivery, WEBHOOK_REPLAY_WINDOW_MS, signedPayload } from "./webhookSignature";
import { verifyJwt } from "./jwt";
import { hmacSha256Hex } from "../crypto";
import {
  isSafeHttpUrl,
  MAX_COMMENT_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
} from "../../lib/validation";
import { blockedWebhookReason, isSafeWebhookTarget } from "../../lib/webhookTarget";
import { safeReturnTo } from "../../lib/safeRedirect";
import { findDuplicateMatches, type SubmissionIdentity } from "../../lib/algorithms/duplicates";
import { planJudgeAssignments } from "../../lib/algorithms/assignment";
import { projectPublicSettings } from "../admin";
import { DEFAULT_JUDGE_LOAD_CAP } from "../judging";

/**
 * Security/hardening self-checks, run server-side by the acceptance suite
 * (organizer dashboard + `POST /api/v1/acceptance`) so the guarantees claimed in
 * the report are *verified against the live database* rather than asserted in
 * prose.
 *
 * They are pure reads plus in-process crypto: no network, no external service,
 * and nothing is written.
 *
 * Coverage map (the security pass items these checks evidence):
 *   55 TOTP sealing + role scope      · sec.mfa_secret_sealed, sec.mfa_role_scope
 *   56/57 auth guard, assignment and score integrity · sec.auth_guard_installed,
 *       sec.assignment_uniqueness, sec.score_uniqueness
 *   58 certificate idempotency        · sec.certificate_idempotency
 *   59 webhook replay protection      · sec.webhook_replay
 *   63/70 fail-closed token checks    · sec.token_forgery
 *   64/67 webhook target validation   · sec.webhook_target
 *   66 bounded/validated input        · sec.link_schemes, sec.input_bounds
 *   69 open redirects                 · sec.open_redirect
 *   Phase 0 strict-client discovery   · sec.oidc_discovery
 */

export interface SecurityCheck {
  id: string;
  tier: string;
  description: string;
  pass: boolean;
  /**
   * True when the check could not be evaluated (nothing to test against).
   * Skipped checks are reported separately and are **never** counted as passes
   * — a security check that silently "passes" because it had no input is a
   * fail-open check (security item 63).
   */
  skipped?: boolean;
  detail?: string;
}

const T5 = "T5";

/**
 * Minimum context: a readable database. Typed structurally so both queries
 * (acceptance.runSuite) and mutations (the REST bridge) can call it — a
 * MutationCtx's writer is assignable to a QueryCtx's reader.
 */
export interface SecurityCheckContext {
  db: QueryCtx["db"];
}

/** All T5 checks, in a stable order (so the report is diffable between runs). */
export async function runSecurityChecks(ctx: SecurityCheckContext): Promise<SecurityCheck[]> {
  const checks: SecurityCheck[] = [];
  const add = (
    id: string,
    description: string,
    pass: boolean,
    detail?: string,
    skipped = false,
  ): void => {
    checks.push({ id, tier: T5, description, pass, detail, skipped });
  };

  // ---- Phase 0: the OIDC discovery document must satisfy strict clients ----
  const discovery = buildOpenIdConfiguration(process.env.CONVEX_SITE_URL ?? "");
  add(
    "sec.oidc_discovery",
    "OIDC discovery document is complete (RFC 8414 / OIDC Discovery 1.0)",
    isCompleteDiscoveryDocument(discovery),
    `issuer=${discovery.issuer || "(unset)"}`,
  );

  // ---- item 56 + 55: the auth hardening wrapper can actually be installed ----
  // @convex-dev/auth materialises a credentials provider by merging `options`
  // over the top level, so the live `authorize` is `options.authorize`. If a
  // library upgrade changes that shape, the uniform-error rewrite and the TOTP
  // gate would silently stop applying — this check makes that visible.
  add(
    "sec.auth_guard_installed",
    "Auth hardening wrapper is installed on the live credentials provider (uniform errors + TOTP gate)",
    hasGuardableAuthorize(Password({})),
  );

  // ---- item 57: one assignment per (judge, submission) ----
  const assignments = await ctx.db.query("judgeAssignments").collect();
  const assignmentKeys = new Set<string>();
  let duplicateAssignments = 0;
  for (const a of assignments) {
    const key = `${a.judgeId}:${a.submissionId}`;
    if (assignmentKeys.has(key)) duplicateAssignments++;
    assignmentKeys.add(key);
  }
  add(
    "sec.assignment_uniqueness",
    "No judge is assigned the same submission twice",
    duplicateAssignments === 0,
    `duplicates=${duplicateAssignments}`,
  );

  // ---- item 57: one score row per (assignment, criterion) ----
  const scores = await ctx.db.query("judgeScores").collect();
  const scoreKeys = new Set<string>();
  let duplicateScores = 0;
  for (const s of scores) {
    const key = `${s.assignmentId}:${s.criterionId}`;
    if (scoreKeys.has(key)) duplicateScores++;
    scoreKeys.add(key);
  }
  add(
    "sec.score_uniqueness",
    "A judge cannot hold two score rows for the same criterion",
    duplicateScores === 0,
    `duplicates=${duplicateScores}`,
  );

  // ---- item 58: certificate issuance is idempotent ----
  const certificates = await ctx.db.query("certificates").collect();
  const certKeys = new Set<string>();
  let duplicateCertificates = 0;
  for (const c of certificates) {
    const key = [c.eventId, c.userId, c.certType, c.title, c.rank].join("|");
    if (certKeys.has(key)) duplicateCertificates++;
    certKeys.add(key);
  }
  add(
    "sec.certificate_idempotency",
    "Certificate issuance is idempotent (no duplicate awards)",
    duplicateCertificates === 0,
    `certificates=${certificates.length} duplicates=${duplicateCertificates}`,
  );

  // ---- item 55: TOTP secrets are sealed and scoped to privileged roles ----
  const users = await ctx.db.query("users").collect();
  const enrolled = users.filter((u) => u.totpSecret);
  const unscoped = enrolled.filter((u) => u.role !== "admin" && u.role !== "organizer");
  const plaintext = enrolled.filter((u) => !isSealed(u.totpSecret ?? ""));
  add(
    "sec.mfa_secret_sealed",
    "TOTP secrets are encrypted at rest (AES-256-GCM)",
    plaintext.length === 0,
    `enrolled=${enrolled.length} unsealed=${plaintext.length}`,
  );
  add(
    "sec.mfa_role_scope",
    "TOTP is limited to admin and organizer accounts",
    unscoped.length === 0,
    `outOfScope=${unscoped.length}`,
  );

  // ---- item 59: webhook deliveries are signed and replay-resistant ----
  const hooks = await ctx.db.query("webhooks").collect();
  if (hooks.length === 0) {
    // Reported as skipped, not as a pass: with no registered webhook there is
    // nothing to verify, and claiming success here would be a green check with
    // no evidence behind it.
    add(
      "sec.webhook_replay",
      "Webhook deliveries are replay-resistant",
      true,
      "no webhooks registered to verify against",
      true,
    );
  } else {
    const hook = hooks[0];
    const now = Date.now();
    const body = JSON.stringify({ id: "check", type: "ping", timestamp: now, data: {} });
    const freshSignature = `sha256=${await hmacSha256Hex(
      hook.secretKey,
      signedPayload(now, "check", body),
    )}`;
    const fresh = await verifyDelivery({
      secret: hook.secretKey,
      timestamp: now,
      deliveryId: "check",
      body,
      signature: freshSignature,
      nowMs: now,
    });
    const staleAt = now - WEBHOOK_REPLAY_WINDOW_MS - 1;
    const staleSignature = `sha256=${await hmacSha256Hex(
      hook.secretKey,
      signedPayload(staleAt, "check-stale", body),
    )}`;
    const stale = await verifyDelivery({
      secret: hook.secretKey,
      timestamp: staleAt,
      deliveryId: "check-stale",
      body,
      signature: staleSignature,
      nowMs: now,
    });
    add(
      "sec.webhook_replay",
      "Webhook deliveries verify when fresh and are rejected after 5 minutes",
      fresh.valid && !stale.valid,
      `fresh=${fresh.valid} staleRejected=${!stale.valid}`,
    );
  }

  // ---- item 66: link fields cannot carry javascript:/data: URLs ----
  // Every URL a participant supplies is rendered as a clickable link in the
  // gallery, project page and judge queue, so a non-http(s) scheme is stored
  // XSS waiting to happen. saveDraft() rejects them at write time; this check
  // proves no legacy row slipped through.
  const submissions = await ctx.db.query("submissions").collect();
  const badLinks = submissions.filter((s) =>
    [s.repositoryUrl, s.videoUrl, s.demoUrl].some((url) => !isSafeHttpUrl(url)),
  );
  add(
    "sec.link_schemes",
    "Stored submission links are http(s) only (no javascript:/data: URLs)",
    badLinks.length === 0,
    `checked=${submissions.length} unsafe=${badLinks.length}`,
  );

  // ---- item 66: stored free text respects the length caps ----
  // saveDraft()/addComment() reject over-long fields at write time; this proves
  // no unbounded row (a stored 1 MB description that every gallery render then
  // parses) ever made it in.
  const comments = await ctx.db.query("comments").collect();
  const overLongTitles = submissions.filter((s) => s.title.length > MAX_TITLE_LENGTH).length;
  const overLongBodies = submissions.filter(
    (s) => s.description.length > MAX_DESCRIPTION_LENGTH,
  ).length;
  const overLongComments = comments.filter((c) => c.content.length > MAX_COMMENT_LENGTH).length;
  add(
    "sec.input_bounds",
    "Stored text respects the length caps (no unbounded submissions/comments)",
    overLongTitles + overLongBodies + overLongComments === 0,
    `titles=${overLongTitles} bodies=${overLongBodies} comments=${overLongComments}`,
  );

  // ---- items 63 + 70: a forged bearer token is rejected before any lookup ----
  // The REST layer used to base64-decode the JWT payload and trust it, so an
  // unsigned `{"sub":"<admin id>|<x>"}` reached organizer-only endpoints. This
  // exercises the real verifier with attacker-shaped tokens: `alg: none`
  // (unsigned), a token signed with a symmetric secret, and a tampered payload
  // carrying a bogus RSA signature. All three must be denied.
  const nowSec = Math.floor(Date.now() / 1000);
  const claims = {
    sub: users[0]?._id ? `${users[0]._id}|session` : "attacker|session",
    iss: process.env.CONVEX_SITE_URL ?? "",
    aud: "convex",
    exp: nowSec + 3600,
    iat: nowSec,
  };
  const forgedTokens = [
    forgeJwt({ alg: "none", typ: "JWT" }, claims),
    forgeJwt({ alg: "HS256", typ: "JWT" }, claims, "c2VjcmV0"),
    forgeJwt({ alg: "RS256", typ: "JWT" }, claims, "AAAA"),
  ];
  let acceptedForged = 0;
  for (const token of forgedTokens) {
    const result = await verifyJwt(token, {
      jwks: undefined,
      issuer: undefined,
      audience: "convex",
    });
    if (result.ok) acceptedForged++;
  }
  add(
    "sec.token_forgery",
    "Forged/unsigned bearer tokens are rejected before any DB read (fail closed)",
    acceptedForged === 0,
    `attempts=${forgedTokens.length} accepted=${acceptedForged}`,
  );

  // ---- item 69: the returnTo redirect cannot leave the origin ----
  // Sign-in sends the user to `?returnTo=…`; a value that survived as an
  // absolute URL would bounce a freshly authenticated session to an attacker.
  // Every sample below is a redirect bypass that has worked against real apps.
  const bypasses = [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "data:text/html,<script>1</script>",
    "/%2F%2Fevil.example",
    "%2F%2Fevil.example",
    "//evil.example/%2e%2e/",
    "/\tevil",
  ];
  const escaped = bypasses.filter((raw) => safeReturnTo(raw, "/role-home") !== "/role-home");
  const keptPath = safeReturnTo("/organizer?tab=judging", "/role-home");
  add(
    "sec.open_redirect",
    "Return-path sanitizer keeps same-origin paths and drops every redirect bypass",
    escaped.length === 0 && keptPath === "/organizer?tab=judging",
    `bypasses=${bypasses.length} escaped=${escaped.length} legitimate=${keptPath}`,
  );

  // ---- items 64 + 67: webhook targets cannot be protocol-smuggled or SSRF'd ----
  // Registration validates the target, but a webhook is a standing outbound
  // request, so the stored rows and the validator's *denial* behaviour are both
  // checked here — a validator that accepted everything shows up as
  // `smuggled=0` failing because `mustBeDenied` would all pass validation.
  const unsafeStored = hooks.filter((h) => !isSafeWebhookTarget(h.targetUrl));
  const mustBeDenied = [
    "file:///etc/passwd",
    "gopher://127.0.0.1:6379/_INFO",
    "https://user:pass@hooks.example/x",
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://[fd00:ec2::254]/latest/meta-data/",
    "http://0.0.0.0/x",
    "not-a-url",
    `https://hooks.example/${"x".repeat(4096)}`,
  ];
  const notDenied = mustBeDenied.filter((url) => blockedWebhookReason(url) === null);
  add(
    "sec.webhook_target",
    "Webhook targets are http(s) only, credential-free, and never cloud metadata",
    unsafeStored.length === 0 && notDenied.length === 0,
    `stored=${hooks.length} unsafeStored=${unsafeStored.length} undetected=${notDenied.length}`,
  );

  // ---- Phase 3: the platform KV projection never ships a secret ----
  // `platform` doubles as the secret store (certificate signing key, session
  // hashes, rate-limit counters), and the settings query used to echo every row
  // to any client. This proves the live projection drops them.
  const platformRows = await ctx.db.query("platform").collect();
  const exposed = projectPublicSettings(platformRows);
  const leaked = Object.keys(exposed).filter(
    (key) =>
      key === "cert_secret" ||
      ["session:", "ratelimit:", "lookup:", "invite:", "judge_tracks:", "rubric_lock:"].some(
        (prefix) => key.startsWith(prefix),
      ),
  );
  add(
    "sec.platform_secrets",
    "Platform settings never expose secret rows (certificate key, sessions, rate limits)",
    leaked.length === 0,
    `rows=${platformRows.length} exposed=${Object.keys(exposed).length} leaked=${leaked.length}`,
  );

  // ---- T3.6: every duplicate in the database carries a flag ----
  // Detection is pure (`findDuplicateMatches`); this asserts the stored state
  // agrees with it for each event, so a duplicated project cannot sit unflagged
  // because a mutation path forgot to run the detector.
  const events = await ctx.db.query("events").collect();
  const flags = await ctx.db.query("flags").collect();
  let unflaggedDuplicates = 0;
  let duplicatePairs = 0;
  for (const event of events) {
    const identities: SubmissionIdentity[] = submissions
      .filter((s) => s.eventId === event._id)
      .map((s) => ({
        submissionId: String(s._id),
        title: s.title,
        repositoryUrl: s.repositoryUrl,
        teamId: String(s.teamId),
      }));
    const matches = findDuplicateMatches(identities);
    duplicatePairs += matches.length;
    for (const m of matches) {
      const flagged = flags.some(
        (f) => String(f.submissionId) === m.submissionId,
      );
      if (!flagged) unflaggedDuplicates++;
    }
  }
  add(
    "sec.duplicate_flags",
    "Every detectable duplicate submission is flagged for organizer review (T3.6)",
    unflaggedDuplicates === 0,
    `pairs=${duplicatePairs} unflagged=${unflaggedDuplicates}`,
  );

  // ---- T2.1: the planner honours the per-judge load cap on real event data ----
  // Runs the real algorithm (dry, in-process) over the live tables: if a future
  // change let a judge absorb the whole event, this fails instead of quietly
  // skewing every ranking.
  const teams = await ctx.db.query("teams").collect();
  const teamMembers = await ctx.db.query("teamMembers").collect();
  const memberOfTeam: Record<string, string[]> = {};
  for (const t of teams) memberOfTeam[String(t._id)] = [];
  for (const m of teamMembers) {
    const key = String(m.teamId);
    if (key in memberOfTeam) memberOfTeam[key].push(String(m.userId));
  }
  const judgeUsers = users.filter((u) => u.role === "judge");
  const trackRows = await ctx.db.query("tracks").collect();
  const capPlan = planJudgeAssignments({
    submissions: submissions
      .filter((s) => s.status === "submitted")
      .map((s) => ({
        submissionId: String(s._id),
        teamId: String(s.teamId),
        trackName: trackRows.find((t) => t._id === s.trackId)?.name ?? "Open",
      })),
    judges: judgeUsers.map((j) => ({ judgeId: String(j._id), affinityTracks: [] })),
    teamMembers: memberOfTeam,
    judgeTeamMemberships: {},
    minJudgesPerSubmission: 3,
    maxAssignmentsPerJudge: DEFAULT_JUDGE_LOAD_CAP,
    seed: 42,
  });
  const worstLoad = Math.max(0, ...Object.values(capPlan.workload));
  add(
    "sec.assignment_load_cap",
    `The assigner never exceeds the ${DEFAULT_JUDGE_LOAD_CAP}-project per-judge cap`,
    judgeUsers.length === 0 || worstLoad <= DEFAULT_JUDGE_LOAD_CAP,
    `judges=${judgeUsers.length} worstLoad=${worstLoad} cap=${DEFAULT_JUDGE_LOAD_CAP}`,
    judgeUsers.length === 0,
  );

  // ---- T2.2: published rubrics are weight-valid ----
  const criteriaRows = await ctx.db.query("rubricCriteria").collect();
  const weightBroken: string[] = [];
  for (const event of events) {
    const own = criteriaRows.filter((c) => c.eventId === event._id);
    if (own.length === 0) continue; // falls back to the default rubric
    const sum = own.reduce((acc, c) => acc + c.weight, 0);
    if (Math.abs(sum - 1) > 0.001) weightBroken.push(`${event.slug}=${sum.toFixed(3)}`);
  }
  add(
    "sec.rubric_weights",
    "Every stored rubric has criteria weights summing to 1.000",
    weightBroken.length === 0,
    `rubrics=${events.length} invalid=${weightBroken.length}${weightBroken.length ? " " + weightBroken.join(",") : ""}`,
  );

  return checks;
}

/** base64url (no padding) — the encoding JWT segments use. */
function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Build an attacker-shaped JWT out of its parts (header/payload are unsigned). */
function forgeJwt(header: object, payload: object, signature = ""): string {
  const parts = [header, payload].map((part) => base64UrlEncode(JSON.stringify(part)));
  return `${parts.join(".")}.${signature}`;
}
