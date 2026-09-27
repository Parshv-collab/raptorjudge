import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { sha256Hex, hmacSha256Hex, randomHex } from "./crypto";
import { appendAudit } from "./lib/audit";
import { rankEventProjects } from "./lib/results";
import { FIXTURES } from "./lib/fixturesData";

/**
 * DOGFOOD 2026 Fixture Seeder.
 * Reads FIXTURES from ./lib/fixturesData and populates the Convex database
 * according to DOGFOOD 2026 specifications.
 */

const SEED_PASSWORD = "dogfood2026";

/**
 * Idempotency marker for the opt-in multi-stage test events (issue 30).
 * Kept separate from `fixture-seeded-2026` so flipping TEST_EVENTS on a
 * deployment that was already seeded can still add the demo events without
 * re-running (or wiping) the DOGFOOD fixtures.
 */
const TEST_EVENTS_FLAG = "test-events-v1";

/** Lifecycle stages a test event is frozen in, in the order the visitor sees them. */
const TEST_EVENT_STAGES = [
  "registration",
  "hacking",
  "judging",
  "voting",
  "published",
  "closed",
] as const;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

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
    /** Slugs of the opt-in multi-stage test events created by this run. */
    testEventSlugs: string[];
  }> => {
    // Issue 30: TEST_EVENTS is checked *before* the fixture early-return so a
    // deployment that was seeded with the flag off can still gain the demo
    // events on a later run (it never re-runs the fixtures themselves).
    const testEventsWanted = process.env.TEST_EVENTS === "true";
    const testEventsAlreadySeeded = testEventsWanted
      ? await ctx.runQuery(internal.seed.getSeedFlag, { key: TEST_EVENTS_FLAG })
      : false;

    // Check seed flags for idempotency
    const alreadySeeded = await ctx.runQuery(internal.seed.getSeedFlag, { key: "fixture-seeded-2026" });
    if (alreadySeeded) {
      const testEventSlugs = testEventsWanted && !testEventsAlreadySeeded
        ? await seedTestEvents(ctx)
        : [];
      console.log("Demo data already exists (fixture-seeded-2026).");
      return {
        ok: true,
        eventSlug: "sample-hack-2026",
        tokens: {},
        votesCreated: 0,
        matchesCreated: 0,
        certificatesIssued: 0,
        testEventSlugs,
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

    // 13. Optional multi-stage test events (issue 30). Off by default, so the
    //     seed behaves exactly as it did before when TEST_EVENTS is not "true".
    const testEventSlugs = testEventsWanted && !testEventsAlreadySeeded
      ? await seedTestEvents(ctx)
      : [];

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
    if (testEventSlugs.length > 0) {
      console.log(`test events (TEST_EVENTS=true): ${testEventSlugs.join(", ")}`);
    }

    return {
      ok: true,
      eventSlug: "sample-hack-2026",
      tokens,
      votesCreated,
      matchesCreated,
      certificatesIssued: certs.issued,
      testEventSlugs,
    };
  },
});

/**
 * Seed the five multi-stage demo events (issue 30).
 *
 * Only reachable when the deployment's TEST_EVENTS env var is exactly "true",
 * and guarded by the `test-events-v1` platform flag so re-running the seed is
 * safe. Every window is computed from Date.now() at seed time, so each event
 * always sits in the stage it demonstrates no matter when the seed runs.
 *
 * All content comes from the existing fixture users, teams, judges and
 * projects — no new accounts are invented. Tracks, teams, submissions,
 * assignments, scores and votes go through the same internal mutations the
 * regular seed already uses, and every vote lands in the hash-chained audit
 * log via `createVote`.
 *
 * Sample Hack 2026 is never touched here: it stays closed, so the acceptance
 * suite keeps its 7/7 in both modes.
 */
