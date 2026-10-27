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
import { goneTitle } from "../lobbyView";
import type { ConnectionState } from "../lobby";
import { useSettled } from "../useSettled";
import { LobbyConnectionProvider, useLobbyConnection } from "./LobbyConnection";
import logo from "../assets/logo-header.webp";
import "./base.css";
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

/** One notice in the top bar: its words, its tone, and what can be done about it. */
interface TopNotice {
  key: string;
  tone: "bad" | "warn" | "info";
  text: string;
  sub?: string;
  /** "alert" for what went wrong; "status" for the rest. */
  role: "alert" | "status";
  actions: { label: string; primary?: boolean; run: () => void }[];
}

/**
 * Spec 0016 (9) — the notices sit in the top bar, between the page
 * links and the Connected pill, on every page: dismissing one moves
 * nothing on the page. One at a time, the most pressing first. In the
 * Lobby, invitations, requests and their endings stay pop-ups; on any
 * other page they are here, answerable where they are.
 */
function TopNotices() {
  const { lobby, setLobby, send } = useLobbyConnection();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Shown only when it lasts: a refresh or a blip is not news (owner 2026-10-24).
  const reconnecting = useSettled(lobby.connection === "reconnecting", 1500);
  const inLobby = pathname === "/play";
  const clear = (patch: Partial<typeof lobby>) =>
    setLobby((previous) => ({ ...previous, ...patch }));
  const toLobby = () => void navigate("/play");

  const notices: TopNotice[] = [];
  if (lobby.connection === "ended") {
    notices.push({
      key: "ended",
      tone: "bad",
      role: "alert",
      text: "Signed out",
      sub: "This session has ended, perhaps from another tab. Reload the page to sign in again.",
      actions: [],
    });
  } else if (reconnecting) {
    // §5.133 — a page that stopped being told must say so. It
    // reconnects on its own now (owner report 2026-10-21).
    notices.push({
      key: "reconnecting",
      tone: "warn",
      role: "status",
      text: "Reconnecting…",
      sub: "The connection dropped. This page catches up by itself as soon as it is back.",
      actions: [],
    });
  }
  const invitation = lobby.invitation;
  if (!inLobby && invitation) {
    notices.push({
      key: `invited-${invitation.roomId}`,
      tone: "info",
      role: "status",
      text: `${invitation.from.displayName} has invited you to join ${invitation.roomName}`,
      actions: [
        {
          label: "Accept",
          primary: true,
          run: () => {
            send({ type: "INVITE_ACCEPT", roomId: invitation.roomId });
            toLobby();
          },
        },
        { label: "Decline", run: () => send({ type: "INVITE_DECLINE" }) },
      ],
    });
  }
  const askedBy = lobby.askedBy;
  if (!inLobby && askedBy) {
    notices.push({
      key: `asked-${askedBy.from.userId}`,
      tone: "info",
      role: "status",
      text: `${askedBy.from.displayName} would like to join your room`,
      actions: [
        {
          label: "Accept",
          primary: true,
          run: () => {
            send({ type: "JOIN_ACCEPT" });
            toLobby();
          },
        },
        { label: "Decline", run: () => send({ type: "JOIN_DECLINE" }) },
      ],
    });
  }
  if (lobby.setupProblem) {
    // §5.100 — about YOUR deck, sent only to you.
    notices.push({
      key: "setup",
      tone: "bad",
      role: "alert",
      text: "Your deck needs attention",
      sub: lobby.setupProblem.detail,
      actions: [],
    });
  }
  if (lobby.notice) {
    const notice = lobby.notice;
    notices.push({
      key: `notice-${notice.errorCode}`,
      tone: notice.kind === "error" ? "bad" : "warn",
      role: notice.kind === "error" ? "alert" : "status",
      text: notice.detail,
      actions: [{ label: "Dismiss", run: () => clear({ notice: null }) }],
    });
  }
  if (!inLobby && lobby.invitationGone) {
    notices.push({
      key: "gone",
      tone: "info",
      role: "status",
      text: goneTitle(lobby.invitationGone.reason, lobby.invitationGone.fromDisplayName),
      actions: [{ label: "OK", run: () => clear({ invitationGone: null }) }],
    });
  }
  if (!inLobby && lobby.news) {
    notices.push({
      key: "news",
      tone: "info",
      role: "status",
      text: lobby.news,
      actions: [{ label: "OK", run: () => clear({ news: null }) }],
    });
  }

  const shown = notices[0];
  return (
    <div className="pa-top-notices">
      {shown && (
        <div
          key={shown.key}
          className={`pa-top-notice pa-top-notice-${shown.tone}`}
          role={shown.role}
        >
          <span aria-hidden="true" className="pa-notice-mark" />
          <span className="pa-top-notice-text" title={shown.sub ?? shown.text}>
            <strong>{shown.text}</strong>
            {shown.sub && <span className="pa-top-notice-sub"> {shown.sub}</span>}
          </span>
          {shown.actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={
                action.primary ? "pa-small-button pa-small-button-brass" : "pa-small-button"
              }
              onClick={action.run}
            >
              {action.label}
            </button>
          ))}
          {notices.length > 1 && (
            <span className="pa-top-notice-more" aria-label={`${notices.length - 1} more`}>
              +{notices.length - 1}
            </span>
          )}
        </div>
      )}
    </div>
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
      <TopNotices />
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
