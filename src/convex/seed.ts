import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { createAccount, modifyAccountCredentials, retrieveAccount } from "@convex-dev/auth/server";
import { sha256Hex, hmacSha256Hex, randomHex, mulberry32 } from "./crypto";
import { appendAudit } from "./lib/audit";
import { planJudgeAssignments } from "../lib/algorithms/assignment";
import { bradleyTerry } from "../lib/algorithms/pairwise";

/**
 * Fixture seeder. Creates the full Dogfood 2026 demo dataset offline:
 * accounts, event, tracks, rubric, teams, 12 submissions, purposefully biased
 * judge scores (Dr. Strict ~4.2, Prof. Generous ~8.7, Alice Balanced ~6.5),
 * pairwise matches, community votes, comments, webhooks, and certificates.
 */

const DAY = 24 * 60 * 60 * 1000;

/** The single password every seeded demo account shares (see README). */
const SEED_PASSWORD = "dogfood2026";

const SEED_USERS = [
  { email: "admin@raptors.dev", name: "Rex Adminson", role: "admin", bio: "Platform administrator, Hackathon Raptors" },
  { email: "organizer@raptors.dev", name: "Olive Oganizer", role: "organizer", bio: "Runs the Dogfood 2026 challenge" },
  { email: "judge1@raptors.dev", name: "Dr. Strict", role: "judge", bio: "Principal engineer. Scores honestly, and honestly low." },
  { email: "judge2@raptors.dev", name: "Prof. Generous", role: "judge", bio: "CS professor. Believes every student deserves an A." },
  { email: "judge3@raptors.dev", name: "Alice Balanced", role: "judge", bio: "Staff ML engineer. Well-calibrated, middle of the road." },
  { email: "judge4@raptors.dev", name: "Kai Edgecase", role: "judge", bio: "Security engineer. Loves rubric edge cases." },
  { email: "participant1@raptors.dev", name: "Percy Participant", role: "participant", bio: "Full-stack dev, ships fast." },
  { email: "participant2@raptors.dev", name: "Paula Builder", role: "participant", bio: "Design-minded frontend engineer." },
  { email: "participant3@raptors.dev", name: "Sam Systems", role: "participant", bio: "Backend and infra specialist." },
  { email: "participant4@raptors.dev", name: "Dana Data", role: "participant", bio: "Data scientist turned hacker." },
  { email: "participant5@raptors.dev", name: "Riley Rapid", role: "participant", bio: "Solo hacker, speed demon." },
  { email: "participant6@raptors.dev", name: "Nia Neural", role: "participant", bio: "ML tinkerer." },
];

const TRACKS = [
  { name: "Developer Tools", description: "Tools that make developers faster and happier", prizeDescription: "Grand prize track", prizeAmount: 5000 },
  { name: "AI & Data", description: "Applied AI, analytics and data engineering", prizeDescription: "Best AI project", prizeAmount: 4000 },
  { name: "Open Source", description: "Community-driven, MIT-licensed contributions", prizeDescription: "Community choice", prizeAmount: 3000 },
  { name: "Wildcards", description: "Anything goes — weird, bold, experimental", prizeDescription: "Wildcard award", prizeAmount: 2000 },
];

const RUBRIC = [
  { name: "Innovation", description: "Originality of the idea and approach", weight: 0.3, minScore: 0, maxScore: 10 },
  { name: "Technical Execution", description: "Engineering quality, architecture, rigor", weight: 0.3, minScore: 0, maxScore: 10 },
  { name: "Impact & Usefulness", description: "Real-world value to the target audience", weight: 0.25, minScore: 0, maxScore: 10 },
  { name: "Presentation", description: "Demo, pitch, and clarity of materials", weight: 0.15, minScore: 0, maxScore: 10 },
];

