import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  getCurrentUser,
  requireOrganizer,
  requireUser,
} from "./lib/common";
import { assertWithinWindow } from "./lib/timeWindows";
import { appendAudit } from "./lib/audit";
import { seededShuffle, seedFromString } from "./crypto";
import { findDuplicateMatches, type DuplicateSeverity, type SubmissionIdentity } from "../lib/algorithms/duplicates";
import { gallerySeedKey, isResultsPublished, rankEventProjects, rankMap } from "./lib/results";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_TAGLINE_LENGTH,
  MAX_TITLE_LENGTH,
  normalizeTags,
  requireText,
  validateUrl,
} from "../lib/validation";

/** Submissions (T1). Drafts autosave until deadline; gallery is public. */

function validateSubmissionFields(input: {
  title: string;
  tagline: string;
  description: string;
  repositoryUrl: string;
  videoUrl: string;
  demoUrl: string;
  tags: string;
}): typeof input {
  return {
    title: requireText("Title", input.title, { max: MAX_TITLE_LENGTH }),
    tagline: requireText("Tagline", input.tagline, { max: MAX_TAGLINE_LENGTH }),
    description: requireText("Description", input.description, {
      max: MAX_DESCRIPTION_LENGTH,
      singleLine: false,
    }),
    repositoryUrl: validateUrl("Repository URL", input.repositoryUrl),
    videoUrl: validateUrl("Video URL", input.videoUrl),
    demoUrl: validateUrl("Demo URL", input.demoUrl),
    tags: normalizeTags(input.tags),
  };
}

interface GalleryCard {
  id: string;
  title: string;
  tagline: string;
  tags: string;
  teamName: string;
  trackName: string;
  repositoryUrl: string;
  videoUrl: string;
  demoUrl: string;
  submittedAt: number;
  likesHidden: boolean;
  /** 1-based final rank — only present once the event publishes results. */
  rank?: number;
  /** True for the (possibly overridden) #1 — only once results are published. */
  isWinner?: boolean;
}

/**
 * Public gallery (no auth): submitted projects only, searchable.
 *
 * Ordering is stage-dependent (T3 seeded-random gallery, T2 published results):
 *  - **before publication** the order is a deterministic per-day shuffle
 *    (`slug + date`), so the display order carries no information about merit
 *    and no card exposes a score, rank or badge;
 *  - **after publication** cards are ordered by the final ranking — pairwise
 *    Bradley–Terry when the event ran pairwise comparisons, otherwise the
 *    per-judge z-score normalized score — and the top card is flagged as the
 *    winner. A winner override is applied here too, so the gallery and the
 *    override audit log can never disagree.
 */
export const publicGallery = query({
  args: {
    eventId: v.id("events"),
    search: v.optional(v.string()),
    trackId: v.optional(v.id("tracks")),
    seed: v.optional(v.number()),
    randomize: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    // Gallery becomes visible once hacking closes (judging stage onward).
    const visible = ["closed", "judging", "voting", "published", "archived"].includes(event.status);
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    let cards: (GalleryCard & { status: string; teamId: string })[] = [];
    for (const s of subs) {
      if (s.status !== "submitted") continue;
      const team = await ctx.db.get(s.teamId);
      const track = s.trackId ? await ctx.db.get(s.trackId) : null;
      cards.push({
        id: String(s._id),
        title: s.title,
        tagline: s.tagline,
        tags: s.tags,
        teamName: team?.name ?? "Unknown team",
        trackName: track?.name ?? "Open",
        repositoryUrl: s.repositoryUrl,
        videoUrl: s.videoUrl,
        demoUrl: s.demoUrl,
        submittedAt: s.submittedAt ?? s.updatedAt,
        status: s.status,
        teamId: String(s.teamId),
        likesHidden: true, // vote counts never ship from the API until results publish
      });
    }
    const resultsPublished = isResultsPublished(event);
    if (!visible) cards = [];
    const q = (args.search ?? "").trim().toLowerCase();
    if (q) {
      cards = cards.filter((c) =>
        [c.title, c.tagline, c.tags, c.teamName, c.trackName]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    if (args.trackId) {
      const all = await ctx.db
        .query("tracks")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect();
      const names = all.filter((t) => String(t._id) === String(args.trackId)).map((t) => t.name);
      cards = cards.filter((c) => names.includes(c.trackName));
    }
    if (resultsPublished) {
      // Published: merit order, winner first. `randomize` is ignored on purpose
      // — a published ranking is the answer, not a suggestion.
      const { ranking } = await rankEventProjects(ctx, args.eventId);
      const ranks = rankMap(ranking);
      cards = cards
        .map((card) => ({
          ...card,
          rank: ranks.get(card.id),
          isWinner: ranks.get(card.id) === 1,
        }))
        .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title));
    } else {
      // Unpublished: seeded shuffle by slug + day. Deterministic within a day so
      // the grid does not reshuffle on every keystroke, unbiased across days and
      // never correlated with merit.
      const seed = args.seed ?? seedFromString(gallerySeedKey(event));
      cards = seededShuffle(cards, seed);
    }
    return cards;
  },
});

