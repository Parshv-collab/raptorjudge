import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { requireRole } from "./lib/common";
import { appendAudit } from "./lib/audit";
import { randomHex } from "./crypto";
import { openSecret, sealSecret } from "./lib/secretBox";
import {
  buildOtpauthUri,
  formatSecretForDisplay,
  generateTotpSecret,
  totpSecondsRemaining,
  verifyTotp,
  TOTP_DIGITS,
} from "../lib/totp";
import { INVALID_TOTP, TOTP_LOCKED, TOTP_UNAVAILABLE } from "./lib/signInErrors";

/**
 * Optional TOTP two-factor authentication (security item 55), for **admin and
 * organizer accounts only** — the roles that can change roles, run
 * assignments, issue certificates and export data.
 *
 * Flow
 * ----
 * 1. `enroll()`   → mint a 160-bit base32 secret, store it *sealed* (AES-256-GCM,
 *                   see lib/secretBox.ts) with `totpEnabled: false`, hand back
 *                   the `otpauth://` URI + a human-typed secret. Nothing is
 *                   enforced yet, so a botched scan cannot lock anyone out.
 * 2. `confirm()`  → verify a live code, flip `totpEnabled: true`, audit it.
 * 3. Sign-in      → src/convex/auth.ts calls `signInChallenge` after the
 *                   password succeeds; when a factor is enrolled it demands a
 *                   code *before* the session is minted, and `verifySecondFactor`
 *                   checks it with a ±1 step window and a failure lockout.
 * 4. `disable()`  → requires a valid current code (or an admin override) and
 *                   clears the sealed secret.
 *
 * Everything is local: no SMS/e-mail/push provider, no network, no external
 * identity service. Participants and judges are unaffected.
 */

/** Consecutive wrong codes before the second factor locks out. */
export const MAX_TOTP_ATTEMPTS = 5;
/** How long a locked-out second factor stays locked. */
export const TOTP_LOCKOUT_MS = 5 * 60_000;

/** Roles that may enrol a TOTP second factor. */
const MFA_ROLES = ["admin", "organizer"] as const;

/** The deployment's data key for sealed secrets (created on first enrolment). */
const MASTER_KEY_ROW = "totp_master_key";

/**
 * Issue 28: the failure mode behind every "That code is not valid" at confirm
 * time when the real problem is the stored secret being unreadable (lost or
 * rotated data key, corrupted payload). Fail loudly with the dedicated marker
 * instead of lying to the user that their authenticator app is wrong.
 */
async function openSecretOrThrow(ctx: { db: any }, sealed: string): Promise<string> {
  const key = await existingMasterKey(ctx);
  if (!key) throw new Error(TOTP_UNAVAILABLE);
  try {
    return await openSecret(key, sealed);
  } catch {
    throw new Error(TOTP_UNAVAILABLE);
  }
}

async function masterKey(ctx: { db: any }): Promise<string> {
  const row = await ctx.db
    .query("platform")
    .withIndex("by_key", (q: any) => q.eq("key", MASTER_KEY_ROW))
    .unique();
  if (row) return row.value;
  const value = randomHex(32);
  await ctx.db.insert("platform", { key: MASTER_KEY_ROW, value });
  return value;
}

/** Read-only lookup; never creates the key (queries cannot write). */
async function existingMasterKey(ctx: { db: any }): Promise<string | null> {
  const row = await ctx.db
    .query("platform")
    .withIndex("by_key", (q: any) => q.eq("key", MASTER_KEY_ROW))
    .unique();
  return row?.value ?? null;
}

const failKey = (userId: string) => `totp_fail:${userId}`;

interface AttemptState {
  count: number;
  firstAt: number;
}

async function readAttempts(ctx: { db: any }, userId: string): Promise<AttemptState> {
  const row = await ctx.db
    .query("platform")
    .withIndex("by_key", (q: any) => q.eq("key", failKey(userId)))
    .unique();
  if (!row) return { count: 0, firstAt: 0 };
  try {
    return JSON.parse(row.value) as AttemptState;
  } catch {
    return { count: 0, firstAt: 0 };
  }
}

async function writeAttempts(
  ctx: { db: any },
  userId: string,
  state: AttemptState,
): Promise<void> {
  const row = await ctx.db
    .query("platform")
    .withIndex("by_key", (q: any) => q.eq("key", failKey(userId)))
    .unique();
  const value = JSON.stringify(state);
  if (row) await ctx.db.patch(row._id, { value });
  else await ctx.db.insert("platform", { key: failKey(userId), value });
}

