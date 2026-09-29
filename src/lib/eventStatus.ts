export type DerivedStatus =
  | "draft"
  | "coming_soon"
  | "registration_open"
  | "registration_closed"
  | "submissions_open"
  | "submissions_closed"
  | "judging"
  | "results_pending"
  | "completed";

export interface DerivedEventStatusInfo {
  status: DerivedStatus;
  label: string;
  canRegister: boolean;
  canSubmit: boolean;
  canJudge: boolean;
  canVote: boolean;
}

/**
 * The next date that actually matters for an event's current stage (issue 36).
 *
 * A table column called "Deadline" that always printed the submission deadline
 * was meaningless for an event in registration, judging or voting: the date it
 * showed had already passed and no longer governed anything. This returns the
 * phase that is genuinely next, so the column reads sensibly for every stage.
 */
export function nextDeadline(event: any, now = Date.now()): { label: string; date: number | null } {
  if (!event) return { label: "—", date: null };
  const regEnd = event.registrationCloses ?? event.registrationEnd ?? null;
  const subDeadline = event.submissionDeadline ?? null;
  const judgeEnd = event.judgingEnds ?? event.judgingEnd ?? null;
  const votingEnd = event.votingEnd ?? null;

  switch (event.status) {
    case "registration":
      return { label: "Registration closes", date: regEnd };
    case "hacking":
      return { label: "Submissions close", date: subDeadline };
    case "judging":
      return { label: "Judging closes", date: judgeEnd };
    case "voting":
      return { label: "Voting closes", date: votingEnd };
    case "published":
    case "closed":
    case "archived":
      return { label: "Results published", date: event.resultsAnnounced ?? event.publishedAt ?? votingEnd };
    case "draft":
    default:
      return { label: "Draft — not scheduled", date: regEnd };
  }
}

export function deriveEventStatus(event: any, now = Date.now()): DerivedEventStatusInfo {
  if (!event) {
    return {
      status: "draft",
      label: "Draft",
      canRegister: false,
      canSubmit: false,
      canJudge: false,
      canVote: false,
    };
  }

  if (event.status === "draft") {
    return {
      status: "draft",
      label: "Draft",
      canRegister: false,
      canSubmit: false,
      canJudge: false,
      canVote: false,
    };
  }

  const regStart = event.registrationOpens ?? event.registrationStart ?? 0;
  const regEnd = event.registrationCloses ?? event.registrationEnd ?? Number.MAX_SAFE_INTEGER;
  const subOpens = event.submissionOpens ?? regStart;
  const subDeadline = event.submissionDeadline ?? regEnd;
  const judgeStart = event.judgingStarts ?? event.judgingStart ?? subDeadline;
  const judgeEnd = event.judgingEnds ?? event.judgingEnd ?? Number.MAX_SAFE_INTEGER;
  const votingStart = event.votingStart ?? judgeStart;
  const votingEnd = event.votingEnd ?? judgeEnd;
  const resultsAnnounced = event.resultsAnnounced ?? votingEnd;

  if (now < regStart) {
    return {
      status: "coming_soon",
      label: "Coming Soon",
      canRegister: false,
      canSubmit: false,
      canJudge: false,
      canVote: false,
    };
  }

  if (now >= regStart && now <= regEnd) {
    const isSubOpen = now >= subOpens && now <= subDeadline;
    return {
      status: "registration_open",
      label: "Registration Open",
      canRegister: true,
      canSubmit: isSubOpen,
      canJudge: false,
      canVote: false,
    };
  }

  if (now > regEnd && now < subOpens) {
    return {
      status: "registration_closed",
      label: "Registration Closed",
      canRegister: false,
      canSubmit: false,
      canJudge: false,
      canVote: false,
    };
  }

  if (now >= subOpens && now <= subDeadline) {
    return {
      status: "submissions_open",
      label: "Submissions Open",
      canRegister: false,
      canSubmit: true,
      canJudge: false,
      canVote: false,
    };
  }

  if (now > subDeadline && now < judgeStart) {
    return {
      status: "submissions_closed",
      label: "Submissions Closed",
      canRegister: false,
      canSubmit: false,
      canJudge: false,
      canVote: false,
    };
  }

  if (now >= judgeStart && now <= judgeEnd) {
    const isVoting = now >= votingStart && now <= votingEnd;
    return {
      status: "judging",
      label: "Judging Phase",
      canRegister: false,
      canSubmit: false,
      canJudge: true,
      canVote: isVoting,
    };
  }

  if (now > judgeEnd && now < resultsAnnounced) {
    return {
      status: "results_pending",
      label: "Results Pending",
      canRegister: false,
      canSubmit: false,
      canJudge: false,
      canVote: false,
    };
  }

  return {
    status: "completed",
    label: "Results Published",
    canRegister: false,
    canSubmit: false,
    canJudge: false,
    canVote: false,
  };
}
