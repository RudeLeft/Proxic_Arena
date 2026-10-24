// The signed-in shell — PHASE_07 §7.62 and the canvas's header.
//
// One header on every signed-in page: the logo (back to the Lobby),
// Deck Depot, Lobby, Account, Admin only for an administrator, the
// connection's state, and Sign out (this session only; "Sign out
// everywhere" is on the Account page). Showing Admin to administrators
// alone is the courtesy: the server re-reads the role from the session
// on every request (Phase 3 §3.19).

import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { isNewBuild } from "../status";
import { LobbyConnectionProvider, useLobbyConnection } from "./LobbyConnection";
import logo from "../assets/logo-header.webp";
import "./app.css";

/** How often an open page asks whether the server has been updated. */
const VERSION_CHECK_MS = 60_000;

async function buildIdNow(): Promise<string | null> {
  try {
    const response = await fetch("/api/version", { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { buildId?: unknown };
    return typeof body.buildId === "string" ? body.buildId : null;
  } catch {
    return null;
  }
}

/**
 * A page loaded before an update keeps running the old screens until it
 * is reloaded (seen 2026-10-21: the joining player had the pre-Phase-7
 * match view while the host had the new one). Say so, over everything,
 * with the way out. Reloading is safe mid-game: the match comes back.
 */
function NewVersion() {
  const loadedWith = useRef<string | null>(null);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const now = await buildIdNow();
      if (!alive) return;
      if (loadedWith.current === null) loadedWith.current = now;
      else if (isNewBuild(loadedWith.current, now)) setStale(true);
    };
    void check();
    const timer = window.setInterval(() => void check(), VERSION_CHECK_MS);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  if (!stale) return null;
  return (
    <div className="pa-new-version" role="alert">
      <span>Proxic Arena has been updated. Reload to get the new version.</span>
      <button type="button" className="pa-button" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}

function ConnectionState() {
  const { lobby } = useLobbyConnection();
  const label =
    lobby.connection === "open"
      ? "Connected"
      : lobby.connection === "connecting"
        ? "Connecting…"
        : lobby.connection === "reconnecting"
          ? "Reconnecting…"
          : "Signed out";
  return (
    <span className={`pa-connection pa-connection-${lobby.connection}`} role="status">
      <span aria-hidden="true" className="pa-connection-dot" />
      {label}
    </span>
  );
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
  return (
    <header className={`pa-header${menuOpen ? " pa-header-open" : ""}`}>
      <NavLink to="/play" className="pa-logo" aria-label="Proxic Arena — Lobby">
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
        <NavLink to="/decks" className={tab}>
          Deck Depot
        </NavLink>
        <NavLink to="/play" className={tab}>
          Lobby
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
      <span className="pa-spacer" />
      <ConnectionState />
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
      <div className="pa-app">
        <NewVersion />
        <Header />
        <Outlet />
      </div>
    </LobbyConnectionProvider>
  );
}
