import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireOrganizer } from "./lib/common";
import { appendAudit } from "./lib/audit";
import { requireText } from "../lib/validation";

/**
 * Help center content (issue 26+27): one table, two render modes.
 *
 * `type: "faq"` entries render in the public accordion; `type: "article"`
 * entries render as full markdown articles below it. Admins manage both from
 * /admin/help — one system, not two.
 */

const HELP_TYPES = ["faq", "article"] as const;

/** Public list: visible entries only, ordered by `order`. */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("helpContent").collect();
    return rows
      .filter((r) => r.visible)
      .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
      .map((r) => ({
        id: String(r._id),
        type: r.type,
        title: r.title,
        body: r.body,
        order: r.order,
      }));
  },
});

/** Admin list: everything, including hidden entries. */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireOrganizer(ctx);
    const rows = await ctx.db.query("helpContent").collect();
    return rows
      .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
      .map((r) => ({
        id: String(r._id),
        _id: r._id,
        type: r.type,
        title: r.title,
        body: r.body,
        order: r.order,
        visible: r.visible,
        updatedAt: r.updatedAt,
      }));
  },
});

/** Create a help entry (admin only, audited). */
export const create = mutation({
  args: {
    type: v.union(v.literal("faq"), v.literal("article")),
    title: v.string(),
    body: v.string(),
    visible: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    if (actor.role !== "admin") throw new Error("Admin required");
    const title = requireText("Title", args.title, { max: 200, required: true });
    const body = requireText("Body", args.body, { max: 20_000, singleLine: false, required: true });
    const now = Date.now();
    const existing = await ctx.db.query("helpContent").collect();
    const id = await ctx.db.insert("helpContent", {
      type: args.type,
      title,
      body,
      order: existing.length + 1,
      visible: args.visible ?? true,
      createdAt: now,
      updatedAt: now,
      createdBy: actor._id,
    });
    await appendAudit(ctx, {
      actorId: actor._id,
      action: "help.create",
      targetType: "helpContent",
      targetId: String(id),
      afterState: JSON.stringify({ type: args.type, title }),
    });
    return { id: String(id) };
  },
});

/** Update title/body/type (admin only, audited). */
export const update = mutation({
  args: {
    helpId: v.id("helpContent"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    type: v.optional(v.union(v.literal("faq"), v.literal("article"))),
  },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    if (actor.role !== "admin") throw new Error("Admin required");
    const row = await ctx.db.get(args.helpId);
    if (!row) throw new Error("Help entry not found");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = requireText("Title", args.title, { max: 200, required: true });
    if (args.body !== undefined) {
      patch.body = requireText("Body", args.body, { max: 20_000, singleLine: false, required: true });
    }
    if (args.type !== undefined && (HELP_TYPES as readonly string[]).includes(args.type)) {
      patch.type = args.type;
    }
    await ctx.db.patch(args.helpId, patch as never);
    await appendAudit(ctx, {
      actorId: actor._id,
      action: "help.update",
      targetType: "helpContent",
      targetId: String(args.helpId),
      beforeState: JSON.stringify({ title: row.title, type: row.type }),
      afterState: JSON.stringify({ title: patch.title ?? row.title, type: patch.type ?? row.type }),
    });
    return { ok: true };
  },
});

/** Reorder by moving one entry to an explicit position (admin only, audited). */
export const reorder = mutation({
  args: { helpId: v.id("helpContent"), direction: v.union(v.literal("up"), v.literal("down")) },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    if (actor.role !== "admin") throw new Error("Admin required");
    const rows = (await ctx.db.query("helpContent").collect()).sort(
      (a, b) => a.order - b.order || a.createdAt - b.createdAt,
    );
    const index = rows.findIndex((r) => r._id === args.helpId);
    if (index === -1) throw new Error("Help entry not found");
    const swapWith = args.direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= rows.length) return { ok: true };
    const moved = rows[index];
    const target = rows[swapWith];
    await ctx.db.patch(moved._id, { order: target.order, updatedAt: Date.now() });
    await ctx.db.patch(target._id, { order: moved.order, updatedAt: Date.now() });
    await appendAudit(ctx, {
      actorId: actor._id,
      action: "help.reorder",
      targetType: "helpContent",
      targetId: String(args.helpId),
      afterState: JSON.stringify({ direction: args.direction, title: moved.title }),
    });
    return { ok: true };
  },
});

