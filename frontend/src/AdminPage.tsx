// The Admin page — PHASE_07 §7.67, Amendment 9, over the Admin API.
//
// The canvas's Admin: accounts on the left with a new-account form and
// the server's state beside them, every room underneath with Force
// close, and the last day of sign-in activity at the bottom.
//
// Showing this page only to administrators is the courtesy; the server
// refusing every admin route to anybody else is the protection (§7.62,
// §3.19). A player who types /admin gets a page that says so, and an
// API that answers 403 whatever they try.
//
// Owner decision 15 is visible here on purpose: no password is asked
// for again before these actions. A browser left signed in as an
// administrator can change accounts; that was decided, not missed.

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";
import {
  createAccount,
  fetchAccounts,
  fetchAdminRooms,
  fetchServerState,
  fetchSignIns,
  forceClose,
  groupSignIns,
  idleText,
  resetPassword,
  setRole,
  setStatus,
  signOutEverywhere,
  uptimeText,
  workerText,
  type AdminAccount,
  type AdminOutcome,
  type AdminRoom,
  type ServerState,
  type SignInEvent,
  fetchAdminMatches,
  recordUrl,
  sizeText,
  type AdminMatches,
} from "./admin";
import { roomStatus } from "./lobbyView";

/** How often the rooms, server and sign-ins re-read themselves. */
const REFRESH_MS = 30_000;

type Message = { ok: boolean; text: string } | null;

export default function AdminPage() {
  const { state } = useAuth();
  const me = state.status === "authenticated" ? state.user : null;
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [server, setServer] = useState<ServerState | null>(null);
  const [signIns, setSignIns] = useState<SignInEvent[]>([]);
  const [matches, setMatches] = useState<AdminMatches | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [now, setNow] = useState(() => Date.now());

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

  const active = (accounts ?? []).filter((a) => a.status === "ACTIVE").length;

  return (
    <main className="pa-main pa-admin">
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

      <div className="pa-admin-top">
        <section className="pa-section pa-admin-accounts" aria-labelledby="accounts-heading">
          <div className="pa-section-head">
            <h2 id="accounts-heading">Accounts</h2>
            <span className="pa-spacer" />
            <span className="pa-head-key">Active</span>
            <span className="pa-count" aria-label={`${active} active accounts`}>
              {active}
            </span>
          </div>
          <ul className="pa-admin-account-list">
            {accounts === null && <li className="pa-group-empty">Loading accounts…</li>}
            {(accounts ?? []).map((account) => (
              <AccountRow
                key={account.userId}
                account={account}
                me={me.userId}
                now={now}
                run={run}
              />
            ))}
          </ul>
        </section>

        <div className="pa-admin-side">
          <NewAccount run={run} />
          <ServerPanel server={server} />
        </div>
      </div>

      <RoomsPanel rooms={rooms} now={now} run={run} />
      <SignInsPanel events={signIns} />
      <RecordsPanel matches={matches} />
    </main>
  );
}

type Run = (
  what: () => Promise<AdminOutcome>,
  done: (detail: string) => string,
) => Promise<boolean>;

