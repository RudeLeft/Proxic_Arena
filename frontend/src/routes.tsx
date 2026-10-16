// Client-side routes — PHASE_01 §1.109 ("Add React routing").
//
// Phase 1 has one real page. The others exist because §1.27 requires
// the server's SPA fallback to serve React routes that have no file
// behind them, and a fallback with nothing to fall back TO is
// untested infrastructure.
//
// What these placeholders must not do is pretend (§1.105: no fake
// gameplay). They say which phase owns the page and nothing else. A
// mock table with mock cards would look like progress and would have
// to be deleted before the real one could be written.

import { Route, Routes } from "react-router-dom";
import App from "./App";
import DecksPage from "./DecksPage";

function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <main>
      <h1>PROXIC ARENA</h1>
      <p className="sub">{title}</p>
      <section className="panel">
        <p>Not implemented yet — {phase}.</p>
        <p className="hint">
          This route exists so the server's SPA fallback has something to serve. It is deliberately
          empty rather than a mock.
        </p>
      </section>
      <p className="verdict">
        <a href="/">Back to the foundation page</a>
      </p>
    </main>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/play" element={<Placeholder title="Play" phase="Phases 5–7" />} />
      <Route path="/decks" element={<DecksPage />} />
      {/* A client-side 404. The SERVER cannot distinguish an unknown
          React route from a known one -- it serves index.html for
          both -- so the only place this can be answered honestly is
          here. */}
      <Route path="*" element={<Placeholder title="Not found" phase="no such page" />} />
    </Routes>
  );
}
