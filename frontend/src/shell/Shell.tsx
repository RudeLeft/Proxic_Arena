// The signed-in shell — PHASE_07 §7.62 and the canvas's header.
//
// One header on every signed-in page: the logo (back to the Lobby),
// Deck Depot, Lobby, Account, Admin only for an administrator, the
// connection's state, and Sign out (this session only; "Sign out
// everywhere" is on the Account page). Showing Admin to administrators
// alone is the courtesy: the server re-reads the role from the session
// on every request (Phase 3 §3.19).

import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { LobbyConnectionProvider, useLobbyConnection } from "./LobbyConnection";
import logo from "../assets/logo-header.webp";
import "./app.css";

function ConnectionState() {
  const { lobby } = useLobbyConnection();
  const label =
    lobby.connection === "open"
      ? "Connected"
      : lobby.connection === "connecting"
        ? "Connecting…"
        : "Disconnected";
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
  return (
    <header className="pa-header">
      <NavLink to="/play" className="pa-logo" aria-label="Proxic Arena — Lobby">
        <img src={logo} alt="Proxic Arena" width={156} height={52} />
      </NavLink>
      <nav className="pa-nav" aria-label="Pages">
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
        className="pa-button pa-button-quiet"
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
        <Header />
        <Outlet />
      </div>
    </LobbyConnectionProvider>
  );
}