function sessionsText(count: number): string {
  return count === 1 ? "1 session" : `${count} sessions`;
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
  const [settingPassword, setSettingPassword] = useState(false);
  const [password, setPassword] = useState("");
  const passwordId = useId();
  const name = account.displayName;
  const on = account.status === "ACTIVE";
  const admin = account.role === "ADMIN";
  const since = account.lastSignInAt ? idleText(account.lastSignInAt, now) : null;
  const lastSeen =
    since === null
      ? "never signed in"
      : since === "now"
        ? "signed in just now"
        : `last signed in ${since} ago`;

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await run(
      () => resetPassword(account.userId, password),
      () =>
        `${name}'s password is changed and every session of theirs has ended. Tell them the new one.`,
    );
    if (ok) {
      setPassword("");
      setSettingPassword(false);
    }
  };

  return (
    <li className="pa-admin-account">
      <div className="pa-admin-account-line">
        <span className="pa-admin-account-text">
          <span className={`pa-admin-account-name${on ? "" : " pa-player-offline"}`}>
            {name}
            {account.username !== name && (
              <span className="pa-admin-username"> @{account.username}</span>
            )}
            {account.userId === me && <span className="pa-admin-username"> (you)</span>}
          </span>
          <span className="pa-admin-account-meta">
            {sessionsText(account.sessions)} · {lastSeen}
          </span>
        </span>
        <span className={`pa-chip-tag ${admin ? "pa-chip-admin" : "pa-chip-player"}`}>
          {admin ? "Admin" : "Player"}
        </span>
        <span className={`pa-chip-tag ${on ? "pa-chip-active" : "pa-chip-off"}`}>
          {on ? "Active" : "Disabled"}
        </span>
        <div className="pa-admin-account-buttons">
          <button
            type="button"
            className="pa-small-button"
            aria-label={`Set a new password for ${name}`}
            aria-expanded={settingPassword}
            onClick={() => setSettingPassword((open) => !open)}
          >
            Password
          </button>
          <button
            type="button"
            className="pa-small-button"
            aria-label={`Revoke every session for ${name}`}
            disabled={account.sessions === 0}
            onClick={() =>
              void run(
                () => signOutEverywhere(account.userId),
                () => `${name} is signed out everywhere.`,
              )
            }
          >
            Sign out
          </button>
          {/* §7.67, owner decision 16: the last active administrator
              is not offered Make player or Disable; the server refuses
              either way. */}
          {admin && account.lastAdmin ? (
            <button
              type="button"
              className="pa-small-button pa-admin-dead"
              disabled
              aria-label="Cannot remove the last administrator"
            >
              Last admin
            </button>
          ) : (
            <>
              <button
                type="button"
                className="pa-small-button"
                aria-label={admin ? `Make ${name} a player` : `Make ${name} an administrator`}
                onClick={() =>
                  void run(
                    () => setRole(account.userId, admin ? "PLAYER" : "ADMIN"),
                    () => (admin ? `${name} is now a player.` : `${name} is now an administrator.`),
                  )
                }
              >
                {admin ? "Make player" : "Make admin"}
              </button>
              <button
                type="button"
                className={`pa-small-button${on ? " pa-small-button-warn" : ""}`}
                aria-label={on ? `Disable ${name}` : `Enable ${name}`}
                onClick={() =>
                  void run(
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
      </div>
      {settingPassword && (
        // Amendment 9: the administrator types it, every session ends,
        // and they tell the player. No forced change at next sign-in.
        <form
          className="pa-form pa-form-inline pa-admin-password"
          onSubmit={(e) => void submitPassword(e)}
        >
          <label className="pa-visually-hidden" htmlFor={passwordId}>
            New password for {name}
          </label>
          <input
            id={passwordId}
            className="pa-input"
            type="password"
            autoComplete="new-password"
            placeholder={`New password for ${name}`}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button type="submit" className="pa-button">
            Set password
          </button>
          <button
            type="button"
            className="pa-button pa-button-quiet"
            onClick={() => {
              setPassword("");
              setSettingPassword(false);
            }}
          >
            Cancel
          </button>
          <p className="pa-help">
            Every session {name} has ends now. You tell them the new password.
          </p>
        </form>
      )}
    </li>
  );
}

function NewAccount({ run }: { run: Run }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRoleChoice] = useState<"PLAYER" | "ADMIN">("PLAYER");
  const id = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await run(
      () => createAccount({ username, displayName, password, role }),
      () => `${displayName.trim() || username.trim()} can sign in now. Tell them their password.`,
    );
    if (ok) {
      setUsername("");
      setDisplayName("");
      setPassword("");
      setRoleChoice("PLAYER");
    }
  };

  return (
    <section className="pa-section" aria-labelledby={`${id}-heading`}>
      <div className="pa-section-head">
        <h2 id={`${id}-heading`}>New account</h2>
      </div>
      <form className="pa-form" onSubmit={(event) => void submit(event)}>
        <label className="pa-label" htmlFor={`${id}-user`}>
          Username
        </label>
        <input
          id={`${id}-user`}
          className="pa-input"
          autoComplete="off"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />
        <label className="pa-label" htmlFor={`${id}-name`}>
          Display name
        </label>
        <input
          id={`${id}-name`}
          className="pa-input"
          autoComplete="off"
          maxLength={64}
          placeholder="Same as the username if left blank"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <label className="pa-label" htmlFor={`${id}-password`}>
          First password
        </label>
        <input
          id={`${id}-password`}
          className="pa-input"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <label className="pa-label" htmlFor={`${id}-role`}>
          Role
        </label>
        <span className="pa-select-wrap pa-admin-role">
          <select
            id={`${id}-role`}
            className="pa-select"
            value={role}
            onChange={(event) => setRoleChoice(event.target.value === "ADMIN" ? "ADMIN" : "PLAYER")}
          >
            <option value="PLAYER">Player</option>
            <option value="ADMIN">Administrator</option>
          </select>
          <svg aria-hidden="true" width="11" height="7" viewBox="0 0 11 7">
            <path d="M1 1 L5.5 5.5 L10 1" />
          </svg>
        </span>
        <button type="submit" className="pa-button pa-button-brass pa-button-wide">
          Create account
        </button>
      </form>
    </section>
  );
}

function ServerPanel({ server }: { server: ServerState | null }) {
  const rows: { key: string; value: string; good: boolean }[] = server
    ? [
        { key: "Version", value: server.version, good: true },
        { key: "Database", value: server.database, good: server.database.startsWith("PostgreSQL") },
        { key: "Forge worker", value: workerText(server), good: server.forgeWorker === "ok" },
        { key: "Uptime", value: uptimeText(server.uptimeSeconds), good: true },
      ]
    : [];
  return (
    <section className="pa-section" aria-labelledby="server-heading">
      <div className="pa-section-head">
        <h2 id="server-heading">Server</h2>
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

function RoomsPanel({ rooms, now, run }: { rooms: AdminRoom[]; now: number; run: Run }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  return (
    <section className="pa-section" aria-labelledby="admin-rooms-heading">
      <div className="pa-section-head">
        <h2 id="admin-rooms-heading">Rooms</h2>
        <span className="pa-spacer" />
        <span className="pa-head-key">In use</span>
        <span className="pa-count">{rooms.length}</span>
      </div>
      {rooms.length === 0 && <p className="pa-group-empty">No rooms are open.</p>}
      <ul className="pa-admin-rooms">
        {rooms.map(({ room, lastActivityAt }) => {
          const playing = room.status === "IN_MATCH";
          return (
            <li key={room.roomId} className="pa-admin-room">
              <span className="pa-admin-room-name">{room.name}</span>
              <span className="pa-room-seats">
                {Array.from({ length: room.desiredPlayerCount }, (_, i) => room.seats[i]).map(
                  (seat, i) =>
                    seat ? (
                      <span key={seat.userId} className="pa-seat pa-seat-taken">
                        <span
                          aria-hidden="true"
                          className={`pa-dot ${seat.ready || playing ? "pa-dot-ready" : "pa-dot-waiting"}`}
                        />
                        <span className="pa-seat-name">{seat.displayName}</span>
                      </span>
                    ) : (
                      <span key={`open-${i}`} className="pa-seat pa-seat-open">
                        <span aria-hidden="true" className="pa-dot pa-dot-open" />
                        <span className="pa-seat-name">Open seat</span>
                      </span>
                    ),
                )}
              </span>
              <span className="pa-room-state">{roomStatus(room)}</span>
              <span className="pa-room-clears">
                <span className="pa-room-clears-key">Idle</span>
                <span className="pa-room-clears-value">{idleText(lastActivityAt, now)}</span>
              </span>
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
                  className="pa-button pa-button-close pa-admin-close"
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

const KIND_WORDS: Record<SignInEvent["kind"], string> = {
  SIGNED_IN: "Signed in",
  FAILED: "Failed",
  THROTTLED: "Throttled",
};

/** Enough to read at a glance; the rest is one click away. */
const SIGN_IN_LINES = 30;

/**
 * PHASE_07 §7.56 — each recent match's game record, to download. It holds
 * both players' hidden cards, which is why only this page offers it.
 */
function RecordsPanel({ matches }: { matches: AdminMatches | null }) {
  const [all, setAll] = useState(false);
  const every = matches?.matches ?? [];
  const list = all ? every : every.slice(0, RECORD_LINES);
  return (
    <section className="pa-section" aria-labelledby="records-heading">
      <div className="pa-section-head">
        <h2 id="records-heading">Game records</h2>
        <span className="pa-spacer" />
        {matches && <span className="pa-admin-window">Kept {matches.keepDays} days</span>}
      </div>
      {list.length === 0 && <p className="pa-group-empty">No matches yet.</p>}
      <ul className="pa-admin-records">
        {list.map((m) => (
          <li key={m.matchId} className="pa-admin-record">
            <span className="pa-admin-signin-at">
              {new Date(m.createdAt).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </span>
            <span className="pa-admin-signin-who">{m.players || "—"}</span>
            <span className="pa-admin-signin-detail">{STATUS_WORDS[m.status] ?? m.status}</span>
            {m.recordBytes !== null ? (
              <a className="pa-small-button" href={recordUrl(m.matchId)} download>
                Download record · {sizeText(m.recordBytes)}
              </a>
            ) : (
              <span className="pa-admin-signin-address">No record kept</span>
            )}
            {m.ending && <span className="pa-admin-record-ending">{m.ending}</span>}
          </li>
        ))}
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

/** The newest matches shown before "Show all". */
const RECORD_LINES = 10;

const STATUS_WORDS: Record<string, string> = {
  LAUNCHING: "Starting",
  RUNNING: "Being played",
  ENDED: "Finished",
  FAILED_STARTUP: "Did not start",
  FAILED_RUNTIME: "Stopped by a fault",
  TERMINATED: "Abandoned",
};

function SignInsPanel({ events }: { events: SignInEvent[] }) {
  const [all, setAll] = useState(false);
  const grouped = groupSignIns(events);
  const lines = all ? grouped : grouped.slice(0, SIGN_IN_LINES);
  return (
    <section className="pa-section" aria-labelledby="signins-heading">
      <div className="pa-section-head">
        <h2 id="signins-heading">Sign-in activity</h2>
        <span className="pa-spacer" />
        <span className="pa-admin-window">Last 24 hours</span>
      </div>
      {lines.length === 0 && <p className="pa-group-empty">Nobody has tried to sign in today.</p>}
      <ul className="pa-admin-signins">
        {lines.map((line) => {
          const details = [
            line.count > 1 ? `${line.count} attempts` : null,
            line.kind !== "SIGNED_IN" && !line.known ? "No such account" : null,
          ].filter(Boolean);
          return (
            <li key={`${line.at}-${line.kind}-${line.username}`} className="pa-admin-signin">
              <span className="pa-admin-signin-at">
                {new Date(line.at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </span>
              <span className={`pa-chip-tag pa-kind-${line.kind.toLowerCase()}`}>
                {KIND_WORDS[line.kind]}
              </span>
              <span className="pa-admin-signin-who">{line.username}</span>
              <span className="pa-admin-signin-detail">{details.join(" · ")}</span>
              <span className="pa-admin-signin-address">{line.address ?? "address unknown"}</span>
            </li>
          );
        })}
      </ul>
      {!all && grouped.length > SIGN_IN_LINES && (
        <p className="pa-admin-more">
          <button type="button" className="pa-small-button" onClick={() => setAll(true)}>
            Show all {grouped.length}
          </button>
        </p>
      )}
    </section>
  );
}
