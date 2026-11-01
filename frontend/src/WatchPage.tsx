// Spec 0047 (owner 2026-10-31) -- watching a game, from the lobby's Watch
// button: /watch/<room>. The public table only -- both players'
// battlefields, graveyards, exile, the stack, life and counts -- never a
// hand's contents or a library; never asked anything. The server checks
// the room lets people watch, here and again when the socket opens.

import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { GameScreen } from "./battlefield/GameScreen";
import { LoadingRing } from "./battlefield/LoadingRing";
import { watchRoom, type MatchView } from "./lobby";

/** How often the page checks the game is still on (it ends without a word to spectators). */
const STILL_ON_MS = 5_000;

export default function WatchPage() {
  const { roomId = "" } = useParams();
  const { state } = useAuth();
  const navigate = useNavigate();
  const [match, setMatch] = useState<MatchView | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      void watchRoom(roomId).then((found) => {
        if (cancelled) return;
        if (found) setMatch((previous) => previous ?? found);
        else setGone(true);
      });
    check();
    const timer = window.setInterval(check, STILL_ON_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [roomId]);

  if (gone && !match) return <Navigate to="/play" replace />;
  if (!match || state.status !== "authenticated") {
    return (
      <section className="gs-screen" aria-label="Watching a game" aria-busy="true">
        <h1 className="pa-visually-hidden">Watching a game</h1>
        <LoadingRing words="Finding the game." />
      </section>
    );
  }
  return (
    <>
      <GameScreen
        match={match}
        me={state.user.userId}
        watching
        onLeave={() => void navigate("/play")}
      />
      {gone && (
        <div className="gs-banner pa-notice" role="status">
          <span aria-hidden="true" className="pa-notice-mark" />
          <span className="pa-notice-text">
            The game is over.{" "}
            <button type="button" className="gs-link" onClick={() => void navigate("/play")}>
              Back to the lobby
            </button>
          </span>
        </div>
      )}
    </>
  );
}