async function seedTestEvents(ctx: ActionCtx): Promise<string[]> {
  const now = Date.now();
  const d = (days: number) => now + days * DAY_MS;
  const h = (hours: number) => now + hours * HOUR_MS;

  const created: string[] = [];

  // Reuse the fixture panels rather than creating anyone: the first three
  // fixture judges staff the judged events, and fixture team members cast the
  // community votes.
  const judgeEmails = FIXTURES.judges.slice(0, 3).map((j) => j.email);
  const judgeRows = await Promise.all(
    judgeEmails.map((email) => ctx.runQuery(internal.seed.getSeedUserIdByEmail, { email })),
  );
  const judgeIds = judgeRows.filter((id): id is Id<"users"> => Boolean(id));
  const voterRows = await Promise.all(
    FIXTURES.teams.slice(0, 10).map((tm) =>
      ctx.runQuery(internal.seed.getSeedUserIdByEmail, { email: tm.members[0] }),
    ),
  );
  const voterIds = voterRows.filter((id): id is Id<"users"> => Boolean(id));
  const organizerRow = await ctx.runQuery(internal.seed.getSeedUserIdByEmail, {
    email: "organizer@fixture.local",
  });
  const organizerId = organizerRow as Id<"users"> | null;

  // The rubric the fixture scores were written against (3 weighted criteria).
  const criterionNames = Array.from(
    FIXTURES.scores.reduce((set, sc) => {
      for (const name of Object.keys(sc.criteria ?? {})) set.add(name);
      return set;
    }, new Set<string>()),
  );
  const equalWeight = criterionNames.length > 0 ? 1.0 / criterionNames.length : 1.0;

  /** One project from FIXTURES.projects plus the team + track it needs. */
  type SeededProject = { submissionId: Id<"submissions">; teamId: Id<"teams"> };

  /**
   * Create a project (and its team, and a shared track) inside `eventId`.
   * `index` keeps team names and vote targets distinct per event.
   */
  const createProject = async (
    eventId: Id<"events">,
    trackId: Id<"tracks">,
    fixtureProjectIndex: number,
  ): Promise<SeededProject | null> => {
    const fp = FIXTURES.projects[fixtureProjectIndex];
    if (!fp) return null;
    const teamFixture = FIXTURES.teams.find((tm) => tm.id === fp.team);
    if (!teamFixture) return null;

    const memberRows = await Promise.all(
      teamFixture.members.map((email) =>
        ctx.runQuery(internal.seed.getSeedUserIdByEmail, { email }),
      ),
    );
    const members = memberRows.filter((id): id is Id<"users"> => Boolean(id));
    if (members.length === 0) return null;

    const teamId = await ctx.runMutation(internal.seed.createTeam, {
      eventId,
      name: teamFixture.name,
      createdBy: members[0],
    });
    for (let i = 0; i < members.length; i++) {
      await ctx.runMutation(internal.seed.addMember, {
        teamId,
        userId: members[i],
        memberRole: i === 0 ? "leader" : "member",
      });
    }

    const submissionId = await ctx.runMutation(internal.seed.createSubmission, {
      eventId,
      teamId,
      trackId,
      title: fp.title,
      tagline: fp.summary || fp.title,
      description: fp.summary || fp.title,
      repositoryUrl: fp.repo_url || "https://github.com/example/repo",
      videoUrl: "",
      demoUrl: "",
      tags: "",
      status: "submitted",
      // Inside the window, before the deadline this event is frozen at.
      submittedAt: Math.min(new Date(fp.submitted_at ?? Date.now()).getTime() || now, d(-1)),
    });

    return { submissionId, teamId };
  };

  /** Rubric criteria for an event, mirroring the fixture rubric. */
  const createCriteria = async (eventId: Id<"events">) => {
    const map = new Map<string, Id<"rubricCriteria">>();
    for (let i = 0; i < criterionNames.length; i++) {
      const name = criterionNames[i];
      const id = await ctx.runMutation(internal.seed.createCriterion, {
        eventId,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        description: `${name} criterion`,
        weight: equalWeight,
        minScore: 1,
        maxScore: 5,
        sortOrder: i,
      });
      map.set(name, id);
    }
    return map;
  };

  /**
   * Assign `judgeIds` across `submissionIds` and score the first
   * `scoredCount` of them, so a judging-stage event shows a partially filled
   * queue while a finished one is fully scored.
   */
  const assignAndScore = async (
    eventId: Id<"events">,
    submissionIds: Id<"submissions">[],
    criteria: Map<string, Id<"rubricCriteria">>,
    scoredCount: number,
  ) => {
    let scored = 0;
    for (let i = 0; i < submissionIds.length; i++) {
      const judgeId = judgeIds[i % judgeIds.length];
      if (!judgeId) continue;
      const isScored = scored < scoredCount;
      const assignmentId = await ctx.runMutation(internal.seed.createAssignment, {
        eventId,
        judgeId,
        submissionId: submissionIds[i],
        status: isScored ? "completed" : "assigned",
      });
      if (!isScored) continue;
      scored++;
      // Vary the score by project so normalization produces a real spread
      // rather than a flat panel (a flat panel collapses to 5 for everyone).
      for (const [name, criterionId] of criteria) {
        const value = 1 + ((i + name.length) % 5);
        await ctx.runMutation(internal.seed.createScore, {
          eventId,
          assignmentId,
          submissionId: submissionIds[i],
          judgeId,
          criterionId,
          score: value,
          privateNotes: "",
        });
      }
    }
  };

  /** Community votes through `createVote`, so each row is audited. */
  const castVotes = async (eventId: Id<"events">, submissionIds: Id<"submissions">[], count: number) => {
    for (let i = 0; i < count && submissionIds.length > 0; i++) {
      const userId = voterIds[i % voterIds.length];
      if (!userId) continue;
      await ctx.runMutation(internal.seed.createVote, {
        eventId,
        userId,
        submissionId: submissionIds[i % submissionIds.length],
        points: (i % 3) + 1,
      });
    }
  };

  const eventShell = {
    timezone: "UTC",
    settings: "min_team_size=1,max_team_size=4,solo_allowed=true,voting_type=quadratic",
  } as const;

  // --- Event A — registration open, nothing built yet ----------------------
  {
    const slug = "test-hack-registration";
    const eventId = await ctx.runMutation(internal.seed.createEvent, {
      ...eventShell,
      slug,
      title: "Test Hack — Registration",
      tagline: "Sign-ups are open. No projects yet — the lifecycle starts here.",
      description:
        "Demo event frozen at the registration stage: teams can join and the event page renders, but nothing has been submitted and no judging has started.",
      registrationStart: d(-2),
      registrationEnd: d(20),
      submissionDeadline: d(30),
      judgingStart: d(31),
      judgingEnd: d(40),
      votingStart: d(41),
      votingEnd: d(50),
      status: "registration",
    });
    if (organizerId) {
      await ctx.runMutation(internal.seed.setEventOrganizer, { eventId, organizerId });
    }
    // One track so the event has prizes configured from the start.
    await ctx.runMutation(internal.seed.createTrack, {
      eventId,
      name: "Open Track",
      description: "Every demo project starts here.",
      prizeDescription: "Opens at registration close",
      prizeAmount: 500,
    });
    await ctx.runMutation(internal.seed.logSeedAction, {
      eventId,
      action: "seed.test_events",
      summary: "Seeded registration-stage demo event (0 projects, 0 judges, 0 votes).",
    });
    created.push(slug);
  }

  // --- Event B — submissions open, 5 projects, no judging yet --------------
  {
    const slug = "test-hack-submissions";
    const eventId = await ctx.runMutation(internal.seed.createEvent, {
      ...eventShell,
      slug,
      title: "Test Hack — Submissions",
      tagline: "Hacking in progress. Projects are landing, judging has not started.",
      description:
        "Demo event frozen at the submissions stage: teams exist and projects have been submitted, so the draft/submit/locked flow can be exercised against a live deadline.",
      registrationStart: d(-20),
      registrationEnd: d(-2),
      submissionDeadline: d(20),
      judgingStart: d(21),
      judgingEnd: d(30),
      votingStart: d(31),
      votingEnd: d(40),
      status: "hacking",
    });
    if (organizerId) {
      await ctx.runMutation(internal.seed.setEventOrganizer, { eventId, organizerId });
    }
    const trackId = await ctx.runMutation(internal.seed.createTrack, {
      eventId,
      name: "Open Track",
      description: "Every demo project starts here.",
      prizeDescription: "Awarded after judging",
      prizeAmount: 750,
    });
    const projects: SeededProject[] = [];
    for (let i = 0; i < 5; i++) {
      const p = await createProject(eventId, trackId, i);
      if (p) projects.push(p);
    }
    await ctx.runMutation(internal.seed.logSeedAction, {
      eventId,
      action: "seed.test_events",
      summary: `Seeded submissions-stage demo event (${projects.length} projects, 0 judges, 0 votes).`,
    });
    created.push(slug);
  }

  // --- Event C — judging now, 3 judges assigned, 4 scored -------------------
  {
    const slug = "test-hack-judging";
    const eventId = await ctx.runMutation(internal.seed.createEvent, {
      ...eventShell,
      slug,
      title: "Test Hack — Judging",
      tagline: "Judging is open. The panel has a partially scored queue.",
      description:
        "Demo event frozen mid-judging: 8 projects are in, 3 judges are assigned and only 4 projects are scored, so progress, reminders and the locked-rubric state are all reachable.",
      registrationStart: d(-30),
      registrationEnd: d(-15),
      submissionDeadline: d(-1),
      judgingStart: h(-12),
      judgingEnd: d(5),
      votingStart: d(6),
      votingEnd: d(15),
      status: "judging",
    });
    if (organizerId) {
      await ctx.runMutation(internal.seed.setEventOrganizer, { eventId, organizerId });
    }
    const trackId = await ctx.runMutation(internal.seed.createTrack, {
      eventId,
      name: "Open Track",
      description: "Every demo project starts here.",
      prizeDescription: "Awarded after judging",
      prizeAmount: 750,
    });
    const projects: SeededProject[] = [];
    for (let i = 0; i < 8; i++) {
      const p = await createProject(eventId, trackId, i);
      if (p) projects.push(p);
    }
    const criteria = await createCriteria(eventId);
    await assignAndScore(eventId, projects.map((p) => p.submissionId), criteria, 4);
    await ctx.runMutation(internal.seed.logSeedAction, {
      eventId,
      action: "seed.test_events",
      summary: `Seeded judging-stage demo event (${projects.length} projects, ${judgeIds.length} judges assigned, 4 scored).`,
    });
    created.push(slug);
  }

  // --- Event D — community voting open, everything scored ------------------
  {
    const slug = "test-hack-voting";
    const eventId = await ctx.runMutation(internal.seed.createEvent, {
      ...eventShell,
      slug,
      title: "Test Hack — Voting",
      tagline: "Judging is done. Community voting is open and tallies are hidden.",
      description:
        "Demo event frozen at the voting stage: all 6 projects are scored, 15 community votes have been cast, and tallies stay hidden until the organizer publishes results.",
      registrationStart: d(-40),
      registrationEnd: d(-25),
      submissionDeadline: d(-15),
      judgingStart: d(-14),
      judgingEnd: d(-1),
      votingStart: h(-12),
      votingEnd: d(5),
      status: "voting",
    });
    if (organizerId) {
      await ctx.runMutation(internal.seed.setEventOrganizer, { eventId, organizerId });
    }
    const trackId = await ctx.runMutation(internal.seed.createTrack, {
      eventId,
      name: "Open Track",
      description: "Every demo project starts here.",
      prizeDescription: "Awarded after voting",
      prizeAmount: 750,
    });
    const projects: SeededProject[] = [];
    for (let i = 0; i < 6; i++) {
      const p = await createProject(eventId, trackId, i);
      if (p) projects.push(p);
    }
    const criteria = await createCriteria(eventId);
    const submissionIds = projects.map((p) => p.submissionId);
    await assignAndScore(eventId, submissionIds, criteria, submissionIds.length);
    await castVotes(eventId, submissionIds, 15);
    await ctx.runMutation(internal.seed.logSeedAction, {
      eventId,
      action: "seed.test_events",
      summary: `Seeded voting-stage demo event (${submissionIds.length} projects, all scored, 15 votes).`,
    });
    created.push(slug);
  }

  // --- Event E — results published, winner crowned --------------------------
  {
    const slug = "test-hack-results";
    const eventId = await ctx.runMutation(internal.seed.createEvent, {
      ...eventShell,
      slug,
      title: "Test Hack — Results",
      tagline: "Results are in. Rankings, certificates and the crowned winner.",
      description:
        "Demo event frozen at the published stage: 8 scored projects, 30 community votes and a crowned winner, so the results page, exports and certificates all have real material.",
      registrationStart: d(-60),
      registrationEnd: d(-45),
      submissionDeadline: d(-35),
      judgingStart: d(-34),
      judgingEnd: d(-20),
      votingStart: d(-19),
      votingEnd: d(-5),
      status: "published",
      publishedAt: d(-4),
      resultsAnnounced: d(-4),
    });
    if (organizerId) {
      await ctx.runMutation(internal.seed.setEventOrganizer, { eventId, organizerId });
    }
    const trackId = await ctx.runMutation(internal.seed.createTrack, {
      eventId,
      name: "Open Track",
      description: "Every demo project starts here.",
      prizeDescription: "Awarded — see results",
      prizeAmount: 750,
    });
    const projects: SeededProject[] = [];
    for (let i = 0; i < 8; i++) {
      const p = await createProject(eventId, trackId, i);
      if (p) projects.push(p);
    }
    const criteria = await createCriteria(eventId);
    const submissionIds = projects.map((p) => p.submissionId);
    await assignAndScore(eventId, submissionIds, criteria, submissionIds.length);
    await castVotes(eventId, submissionIds, 30);

    // Crown a winner the same way the organizer console does: rank the event
    // and pin #1, so the results page shows a trophy instead of an empty state.
    const winnerId = await ctx.runMutation(internal.seed.crownSeedWinner, { eventId });
    const certs = await ctx.runMutation(internal.certificates.issueAllInternal, { eventId });
    await ctx.runMutation(internal.seed.logSeedAction, {
      eventId,
      action: "seed.test_events",
      summary: `Seeded published demo event (${submissionIds.length} projects, 30 votes, ${certs.issued} certificates${winnerId ? ", winner crowned" : ""}).`,
    });
    created.push(slug);
  }

  await ctx.runMutation(internal.seed.setSeedFlag, { key: TEST_EVENTS_FLAG });
  return created;
}

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
    // Only the multi-stage test events pass these; the DOGFOOD event does not.
    publishedAt: v.optional(v.number()),
    resultsAnnounced: v.optional(v.number()),
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

