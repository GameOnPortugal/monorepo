import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { HallOfFame } from "./pages/HallOfFame";
import { Home } from "./pages/Home";
import { Marketplace } from "./pages/Marketplace";
import { MarketplaceDetail } from "./pages/MarketplaceDetail";
import { Screenshots } from "./pages/Screenshots";
import { Trophies } from "./pages/Trophies";

// Routing shell for M8.5, filled in by M8.6-M8.9. Admin (M8.10-M8.12) is not
// part of this agent's scope — see docs/plans/GLOBAL-PLAN.md M8 rows.

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
    </Routes>
  );
}
