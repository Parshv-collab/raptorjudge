import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { getCurrentUser, parseSettings, requireOrganizer, requireUser } from "./lib/common";
import { appendAudit } from "./lib/audit";

const eventArgs = {
  slug: v.string(), title: v.string(), tagline: v.string(), description: v.string(),
  registrationStart: v.optional(v.number()), registrationEnd: v.optional(v.number()), submissionDeadline: v.optional(v.number()),
  judgingStart: v.optional(v.number()), judgingEnd: v.optional(v.number()), votingStart: v.optional(v.number()), votingEnd: v.optional(v.number()),
  timezone: v.optional(v.string()), settings: v.optional(v.string()), bannerUrl: v.optional(v.string()),
  hostName: v.optional(v.string()), shortDescription: v.optional(v.string()), fullDescription: v.optional(v.string()),
  rules: v.optional(v.string()), registrationOpens: v.optional(v.number()), registrationCloses: v.optional(v.number()),
  submissionOpens: v.optional(v.number()), judgingStarts: v.optional(v.number()), judgingEnds: v.optional(v.number()),
  resultsAnnounced: v.optional(v.number()), minTeamSize: v.optional(v.number()), maxTeamSize: v.optional(v.number()),
  soloAllowed: v.optional(v.boolean()), coverImageRequired: v.optional(v.boolean()),
};

export const listAll = query({ args: {}, handler: async (ctx) => { await requireOrganizer(ctx); return ctx.db.query("events").collect(); } });
export const listMine = query({ args: {}, handler: async (ctx) => {
  const user = await requireOrganizer(ctx);
  const all = await ctx.db.query("events").collect();
  return (user.role === "admin" ? all : all.filter((e) => e.organizerId === user._id));
} });

/**
 * The caller's events (admins: all of them) with their team and submission
 * counts inlined (issues 33/37).
 *
 * The organizer dashboard used to load counts for only its *first* event and
 * print an em dash for every other row, which read as blank data. One query
 * now returns every count, so no row is ever missing its numbers. Scoping
 * matches `listMine`: organizers see the events they own, admins see all.
 */
export const listWithCounts = query({ args: {}, handler: async (ctx) => {
  const user = await requireOrganizer(ctx);
  const all = await ctx.db.query("events").collect();
  const visible = user.role === "admin" ? all : all.filter((e) => e.organizerId === user._id);
  const teams = await ctx.db.query("teams").collect();
  const submissions = await ctx.db.query("submissions").collect();
  return visible.map((event) => ({
    ...event,
    teamCount: teams.filter((t) => t.eventId === event._id).length,
    submissionCount: submissions.filter((s) => s.eventId === event._id).length,
    submittedCount: submissions.filter((s) => s.eventId === event._id && s.status === "submitted").length,
  }));
} });
export const listPublic = query({ args: {}, handler: async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.status !== "draft") });

/**
 * Public, unauthenticated runtime config for the marketing surfaces (issue 30).
 *
 * `testEvents` mirrors the TEST_EVENTS deployment env var. The landing page
 * uses it to decide whether to render the stage-grouped event sections; when
 * the flag is off it shows only Sample Hack 2026, exactly as before. Nothing
 * sensitive is exposed here — it is one boolean, and a public event list is
 * already readable without auth.
 */
export const publicConfig = query({
  args: {},
  handler: async () => ({ testEvents: process.env.TEST_EVENTS === "true" }),
});

/**
 * The stage buckets the landing page renders, in lifecycle order. The copy is
 * the public-facing label for each lifecycle stage, kept here so the page
 * cannot drift from the server's notion of a stage.
 */
