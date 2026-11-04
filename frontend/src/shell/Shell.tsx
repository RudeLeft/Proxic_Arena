// The signed-in shell — PHASE_07 §7.62 and the canvas's header.
//
// One header on every signed-in page: the logo (back to the Lobby),
// Deck Depot, Lobby, Account, Admin only for an administrator, the
// connection's state, and Sign out (this session only; "Sign out
// everywhere" is on the Account page). Showing Admin to administrators
// alone is the courtesy: the server re-reads the role from the session
// on every request (Phase 3 §3.19).

import { ReportButton } from "../ReportDialog";
import { logLine } from "../reportLog";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { NoticeStack } from "../NoticeStack";
import type { ConnectionState } from "../lobby";
import { useSettled } from "../useSettled";
import { LobbyConnectionProvider, useLobbyConnection } from "./LobbyConnection";
import { PageNoticesProvider, isGameRoute, usePageNotices } from "./PageNotices";
import logo from "../assets/logo-header.webp";
import "./base.css";
import "./app.css";

function ConnectionState() {
  const { lobby } = useLobbyConnection();
  // Owner 2026-10-24: "Connecting…" for the moment a refresh takes, or
  // "Reconnecting…" for a blip, flashed too fast to read. A state that
  // lasts a second is shown; until then the pill keeps its last word
  // (and on a fresh page holds its place, empty).
  const passing = lobby.connection === "connecting" || lobby.connection === "reconnecting";
  const settled = useSettled(passing, 1000);
  const [shown, setShown] = useState<ConnectionState | null>(null);
  useEffect(() => {
    if (!passing || settled) setShown(lobby.connection);
  }, [lobby.connection, passing, settled]);
  const state = shown ?? lobby.connection;
  const label =
    state === "open"
      ? "Connected"
      : state === "connecting"
        ? "Connecting…"
        : state === "reconnecting"
          ? "Reconnecting…"
          : "Signed out";
  return (
    <span
      className={`pa-connection pa-connection-${state}${shown === null ? " pa-connection-quiet" : ""}`}
      role="status"
    >
      <span aria-hidden="true" className="pa-connection-dot" />
      {label}
    </span>
  );
}

/** Spec 0050 — the page's notices, top right; the game screen draws its own on the table. */
function PageStack() {
  const notices = usePageNotices();
  const { pathname } = useLocation();
  if (isGameRoute(pathname)) return null;
  return <NoticeStack notices={notices} place="page" />;
}

function Header() {
  const { state, signOut } = useAuth();
  const navigate = useNavigate();
  const admin = state.status === "authenticated" && state.user.role === "ADMIN";
  const tab = ({ isActive }: { isActive: boolean }) => `pa-tab${isActive ? " pa-tab-active" : ""}`;
  // Spec 0006: on a phone the pages and Sign out fold behind a menu
  // button; following a link closes it.
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMenuOpen(false), [pathname]);
  // Spec 0039 — a page change is a line in the page's log.
  useEffect(() => logLine("page", `went to ${pathname}`), [pathname]);
  return (
    <header className={`pa-header${menuOpen ? " pa-header-open" : ""}`}>
      <NavLink to="/play" className="pa-logo" aria-label="Proxic Arena lobby">
        <img src={logo} alt="Proxic Arena" width={156} height={52} />
      </NavLink>
      <button
        type="button"
        className="pa-menu-toggle"
        aria-expanded={menuOpen}
        aria-controls="pa-pages"
        aria-label="Menu"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
          <path d="M3 5h14M3 10h14M3 15h14" />
        </svg>
      </button>
      <nav className="pa-nav" id="pa-pages" aria-label="Pages">
        <NavLink to="/play" className={tab}>
          Lobby
        </NavLink>
        {/* Spec 0018 — the trophies' own page. */}
        <NavLink to="/hall" className={tab}>
          Hall of Champions
        </NavLink>
        <NavLink to="/decks" className={tab}>
          Deck Depot
        </NavLink>
        <NavLink to="/account" className={tab}>
          Account
        </NavLink>
        {admin && (
          <NavLink to="/admin" className={tab}>
            Admin
          </NavLink>
        )}
      </nav>
      <ConnectionState />
      {/* Spec 0039 — a problem or an idea, from any page. */}
      <ReportButton place="header" />
      <button
        type="button"
        className="pa-button pa-button-quiet pa-sign-out"
        onClick={() => {
          void signOut().then(() => navigate("/login", { replace: true }));
        }}
      >
        Sign out
      </button>
    </header>
  );
}

/** Every signed-in page, inside the header and the live connection. */
export function Shell() {
  return (
    <LobbyConnectionProvider>
      <PageNoticesProvider>
        <div className="pa-app">
          <Header />
          <PageStack />
          <Outlet />
        </div>
      </PageNoticesProvider>
    </LobbyConnectionProvider>
  );
}
