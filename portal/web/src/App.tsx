import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AdminAuthProvider } from "./lib/AdminAuthContext";
import { HallOfFame } from "./pages/HallOfFame";
import { Home } from "./pages/Home";
import { Marketplace } from "./pages/Marketplace";
import { MarketplaceDetail } from "./pages/MarketplaceDetail";
import { Screenshots } from "./pages/Screenshots";
import { Trophies } from "./pages/Trophies";
import { AdminAds } from "./pages/admin/AdminAds";
import { AdminAuditLog } from "./pages/admin/AdminAuditLog";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { AdminJobs } from "./pages/admin/AdminJobs";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminScreenshots } from "./pages/admin/AdminScreenshots";
import { AdminTrophyProfiles } from "./pages/admin/AdminTrophyProfiles";

// Routing shell for M8.5, filled in by M8.6-M8.9 (public) and M8.10-M8.12
// (admin). Admin is a separate top-level route tree, NOT nested under the
// public `<Layout>` — it has its own nav/chrome (AdminLayout) and its own
// auth gate, so reusing the public header/footer would be more to strip out
// than to reuse. `AdminAuthProvider` is scoped to just this route (not
// wrapping the whole app in main.tsx) so an anonymous visitor browsing the
// public pages never fires the `/api/auth/me` check at all.

function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="font-display text-3xl">404</h1>
      <p className="mt-2 text-white/70">Esta página não existe.</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="marketplace" element={<Marketplace />} />
        <Route path="marketplace/:id" element={<MarketplaceDetail />} />
        <Route path="screenshots" element={<Screenshots />} />
        <Route path="screenshots/hall-of-fame" element={<HallOfFame />} />
        <Route path="trophies" element={<Trophies />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route
        path="admin"
        element={
          <AdminAuthProvider>
            <AdminLayout />
          </AdminAuthProvider>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="ads" element={<AdminAds />} />
        <Route path="screenshots" element={<AdminScreenshots />} />
        <Route path="trophy-profiles" element={<AdminTrophyProfiles />} />
        <Route path="jobs" element={<AdminJobs />} />
        <Route path="audit-log" element={<AdminAuditLog />} />
      </Route>
    </Routes>
  );
}