const STAGE_SECTIONS: { key: string; label: string; blurb: string; statuses: string[] }[] = [
  {
    key: "registration",
    label: "Registration open",
    blurb: "Teams are signing up. Nothing has been submitted yet.",
    statuses: ["registration"],
  },
  {
    key: "submissions",
    label: "Submissions open",
    blurb: "Hacking is underway — projects are landing against a live deadline.",
    statuses: ["hacking"],
  },
  {
    key: "judging",
    label: "Now judging",
    blurb: "The panel is scoring against a locked weighted rubric.",
    statuses: ["judging"],
  },
  {
    key: "voting",
    label: "Vote now",
    blurb: "Judging is done, community voting is open and tallies are hidden.",
    statuses: ["voting"],
  },
  {
    key: "past",
    label: "Past events",
    blurb: "Published results, rankings and certificates.",
    statuses: ["published", "closed", "archived"],
  },
];

/**
 * Public events grouped by lifecycle stage, with the counts the landing page
 * shows (issue 30). Empty buckets are omitted, so a deployment with only the
 * closed Sample Hack 2026 returns exactly one group.
 */
export const stageOverview = query({
  args: {},
  handler: async (ctx) => {
    const all = (await ctx.db.query("events").collect()).filter((e) => e.status !== "draft");
    const teams = await ctx.db.query("teams").collect();
    const members = await ctx.db.query("teamMembers").collect();
    const submissions = await ctx.db.query("submissions").collect();

    return STAGE_SECTIONS.map((section) => {
      const events = all
        .filter((e) => section.statuses.includes(e.status))
        // Newest activity first, so a freshly seeded demo event leads its group.
        .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
        .map((event) => {
          const eventTeamIds = new Set(
            teams.filter((t) => t.eventId === event._id).map((t) => String(t._id)),
          );
          return {
            slug: event.slug,
            title: event.title,
            tagline: event.tagline,
            status: event.status,
            projectCount: submissions.filter((s) => s.eventId === event._id).length,
            teamCount: eventTeamIds.size,
            participantCount: members.filter((m) => eventTeamIds.has(String(m.teamId))).length,
          };
        });
      return { key: section.key, label: section.label, blurb: section.blurb, events };
    }).filter((section) => section.events.length > 0);
  },
});
// `get({ eventId })` was removed: every caller resolved an event by slug
// (`getBySlug`) or through a public variant, so it was an unused public read
// that duplicated `assertEventVisible` gating.
export const getBySlug = query({ args: { slug: v.string() }, handler: async (ctx, args) => {
  const event = await ctx.db.query("events").withIndex("by_slug", (q) => q.eq("slug", args.slug)).unique();
  if (!event) return null;
  await assertEventVisible(ctx, event);
  return event;
} });

/**
 * Role isolation: a draft event is unpublished, so only the people running it
 * may read it. Every other page (gallery, event page, embed) treats a draft as
 * absent rather than revealing the announcement early. Non-draft stages stay
 * fully public — the lifecycle, not this check, governs what they may contain.
 */
async function assertEventVisible(ctx: QueryCtx, event: Doc<"events">) {
  if (event.status !== "draft") return;
  const viewer = await getCurrentUser(ctx);
  if (viewer && (viewer.role === "organizer" || viewer.role === "admin")) return;
  throw new Error("Event not found");
}

