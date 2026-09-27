import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOrganizer } from "./lib/common";
import { appendAudit } from "./lib/audit";
import { isResultsPublished, rankEventProjects } from "./lib/results";

/**
 * Winner override (T2 results integrity).
 *
 * Two paths, one table, one audit trail:
 *
 *  A. **Organizer request** → `pending`, awaiting an admin. Nothing about the
 *     winner changes until an admin accepts it. A rejection carries a note the
 *     organizer can read back from the results tab.
 *  B. **Admin direct override** → applied immediately, after the two-step
 *     confirmation in the UI, and recorded as `accepted` with `source:
 *     "admin_direct"`.
 *
 * Rules enforced here (never in the UI alone):
 *  - only before results are published
 *  - only the event's own organizer may request (admins may do either path)
 *  - only an admin may accept, reject, or override directly
 *  - the target must be a *submitted* project of that event
 *  - the organizer's reason is mandatory and at least 20 characters
 *  - every step appends to the hash-chained audit log
 */

const MIN_REASON_LENGTH = 20;

async function loadEventOrThrow(ctx: any, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  if (!event) throw new Error("Event not found");
  return event;
}

function assertOverrideAllowed(event: Doc<"events">) {
  if (isResultsPublished(event)) {
    throw new Error("Results are already published — the winner can no longer be overridden");
  }
}

function assertCanManageEvent(actor: Doc<"users">, event: Doc<"events">) {
  if (actor.role === "admin") return;
  if (event.organizerId && String(event.organizerId) === String(actor._id)) return;
  throw new Error("Only this event's organizer or a platform admin can do that");
}

async function requireSubmittedProject(ctx: any, eventId: Id<"events">, submissionId: Id<"submissions">) {
  const sub = await ctx.db.get(submissionId);
  if (!sub || String(sub.eventId) !== String(eventId)) {
    throw new Error("Target project does not belong to this event");
  }
  if (sub.status !== "submitted") {
    throw new Error("Only a submitted project can be set as the winner");
  }
  return sub;
}

function titleOf(sub: Doc<"submissions"> | null | undefined, fallback = "(unknown project)") {
  return sub?.title ?? fallback;
}

/** Pending requests across the platform (admin badge + review queue). */
export const pendingCount = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireOrganizer(ctx);
    if (actor.role !== "admin") return 0;
    const rows = await ctx.db
      .query("winnerOverrides")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    return rows.length;
  },
});

