import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireUser } from "./lib/common";
import { appendAudit } from "./lib/audit";

/** Idempotent Event JSON import (T4.6). Admin/organizer can import a full event JSON file. */
export const eventFromJson = mutation({
  args: { jsonString: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.role !== "admin" && user.role !== "organizer") {
      throw new Error("Admin or organizer access required");
    }

    let parsed: any;
    try {
      parsed = JSON.parse(args.jsonString);
    } catch {
      throw new Error("Invalid JSON format");
    }

    const eventData = parsed.event || parsed;
    if (!eventData || !eventData.slug || !eventData.title) {
      throw new Error("Invalid event JSON payload: missing slug or title");
    }

    // Check if event already exists by slug (Idempotent: return existing ID if present)
    const existing = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", eventData.slug))
      .unique();

    if (existing) {
      return { ok: true, eventId: existing._id, imported: false, message: "Event already exists" };
    }

    const now = Date.now();
    const eventId = await ctx.db.insert("events", {
      slug: eventData.slug,
      title: eventData.title,
      tagline: eventData.tagline || "",
      description: eventData.description || "",
      status: eventData.status || "draft",
      registrationStart: eventData.registrationStart || now,
      registrationEnd: eventData.registrationEnd || now + 86400000,
      submissionDeadline: eventData.submissionDeadline || now + 86400000,
      judgingStart: eventData.judgingStart || now + 86400000,
      judgingEnd: eventData.judgingEnd || now + 172800000,
      votingStart: eventData.votingStart || now + 172800000,
      votingEnd: eventData.votingEnd || now + 172800000,
      timezone: eventData.timezone || "UTC",
      settings: eventData.settings || "max_team_size=4,voting_type=quadratic",
      organizerId: user._id,
      minTeamSize: eventData.minTeamSize || 1,
      maxTeamSize: eventData.maxTeamSize || 4,
      soloAllowed: eventData.soloAllowed ?? true,
      coverImageRequired: eventData.coverImageRequired ?? false,
    });

    // Import tracks
    if (Array.isArray(parsed.tracks)) {
      for (const t of parsed.tracks) {
        await ctx.db.insert("tracks", {
          eventId,
          name: t.name,
          description: t.description || "",
          prizeDescription: t.prizeDescription || "",
          prizeAmount: t.prizeAmount || 0,
        });
      }
    }

    // Import rubric criteria
    if (Array.isArray(parsed.rubric)) {
      for (const r of parsed.rubric) {
        await ctx.db.insert("rubricCriteria", {
          eventId,
          name: r.name,
          description: r.description || "",
          weight: r.weight || 0.25,
          minScore: r.minScore || 1,
          maxScore: r.maxScore || 10,
          sortOrder: r.sortOrder || 0,
        });
      }
    }

    await appendAudit(ctx, {
      eventId,
      actorId: user._id,
      action: "event.import_json",
      targetType: "event",
      targetId: String(eventId),
    });

    return { ok: true, eventId, imported: true };
  },
});
