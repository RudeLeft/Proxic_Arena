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

import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import App from "./App";
import AdminPage from "./AdminPage";
import DecksPage from "./DecksPage";
import LobbyPage from "./LobbyPage";
import { AccountPage, LoginPage } from "./LoginPage";
import { RequireAuth, useAuth } from "./AuthContext";
import { Shell } from "./shell/Shell";

// BATTLEFIELD_RENDERING.md §6: a synthetic board for development. Loaded
// on demand so the board's code and fonts are not in every page's bundle.
const DevBoardPage = lazy(() => import("./battlefield/DevBoardPage"));
const DevBenchPage = lazy(() => import("./battlefield/DevBenchPage"));

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

/**
 * The address everyone types (the canvas's note f1): the Lobby when
 * signed in, Sign in when not. Nothing in between flashes: while the
 * session check is out, it waits.
 */
function Home() {
  const { state } = useAuth();
  if (state.status === "loading") return <p className="hint">Checking your session…</p>;
  return <Navigate to={state.status === "authenticated" ? "/play" : "/login"} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      {/* The Phase 1 foundation page: the server's own health, kept as
          a diagnostic now that "/" is the way into the app. */}
      <Route path="/status" element={<App />} />
      <Route path="/login" element={<LoginPage />} />
      {/* Every signed-in page, inside the shared header and the one
          live connection (PHASE_07 §7.62). Protected because every API
          behind them requires a session: an anonymous visitor would
          otherwise meet a page of 401s rather than a login form
          (PHASE_03 §3.67, PHASE_05 AMENDMENT 4). */}
      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route path="/play" element={<LobbyPage />} />
        <Route path="/decks" element={<DecksPage />} />
        <Route path="/account" element={<AccountPage />} />
        {/* PHASE_07 §7.67 — the page says so to a player; the API
            refuses them whatever they do. */}
        <Route path="/admin" element={<AdminPage />} />
      </Route>
      {/* Unlinked, signed-in only, and labelled synthetic on screen
          (BATTLEFIELD_RENDERING.md §6). Not a game: no match, no
          server traffic beyond the session check. */}
      <Route
        path="/dev/bench"
        element={
          <RequireAuth>
            <Suspense fallback={null}>
              <DevBenchPage />
            </Suspense>
          </RequireAuth>
        }
      />
      <Route
        path="/dev/board"
        element={
          <RequireAuth>
            <Suspense fallback={null}>
              <DevBoardPage />
            </Suspense>
          </RequireAuth>
        }
      />
      {/* A client-side 404. The SERVER cannot distinguish an unknown
          React route from a known one -- it serves index.html for
          both -- so the only place this can be answered honestly is
          here. */}
      <Route path="*" element={<Placeholder title="Not found" phase="no such page" />} />
    </Routes>
  );
}
