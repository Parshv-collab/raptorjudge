import type { Doc } from "../_generated/dataModel";

export function getWindow(
  event: Doc<"events">,
  phase: "registration" | "submission" | "judging" | "voting",
): { start: number; end: number } {
  switch (phase) {
    case "registration":
      return {
        start: event.registrationOpens ?? event.registrationStart ?? 0,
        end: event.registrationCloses ?? event.registrationEnd ?? Number.MAX_SAFE_INTEGER,
      };
    case "submission":
      return {
        start: event.submissionOpens ?? event.registrationOpens ?? event.registrationStart ?? 0,
        end: event.submissionDeadline ?? event.registrationCloses ?? event.registrationEnd ?? Number.MAX_SAFE_INTEGER,
      };
    case "judging":
      return {
        start: event.judgingStarts ?? event.judgingStart ?? 0,
        end: event.judgingEnds ?? event.judgingEnd ?? Number.MAX_SAFE_INTEGER,
      };
    case "voting":
      return {
        start: event.votingStart ?? 0,
        end: event.votingEnd ?? Number.MAX_SAFE_INTEGER,
      };
  }
}

export function assertWithinWindow(
  event: Doc<"events">,
  phase: "registration" | "submission" | "judging" | "voting",
  now = Date.now(),
): void {
  const window = getWindow(event, phase);
  const formatDate = (ts: number) =>
    ts && ts !== Number.MAX_SAFE_INTEGER
      ? new Date(ts).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
      : "configured date";

  if (now < window.start) {
    switch (phase) {
      case "registration":
        throw new Error(`Registration opens on ${formatDate(window.start)}.`);
      case "submission":
        throw new Error(`Submissions open on ${formatDate(window.start)}.`);
      case "judging":
        throw new Error(`Judging opens on ${formatDate(window.start)}.`);
      case "voting":
        throw new Error(`Voting opens on ${formatDate(window.start)}.`);
    }
  }

  if (now > window.end) {
    switch (phase) {
      case "registration":
        throw new Error(`Registration closed on ${formatDate(window.end)}.`);
      case "submission":
        throw new Error(`Submission deadline passed on ${formatDate(window.end)}.`);
      case "judging":
        throw new Error(`Judging closed on ${formatDate(window.end)}.`);
      case "voting":
        throw new Error(`Voting closed on ${formatDate(window.end)}.`);
    }
  }
}
