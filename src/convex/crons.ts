import { cronJobs } from "convex/server";

/**
 * Scheduled jobs. RaptorJudge is fully offline; webhook deliveries are
 * attempted inline when events fire, so no cron jobs are needed for the MVP.
 */
const crons = cronJobs();
export default crons;