/**
 * Resolve an existing seeded user by email. The test events must not invent
 * accounts, so they look people up rather than creating them.
 */
export const getSeedUserIdByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", args.email)).unique();
    return user ? (user._id as string) : null;
  },
});

/**
 * Audit a bulk/internal seed write. Individual votes and pairwise matches are
 * already audited by their own mutations; this records the event-level writes
 * so every test event shows up in the chain instead of appearing from nowhere.
 */
export const logSeedAction = internalMutation({
  args: { eventId: v.id("events"), action: v.string(), summary: v.string() },
  handler: async (ctx, args) => {
    await appendAudit(ctx, {
      eventId: args.eventId,
      action: args.action,
      targetType: "event",
      targetId: String(args.eventId),
      afterState: JSON.stringify({ summary: args.summary, source: "seed" }),
    });
    return { ok: true };
  },
});

/**
 * Pin the event's #1 project as the winner using the same ranking the results
 * page uses, so a published demo event shows a trophy rather than an empty
 * state. Returns the winning submission id, or null when nothing ranks yet.
 */
export const crownSeedWinner = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { ranking } = await rankEventProjects(ctx, args.eventId, { ignoreOverride: true });
    const winner = ranking[0];
    if (!winner) return null;
    await ctx.db.patch(args.eventId, {
      winnerOverrideProjectId: winner.submissionId as Id<"submissions">,
      winnerIsOverridden: true,
    });
    await appendAudit(ctx, {
      eventId: args.eventId,
      action: "winner.crown",
      targetType: "submission",
      targetId: winner.submissionId,
      afterState: JSON.stringify({ source: "seed", rank: 1, title: winner.title ?? null }),
    });
    return winner.submissionId;
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