/**
 * Admin review queue with everything a decision needs: who asked, what they
 * asked for, what the computed ranking says today, and the reason.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireOrganizer(ctx);
    if (actor.role !== "admin") throw new Error("Admin required");

    const rows = await ctx.db.query("winnerOverrides").order("desc").collect();
    const out = [];
    for (const row of rows) {
      const event = await ctx.db.get(row.eventId);
      const target = await ctx.db.get(row.targetProjectId);
      const requester = await ctx.db.get(row.requestedBy);
      const team = target ? await ctx.db.get(target.teamId) : null;
      const reviewer = row.reviewedBy ? await ctx.db.get(row.reviewedBy) : null;

      // Computed #1, ignoring any override, so the reviewer sees the real delta.
      const { ranking } = await rankEventProjects(ctx, row.eventId, { ignoreOverride: true });
      const autoWinner = ranking[0];
      let autoWinnerSub: Doc<"submissions"> | null = null;
      if (autoWinner) {
        autoWinnerSub = await ctx.db.get<"submissions">(autoWinner.submissionId as Id<"submissions">);
      }

      out.push({
        id: String(row._id),
        eventId: String(row.eventId),
        eventTitle: event?.title ?? "(deleted event)",
        eventSlug: event?.slug ?? null,
        published: isResultsPublished(event),
        targetProjectId: String(row.targetProjectId),
        targetTitle: titleOf(target),
        targetTeam: team?.name ?? "—",
        requestedBy: requester?.name || requester?.email || "—",
        requestedByEmail: requester?.email ?? null,
        requestedAt: row.requestedAt,
        reason: row.reason,
        status: row.status,
        source: row.source ?? "organizer_request",
        reviewedBy: reviewer?.name ?? null,
        reviewedAt: row.reviewedAt ?? null,
        reviewerNote: row.reviewerNote ?? null,
        appliedAt: row.appliedAt ?? null,
        autoWinnerTitle: autoWinner?.title ?? titleOf(autoWinnerSub),
        autoWinnerId: autoWinner?.submissionId ?? null,
      });
    }
    return out;
  },
});

/** Requests for one event — the organizer's read-back of accept/reject + note. */
export const forEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    const event = await loadEventOrThrow(ctx, args.eventId);
    assertCanManageEvent(actor, event);

    const rows = await ctx.db
      .query("winnerOverrides")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    const requests = [];
    for (const row of rows) {
      const target = await ctx.db.get(row.targetProjectId);
      const requester = await ctx.db.get(row.requestedBy);
      requests.push({
        id: String(row._id),
        targetProjectId: String(row.targetProjectId),
        targetTitle: titleOf(target),
        requestedBy: requester?.name || requester?.email || "—",
        requestedAt: row.requestedAt,
        reason: row.reason,
        status: row.status,
        source: row.source ?? "organizer_request",
        reviewerNote: row.reviewerNote ?? null,
        reviewedAt: row.reviewedAt ?? null,
      });
    }
    requests.sort((a, b) => b.requestedAt - a.requestedAt);

    const auto = await rankEventProjects(ctx, args.eventId, { ignoreOverride: true });
    const effective = await rankEventProjects(ctx, args.eventId);

    let autoWinnerSub: Doc<"submissions"> | null = null;
    const topAuto = auto.ranking[0];
    if (topAuto) {
      autoWinnerSub = await ctx.db.get<"submissions">(topAuto.submissionId as Id<"submissions">);
    }
    let overriddenSub: Doc<"submissions"> | null = null;
    const overrideTarget = event.winnerOverrideProjectId;
    if (overrideTarget) {
      overriddenSub = await ctx.db.get<"submissions">(overrideTarget);
    }

    return {
      published: isResultsPublished(event),
      method: effective.method,
      winnerIsOverridden: Boolean(event.winnerIsOverridden && event.winnerOverrideProjectId),
      autoWinner: auto.ranking[0]
        ? {
            submissionId: auto.ranking[0].submissionId,
            title: auto.ranking[0].title ?? titleOf(autoWinnerSub),
            score: auto.ranking[0].score,
          }
        : null,
      effectiveWinner: effective.ranking[0]
        ? {
            submissionId: effective.ranking[0].submissionId,
            title: effective.ranking[0].title ?? titleOf(overriddenSub),
            overridden: Boolean(event.winnerIsOverridden),
          }
        : null,
      ranking: effective.ranking,
      requests,
    };
  },
});

