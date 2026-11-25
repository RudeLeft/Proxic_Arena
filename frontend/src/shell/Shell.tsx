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
import { preloadGame, preloadPages, startVisit } from "../early";
import { NoticeStack } from "../NoticeStack";
import type { ConnectionState } from "../lobby";
import { useSettled } from "../useSettled";
import { LobbyConnectionProvider, useLobbyConnection } from "./LobbyConnection";
import { PageNoticesProvider, isGameRoute, usePageNotices } from "./PageNotices";
import logo from "../assets/logo-header.webp";
import "./base.css";
import "./app.css";

/** How long after the page's load the header pages' code is fetched ahead. */
const PRELOAD_AFTER_MS = 1_000;
/**
 * P11-E6 -- how long after the page's load (and after sitting down) the
 * game's code is fetched ahead: later than the header pages', so a page
 * reloaded or left in its first seconds is not sharing a slow link with it
 * (measured: with one second, a slow-4G reload of the room 1-2 s after
 * arriving took 384 -> 751 ms in Chromium, 609 -> 1,451 in WebKit). Players
 * sit in a room far longer while they choose decks; once Start match is
 * pressed nothing more is fetched ahead (early.ts `gameStarting`).
 */
const GAME_AHEAD_AFTER_MS = 3_000;

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

/**
 * P11-E6 -- while the player sits in a room (on any page), the game's code
 * and the common mana pictures are fetched ahead, one file at a time, a few
 * seconds after the page's load, so "Start match" opens the game on what
 * the browser already has. Once per page (early.ts `preloadGame`).
 */
export function useGameAhead(inRoom: boolean): void {
  useEffect(() => {
    if (!inRoom) return undefined;
    let timer = 0;
    const ahead = () => {
      timer = window.setTimeout(() => void preloadGame(), GAME_AHEAD_AFTER_MS);
    };
    if (document.readyState === "complete") ahead();
    else window.addEventListener("load", ahead, { once: true });
    return () => {
      window.removeEventListener("load", ahead);
      window.clearTimeout(timer);
    };
  }, [inRoom]);
}

/**
 * P11-E6 -- its own component, so the header is not drawn again on every
 * lobby change. Not on the game's own pages: they have the code already.
 */
function GameAhead() {
  const { lobby } = useLobbyConnection();
  const { pathname } = useLocation();
  useGameAhead(lobby.room !== null && !isGameRoute(pathname));
  return null;
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
  // P11-E7/E8 — a header link starts its page's data with the click, beside
  // its code (early.ts `startVisit`); not for the page already open.
  const visit = (to: string) => () => {
    if (state.status === "authenticated" && to !== pathname) startVisit(to, "", state.user);
  };
  // P11-E7/E8 — once this page has loaded, the header pages' code is
  // fetched ahead (a second after the browser's load event), so a first
  // click on one waits only for its data, which the click starts.
  useEffect(() => {
    let timer = 0;
    const ahead = () => {
      timer = window.setTimeout(
        () => preloadPages(["/play", "/hall", "/decks", "/account", ...(admin ? ["/admin"] : [])]),
        PRELOAD_AFTER_MS,
      );
    };
    if (document.readyState === "complete") ahead();
    else window.addEventListener("load", ahead, { once: true });
    return () => {
      window.removeEventListener("load", ahead);
      window.clearTimeout(timer);
    };
  }, [admin]);
  // Spec 0039 — a page change is a line in the page's log.
  useEffect(() => logLine("page", `went to ${pathname}`), [pathname]);
  return (
    <header className={`pa-header${menuOpen ? " pa-header-open" : ""}`}>
      <NavLink
        to="/play"
        className="pa-logo"
        aria-label="Proxic Arena lobby"
        onClick={visit("/play")}
      >
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
        <NavLink to="/play" className={tab} onClick={visit("/play")}>
          Lobby
        </NavLink>
        {/* Spec 0018 — the trophies' own page. */}
        <NavLink to="/hall" className={tab} onClick={visit("/hall")}>
          Hall of Champions
        </NavLink>
        <NavLink to="/decks" className={tab} onClick={visit("/decks")}>
          Deck Depot
        </NavLink>
        <NavLink to="/account" className={tab} onClick={visit("/account")}>
          Account
        </NavLink>
        {admin && (
          <NavLink to="/admin" className={tab} onClick={visit("/admin")}>
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
          <GameAhead />
          <PageStack />
          <Outlet />
        </div>
      </PageNoticesProvider>
    </LobbyConnectionProvider>
  );
}