const SUBMISSIONS = [
  { title: "RaptorFlow", tagline: "CI/CD pipelines that heal themselves", track: 0, tags: "devtools,ci,automation", repo: "https://github.com/raptors/raptorflow", team: 0,
    desc: "RaptorFlow watches your CI runs, learns flaky patterns, and rewrites fragile steps automatically. Ships a GitHub App, dashboard, and policy engine." },
  { title: "JudgeGPT", tagline: "LLM copilot for hackathon judges", track: 1, tags: "ai,llm,judging", repo: "https://github.com/raptors/judgegpt", team: 1,
    desc: "Summarizes repos, watches demo videos, and drafts rubric-aligned feedback for judges. Runs fully local via GGUF models." },
  { title: "OSSDoctor", tagline: "Health checks for open source dependencies", track: 2, tags: "opensource,supply-chain", repo: "https://github.com/raptors/ossdoctor", team: 2,
    desc: "Scans your dependency tree for maintenance risk, license drift, and bus-factor 1 packages. CLI + web report." },
  { title: "PixelPigeon", tagline: "Pixel-art game engine in a browser tab", track: 3, tags: "gamedev,canvas", repo: "https://github.com/raptors/pixelpigeon", team: 3,
    desc: "A 14KB game engine with sprite animation, tilemaps, and chiptune synth — all in TypeScript, zero deps." },
  { title: "MergeConflict", tagline: "Multiplayer git puzzle game", track: 3, tags: "game,education,git", repo: "https://github.com/raptors/mergeconflict", team: 4,
    desc: "Learn git by fixing deliberately broken histories in real time against friends. WebSockets + rebase boss fights." },
  { title: "SchemaMuse", tagline: "Natural-language to database schema designer", track: 1, tags: "ai,database,sql", repo: "https://github.com/raptors/schemamuse", team: 5,
    desc: "Describe your app in plain English; get migrations, ER diagrams, and seed data. Exports Prisma and SQL." },
  { title: "CacheMoney", tagline: "Edge cache analytics you can afford", track: 0, tags: "devtools,cdn,analytics", repo: "https://github.com/raptors/cachemoney", team: 5,
    desc: "Worker-based cache observability with hit-rate heatmaps and cost savings projections." },
  { title: "TelemetryDeck", tagline: "Privacy-first product analytics", track: 2, tags: "analytics,privacy", repo: "https://github.com/raptors/telemetrydeck", team: 2,
    desc: "Cookieless analytics with cohort retention, all client-side encrypted, self-hostable in one container." },
  { title: "HookLine", tagline: "Webhook debugger with time-travel replays", track: 0, tags: "devtools,webhooks", repo: "https://github.com/raptors/hookline", team: 0,
    desc: "Capture, inspect, rewind, and replay webhooks with HMAC verification built in." },
  { title: "DataCanvas", tagline: "Notebook-native data visualization builder", track: 1, tags: "data,viz", repo: "https://github.com/raptors/datacanvas", team: 1,
    desc: "Drag columns onto a canvas to compose charts; emits reproducible Python code back into your notebook." },
  { title: "LicenseHawk", tagline: "License compliance for monorepos", track: 2, tags: "opensource,legal", repo: "https://github.com/raptors/licensehawk", team: 2,
    desc: "SPDX-aware scanner that blocks incompatible licenses in CI and drafts attribution files." },
  { title: "RaptorRadar", tagline: "Hackathon project discovery engine", track: 3, tags: "search,events", repo: "https://github.com/raptors/raptorradar", team: 3,
    desc: "Embedding-based search over hackathon galleries; finds 'projects like this' across events." },
];

const TEAM_NAMES = ["Raptor Flow", "The Judges' Assistants", "OSS Medics", "Pixel Penguins", "Rebase Rebels", "Muse Labs"];

/** Deterministic seed — same database every time (reproducible demo). */
const SEED = 20260420;