/** Path A — an organizer asks an admin to pin a different winner. */
export const requestOverride = mutation({
  args: {
    eventId: v.id("events"),
    targetProjectId: v.id("submissions"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    const event = await loadEventOrThrow(ctx, args.eventId);
    assertCanManageEvent(actor, event);
    assertOverrideAllowed(event);

    const reason = (args.reason ?? "").trim();
    if (reason.length < MIN_REASON_LENGTH) {
      throw new Error(`A reason of at least ${MIN_REASON_LENGTH} characters is required`);
    }
    await requireSubmittedProject(ctx, args.eventId, args.targetProjectId);

    const existing = await ctx.db
      .query("winnerOverrides")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    if (existing.some((r) => r.status === "pending" && r.targetProjectId === args.targetProjectId)) {
      throw new Error("A request for this project is already awaiting review");
    }

    const now = Date.now();
    const overrideId = await ctx.db.insert("winnerOverrides", {
      eventId: args.eventId,
      requestedBy: actor._id,
      requestedAt: now,
      targetProjectId: args.targetProjectId,
      reason,
      status: "pending",
      source: "organizer_request",
    });

    await appendAudit(ctx, {
      eventId: args.eventId,
      actorId: actor._id,
      action: "winner_override.request",
      targetType: "winnerOverride",
      targetId: String(overrideId),
      afterState: JSON.stringify({ targetProjectId: String(args.targetProjectId), reason }),
    });

    return { ok: true, overrideId, status: "pending" as const };
  },
});

/** Admin decision on a pending request. Accepting applies it immediately. */
export const review = mutation({
  args: {
    overrideId: v.id("winnerOverrides"),
    decision: v.union(v.literal("accept"), v.literal("reject")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    if (actor.role !== "admin") throw new Error("Admin required");

    const request = await ctx.db.get(args.overrideId);
    if (!request) throw new Error("Override request not found");
    if (request.status !== "pending") throw new Error("This request has already been reviewed");

    const event = await loadEventOrThrow(ctx, request.eventId);
    assertOverrideAllowed(event);

    const note = (args.note ?? "").trim();
    const now = Date.now();

    if (args.decision === "reject") {
      if (note.length < 3) throw new Error("A note explaining the rejection is required");
      await ctx.db.patch(args.overrideId, {
        status: "rejected",
        reviewedBy: actor._id,
        reviewedAt: now,
        reviewerNote: note,
      });
      await appendAudit(ctx, {
        eventId: request.eventId,
        actorId: actor._id,
        action: "winner_override.reject",
        targetType: "winnerOverride",
        targetId: String(args.overrideId),
        beforeState: "pending",
        afterState: JSON.stringify({ status: "rejected", note }),
      });
      return { ok: true, status: "rejected" as const };
    }

    await ctx.db.patch(request.eventId, {
      winnerOverrideProjectId: request.targetProjectId,
      winnerIsOverridden: true,
    });
    await ctx.db.patch(args.overrideId, {
      status: "accepted",
      reviewedBy: actor._id,
      reviewedAt: now,
      reviewerNote: note || undefined,
      appliedAt: now,
    });
    await appendAudit(ctx, {
      eventId: request.eventId,
      actorId: actor._id,
      action: "winner_override.accept",
      targetType: "event",
      targetId: String(request.eventId),
      beforeState: JSON.stringify({ winnerOverrideProjectId: event.winnerOverrideProjectId ?? null }),
      afterState: JSON.stringify({
        winnerOverrideProjectId: String(request.targetProjectId),
        overrideId: String(args.overrideId),
        note,
      }),
    });
    return { ok: true, status: "accepted" as const };
  },
});

/** Path B — an admin pins a winner directly (UI requires the typed confirmation). */
export const directOverride = mutation({
  args: {
    eventId: v.id("events"),
    targetProjectId: v.id("submissions"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    if (actor.role !== "admin") throw new Error("Admin required");

    const event = await loadEventOrThrow(ctx, args.eventId);
    assertOverrideAllowed(event);
    const target = await requireSubmittedProject(ctx, args.eventId, args.targetProjectId);

    const now = Date.now();
    const reason = (args.reason ?? "").trim() || "Admin direct override";

    await ctx.db.patch(args.eventId, {
      winnerOverrideProjectId: args.targetProjectId,
      winnerIsOverridden: true,
    });

    const overrideId = await ctx.db.insert("winnerOverrides", {
      eventId: args.eventId,
      requestedBy: actor._id,
      requestedAt: now,
      targetProjectId: args.targetProjectId,
      reason,
      status: "accepted",
      source: "admin_direct",
      reviewedBy: actor._id,
      reviewedAt: now,
      appliedAt: now,
    });

    await appendAudit(ctx, {
      eventId: args.eventId,
      actorId: actor._id,
      action: "winner_override.direct",
      targetType: "event",
      targetId: String(args.eventId),
      beforeState: JSON.stringify({ winnerOverrideProjectId: event.winnerOverrideProjectId ?? null }),
      afterState: JSON.stringify({
        winnerOverrideProjectId: String(args.targetProjectId),
        winnerTitle: target.title,
        reason,
      }),
    });

    return { ok: true, overrideId, status: "accepted" as const };
  },
});

/** Remove an override and fall back to the computed winner (admin, pre-publish). */
export const clearOverride = mutation({
  args: { eventId: v.id("events"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    if (actor.role !== "admin") throw new Error("Admin required");
    const event = await loadEventOrThrow(ctx, args.eventId);
    assertOverrideAllowed(event);
    if (!event.winnerOverrideProjectId) throw new Error("This event has no winner override");

    await ctx.db.patch(args.eventId, {
      winnerOverrideProjectId: undefined,
      winnerIsOverridden: false,
    });
    await appendAudit(ctx, {
      eventId: args.eventId,
      actorId: actor._id,
      action: "winner_override.clear",
      targetType: "event",
      targetId: String(args.eventId),
      beforeState: JSON.stringify({ winnerOverrideProjectId: String(event.winnerOverrideProjectId) }),
      afterState: JSON.stringify({ winnerOverrideProjectId: null, note: (args.note ?? "").trim() }),
    });
    return { ok: true };
  },
});
