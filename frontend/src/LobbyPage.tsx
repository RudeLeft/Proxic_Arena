// The Lobby — PHASE_07 §7.64, Amendments 9 and 11, over Phase 5 and 6.
//
// Spec 0006 (owner 2026-10-24): players on the left, your room as the
// main area with the other rooms under it, chat on the right; stacked on
// a phone. While you are in a match, Phase 6's match view
// takes the whole window instead (the game screen, PHASE_07 §7.60),
// and the lobby comes back when the game ends.
//
// Two rules from Phase 5 still shape every handler. The page does not
// predict (§5.132): it sends a request and draws the room the server
// sends back. And what it shows about other people is the safe list
// (§5.141): names, seats, readiness — the room list carries no deck at
// all, and your own deck is the only one ever named.
//
// What is new is visibility, not access: every room is listed, but a
// seat still needs an invitation, so there is no Join button. A room
// you were not asked into says so instead of offering one.

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useLobbyConnection } from "./shell/LobbyConnection";
import { EMPTY_LIBRARY, listDecks, type DeckLibrary } from "./decks";
import { GameScreen } from "./battlefield/GameScreen";
import {
  cancelPreparation,
  closeRoom,
  createRoom,
  fetchCurrentMatch,
  fetchCurrentRoom,
  fetchMatchSetupId,
  launchMatch,
  leaveRoom,
  prepareMatch,
  removeMember,
  selectDeck,
  setReady,
  type DirectoryRoom,
  type LobbyState,
  type RoomResult,
  type RoomView,
} from "./lobby";
import {
  avatarOf,
  closesSoon,
  presenceOf,
  orderRooms,
  playerRows,
  roomStatus,
  type PlayerRow,
} from "./lobbyView";
import { Avatar } from "./avatars";
import { ChatPanel } from "./LobbyChat";

/** Spec 0009 — the clock, ticking once a minute, for "Away 7 min" and "last seen". */
function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** Straight after Invite the pointer is still on the button; Withdraw waits this long. */
const SETTLE_MS = 2200;

