import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";

// Routing shell for M8.5. Home (M8.6) is the one representative page built
// here; Marketplace/Screenshots/Trophies/Admin (M8.7-M8.12) are follow-on
// work that slot into this same <Routes> — see docs/plans/GLOBAL-PLAN.md M8.

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
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
