// Thin fetch wrapper over portal-api.
//
// Default is "" (same-origin, `/api/...`) — Vite env vars are inlined at
// BUILD time, not read at container start, so a single built image can't
// hardcode an absolute API host and still work across environments. In
// production this relies on the deploy topology documented in
// infrastructure/caddy/game-on-portugal.pt.caddy: Caddy sends the whole
// domain to the portal-web container, and that container's own nginx (see
// portal/web/docker/nginx.conf) reverse-proxies `/api/` and `/health` to
// portal-api internally — single origin, no CORS.
//
// For local dev, where portal-web (Vite) and portal-api run as two separate
// processes on two ports with no proxy in front, set VITE_API_URL in
// portal/web/.env.local (see .env.example) to point at portal-api directly.
const API_URL = import.meta.env.VITE_API_URL ?? "";

export interface Ad {
  id: string;
  name: string | null;
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
  createdAt: string;
}

export interface Screenshot {
  id: string;
  name: string | null;
  platform: string | null;
  imageUrl: string | null;
  createdAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  psnProfile: string | null;
  points: number;
  trophyCount: number;
}

export interface PortalStats {
  activeAds: number;
  screenshots: number;
  trophies: number;
  hunters: number;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    throw new Error(`portal-api ${path} responded ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => get<{ status: string }>("/health"),
  listAds: (limit = 6) => get<{ ads: Ad[]; total: number }>(`/api/marketplace/ads?limit=${limit}`),
  getAd: (id: string) => get<{ ad: Ad }>(`/api/marketplace/ads/${encodeURIComponent(id)}`),
  listScreenshots: (limit = 8) =>
    get<{ screenshots: Screenshot[]; total: number }>(`/api/screenshots?limit=${limit}`),
  leaderboard: (limit = 10) => get<{ leaderboard: LeaderboardEntry[] }>(`/api/trophies/leaderboard?limit=${limit}`),
  stats: () => get<PortalStats>("/api/stats"),
};
