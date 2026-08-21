import { useState } from "react";
import { ApiError, EmptyState, SkeletonRow } from "../../components/StateViews";
import { adminApi } from "../../lib/api/adminClient";
import { useApi } from "../../lib/useApi";

const ENTITY_TYPES = ["all", "ad", "screenshot", "trophyProfile"] as const;

/** M8.11 — "who changed what, when": every admin write, from src/audit/db.ts's SQLite file. */
export function AdminAuditLog() {
  const [entityType, setEntityType] = useState<(typeof ENTITY_TYPES)[number]>("all");

  const { state, data } = useApi(
    () => adminApi.listAuditLog({ entityType: entityType === "all" ? undefined : entityType, limit: 100 }),
    [entityType],
    (value) => value.entries.length === 0,
  );

  return (
    <div>
      <h1 className="font-display text-2xl">Registo de auditoria</h1>

      <select
        className="focus-glow chamfer mt-4 border border-surface-border bg-surface px-3 py-2 text-sm text-white"
        value={entityType}
        onChange={(e) => setEntityType(e.target.value as (typeof ENTITY_TYPES)[number])}
      >
        {ENTITY_TYPES.map((t) => (
          <option key={t} value={t}>
            {t === "all" ? "Tipo: todos" : t}
          </option>
        ))}
      </select>

      {state === "loading" && <SkeletonRow tiles={4} className="mt-6 grid grid-cols-1 gap-2" />}
      {state === "error" && (
        <div className="mt-6">
          <ApiError what="o registo" />
        </div>
      )}
      {state !== "loading" && state !== "error" && data && data.entries.length === 0 && (
        <div className="mt-6">
          <EmptyState>Sem ações registadas para este filtro.</EmptyState>
        </div>
      )}
      {state !== "loading" && state !== "error" && data && data.entries.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-white/50">
              <tr className="border-b border-surface-border">
                <th className="py-2 pr-3">Quando</th>
                <th className="py-2 pr-3">Admin</th>
                <th className="py-2 pr-3">Ação</th>
                <th className="py-2 pr-3">Entidade</th>
                <th className="py-2 pr-3">Detalhe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {data.entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="py-2 pr-3 whitespace-nowrap text-white/60">
                    {new Date(entry.at).toLocaleString("pt-PT")}
                  </td>
                  <td className="py-2 pr-3">{entry.adminUsername}</td>
                  <td className="py-2 pr-3">{entry.action}</td>
                  <td className="py-2 pr-3 font-mono text-xs">
                    {entry.entityType}/{entry.entityId}
                  </td>
                  <td className="max-w-[280px] truncate py-2 pr-3 font-mono text-xs text-white/50">
                    {entry.detail ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
