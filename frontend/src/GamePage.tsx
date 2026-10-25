// The game's own page — spec 0013 (owner 2026-10-25).
//
// The board used to be drawn over the lobby page, so a refresh drew the
// lobby first and covered it once the server said "you are in a game".
// At /game the game is all there is: until it is known, the game's own
// loading ring; with no game, back to the lobby. The lobby connection the
// app already holds (presence, invitations, the game chat) carries on
// underneath, as it does on every page.

import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { GameScreen } from "./battlefield/GameScreen";
import { LoadingRing } from "./battlefield/LoadingRing";
import { fetchCurrentMatch } from "./lobby";
import { useLobbyConnection } from "./shell/LobbyConnection";
import { useSettled } from "./useSettled";

export default function GamePage() {
  const { lobby, setLobby } = useLobbyConnection();
  const { state } = useAuth();
  const navigate = useNavigate();
  const [none, setNone] = useState(false);
  const match = lobby.match;

  useEffect(() => {
    if (match) return undefined;
    let cancelled = false;
    void fetchCurrentMatch().then((current) => {
      if (cancelled) return;
      if (current)
        setLobby((previous) => (previous.match ? previous : { ...previous, match: current }));
      else setNone(true);
    });
    return () => {
      cancelled = true;
    };
  }, [match, setLobby]);

  // Shown only if finding the game takes a moment: usually it does not.
  const ringDue = useSettled(!match, 400);

  if (none && !match) return <Navigate to="/play" replace />;
  if (!match || state.status !== "authenticated") {
    return (
      // The game screen's own ground, so nothing changes when it arrives.
      <section className="gs-screen" aria-label="Your match" aria-busy="true">
        <h1 className="pa-visually-hidden">Your match</h1>
        {ringDue && <LoadingRing words="Starting the game." />}
      </section>
    );
  }
  return (
    <GameScreen
      match={match}
      me={state.user.userId}
      onLeave={() => {
        // G2 — the game's chat goes with the game.
        setLobby((previous) => ({ ...previous, match: null, gameChat: [] }));
        void navigate("/play");
      }}
    />
  );
}