export const seed = action({
  args: {},
  handler: async (ctx) => {
    const rng = mulberry32(SEED);

    // ---- wipe existing data (idempotent reseed) --------------------------
    await ctx.runMutation(internal.seed.wipeAll, {});

    const now = Date.now();
    const users: Record<string, Id<"users">> = {};
    for (const u of SEED_USERS) {
      const { id } = await ctx.runMutation(internal.seed.upsertSeedUser, {
        email: u.email, name: u.name, role: u.role, bio: u.bio,
      });
      users[u.email] = id as Id<"users">;
    }

    // Give every seeded account a real credential so `email / dogfood2026`
    // signs in through Convex Auth (see Auth page demo accounts).
    let repaired = 0;
    for (const u of SEED_USERS) {
      const res = await ctx.runAction(api.seed.ensureSeedUser, {
        email: u.email,
        password: SEED_PASSWORD,
      });
      if (res.repaired) repaired += 1;
    }
    if (repaired > 0) console.log(`seed: repaired ${repaired} stale credential(s)`);

    // Prove the documented credentials actually sign in. Without this a broken
    // credential only shows up in the browser as a cryptic "InvalidSecret",
    // long after the deploy that caused it; here it fails the bootstrap loudly.
    const brokenCredentials: string[] = [];
    for (const u of SEED_USERS) {
      try {
        await retrieveAccount(ctx, {
          provider: "password",
          account: { id: u.email, secret: SEED_PASSWORD },
        });
      } catch (err) {
        brokenCredentials.push(`${u.email} (${(err as Error).message})`);
      }
    }
    if (brokenCredentials.length > 0) {
      throw new Error(`seeded credentials do not verify: ${brokenCredentials.join(", ")}`);
    }

    // ---- event ------------------------------------------------------------
    const eventId = await ctx.runMutation(internal.seed.createEvent, {
      slug: "dogfood-2026",
      title: "Dogfood 2026",
      tagline: "Hackathon Raptors' 48-hour build-off — eat your own dogfood.",
      description:
        "Build a tool, library, or platform that its own developers actually use every day. Open source, self-hostable, zero external dependencies at runtime. Judged on a weighted rubric with cross-judge normalization, Bradley-Terry pairwise ranking, and community voting.",
      registrationStart: now - 14 * DAY,
      registrationEnd: now - 2 * DAY,
      submissionDeadline: now + 2 * DAY,
      judgingStart: now + 2 * DAY,
      judgingEnd: now + 5 * DAY,
      votingStart: now + 5 * DAY,
      votingEnd: now + 8 * DAY,
      timezone: "UTC",
      settings: "allow_late_submissions=false,max_team_size=4,voting_type=quadratic",
      status: "hacking",
    });

    // ---- tracks + rubric ----------------------------------------------------
    const trackIds: Id<"tracks">[] = [];
    for (const t of TRACKS) {
      trackIds.push(await ctx.runMutation(internal.seed.createTrack, { eventId, ...t }));
    }
    const criterionIds: Id<"rubricCriteria">[] = [];
    for (let i = 0; i < RUBRIC.length; i++) {
      criterionIds.push(await ctx.runMutation(internal.seed.createCriterion, { eventId, ...RUBRIC[i], sortOrder: i }));
    }

    // ---- teams + members + submissions -------------------------------------
    const teamIds: Id<"teams">[] = [];
    const participants = Object.entries(users).filter(([email]) => email.startsWith("participant"));
    for (let t = 0; t < TEAM_NAMES.length; t++) {
      const leader = participants[t * 2 % participants.length][1];
      const teamId = await ctx.runMutation(internal.seed.createTeam, {
        eventId, name: TEAM_NAMES[t], createdBy: leader, trackId: trackIds[SUBMISSIONS.find((s) => s.team === t)!.track],
      });
      teamIds.push(teamId);
      const members = [leader, participants[(t * 2 + 1) % participants.length][1]];
      for (const m of members) {
        await ctx.runMutation(internal.seed.addMember, { teamId, userId: m, memberRole: m === leader ? "leader" : "member" });
      }
    }

    const submissionIds: Id<"submissions">[] = [];
    for (const s of SUBMISSIONS) {
      const submittedAt = now - Math.floor(rng() * 20 * 60 * 60 * 1000); // within last 20h
      const id = await ctx.runMutation(internal.seed.createSubmission, {
        eventId,
        teamId: teamIds[s.team],
        trackId: trackIds[s.track],
        title: s.title,
        tagline: s.tagline,
        description: s.desc,
        repositoryUrl: s.repo,
        videoUrl: `https://videos.raptors.dev/${s.title.toLowerCase()}.mp4`,
        demoUrl: `https://demo.raptors.dev/${s.title.toLowerCase()}`,
        tags: s.tags,
        status: "submitted",
        submittedAt,
      });
      submissionIds.push(id);
    }

    // ---- biased judge scores ------------------------------------------------
    // Dr. Strict ~4.2, Prof. Generous ~8.7, Alice Balanced ~6.5, Kai Edgecase ~5.5
    const judgeProfiles = [
      { email: "judge1@raptors.dev", mu: 4.2, sigma: 1.1 },
      { email: "judge2@raptors.dev", mu: 8.7, sigma: 0.8 },
      { email: "judge3@raptors.dev", mu: 6.5, sigma: 1.0 },
      { email: "judge4@raptors.dev", mu: 5.5, sigma: 1.4 },
    ];

    // assignment plan with conflict-of-interest prevention
    const judgeIds: Id<"users">[] = judgeProfiles.map((p) => users[p.email]);
    const memberRows = await ctx.runQuery(internal.seed.listMembers, {});
    const teamMembersMap: Record<string, string[]> = {};
    for (const m of memberRows) (teamMembersMap[m.teamId] ??= []).push(m.userId);
    const judgeTeamMemberships: Record<string, string[]> = {};
    for (const jid of judgeIds) judgeTeamMemberships[jid] = []; // judges are staff, not team members

    const plan = planJudgeAssignments({
      submissions: submissionIds.map((sid, i) => ({
        submissionId: String(sid),
        teamId: String(teamIds[SUBMISSIONS[i].team]),
        trackName: TRACKS[SUBMISSIONS[i].track].name,
      })),
      judges: judgeIds.map((jid, i) => ({
        judgeId: String(jid),
        affinityTracks: [TRACKS[SUBMISSIONS[i % SUBMISSIONS.length].track].name],
      })),
      teamMembers: teamMembersMap,
      judgeTeamMemberships,
      minJudgesPerSubmission: 3,
    });

    for (const [subIdx, subId] of submissionIds.entries()) {
      const judgesForSub = plan.assignments[String(subId)] ?? [];
      for (const jid of judgesForSub) {
        const profile = judgeProfiles.find((p) => String(users[p.email]) === jid)!;
        const assignmentId = await ctx.runMutation(internal.seed.createAssignment, {
          eventId, judgeId: jid as Id<"users">, submissionId: subId as Id<"submissions">, status: "in_progress",
        });
        const trueQuality = 5.5 + ((subIdx * 37) % 40) / 10; // 5.5 .. 9.4 hidden quality
        for (let c = 0; c < criterionIds.length; c++) {
          const raw = clamp(profile.mu + (trueQuality - 6) * 0.9 + (rng() - 0.5) * 2 * profile.sigma, RUBRIC[c].minScore, RUBRIC[c].maxScore);
          await ctx.runMutation(internal.seed.createScore, {
            eventId, assignmentId, submissionId: subId as Id<"submissions">, judgeId: jid as Id<"users">,
            criterionId: criterionIds[c], score: Math.round(raw * 10) / 10,
            privateNotes: "",
          });
        }
        await ctx.runMutation(internal.seed.completeAssignment, { assignmentId });
      }
    }

    // ---- pairwise matches -----------------------------------------------------
    const matches: { a: string; b: string; winner: string | null }[] = [];
    for (let i = 0; i < submissionIds.length; i++) {
      for (let j = i + 1; j < submissionIds.length; j++) {
        if (rng() < 0.45) {
          const qualityI = 5.5 + ((i * 37) % 40) / 10;
          const qualityJ = 5.5 + ((j * 37) % 40) / 10;
          const pWinI = qualityI / (qualityI + qualityJ);
          matches.push({
            a: submissionIds[i],
            b: submissionIds[j],
            winner: rng() < pWinI ? submissionIds[i] : submissionIds[j],
          });
        }
      }
    }
    for (const m of matches) {
      await ctx.runMutation(internal.seed.createMatch, {
        eventId,
        judgeId: judgeIds[Math.floor(rng() * judgeIds.length)] as Id<"users">,
        submissionAId: m.a as Id<"submissions">,
        submissionBId: m.b as Id<"submissions">,
        winnerId: m.winner ?? "",
      });
    }

    // verify BT converges on seed data
    const bt = bradleyTerry(
      matches.map((m) => ({ submissionAId: m.a, submissionBId: m.b, winnerId: m.winner })),
      submissionIds.map(String),
    );
    if (!bt.converged) throw new Error("Bradley-Terry did not converge on seed data");

    // ---- community votes (quadratic) -----------------------------------------
    const voters = participants.map(([, id]) => id);
    for (const voter of voters) {
      let credits = 25;
      const shuffled = seededShuffle(submissionIds, Math.floor(rng() * 2 ** 31));
      for (const subId of shuffled.slice(0, 4)) {
        const points = 1 + Math.floor(rng() * 3);
        const cost = points * points;
        if (credits - cost < 0) break;
        credits -= cost;
        await ctx.runMutation(internal.seed.createVote, {
          eventId, userId: voter, submissionId: subId,
          points, ipHash: await sha256Hex(`ip:${voter}`), userAgentHash: await sha256Hex(`ua:${voter}`),
        });
      }
    }

    // ---- comments -------------------------------------------------------------
    const commentPool = [
      "This saved me hours already — the replay feature is genius.",
      "Would love to see this support monorepos out of the box.",
      "Demo was buttery smooth. What's the scaling story?",
      "The UI is gorgeous. Any plans to open source the design system?",
      "Great idea, but the install docs need work.",
      "Ran the whole stack offline as promised. Impressive.",
    ];
    for (let i = 0; i < submissionIds.length; i++) {
      if (rng() < 0.7) {
        await ctx.runMutation(internal.seed.createComment, {
          submissionId: submissionIds[i],
          userId: voters[Math.floor(rng() * voters.length)],
          content: commentPool[Math.floor(rng() * commentPool.length)],
        });
      }
    }

    // ---- webhook + certificates ------------------------------------------------
    await ctx.runMutation(internal.seed.createWebhook, {
      eventId,
      targetUrl: "https://hooks.raptors.dev/dogfood-2026",
      events: "submission.submit,submission.draft_create,team.join,vote.cast",
      secretKey: `whsec_seed_${randomHex(16)}`,
    });

    const certSecret = `raptor-cert-${randomHex(32)}`;
    await ctx.runMutation(internal.seed.setPlatform, { key: "cert_secret", value: certSecret });

    const issued: string[] = [];
    for (const [, uid] of participants) {
      issued.push(await ctx.runMutation(internal.seed.createCertificate, { eventId, userId: uid, certType: "participant", title: "Dogfood 2026 — Participant" }));
    }
    for (const jid of judgeIds) {
      issued.push(await ctx.runMutation(internal.seed.createCertificate, { eventId, userId: jid, certType: "judge", title: "Dogfood 2026 — Judge" }));
    }

    // ---- audit seed event -----------------------------------------------------
    await ctx.runMutation(internal.seed.auditSeed, { eventId, count: issued.length });

    return {
      eventSlug: "dogfood-2026",
      users: Object.keys(users).length,
      submissions: submissionIds.length,
      assignments: Object.values(plan.assignments).flat().length,
      pairwiseMatches: matches.length,
      certificates: issued.length,
    };
  },
});

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const rng2 = mulberry32(seed);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng2() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ------------------------------------------------------------ internal muts ---

