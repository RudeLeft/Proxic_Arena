// The Belt and records tab — spec 0048 (owner 2026-11-01).
//
// The Champion's Belt as it stands, and Reset the Belt (from then nobody
// holds it; the next game's winner takes it). Then the purge: one player's
// games, games before a date, or a fresh start for production. Each says
// exactly what it will delete before anything happens, and works only once
// the admin has typed the word (RESET for the Belt, PURGE for a purge).

import { useEffect, useId, useState, type FormEvent } from "react";
import {
  fetchAdminBelt,
  previewPurge,
  purge,
  purgeText,
  resetBelt,
  type AdminAccount,
  type AdminBelt,
  type PurgeCounts,
  type PurgeScope,
} from "./admin";
import { defendText, heldFor } from "./hall";

type Kind = PurgeScope["scope"];

const KINDS: { kind: Kind; label: string }[] = [
  { kind: "player", label: "One player's games" },
  { kind: "before", label: "Games before a date" },
  { kind: "everything", label: "Fresh start" },
];

type Notice = { ok: boolean; text: string } | null;

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <div
      className={`pa-notice ${notice.ok ? "pa-notice-ok" : "pa-notice-bad"}`}
      role={notice.ok ? "status" : "alert"}
    >
      <span aria-hidden="true" className="pa-notice-mark" />
      <span className="pa-notice-text">{notice.text}</span>
    </div>
  );
}

export function BeltRecordsPanel({
  accounts,
  onChanged,
}: {
  accounts: AdminAccount[];
  /** After a reset or purge: the page's other lists are out of date. */
  onChanged: () => void;
}) {
  const id = useId();
  return (
    <section className="pa-admin-panel pa-admin-records" aria-labelledby={`${id}-heading`}>
      <div className="pa-admin-panel-head">
        <h2 id={`${id}-heading`}>Belt and records</h2>
        <span className="pa-admin-panel-note">
          Every reset and purge is kept in the admin record. Accounts are never deleted here.
        </span>
      </div>
      <div className="pa-admin-records-body">
        <BeltBox onChanged={onChanged} />
        <PurgeBox accounts={accounts} onChanged={onChanged} />
      </div>
    </section>
  );
}

