import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { sha256Hex, hmacSha256Hex, randomHex } from "./crypto";
import { appendAudit } from "./lib/audit";
import { FIXTURES } from "./lib/fixturesData";

/**
 * DOGFOOD 2026 Fixture Seeder.
 * Reads FIXTURES from ./lib/fixturesData and populates the Convex database
 * according to DOGFOOD 2026 specifications.
 */

const SEED_PASSWORD = "dogfood2026";

const LOOKUP_PROFESSIONS = [
  "Software Engineer", "Frontend Engineer", "Backend Engineer",
  "Full Stack Engineer", "DevOps Engineer", "Data Scientist",
  "Product Manager", "UI/UX Designer", "Student", "Researcher"
];
const LOOKUP_INTERESTS = [
  "Artificial Intelligence", "Machine Learning", "Web Development",
  "Open Source", "Developer Tools", "Game Development", "Cybersecurity", "Cloud Computing"
];
const LOOKUP_EXPERIENCE = ["Beginner (0-1 yrs)", "Intermediate (1-3 yrs)", "Advanced (3-5 yrs)", "Expert (5+ yrs)"];
const LOOKUP_EDUCATION = ["High School", "Bachelor's Degree", "Master's Degree", "Doctorate / Ph.D.", "Self-Taught"];

export const seedState = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return { userCount: users.length, isEmpty: users.length === 0 };
  },
});

export const userRoleById = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    try {
      const user = await ctx.db.get(args.userId as Id<"users">);
      return user?.role ?? null;
    } catch {
      return null;
    }
  },
});

/**
 * Fixture seeder.
 *
 * The handler's return type is annotated on purpose. This action calls
 * `internal.*` functions from other modules, and an *inferred* return type would
 * make `typeof seed` depend on `fullApi`, which depends on `typeof seed` — a
 * mutual inference cycle that TypeScript can only degrade to `any` (TS7022/7023),
 * which then poisons every query type in the app.
 */