export const wipeAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const table of [
      "judgeScores", "judgeAssignments", "pairwiseMatches", "communityVotes", "comments",
      "webhookDeliveries", "webhooks", "certificates", "auditLogs", "submissions",
      "teamMembers", "teams", "rubricCriteria", "tracks", "events", "platform",
    ] as const) {
      const rows = await ctx.db.query(table).collect();
      for (const r of rows) await ctx.db.delete(r._id);
    }
    // users handled by upsert below (do not delete auth accounts)
  },
});

/**
 * Ensure a seeded profile row exists. Uses email as a deterministic
 * tokenIdentifier so `users.me` can resolve Convex Auth identities
 * (JWT `sub` = email via ensureSeedUser below).
 */
export const upsertSeedUser = internalMutation({
  args: { email: v.string(), name: v.string(), role: v.string(), bio: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const tokenIdentifier = args.email;
    const byEmail = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();
    if (byEmail) {
      await ctx.db.patch(byEmail._id, {
        name: args.name,
        role: args.role as never,
        bio: args.bio,
        tokenIdentifier,
        emailVerificationTime: Date.now(),
      });
      return { id: byEmail._id, freshAccount: false };
    }
    const id = await ctx.db.insert("users", {
      email: args.email,
      name: args.name,
      role: args.role as never,
      bio: args.bio,
      tokenIdentifier,
      avatarUrl: undefined,
      emailVerificationTime: Date.now(),
    });
    return { id, freshAccount: true };
  },
});

