import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOrganizer, requireUser } from "./lib/common";
import { appendAudit } from "./lib/audit";
import { hmacSha256Hex, randomHex, safeEqualHex } from "./crypto";

/**
 * Verifiable certificates (T4).
 * Signature = HMAC-SHA256(secret, canonical payload). The secret lives in the
 * platform KV table (`cert_secret`), generated on first use. Anyone can verify
 * a certificate with its UUID + signature via the public /verify page.
 */

async function getCertSecret(ctx: any): Promise<string> {
  const row = await ctx.db
    .query("platform")
    .withIndex("by_key", (q: any) => q.eq("key", "cert_secret"))
    .unique();
  if (row) return row.value;
  const secret = `raptor-cert-${randomHex(32)}`;
  await ctx.db.insert("platform", { key: "cert_secret", value: secret });
  return secret;
}

function canonicalPayload(p: {
  certUuid: string;
  recipientName: string;
  certType: string;
  title: string;
  trackName: string;
  rank: number;
  issuedAt: number;
}): string {
  return [p.certUuid, p.recipientName, p.certType, p.title, p.trackName, p.rank, p.issuedAt].join("|");
}

export const issue = mutation({
  args: {
    eventId: v.id("events"),
    userId: v.id("users"),
    certType: v.union(v.literal("participant"), v.literal("judge"), v.literal("winner")),
    title: v.string(),
    trackName: v.optional(v.string()),
    rank: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireOrganizer(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    const secret = await getCertSecret(ctx);
    const certUuid = randomHex(16);
    const issuedAt = Date.now();
    const payload = {
      certUuid,
      recipientName: user.name,
      certType: args.certType,
      title: args.title,
      trackName: args.trackName ?? "",
      rank: args.rank ?? 0,
      issuedAt,
    };
    const signatureHash = await hmacSha256Hex(secret, canonicalPayload(payload));
    const id = await ctx.db.insert("certificates", {
      ...payload,
      eventId: args.eventId,
      userId: args.userId,
      signatureHash,
      issuedAt,
    });
    await appendAudit(ctx, {
      eventId: args.eventId,
      actorId: actor._id,
      action: "certificate.issue",
      targetType: "certificate",
      targetId: certUuid,
      afterState: JSON.stringify({ certType: args.certType, recipient: user.email }),
    });
    return { certificateId: id, certUuid, signatureHash };
  },
});

/** Issue certificates for every participant and judge of an event (bulk). */
export const issueAll = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    const memberRows = await ctx.db.query("teamMembers").collect();
    const teamRows = await ctx.db
      .query("teams")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const eventTeamIds = new Set(teamRows.map((t) => String(t._id)));
    const participantIds = [...new Set(memberRows.filter((m) => eventTeamIds.has(String(m.teamId))).map((m) => String(m.userId)))];
    const judges = (await ctx.db.query("users").collect()).filter((u) => u.role === "judge");

    const created: string[] = [];
    for (const pid of participantIds) {
      const res = await issueCertInternal(ctx, args.eventId, pid, "participant", `${event.title} — Participant`);
      created.push(res.certUuid);
    }
    for (const j of judges) {
      const res = await issueCertInternal(ctx, args.eventId, String(j._id), "judge", `${event.title} — Judge`);
      created.push(res.certUuid);
    }
    await appendAudit(ctx, {
      eventId: args.eventId,
      action: "certificate.bulk_issue",
      targetType: "event",
      targetId: String(args.eventId),
      afterState: JSON.stringify({ count: created.length }),
    });
    return { issued: created.length, certUuids: created };
  },
});

async function issueCertInternal(
  ctx: any,
  eventId: string,
  userId: string,
  certType: string,
  title: string,
  rank = 0,
  trackName = "",
): Promise<{ certUuid: string; signatureHash: string }> {
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User not found");
  const secret = await getCertSecret(ctx);
  const certUuid = randomHex(16);
  const issuedAt = Date.now();
  const payload = { certUuid, recipientName: user.name, certType, title, trackName, rank, issuedAt };
  const signatureHash = await hmacSha256Hex(secret, canonicalPayload(payload));
  await ctx.db.insert("certificates", {
    ...payload,
    eventId,
    userId,
    signatureHash,
    issuedAt,
  });
  return { certUuid, signatureHash };
}

/** Public verification: recompute HMAC and compare in constant time. */
export const verify = query({
  args: { certUuid: v.string(), signature: v.string() },
  handler: async (ctx, args) => {
    const cert = await ctx.db
      .query("certificates")
      .withIndex("by_uuid", (q) => q.eq("certUuid", args.certUuid))
      .unique();
    if (!cert) return { valid: false, reason: "certificate not found" };
    const secret = await getCertSecret(ctx);
    const expected = await hmacSha256Hex(
      secret,
      canonicalPayload({
        certUuid: cert.certUuid,
        recipientName: cert.recipientName,
        certType: cert.certType,
        title: cert.title,
        trackName: cert.trackName,
        rank: cert.rank,
        issuedAt: cert.issuedAt,
      }),
    );
    const valid = safeEqualHex(expected, args.signature);
    return {
      valid,
      reason: valid ? null : "signature mismatch — certificate may be forged",
      certificate: valid
        ? {
            certUuid: cert.certUuid,
            recipientName: cert.recipientName,
            certType: cert.certType,
            title: cert.title,
            trackName: cert.trackName,
            rank: cert.rank,
            issuedAt: cert.issuedAt,
            signatureHash: cert.signatureHash,
          }
        : null,
    };
  },
});

/** Certificates for the current user ("my credentials"). */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const all = await ctx.db.query("certificates").collect();
    return all.filter((c) => c.userId === user._id);
  },
});

export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx);
    const certs = await ctx.db
      .query("certificates")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const users = await ctx.db.query("users").collect();
    return certs.map((c) => ({
      ...c,
      email: users.find((u) => u._id === c.userId)?.email ?? "—",
    }));
  },
});