export const seed = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    ok: boolean;
    eventSlug: string;
    tokens: Record<string, string>;
    votesCreated: number;
    matchesCreated: number;
    certificatesIssued: number;
  }> => {
    // Check seed flags for idempotency
    const alreadySeeded = await ctx.runQuery(internal.seed.getSeedFlag, { key: "fixture-seeded-2026" });
    if (alreadySeeded) {
      console.log("Demo data already exists (fixture-seeded-2026).");
      return {
        ok: true,
        eventSlug: "sample-hack-2026",
        tokens: {},
        votesCreated: 0,
        matchesCreated: 0,
        certificatesIssued: 0,
      };
    }

    // Wipe previous fixture data
    await ctx.runMutation(internal.seed.wipeAll, {});

    // 1. Seed lookup tables
    await ctx.runMutation(internal.seed.seedLookups, {});

    // 2. Create event: "Sample Hack 2026"
    const eventId = await ctx.runMutation(internal.seed.createEvent, {
      slug: "sample-hack-2026",
      title: "Sample Hack 2026",
      tagline: "Official DOGFOOD 2026 Sample Hackathon.",
      description: "Sample Hackathon powered by DOGFOOD 2026 official test fixtures.",
      registrationStart: new Date("2026-02-01T00:00:00Z").getTime(),
      registrationEnd: new Date("2026-02-28T23:59:00Z").getTime(),
      submissionDeadline: new Date("2026-03-01T18:00:00Z").getTime(),
      judgingStart: new Date("2026-03-01T18:00:00Z").getTime(),
      judgingEnd: new Date("2026-03-08T18:00:00Z").getTime(),
      votingStart: new Date("2026-03-08T18:00:00Z").getTime(),
      votingEnd: new Date("2026-03-08T18:00:00Z").getTime(),
      timezone: "UTC",
      settings: "min_team_size=1,max_team_size=4,solo_allowed=true,voting_type=quadratic",
      status: "closed",
    });

    // 3. Create 8 tracks from FIXTURES.tracks
    const trackMap = new Map<string, Id<"tracks">>();
    for (const t of FIXTURES.tracks) {
      const id = await ctx.runMutation(internal.seed.createTrack, {
        eventId,
        name: t.name,
        description: `${t.name} track`,
        prizeDescription: `${t.name} prize`,
        prizeAmount: 1000,
      });
      trackMap.set(t.id, id);
    }

    // 4. Create 30 judges from FIXTURES.judges
    const judgeMap = new Map<string, Id<"users">>();
    for (const j of FIXTURES.judges) {
      const { id } = await ctx.runMutation(internal.seed.upsertSeedUser, {
        email: j.email,
        name: j.name,
        role: "judge",
        bio: `Judge for tracks: ${(j.tracks || []).join(", ")}`,
      });
      await ctx.runAction(internal.seed.ensureSeedUser, { email: j.email, password: SEED_PASSWORD });
      judgeMap.set(j.id, id as Id<"users">);
    }

    // 5. Create teams and participants from FIXTURES.teams
    const teamMap = new Map<string, Id<"teams">>();
    const userMapByEmail = new Map<string, Id<"users">>();

    for (const tm of FIXTURES.teams) {
      let leaderId: Id<"users"> | null = null;
      const memberIds: Id<"users">[] = [];

      for (let i = 0; i < tm.members.length; i++) {
        const memEmail = tm.members[i];
        let uid = userMapByEmail.get(memEmail);
        if (!uid) {
          const { id } = await ctx.runMutation(internal.seed.upsertSeedUser, {
            email: memEmail,
            name: memEmail.split("@")[0],
            role: "participant",
          });
          await ctx.runAction(internal.seed.ensureSeedUser, { email: memEmail, password: SEED_PASSWORD });
          uid = id as Id<"users">;
          userMapByEmail.set(memEmail, uid);
        }
        if (i === 0) leaderId = uid;
        memberIds.push(uid);
      }

      const teamId = await ctx.runMutation(internal.seed.createTeam, {
        eventId,
        name: tm.name,
        createdBy: leaderId!,
      });
      teamMap.set(tm.id, teamId);

      for (let i = 0; i < memberIds.length; i++) {
        await ctx.runMutation(internal.seed.addMember, {
          teamId,
          userId: memberIds[i],
          memberRole: i === 0 ? "leader" : "member",
        });
      }
    }

    // 6. Create projects from FIXTURES.projects
    const projectMap = new Map<string, Id<"submissions">>();
    for (const p of FIXTURES.projects) {
      const dbTeamId = teamMap.get(p.team);
      const dbTrackId = p.track ? trackMap.get(p.track) : undefined;
      const id = await ctx.runMutation(internal.seed.createSubmission, {
        eventId,
        teamId: dbTeamId!,
        trackId: dbTrackId,
        title: p.title,
        tagline: p.summary || p.title,
        description: p.summary || p.title,
        repositoryUrl: p.repo_url || "https://github.com/example/repo",
        videoUrl: "",
        demoUrl: "",
        tags: "",
        status: "submitted",
        submittedAt: p.submitted_at ? new Date(p.submitted_at).getTime() : Date.now(),
      });
      projectMap.set(p.id, id);
    }

    // 7. Create rubric criteria from unique criteria keys in FIXTURES.scores
    const criteriaNames = new Set<string>();
    for (const sc of FIXTURES.scores) {
      if (sc.criteria) {
        for (const k of Object.keys(sc.criteria)) {
          criteriaNames.add(k);
        }
      }
    }
    const cList = Array.from(criteriaNames);
    const equalWeight = cList.length > 0 ? 1.0 / cList.length : 1.0;
    const criterionMap = new Map<string, Id<"rubricCriteria">>();

    for (let i = 0; i < cList.length; i++) {
      const name = cList[i];
      const id = await ctx.runMutation(internal.seed.createCriterion, {
        eventId,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        description: `${name} criterion`,
        weight: equalWeight,
        minScore: 1,
        maxScore: 5,
        sortOrder: i,
      });
      criterionMap.set(name, id);
    }

    // 8. Create judge assignments and scores from FIXTURES.scores
    for (const sc of FIXTURES.scores) {
      const dbJudgeId = judgeMap.get(sc.judge);
      const dbSubId = projectMap.get(sc.project);
      if (!dbJudgeId || !dbSubId) continue;

      const assignmentId = await ctx.runMutation(internal.seed.createAssignment, {
        eventId,
        judgeId: dbJudgeId,
        submissionId: dbSubId,
        status: "completed",
      });

      if (sc.criteria) {
        for (const [cName, val] of Object.entries(sc.criteria)) {
          const dbCritId = criterionMap.get(cName);
          if (dbCritId) {
            await ctx.runMutation(internal.seed.createScore, {
              eventId,
              assignmentId,
              submissionId: dbSubId,
              judgeId: dbJudgeId,
              criterionId: dbCritId,
              score: val as number,
              privateNotes: sc.comment || "",
            });
          }
        }
      }
    }

    // 9. Create 4 demo accounts required for acceptance testing
    // Link judge_a and judge_b to the first and second judges in FIXTURES.judges
    const firstJudgeEmail = FIXTURES.judges[0]?.email || "tomas.varga@example.org";
    const secondJudgeEmail = FIXTURES.judges[1]?.email || "wei.lindqvist@example.org";

    const demoAccounts = [
      // A seeded admin makes the admin surfaces (audit chain, rubric unlock,
      // role management, invites) reachable on a fresh deployment, and is what
      // the "all four roles present" self-check expects.
      { key: "admin", email: "admin@fixture.local", name: "Fixture Admin", role: "admin" },
      { key: "organizer", email: "organizer@fixture.local", name: "Fixture Organizer", role: "organizer" },
      { key: "judge_a", email: firstJudgeEmail, name: FIXTURES.judges[0]?.name || "Tomas Varga (Judge A)", role: "judge" },
      { key: "judge_b", email: secondJudgeEmail, name: FIXTURES.judges[1]?.name || "Wei Lindqvist (Judge B)", role: "judge" },
      { key: "participant", email: "participant@fixture.local", name: "Fixture Participant", role: "participant" },
    ];

    const tokens: Record<string, string> = {};
    const SESSION_SECRET = "raptorjudge-session-secret-key-2026";

    let organizerUserId: Id<"users"> | null = null;
    for (const demo of demoAccounts) {
      const { id: userId } = await ctx.runMutation(internal.seed.upsertSeedUser, {
        email: demo.email,
        name: demo.name,
        role: demo.role,
      });
      if (demo.key === "organizer") organizerUserId = userId as Id<"users">;
      await ctx.runAction(internal.seed.ensureSeedUser, { email: demo.email, password: SEED_PASSWORD });

      // Generate deterministic token
      const rawToken = (await hmacSha256Hex(SESSION_SECRET, `${demo.email}:fixture`)).slice(0, 32);
      tokens[demo.key] = rawToken;

      const tokenHash = await sha256Hex(rawToken);
      await ctx.runMutation(internal.seed.createSession, {
        userId: userId as Id<"users">,
        tokenHash,
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
      });
    }

    // The event is inserted before the accounts exist, so ownership is stamped
    // here: without it `events.listMine` (the organizer console) had nothing to
    // scope to and the seeded organizer saw an empty dashboard.
    if (organizerUserId) {
      await ctx.runMutation(internal.seed.setEventOrganizer, {
        eventId,
        organizerId: organizerUserId,
      });
    }

    // 9. Run the duplicate detector once so the seeded event already shows the
    //    fixtures' duplicate pair ("Dry Harbour" filed twice) instead of an
    //    empty Duplicate Flags tab until an organizer clicks the scan button.
    const duplicateScan = await ctx.runMutation(internal.submissions.detectDuplicatesInternal, {
      eventId,
    });
    console.log(
      `duplicate scan: ${duplicateScan.matches} match(es), ${duplicateScan.newlyFlagged} flag(s)`,
    );

    // 9b. Seed the five default help-center entries (issue 27) — idempotent,
    //     guarded by a platform flag inside the mutation itself.
    const helpSeed = await ctx.runMutation(internal.help.seedDefaultsInternal, {});
    if (helpSeed.seeded > 0) console.log(`help content: ${helpSeed.seeded} entry(ies) seeded`);

    // 10. Community voting demo (T3.1): quadratic votes whose tallies stay
    //     hidden until the event reaches `published`.
    const participantIds = [...userMapByEmail.values()];
    const voteTargets = FIXTURES.projects
      .slice(0, 12)
      .map((p) => projectMap.get(p.id))
      .filter((id): id is Id<"submissions"> => Boolean(id));
    let votesCreated = 0;
    for (let i = 0; i < participantIds.length && i < 10 && voteTargets.length > 1; i++) {
      const a = voteTargets[i % voteTargets.length];
      const b = voteTargets[(i + 3) % voteTargets.length];
      await ctx.runMutation(internal.seed.createVote, {
        eventId,
        userId: participantIds[i],
        submissionId: a,
        points: 3,
      });
      votesCreated++;
      if (a !== b) {
        await ctx.runMutation(internal.seed.createVote, {
          eventId,
          userId: participantIds[i],
          submissionId: b,
          points: 2,
        });
        votesCreated++;
      }
    }

    // 11. Pairwise comparisons (Bonus) so the Bradley-Terry leaderboard has real
    //     material the moment the organizer opens the Results tab.
    const judgeIds = [...judgeMap.values()];
    let matchesCreated = 0;
    for (let i = 0; i < 18 && voteTargets.length > 1 && judgeIds.length > 0; i++) {
      const a = voteTargets[i % voteTargets.length];
      const b = voteTargets[(i + 5) % voteTargets.length];
      if (a === b) continue;
      await ctx.runMutation(internal.seed.createMatch, {
        eventId,
        judgeId: judgeIds[i % judgeIds.length],
        submissionAId: a,
        submissionBId: b,
        winnerId: String(i % 3 === 0 ? b : a),
      });
      matchesCreated++;
    }

    // 12. Certificates (T4.3) so /verify has real material to check.
    const certs = await ctx.runMutation(internal.certificates.issueAllInternal, { eventId });

    // Set seed flag
    await ctx.runMutation(internal.seed.setSeedFlag, { key: "fixture-seeded-2026" });

    // Print test logins
    console.log("seeded. test logins:");
    console.log(`  admin        Cookie: session=${tokens.admin}`);
    console.log(`  organizer    Cookie: session=${tokens.organizer}`);
    console.log(`  judge_a      Cookie: session=${tokens.judge_a}`);
    console.log(`  judge_b      Cookie: session=${tokens.judge_b}`);
    console.log(`  participant  Cookie: session=${tokens.participant}`);

    console.log(
      `demo extras: ${votesCreated} votes, ${matchesCreated} pairwise matches, ${certs.issued} certificates`,
    );

    return {
      ok: true,
      eventSlug: "sample-hack-2026",
      tokens,
      votesCreated,
      matchesCreated,
      certificatesIssued: certs.issued,
    };
  },
});