export const create = mutation({ args: eventArgs, handler: async (ctx, args) => {
  const actor = await requireOrganizer(ctx);
  const existing = await ctx.db.query("events").withIndex("by_slug", (q) => q.eq("slug", args.slug)).unique();
  if (existing) throw new Error(`Event slug already exists: ${args.slug}`);
  const now = Date.now();
  const regStart = args.registrationOpens ?? args.registrationStart ?? now;
  const regEnd = args.registrationCloses ?? args.registrationEnd ?? (now + 86400000);
  const subOpens = args.submissionOpens ?? regStart;
  const subDeadline = args.submissionDeadline ?? regEnd;
  const judgeStart = args.judgingStarts ?? args.judgingStart ?? subDeadline;
  const judgeEnd = args.judgingEnds ?? args.judgingEnd ?? (judgeStart + 86400000);
  const resAnnounced = args.resultsAnnounced ?? args.votingStart ?? args.votingEnd ?? judgeEnd;

  const eventId = await ctx.db.insert("events", {
    ...args,
    tagline: args.tagline || args.shortDescription || "",
    description: args.description || args.fullDescription || "",
    shortDescription: args.shortDescription || args.tagline || "",
    fullDescription: args.fullDescription || args.description || "",
    registrationStart: regStart,
    registrationEnd: regEnd,
    registrationOpens: regStart,
    registrationCloses: regEnd,
    submissionOpens: subOpens,
    submissionDeadline: subDeadline,
    judgingStart: judgeStart,
    judgingEnd: judgeEnd,
    judgingStarts: judgeStart,
    judgingEnds: judgeEnd,
    votingStart: resAnnounced,
    votingEnd: resAnnounced,
    resultsAnnounced: resAnnounced,
    status: "draft",
    timezone: args.timezone ?? "UTC",
    settings: args.settings ?? "max_team_size=4,voting_type=quadratic",
    organizerId: actor._id,
    minTeamSize: args.minTeamSize ?? 1,
    maxTeamSize: args.maxTeamSize ?? 4,
    soloAllowed: args.soloAllowed ?? true,
    coverImageRequired: args.coverImageRequired ?? false,
  });
  await appendAudit(ctx, { eventId, actorId: actor._id, action: "event.create", targetType: "event", targetId: String(eventId), afterState: JSON.stringify({ slug: args.slug, title: args.title, createdAt: now }) });
  return eventId;
} });

export const update = mutation({ args: { eventId: v.id("events"), ...eventArgs }, handler: async (ctx, args) => {
  const actor = await requireOrganizer(ctx); const event = await ctx.db.get(args.eventId); if (!event) throw new Error("Event not found");
  const { eventId, ...patch } = args; const before = JSON.stringify(event);
  const duplicate = await ctx.db.query("events").withIndex("by_slug", (q) => q.eq("slug", patch.slug)).unique();
  if (duplicate && duplicate._id !== eventId) throw new Error("Event slug already exists");
  const regStart = patch.registrationOpens ?? patch.registrationStart ?? event.registrationOpens ?? event.registrationStart;
  const regEnd = patch.registrationCloses ?? patch.registrationEnd ?? event.registrationCloses ?? event.registrationEnd;
  const subOpens = patch.submissionOpens ?? event.submissionOpens ?? regStart;
  const subDeadline = patch.submissionDeadline ?? event.submissionDeadline;
  const judgeStart = patch.judgingStarts ?? patch.judgingStart ?? event.judgingStarts ?? event.judgingStart;
  const judgeEnd = patch.judgingEnds ?? patch.judgingEnd ?? event.judgingEnds ?? event.judgingEnd;
  const resAnnounced = patch.resultsAnnounced ?? patch.votingStart ?? patch.votingEnd ?? event.resultsAnnounced;

  await ctx.db.patch(eventId, {
    ...patch,
    tagline: patch.tagline || patch.shortDescription || event.tagline,
    description: patch.description || patch.fullDescription || event.description,
    shortDescription: patch.shortDescription || patch.tagline || event.shortDescription,
    fullDescription: patch.fullDescription || patch.description || event.fullDescription,
    registrationStart: regStart,
    registrationEnd: regEnd,
    registrationOpens: regStart,
    registrationCloses: regEnd,
    submissionOpens: subOpens,
    submissionDeadline: subDeadline,
    judgingStart: judgeStart,
    judgingEnd: judgeEnd,
    judgingStarts: judgeStart,
    judgingEnds: judgeEnd,
    votingStart: resAnnounced,
    votingEnd: resAnnounced,
    resultsAnnounced: resAnnounced,
  });
  await appendAudit(ctx, { eventId, actorId: actor._id, action: "event.update", targetType: "event", targetId: String(eventId), beforeState: before, afterState: JSON.stringify(patch) });
  return { ok: true };
} });

