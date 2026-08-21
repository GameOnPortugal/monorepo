import { useState } from "react";
import { ApiError, EmptyState, SkeletonRow } from "../../components/StateViews";
import { LazyImage } from "../../components/LazyImage";
import { adminApi } from "../../lib/api/adminClient";
import { useApi } from "../../lib/useApi";

/** M8.11 — screenshot moderation: search, delete (hard delete — no soft-delete column, see repositories/admin/screenshots.ts). */
export function AdminScreenshots() {
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { state, data } = useApi(
    () => adminApi.listScreenshots({ search: search || undefined, limit: 60 }),
    [search, refreshKey],
    (value) => value.screenshots.length === 0,
  );

  async function handleDelete(id: string, name: string | null) {
    if (!window.confirm(`Apagar definitivamente "${name ?? id}"? Esta ação não pode ser desfeita.`)) return;
    setBusyId(id);
    try {
      await adminApi.deleteScreenshot(id);
      setRefreshKey((k) => k + 1);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Falhou");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl">Screenshots</h1>
      <input
        type="search"
        placeholder="Pesquisar por nome ou id…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="focus-glow chamfer mt-4 w-full max-w-sm border border-surface-border bg-surface px-3 py-2 text-sm text-white"
      />

      {state === "loading" && <SkeletonRow className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4" tiles={8} />}
      {state === "error" && (
        <div className="mt-6">
          <ApiError what="as screenshots" />
        </div>
      )}
      {state !== "loading" && state !== "error" && data && data.screenshots.length === 0 && (
        <div className="mt-6">
          <EmptyState>Nenhuma screenshot corresponde a esta pesquisa.</EmptyState>
        </div>
      )}
      {state !== "loading" && state !== "error" && data && data.screenshots.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.screenshots.map((shot) => (
            <div key={shot.id} className="chamfer overflow-hidden border border-surface-border bg-surface">
              <LazyImage src={shot.imageUrl} alt={shot.name ?? "Screenshot"} className="aspect-square" />
              <div className="p-2 text-xs text-white/60">
                <p className="truncate">{shot.name ?? "(sem nome)"}</p>
                <p>{shot.platform ?? "—"}</p>
                <button
                  type="button"
                  disabled={busyId === shot.id}
                  onClick={() => void handleDelete(shot.id, shot.name)}
                  className="focus-glow mt-1 text-accent-red hover:underline disabled:opacity-40"
                >
                  Apagar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