/** True when this account has burned through its code attempts. */
function isLocked(state: AttemptState, now: number): boolean {
  return state.count >= MAX_TOTP_ATTEMPTS && now - state.firstAt < TOTP_LOCKOUT_MS;
}

/** Roles eligible for TOTP (participants/judges never see the settings UI). */
function mfaEligible(role: string | undefined): boolean {
  return (MFA_ROLES as readonly string[]).includes(role ?? "");
}

// ------------------------------------------------------------------ status ---

/** Is a second factor available/armed for me? Also drives the settings UI. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, "admin", "organizer");
    return {
      eligible: true,
      enabled: user.totpEnabled === true,
      pendingEnrollment: !!user.totpSecret && user.totpEnabled !== true,
      enrolledAt: user.totpEnrolledAt ?? null,
      lastVerifiedAt: user.totpLastVerifiedAt ?? null,
      digits: TOTP_DIGITS,
      stepSeconds: 30,
      window: 1,
      lockoutMs: TOTP_LOCKOUT_MS,
      maxAttempts: MAX_TOTP_ATTEMPTS,
    };
  },
});

// ---------------------------------------------------------------- enrolment ---

/** Step 1: mint a secret and return the QR/otpauth payload. Not yet enforced. */
export const enroll = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, ...MFA_ROLES);
    if (user.totpEnabled) {
      throw new Error("A second factor is already enabled — disable it first");
    }
    // Issue 28: the secret returned here is the ONLY source of truth for what
    // lands in the authenticator app. It is minted, immediately sealed with the
    // same master key confirm() will later read, persisted verbatim, and only
    // then handed back — so the persisted secret can never drift from the one
    // shown/QR'd to the user.
    const secret = generateTotpSecret();
    const key = await masterKey(ctx);
    const sealed = await sealSecret(key, secret);
    if ((await openSecret(key, sealed)) !== secret) {
      // Fail closed *before* anything is stored or shown: a round-trip mismatch
      // here would hand the user a key that can never verify.
      throw new Error(TOTP_UNAVAILABLE);
    }
    await ctx.db.patch(user._id, {
      totpSecret: sealed,
      totpEnabled: false,
    });
    await appendAudit(ctx, {
      actorId: user._id,
      action: "mfa.enroll_started",
      targetType: "user",
      targetId: String(user._id),
    });
    return {
      otpauthUri: buildOtpauthUri({ secret, accountName: user.email }),
      secretForManualEntry: formatSecretForDisplay(secret),
      /** Raw unpadded base32, for QR libraries that want the bare key. */
      secretRaw: secret,
      digits: TOTP_DIGITS,
      stepSeconds: 30,
    };
  },
});

/** Step 2: prove the authenticator works, then arm the factor. */
export const confirm = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ...MFA_ROLES);
    if (!user.totpSecret) throw new Error("Start enrolment first");
    if (user.totpEnabled) throw new Error("A second factor is already enabled");

    // Issue 28: an unreadable stored secret is a server-side fault (data key
    // lost/rotated), not a user typo. Say so instead of "That code is not
    // valid", which sent every affected user into an endless retype loop.
    const secret = await openSecretOrThrow(ctx, user.totpSecret);
    if (!(await verifyTotp(secret, args.code))) {
      throw new Error("That code is not valid — check your authenticator app");
    }

    const now = Date.now();
    await ctx.db.patch(user._id, { totpEnabled: true, totpEnrolledAt: now });
    await appendAudit(ctx, {
      actorId: user._id,
      action: "mfa.enabled",
      targetType: "user",
      targetId: String(user._id),
    });
    return { ok: true, enabledAt: now };
  },
});

/** Turn the factor off. Requires a live code so a hijacked session cannot. */
export const disable = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ...MFA_ROLES);
    if (!user.totpEnabled || !user.totpSecret) {
      throw new Error("No second factor is enabled");
    }
    const secret = await openSecretOrThrow(ctx, user.totpSecret);
    if (!(await verifyTotp(secret, args.code))) {
      throw new Error("That code is not valid — check your authenticator app");
    }
    await ctx.db.patch(user._id, {
      totpSecret: undefined,
      totpEnabled: false,
      totpEnrolledAt: undefined,
    });
    await appendAudit(ctx, {
      actorId: user._id,
      action: "mfa.disabled",
      targetType: "user",
      targetId: String(user._id),
      beforeState: "enabled",
      afterState: "disabled",
    });
    return { ok: true };
  },
});

