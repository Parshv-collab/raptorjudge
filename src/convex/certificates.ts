import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireOrganizer, requireUser } from "./lib/common";
import { appendAudit } from "./lib/audit";
import { hmacSha256Hex, randomHex, safeEqualHex } from "./crypto";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Verifiable certificates (T4).
 * Signature = HMAC-SHA256(secret, canonical payload). The secret lives in the
 * platform KV table (`cert_secret`), generated on first use. Anyone can verify
 * a certificate with its UUID + signature via the public /verify page.
 *
 * Race conditions (security item 58)
 * ---------------------------------
 * Convex mutations are serializable and use optimistic concurrency control, so
 * the read-then-write sequences here ("is there already a certificate for this
 * recipient?", "is this the first issuance of the cert secret?") cannot
 * interleave: a conflicting mutation is retried, not merged. Issuance is
 * therefore also made *idempotent* on top of that — a repeated
 * `issue`/`issueAll` for the same (event, recipient, type, title, rank) returns
 * the existing certificate instead of minting a second one. Idempotency (not
 * just serializability) is what makes a retried request — or an organizer
 * clicking "issue certificates" twice — safe.
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

/**
 * Existing certificate for a recipient/type/title, if any — the idempotency key.
 * `rank` participates so a gold and a silver award are distinct certificates.
 */
async function findExistingCertificate(
  ctx: any,
  eventId: Id<"events">,
  userId: Id<"users">,
  certType: string,
  title: string,
  rank: number,
): Promise<Doc<"certificates"> | null> {
  const rows = await ctx.db
    .query("certificates")
    .withIndex("by_event", (q: any) => q.eq("eventId", eventId))
    .collect();
  return (
    rows.find(
      (c: Doc<"certificates">) =>
        c.userId === userId && c.certType === certType && c.title === title && c.rank === rank,
    ) ?? null
  );
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

    // Idempotent: re-issuing the same certificate returns the original one, so
    // its UUID and signature stay stable and verification links keep working.
    const existing = await findExistingCertificate(
      ctx,
      args.eventId,
      args.userId,
      args.certType,
      args.title,
      args.rank ?? 0,
    );
    if (existing) {
      return {
        certificateId: existing._id,
        certUuid: existing.certUuid,
        signatureHash: existing.signatureHash,
        reused: true,
      };
    }

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
    return { certificateId: id, certUuid, signatureHash, reused: false };
  },
});

/**
 * Bulk issuance without an actor check, for the seed action.
 *
 * `issueAll` is organizer-gated and a seed action has no identity, so the seed
 * cannot call it. Internal-only, so clients still go through `issueAll`.
 */
export const issueAllInternal = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => issueAllHelper(ctx, args.eventId),
});

/** Issue certificates for every participant and judge of an event (bulk). */
export const issueAll = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx);
    return issueAllHelper(ctx, args.eventId);
  },
});

// Explicit return type: the seed action calls `issueAllInternal` via
// `internal.*`, and an inferred return type here would put `certificates` and
// `seed` in a mutual type-inference cycle (`fullApi` → seed → internal →
// fullApi), which tsc can only resolve as `any`.
async function issueAllHelper(
  ctx: any,
  eventId: Id<"events">,
): Promise<{ issued: number; reused: number; certUuids: string[] }> {
  const event = await ctx.db.get(eventId);
    if (!event) throw new Error("Event not found");
    const memberRows = await ctx.db.query("teamMembers").collect();
    const teamRows = await ctx.db
      .query("teams")
      .withIndex("by_event", (q: any) => q.eq("eventId", eventId))
      .collect();
    const eventTeamIds = new Set(teamRows.map((t: any) => String(t._id)));
    const participantIds = [...new Set(memberRows.filter((m: any) => eventTeamIds.has(String(m.teamId))).map((m: any) => String(m.userId)))];
    const judges = (await ctx.db.query("users").collect()).filter((u: any) => u.role === "judge");

    const certUuids: string[] = [];
    let reused = 0;
    const mint = async (userId: Id<"users">, certType: string, title: string) => {
      const res = await issueCertInternal(ctx, eventId, userId, certType, title);
      if (res.reused) reused++;
      certUuids.push(res.certUuid);
    };

    for (const pid of participantIds) {
      await mint(
        pid as Id<"users">,
        "participant",
        `${event.title} — Participant`,
      );
    }
    for (const j of judges) {
      await mint(j._id, "judge", `${event.title} — Judge`);
    }
    await appendAudit(ctx, {
      eventId,
      action: "certificate.bulk_issue",
      targetType: "event",
      targetId: String(eventId),
      afterState: JSON.stringify({ count: certUuids.length, reused }),
    });
  // `issued` stays the total for the dashboard; `reused` makes a re-run visible.
  return { issued: certUuids.length, reused, certUuids };
}

async function issueCertInternal(
  ctx: any,
  eventId: Id<"events">,
  userId: Id<"users">,
  certType: string,
  title: string,
  rank = 0,
  trackName = "",
): Promise<{ certUuid: string; signatureHash: string; reused: boolean }> {
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User not found");

  // Same idempotency key as `issue`, so `issueAll` is safe to re-run.
  const existing = await findExistingCertificate(ctx, eventId, userId, certType, title, rank);
  if (existing) {
    return { certUuid: existing.certUuid, signatureHash: existing.signatureHash, reused: true };
  }

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
  return { certUuid, signatureHash, reused: false };
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
