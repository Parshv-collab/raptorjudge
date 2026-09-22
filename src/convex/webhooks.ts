import { v } from "convex/values";
import {
  mutation,
  query,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireOrganizer } from "./lib/common";
import { appendAudit } from "./lib/audit";
import { hmacSha256Hex } from "./crypto";

/**
 * Webhooks (T4). Organizers register target URLs with per-webhook secrets.
 * Deliveries carry an X-RaptorJudge-Signature: HMAC-SHA256(secret, body)
 * header so receivers can verify authenticity. Delivery runs in an action;
 * failures are logged with status code for retry/inspection.
 */

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx);
    const rows = await ctx.db
      .query("webhooks")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    // never leak secret keys to the client
    return rows.map(({ secretKey: _s, ...rest }) => rest);
  },
});

export const deliveries = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx);
    const hooks = await ctx.db
      .query("webhooks")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const out = [];
    for (const h of hooks) {
      const rows = await ctx.db
        .query("webhookDeliveries")
        .withIndex("by_webhook", (q) => q.eq("webhookId", h._id))
        .collect();
      for (const d of rows) out.push({ ...d, targetUrl: h.targetUrl });
    }
    return out.sort((a, b) => b.deliveredAt - a.deliveredAt).slice(0, 50);
  },
});

export const register = mutation({
  args: {
    eventId: v.id("events"),
    targetUrl: v.string(),
    events: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx);
    if (!/^https?:\/\//.test(args.targetUrl)) throw new Error("targetUrl must be http(s)");
    const secretKey = `whsec_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    const id = await ctx.db.insert("webhooks", {
      eventId: args.eventId,
      targetUrl: args.targetUrl,
      secretKey,
      events: args.events,
      isActive: true,
      createdAt: Date.now(),
    });
    await appendAudit(ctx, {
      eventId: args.eventId,
      action: "webhook.register",
      targetType: "webhook",
      targetId: String(id),
      afterState: JSON.stringify({ targetUrl: args.targetUrl, events: args.events }),
    });
    return { webhookId: id, secretKey }; // secret shown once at registration
  },
});

export const setActive = mutation({
  args: { webhookId: v.id("webhooks"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx);
    await ctx.db.patch(args.webhookId, { isActive: args.isActive });
    return { ok: true };
  },
});

/** Fire an event to all matching active webhooks (called by domain mutations via scheduler). */
export const dispatch = mutation({
  args: {
    eventId: v.id("events"),
    eventType: v.string(),
    payload: v.string(),
  },
  handler: async (ctx, args) => {
    const hooks = await ctx.db
      .query("webhooks")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const active = hooks.filter(
      (h) => h.isActive && (h.events.split(",").map((s) => s.trim()).includes(args.eventType) || h.events.trim() === "*"),
    );
    for (const h of active) {
      await ctx.scheduler.runAfter(0, internal.webhooks.deliver, {
        webhookId: h._id,
        eventType: args.eventType,
        payload: args.payload,
      });
    }
    return { dispatched: active.length };
  },
});

/** Perform the HTTP delivery (action context allows fetch). */
export const deliver = internalAction({
  args: {
    webhookId: v.id("webhooks"),
    eventType: v.string(),
    payload: v.string(),
  },
  handler: async (ctx, args) => {
    const hook = await ctx.runQuery(internal.webhooks.getHook, { webhookId: args.webhookId });
    if (!hook) return;
    const body = JSON.stringify({
      type: args.eventType,
      deliveredAt: Date.now(),
      data: JSON.parse(args.payload || "{}"),
    });
    const signature = await hmacSha256Hex(hook.secretKey, body);
    let statusCode = 0;
    let success = false;
    try {
      const res = await fetch(hook.targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RaptorJudge-Event": args.eventType,
          "X-RaptorJudge-Signature": `sha256=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      statusCode = res.status;
      success = res.ok;
    } catch {
      success = false;
    }
    await ctx.runMutation(internal.webhooks.logDelivery, {
      webhookId: args.webhookId,
      eventType: args.eventType,
      payload: body,
      statusCode,
      success,
    });
  },
});

export const getHook = internalQuery({
  args: { webhookId: v.id("webhooks") },
  handler: async (ctx, args) => ctx.db.get(args.webhookId),
});

export const logDelivery = internalMutation({
  args: {
    webhookId: v.id("webhooks"),
    eventType: v.string(),
    payload: v.string(),
    statusCode: v.number(),
    success: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("webhookDeliveries", {
      webhookId: args.webhookId,
      eventType: args.eventType,
      payload: args.payload,
      statusCode: args.statusCode,
      success: args.success,
      deliveredAt: Date.now(),
    });
  },
});

/** Test delivery (organizer). */
export const testDelivery = mutation({
  args: { webhookId: v.id("webhooks") },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx);
    const hook = await ctx.db.get(args.webhookId);
    if (!hook) throw new Error("Webhook not found");
    await ctx.scheduler.runAfter(0, internal.webhooks.deliver, {
      webhookId: args.webhookId,
      eventType: "ping",
      payload: JSON.stringify({ test: true, source: "raptorjudge" }),
    });
    return { ok: true };
  },
});