export default function LobbyPage() {
  const { state: auth } = useAuth();
  const me = auth.status === "authenticated" ? auth.user : null;

  // The live connection is the shell's (§7.62): it outlives this page,
  // so presence and invitations reach a player on any page.
  const { lobby, setLobby, send } = useLobbyConnection();
  const [library, setLibrary] = useState<DeckLibrary>(EMPTY_LIBRARY);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  // Page-owned prompts: closing the invitation box is "deal with it
  // later", not an answer, so it is remembered here and nowhere else.
  const [setAsideFor, setSetAsideFor] = useState<string | null>(null);
  const [needRoomFor, setNeedRoomFor] = useState<PlayerRow | null>(null);
  // Owner 2026-10-22: removing a player asks first -- a misclick otherwise
  // throws a friend out of the room.
  const [removing, setRemoving] = useState<string | null>(null);

  // §5.119 — a refresh lands you back in the room, and §6.114 back in
  // the match. Asked over HTTP as well as awaited on the socket,
  // because the socket only tells you once.
  useEffect(() => {
    let cancelled = false;
    void fetchCurrentRoom().then((room) => {
      if (cancelled || !room) return;
      setLobby((previous) =>
        previous.room && previous.room.revision >= room.revision ? previous : { ...previous, room },
      );
    });
    void fetchCurrentMatch().then((match) => {
      if (cancelled || !match) return;
      setLobby((previous) => (previous.match ? previous : { ...previous, match }));
    });
    void listDecks().then((next) => {
      if (!cancelled) setLibrary(next ?? EMPTY_LIBRARY);
    });
    return () => {
      cancelled = true;
    };
  }, [setLobby]);

  // A deck chosen in this room was renamed (P7-AA): the room already says
  // the new name; the deck list catches up, once per new name.
  const chosen = lobby.room?.members.find((m) => m.userId === me?.userId);
  const chosenName = chosen?.selectedDeckName ?? null;
  const listed = [...library.mine, ...library.sharedWithMe].find(
    (d) => d.deckId === chosen?.selectedDeckId,
  );
  const listStale = !!listed && !!chosenName && listed.displayName !== chosenName;
  useEffect(() => {
    if (!listStale) return;
    void listDecks().then((next) => setLibrary(next ?? EMPTY_LIBRARY));
  }, [listStale, chosenName]);

  /** One place where every room call reports its refusal (§5.132: adopt, never predict). */
  const run = useCallback(
    async (call: () => Promise<RoomResult>) => {
      setBusy(true);
      setFailure(null);
      const result = await call();
      setBusy(false);
      if (result.ok) {
        setLobby((previous) => ({
          ...previous,
          room: result.room,
          setupProblem: null,
          notice: null,
        }));
      } else {
        setFailure(result.failure.detail);
      }
      return result;
    },
    [setLobby],
  );

  /**
   * Leaving and closing: the room is no longer YOURS, whatever the
   * server's answer says about it (it describes the room as the others
   * now see it). Reported by the owner, who had to refresh to get out.
   */
  const runLeaving = useCallback(
    async (call: () => Promise<RoomResult>) => {
      setBusy(true);
      setFailure(null);
      const result = await call();
      setBusy(false);
      // NOT_FOUND is out too: the server no longer has you in that
      // room (it closed, or you were removed while this page was not
      // told). It used to show "No such endpoint." and keep the room
      // on screen, with no way out but a reload (owner, 2026-10-21).
      if (result.ok || result.failure.errorCode === "NOT_FOUND") {
        setLobby((previous) => ({
          ...previous,
          room: null,
          left: previous.room
            ? {
                roomId: previous.room.roomId,
                revision: Math.max(previous.room.revision, result.ok ? result.room.revision : 0),
              }
            : previous.left,
          setupProblem: null,
          notice: null,
          match: null,
        }));
      } else {
        setFailure(result.failure.detail);
      }
    },
    [setLobby],
  );

  const room = lobby.room;

  /**
   * §7.64 — Start match is ONE button. The server still freezes and
   * validates (prepare) and then claims (launch), as Phases 5 and 6
   * require; the player sees one step and is told what the wait is
   * for. If the launch is refused, the preparation is undone so the
   * room is editable again rather than stuck locked.
   */
  const startMatch = useCallback(async () => {
    if (!room) return;
    setStarting(true);
    setFailure(null);
    if (room.status !== "READY_FOR_MATCH") {
      const prepared = await prepareMatch(room.roomId, room.revision);
      if (!prepared.ok) {
        setStarting(false);
        setFailure(prepared.failure.detail);
        return;
      }
      setLobby((previous) => ({ ...previous, room: prepared.room }));
    }
    const setupId = await fetchMatchSetupId(room.roomId);
    const launched = setupId ? await launchMatch(setupId) : null;
    setStarting(false);
    if (launched?.ok) {
      setLobby((previous) => ({ ...previous, match: launched.match, notice: null }));
      return;
    }
    setFailure(launched ? launched.failure.detail : "The match could not be started. Try again.");
    const reopened = await cancelPreparation(room.roomId);
    if (reopened.ok) setLobby((previous) => ({ ...previous, room: reopened.room }));
  }, [room, setLobby]);

  const invite = useCallback(
    (row: PlayerRow) => {
      if (row.control.kind !== "invite") return;
      if (row.control.needsRoom) {
        setNeedRoomFor(row);
        return;
      }
      send({ type: "INVITE", userId: row.user.userId });
    },
    [send],
  );

  /** "Open a room" from the need-a-room box: open one, then send the invitation it was for. */
  const openRoomAndInvite = useCallback(async () => {
    const row = needRoomFor;
    setNeedRoomFor(null);
    const result = await run(() => createRoom());
    if (result.ok && row) send({ type: "INVITE", userId: row.user.userId });
  }, [needRoomFor, run, send]);

  if (!me) return null;

  const invitation = lobby.invitation;
  const inviteBoxOpen = invitation !== null && setAsideFor !== invitation.roomId;

  return (
    <main className="pa-main pa-lobby">
      <h1 className="pa-visually-hidden">Lobby</h1>

      <div className="pa-lobby-notices">
        {lobby.connection === "reconnecting" && (
          // §5.133 — a page that stopped being told must say so. It
          // reconnects on its own now (owner report 2026-10-21).
          <div className="pa-notice pa-notice-warn" role="status">
            <span aria-hidden="true" className="pa-notice-mark" />
            <span className="pa-notice-text">
              <strong>Reconnecting…</strong>
              <span className="pa-notice-sub">
                The connection dropped. This page catches up by itself as soon as it is back — your
                room is still there.
              </span>
            </span>
          </div>
        )}
        {lobby.connection === "ended" && (
          <div className="pa-notice pa-notice-bad" role="alert">
            <span aria-hidden="true" className="pa-notice-mark" />
            <span className="pa-notice-text">
              <strong>Signed out</strong>
              <span className="pa-notice-sub">
                This session has ended, perhaps from another tab. Reload the page to sign in again.
              </span>
            </span>
          </div>
        )}
        {lobby.notice && (
          <div
            className={`pa-notice ${lobby.notice.kind === "error" ? "pa-notice-bad" : "pa-notice-warn"}`}
            role={lobby.notice.kind === "error" ? "alert" : "status"}
          >
            <span aria-hidden="true" className="pa-notice-mark" />
            <span className="pa-notice-text">{lobby.notice.detail}</span>
            <button
              type="button"
              className="pa-small-button"
              onClick={() => setLobby((previous) => ({ ...previous, notice: null }))}
            >
              Dismiss
            </button>
          </div>
        )}
        {failure && (
          <div className="pa-notice pa-notice-bad" role="alert">
            <span aria-hidden="true" className="pa-notice-mark" />
            <span className="pa-notice-text">{failure}</span>
          </div>
        )}
        {lobby.setupProblem && (
          // §5.100 — about YOUR deck, sent only to you.
          <div className="pa-notice pa-notice-bad" role="alert">
            <span aria-hidden="true" className="pa-notice-mark" />
            <span className="pa-notice-text">
              <strong>Your deck needs attention</strong>
              <span className="pa-notice-sub">{lobby.setupProblem.detail}</span>
            </span>
          </div>
        )}
      </div>

      {lobby.match && (
        // §7.60 — the board takes the whole window; the lobby is back
        // when the player leaves a finished game.
        <GameScreen
          match={lobby.match}
          me={me.userId}
          onLeave={() => setLobby((previous) => ({ ...previous, match: null }))}
        />
      )}

      {/* Behind a game the lobby is out of reach -- of the mouse already, and
          now of the keyboard and screen readers too (2026-10-24 review). The
          game has its own chat. */}
      <div className="pa-lobby-layout" hidden={!!lobby.match}>
        <PlayersPanel
          lobby={lobby}
          me={me.userId}
          onInvite={invite}
          onWithdraw={() => send({ type: "INVITE_WITHDRAW" })}
        />
        <RoomsColumn
          lobby={lobby}
          me={me.userId}
          library={library}
          busy={busy}
          starting={starting}
          onOpen={(name) => void run(() => createRoom(fetch, name))}
          onAccept={(roomId) => send({ type: "INVITE_ACCEPT", roomId })}
          onSelectDeck={(deckId) => {
            if (room) void run(() => selectDeck(room.roomId, deckId, room.revision));
          }}
          onReady={(ready) => {
            if (room) void run(() => setReady(room.roomId, ready, room.revision));
          }}
          onStart={() => void startMatch()}
          onCancelStart={() => {
            if (room) void run(() => cancelPreparation(room.roomId));
          }}
          onRemove={(userId) => setRemoving(userId)}
          onClose={() => {
            if (room) void runLeaving(() => closeRoom(room.roomId));
          }}
          onLeave={() => {
            if (room) void runLeaving(() => leaveRoom(room.roomId));
          }}
        />
        <ChatPanel
          lobby={lobby}
          me={me?.userId ?? null}
          onSay={(text) => send({ type: "CHAT", text })}
          onReact={(lineId, emoji, on) => send({ type: "REACT", lineId, emoji, on })}
        />
      </div>

      {removing && room && (
        <Dialog
          label="Remove a player"
          title={`Remove ${room.members.find((m) => m.userId === removing)?.displayName ?? "this player"} from the room?`}
          sub="They go back to the lobby and their seat opens. You can invite them again."
          primary="Remove"
          onPrimary={() => {
            const userId = removing;
            setRemoving(null);
            void run(() => removeMember(room.roomId, userId, room.revision));
          }}
          secondary="Keep them"
          onSecondary={() => setRemoving(null)}
          onDismiss={() => setRemoving(null)}
        />
      )}

      {inviteBoxOpen && invitation && (
        <Dialog
          label="Invitation"
          title={`${invitation.from.displayName} asked you into ${invitation.roomName}`}
          sub="One seat is open and held for you. To decide later, close this window. You can accept anytime from the room list."
          primary="Accept"
          onPrimary={() => send({ type: "INVITE_ACCEPT", roomId: invitation.roomId })}
          secondary="Decline"
          onSecondary={() => send({ type: "INVITE_DECLINE" })}
          onDismiss={() => setSetAsideFor(invitation.roomId)}
        />
      )}

      {!inviteBoxOpen && lobby.invitationGone && (
        <Dialog
          label="Invitation ended"
          title={goneTitle(lobby.invitationGone.reason, lobby.invitationGone.fromDisplayName)}
          primary="OK"
          onPrimary={() => setLobby((previous) => ({ ...previous, invitationGone: null }))}
        />
      )}

      {needRoomFor && (
        <Dialog
          label="No room yet"
          title="You need a room before you can invite anyone"
          sub={`Open a room and the invitation to ${needRoomFor.user.displayName} will be for that one.`}
          primary="Open a room"
          onPrimary={() => void openRoomAndInvite()}
          secondary="Cancel"
          onSecondary={() => setNeedRoomFor(null)}
        />
      )}
    </main>
  );
}