/** Show/hide without deleting (admin only, audited). */
export const setVisible = mutation({
  args: { helpId: v.id("helpContent"), visible: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    if (actor.role !== "admin") throw new Error("Admin required");
    const row = await ctx.db.get(args.helpId);
    if (!row) throw new Error("Help entry not found");
    await ctx.db.patch(args.helpId, { visible: args.visible, updatedAt: Date.now() });
    await appendAudit(ctx, {
      actorId: actor._id,
      action: "help.set_visible",
      targetType: "helpContent",
      targetId: String(args.helpId),
      beforeState: JSON.stringify({ visible: row.visible }),
      afterState: JSON.stringify({ visible: args.visible }),
    });
    return { ok: true };
  },
});

/** Delete permanently (admin only, audited). */
export const remove = mutation({
  args: { helpId: v.id("helpContent") },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    if (actor.role !== "admin") throw new Error("Admin required");
    const row = await ctx.db.get(args.helpId);
    if (!row) throw new Error("Help entry not found");
    await ctx.db.delete(args.helpId);
    await appendAudit(ctx, {
      actorId: actor._id,
      action: "help.delete",
      targetType: "helpContent",
      targetId: String(args.helpId),
      beforeState: JSON.stringify({ title: row.title, type: row.type }),
      afterState: "deleted",
    });
    return { ok: true };
  },
});

/**
 * One-time seeding of the five default entries (issue 27). Idempotent: guarded
 * by a `platform` flag so repeated pushes never duplicate content.
 */
export const seedDefaultsInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const flag = await ctx.db
      .query("platform")
      .withIndex("by_key", (q) => q.eq("key", "help_content_seeded"))
      .unique();
    if (flag?.value === "done") return { seeded: 0 };

    const defaults: { type: "faq" | "article"; title: string; body: string }[] = [
      {
        type: "article",
        title: "How do I submit a project?",
        body: [
          "Projects are submitted from your **team workspace**.",
          "",
          "1. Join or create a team for the event.",
          "2. Fill in the title, tagline, description and repository URL — drafts autosave until the deadline.",
          "3. Press **Submit** before the submission deadline. After that the form locks automatically.",
          "",
          "Only the team leader can press Submit. You can withdraw back to a draft at any point before the deadline.",
        ].join("\n"),
      },
      {
        type: "faq",
        title: "When do results get published?",
        body: "Results appear once the organizers move the event to the **published** stage. Until then rankings stay hidden — no scores, badges or standings leak early. When they go live you get a notification (the bell in the sidebar) linking straight to the results page.",
      },
      {
        type: "faq",
        title: "How does quadratic voting work?",
        body: "In quadratic mode you spend **credits**, and casting N points on one project costs N×N credits. Two points cost 4 credits, three cost 9 — so concentrating influence on a single project gets expensive fast. Your remaining credits show on every project page while voting is open.",
      },
      {
        type: "faq",
        title: "Can I edit my submission after the deadline?",
        body: "No — the deadline locks submissions for everyone equally. If something is genuinely broken (a wrong link, a critical typo), contact your organizer: they can withdraw the entry for you from the event console, and you can resubmit while the event still allows it.",
      },
      {
        type: "article",
        title: "How do I invite judges?",
        body: [
          "Organizers invite judges from the **event console → Judges tab**:",
          "",
          "1. Open the event you manage and switch to **Judges**.",
          "2. Press **Invite judge** and copy the registration link.",
          "3. Share it with your judges — anyone signing up through it becomes a judge for that event.",
          "",
          "Platform admins can also mint role invites from **/admin/invites** with per-role expiry: admin 2 days, organizer 5 days, judge and participant 7 days.",
        ].join("\n"),
      },
    ];

    const now = Date.now();
    for (let i = 0; i < defaults.length; i++) {
      const entry = defaults[i];
      await ctx.db.insert("helpContent", {
        type: entry.type,
        title: entry.title,
        body: entry.body,
        order: i + 1,
        visible: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    const existingFlag = await ctx.db
      .query("platform")
      .withIndex("by_key", (q) => q.eq("key", "help_content_seeded"))
      .unique();
    if (existingFlag) {
      await ctx.db.patch(existingFlag._id, { value: "done" });
    } else {
      await ctx.db.insert("platform", { key: "help_content_seeded", value: "done" });
    }
    return { seeded: defaults.length };
  },
});
