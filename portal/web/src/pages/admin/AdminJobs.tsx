import { ApiError, EmptyState, SkeletonRow } from "../../components/StateViews";
import { adminApi } from "../../lib/api/adminClient";
import { useApi } from "../../lib/useApi";

/**
 * M8.12 — job runner status, read-only. `job_runs` (discord-bot's M6.1) is
 * written by the bot's own in-process scheduler; this page shows the last
 * run of each job (name, status, when, summary/error) but cannot trigger
 * one — see portal/api/src/repositories/admin/jobs.ts's header for exactly
 * why (no HTTP surface on the bot to call, and that tree is out of this
 * agent's scope), and the M8.12 row of docs/plans/GLOBAL-PLAN.md for the
 * decision written up in full.
 */
export function AdminJobs() {
  const { state, data } = useApi(() => adminApi.listJobs(), [], (value) => value.jobs.length === 0);

  return (
    <div>
      <h1 className="font-display text-2xl">Jobs</h1>
      <p className="mt-1 text-sm text-white/60">
        Estado da última execução de cada job do bot. Sem botão de "executar agora" — ver nota na M8.12 do plano.
      </p>

      {state === "loading" && <SkeletonRow tiles={3} className="mt-6 grid grid-cols-1 gap-2" />}
      {state === "error" && (
        <div className="mt-6">
          <ApiError what="os jobs" />
        </div>
      )}
      {state !== "loading" && state !== "error" && data && data.jobs.length === 0 && (
        <div className="mt-6">
          <EmptyState>Ainda não há nenhuma execução registada.</EmptyState>
        </div>
      )}
      {state !== "loading" && state !== "error" && data && data.jobs.length > 0 && (
        <div className="mt-6 space-y-3">
          {data.jobs.map((job) => (
            <div key={job.id} className="chamfer border border-surface-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-display text-sm">{job.jobName}</span>
                <span
                  className={`chamfer border px-2 py-0.5 text-xs ${
                    job.status === "success"
                      ? "border-accent-mint text-accent-mint"
                      : "border-accent-red text-accent-red"
                  }`}
                >
                  {job.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-white/50">{new Date(job.lastRunAt).toLocaleString("pt-PT")}</p>
              {job.summary && <p className="mt-2 text-sm text-white/80">{job.summary}</p>}
              {job.error && <p className="mt-2 border-l-2 border-accent-red pl-3 text-sm text-white/80">{job.error}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
