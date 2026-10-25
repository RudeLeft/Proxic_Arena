// The one live connection a signed-in page holds — PHASE_07 §7.62.
//
// /ws/user carries presence, invitations, room changes and lobby chat
// (Phase 5). It used to be opened by the Lobby page alone, so a player
// browsing the Deck Depot showed as offline and an invitation sent to
// them waited unseen. It now lives in the shell around every signed-in
// page: opened once at sign-in, kept across page changes, closed at
// sign-out -- and reopened on its own when it drops. The Lobby page reads it from here; the header shows its
// state.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { EMPTY_LOBBY, catchUp, connectLobby, type LobbySocket, type LobbyState } from "../lobby";
import { watchActivity } from "../activity";

interface LobbyConnectionValue {
  lobby: LobbyState;
  setLobby: (next: (previous: LobbyState) => LobbyState) => void;
  send: (message: Record<string, unknown>) => void;
}

const LobbyConnectionContext = createContext<LobbyConnectionValue | null>(null);

function lobbyUrl(): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/ws/user`;
}

export function LobbyConnectionProvider({ children }: { children: ReactNode }) {
  const [lobby, setLobbyState] = useState<LobbyState>(EMPTY_LOBBY);
  const socket = useRef<LobbySocket | null>(null);
  // The state as last drawn, for catching up after a reconnect.
  const latest = useRef(lobby);
  useEffect(() => {
    latest.current = lobby;
  }, [lobby]);

  useEffect(() => {
    // Spec 0009 — away or back, said only when it changes; said again
    // after a reconnect, which the server sees as a fresh, active tab.
    let away = false;
    const opened = connectLobby(lobbyUrl(), setLobbyState, WebSocket, {
      onReopen: () => {
        if (away) opened.send({ type: "ACTIVITY", away: true });
        void catchUp(setLobbyState, () => latest.current);
      },
    });
    socket.current = opened;
    const stopWatching = watchActivity((next) => {
      away = next;
      opened.send({ type: "ACTIVITY", away: next });
    });
    return () => {
      stopWatching();
      socket.current = null;
      opened.close();
    };
  }, []);

  const setLobby = useCallback(
    (next: (previous: LobbyState) => LobbyState) => setLobbyState(next),
    [],
  );
  const send = useCallback((message: Record<string, unknown>) => socket.current?.send(message), []);
  const value = useMemo(() => ({ lobby, setLobby, send }), [lobby, setLobby, send]);
  return (
    <LobbyConnectionContext.Provider value={value}>{children}</LobbyConnectionContext.Provider>
  );
}

export function useLobbyConnection(): LobbyConnectionValue {
  const value = useContext(LobbyConnectionContext);
  if (!value) throw new Error("useLobbyConnection used outside the signed-in shell");
  return value;
}
