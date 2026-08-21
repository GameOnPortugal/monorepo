// M8.10/M8.11/M8.12 — admin API client. Separate from client.ts (the public
// one) for one reason: every call here needs `credentials: "include"` so the
// httpOnly session cookie (portal/api/src/middleware/requireAdmin.ts) rides
// along, which the public client deliberately does not send (no session to
// send in the first place). Same same-origin-by-default host resolution as
// client.ts — see that file's header for why VITE_API_URL is local-dev-only.
const API_URL = import.meta.env.VITE_API_URL ?? "";

export class AdminApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new AdminApiError(res.status, body.error ?? `portal-api ${path} responded ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface AuthMe {
  authenticated: boolean;
  configured: boolean;
  user?: { id: string; username: string; avatar: string | null };
}

export interface AdminAd {
  id: string;
  name: string | null;
  authorId: string | null;
  adType: string | null;
  status: string;
  state: string | null;
  price: string | null;
  price_cents: number | null;
  zone: string | null;
  dispatch: string | null;
  warranty: string | null;
  description: string | null;
  images: string[];
  bumped_at: string | null;
  expires_at: string | null;
  sold_at: string | null;
  deleted_at: string | null;
  createdAt: string;
  isOrphan: boolean;
}

export interface AdminScreenshot {
  id: string;
  name: string | null;
  authorId: string | null;
  platform: string | null;
  imageUrl: string | null;
  createdAt: string;
}

export interface AdminTrophyProfile {
  id: string;
  userId: string | null;
  psnProfile: string | null;
  isBanned: boolean;
  hasLeft: boolean;
  isExcluded: boolean;
  createdAt: string;
}

export interface AdminJobRun {
  id: string;
  jobName: string;
  lastRunAt: string;
  status: string;
  summary: string | null;
  error: string | null;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: number;
  at: string;
  adminId: string;
  adminUsername: string;
  action: string;
  entityType: string;
  entityId: string;
  detail: string | null;
}

export interface AdminDashboard {
  ads: Record<string, number>;
  screenshots: number;
  trophyProfiles: number;
  jobs: AdminJobRun[];
  recentAudit: AuditLogEntry[];
}

export const adminApi = {
  me: () => request<AuthMe>("/api/auth/me"),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  dashboard: () => request<AdminDashboard>("/api/admin/dashboard"),

  listAds: (params: { status?: string; search?: string; orphanOnly?: boolean; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params.status) q.set("status", params.status);
    if (params.search) q.set("search", params.search);
    if (params.orphanOnly) q.set("orphan", "true");
    q.set("limit", String(params.limit ?? 50));
    q.set("offset", String(params.offset ?? 0));
    return request<{ ads: AdminAd[]; total: number }>(`/api/admin/ads?${q}`);
  },
  editAd: (id: string, fields: { description?: string; price?: string; zone?: string }) =>
    request<{ ad: AdminAd }>(`/api/admin/ads/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    }),
  expireAd: (id: string) =>
    request<{ ad: AdminAd }>(`/api/admin/ads/${encodeURIComponent(id)}/expire`, { method: "POST" }),
  deleteAd: (id: string) => request<{ ad: AdminAd }>(`/api/admin/ads/${encodeURIComponent(id)}`, { method: "DELETE" }),

  listScreenshots: (params: { search?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params.search) q.set("search", params.search);
    q.set("limit", String(params.limit ?? 50));
    q.set("offset", String(params.offset ?? 0));
    return request<{ screenshots: AdminScreenshot[]; total: number }>(`/api/admin/screenshots?${q}`);
  },
  deleteScreenshot: (id: string) =>
    request<{ ok: true }>(`/api/admin/screenshots/${encodeURIComponent(id)}`, { method: "DELETE" }),

  listTrophyProfiles: (params: { search?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params.search) q.set("search", params.search);
    q.set("limit", String(params.limit ?? 50));
    q.set("offset", String(params.offset ?? 0));
    return request<{ trophyProfiles: AdminTrophyProfile[]; total: number }>(`/api/admin/trophy-profiles?${q}`);
  },
  setTrophyProfileFlags: (id: string, flags: { isBanned?: boolean; isExcluded?: boolean }) =>
    request<{ trophyProfile: AdminTrophyProfile }>(`/api/admin/trophy-profiles/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(flags),
    }),

  listJobs: () => request<{ jobs: AdminJobRun[] }>("/api/admin/jobs"),

  listAuditLog: (params: { entityType?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params.entityType) q.set("entityType", params.entityType);
    q.set("limit", String(params.limit ?? 50));
    q.set("offset", String(params.offset ?? 0));
    return request<{ entries: AuditLogEntry[]; total: number }>(`/api/admin/audit-log?${q}`);
  },
};
