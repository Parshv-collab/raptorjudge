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
import { hmacSha256Hex, randomHex } from "./crypto";
import { signedPayload } from "./lib/webhookSignature";
import { assertWebhookTargetUrl } from "../lib/webhookTarget";

/**
 * Webhooks (T4). Organizers register target URLs with per-webhook secrets.
 * Delivery runs in an action; failures are logged with status code for retry
 * and inspection.
 *
 * Replay protection (security item 59): each delivery is signed over
 * `"<timestamp>.<delivery id>.<raw body>"` with a fresh 128-bit nonce, and is
 * sent with `X-RaptorJudge-Timestamp` / `X-RaptorJudge-Delivery` headers.
 * Receivers must reject payloads older than five minutes and remember the
 * nonce for that window — see src/convex/lib/webhookSignature.ts, whose
 * `verifyDelivery()` is the reference implementation (and is exercised by the
 * acceptance suite). {@link WEBHOOK_REPLAY_WINDOW_MS} is the window.
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
    // Security items 64 + 67: the old check was a `^https?://` regex, which let
    // `https://user:pass@host`, cloud-metadata addresses and trailing garbage
    // through to the delivery `fetch`. See src/lib/webhookTarget.ts.
    const targetUrl = assertWebhookTargetUrl(args.targetUrl);
    // A 256-bit random secret (the previous Math.random() pairing was neither
    // unpredictable nor that long); shown once at registration, HMAC key after.
    const secretKey = `whsec_${randomHex(32)}`;
    const id = await ctx.db.insert("webhooks", {
      eventId: args.eventId,
      targetUrl,
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
      afterState: JSON.stringify({ targetUrl, events: args.events }),
    });
    return { webhookId: id, secretKey }; // secret shown once at registration
  },
});

export const setActive = mutation({
  args: { webhookId: v.id("webhooks"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    const hook = await ctx.db.get(args.webhookId);
    if (!hook) throw new Error("Webhook not found");
    await ctx.db.patch(args.webhookId, { isActive: args.isActive });
    // Pausing an endpoint stops deliveries silently, so it belongs in the chain.
    await appendAudit(ctx, {
      eventId: hook.eventId,
      actorId: actor._id,
      action: "webhook.set_active",
      targetType: "webhook",
      targetId: String(args.webhookId),
      beforeState: JSON.stringify({ isActive: hook.isActive }),
      afterState: JSON.stringify({ isActive: args.isActive }),
    });
    return { ok: true };
  },
});

/**
 * Fire an event to all matching active webhooks.
 *
 * Internal only (security): this fans an attacker-chosen payload out to every
 * registered endpoint of an event. As a public mutation any authenticated caller
 * could POST to `api.webhooks.dispatch` and make the deployment issue arbitrary
 * outbound requests, so it is no longer reachable from the client.
 */
export const dispatch = internalMutation({
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
    // A fresh nonce per delivery (single-use within the replay window) and a
    // send timestamp; both are covered by the signature below.
    const timestamp = Date.now();
    const deliveryId = randomHex(16);
    const body = JSON.stringify({
      id: deliveryId,
      type: args.eventType,
      timestamp,
      deliveredAt: timestamp,
      data: JSON.parse(args.payload || "{}"),
    });
    const signature = await hmacSha256Hex(
      hook.secretKey,
      signedPayload(timestamp, deliveryId, body),
    );
    let statusCode = 0;
    let success = false;
    try {
      const res = await fetch(hook.targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RaptorJudge-Event": args.eventType,
          "X-RaptorJudge-Delivery": deliveryId,
          "X-RaptorJudge-Timestamp": String(timestamp),
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