/**
 * All submissions for an event, including drafts (organizer/admin only).
 *
 * Role isolation: this returns unpublished drafts plus team idents, so a judge
 * or participant must not reach it — the public gallery
 * (`submissions.publicGallery`) is the only cross-user read available to them.
 */
export const byEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx);
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const flags = await ctx.db
      .query("flags")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const out = [];
    for (const s of subs) {
      const team = await ctx.db.get(s.teamId);
      const track = s.trackId ? await ctx.db.get(s.trackId) : null;
      const flag = flags.find((f) => String(f.submissionId) === String(s._id) && f.status === "flagged");
      out.push({
        ...s,
        teamName: team?.name ?? "—",
        trackName: track?.name ?? "Open",
        // Duplicate review state, so the organizer submissions list can badge a
        // flagged project without a second query.
        duplicate: flag
          ? {
              reason: flag.reason,
              severity: (flag.severity as DuplicateSeverity | undefined) ?? "duplicate",
            }
          : null,
      });
    }
    return out;
  },
});

/** My team's submission for an event (participant view; includes drafts). */
export const mySubmission = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const m of memberships) {
      const team = await ctx.db.get(m.teamId);
      if (!team || team.eventId !== args.eventId) continue;
      const subs = await ctx.db
        .query("submissions")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .collect();
      const sub = subs[0];
      if (!sub) return { team, submission: null };
      const track = sub.trackId ? await ctx.db.get(sub.trackId) : null;
      const event = await ctx.db.get(args.eventId);
      return {
        team,
        submission: { ...sub, trackName: track?.name ?? "Open" },
        event,
      };
    }
    return null;
  },
});

/** Public single-submission view (only when submitted, or for members/organizers). */
export const detail = query({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.submissionId);
    if (!sub) throw new Error("Submission not found");
    const event = await ctx.db.get(sub.eventId);
    const team = await ctx.db.get(sub.teamId);
    const track = sub.trackId ? await ctx.db.get(sub.trackId) : null;
    const user = await getCurrentUser(ctx);
    let canEdit = false;
    if (user) {
      const membership = await ctx.db
        .query("teamMembers")
        .withIndex("by_team", (q) => q.eq("teamId", sub.teamId))
        .collect();
      if (user.role === "admin" || user.role === "organizer") canEdit = true;
      if (membership.some((m) => m.userId === user._id)) canEdit = true;
    }
    const isPublic = sub.status === "submitted" && event && event.status !== "draft";
    if (!isPublic && !canEdit) throw new Error("Not available");

    // Final standing, but only once the event announced results — before that
    // there is nothing to show and nothing to leak.
    const resultsPublished = Boolean(event && isResultsPublished(event));
    let rank: number | null = null;
    let isWinner = false;
    let winnerIsOverridden = false;
    if (resultsPublished) {
      const { ranking, overridden } = await rankEventProjects(ctx, sub.eventId);
      rank = rankMap(ranking).get(String(sub._id)) ?? null;
      isWinner = rank === 1;
      winnerIsOverridden = overridden;
    }

    return {
      ...sub,
      teamName: team?.name ?? "—",
      trackName: track?.name ?? "Open",
      // Needed by the project page to link back to the right gallery.
      eventSlug: event?.slug ?? null,
      eventTitle: event?.title ?? null,
      eventStatus: event?.status ?? null,
      canEdit,
      resultsPublished,
      rank,
      isWinner,
      winnerIsOverridden,
    };
  },
});