function goneTitle(reason: string, from: string | null): string {
  const who = from ?? "The host";
  switch (reason) {
    case "WITHDRAWN":
      return `${who} withdrew the invitation`;
    case "ROOM_CLOSED":
      return `${who}'s room closed, so the invitation ended`;
    case "SEAT_FILLED":
      return "The seat was taken, so the invitation ended";
    case "OFFLINE":
      return `${who} left, so the invitation ended`;
    default:
      return "That invitation is no longer open";
  }
}

// --- players ------------------------------------------------------------------

function PlayersPanel({
  lobby,
  me,
  onInvite,
  onWithdraw,
}: {
  lobby: LobbyState;
  me: string;
  onInvite: (row: PlayerRow) => void;
  onWithdraw: () => void;
}) {
  // Spec 0009: "Away 7 min" counts on by itself.
  const now = useMinute();
  const rows = useMemo(() => playerRows(lobby, me, now), [lobby, me, now]);
  const online = rows.filter((row) => row.online);
  const offline = rows.filter((row) => !row.online);
  const onlineCount = lobby.presence.filter((p) => p.userId !== me).length;
  // Spec 0006: the offline accounts fold away, closed until asked for.
  const [offlineOpen, setOfflineOpen] = useState(false);
  const outgoingTo = lobby.outgoing?.to.userId ?? null;

  // Straight after Invite the pointer is still on the button, so
  // offering to undo it at once reads as a mistake: it settles first.
  const [settled, setSettled] = useState<string | null>(null);
  useEffect(() => {
    if (!outgoingTo) return undefined;
    const timer = window.setTimeout(() => setSettled(outgoingTo), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [outgoingTo]);

  const line = (row: PlayerRow) => (
    <li key={row.user.userId} className="pa-player-row">
      <span className={row.online ? "pa-player-face" : "pa-player-face pa-player-face-off"}>
        <Avatar
          avatar={row.user.avatar}
          size={36}
          {...presenceOf(lobby, row.user.userId, row.user.displayName, now)}
        />
      </span>
      <span className="pa-player-text">
        <span className={`pa-player-name${row.online ? "" : " pa-player-offline"}`}>
          {row.user.displayName}
        </span>
        <span className="pa-player-where">
          <span className={`pa-where-${row.tone}`}>{row.where}</span>
        </span>
      </span>
      <InviteButton
        row={row}
        settled={settled === row.user.userId}
        onInvite={() => onInvite(row)}
        onWithdraw={onWithdraw}
      />
    </li>
  );

  return (
    <section className="pa-panel pa-lobby-players" aria-labelledby="players-heading">
      <div className="pa-panel-head">
        <h2 id="players-heading">Players</h2>
        <span className="pa-panel-note">{onlineCount} online</span>
      </div>
      <ul className="pa-player-list">
        {rows.length === 0 && <li className="pa-group-empty">Nobody else has an account yet.</li>}
        {rows.length > 0 && online.length === 0 && (
          <li className="pa-group-empty">Nobody else is online right now.</li>
        )}
        {online.map(line)}
      </ul>
      {offline.length > 0 && (
        <>
          <button
            type="button"
            className="pa-offline-toggle"
            aria-expanded={offlineOpen}
            onClick={() => setOfflineOpen((open) => !open)}
          >
            <span>Offline · {offline.length}</span>
            <span aria-hidden="true">{offlineOpen ? "▾" : "▸"}</span>
          </button>
          {offlineOpen && (
            <ul className="pa-player-list pa-player-list-offline">{offline.map(line)}</ul>
          )}
        </>
      )}
    </section>
  );
}

function InviteButton({
  row,
  settled,
  onInvite,
  onWithdraw,
}: {
  row: PlayerRow;
  settled: boolean;
  onInvite: () => void;
  onWithdraw: () => void;
}) {
  const name = row.user.displayName;
  switch (row.control.kind) {
    case "none":
      return null;
    case "invite":
      return (
        <button
          type="button"
          className="pa-invite"
          aria-label={`Invite ${name}`}
          onClick={onInvite}
        >
          Invite
        </button>
      );
    case "invited":
      // Says what it is at rest and, once settled, what pressing it
      // does under the pointer: Withdraw.
      return (
        <button
          type="button"
          className={`pa-invite pa-invite-out${settled ? " pa-invite-withdraw" : ""}`}
          aria-label={settled ? `Withdraw the invitation to ${name}` : `${name} has been invited`}
          onClick={() => {
            if (settled) onWithdraw();
          }}
        >
          <span className="pa-at-rest">Invited</span>
          <span className="pa-on-hover">Withdraw</span>
        </button>
      );
    case "blocked":
      return (
        <button
          type="button"
          className="pa-invite pa-invite-blocked"
          disabled
          aria-label={`Invite ${name}: ${row.control.why}`}
          title={row.control.why}
        >
          Invite
        </button>
      );
  }
}

// --- rooms ------------------------------------------------------------------------

function RoomsColumn({
  lobby,
  me,
  library,
  busy,
  starting,
  onOpen,
  onAccept,
  onSelectDeck,
  onReady,
  onStart,
  onCancelStart,
  onRemove,
  onClose,
  onLeave,
}: {
  lobby: LobbyState;
  me: string;
  library: DeckLibrary;
  busy: boolean;
  starting: boolean;
  onOpen: (name: string) => void;
  onAccept: (roomId: string) => void;
  onSelectDeck: (deckId: string | null) => void;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onCancelStart: () => void;
  onRemove: (userId: string) => void;
  onClose: () => void;
  onLeave: () => void;
}) {
  const [name, setName] = useState("");
  const nameId = useId();
  // Re-read the clock each minute so "Closes in" stays honest.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const mine = lobby.room;
  const others = orderRooms(lobby.rooms, null).filter((room) => room.roomId !== mine?.roomId);
  // Your own room is drawn from the room the server sent YOU, which is
  // always at least as fresh as the list; the list only adds when it closes.
  const listedMine = mine
    ? (lobby.rooms.find((r) => r.roomId === mine.roomId) ?? asListed(mine))
    : null;

  const open = (event: FormEvent) => {
    event.preventDefault();
    onOpen(name);
    setName("");
  };

  return (
    <div className="pa-lobby-main">
      {mine && listedMine ? (
        <YourRoom
          room={mine}
          listed={listedMine}
          lobby={lobby}
          me={me}
          now={now}
          library={library}
          busy={busy}
          starting={starting}
          onSelectDeck={onSelectDeck}
          onReady={onReady}
          onStart={onStart}
          onCancelStart={onCancelStart}
          onRemove={onRemove}
          onClose={onClose}
          onLeave={onLeave}
        />
      ) : (
        // Amendment 9 — rooms are opened on demand, and may be named.
        <section className="pa-panel pa-open-panel" aria-labelledby="open-heading">
          <h2 id="open-heading" className="pa-open-title">
            Play a game
          </h2>
          <p className="pa-open-sub">Open a room, then invite somebody who is online.</p>
          <form className="pa-open-room" onSubmit={open}>
            <label className="pa-visually-hidden" htmlFor={nameId}>
              Room name (optional)
            </label>
            <input
              id={nameId}
              className="pa-input"
              value={name}
              maxLength={40}
              placeholder="Room name (optional)"
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
            <button type="submit" className="pa-button pa-button-brass" disabled={busy}>
              Open a room
            </button>
          </form>
        </section>
      )}

      <section className="pa-panel pa-other-rooms" aria-labelledby="rooms-heading">
        <div className="pa-panel-head">
          <h2 id="rooms-heading">{mine ? "Other rooms" : "Open rooms"}</h2>
          <span className="pa-panel-note">Join by invitation</span>
        </div>
        {others.length === 0 ? (
          <p className="pa-group-empty">
            {mine ? "No other rooms are open." : "No rooms are open yet."}
          </p>
        ) : (
          <div className="pa-room-list">
            {others.map((room) => (
              <RoomLine
                key={room.roomId}
                room={room}
                invited={lobby.invitation?.roomId === room.roomId}
                now={now}
                onAccept={onAccept}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Your own room in the list's shape, for the moment before the list catches up. */
function asListed(room: RoomView): DirectoryRoom {
  return {
    roomId: room.roomId,
    name: room.name,
    hostUserId: room.hostUserId,
    status: room.status,
    desiredPlayerCount: room.desiredPlayerCount,
    seats: room.members.map((m) => ({
      seatNumber: m.seatNumber,
      userId: m.userId,
      displayName: m.displayName,
      ready: m.ready,
      isHost: m.isHost,
    })),
    clearsAt: null,
  };
}

/** Somebody else's room: one line, and no way in without an invitation (§7.64, decision 19). */
function RoomLine({
  room,
  invited,
  now,
  onAccept,
}: {
  room: DirectoryRoom;
  invited: boolean;
  now: number;
  onAccept: (roomId: string) => void;
}) {
  const headingId = useId();
  const closes = closesSoon(room.clearsAt, now);
  const people = room.seats.map((seat) => seat.displayName).join(" and ");
  return (
    <article className={`pa-room${invited ? " pa-room-invited" : ""}`} aria-labelledby={headingId}>
      <h3 id={headingId} className="pa-room-name">
        {room.name}
      </h3>
      <span className="pa-room-who">
        {/* An invitation holds the open seat for you: said where you would look. */}
        {people} · {invited ? "Held for you" : roomStatus(room).toLowerCase()}
      </span>
      {closes && <span className="pa-room-closes">{closes}</span>}
      <span className="pa-room-action">
        {invited ? (
          <button
            type="button"
            className="pa-button pa-button-accept"
            onClick={() => onAccept(room.roomId)}
          >
            Accept
          </button>
        ) : (
          <span className="pa-room-note">By invitation</span>
        )}
      </span>
    </article>
  );
}

/** The room you are in: who is seated, the three steps, and what your role may do. */
function YourRoom({
  room,
  listed,
  lobby,
  me,
  now,
  library,
  busy,
  starting,
  onSelectDeck,
  onReady,
  onStart,
  onCancelStart,
  onRemove,
  onClose,
  onLeave,
}: {
  room: RoomView;
  listed: DirectoryRoom;
  lobby: LobbyState;
  me: string;
  now: number;
  library: DeckLibrary;
  busy: boolean;
  starting: boolean;
  onSelectDeck: (deckId: string | null) => void;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onCancelStart: () => void;
  onRemove: (userId: string) => void;
  onClose: () => void;
  onLeave: () => void;
}) {
  const headingId = useId();
  const deckId = useId();
  const myMember = room.members.find((m) => m.userId === me) ?? null;
  const iHost = room.hostUserId === me;
  const preparing = room.status === "READY_FOR_MATCH";
  const playing = room.status === "IN_MATCH";
  const guest = room.members.find((m) => !m.isHost) ?? null;
  const other = room.members.find((m) => m.userId !== me) ?? null;
  // A room left prepared but not started (a tab that died between the
  // two steps) starts from here too: Start match then only launches.
  const canStart = iHost && room.everyoneReady && !busy && !starting;
  const decks = [
    ...library.mine.map((deck) => ({ deck, shared: false })),
    ...library.sharedWithMe.map((deck) => ({ deck, shared: true })),
  ];
  const chosen = decks.find(({ deck }) => deck.deckId === myMember?.selectedDeckId)?.deck ?? null;
  const asked = lobby.outgoing?.roomId === room.roomId ? lobby.outgoing.to : null;
  const closes = closesSoon(listed.clearsAt, now);
  const full = room.members.length >= room.desiredPlayerCount;
  const deckDone = !!myMember?.selectedDeckId;
  const readyDone = !!myMember?.ready;
  // The room's status from the room the server sent YOU (always the
  // freshest), in the list's shape.
  const status = roomStatus({ ...asListed(room), clearsAt: listed.clearsAt });

  const waitingFor = !full
    ? "Waiting for a second player"
    : other && !other.ready
      ? `Waiting for ${other.displayName} to be ready`
      : !readyDone
        ? "Waiting for you to be ready"
        : iHost
          ? "Both players are ready"
          : "Both players are ready — the host starts";

  return (
    <article className="pa-panel pa-room pa-room-mine" aria-labelledby={headingId}>
      <div className="pa-room-top">
        <h2 id={headingId} className="pa-room-title">
          {room.name}
        </h2>
        <span className={`pa-status${playing ? " pa-status-playing" : ""}`}>{status}</span>
        {closes && <span className="pa-room-closes">{closes}</span>}
        <span className="pa-room-role">{iHost ? "Your room" : "Your seat"}</span>
        {/* The seat count, for screen readers and the tests: the seats say it to the eye. */}
        <span className="pa-room-taken pa-visually-hidden">
          {room.members.length}/{room.desiredPlayerCount}
        </span>
      </div>

      <div className="pa-seats">
        {room.members.map((member) => (
          <div
            key={member.userId}
            className={`pa-seat${member.userId === me ? " pa-seat-you" : ""}`}
          >
            <Avatar
              avatar={avatarOf(lobby, member.userId)}
              size={44}
              {...presenceOf(lobby, member.userId, member.displayName, Date.now())}
            />
            <span className="pa-seat-text">
              <span className="pa-seat-name">
                {member.displayName}
                {member.userId === me && (
                  <span className="pa-seat-tag"> · you{member.isHost ? ", host" : ""}</span>
                )}
                {member.userId !== me && member.isHost && (
                  <span className="pa-seat-tag"> · host</span>
                )}
              </span>
              {/* §5.47: your own deck only; the other player's is never shown. */}
              <span className="pa-seat-deck">
                {member.userId === me
                  ? (member.selectedDeckName ?? "No deck chosen yet")
                  : playing
                    ? "Playing"
                    : member.ready
                      ? "Deck chosen"
                      : "Choosing a deck…"}
              </span>
            </span>
            <span className={`pa-seat-ready${member.ready || playing ? " pa-seat-ready-on" : ""}`}>
              {playing ? "Playing" : member.ready ? "✓ Ready" : "Not ready"}
            </span>
          </div>
        ))}
        {!full && (
          <div className="pa-seat pa-seat-open">
            <Avatar avatar={asked ? avatarOf(lobby, asked.userId) : null} size={44} />
            <span className="pa-seat-text">
              <span className="pa-seat-name">{asked ? asked.displayName : "Open seat"}</span>
              <span className="pa-seat-deck">
                {asked ? "Invited: Accept Pending" : "Invite someone from Players"}
              </span>
            </span>
          </div>
        )}
      </div>

      {playing ? (
        <p className="pa-your-room-note">
          The match is being played. Nothing here can change it — closing a browser is not a
          concession, and neither is leaving the room.
        </p>
      ) : (
        <>
          <ol className="pa-steps" aria-label="Getting the game going">
            <li className={`pa-step${deckDone ? " pa-step-done" : ""}`}>
              <span className="pa-step-key">1 · Your deck{deckDone ? " ✓" : ""}</span>
              <span className="pa-select-wrap pa-deck-select">
                <label className="pa-visually-hidden" htmlFor={deckId}>
                  Your deck for this match
                </label>
                <select
                  id={deckId}
                  className="pa-select"
                  value={myMember?.selectedDeckId ?? ""}
                  disabled={busy || preparing || starting}
                  onChange={(event) => onSelectDeck(event.target.value || null)}
                >
                  <option value="">{decks.length === 0 ? "No decks yet" : "Choose a deck"}</option>
                  {decks.map(({ deck, shared }) => (
                    <option key={deck.deckId} value={deck.deckId}>
                      {/* The room's word for the chosen deck wins: it is the server's
                          current name, and the list here was read when the page
                          opened (P7-AA: renamed while chosen). */}
                      {deck.deckId === myMember?.selectedDeckId && myMember.selectedDeckName
                        ? myMember.selectedDeckName
                        : deck.displayName}{" "}
                      — {deck.totalCards} cards
                      {shared ? ` (shared by ${deck.ownerDisplayName})` : ""}
                    </option>
                  ))}
                </select>
                <svg aria-hidden="true" width="11" height="7" viewBox="0 0 11 7">
                  <path d="M1 1 L5.5 5.5 L10 1" />
                </svg>
              </span>
              <span className="pa-step-note">
                {decks.length === 0 ? (
                  <>
                    <Link to="/decks">Go to Deck Depot to Import a Deck</Link>
                  </>
                ) : chosen ? (
                  `${chosen.totalCards} cards`
                ) : (
                  "Only you see which deck you choose"
                )}
              </span>
            </li>
            <li className={`pa-step${readyDone ? " pa-step-done" : ""}`}>
              <span className="pa-step-key">2 · Ready{readyDone ? " ✓" : ""}</span>
              {myMember && (
                <button
                  type="button"
                  className={`pa-button pa-ready${myMember.ready ? " pa-ready-on" : ""}`}
                  aria-pressed={myMember.ready}
                  disabled={
                    busy || preparing || starting || (!myMember.ready && !myMember.selectedDeckId)
                  }
                  onClick={() => onReady(!myMember.ready)}
                >
                  {myMember.ready ? "Ready ✓" : "I'm ready"}
                </button>
              )}
              <span className="pa-step-note">
                {myMember?.ready
                  ? "Click again to undo"
                  : deckDone
                    ? "When you're set"
                    : "Choose a deck first"}
              </span>
            </li>
            <li className={`pa-step${preparing || starting ? " pa-step-done" : ""}`}>
              <span className="pa-step-key">3 · Start</span>
              {iHost ? (
                <span className="pa-start-row">
                  <button
                    type="button"
                    className={`pa-button pa-start${canStart ? " pa-button-brass" : " pa-start-dead"}`}
                    disabled={!canStart}
                    onClick={onStart}
                  >
                    {starting ? "Checking both decks…" : "Start match"}
                  </button>
                  {preparing && !starting && (
                    <button
                      type="button"
                      className="pa-button pa-button-quiet"
                      onClick={onCancelStart}
                    >
                      Cancel
                    </button>
                  )}
                </span>
              ) : (
                <span className="pa-step-wait">The host starts the game</span>
              )}
              <span className="pa-step-note">
                {preparing || starting
                  ? iHost
                    ? "Both decks are being checked, so a card that can't be played turns up now and not mid-game."
                    : "The host is starting the match: both decks are being checked."
                  : waitingFor}
              </span>
            </li>
          </ol>

          <div className="pa-room-actions">
            {iHost ? (
              <>
                {/* With the other host actions (owner, 2026-10-22): it had sat at the
                    end of the help sentence, where it read as part of the note. */}
                {guest && !preparing && !starting && (
                  <button
                    type="button"
                    className="pa-button pa-button-quiet"
                    disabled={busy}
                    onClick={() => onRemove(guest.userId)}
                  >
                    Remove {guest.displayName}
                  </button>
                )}
                <button
                  type="button"
                  className="pa-button pa-button-close"
                  disabled={busy}
                  onClick={onClose}
                >
                  Close room
                </button>
              </>
            ) : (
              <button
                type="button"
                className="pa-button pa-button-quiet"
                disabled={busy}
                onClick={onLeave}
              >
                Leave seat
              </button>
            )}
          </div>
        </>
      )}
    </article>
  );
}

// --- chat ------------------------------------------------------------------------

// --- the one dialog slot ------------------------------------------------------------

function Dialog({
  label,
  title,
  sub,
  primary,
  onPrimary,
  secondary,
  onSecondary,
  onDismiss,
}: {
  label: string;
  title: string;
  /** A line under the title, when there is more to say. */
  sub?: string;
  primary: string;
  onPrimary: () => void;
  secondary?: string;
  onSecondary?: () => void;
  /** Present when closing it is "later", not an answer. */
  onDismiss?: () => void;
}) {
  const titleId = useId();
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    returnTo.current = document.activeElement;
    primaryRef.current?.focus();
    const back = returnTo.current;
    return () => {
      if (back instanceof HTMLElement) back.focus();
    };
  }, []);

  const escape = onDismiss ?? onSecondary;
  return (
    <div className="pa-dialog-backdrop" onClick={escape}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="pa-dialog"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && escape) escape();
        }}
      >
        {onDismiss && (
          <button
            type="button"
            className="pa-dialog-close"
            aria-label="Put this aside for now"
            onClick={onDismiss}
          >
            ×
          </button>
        )}
        <div className="pa-dialog-label">{label}</div>
        <h2 id={titleId} className="pa-dialog-title">
          {title}
        </h2>
        {sub && <p className="pa-dialog-sub">{sub}</p>}
        <div className="pa-dialog-buttons">
          <button
            ref={primaryRef}
            type="button"
            className="pa-button pa-button-brass"
            onClick={onPrimary}
          >
            {primary}
          </button>
          {secondary && onSecondary && (
            <button type="button" className="pa-button pa-button-quiet" onClick={onSecondary}>
              {secondary}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
