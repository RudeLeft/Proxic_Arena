// The one live connection a signed-in page holds — PHASE_07 §7.62.
//
// /ws/user carries presence, invitations, room changes and lobby chat
// (Phase 5). It used to be opened by the Lobby page alone, so a player
// browsing the Deck Depot showed as offline and an invitation sent to
// them waited unseen. It now lives in the shell around every signed-in
// page: opened once at sign-in, kept across page changes, closed at
// sign-out. The Lobby page reads it from here; the header shows its
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
import { EMPTY_LOBBY, connectLobby, type LobbySocket, type LobbyState } from "../lobby";

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

  useEffect(() => {
    const opened = connectLobby(lobbyUrl(), setLobbyState);
    socket.current = opened;
    return () => {
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