/** Create or update the team's draft submission. Deadline-enforced. */
export const saveDraft = mutation({
  args: {
    eventId: v.id("events"),
    title: v.optional(v.string()),
    tagline: v.optional(v.string()),
    description: v.optional(v.string()),
    repositoryUrl: v.optional(v.string()),
    videoUrl: v.optional(v.string()),
    demoUrl: v.optional(v.string()),
    tags: v.optional(v.string()),
    customFields: v.optional(v.string()),
    trackId: v.optional(v.id("tracks")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");

    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    let teamId: Id<"teams"> | null = null;
    for (const m of memberships) {
      const t = await ctx.db.get(m.teamId);
      if (t && t.eventId === args.eventId) {
        teamId = m.teamId;
        break;
      }
    }
    if (!teamId) throw new Error("Join or create a team first");

    const existing = await ctx.db
      .query("submissions")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    const draft = existing[0];

    if (draft && draft.status === "submitted") {
      throw new Error("Already submitted — withdraw or contact an organizer to edit");
    }

    const clean = validateSubmissionFields({
      title: args.title ?? draft?.title ?? "",
      tagline: args.tagline ?? draft?.tagline ?? "",
      description: args.description ?? draft?.description ?? "",
      repositoryUrl: args.repositoryUrl ?? draft?.repositoryUrl ?? "",
      videoUrl: args.videoUrl ?? draft?.videoUrl ?? "",
      demoUrl: args.demoUrl ?? draft?.demoUrl ?? "",
      tags: args.tags ?? draft?.tags ?? "",
    });

    if (!draft) {
      const id = await ctx.db.insert("submissions", {
        eventId: args.eventId,
        teamId,
        trackId: args.trackId,
        title: clean.title,
        tagline: clean.tagline,
        description: clean.description,
        repositoryUrl: clean.repositoryUrl,
        videoUrl: clean.videoUrl,
        demoUrl: clean.demoUrl,
        tags: clean.tags,
        customFields: args.customFields ?? "{}",
        status: "draft",
        updatedAt: Date.now(),
      });
      await appendAudit(ctx, {
        eventId: args.eventId,
        actorId: user._id,
        action: "submission.draft_create",
        targetType: "submission",
        targetId: String(id),
      });
      return id;
    }

    await ctx.db.patch(draft._id, {
      trackId: args.trackId ?? draft.trackId,
      title: clean.title,
      tagline: clean.tagline,
      description: clean.description,
      repositoryUrl: clean.repositoryUrl,
      videoUrl: clean.videoUrl,
      demoUrl: clean.demoUrl,
      tags: clean.tags,
      customFields: args.customFields ?? draft.customFields,
      updatedAt: Date.now(),
    });
    return draft._id;
  },
});

/** Submit the draft for judging. Requires minimum fields; deadline-enforced. */
export const submit = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (user.role !== "organizer" && user.role !== "admin") {
      assertWithinWindow(event, "submission");
    }

    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    let teamId: Id<"teams"> | null = null;
    let memberRole: string | null = null;
    for (const m of memberships) {
      const t = await ctx.db.get(m.teamId);
      if (t && t.eventId === args.eventId) {
        teamId = m.teamId;
        memberRole = m.memberRole;
        break;
      }
    }
    if (!teamId) throw new Error("Join or create a team first");

    if (memberRole && memberRole !== "leader") {
      throw new Error("Only the team leader can submit the project.");
    }

    const existing = await ctx.db
      .query("submissions")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    const draft = existing[0];
    if (!draft) throw new Error("Create a draft first");

    if (!draft.title.trim() || !draft.description.trim()) {
      throw new Error("Title and description are required before submitting");
    }

    const clean = validateSubmissionFields({
      title: draft.title,
      tagline: draft.tagline,
      description: draft.description,
      repositoryUrl: draft.repositoryUrl,
      videoUrl: draft.videoUrl,
      demoUrl: draft.demoUrl,
      tags: draft.tags,
    });
    if (clean.title !== draft.title || clean.description !== draft.description) {
      throw new Error("Title or description contains unsupported content — edit and resubmit");
    }

    await ctx.db.patch(draft._id, {
      status: "submitted",
      submittedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      eventId: args.eventId,
      actorId: user._id,
      action: "submission.submit",
      targetType: "submission",
      targetId: String(draft._id),
      beforeState: draft.status,
      afterState: "submitted",
    });

    // T3.6: re-run duplicate detection on every submission so a duplicate filed
    // after the original is still caught without an organizer clicking a button.
    try {
      const flagged = await detectAndRecordDuplicates(ctx, args.eventId);
      if (flagged.newFlags.length > 0) {
        await appendAudit(ctx, {
          eventId: args.eventId,
          actorId: user._id,
          action: "submission.duplicate_detected",
          targetType: "event",
          targetId: String(args.eventId),
          afterState: JSON.stringify({ flagged: flagged.newFlags }),
        });
      }
    } catch {
      // Detection is advisory: never block a legitimate submission on it.
    }

    return { ok: true, submissionId: draft._id };
  },
});

