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
