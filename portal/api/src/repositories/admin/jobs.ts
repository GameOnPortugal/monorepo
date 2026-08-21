// M8.12 — admin jobs page, read-only.
//
// `job_runs` (discord-bot/prisma/schema.prisma's JobRun model, M6.1) is
// written by the bot's in-process scheduler after every tick — job_name,
// last_run_at, status, summary, error. This module only ever reads it.
//
// No "trigger a job" endpoint: plan 03's original acceptance criterion ("An
// admin can dry-run the winner job and see the result") would need the
// portal to make a job actually run, and the only thing that can do that is
// the bot process itself — there is no HTTP endpoint on the bot for it today,
// and adding one is a discord-bot/src change, out of this agent's scope (the
// task brief hands that tree to a different agent) and arguably a separate,
// security-sensitive work item of its own (an unauthenticated-at-the-network-
// layer trigger endpoint on the bot). Recorded as a decision in the M8.12 row
// of docs/plans/GLOBAL-PLAN.md: this ships the read-only half now; a
// follow-up item should add a narrow, admin-authenticated trigger surface on
// the bot (or a shared queue table) once that tree is free to change.
import { prisma } from "../../db";

export interface AdminJobRun {
  id: string;
  jobName: string;
  lastRunAt: Date;
  status: string;
  summary: string | null;
  error: string | null;
  updatedAt: Date;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toAdminJobRun(row: any): AdminJobRun {
  return {
    id: row.id,
    jobName: row.job_name,
    lastRunAt: row.last_run_at,
    status: row.status,
    summary: row.summary,
    error: row.error,
    updatedAt: row.updatedAt,
  };
}

export async function listJobRuns(): Promise<AdminJobRun[]> {
  const rows = await prisma.jobRun.findMany({ orderBy: { job_name: "asc" } });
  return rows.map(toAdminJobRun);
}