// -------------------------------------------------------------- duplicates ---

/**
 * Duplicate detection (T3.6).
 *
 * Compares every submitted project in an event on normalized title and
 * repository URL (see `src/lib/algorithms/duplicates.ts`) and records one
 * `flags` row per redundant submission. Re-running is idempotent: an existing
 * unresolved flag for the same submission is updated rather than duplicated.
 */
async function detectAndRecordDuplicates(
  ctx: any,
  eventId: Id<"events">,
): Promise<{
  matches: ReturnType<typeof findDuplicateMatches>;
  newFlags: { submissionId: string; title: string; reason: string }[];
  totalSubmissions: number;
}> {
  const subs = await ctx.db
    .query("submissions")
    .withIndex("by_event", (q: any) => q.eq("eventId", eventId))
    .collect();

  // Oldest first, so the earliest entry stays the "original" and every later
  // duplicate is the one that gets flagged.
  const submitted = subs
    .filter((s: any) => s.status === "submitted" || s.status === "withdrawn")
    .sort((a: any, b: any) => (a.submittedAt ?? a.updatedAt) - (b.submittedAt ?? b.updatedAt));

  const identities: SubmissionIdentity[] = [];
  for (const s of submitted) {
    const team = await ctx.db.get(s.teamId);
    identities.push({
      submissionId: String(s._id),
      title: s.title,
      repositoryUrl: s.repositoryUrl,
      teamId: String(s.teamId),
      teamName: team?.name,
    });
  }

  const matches = findDuplicateMatches(identities);
  const existing = await ctx.db
    .query("flags")
    .withIndex("by_event", (q: any) => q.eq("eventId", eventId))
    .collect();

  const newFlags: { submissionId: string; title: string; reason: string }[] = [];
  const now = Date.now();

  for (const match of matches) {
    const prior = existing.find(
      (f: any) => String(f.submissionId) === match.submissionId && f.status === "flagged",
    );
    if (prior) {
      if (prior.reason !== match.reason || prior.severity !== match.severity) {
        await ctx.db.patch(prior._id, { reason: match.reason, severity: match.severity });
      }
      continue;
    }
    await ctx.db.insert("flags", {
      submissionId: match.submissionId as never,
      eventId,
      reason: match.reason,
      severity: match.severity,
      status: "flagged",
      createdAt: now,
    });
    newFlags.push({
      submissionId: match.submissionId,
      title: identities.find((i) => i.submissionId === match.submissionId)?.title ?? "",
      reason: match.reason,
    });
  }

  return { matches, newFlags, totalSubmissions: identities.length };
}

/**
 * Duplicate scan callable without an organizer identity.
 *
 * Used by the seed action so a freshly seeded deployment already carries the
 * flag for a duplicated project (fixtures.json has two "Dry Harbour" entries) —
 * otherwise the Duplicate Flags tab would look empty until someone clicked
 * "Run duplicate scan" by hand. Internal, so it is not reachable from clients.
 */
export const detectDuplicatesInternal = internalMutation({
  args: { eventId: v.id("events") },
  // Annotated to keep the seed action's `internal.*` call out of a
  // type-inference cycle (see certificates.issueAllHelper).
  handler: async (
    ctx,
    args,
  ): Promise<{ scanned: number; matches: number; newlyFlagged: number }> => {
    const result = await detectAndRecordDuplicates(ctx, args.eventId);
    return {
      scanned: result.totalSubmissions,
      matches: result.matches.length,
      newlyFlagged: result.newFlags.length,
    };
  },
});