/**
 * Provision — or repair — a Convex Auth credential account for a seeded user,
 * so the documented demo credentials can always sign in. Runs in an action
 * context (`createAccount` needs one).
 *
 * `createAccount` is idempotent per (provider, account.id), but it *throws*
 * when the account already exists with a different secret, while `wipeAll`
 * deliberately preserves `authAccounts`. That combination used to leave a
 * credential that could never be signed in with (the browser reported a bare
 * "InvalidSecret") and that re-seeding could never repair. Resetting the secret
 * makes the seeded password authoritative by construction.
 */
export const ensureSeedUser = action({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const account = { id: args.email, secret: args.password };
    // Thanks to emailVerificationTime set in upsertSeedUser, shouldLinkViaEmail
    // attaches the credential to the existing seeded row instead of duplicating.
    const profile = { email: args.email, name: args.email.split("@")[0] };
    try {
      await createAccount(ctx, {
        provider: "password",
        account,
        profile,
        shouldLinkViaEmail: true,
      });
      return { ok: true, repaired: false };
    } catch (err) {
      if (!/already exists/i.test(String((err as Error)?.message ?? ""))) throw err;
      await modifyAccountCredentials(ctx, { provider: "password", account });
      return { ok: true, repaired: true };
    }
  },
});

export const createEvent = internalMutation({
  args: {
    slug: v.string(), title: v.string(), tagline: v.string(), description: v.string(),
    registrationStart: v.number(), registrationEnd: v.number(), submissionDeadline: v.number(),
    judgingStart: v.number(), judgingEnd: v.number(), votingStart: v.number(), votingEnd: v.number(),
    timezone: v.string(), settings: v.string(), status: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("events").withIndex("by_slug", (q) => q.eq("slug", args.slug)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return ctx.db.insert("events", args);
  },
});

export const createTrack = internalMutation({
  args: { eventId: v.id("events"), name: v.string(), description: v.string(), prizeDescription: v.string(), prizeAmount: v.number() },
  handler: async (ctx, args) => ctx.db.insert("tracks", args),
});

export const createCriterion = internalMutation({
  args: { eventId: v.id("events"), name: v.string(), description: v.string(), weight: v.number(), minScore: v.number(), maxScore: v.number(), sortOrder: v.number() },
  handler: async (ctx, args) => ctx.db.insert("rubricCriteria", args),
});

export const createTeam = internalMutation({
  args: { eventId: v.id("events"), name: v.string(), createdBy: v.id("users"), trackId: v.optional(v.id("tracks")) },
  handler: async (ctx, args) => ctx.db.insert("teams", { ...args, inviteCode: randomHex(6) }),
});

export const addMember = internalMutation({
  args: { teamId: v.id("teams"), userId: v.id("users"), memberRole: v.string() },
  handler: async (ctx, args) => ctx.db.insert("teamMembers", { ...args, joinedAt: Date.now() }),
});

export const createSubmission = internalMutation({
  args: {
    eventId: v.id("events"), teamId: v.id("teams"), trackId: v.optional(v.id("tracks")),
    title: v.string(), tagline: v.string(), description: v.string(),
    repositoryUrl: v.string(), videoUrl: v.string(), demoUrl: v.string(), tags: v.string(),
    status: v.string(), submittedAt: v.number(),
  },
  handler: async (ctx, args) => ctx.db.insert("submissions", { ...args, customFields: "{}", updatedAt: Date.now() }),
});

export const listMembers = internalQuery({
  args: {},
  handler: async (ctx) => ctx.db.query("teamMembers").collect(),
});

export const createAssignment = internalMutation({
  args: { eventId: v.id("events"), judgeId: v.id("users"), submissionId: v.id("submissions"), status: v.string() },
  handler: async (ctx, args) => ctx.db.insert("judgeAssignments", { ...args, assignedAt: Date.now() }),
});

export const completeAssignment = internalMutation({
  args: { assignmentId: v.id("judgeAssignments") },
  handler: async (ctx, args) => ctx.db.patch(args.assignmentId, { status: "completed", completedAt: Date.now() }),
});

export const createScore = internalMutation({
  args: { eventId: v.id("events"), assignmentId: v.id("judgeAssignments"), submissionId: v.id("submissions"), judgeId: v.id("users"), criterionId: v.id("rubricCriteria"), score: v.number(), privateNotes: v.string() },
  handler: async (ctx, args) => ctx.db.insert("judgeScores", { ...args, submittedAt: Date.now() }),
});

export const createMatch = internalMutation({
  args: { eventId: v.id("events"), judgeId: v.id("users"), submissionAId: v.id("submissions"), submissionBId: v.id("submissions"), winnerId: v.string() },
  handler: async (ctx, args) => ctx.db.insert("pairwiseMatches", { ...args, createdAt: Date.now() }),
});

export const createVote = internalMutation({
  args: { eventId: v.id("events"), userId: v.id("users"), submissionId: v.id("submissions"), points: v.number(), ipHash: v.string(), userAgentHash: v.string() },
  handler: async (ctx, args) => ctx.db.insert("communityVotes", { ...args, creditsSpent: args.points * args.points, createdAt: Date.now() }),
});

export const createComment = internalMutation({
  args: { submissionId: v.id("submissions"), userId: v.id("users"), content: v.string() },
  handler: async (ctx, args) => ctx.db.insert("comments", { ...args, isFlagged: false, createdAt: Date.now() }),
});

export const createWebhook = internalMutation({
  args: { eventId: v.id("events"), targetUrl: v.string(), events: v.string(), secretKey: v.string() },
  handler: async (ctx, args) => ctx.db.insert("webhooks", { ...args, isActive: true, createdAt: Date.now() }),
});

export const setPlatform = internalMutation({
  args: { key: v.string(), value: v.string() },
  handler: async (ctx, args) => ctx.db.insert("platform", { key: args.key, value: args.value }),
});

export const createCertificate = internalMutation({
  args: { eventId: v.id("events"), userId: v.id("users"), certType: v.string(), title: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("user missing");
    const secretRow = await ctx.db.query("platform").withIndex("by_key", (q) => q.eq("key", "cert_secret")).unique();
    const secret = secretRow!.value;
    const certUuid = randomHex(16);
    const issuedAt = Date.now();
    const payload = [certUuid, user.name, args.certType, args.title, "", 0, issuedAt].join("|");
    const signatureHash = await hmacSha256Hex(secret, payload);
    await ctx.db.insert("certificates", {
      certUuid, eventId: args.eventId, userId: args.userId, recipientName: user.name,
      certType: args.certType, title: args.title, trackName: "", rank: 0,
      signatureHash, issuedAt,
    });
    return certUuid;
  },
});

export const auditSeed = internalMutation({
  args: { eventId: v.id("events"), count: v.number() },
  handler: async (ctx, args) => {
    await appendAudit(ctx, {
      eventId: args.eventId,
      action: "seed.completed",
      targetType: "event",
      targetId: String(args.eventId),
      afterState: JSON.stringify({ certificates: args.count }),
    });
  },
});
