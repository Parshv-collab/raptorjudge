import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  // --------------------------------------------------- auth (convex auth) ---
  ...authTables,

  // ---------------------------------------------------------------- users ---
  users: defineTable({
    email: v.string(),
    name: v.string(),
    /** Optional: brand-new auth sign-ups get a role on first user action. */
    role: v.optional(
      v.union(
        v.literal("admin"),
        v.literal("organizer"),
        v.literal("judge"),
        v.literal("participant"),
      ),
    ),
    bio: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    tokenIdentifier: v.optional(v.string()),
    /** Seeded users get this so Convex Auth can link credential accounts. */
    emailVerificationTime: v.optional(v.number()),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_role", ["role"])
    // "email" index is required by @convex-dev/auth's user lookups.
    .index("email", ["email"]),

  // --------------------------------------------------------------- events ---
  events: defineTable({
    slug: v.string(),
    title: v.string(),
    tagline: v.string(),
    description: v.string(),
    /** draft | registration | hacking | judging | voting | published | archived */
    status: v.string(),
    registrationStart: v.number(),
    registrationEnd: v.number(),
    submissionDeadline: v.number(),
    judgingStart: v.number(),
    judgingEnd: v.number(),
    votingStart: v.number(),
    votingEnd: v.number(),
    timezone: v.string(),
    /** Comma-separated feature flags: allow_late_submissions,max_team_size,voting_type */
    settings: v.string(),
    bannerUrl: v.optional(v.string()),
  }).index("by_slug", ["slug"]),

  // --------------------------------------------------------------- tracks ---
  tracks: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    description: v.string(),
    prizeDescription: v.string(),
    prizeAmount: v.number(),
  }).index("by_event", ["eventId"]),

  // ---------------------------------------------------------------- teams ---
  teams: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    inviteCode: v.string(),
    trackId: v.optional(v.id("tracks")),
    createdBy: v.id("users"),
  })
    .index("by_event", ["eventId"])
    .index("by_invite", ["inviteCode"]),

  teamMembers: defineTable({
    teamId: v.id("teams"),
    userId: v.id("users"),
    /** leader | member */
    memberRole: v.string(),
    joinedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_user", ["userId"]),

  // ---------------------------------------------------------- submissions ---
  submissions: defineTable({
    eventId: v.id("events"),
    teamId: v.id("teams"),
    trackId: v.optional(v.id("tracks")),
    title: v.string(),
    tagline: v.string(),
    description: v.string(),
    repositoryUrl: v.string(),
    videoUrl: v.string(),
    demoUrl: v.string(),
    tags: v.string(),
    customFields: v.string(),
    /** draft | submitted */
    status: v.string(),
    submittedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_team", ["teamId"]),

  // -------------------------------------------------------------- rubrics ---
  rubricCriteria: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    description: v.string(),
    /** 0..1, weights sum to 1 */
    weight: v.number(),
    minScore: v.number(),
    maxScore: v.number(),
    sortOrder: v.number(),
  }).index("by_event", ["eventId"]),

  judgeAssignments: defineTable({
    eventId: v.id("events"),
    judgeId: v.id("users"),
    submissionId: v.id("submissions"),
    /** assigned | in_progress | completed */
    status: v.string(),
    assignedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_event", ["eventId"])
    .index("by_judge", ["judgeId"])
    .index("by_submission", ["submissionId"]),

  judgeScores: defineTable({
    eventId: v.id("events"),
    assignmentId: v.id("judgeAssignments"),
    submissionId: v.id("submissions"),
    judgeId: v.id("users"),
    criterionId: v.id("rubricCriteria"),
    score: v.number(),
    privateNotes: v.string(),
    submittedAt: v.number(),
  })
    .index("by_assignment", ["assignmentId"])
    .index("by_event", ["eventId"])
    .index("by_judge_submission", ["judgeId", "submissionId"]),

  pairwiseMatches: defineTable({
    eventId: v.id("events"),
    judgeId: v.id("users"),
    submissionAId: v.id("submissions"),
    submissionBId: v.id("submissions"),
    /** id of winner, or "" for tie */
    winnerId: v.string(),
    createdAt: v.number(),
  }).index("by_event", ["eventId"]),

  // ------------------------------------------------------------ community ---
  communityVotes: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"),
    submissionId: v.id("submissions"),
    /** 1 for plain upvote; quadratic costing uses points = credits spent^2 */
    points: v.number(),
    creditsSpent: v.number(),
    ipHash: v.string(),
    userAgentHash: v.string(),
    createdAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_user_event", ["userId", "eventId"])
    .index("by_submission", ["submissionId"]),

  comments: defineTable({
    submissionId: v.id("submissions"),
    userId: v.id("users"),
    content: v.string(),
    isFlagged: v.boolean(),
    createdAt: v.number(),
  }).index("by_submission", ["submissionId"]),

  // ------------------------------------------------- platform integrity ----
  auditLogs: defineTable({
    eventId: v.optional(v.id("events")),
    actorId: v.optional(v.id("users")),
    action: v.string(),
    targetType: v.string(),
    targetId: v.string(),
    beforeState: v.string(),
    afterState: v.string(),
    ipAddress: v.string(),
    /** previous entry's hash — append-only hash chain for tamper evidence */
    prevHash: v.string(),
    entryHash: v.string(),
    timestamp: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_action", ["action"]),

  webhooks: defineTable({
    eventId: v.id("events"),
    targetUrl: v.string(),
    secretKey: v.string(),
    /** comma-separated event types */
    events: v.string(),
    isActive: v.boolean(),
    createdAt: v.number(),
  }).index("by_event", ["eventId"]),

  webhookDeliveries: defineTable({
    webhookId: v.id("webhooks"),
    eventType: v.string(),
    payload: v.string(),
    statusCode: v.number(),
    success: v.boolean(),
    deliveredAt: v.number(),
  }).index("by_webhook", ["webhookId"]),

  certificates: defineTable({
    certUuid: v.string(),
    eventId: v.id("events"),
    userId: v.id("users"),
    recipientName: v.string(),
    /** participant | judge | winner */
    certType: v.string(),
    title: v.string(),
    trackName: v.string(),
    rank: v.number(),
    signatureHash: v.string(),
    issuedAt: v.number(),
  })
    .index("by_uuid", ["certUuid"])
    .index("by_event", ["eventId"]),

  /** Simple singleton KV store for platform settings (HMAC key, seed state, API keys). */
  platform: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),
});
