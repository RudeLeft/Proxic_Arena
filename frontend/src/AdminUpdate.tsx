// The Admin page's "Update waiting" — spec 0056 (owner 2026-11-06).
//
// Before pressing Update on Unraid, the owner switches this on: games being
// played finish as usual, no new one starts, and the players are told. The
// panel lists the games still running (who, which turn) and, when none is,
// says it is safe to update. No deadline and no countdown: it waits until
// the games end. Switching it off lets new games start again at once. The
// server decides who may switch it (administrators, with the CSRF token).

import { useCallback, useEffect, useState } from "react";
import {
  SAFE_TO_UPDATE,
  fetchUpdateWaiting,
  runningGameText,
  setUpdateWaiting,
  type UpdateWaitingState,
} from "./admin";

/** How often the list re-reads itself while the switch is on (games end) and while it is off. */
const WAITING_MS = 5_000;
const IDLE_MS = 30_000;

export function UpdateWaitingPanel() {
  const [state, setState] = useState<UpdateWaitingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const read = useCallback(async () => {
    const now = await fetchUpdateWaiting();
    if (now) setState(now);
  }, []);

  const on = state?.on === true;
  useEffect(() => {
    void read();
    const timer = window.setInterval(() => void read(), on ? WAITING_MS : IDLE_MS);
    return () => window.clearInterval(timer);
  }, [read, on]);

  const toggle = async () => {
    setBusy(true);
    setProblem(null);
    const result = await setUpdateWaiting(!on);
    setBusy(false);
    if (result.ok) setState(result.state);
    else setProblem(result.message);
  };

  const games = state?.games ?? [];
  return (
    <section className="pa-admin-panel" aria-labelledby="update-waiting-heading">
      <div className="pa-admin-panel-head">
        <h2 id="update-waiting-heading">Update waiting</h2>
        <span className="pa-admin-panel-note">
          {on
            ? "On: games being played finish as usual, and no new game starts."
            : "Switch on before updating: games finish first, and no new game starts."}
        </span>
        <button
          type="button"
          className={on ? "pa-button pa-button-quiet" : "pa-button pa-button-brass"}
          aria-pressed={on}
          disabled={busy || state === null}
          onClick={() => void toggle()}
        >
          {on ? "Switch off" : "Switch on"}
        </button>
      </div>
      {problem && (
        <p className="pa-notice pa-notice-bad" role="alert">
          {problem}
        </p>
      )}
      {state === null && <p className="pa-group-empty">Reading the games…</p>}
      {state !== null && games.length === 0 && (
        <p className="pa-group-empty" role="status">
          {SAFE_TO_UPDATE}
        </p>
      )}
      {games.length > 0 && (
        <>
          <p className="pa-admin-panel-note" role="status">
            {games.length === 1 ? "1 game still running" : `${games.length} games still running`}
          </p>
          <ul className="pa-admin-games-running">
            {games.map((game) => (
              <li key={game.matchId}>{runningGameText(game)}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
