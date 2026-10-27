// Client-side routes — PHASE_01 §1.109 ("Add React routing").
//
// Every page is behind Sign in except Sign in itself. An address that
// is not a page goes where "/" goes -- Sign in, or the Lobby when signed
// in -- and shows nothing of its own (owner 2026-10-24: no developer
// placeholder for a stranger to read).

import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./LoginPage";
// Spec 0014 — loaded with Sign in: a stranger with an invitation link must
// be able to open it, and the build serves strangers only Sign in's files.
import { JoinPage } from "./JoinPage";
import { RequireAuth, useAuth } from "./AuthContext";

// Every signed-in page is its own download, fetched after signing in
// and refused by the server to anybody without a session (owner
// 2026-10-24: a stranger gets the sign-in screen and nothing else).
const App = lazy(() => import("./App"));
const AdminPage = lazy(() => import("./AdminPage"));
const DecksPage = lazy(() => import("./DecksPage"));
const LobbyPage = lazy(() => import("./LobbyPage"));
const HallPage = lazy(() => import("./HallPage"));
const GamePage = lazy(() => import("./GamePage"));
const AccountPage = lazy(() => import("./AccountPage").then((m) => ({ default: m.AccountPage })));
const Shell = lazy(() => import("./shell/Shell").then((m) => ({ default: m.Shell })));

/** A page being fetched shows nothing, briefly -- the header comes with it. */
const page = (element: ReactNode) => <Suspense fallback={null}>{element}</Suspense>;

// BATTLEFIELD_RENDERING.md §6: a synthetic board for development. Loaded
// on demand so the board's code and fonts are not in every page's bundle.
const DevBoardPage = lazy(() => import("./battlefield/DevBoardPage"));
const DevBenchPage = lazy(() => import("./battlefield/DevBenchPage"));

/**
 * The address everyone types (the canvas's note f1): the Lobby when
 * signed in, Sign in when not. Nothing in between flashes: while the
 * session check is out, it waits.
 */
function Home() {
  const { state } = useAuth();
  // A blank page for the moment the session check takes: the page then
  // appears as it is, not after a line of text (owner 2026-10-24).
  if (state.status === "loading")
    return <p className="pa-visually-hidden">Checking your session…</p>;
  return <Navigate to={state.status === "authenticated" ? "/play" : "/login"} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      {/* The Phase 1 foundation page: the server's own health, kept as
          a diagnostic now that "/" is the way into the app, and the home
          of PixiJS's lifecycle check (BATTLEFIELD_RENDERING.md §1).
          Signed-in only since 2026-10-22: a stranger has no use for the
          server's version and state, and an administrator has them on
          the Admin page too. */}
      <Route path="/status" element={<RequireAuth>{page(<App />)}</RequireAuth>} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/join" element={<JoinPage />} />
      {/* Every signed-in page, inside the shared header and the one
          live connection (PHASE_07 §7.62). Protected because every API
          behind them requires a session: an anonymous visitor would
          otherwise meet a page of 401s rather than a login form
          (PHASE_03 §3.67, PHASE_05 AMENDMENT 4). */}
      <Route element={<RequireAuth>{page(<Shell />)}</RequireAuth>}>
        <Route path="/play" element={page(<LobbyPage />)} />
        {/* Spec 0018 — the Hall of Champions. */}
        <Route path="/hall" element={page(<HallPage />)} />
        {/* Spec 0013 — the game on its own page: a refresh draws the game,
            never the lobby first. */}
        <Route path="/game" element={page(<GamePage />)} />
        <Route path="/decks" element={page(<DecksPage />)} />
        <Route path="/account" element={page(<AccountPage />)} />
        {/* PHASE_07 §7.67 — the page says so to a player; the API
            refuses them whatever they do. */}
        <Route path="/admin" element={page(<AdminPage />)} />
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
      {/* Any other address. The SERVER serves index.html for every
          page-like path, so this is where an unknown one is answered:
          by going home, never by a page of its own. */}
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