export const publish = mutation({ args: { eventId: v.id("events") }, handler: async (ctx, args) => {
  const actor = await requireOrganizer(ctx); const event = await ctx.db.get(args.eventId); if (!event) throw new Error("Event not found");
  await ctx.db.patch(args.eventId, { status: "registration", publishedAt: Date.now() });
  await appendAudit(ctx, { eventId: args.eventId, actorId: actor._id, action: "event.publish", targetType: "event", targetId: String(args.eventId), beforeState: event.status, afterState: "registration" });
  return { ok: true };
} });
export const unpublish = mutation({ args: { eventId: v.id("events") }, handler: async (ctx, args) => {
  const actor = await requireOrganizer(ctx); const event = await ctx.db.get(args.eventId); if (!event) throw new Error("Event not found");
  await ctx.db.patch(args.eventId, { status: "draft", publishedAt: undefined });
  await appendAudit(ctx, { eventId: args.eventId, actorId: actor._id, action: "event.unpublish", targetType: "event", targetId: String(args.eventId), beforeState: event.status, afterState: "draft" });
  return { ok: true };
} });
export const deleteEvent = mutation({ args: { eventId: v.id("events") }, handler: async (ctx, args) => {
  const actor = await requireOrganizer(ctx); const event = await ctx.db.get(args.eventId); if (!event) throw new Error("Event not found");
  if (event.status !== "draft") throw new Error("Only draft events can be deleted");
  await ctx.db.delete(args.eventId); await appendAudit(ctx, { actorId: actor._id, action: "event.delete", targetType: "event", targetId: String(args.eventId), beforeState: JSON.stringify(event), afterState: "deleted" }); return { ok: true };
} });

/**
 * Publication readiness gate (issue 34).
 *
 * Announcing results is irreversible in practice — the public gallery re-sorts
 * by the final ranking and the winner badge unlocks — so it must not be
 * possible to publish an event that has nothing to rank, has judging still in
 * flight, or is still accepting community votes. Each refusal names the exact
 * blocker so the organizer knows what to fix.
 */
async function assertPublishReady(ctx: MutationCtx, event: Doc<"events">): Promise<void> {
  const submissions = await ctx.db
    .query("submissions")
    .withIndex("by_event", (q) => q.eq("eventId", event._id))
    .collect();
  const submitted = submissions.filter((s) => s.status === "submitted");
  if (submitted.length === 0) {
    throw new Error("Cannot publish: the event has no submitted projects.");
  }

  const assignments = await ctx.db
    .query("judgeAssignments")
    .withIndex("by_event", (q) => q.eq("eventId", event._id))
    .collect();
  const unscored = assignments.filter((a) => a.status !== "completed").length;
  if (unscored > 0) {
    throw new Error(
      `Cannot publish: ${unscored} of ${assignments.length} assignments are unscored.`,
    );
  }

  // Voting is opt-out: only an explicit `voting_type=none` turns it off.
  const votingEnabled = parseSettings(event.settings ?? "").voting_type !== "none";
  if (votingEnabled && Date.now() < event.votingEnd) {
    const closes = new Date(event.votingEnd).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    throw new Error(`Cannot publish: voting closes on ${closes}.`);
  }
}