function BeltBox({ onChanged }: { onChanged: () => void }) {
  const id = useId();
  const [belt, setBelt] = useState<AdminBelt | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const now = Date.now();

  useEffect(() => {
    void fetchAdminBelt().then(setBelt);
  }, []);

  const reset = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const outcome = await resetBelt(typed);
    setBusy(false);
    if (outcome.ok) {
      setBelt(outcome.value);
      setTyped("");
      setNotice({ ok: true, text: "The Belt is reset: the next game's winner takes it." });
      onChanged();
    } else {
      setNotice({ ok: false, text: outcome.message });
    }
  };

  return (
    <div className="pa-admin-records-box" aria-labelledby={`${id}-belt`} role="group">
      <h3 id={`${id}-belt`}>The Champion&apos;s Belt</h3>
      {!belt ? (
        <p className="pa-group-empty">Loading the Belt…</p>
      ) : belt.holder ? (
        <p className="pa-admin-records-line" data-testid="admin-belt">
          <b>{belt.holder}</b> holds it · {heldFor(belt.since, now)}
          {belt.defences > 0 &&
            ` · defended ${belt.defences} ${belt.defences === 1 ? "time" : "times"}`}
          {belt.defendBy && ` · ${defendText(belt.defendBy, now)}`}
        </p>
      ) : (
        <p className="pa-admin-records-line" data-testid="admin-belt">
          Nobody holds it: the next game&apos;s winner takes it.
        </p>
      )}
      <NoticeLine notice={notice} />
      <form className="pa-admin-records-confirm" onSubmit={(event) => void reset(event)}>
        <label className="pa-label" htmlFor={`${id}-reset`}>
          Type RESET to reset the Belt
        </label>
        <div className="pa-admin-email-inline">
          <input
            id={`${id}-reset`}
            className="pa-input"
            autoComplete="off"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
          <button
            type="submit"
            className="pa-button pa-button-warn"
            disabled={busy || typed !== "RESET" || !belt?.holder}
          >
            {busy ? "Resetting…" : "Reset the Belt"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Today, yyyy-mm-dd, in this browser's time. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function PurgeBox({ accounts, onChanged }: { accounts: AdminAccount[]; onChanged: () => void }) {
  const id = useId();
  const [kind, setKind] = useState<Kind>("player");
  const [userId, setUserId] = useState("");
  const [before, setBefore] = useState(today);
  // The counts, with the choice they were read for: never shown under another.
  const [read, setRead] = useState<{ key: string; round: number; counts: PurgeCounts } | null>(
    null,
  );
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  // Bumped after a purge, so the counts are read again.
  const [round, setRound] = useState(0);

  const scope: PurgeScope | null =
    kind === "player"
      ? userId
        ? { scope: "player", userId }
        : null
      : kind === "before"
        ? before
          ? { scope: "before", before }
          : null
        : { scope: "everything" };
  const key = JSON.stringify(scope);
  const who = accounts.find((a) => a.userId === userId)?.username ?? "They";
  const counts = read && read.key === key && read.round === round ? read.counts : null;

  // What it would delete, read again whenever the choice changes.
  useEffect(() => {
    if (!scope) return;
    let current = true;
    void previewPurge(scope).then((outcome) => {
      if (!current) return;
      if (outcome.ok) setRead({ key, round, counts: outcome.value });
      else setNotice({ ok: false, text: outcome.message });
    });
    return () => {
      current = false;
    };
    // The scope is fully described by its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, round]);

  const run = async (event: FormEvent) => {
    event.preventDefault();
    if (!scope) return;
    setBusy(true);
    const outcome = await purge(scope, typed);
    setBusy(false);
    if (outcome.ok) {
      setNotice({
        ok: true,
        text: `Done. ${purgeText(scope, outcome.value, who).replace(/^Delete/, "Deleted")}`,
      });
      setTyped("");
      setRound((n) => n + 1);
      onChanged();
    } else {
      setNotice({ ok: false, text: outcome.message });
    }
  };

  const nothing =
    !counts ||
    (kind === "everything"
      ? counts.games + counts.decks + counts.rooms + counts.reports + counts.signIns === 0
      : counts.games === 0);
  const refused = counts?.refused ?? null;

  return (
    <div className="pa-admin-records-box" aria-labelledby={`${id}-purge`} role="group">
      <h3 id={`${id}-purge`}>Delete records</h3>
      <div className="pa-admin-invite-role" role="radiogroup" aria-labelledby={`${id}-purge`}>
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="radio"
            aria-checked={kind === k.kind}
            className="pa-admin-invite-role-option"
            onClick={() => {
              setKind(k.kind);
              setTyped("");
              setNotice(null);
            }}
          >
            {k.label}
          </button>
        ))}
      </div>

      {kind === "player" && (
        <div className="pa-admin-email-row">
          <label className="pa-label" htmlFor={`${id}-player`}>
            Player
          </label>
          <span className="pa-select-wrap">
            <select
              id={`${id}-player`}
              className="pa-select"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
            >
              <option value="">Choose a player</option>
              {accounts.map((a) => (
                <option key={a.userId} value={a.userId}>
                  {a.displayName === a.username ? a.username : `${a.displayName} (${a.username})`}
                </option>
              ))}
            </select>
            <svg aria-hidden="true" width="11" height="7" viewBox="0 0 11 7">
              <path d="M1 1 L5.5 5.5 L10 1" />
            </svg>
          </span>
        </div>
      )}
      {kind === "before" && (
        <div className="pa-admin-email-row">
          <label className="pa-label" htmlFor={`${id}-before`}>
            Games that ended before
          </label>
          <input
            id={`${id}-before`}
            className="pa-input pa-admin-records-date"
            type="date"
            value={before}
            onChange={(event) => setBefore(event.target.value)}
          />
        </div>
      )}

      {scope && (
        <p className="pa-admin-records-what" data-testid="purge-preview" aria-live="polite">
          {counts ? purgeText(scope, counts, who) : "Counting…"}
        </p>
      )}
      {kind === "everything" && (
        <p className="pa-admin-email-hint">
          For going live: accounts, passwords, avatars, linked computers, invitations and the mail
          settings stay. Open rooms are closed first and their players told.
        </p>
      )}
      {refused && <NoticeLine notice={{ ok: false, text: refused }} />}
      <NoticeLine notice={notice} />

      <form className="pa-admin-records-confirm" onSubmit={(event) => void run(event)}>
        <label className="pa-label" htmlFor={`${id}-confirm`}>
          Type PURGE to delete
        </label>
        <div className="pa-admin-email-inline">
          <input
            id={`${id}-confirm`}
            className="pa-input"
            autoComplete="off"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
          <button
            type="submit"
            className="pa-button pa-button-warn"
            disabled={busy || typed !== "PURGE" || nothing || !!refused}
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </form>
    </div>
  );
}
