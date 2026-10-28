// The Admin page — PHASE_07 §7.67, Amendment 9, over the Admin API;
// spec 0010 (owner 2026-10-24): one centred column, a health pill, five
// tiles, and one list at a time in tabs.
//
// Showing this page only to administrators is the courtesy; the server
// refusing every admin route to anybody else is the protection (§7.62,
// §3.19). A player who types /admin gets a page that says so, and an
// API that answers 403 whatever they try.
//
// Owner decision 15 is visible here on purpose: no password is asked
// for again before these actions. A browser left signed in as an
// administrator can change accounts; that was decided, not missed.

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "./AuthContext";
import {
  fetchAccounts,
  fetchAdminMatches,
  fetchAdminRooms,
  fetchServerState,
  fetchSignIns,
  forceClose,
  idleText,
  outcomeText,
  overview,
  recordUrl,
  sendPasswordReset,
  setAccountEmail,
  setRole,
  setStatus,
  signInsByPerson,
  signOutEverywhere,
  sizeText,
  uptimeText,
  versionParts,
  workerText,
  type AdminAccount,
  type AdminMatches,
  type AdminOutcome,
  type AdminRoom,
  type ServerState,
  type SignInEvent,
} from "./admin";
import { EmailPanel } from "./AdminEmail";
import { Invitations } from "./AdminInvites";
import { ICON, presenceOf, roomStatus, statusOf } from "./lobbyView";
import { Avatar } from "./avatars";
import { useLobbyConnection } from "./shell/LobbyConnection";

/** How often the rooms, server and sign-ins re-read themselves. */
const REFRESH_MS = 30_000;

type Message = { ok: boolean; text: string } | null;