// ------------------------------------------------------------ internal mutations ---

export const getSeedFlag = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("platform")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    return row ? true : false;
  },
});

export const setSeedFlag = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("platform", { key: args.key, value: "true" });
  },
});

export const seedLookups = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const p of LOOKUP_PROFESSIONS) {
      await ctx.db.insert("platform", { key: `lookup:professions:${p}`, value: JSON.stringify({ name: p, active: true }) });
    }
    for (const i of LOOKUP_INTERESTS) {
      await ctx.db.insert("platform", { key: `lookup:interests:${i}`, value: JSON.stringify({ name: i, active: true }) });
    }
    for (const e of LOOKUP_EXPERIENCE) {
      await ctx.db.insert("platform", { key: `lookup:experience_levels:${e}`, value: JSON.stringify({ name: e, active: true }) });
    }
    for (const ed of LOOKUP_EDUCATION) {
      await ctx.db.insert("platform", { key: `lookup:education_levels:${ed}`, value: JSON.stringify({ name: ed, active: true }) });
    }
  },
});

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
  },
});

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
      emailVerificationTime: Date.now(),
    });
    return { id, freshAccount: true };
  },
});

export const ensureSeedUser = internalAction({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const account = { id: args.email, secret: args.password };
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

/** Stamp the seeded event's owner (the event exists before its accounts do). */
export const setEventOrganizer = internalMutation({
  args: { eventId: v.id("events"), organizerId: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, { organizerId: args.organizerId });
    return { ok: true };
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
  args: { eventId: v.id("events"), name: v.string(), createdBy: v.id("users") },
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

export const createAssignment = internalMutation({
  args: { eventId: v.id("events"), judgeId: v.id("users"), submissionId: v.id("submissions"), status: v.string() },
  handler: async (ctx, args) => ctx.db.insert("judgeAssignments", { ...args, assignedAt: Date.now() }),
});

export const createScore = internalMutation({
  args: { eventId: v.id("events"), assignmentId: v.id("judgeAssignments"), submissionId: v.id("submissions"), judgeId: v.id("users"), criterionId: v.id("rubricCriteria"), score: v.number(), privateNotes: v.string() },
  handler: async (ctx, args) => ctx.db.insert("judgeScores", { ...args, submittedAt: Date.now() }),
});

/** Community vote row (quadratic: casting n points costs n² credits). */
export const createVote = internalMutation({
  args: {
    eventId: v.id("events"),
    userId: v.id("users"),
    submissionId: v.id("submissions"),
    points: v.number(),
  },
  handler: async (ctx, args) => {
    const cost = args.points * args.points;
    const id = await ctx.db.insert("communityVotes", {
      eventId: args.eventId,
      userId: args.userId,
      submissionId: args.submissionId,
      points: args.points,
      creditsSpent: cost,
      ipHash: await sha256Hex(`ip:${args.eventId}:${args.userId}`),
      userAgentHash: await sha256Hex(`ua:${args.eventId}:${args.userId}`),
      createdAt: Date.now(),
    });
    await appendAudit(ctx, {
      eventId: args.eventId,
      actorId: args.userId,
      action: "vote.cast",
      targetType: "submission",
      targetId: String(args.submissionId),
      afterState: JSON.stringify({ points: args.points, cost, source: "seed" }),
    });
    return id;
  },
});

/** Pairwise comparison row for the Bradley-Terry leaderboard. */
export const createMatch = internalMutation({
  args: {
    eventId: v.id("events"),
    judgeId: v.id("users"),
    submissionAId: v.id("submissions"),
    submissionBId: v.id("submissions"),
    winnerId: v.string(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("pairwiseMatches", { ...args, createdAt: Date.now() });
    await appendAudit(ctx, {
      eventId: args.eventId,
      actorId: args.judgeId,
      action: "pairwise.match",
      targetType: "submission",
      targetId: args.winnerId || "tie",
      afterState: JSON.stringify({ a: String(args.submissionAId), b: String(args.submissionBId), source: "seed" }),
    });
    return id;
  },
});

export const createSession = internalMutation({
  args: { userId: v.id("users"), tokenHash: v.string(), expiresAt: v.number() },
  handler: async (ctx, args) => {
    const key = `session:${args.tokenHash}`;
    const existing = await ctx.db
      .query("platform")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        value: JSON.stringify({ userId: args.userId, expiresAt: args.expiresAt }),
      });
      return existing._id;
    }
    return ctx.db.insert("platform", {
      key,
      value: JSON.stringify({ userId: args.userId, expiresAt: args.expiresAt }),
    });
  },
});