export const setStage = mutation({ args: { eventId: v.id("events"), stage: v.string() }, handler: async (ctx, args) => {
  const actor = await requireOrganizer(ctx); const event = await ctx.db.get(args.eventId); if (!event) throw new Error("Event not found");
  const stages = ["draft", "registration", "hacking", "judging", "voting", "published", "archived"]; if (!stages.includes(args.stage)) throw new Error("Invalid stage");
  if (args.stage === "published" && event.status !== "published") {
    await assertPublishReady(ctx, event);
  }
  await ctx.db.patch(args.eventId, { status: args.stage }); await appendAudit(ctx, { eventId: args.eventId, actorId: actor._id, action: "event.stage_change", targetType: "event", targetId: String(args.eventId), beforeState: event.status, afterState: args.stage });
  // Announcing results is the one transition subscribers act on: it changes the
  // public gallery for everyone, so it gets a webhook of its own — and it now
  // also notifies the participants (issue 23.3).
  if (args.stage === "published" && event.status !== "published") {
    await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
      eventId: args.eventId,
      eventType: "results.published",
      payload: JSON.stringify({ eventId: String(args.eventId), slug: event.slug, title: event.title, publishedAt: Date.now() }),
    });
    // Resolve the participant list inline (mutations cannot call runQuery) so
    // the scheduled fan-out has concrete recipients.
    const eventTeams = await ctx.db
      .query("teams")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const eventTeamIds = new Set(eventTeams.map((t) => t._id));
    const allMembers = await ctx.db.query("teamMembers").collect();
    const participantIds = Array.from(
      new Set(allMembers.filter((m) => eventTeamIds.has(m.teamId)).map((m) => String(m.userId))),
    ) as never[];
    await ctx.scheduler.runAfter(0, internal.notifications.createManyInternal, {
      eventId: args.eventId,
      userIds: participantIds,
      type: "results_published",
      message: `Results published for ${event.title}`,
      linkUrl: `/results/${event.slug}`,
    });
  }
  return { ok: true };
} });

export const adminTransferOwnership = mutation({ args: { eventId: v.id("events"), newOrganizerId: v.id("users") }, handler: async (ctx, args) => {
  const actor = await requireOrganizer(ctx);
  if (actor.role !== "admin") throw new Error("Admin required");
  const event = await ctx.db.get(args.eventId); if (!event) throw new Error("Event not found");
  const target = await ctx.db.get(args.newOrganizerId); if (!target) throw new Error("User not found");
  await ctx.db.patch(args.eventId, { organizerId: args.newOrganizerId });
  await appendAudit(ctx, { eventId: args.eventId, actorId: actor._id, action: "event.admin_transfer_ownership", targetType: "event", targetId: String(args.eventId), beforeState: JSON.stringify({ organizerId: event.organizerId }), afterState: JSON.stringify({ organizerId: args.newOrganizerId }) });
  return { ok: true };
} });

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const getStorageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return ctx.storage.getUrl(args.storageId);
  },
});


/** Participant discovery: events where the current user belongs to a team. */
export const enrolled = query({ args: {}, handler: async (ctx) => {
  const user = await requireUser(ctx);
  const memberships = await ctx.db.query("teamMembers").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
  const eventIds = new Set<string>();
  for (const membership of memberships) {
    const team = await ctx.db.get(membership.teamId);
    if (team) eventIds.add(String(team.eventId));
  }
  const all = await ctx.db.query("events").collect();
  const teams = await ctx.db.query("teams").collect();
  const members = await ctx.db.query("teamMembers").collect();
  return all.filter((event) => eventIds.has(String(event._id))).map((event) => ({
    ...event,
    participantCount: members.filter((member) => teams.find((team) => team._id === member.teamId)?.eventId === event._id).length,
  }));
} });

/** Public discovery feed, ranked by current team-member count. */
export const featured = query({ args: {}, handler: async (ctx) => {
  const events = (await ctx.db.query("events").collect()).filter((event) => ["registration", "hacking", "judging", "voting", "published"].includes(event.status));
  const teams = await ctx.db.query("teams").collect();
  const members = await ctx.db.query("teamMembers").collect();
  return events.map((event) => ({
    ...event,
    participantCount: members.filter((member) => {
      const team = teams.find((candidate) => candidate._id === member.teamId);
      return team?.eventId === event._id;
    }).length,
  })).sort((a, b) => b.participantCount - a.participantCount).slice(0, 4);
} });

/**
 * True while at least one event is still accepting judging-side writes
 * (anything before publication). Issue 21+25: drives the judge shell's
 * decision to show the Pairwise entry at all — once every event has published
 * there is nothing left to compare.
 */
