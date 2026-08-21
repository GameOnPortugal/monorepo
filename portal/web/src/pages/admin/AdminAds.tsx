import { useState } from "react";
import { ApiError, EmptyState, SkeletonRow } from "../../components/StateViews";
import { adminApi, type AdminAd } from "../../lib/api/adminClient";
import { useApi } from "../../lib/useApi";

const STATUS_OPTIONS = ["all", "active", "pending_renewal", "sold", "expired", "deleted"] as const;

/**
 * M8.11 — ads table: search, filter by status (including orphans — the
 * `message_id IS NULL` rows from the known /marketplace sell write-back bug,
 * docs/known-issues.md #1), edit description/price/zone, force-expire,
 * soft-delete. Every write goes through adminApi, which always sends the
 * session cookie (see lib/api/adminClient.ts) and is always audited
 * server-side (portal/api/src/routes/admin.ts).
 */
export function AdminAds() {
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("all");
  const [search, setSearch] = useState("");
  const [orphanOnly, setOrphanOnly] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { state, data } = useApi(
    () =>
      adminApi.listAds({
        status: status === "all" ? undefined : status,
        search: search || undefined,
        orphanOnly,
        limit: 100,
      }),
    [status, search, orphanOnly, refreshKey],
    (value) => value.ads.length === 0,
  );

  const refresh = () => setRefreshKey((k) => k + 1);

  async function withBusy(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await fn();
      refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Falhou");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl">Anúncios</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        <select
          className="focus-glow chamfer border border-surface-border bg-surface px-3 py-2 text-sm text-white"
          value={status}
          onChange={(e) => setStatus(e.target.value as (typeof STATUS_OPTIONS)[number])}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "Estado: todos" : s}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Pesquisar por nome, descrição ou id…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="focus-glow chamfer min-w-0 flex-1 border border-surface-border bg-surface px-3 py-2 text-sm text-white"
        />
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={orphanOnly} onChange={(e) => setOrphanOnly(e.target.checked)} />
          Só órfãos (sem message_id)
        </label>
      </div>

      {state === "loading" && <SkeletonRow tiles={4} className="mt-6 grid grid-cols-1 gap-2" />}
      {state === "error" && (
        <div className="mt-6">
          <ApiError what="os anúncios" />
        </div>
      )}
      {state !== "loading" && state !== "error" && data && data.ads.length === 0 && (
        <div className="mt-6">
          <EmptyState>Nenhum anúncio corresponde a estes filtros.</EmptyState>
        </div>
      )}
      {state !== "loading" && state !== "error" && data && data.ads.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-white/50">
              <tr className="border-b border-surface-border">
                <th className="py-2 pr-3">Nome</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Preço</th>
                <th className="py-2 pr-3">Órfão</th>
                <th className="py-2 pr-3">Criado</th>
                <th className="py-2 pr-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {data.ads.map((ad) => (
                <AdRow
                  key={ad.id}
                  ad={ad}
                  editing={editingId === ad.id}
                  busy={busyId === ad.id}
                  onEdit={() => setEditingId(ad.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSave={(fields) =>
                    withBusy(ad.id, async () => {
                      await adminApi.editAd(ad.id, fields);
                      setEditingId(null);
                    })
                  }
                  onExpire={() => withBusy(ad.id, () => adminApi.expireAd(ad.id))}
                  onDelete={() => {
                    if (!window.confirm(`Apagar (soft-delete) "${ad.name ?? ad.id}"?`)) return;
                    void withBusy(ad.id, () => adminApi.deleteAd(ad.id));
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AdRow({
  ad,
  editing,
  busy,
  onEdit,
  onCancelEdit,
  onSave,
  onExpire,
  onDelete,
}: {
  ad: AdminAd;
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (fields: { description?: string; price?: string; zone?: string }) => void;
  onExpire: () => void;
  onDelete: () => void;
}) {
  const [description, setDescription] = useState(ad.description ?? "");
  const [price, setPrice] = useState(ad.price ?? "");
  const [zone, setZone] = useState(ad.zone ?? "");

  if (editing) {
    return (
      <tr>
        <td colSpan={6} className="py-3">
          <div className="chamfer flex flex-col gap-2 border border-surface-border bg-surface p-3">
            <input
              className="focus-glow chamfer border border-surface-border bg-background px-2 py-1 text-sm text-white"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Preço"
            />
            <input
              className="focus-glow chamfer border border-surface-border bg-background px-2 py-1 text-sm text-white"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              placeholder="Zona"
            />
            <textarea
              className="focus-glow chamfer border border-surface-border bg-background px-2 py-1 text-sm text-white"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Descrição"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onSave({ description, price, zone })}
                className="focus-glow chamfer bg-accent-blue px-3 py-1.5 text-sm font-semibold text-background disabled:opacity-50"
              >
                Guardar
              </button>
              <button type="button" onClick={onCancelEdit} className="focus-glow px-3 py-1.5 text-sm text-white/60">
                Cancelar
              </button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="max-w-[220px] truncate py-2 pr-3">{ad.name ?? "(sem nome)"}</td>
      <td className="py-2 pr-3">{ad.status}</td>
      <td className="py-2 pr-3">{ad.price ?? "—"}</td>
      <td className="py-2 pr-3">{ad.isOrphan ? "sim" : "não"}</td>
      <td className="py-2 pr-3 text-white/60">{new Date(ad.createdAt).toLocaleDateString("pt-PT")}</td>
      <td className="py-2 pr-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onEdit} className="focus-glow text-accent-blue hover:underline">
            Editar
          </button>
          <button
            type="button"
            disabled={busy || ad.status === "expired"}
            onClick={onExpire}
            className="focus-glow text-accent-yellow hover:underline disabled:opacity-40"
          >
            Expirar
          </button>
          <button
            type="button"
            disabled={busy || ad.status === "deleted"}
            onClick={onDelete}
            className="focus-glow text-accent-red hover:underline disabled:opacity-40"
          >
            Apagar
          </button>
        </div>
      </td>
    </tr>
  );
}