const TABS = [
  { id: "accounts", label: "Accounts" },
  { id: "rooms", label: "Rooms" },
  { id: "games", label: "Games" },
  { id: "sign-ins", label: "Sign-ins" },
  // Spec 0014 amendment 1 — the account invitations are emailed from.
  { id: "email", label: "Email account" },
  { id: "server", label: "Server" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function AdminPage() {
  const { state } = useAuth();
  const me = state.status === "authenticated" ? state.user : null;
  const { lobby } = useLobbyConnection();
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [server, setServer] = useState<ServerState | null>(null);
  const [signIns, setSignIns] = useState<SignInEvent[]>([]);
  const [matches, setMatches] = useState<AdminMatches | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [now, setNow] = useState(() => Date.now());
  // The open tab lives in the address, so a reload or a link lands there.
  const [params, setParams] = useSearchParams();
  const asked = params.get("tab");
  const tab: TabId = TABS.some((t) => t.id === asked) ? (asked as TabId) : "accounts";
  const tabsId = useId();

  const refresh = useCallback(async () => {
    const [a, r, s, e, m] = await Promise.all([
      fetchAccounts(),
      fetchAdminRooms(),
      fetchServerState(),
      fetchSignIns(),
      fetchAdminMatches(),
    ]);
    setAccounts(a);
    setRooms(r ?? []);
    setServer(s);
    setSignIns(e ?? []);
    setMatches(m);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  /** Run one admin action, say how it went, and re-read everything. */
  const run = useCallback(
    async (what: () => Promise<AdminOutcome>, done: (detail: string) => string) => {
      const outcome = await what();
      setMessage(
        outcome.ok
          ? { ok: true, text: done(outcome.detail) }
          : { ok: false, text: outcome.message },
      );
      await refresh();
      return outcome.ok;
    },
    [refresh],
  );

  if (!me) return null;
  if (me.role !== "ADMIN") {
    return (
      <main className="pa-main pa-admin">
        <h1 className="pa-title">Admin</h1>
        <div className="pa-notice pa-notice-warn" role="status">
          <span aria-hidden="true" className="pa-notice-mark" />
          <span className="pa-notice-text">This page is for administrators.</span>
        </div>
      </main>
    );
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const numbers = overview({
    online: lobby.presence.length,
    away: lobby.presence.filter((p) => p.awaySince).length,
    accounts: accounts ?? [],
    rooms,
    matches: matches?.matches ?? [],
    signIns,
    today: today.getTime(),
  });
  const tiles = [
    {
      key: "Online now",
      value: numbers.online,
      sub: numbers.away ? `${numbers.away} away` : "nobody away",
      tone: "ok",
    },
    { key: "Accounts", value: numbers.active, sub: `${numbers.disabled} disabled`, tone: "plain" },
    {
      key: "Rooms in use",
      value: numbers.rooms,
      sub: numbers.playing === 1 ? "1 game running" : `${numbers.playing} games running`,
      tone: "brass",
    },
    {
      key: "Games today",
      value: numbers.gamesToday,
      sub: numbers.didNotStart ? `${numbers.didNotStart} didn't start` : "all started",
      tone: numbers.didNotStart ? "warn" : "plain",
    },
    {
      key: "Sign-ins today",
      value: numbers.signedIn,
      sub: numbers.failed ? `${numbers.failed} failed` : "none failed",
      tone: numbers.failed ? "bad" : "plain",
    },
  ];
  const counts: Record<TabId, string> = {
    accounts: String(numbers.active),
    rooms: String(numbers.rooms),
    games: String(matches?.matches.length ?? 0),
    "sign-ins": String(signInsByPerson(signIns).length),
    email: "",
    server: "",
  };
  const choose = (next: TabId) =>
    setParams(next === "accounts" ? {} : { tab: next }, { replace: true });

  return (
    <main className="pa-main pa-admin">
      <div className="pa-admin-wrap">
        {/* No title on screen (owner 2026-10-25): the menu already says
            Admin. The health pill is on the Server tab (spec 0020). */}
        <h1 className="pa-visually-hidden">Admin</h1>

        {message && (
          <div
            className={`pa-notice ${message.ok ? "pa-notice-ok" : "pa-notice-bad"} pa-admin-message`}
            role={message.ok ? "status" : "alert"}
          >
            <span aria-hidden="true" className="pa-notice-mark" />
            <span className="pa-notice-text">{message.text}</span>
            <button type="button" className="pa-small-button" onClick={() => setMessage(null)}>
              Dismiss
            </button>
          </div>
        )}

        <dl className="pa-admin-tiles">
          {tiles.map((tile) => (
            <div key={tile.key} className={`pa-admin-tile pa-admin-tile-${tile.tone}`}>
              <dt>{tile.key}</dt>
              <dd>
                <span className="pa-admin-tile-value">{tile.value}</span>
                <span className="pa-admin-tile-sub">{tile.sub}</span>
              </dd>
            </div>
          ))}
        </dl>

        <div className="pa-admin-tabs" role="tablist" aria-label="Admin">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`${tabsId}-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`${tabsId}-panel`}
              className="pa-admin-tab"
              onClick={() => choose(t.id)}
            >
              {t.label}
              {counts[t.id] && <span className="pa-admin-tab-count">{counts[t.id]}</span>}
              {/* A problem shows from every tab (spec 0020). */}
              {t.id === "server" && server && !serverHealthy(server) && (
                <span className="pa-admin-tab-alert" role="img" aria-label="Server problem" />
              )}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`}>
          {tab === "accounts" && (
            <AccountsPanel accounts={accounts} me={me.userId} now={now} run={run} />
          )}
          {tab === "rooms" && <RoomsPanel rooms={rooms} now={now} run={run} />}
          {tab === "games" && <RecordsPanel matches={matches} />}
          {tab === "sign-ins" && <SignInsPanel events={signIns} />}
          {tab === "email" && <EmailPanel />}
          {tab === "server" && <ServerPanel server={server} keepDays={matches?.keepDays ?? null} />}
        </div>
      </div>
    </main>
  );
}

type Run = (
  what: () => Promise<AdminOutcome>,
  done: (detail: string) => string,
) => Promise<boolean>;

function serverHealthy(server: ServerState): boolean {
  return server.database.startsWith("PostgreSQL") && server.forgeWorker === "ok";
}

/** ● Healthy · v1.2.0 · 512116e — the long build id only in the tooltip. */
function HealthPill({ server }: { server: ServerState | null }) {
  if (!server) return <span className="pa-admin-health">Reading the server…</span>;
  const version = versionParts(server.version);
  const healthy = serverHealthy(server);
  const words = healthy
    ? "Healthy"
    : !server.database.startsWith("PostgreSQL")
      ? "Database problem"
      : `Rules engine: ${workerText(server)}`;
  return (
    <span
      className={`pa-admin-health ${healthy ? "pa-admin-health-ok" : "pa-admin-health-bad"}`}
      title={`Version ${version.full}`}
    >
      <span aria-hidden="true" className="pa-admin-health-dot" />
      {words} · v{version.number}
      {version.build && <span className="pa-admin-health-build"> · {version.build}</span>}
    </span>
  );
}

// --- accounts ---------------------------------------------------------------------

function sessionsText(count: number): string {
  return count === 1 ? "1 session" : `${count} sessions`;
}

function AccountsPanel({
  accounts,
  me,
  now,
  run,
}: {
  accounts: AdminAccount[] | null;
  me: string;
  now: number;
  run: Run;
}) {
  const [creating, setCreating] = useState(false);
  const [disabledOpen, setDisabledOpen] = useState(false);
  const active = (accounts ?? []).filter((a) => a.status === "ACTIVE");
  const disabled = (accounts ?? []).filter((a) => a.status !== "ACTIVE");
  return (
    <>
      <section className="pa-admin-panel" aria-labelledby="accounts-heading">
        <div className="pa-admin-panel-head">
          <h2 id="accounts-heading">Accounts</h2>
          <span className="pa-admin-panel-note">
            {active.length} active · {disabled.length} disabled
          </span>
          <span className="pa-spacer" />
          {/* Spec 0014 — accounts by invitation: the person chooses their own
            username and password. */}
          <button
            type="button"
            className="pa-button pa-button-brass"
            onClick={() => setCreating(true)}
          >
            + Invite
          </button>
        </div>
        <div className="pa-admin-table-head" aria-hidden="true">
          <span>Player</span>
          <span>Role</span>
          <span>Status</span>
          <span>Last seen</span>
          <span>Sessions</span>
          <span>Actions</span>
        </div>
        <ul className="pa-admin-account-list">
          {accounts === null && <li className="pa-group-empty">Loading accounts…</li>}
          {active.map((account) => (
            <AccountRow key={account.userId} account={account} me={me} now={now} run={run} />
          ))}
        </ul>
        {disabled.length > 0 && (
          <>
            <button
              type="button"
              className="pa-offline-toggle pa-admin-fold"
              aria-expanded={disabledOpen}
              onClick={() => setDisabledOpen((open) => !open)}
            >
              <span>Disabled · {disabled.length}</span>
              <span aria-hidden="true">{disabledOpen ? "▾" : "▸"}</span>
            </button>
            {disabledOpen && (
              <ul className="pa-admin-account-list">
                {disabled.map((account) => (
                  <AccountRow key={account.userId} account={account} me={me} now={now} run={run} />
                ))}
              </ul>
            )}
          </>
        )}
      </section>
      {/* Spec 0014 — its own panel under the accounts. */}
      <section className="pa-admin-panel">
        <Invitations now={now} open={creating} onClosed={() => setCreating(false)} />
      </section>
    </>
  );
}

function AccountRow({
  account,
  me,
  now,
  run,
}: {
  account: AdminAccount;
  me: string;
  now: number;
  run: Run;
}) {
  const { lobby } = useLobbyConnection();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const emailId = useId();
  const email = account.email ?? null;
  const menuRef = useRef<HTMLDivElement | null>(null);
  const name = account.displayName;
  const on = account.status === "ACTIVE";
  const admin = account.role === "ADMIN";
  const presence = statusOf(lobby, account.userId, now);
  const since = account.lastSignInAt ? idleText(account.lastSignInAt, now) : null;
  const lastSeen =
    presence.kind === "online"
      ? "Here now"
      : presence.kind === "away"
        ? presence.label
        : since === null
          ? "Never signed in"
          : since === "now"
            ? "Signed in just now"
            : `Signed in ${since} ago`;
  const avatar = lobby.players.find((p) => p.userId === account.userId)?.avatar ?? null;

  useEffect(() => {
    if (!menuOpen) return;
    const away = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [menuOpen]);

  const act = (what: () => Promise<AdminOutcome>, done: (detail: string) => string) => {
    setMenuOpen(false);
    void run(what, done);
  };

  const submitEmail = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await run(
      () => setAccountEmail(account.userId, emailDraft),
      () => `${name}'s email address is saved.`,
    );
    if (ok) setEditingEmail(false);
  };

  return (
    <li className="pa-admin-account">
      <div className="pa-admin-account-line">
        <span className="pa-admin-account-who">
          <Avatar avatar={avatar} size={ICON} {...presenceOf(lobby, account.userId, name, now)} />
          <span className="pa-admin-account-text">
            <span className={`pa-admin-account-name${on ? "" : " pa-player-offline"}`}>
              {name}
              {account.username !== name && (
                <span className="pa-admin-username"> @{account.username}</span>
              )}
              {account.userId === me && <span className="pa-admin-username"> (you)</span>}
            </span>
            {/* Spec 0026: where a password reset goes. */}
            <span
              className={`pa-admin-account-email${email ? "" : " pa-admin-account-email-none"}`}
            >
              {email ?? "No email"}
            </span>
          </span>
        </span>
        {/* A table cell each on a wide screen; one wrapped line on a phone. */}
        <span className="pa-admin-account-facts">
          <span>
            <span className={`pa-chip-tag ${admin ? "pa-chip-admin" : "pa-chip-player"}`}>
              {admin ? "Admin" : "Player"}
            </span>
          </span>
          <span className={on ? "pa-admin-status-on" : "pa-admin-status-off"}>
            {on ? "Active" : "Disabled"}
          </span>
          <span className="pa-admin-account-meta">{lastSeen}</span>
          <span className="pa-admin-account-meta">{sessionsText(account.sessions)}</span>
        </span>
        <div className="pa-admin-manage" ref={menuRef}>
          <button
            type="button"
            className="pa-small-button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Manage ${name}`}
            onClick={() => setMenuOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setMenuOpen(false);
            }}
          >
            Manage ▾
          </button>
          {menuOpen && (
            <div className="pa-admin-menu" role="menu" aria-label={`Manage ${name}`}>
              {/* Spec 0026: Arena emails the player a link and they choose
                  their own password; nobody here sees it. The server says
                  why when it can't send (no address, no email account). */}
              <button
                type="button"
                role="menuitem"
                aria-label={`Send ${name} a password reset`}
                onClick={() =>
                  act(
                    () => sendPasswordReset(account.userId),
                    (detail) => `${detail} ${name} chooses their own password from the link.`,
                  )
                }
              >
                Send password reset
              </button>
              <button
                type="button"
                role="menuitem"
                aria-label={
                  email ? `Change ${name}'s email address` : `Add an email address for ${name}`
                }
                onClick={() => {
                  setMenuOpen(false);
                  setEmailDraft(email ?? "");
                  setEditingEmail(true);
                }}
              >
                {email ? "Change email address…" : "Add email address…"}
              </button>
              <button
                type="button"
                role="menuitem"
                aria-label={`Revoke every session for ${name}`}
                disabled={account.sessions === 0}
                onClick={() =>
                  act(
                    () => signOutEverywhere(account.userId),
                    () => `${name} is signed out everywhere.`,
                  )
                }
              >
                Sign out everywhere
              </button>
              {/* §7.67, owner decision 16: the last active administrator
                  is not offered Make player or Disable; the server refuses
                  either way. */}
              {admin && account.lastAdmin ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled
                  aria-label="Cannot remove the last administrator"
                >
                  Last Administrator: Cannot Remove
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    aria-label={admin ? `Make ${name} a player` : `Make ${name} an administrator`}
                    onClick={() =>
                      act(
                        () => setRole(account.userId, admin ? "PLAYER" : "ADMIN"),
                        () =>
                          admin ? `${name} is now a player.` : `${name} is now an administrator.`,
                      )
                    }
                  >
                    {admin ? "Make player" : "Make admin"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={on ? "pa-admin-menu-warn" : undefined}
                    aria-label={on ? `Disable ${name}` : `Enable ${name}`}
                    onClick={() =>
                      act(
                        () => setStatus(account.userId, on ? "DISABLED" : "ACTIVE"),
                        () =>
                          on
                            ? `${name} is disabled and signed out everywhere.`
                            : `${name} can sign in again.`,
                      )
                    }
                  >
                    {on ? "Disable" : "Enable"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {editingEmail && (
        <form
          className="pa-form pa-form-inline pa-admin-password"
          onSubmit={(e) => void submitEmail(e)}
        >
          <label className="pa-visually-hidden" htmlFor={emailId}>
            Email address for {name}
          </label>
          <input
            id={emailId}
            className="pa-input"
            type="email"
            autoComplete="off"
            placeholder={`Email address for ${name}`}
            value={emailDraft}
            onChange={(event) => setEmailDraft(event.target.value)}
            required
          />
          <button type="submit" className="pa-button">
            Save
          </button>
          <button
            type="button"
            className="pa-button pa-button-quiet"
            onClick={() => setEditingEmail(false)}
          >
            Cancel
          </button>
          <p className="pa-help">
            Password resets for {name} go here.{email ? " The old address is told it changed." : ""}
          </p>
        </form>
      )}
    </li>
  );
}

// --- server -----------------------------------------------------------------------

function ServerPanel({
  server,
  keepDays,
}: {
  server: ServerState | null;
  keepDays: number | null;
}) {
  const version = server ? versionParts(server.version) : null;
  const rows: { key: string; value: string; good: boolean }[] =
    server && version
      ? [
          { key: "Version", value: version.full, good: true },
          {
            key: "Database",
            value: server.database,
            good: server.database.startsWith("PostgreSQL"),
          },
          { key: "Rules engine", value: workerText(server), good: server.forgeWorker === "ok" },
          { key: "Uptime", value: uptimeText(server.uptimeSeconds), good: true },
          ...(keepDays !== null
            ? [{ key: "Game records kept", value: `${keepDays} days`, good: true }]
            : []),
        ]
      : [];
  return (
    <section className="pa-admin-panel" aria-labelledby="server-heading">
      <div className="pa-admin-panel-head">
        <h2 id="server-heading">Server</h2>
        <HealthPill server={server} />
      </div>
      {!server && <p className="pa-group-empty">Reading the server's state…</p>}
      <dl className="pa-admin-server">
        {rows.map((row) => (
          <div key={row.key} className="pa-admin-server-row">
            {/* Not colour alone: the value says it in words. */}
            <span
              aria-hidden="true"
              className={`pa-dot ${row.good ? "pa-dot-ready" : "pa-dot-open"}`}
            />
            <dt>{row.key}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// --- rooms ------------------------------------------------------------------------

function RoomsPanel({ rooms, now, run }: { rooms: AdminRoom[]; now: number; run: Run }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  return (
    <section className="pa-admin-panel" aria-labelledby="admin-rooms-heading">
      <div className="pa-admin-panel-head">
        <h2 id="admin-rooms-heading">Rooms</h2>
        <span className="pa-admin-panel-note">{rooms.length} in use</span>
      </div>
      {rooms.length === 0 && <p className="pa-group-empty">No rooms are open.</p>}
      <ul className="pa-admin-rooms">
        {rooms.length > 0 && (
          // Spec 0019 (12) — named columns, as Accounts has.
          <li className="pa-admin-list-head pa-admin-room" aria-hidden="true">
            <span>Room</span>
            <span>Players</span>
            <span>Status</span>
            <span>Idle</span>
            <span>Actions</span>
          </li>
        )}
        {rooms.map(({ room, lastActivityAt }) => {
          const playing = room.status === "IN_MATCH";
          return (
            <li key={room.roomId} className="pa-admin-room">
              <span className="pa-admin-room-name">{room.name}</span>
              <span className="pa-admin-room-who">
                {room.seats.map((seat) => seat.displayName).join(" vs ") || "Nobody seated"}
              </span>
              <span className="pa-room-state">{roomStatus(room)}</span>
              <span className="pa-admin-account-meta">{idleText(lastActivityAt, now)}</span>
              {confirming === room.roomId ? (
                <span className="pa-admin-confirm" role="alert">
                  <span>
                    Close {room.name}?{playing ? " The match ends with no winner." : ""}
                  </span>
                  <button
                    type="button"
                    className="pa-small-button pa-small-button-warn"
                    onClick={() => {
                      setConfirming(null);
                      void run(
                        () => forceClose(room.roomId),
                        (detail) =>
                          `${room.name}: ${detail}. Both players were told an administrator closed it.`,
                      );
                    }}
                  >
                    Close it
                  </button>
                  <button
                    type="button"
                    className="pa-small-button"
                    onClick={() => setConfirming(null)}
                  >
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="pa-small-button pa-small-button-warn"
                  aria-label={`Force close ${room.name}`}
                  onClick={() => setConfirming(room.roomId)}
                >
                  Force close
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// --- games ------------------------------------------------------------------------

/** The newest matches shown before "Show all". */
const RECORD_LINES = 10;

/**
 * PHASE_07 §7.56 — each recent match's game record, to download. It holds
 * both players' hidden cards, which is why only this page offers it.
 */
function RecordsPanel({ matches }: { matches: AdminMatches | null }) {
  const [all, setAll] = useState(false);
  const every = matches?.matches ?? [];
  const list = all ? every : every.slice(0, RECORD_LINES);
  return (
    <section className="pa-admin-panel" aria-labelledby="records-heading">
      <div className="pa-admin-panel-head">
        <h2 id="records-heading">Game records</h2>
        {matches && <span className="pa-admin-panel-note">Kept {matches.keepDays} days</span>}
      </div>
      {list.length === 0 && <p className="pa-group-empty">No matches yet.</p>}
      <ul className="pa-admin-records">
        {list.length > 0 && (
          // Spec 0019 (12) — named columns, as Accounts has.
          <li className="pa-admin-list-head pa-admin-record" aria-hidden="true">
            <span>Started</span>
            <span>Players</span>
            <span>Result</span>
            <span>Record</span>
          </li>
        )}
        {list.map((m) => {
          const outcome = outcomeText(m);
          return (
            <li key={m.matchId} className="pa-admin-record">
              <span className="pa-admin-account-meta">
                {new Date(m.createdAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </span>
              <span className="pa-admin-record-who">{m.players || "—"}</span>
              <span
                className={`pa-admin-outcome pa-admin-outcome-${outcome.tone}`}
                title={outcome.code ?? undefined}
              >
                {outcome.text}
              </span>
              {m.recordBytes !== null ? (
                <a className="pa-small-button" href={recordUrl(m.matchId)} download>
                  Download record · {sizeText(m.recordBytes)}
                </a>
              ) : (
                <span className="pa-admin-account-meta">No record kept</span>
              )}
            </li>
          );
        })}
      </ul>
      {!all && every.length > RECORD_LINES && (
        <p className="pa-admin-more">
          <button type="button" className="pa-small-button" onClick={() => setAll(true)}>
            Show all {every.length}
          </button>
        </p>
      )}
    </section>
  );
}

// --- sign-ins ---------------------------------------------------------------------

const KIND_WORDS: Record<SignInEvent["kind"], string> = {
  SIGNED_IN: "Signed in",
  FAILED: "Failed",
  THROTTLED: "Throttled",
};

const clock = (at: string) =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

/** Grouped by the name tried (spec 0010); a click shows that name's attempts. */
function SignInsPanel({ events }: { events: SignInEvent[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const people = signInsByPerson(events);
  return (
    <section className="pa-admin-panel" aria-labelledby="signins-heading">
      <div className="pa-admin-panel-head">
        <h2 id="signins-heading">Sign-in activity</h2>
        <span className="pa-admin-panel-note">Last 24 hours</span>
      </div>
      {people.length === 0 && <p className="pa-group-empty">Nobody has tried to sign in today.</p>}
      <ul className="pa-admin-signins">
        {people.length > 0 && (
          // Spec 0019 (12) — named columns, as Accounts has.
          <li className="pa-admin-list-head pa-admin-signin-line" aria-hidden="true">
            <span>Result</span>
            <span>Player</span>
            <span>Details</span>
            <span>Last attempt</span>
            <span>Address</span>
          </li>
        )}
        {people.map((person) => {
          // Red only for a name that never got in; a typo now and then on a
          // real account is said in the line, in red, not as its label.
          const trouble = person.signedIn === 0;
          const parts = [
            person.signedIn
              ? `${person.signedIn} sign-in${person.signedIn === 1 ? "" : "s"}`
              : null,
            !person.known ? "No such account" : null,
          ].filter(Boolean);
          const bad = [
            person.failed ? `${person.failed} failed` : null,
            person.throttled ? `${person.throttled} throttled` : null,
          ].filter(Boolean);
          const expanded = open === person.username;
          return (
            <li
              key={person.username}
              className={`pa-admin-signin${trouble ? " pa-admin-signin-trouble" : ""}`}
            >
              <button
                type="button"
                className="pa-admin-signin-line"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : person.username)}
              >
                <span className={`pa-chip-tag ${trouble ? "pa-kind-failed" : "pa-kind-signed_in"}`}>
                  {trouble
                    ? KIND_WORDS[person.failed ? "FAILED" : "THROTTLED"]
                    : KIND_WORDS.SIGNED_IN}
                </span>
                <span className="pa-admin-signin-who">{person.username}</span>
                <span className="pa-admin-signin-detail">
                  {parts.join(" · ")}
                  {parts.length > 0 && bad.length > 0 && " · "}
                  {bad.length > 0 && <span className="pa-admin-signin-bad">{bad.join(" · ")}</span>}
                </span>
                <span className="pa-admin-account-meta">{clock(person.last)}</span>
                <span className="pa-admin-account-meta">
                  {person.addresses.length === 1
                    ? person.addresses[0]
                    : person.addresses.length === 0
                      ? "address unknown"
                      : `${person.addresses.length} addresses`}
                </span>
              </button>
              {expanded && (
                <ul className="pa-admin-signin-attempts">
                  {person.lines.map((line) => (
                    <li key={`${line.at}-${line.kind}-${line.address ?? ""}`}>
                      <span>{clock(line.at)}</span>
                      <span>{KIND_WORDS[line.kind]}</span>
                      <span>{line.count > 1 ? `${line.count} attempts` : ""}</span>
                      <span>{line.address ?? "address unknown"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