export const anyOpenForJudging = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("events").collect();
    return events.some((e) => !["published", "archived", "closed"].includes(e.status));
  },
});

/**
 * Flat public event feed for the landing page's discovery sections (issue 43).
 *
 * `stageOverview` deliberately buckets by lifecycle stage for the demo-event
 * showcase; this one returns every published event with its counts and the
 * booleans the marketing page groups on (open / upcoming / past), so the pages
 * can filter and search client-side without N more round trips.
 */
export const browse = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const all = (await ctx.db.query("events").collect()).filter((e) => e.status !== "draft");
    const teams = await ctx.db.query("teams").collect();
    const members = await ctx.db.query("teamMembers").collect();
    const submissions = await ctx.db.query("submissions").collect();
    return all
      .map((event) => {
        const teamIds = new Set(
          teams.filter((t) => t.eventId === event._id).map((t) => String(t._id)),
        );
        const isPast = ["published", "archived", "closed"].includes(event.status);
        return {
          slug: event.slug,
          title: event.title,
          tagline: event.tagline,
          description: event.description,
          status: event.status,
          registrationStart: event.registrationStart,
          registrationEnd: event.registrationEnd,
          submissionDeadline: event.submissionDeadline,
          votingEnd: event.votingEnd,
          projectCount: submissions.filter((s) => s.eventId === event._id).length,
          teamCount: teamIds.size,
          participantCount: members.filter((m) => teamIds.has(String(m.teamId))).length,
          isOpen: ["registration", "hacking", "judging", "voting"].includes(event.status),
          isUpcoming: !isPast && (event.registrationOpens ?? event.registrationStart ?? 0) > now,
          isPast,
        };
      })
      .sort((a, b) => b.projectCount - a.projectCount || a.title.localeCompare(b.title));
  },
});

/**
 * The event a public surface should hero (issue 29).
 *
 * A closed event must never be the featured one while anything better exists,
 * so the priority is:
 *   1. an open event (registration / hacking / judging / voting),
 *   2. the next upcoming event (registration in the future),
 *   3. the most recently published event ("Results are in").
 * `null` when nothing qualifies — callers render their empty state.
 */
export const featuredForVisitors = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const all = (await ctx.db.query("events").collect()).filter((e) => e.status !== "draft");
    const withCounts = await Promise.all(
      all.map(async (event) => {
        const teams = await ctx.db
          .query("teams")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .collect();
        const members = await ctx.db.query("teamMembers").collect();
        const teamIds = new Set(teams.map((t) => t._id));
        const participantCount = members.filter((m) => teamIds.has(m.teamId)).length;
        return { event, participantCount };
      }),
    );

    const open = withCounts
      .filter(({ event }) => ["registration", "hacking", "judging", "voting"].includes(event.status))
      .sort((a, b) => b.participantCount - a.participantCount);
    if (open.length > 0) return { ...open[0].event, participantCount: open[0].participantCount, phase: "open" as const };

    const upcoming = withCounts
      .filter(({ event }) => event.registrationStart > now)
      .sort((a, b) => a.event.registrationStart - b.event.registrationStart);
    if (upcoming.length > 0) return { ...upcoming[0].event, participantCount: upcoming[0].participantCount, phase: "upcoming" as const };

    // `closed` belongs here. A deployment seeded with the default
    // `TEST_EVENTS=false` has exactly one event — Sample Hack 2026 — and its
    // status is `closed`; with only `published`/`archived` matched, the featured
    // event resolved to `null` and the landing page opened with no event, "—"
    // stat tiles and an `/e/` link that 404s. Closing an event is how this
    // product says "results are out".
    const published = withCounts
      .filter(({ event }) => ["published", "archived", "closed"].includes(event.status))
      .sort((a, b) => (b.event.publishedAt ?? 0) - (a.event.publishedAt ?? 0));
    if (published.length > 0) return { ...published[0].event, participantCount: published[0].participantCount, phase: "results" as const };

    return null;
  },
});