// ------------------------------------------------------------ sign-in gate ---

/**
 * Called by the guarded `authorize` after the password check succeeds.
 * `required` is the only thing sign-in needs; no secret ever leaves the server.
 */
export const signInChallenge = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return { required: false, eligible: false };
    const attempts = await readAttempts(ctx, String(args.userId));
    return {
      required: user.totpEnabled === true && !!user.totpSecret,
      eligible: mfaEligible(user.role),
      locked: isLocked(attempts, Date.now()),
      secondsRemaining: totpSecondsRemaining(),
    };
  },
});

/**
 * Verify the second factor during sign-in. Failures are counted per account
 * with a lockout window; success resets the counter and stamps the last
 * verification time. Returns a discriminated result so the caller can throw the
 * right marker (`TOTP_REQUIRED` / `INVALID_TOTP` / `TOTP_LOCKED`).
 */
export const verifySecondFactor = internalMutation({
  args: { userId: v.id("users"), code: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: boolean; marker?: string; attemptsLeft?: number }> => {
    const user = await ctx.db.get(args.userId);
    if (!user) return { ok: false, marker: INVALID_TOTP };
    if (!user.totpEnabled || !user.totpSecret) return { ok: true };

    const now = Date.now();
    const state = await readAttempts(ctx, String(args.userId));
    if (isLocked(state, now)) return { ok: false, marker: TOTP_LOCKED };

    const key = await existingMasterKey(ctx);
    if (!key) {
      // Secret is unreadable (data key rotated/lost): fail closed rather than
      // letting the factor be silently skipped, but say *why* — a
      // TOTP_REQUIRED here would loop the client forever.
      await appendAudit(ctx, {
        actorId: args.userId,
        action: "mfa.unavailable",
        targetType: "user",
        targetId: String(args.userId),
      });
      throw new Error(TOTP_UNAVAILABLE);
    }

    let secret: string;
    try {
      secret = await openSecret(key, user.totpSecret);
    } catch {
      // Tampered or unopenable payload: treat exactly like a missing key.
      await appendAudit(ctx, {
        actorId: args.userId,
        action: "mfa.unavailable",
        targetType: "user",
        targetId: String(args.userId),
        afterState: "secret box unreadable",
      });
      throw new Error(TOTP_UNAVAILABLE);
    }
    if (await verifyTotp(secret, args.code)) {
      await writeAttempts(ctx, String(args.userId), { count: 0, firstAt: 0 });
      await ctx.db.patch(args.userId, { totpLastVerifiedAt: now });
      return { ok: true };
    }

    // Reset the window after the lockout elapses so the account recovers.
    const next: AttemptState =
      now - state.firstAt > TOTP_LOCKOUT_MS ? { count: 1, firstAt: now } : { count: state.count + 1, firstAt: state.firstAt };
    await writeAttempts(ctx, String(args.userId), next);
    if (next.count >= MAX_TOTP_ATTEMPTS) {
      await appendAudit(ctx, {
        actorId: args.userId,
        action: "mfa.locked_out",
        targetType: "user",
        targetId: String(args.userId),
        afterState: JSON.stringify({ attempts: next.count }),
      });
      return { ok: false, marker: TOTP_LOCKED };
    }
    return { ok: false, marker: INVALID_TOTP, attemptsLeft: MAX_TOTP_ATTEMPTS - next.count };
  },
});

/**
 * Clear all second-factor state for a user (admin recovery path when someone
 * loses their authenticator). Audited, and deliberately requires the caller to
 * be an admin — organisers cannot clear another organiser's factor.
 */
export const adminReset = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");
    await ctx.db.patch(args.userId, {
      totpSecret: undefined,
      totpEnabled: false,
      totpEnrolledAt: undefined,
      totpLastVerifiedAt: undefined,
    });
    await writeAttempts(ctx, String(args.userId), { count: 0, firstAt: 0 });
    await appendAudit(ctx, {
      actorId: actor._id,
      action: "mfa.admin_reset",
      targetType: "user",
      targetId: String(args.userId),
      beforeState: JSON.stringify({ email: target.email, enabled: target.totpEnabled ?? false }),
    });
    return { ok: true };
  },
});