/** Organizer-triggered duplicate scan (button in the event Duplicate Flags tab). */
export const checkDuplicates = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    const result = await detectAndRecordDuplicates(ctx, args.eventId);
    await appendAudit(ctx, {
      eventId: args.eventId,
      actorId: actor._id,
      action: "submission.duplicate_scan",
      targetType: "event",
      targetId: String(args.eventId),
      afterState: JSON.stringify({
        scanned: result.totalSubmissions,
        matches: result.matches.length,
        newlyFlagged: result.newFlags.length,
      }),
    });
    return {
      ok: true,
      scanned: result.totalSubmissions,
      matches: result.matches.length,
      newlyFlagged: result.newFlags.length,
      details: result.newFlags,
    };
  },
});

/** Duplicate flags for an event, with submission + team context (organizer only). */
export const listFlags = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx);
    const rows = await ctx.db
      .query("flags")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const out = [];
    for (const f of rows) {
      const sub = await ctx.db.get(f.submissionId);
      const team = sub ? await ctx.db.get(sub.teamId) : null;
      out.push({
        id: String(f._id),
        submissionId: String(f.submissionId),
        submissionTitle: sub?.title ?? "(removed)",
        submissionStatus: sub?.status ?? "unknown",
        teamName: team?.name ?? "—",
        reason: f.reason,
        severity: f.severity ?? "duplicate",
        status: f.status,
        createdAt: f.createdAt,
        reviewedAt: f.reviewedAt ?? null,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Resolve a duplicate flag as a false positive (organizer only). */
export const dismissFlag = mutation({
  args: { flagId: v.id("flags") },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    const flag = await ctx.db.get(args.flagId);
    if (!flag) throw new Error("Flag not found");
    await ctx.db.patch(args.flagId, { status: "dismissed", reviewedAt: Date.now() });
    await appendAudit(ctx, {
      eventId: flag.eventId,
      actorId: actor._id,
      action: "submission.flag_dismiss",
      targetType: "flag",
      targetId: String(args.flagId),
      beforeState: flag.status,
      afterState: "dismissed",
    });
    return { ok: true };
  },
});

/** Disqualify a flagged duplicate by withdrawing it from judging (organizer only). */
export const removeFlaggedSubmission = mutation({
  args: { flagId: v.id("flags"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    const flag = await ctx.db.get(args.flagId);
    if (!flag) throw new Error("Flag not found");
    const sub = await ctx.db.get(flag.submissionId);
    if (!sub) throw new Error("Submission no longer exists");

    await ctx.db.patch(sub._id, { status: "withdrawn", updatedAt: Date.now() });
    await ctx.db.patch(args.flagId, { status: "removed", reviewedAt: Date.now() });
    // Drop any judging work for the withdrawn entry so it cannot be scored.
    const assignments = await ctx.db
      .query("judgeAssignments")
      .withIndex("by_submission", (q) => q.eq("submissionId", sub._id))
      .collect();
    for (const a of assignments) await ctx.db.delete(a._id);

    await appendAudit(ctx, {
      eventId: flag.eventId,
      actorId: actor._id,
      action: "submission.duplicate_remove",
      targetType: "submission",
      targetId: String(sub._id),
      beforeState: sub.status,
      afterState: JSON.stringify({
        status: "withdrawn",
        reason: args.reason ?? flag.reason,
        assignmentsRemoved: assignments.length,
      }),
    });
    return { ok: true, assignmentRemoved: assignments.length };
  },
});

/** Withdraw back to draft (before deadline only). */export const withdraw = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (user.role !== "organizer" && user.role !== "admin") {
      assertWithinWindow(event, "submission");
    }
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const m of memberships) {
      const t = await ctx.db.get(m.teamId);
      if (!t || t.eventId !== args.eventId) continue;
      const subs = await ctx.db
        .query("submissions")
        .withIndex("by_team", (q) => q.eq("teamId", t._id))
        .collect();
      const sub = subs[0];
      if (sub) {
        await ctx.db.patch(sub._id, { status: "draft", submittedAt: undefined });
        await appendAudit(ctx, {
          eventId: args.eventId,
          actorId: user._id,
          action: "submission.withdraw",
          targetType: "submission",
          targetId: String(sub._id),
          beforeState: "submitted",
          afterState: "draft",
        });
        return { ok: true };
      }
    }
    throw new Error("No submission found");
  },
});
