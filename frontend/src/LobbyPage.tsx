// The Lobby — PHASE_07 §7.64, Amendments 9 and 11, over Phase 5 and 6.
//
// The canvas's Lobby: the players on the left, every open room on the
// right with the one you are in opened in place, and the lobby chat
// across the bottom. While you are in a match, Phase 6's match view
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
  MAX_CHAT_LENGTH,
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
import { clearsIn, orderRooms, playerRows, roomStateLabel, type PlayerRow } from "./lobbyView";

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
      if (!cancelled) setLibrary(next);
    });
    return () => {
      cancelled = true;
    };
  }, [setLobby]);

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
      if (result.ok) {
        setLobby((previous) => ({
          ...previous,
          room: null,
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
        {lobby.connection === "closed" && (
          // §5.133 — a page that stopped being told must say so.
          <div className="pa-notice pa-notice-bad" role="alert">
            <span aria-hidden="true" className="pa-notice-mark" />
            <span className="pa-notice-text">
              <strong>Disconnected</strong>
              <span className="pa-notice-sub">
                You are no longer receiving updates. Reload the page to reconnect — your room is
                still on the server.
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

      <div className="pa-lobby-layout">
        <PlayersPanel
          lobby={lobby}
          me={me.userId}
          onInvite={invite}
          onWithdraw={() => send({ type: "INVITE_WITHDRAW" })}
        />
        <RoomsPanel
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
          onRemove={(userId) => {
            if (room) void run(() => removeMember(room.roomId, userId, room.revision));
          }}
          onClose={() => {
            if (room) void runLeaving(() => closeRoom(room.roomId));
          }}
          onLeave={() => {
            if (room) void runLeaving(() => leaveRoom(room.roomId));
          }}
        />
      </div>

      <ChatPanel lobby={lobby} onSay={(text) => send({ type: "CHAT", text })} />

      {inviteBoxOpen && invitation && (
        <Dialog
          label="Invitation"
          title={`${invitation.from.displayName} asked you into ${invitation.roomName}`}
          sub="One seat open, waiting on you. Close this to deal with it later — the invitation waits on the room's row."
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
          sub="Nothing changed for you — you are still in the lobby. This is also what you see if you accepted a moment too late."
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
  const rows = useMemo(() => playerRows(lobby, me), [lobby, me]);
  const online = lobby.presence.filter((p) => p.userId !== me).length;
  const outgoingTo = lobby.outgoing?.to.userId ?? null;

  // Straight after Invite the pointer is still on the button, so
  // offering to undo it at once reads as a mistake: it settles first.
  const [settled, setSettled] = useState<string | null>(null);
  useEffect(() => {
    if (!outgoingTo) return undefined;
    const timer = window.setTimeout(() => setSettled(outgoingTo), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [outgoingTo]);

  return (
    <section className="pa-section pa-lobby-players" aria-labelledby="players-heading">
      <div className="pa-section-head pa-lobby-head">
        <h2 id="players-heading">Players</h2>
        <span className="pa-spacer" />
        <span className="pa-head-key">Online</span>
        <span className="pa-count" aria-label={`${online} online`}>
          {online}
        </span>
      </div>
      <ul className="pa-player-list">
        {rows.length === 0 && <li className="pa-group-empty">Nobody else has an account yet.</li>}
        {rows.map((row) => (
          <li key={row.user.userId} className="pa-player-row">
            <span className="pa-player-text">
              <span className={`pa-player-name${row.online ? "" : " pa-player-offline"}`}>
                {row.user.displayName}
              </span>
              <span className="pa-player-where">
                <span
                  aria-hidden="true"
                  className={`pa-dot ${row.online ? "pa-dot-on" : "pa-dot-off"}`}
                />
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
        ))}
      </ul>
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
      return <span className="pa-invite-spacer" />;
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

function RoomsPanel({
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
  // Re-read the clock each minute so "clears in" stays honest.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const mine = lobby.room;
  const rooms = orderRooms(lobby.rooms, mine?.roomId ?? null);
  // Your own room is drawn from the room the server sent YOU, which is
  // always at least as fresh as the list; if the list has not caught
  // up yet, it is still shown.
  const listed =
    mine && !rooms.some((r) => r.roomId === mine.roomId) ? [asListed(mine), ...rooms] : rooms;

  const open = (event: FormEvent) => {
    event.preventDefault();
    onOpen(name);
    setName("");
  };

  return (
    <section className="pa-section pa-lobby-rooms" aria-labelledby="rooms-heading">
      <div className="pa-section-head pa-lobby-head">
        <h2 id="rooms-heading">Game rooms</h2>
        <span className="pa-spacer" />
        <span className="pa-head-key">Rooms</span>
        <span className="pa-count" aria-label={`${listed.length} rooms`}>
          {listed.length}
        </span>
      </div>

      {!mine && (
        // Amendment 9 — rooms are opened on demand, and may be named.
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
      )}

      <div className="pa-room-list">
        {listed.length === 0 && (
          <p className="pa-group-empty pa-rooms-empty">
            No rooms are open. Open one, then invite somebody from the list.
          </p>
        )}
        {listed.map((listedRoom) => (
          <RoomCard
            key={listedRoom.roomId}
            listed={listedRoom}
            mine={mine?.roomId === listedRoom.roomId ? mine : null}
            lobby={lobby}
            me={me}
            now={now}
            library={library}
            busy={busy}
            starting={starting}
            onAccept={onAccept}
            onSelectDeck={onSelectDeck}
            onReady={onReady}
            onStart={onStart}
            onCancelStart={onCancelStart}
            onRemove={onRemove}
            onClose={onClose}
            onLeave={onLeave}
          />
        ))}
      </div>
    </section>
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

type SeatKind = "you" | "taken" | "open" | "asked";

function SeatPill({
  kind,
  who,
  ready,
  playing,
}: {
  kind: SeatKind;
  who: string;
  ready: boolean;
  playing: boolean;
}) {
  // Canvas notes s4, s5: the dot carries readiness, not presence.
  // Filled means settled, hollow means waiting on something — so the
  // difference never rests on telling green from red.
  const dot =
    kind === "open"
      ? "pa-dot-open"
      : kind === "asked"
        ? "pa-dot-asked"
        : playing || ready
          ? "pa-dot-ready"
          : "pa-dot-waiting";
  const state =
    kind === "open"
      ? ""
      : kind === "asked"
        ? "invited"
        : playing
          ? "playing"
          : ready
            ? "ready"
            : "not ready";
  return (
    <span className={`pa-seat pa-seat-${kind}`}>
      <span aria-hidden="true" className={`pa-dot ${dot}`} />
      <span className="pa-seat-name">{who}</span>
      {state && <span className="pa-visually-hidden">, {state}</span>}
    </span>
  );
}

function RoomCard({
  listed,
  mine,
  lobby,
  me,
  now,
  library,
  busy,
  starting,
  onAccept,
  onSelectDeck,
  onReady,
  onStart,
  onCancelStart,
  onRemove,
  onClose,
  onLeave,
}: {
  listed: DirectoryRoom;
  /** The room as the server sent it to you, when it is yours. */
  mine: RoomView | null;
  lobby: LobbyState;
  me: string;
  now: number;
  library: DeckLibrary;
  busy: boolean;
  starting: boolean;
  onAccept: (roomId: string) => void;
  onSelectDeck: (deckId: string | null) => void;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onCancelStart: () => void;
  onRemove: (userId: string) => void;
  onClose: () => void;
  onLeave: () => void;
}) {
  const headingId = useId();
  const playing = listed.status === "IN_MATCH";
  const invitedHere = lobby.invitation?.roomId === listed.roomId;
  const asked = mine && lobby.outgoing?.roomId === listed.roomId ? lobby.outgoing.to : null;
  const full = listed.seats.length >= listed.desiredPlayerCount;

  // Seats as people: yours brass, theirs plain, an open one hollow,
  // and one being held for somebody says who (or, to them, "for you").
  const seats: { key: string; kind: SeatKind; who: string; ready: boolean }[] = listed.seats.map(
    (seat) => ({
      key: seat.userId,
      kind: seat.userId === me ? "you" : "taken",
      who: seat.displayName,
      ready: seat.ready,
    }),
  );
  for (let i = listed.seats.length; i < listed.desiredPlayerCount; i++) {
    const first = i === listed.seats.length;
    if (first && asked)
      seats.push({ key: "asked", kind: "asked", who: asked.displayName, ready: false });
    else if (first && invitedHere)
      seats.push({ key: "held", kind: "asked", who: "Held for you", ready: false });
    else seats.push({ key: `open-${i}`, kind: "open", who: "Open seat", ready: false });
  }

  const clears = clearsIn(listed.clearsAt, now);

  return (
    <article
      className={`pa-room${mine ? " pa-room-mine" : ""}${invitedHere ? " pa-room-invited" : ""}`}
      aria-labelledby={headingId}
    >
      <div className="pa-room-line">
        <h3 id={headingId} className="pa-room-name">
          {listed.name}
        </h3>
        <div className="pa-room-seats">
          {seats.map((seat) => (
            <SeatPill
              key={seat.key}
              kind={seat.kind}
              who={seat.who}
              ready={seat.ready}
              playing={playing}
            />
          ))}
          <span className="pa-room-taken">
            {listed.seats.length}/{listed.desiredPlayerCount}
          </span>
        </div>
        <span className="pa-room-state">{roomStateLabel(listed)}</span>
        <div className="pa-room-clears">
          {clears && (
            <>
              <div className="pa-room-clears-key">Clears in</div>
              <div className="pa-room-clears-value">{clears}</div>
            </>
          )}
        </div>
        <div className="pa-room-action">
          {mine ? (
            <span className="pa-room-role">
              {mine.hostUserId === me ? "Your room" : "Your seat"}
            </span>
          ) : invitedHere ? (
            <button
              type="button"
              className="pa-button pa-button-accept"
              onClick={() => onAccept(listed.roomId)}
            >
              Accept
            </button>
          ) : full || playing ? (
            <span className="pa-room-note">No seats free</span>
          ) : (
            // §7.64, owner decision 19: seeing a room is not a way in.
            <span className="pa-room-note">By invitation</span>
          )}
        </div>
      </div>

      {mine && (
        <YourRoom
          room={mine}
          me={me}
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
      )}
    </article>
  );
}

/** The room you are in, opened in place: your deck, ready, and what your role may do. */
function YourRoom({
  room,
  me,
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
  me: string;
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
  const deckId = useId();
  const myMember = room.members.find((m) => m.userId === me) ?? null;
  const iHost = room.hostUserId === me;
  const preparing = room.status === "READY_FOR_MATCH";
  const playing = room.status === "IN_MATCH";
  const guest = room.members.find((m) => !m.isHost) ?? null;
  // A room left prepared but not started (a tab that died between the
  // two steps) starts from here too: Start match then only launches.
  const canStart = iHost && room.everyoneReady && !busy && !starting;
  const decks = [
    ...library.mine.map((deck) => ({ deck, shared: false })),
    ...library.sharedWithMe.map((deck) => ({ deck, shared: true })),
  ];

  if (playing) {
    return (
      <div className="pa-your-room">
        <p className="pa-your-room-note">
          The match is being played. Nothing here can change it — closing a browser is not a
          concession, and neither is leaving the room.
        </p>
      </div>
    );
  }

  return (
    <div className="pa-your-room">
      <span className="pa-your-room-key" aria-hidden="true">
        Your deck
      </span>
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
              {deck.displayName} — {deck.totalCards} cards
              {shared ? ` (shared by ${deck.ownerDisplayName})` : ""}
            </option>
          ))}
        </select>
        <svg aria-hidden="true" width="11" height="7" viewBox="0 0 11 7">
          <path d="M1 1 L5.5 5.5 L10 1" />
        </svg>
      </span>

      {myMember && (
        <button
          type="button"
          className={`pa-button pa-ready${myMember.ready ? " pa-ready-on" : ""}`}
          aria-pressed={myMember.ready}
          disabled={busy || preparing || starting || (!myMember.ready && !myMember.selectedDeckId)}
          onClick={() => onReady(!myMember.ready)}
        >
          {myMember.ready ? "You are ready" : "Mark yourself ready"}
        </button>
      )}

      <span className="pa-spacer" />

      {iHost ? (
        <>
          <button
            type="button"
            className={`pa-button pa-start${canStart ? " pa-button-brass" : " pa-start-dead"}`}
            disabled={!canStart}
            onClick={onStart}
          >
            {starting ? "Checking both decks…" : "Start match"}
          </button>
          {preparing && !starting && (
            <button type="button" className="pa-button pa-button-quiet" onClick={onCancelStart}>
              Cancel
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
        <button type="button" className="pa-small-button" disabled={busy} onClick={onLeave}>
          Leave seat
        </button>
      )}

      <p className="pa-your-room-note">
        {decks.length === 0 ? (
          <>
            No decks yet — <Link to="/decks">import one in the Deck Depot</Link>.
          </>
        ) : preparing || starting ? (
          iHost ? (
            "Both decks are being built once, so a card that cannot be played turns up now and not mid-game."
          ) : (
            "The host is starting the match: both decks are being checked."
          )
        ) : iHost && !room.everyoneReady ? (
          "Start match lights when both seats are filled and both players are ready."
        ) : (
          "Each player chooses their own deck; nobody else sees which."
        )}
        {iHost && guest && !preparing && !starting && (
          <>
            {" "}
            <button
              type="button"
              className="pa-link-button"
              disabled={busy}
              onClick={() => onRemove(guest.userId)}
            >
              Remove {guest.displayName}
            </button>
          </>
        )}
      </p>
    </div>
  );
}

// --- chat ------------------------------------------------------------------------

function ChatPanel({ lobby, onSay }: { lobby: LobbyState; onSay: (text: string) => void }) {
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement | null>(null);
  const inputId = useId();

  // The log scrolls itself, not the page: the chat sits at the bottom
  // of the Lobby, and scrolling the window to it on every line would
  // drag the rooms off screen.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [lobby.chat.length]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSay(text);
    setDraft("");
  };

  return (
    <section className="pa-chat" aria-labelledby="chat-heading">
      <div className="pa-chat-head">
        <h2 id="chat-heading">Lobby chat</h2>
      </div>
      <div className="pa-chat-log" role="log" ref={logRef}>
        {lobby.chat.length === 0 ? (
          <p className="pa-chat-empty">
            Nothing yet. One channel, kept in memory: nothing is stored and nothing survives a
            restart.
          </p>
        ) : (
          lobby.chat.map((line, index) => {
            // A run of lines from one person names them once.
            const run = index > 0 && lobby.chat[index - 1]?.fromUserId === line.fromUserId;
            return (
              <div key={line.id} className={`pa-chat-line${run ? " pa-chat-run" : ""}`}>
                <span className="pa-chat-meta">
                  <span className="pa-chat-at">{timeOf(line.sentAt)}</span>
                  <span className={`pa-chat-who${run ? " pa-visually-hidden" : ""}`}>
                    {line.displayName}
                  </span>
                </span>
                {/* React escapes this (AMENDMENT 3's "escaped"), and the
                    CSP forbids inline script behind it. */}
                <span className="pa-chat-text">{line.text}</span>
              </div>
            );
          })
        )}
      </div>
      <form className="pa-chat-form" onSubmit={submit}>
        <label className="pa-visually-hidden" htmlFor={inputId}>
          Message the lobby
        </label>
        <input
          id={inputId}
          className="pa-input"
          value={draft}
          maxLength={MAX_CHAT_LENGTH}
          placeholder="Say something to the lobby"
          autoComplete="off"
          onChange={(event) => setDraft(event.target.value)}
        />
        {/* Not before the socket is open: a send while connecting is
            lost without a word. CI caught a fast click doing it. */}
        <button
          type="submit"
          className="pa-button"
          disabled={draft.trim().length === 0 || lobby.connection !== "open"}
        >
          Send
        </button>
      </form>
    </section>
  );
}

function timeOf(sentAt: string): string {
  const at = new Date(sentAt);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

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
  sub: string;
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
        <p className="pa-dialog-sub">{sub}</p>
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
