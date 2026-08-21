import { Link } from "react-router-dom";
import { ApiError, SkeletonRow } from "../../components/StateViews";
import { adminApi } from "../../lib/api/adminClient";
import { useApi } from "../../lib/useApi";

/** M8.11/M8.12 — counts, recent activity, job run status (plan 03's Admin > Dashboard row). */
export function AdminDashboard() {
  const { state, data } = useApi(() => adminApi.dashboard(), [], () => false);

  if (state === "loading") return <SkeletonRow tiles={4} />;
  if (state === "error" || !data) return <ApiError what="o dashboard" />;

  const adStatuses = Object.entries(data.ads);
  const failingJobs = data.jobs.filter((j) => j.status !== "success");

  return (
    <div className="space-y-8">
      <section>
        <h1 className="font-display text-2xl">Dashboard</h1>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {adStatuses.map(([status, count]) => (
            <div key={status} className="chamfer border border-surface-border bg-surface px-4 py-3">
              <div className="font-display text-2xl text-accent-mint">{count}</div>
              <div className="mt-1 text-xs text-white/60">Anúncios: {status}</div>
            </div>
          ))}
          <div className="chamfer border border-surface-border bg-surface px-4 py-3">
            <div className="font-display text-2xl text-accent-mint">{data.screenshots}</div>
            <div className="mt-1 text-xs text-white/60">Screenshots</div>
          </div>
          <div className="chamfer border border-surface-border bg-surface px-4 py-3">
            <div className="font-display text-2xl text-accent-mint">{data.trophyProfiles}</div>
            <div className="mt-1 text-xs text-white/60">Perfis de troféus</div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg">Jobs</h2>
          <Link to="/admin/jobs" className="focus-glow text-sm text-accent-blue hover:underline">
            Ver tudo →
          </Link>
        </div>
        {failingJobs.length > 0 ? (
          <p className="mt-2 border-l-2 border-accent-red pl-3 text-sm text-white/80">
            {failingJobs.length} job(s) não terminaram com sucesso na última execução.
          </p>
        ) : (
          <p className="mt-2 text-sm text-white/60">Todos os jobs terminaram com sucesso na última execução.</p>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg">Atividade recente</h2>
          <Link to="/admin/audit-log" className="focus-glow text-sm text-accent-blue hover:underline">
            Ver tudo →
          </Link>
        </div>
        {data.recentAudit.length === 0 ? (
          <p className="mt-2 text-sm text-white/60">Sem ações registadas ainda.</p>
        ) : (
          <ul className="mt-2 divide-y divide-surface-border border border-surface-border text-sm">
            {data.recentAudit.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span>
                  <span className="text-white/60">{entry.adminUsername}</span> — {entry.action} ({entry.entityType})
                </span>
                <span className="shrink-0 text-xs text-white/40">{new Date(entry.at).toLocaleString("pt-PT")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
