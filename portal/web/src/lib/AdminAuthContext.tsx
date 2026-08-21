import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { adminApi, type AuthMe } from "./api/adminClient";

// M8.10 — one place that knows "is anyone logged in, and as whom". Backed by
// GET /api/auth/me (cheap — decodes the signed cookie locally, no Discord
// round trip) rather than trying to read the httpOnly cookie from JS, which
// is the point of it being httpOnly.
interface AdminAuthState extends AuthMe {
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthState | undefined>(undefined);

const API_URL = import.meta.env.VITE_API_URL ?? "";

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<AuthMe>({ authenticated: false, configured: true });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setMe(await adminApi.me());
    } catch {
      setMe({ authenticated: false, configured: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await adminApi.logout();
    await refresh();
  }, [refresh]);

  return (
    <AdminAuthContext.Provider value={{ ...me, loading, refresh, logout }}>{children}</AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthState {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth() must be used within <AdminAuthProvider>");
  return ctx;
}

/** `/api/auth/login`'s redirect_uri is the API's own origin (see routes/auth.ts) — this just points the browser at it. */
export function discordLoginUrl(): string {
  return `${API_URL}/api/auth/login`;
}
