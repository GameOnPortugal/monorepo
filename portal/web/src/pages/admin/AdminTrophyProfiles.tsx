import { useState } from "react";
import { ApiError, EmptyState, SkeletonRow } from "../../components/StateViews";
import { adminApi } from "../../lib/api/adminClient";
import { useApi } from "../../lib/useApi";

/**
 * M8.11 — trophy profile moderation: search, toggle isBanned/isExcluded.
 * `hasLeft` is shown but not editable — it's sync-job-derived membership
 * state (M7's TrophiesSyncJob), not a moderation decision (see
 * repositories/admin/trophyProfiles.ts's header).
 */
export function AdminTrophyProfiles() {
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { state, data } = useApi(
    () => adminApi.listTrophyProfiles({ search: search || undefined, limit: 100 }),
    [search, refreshKey],
    (value) => value.trophyProfiles.length === 0,
  );

  async function toggle(id: string, field: "isBanned" | "isExcluded", current: boolean) {
    setBusyId(id);
    try {
      await adminApi.setTrophyProfileFlags(id, { [field]: !current });
      setRefreshKey((k) => k + 1);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Falhou");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl">Perfis de troféus</h1>
      <input
        type="search"
        placeholder="Pesquisar por perfil PSN ou id…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="focus-glow chamfer mt-4 w-full max-w-sm border border-surface-border bg-surface px-3 py-2 text-sm text-white"
      />

      {state === "loading" && <SkeletonRow tiles={4} className="mt-6 grid grid-cols-1 gap-2" />}
      {state === "error" && (
        <div className="mt-6">
          <ApiError what="os perfis" />
        </div>
      )}
      {state !== "loading" && state !== "error" && data && data.trophyProfiles.length === 0 && (
        <div className="mt-6">
          <EmptyState>Nenhum perfil corresponde a esta pesquisa.</EmptyState>
        </div>
      )}
      {state !== "loading" && state !== "error" && data && data.trophyProfiles.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-white/50">
              <tr className="border-b border-surface-border">
                <th className="py-2 pr-3">Perfil PSN</th>
                <th className="py-2 pr-3">Saiu</th>
                <th className="py-2 pr-3">Banido</th>
                <th className="py-2 pr-3">Excluído do leaderboard</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {data.trophyProfiles.map((profile) => (
                <tr key={profile.id}>
                  <td className="py-2 pr-3">{profile.psnProfile ?? "(sem nome)"}</td>
                  <td className="py-2 pr-3 text-white/60">{profile.hasLeft ? "sim" : "não"}</td>
                  <td className="py-2 pr-3">
                    <button
                      type="button"
                      disabled={busyId === profile.id}
                      onClick={() => void toggle(profile.id, "isBanned", profile.isBanned)}
                      className={`focus-glow chamfer border px-2 py-1 text-xs disabled:opacity-40 ${
                        profile.isBanned
                          ? "border-accent-red text-accent-red"
                          : "border-surface-border text-white/60"
                      }`}
                    >
                      {profile.isBanned ? "Banido" : "Ativo"}
                    </button>
                  </td>
                  <td className="py-2 pr-3">
                    <button
                      type="button"
                      disabled={busyId === profile.id}
                      onClick={() => void toggle(profile.id, "isExcluded", profile.isExcluded)}
                      className={`focus-glow chamfer border px-2 py-1 text-xs disabled:opacity-40 ${
                        profile.isExcluded
                          ? "border-accent-red text-accent-red"
                          : "border-surface-border text-white/60"
                      }`}
                    >
                      {profile.isExcluded ? "Excluído" : "No leaderboard"}
                    </button>
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
