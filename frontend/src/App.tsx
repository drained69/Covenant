import { Navigate, Route, Routes } from "react-router-dom";
import { Header } from "./components/Header";
import { Markets } from "./pages/Markets";
import { MarketDetail } from "./pages/MarketDetail";
import { Positions } from "./pages/Positions";
import { Compliance } from "./pages/Compliance";
import { HowItWorks } from "./pages/HowItWorks";

export function App() {
  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Navigate to="/markets" replace />} />
          <Route path="/markets" element={<Markets />} />
          <Route path="/markets/:marketId" element={<MarketDetail />} />
          <Route path="/positions" element={<Positions />} />
          <Route path="/compliance" element={<Compliance />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="*" element={<Navigate to="/markets" replace />} />
        </Routes>
      </main>
      <footer className="border-t border-line py-6 mt-16">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-xs text-subtle">
          <span>Covenant · Compliance-native institutional credit infrastructure</span>
          <span>© 2026 drained99</span>
        </div>
      </footer>
    </div>
  );
}
