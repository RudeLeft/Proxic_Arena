// Spec 0047 (owner 2026-10-31) -- watching a game, from the lobby's Watch
// button: /watch/<room>. The public table only -- both players'
// battlefields, graveyards, exile, the stack, life and counts -- never a
// hand's contents or a library; never asked anything.
//
// Spec 0067 (owner 2026-11-09) -- "Spectate", made whole: one loading
// screen (this page's swirl carries straight on into the table's); the end
// of the game comes on the game's own socket, with who won (GameScreen's
// slim card), never from a poll; a network hiccup is ridden out, not taken
// for the end; and when the players start their next game in the room, the
// spectator follows them into it. "Spectate another game" offers a game
// running in another room.

import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { GameScreen, SPECTATE_LOADING_WORDS } from "./battlefield/GameScreen";
import { LoadingRing } from "./battlefield/LoadingRing";
import { watchRoomAnswer, type MatchView } from "./lobby";
import { useLobbyConnection } from "./shell/LobbyConnection";

/**
 * How often the page asks which game the room is playing: to follow the
 * players into their next game (a rematch), and to keep looking while the
 * first answer will not come. The end of a game is not read from this.
 */
export const ROOM_LOOK_MS = 3_000;

export default function WatchPage() {
  const { roomId = "" } = useParams();
  const { state } = useAuth();
  const { lobby } = useLobbyConnection();
  const navigate = useNavigate();
  const [match, setMatch] = useState<MatchView | null>(null);
  // The room has no game to spectate, and we had none on screen.
  const [none, setNone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Another room (Spectate another game): start afresh.
    setMatch(null);
    setNone(false);
    const look = () =>
      void watchRoomAnswer(roomId).then((answer) => {
        if (cancelled) return;
        if (answer.kind === "match") {
          // The same game, or the players' next one in this room: follow it.
          setMatch((was) => (was?.matchId === answer.match.matchId ? was : answer.match));
        } else if (answer.kind === "none") {
          setNone(true);
        }
        // "unknown": no answer (a hiccup) -- ask again next time.
      });
    look();
    const timer = window.setInterval(look, ROOM_LOOK_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [roomId]);

  const me = state.status === "authenticated" ? state.user.userId : null;
  const another = lobby.rooms.find(
    (room) =>
      room.roomId !== roomId &&
      room.status === "IN_MATCH" &&
      room.spectatable === true &&
      !room.seats.some((seat) => seat.userId === me),
  );

  if (none && !match) return <Navigate to="/play" replace />;
  if (!match || !me) {
    return (
      <section className="gs-screen" aria-label="Spectating a game" aria-busy="true">
        <h1 className="pa-visually-hidden">Spectating a game</h1>
        <LoadingRing words={SPECTATE_LOADING_WORDS} />
      </section>
    );
  }
  return (
    <GameScreen
      key={match.matchId}
      match={match}
      me={me}
      watching
      onLeave={() => void navigate("/play")}
      onSpectateAnother={another ? () => void navigate(`/watch/${another.roomId}`) : null}
    />
  );
}
