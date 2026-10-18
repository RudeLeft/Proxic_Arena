// The lobby — PHASE_05 AMENDMENT 4, §5.151–§5.160.
//
// ONE page: presence and chat, a button to host, the room, and the
// Deck Depot inline for picking a deck. Amendment 4 replaced a
// layout built around displaying and entering a room code, because
// amendment 1 deleted the codes.
//
// §5.132 is the rule that shapes every handler here: the page does
// not predict. It never edits a room locally, never flips a ready
// flag before the server agrees, never removes a member from its
// own list. Every action sends a request and waits for the ROOM
// message. An optimistic lobby is how two players end up looking at
// two different truths.
//
// §5.141 governs what is rendered about other people: name, seat,
// ready, and whether a deck is chosen — by NAME, never contents.

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { EMPTY_LIBRARY, listDecks, type DeckLibrary, type DeckSummary } from "./decks";
import { EMPTY_MATCH, connectMatch, type MatchSocket, type MatchState } from "./match";
import {
  EMPTY_LOBBY,
  MAX_CHAT_LENGTH,
  cancelPreparation,
  closeRoom,
  connectLobby,
  createRoom,
  abandonMatch,
  fetchCurrentMatch,
  fetchCurrentRoom,
  fetchMatchSetupId,
  launchMatch,
  leaveRoom,
  prepareMatch,
  removeMember,
  selectDeck,
  setReady,
  type LobbySocket,
  type LobbyState,
  type MatchView,
  type RoomMemberView,
  type RoomResult,
  type RoomView,
} from "./lobby";

function lobbyUrl(): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/ws/user`;
}

export default function LobbyPage() {
  const { state: auth } = useAuth();
  const me = auth.status === "authenticated" ? auth.user : null;

  const [lobby, setLobby] = useState<LobbyState>(EMPTY_LOBBY);
  const [library, setLibrary] = useState<DeckLibrary>(EMPTY_LIBRARY);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const socketRef = useRef<LobbySocket | null>(null);

  // §5.119 — a refresh should land you back in the room, not
  // outside it. Asked over HTTP as well as awaited on the socket,
  // because the socket only tells you once and this page may have
  // been opened long after that.
  useEffect(() => {
    let cancelled = false;
    void fetchCurrentRoom().then((room) => {
      if (cancelled || !room) return;
      setLobby((previous) =>
        // Not if the socket already delivered something newer.
        previous.room && previous.room.revision >= room.revision ? previous : { ...previous, room },
      );
    });
    // §6.114 — and back into the MATCH, for the same reason. A
    // page reloaded mid-game that showed a lobby would be telling
    // the player they are not in the game they are in.
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
  }, []);

  /**
   * Leaving and closing: the room is no longer YOURS.
   *
   * These cannot go through `run`, and the reason is subtle enough
   * that it shipped. The server answers both with the room AS IT
   * NOW IS — correct, because the other members need it — but the
   * caller has just stopped being a member. Adopting that response
   * left the page showing "Your game" for a room the player had
   * left, until they refreshed.
   *
   * The socket does not rescue it either: a leave is announced to
   * the REMAINING members, and the leaver is not one. Closing
   * happens to work only because the closer is still in the
   * notified list, and even then the HTTP response can land after
   * ROOM_CLOSED and put the dead room back.
   *
   * So this is explicit: whatever the server says about the room,
   * my view of it is now empty. Reported by the owner, who had to
   * refresh to get "Host a game" back.
   */
  const runLeaving = useCallback(async (call: () => Promise<RoomResult>) => {
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
  }, []);

  /**
   * §6.10 — start the match the host already prepared.
   *
   * Two calls, because the launch takes a SETUP id and the page
   * holds a room. Deliberately not cached from the prepare: see
   * fetchMatchSetupId.
   *
   * Nothing optimistic happens here either. The 201 carries the
   * match in LAUNCHING, and RUNNING arrives on the socket seconds
   * later when Forge is up — which is the whole reason the MATCH
   * message exists.
   */
  const launch = useCallback(async (roomId: string) => {
    setBusy(true);
    setFailure(null);
    const setupId = await fetchMatchSetupId(roomId);
    if (!setupId) {
      setBusy(false);
      setFailure("That match is no longer prepared. Prepare it again.");
      return;
    }
    const result = await launchMatch(setupId);
    setBusy(false);
    if (result.ok) {
      setLobby((previous) => ({ ...previous, match: result.match, notice: null }));
    } else {
      setFailure(result.failure.detail);
    }
  }, []);

  useEffect(() => {
    const socket = connectLobby(lobbyUrl(), setLobby);
    socketRef.current = socket;
    return () => {
      socketRef.current = null;
      socket.close();
    };
  }, []);

  const room = lobby.room;
  const myMember = useMemo(
    () => (me ? (room?.members.find((m) => m.userId === me.userId) ?? null) : null),
    [room, me],
  );
  const iAmHost = Boolean(me && room && room.hostUserId === me.userId);
  const prepared = room?.status === "READY_FOR_MATCH";
  /**
   * §6.152 — while a match is on, the lobby does nothing.
   *
   * Not just a hidden button. Every room mutation is refused by
   * the server for this status, because a browser action must not
   * end somebody else's game. This is the page agreeing with that
   * rather than offering controls that come back as refusals.
   */
  const inMatch = room?.status === "IN_MATCH";

  /** One place where every room call reports its refusal. */
  const run = useCallback(async (call: () => Promise<RoomResult>) => {
    setBusy(true);
    setFailure(null);
    const result = await call();
    setBusy(false);
    if (result.ok) {
      // §5.132 — the server's room, not a guess at it. The socket
      // will send the same thing to everyone else.
      setLobby((previous) => ({
        ...previous,
        room: result.room,
        setupProblem: null,
        notice: null,
      }));
    } else {
      setFailure(result.failure.detail);
    }
  }, []);

  const send = useCallback((message: Record<string, unknown>) => {
    socketRef.current?.send(message);
  }, []);

  /**
   * Declining clears the prompt here as well as on the server.
   *
   * Not a breach of §5.132. That rule forbids predicting what the
   * SERVER will say about a room; an invitation is a prompt this
   * page owns, and the server answers a decline with nothing at
   * all. Without this the banner stayed on screen after the click,
   * which an end-to-end test caught on the first run.
   */
  const decline = useCallback(() => {
    send({ type: "INVITE_DECLINE" });
    setLobby((previous) => ({ ...previous, invitation: null }));
  }, [send]);

  if (!me) return null;

  return (
    <main className="lobby">
      <h1>PROXIC ARENA</h1>
      <p className="sub">Lobby</p>

      {lobby.connection === "closed" && (
        // §5.133 — a page that stopped being told must say so,
        // rather than showing a lobby that looks live.
        <section className="panel error">
          <h2>Disconnected</h2>
          <p>
            You are no longer receiving updates. Reload the page to reconnect — your room is still
            on the server.
          </p>
        </section>
      )}

      {lobby.notice && (
        // Dismissible, because nothing else reliably clears it. A
        // notice is cleared when a ROOM arrives, so "The host
        // closed the room." sat on the page indefinitely for
        // anybody who did not immediately host another one.
        <section className={lobby.notice.kind === "error" ? "panel error" : "panel"}>
          <p>{lobby.notice.detail}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => setLobby((previous) => ({ ...previous, notice: null }))}
          >
            Dismiss
          </button>
        </section>
      )}

      {failure && (
        <section className="panel error">
          <p className="error-text">{failure}</p>
        </section>
      )}

      {lobby.invitation && !room && (
        <section className="panel invitation">
          <h2>{lobby.invitation.from.displayName} invited you to a game</h2>
          <div className="actions">
            <button
              type="button"
              onClick={() => send({ type: "INVITE_ACCEPT", roomId: lobby.invitation?.roomId })}
            >
              Accept
            </button>
            <button type="button" className="secondary" onClick={decline}>
              Decline
            </button>
          </div>
        </section>
      )}

      <div className="lobby-columns">
        <div className="lobby-side">
          <PresencePanel
            lobby={lobby}
            myUserId={me.userId}
            canInvite={iAmHost && !prepared && !inMatch && !isFull(room)}
            onInvite={(userId) => send({ type: "INVITE", userId })}
          />
          <ChatPanel lobby={lobby} onSay={(text) => send({ type: "CHAT", text })} />
        </div>

        <div className="lobby-main">
          {lobby.match && <MatchPanel match={lobby.match} me={me.userId} />}

          {room ? (
            <RoomPanel
              room={room}
              me={me.userId}
              iAmHost={iAmHost}
              busy={busy}
              onLeave={() => void runLeaving(() => leaveRoom(room.roomId))}
              onClose={() => void runLeaving(() => closeRoom(room.roomId))}
              onRemove={(userId) =>
                void run(() => removeMember(room.roomId, userId, room.revision))
              }
              onReady={(ready) => void run(() => setReady(room.roomId, ready, room.revision))}
              onPrepare={() => void run(() => prepareMatch(room.roomId, room.revision))}
              onCancelPreparation={() => void run(() => cancelPreparation(room.roomId))}
              onLaunch={() => void launch(room.roomId)}
              launched={lobby.match !== null}
              inMatch={inMatch}
            />
          ) : (
            <section className="panel">
              <h2>No game yet</h2>
              <p className="hint">
                Host a game, then invite somebody from the list. There is no public games list and
                no join code — an invitation is the only way in.
              </p>
              <button type="button" disabled={busy} onClick={() => void run(createRoom)}>
                Host a game
              </button>
            </section>
          )}

          {lobby.setupProblem && (
            // §5.100 — about YOUR deck, sent only to you.
            <section className="panel error">
              <h2>Your deck needs attention</h2>
              <p className="error-text">{lobby.setupProblem.detail}</p>
            </section>
          )}

          <DeckPanel
            library={library}
            selectedDeckId={myMember?.selectedDeckId ?? null}
            disabled={!room || prepared || busy}
            inRoom={Boolean(room)}
            onSelect={(deckId) => {
              if (!room) return;
              void run(() => selectDeck(room.roomId, deckId, room.revision));
            }}
          />
        </div>
      </div>

      {/* A page with no way off it is a dead end. The lobby is the
          one place a player will sit for a while, so it says where
          else they can go. */}
      <p className="verdict">
        <Link to="/decks">Deck Depot</Link> · <a href="/">Server status</a>
      </p>
    </main>
  );
}

function isFull(room: RoomView | null): boolean {
  return room !== null && room.members.length >= room.desiredPlayerCount;
}

// --- presence ---------------------------------------------------------------

function PresencePanel({
  lobby,
  myUserId,
  canInvite,
  onInvite,
}: {
  lobby: LobbyState;
  myUserId: string;
  canInvite: boolean;
  onInvite: (userId: string) => void;
}) {
  return (
    <section className="panel" aria-label="Who is here">
      <h2>Who is here</h2>
      {lobby.presence.length === 0 ? (
        <p className="hint">Nobody else is signed in.</p>
      ) : (
        <ul className="presence">
          {lobby.presence.map((user) => (
            <li key={user.userId} className="row">
              <span className="name">
                {user.displayName}
                {user.userId === myUserId && <span className="hint"> (you)</span>}
              </span>
              {canInvite && user.userId !== myUserId && (
                <button type="button" className="small" onClick={() => onInvite(user.userId)}>
                  Invite
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {/* AMENDMENT 2 kept this narrow deliberately, so the page
          should not imply more. */}
      <p className="hint">Signed in right now. Not a friends list and not a list of games.</p>
    </section>
  );
}

// --- chat --------------------------------------------------------------------

function ChatPanel({ lobby, onSay }: { lobby: LobbyState; onSay: (text: string) => void }) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lobby.chat.length]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSay(text);
    setDraft("");
  };

  return (
    <section className="panel" aria-label="Chat">
      <h2>Chat</h2>
      <div className="chat-log" role="log">
        {lobby.chat.length === 0 ? (
          <p className="hint">Nothing yet.</p>
        ) : (
          lobby.chat.map((line) => (
            <p key={line.id} className="chat-line">
              {/* React escapes this. AMENDMENT 3 lists "escaped" as
                  one of the bounds, and the CSP forbids inline
                  script as the second line of defence. */}
              <span className="chat-who">{line.displayName}</span> {line.text}
            </p>
          ))
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit}>
        <label htmlFor="chat-input">Say something</label>
        <input
          id="chat-input"
          value={draft}
          maxLength={MAX_CHAT_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Shall we?"
          autoComplete="off"
        />
        <button type="submit" disabled={draft.trim().length === 0}>
          Send
        </button>
      </form>
      <p className="hint">
        One channel, kept in memory. Nothing is stored and nothing survives a restart.
      </p>
    </section>
  );
}

// --- the room ------------------------------------------------------------------

function RoomPanel({
  room,
  me,
  iAmHost,
  busy,
  onLeave,
  onClose,
  onRemove,
  onReady,
  onPrepare,
  onCancelPreparation,
  onLaunch,
  launched,
  inMatch,
}: {
  room: RoomView;
  me: string;
  iAmHost: boolean;
  busy: boolean;
  onLeave: () => void;
  onClose: () => void;
  onRemove: (userId: string) => void;
  onReady: (ready: boolean) => void;
  onPrepare: () => void;
  onCancelPreparation: () => void;
  onLaunch: () => void;
  /** A match already exists for this room, so there is nothing to start. */
  launched: boolean;
  /** The room is playing a match, and the lobby is not in charge. */
  inMatch: boolean;
}) {
  const myMember = room.members.find((m) => m.userId === me);
  const prepared = room.status === "READY_FOR_MATCH";

  return (
    <section className="panel" aria-label="Your game">
      <h2>Your game</h2>

      <div className="row">
        <span className="name">Format</span>
        <span className="state">Open Format · {room.desiredPlayerCount} players</span>
      </div>
      <div className="row">
        <span className="name">Seats filled</span>
        <span className="state">
          {room.members.length} of {room.desiredPlayerCount}
        </span>
      </div>

      <ul className="seats">
        {room.members.map((member) => (
          <Seat
            key={member.userId}
            member={member}
            isMe={member.userId === me}
            canRemove={iAmHost && !prepared && !inMatch && !member.isHost}
            busy={busy}
            onRemove={() => onRemove(member.userId)}
          />
        ))}
        {/* An empty seat is shown, because "waiting for somebody"
            is the room's actual state and a list of one looks
            like a bug. */}
        {Array.from({ length: Math.max(0, room.desiredPlayerCount - room.members.length) }).map(
          (_, index) => (
            <li key={`empty-${index}`} className="row seat empty">
              <span className="name">Empty seat</span>
              <span className="state">waiting for an invitation</span>
            </li>
          ),
        )}
      </ul>

      {prepared && !launched && (
        <p className="hint">
          The match is prepared and the room is locked. Starting it hands the decks to Forge.
        </p>
      )}

      {inMatch && (
        <p className="hint">
          The match is being played. Nothing here can change it — closing a browser is not a
          concession, and neither is leaving the room.
        </p>
      )}

      <div className="actions">
        {myMember && !prepared && !inMatch && (
          <button
            type="button"
            disabled={busy || (!myMember.ready && !myMember.selectedDeckId)}
            onClick={() => onReady(!myMember.ready)}
          >
            {myMember.ready ? "Not ready" : "Ready"}
          </button>
        )}

        {iAmHost && !prepared && !inMatch && (
          <button
            type="button"
            disabled={busy || !room.everyoneReady}
            onClick={onPrepare}
            title={room.everyoneReady ? undefined : "Everyone needs a deck and a tick first"}
          >
            Prepare match
          </button>
        )}

        {iAmHost && prepared && !launched && !inMatch && (
          <button type="button" disabled={busy} onClick={onLaunch}>
            Start match
          </button>
        )}

        {iAmHost && prepared && !launched && !inMatch && (
          <button type="button" className="secondary" disabled={busy} onClick={onCancelPreparation}>
            Cancel preparation
          </button>
        )}

        {inMatch ? null : iAmHost ? (
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>
            Close room
          </button>
        ) : (
          <button type="button" className="secondary" disabled={busy} onClick={onLeave}>
            Leave room
          </button>
        )}
      </div>

      {myMember && !myMember.selectedDeckId && !prepared && (
        <p className="hint">Choose a deck below before you can mark yourself ready.</p>
      )}
    </section>
  );
}

/** §5.46, §5.47 — the most the viewer is entitled to. */
function deckLabel(member: RoomMemberView, isMe: boolean): string {
  if (!member.deckSelected) return "no deck yet";
  if (isMe) return member.selectedDeckName ?? "deck chosen";
  return "deck chosen";
}

function Seat({
  member,
  isMe,
  canRemove,
  busy,
  onRemove,
}: {
  member: RoomMemberView;
  isMe: boolean;
  canRemove: boolean;
  busy: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="row seat">
      <span className="name">
        Seat {member.seatNumber}: {member.displayName}
        {member.isHost && <span className="hint"> (host)</span>}
        {isMe && <span className="hint"> (you)</span>}
      </span>
      <span className="state">
        {/* §5.47 — your own deck by name, everybody else's as a
            fact. The server does not send an opponent's deck name
            at all, so this is what the page CAN render, not a
            policy it is choosing. */}
        {deckLabel(member, isMe)}
        {member.ready ? " · ready" : " · not ready"}
      </span>
      {canRemove && (
        <button type="button" className="small secondary" disabled={busy} onClick={onRemove}>
          Remove
        </button>
      )}
    </li>
  );
}

// --- decks, inline ----------------------------------------------------------------

function DeckPanel({
  library,
  selectedDeckId,
  disabled,
  inRoom,
  onSelect,
}: {
  library: DeckLibrary;
  selectedDeckId: string | null;
  disabled: boolean;
  inRoom: boolean;
  onSelect: (deckId: string | null) => void;
}) {
  const everything: { deck: DeckSummary; shared: boolean }[] = [
    ...library.mine.map((deck) => ({ deck, shared: false })),
    ...library.sharedWithMe.map((deck) => ({ deck, shared: true })),
  ];

  return (
    <section className="panel" aria-label="My decks">
      <h2>My decks</h2>
      {everything.length === 0 ? (
        <p className="hint">
          No decks yet. <Link to="/decks">Import one from Deck Builder</Link>.
        </p>
      ) : (
        <ul className="deck-choices">
          {everything.map(({ deck, shared }) => (
            <li key={deck.deckId} className="row">
              <span className="name">
                {deck.displayName}
                {/* §4.59 — a shared deck says whose it is. */}
                {shared && <span className="hint"> · shared by {deck.ownerDisplayName}</span>}
              </span>
              <span className="state">{deck.totalCards} cards</span>
              <button
                type="button"
                className="small"
                disabled={disabled || deck.deckId === selectedDeckId}
                onClick={() => onSelect(deck.deckId)}
              >
                {deck.deckId === selectedDeckId ? "Selected" : "Use this deck"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!inRoom && <p className="hint">Host or join a game to choose a deck.</p>}
      {/* §5.44 — there is no control for choosing somebody else's
          deck because the endpoint cannot express it. Saying so
          saves a host looking for one. */}
      {inRoom && <p className="hint">Each player chooses their own deck.</p>}
    </section>
  );
}

/**
 * What the lobby shows about a live match — PHASE_06 §6.17.
 *
 * Deliberately thin. The board, the hand and the decisions are the
 * next slice; what this has to do today is stop the page claiming
 * a player is sitting in a lobby when they are in a game, and
 * change by itself when LAUNCHING becomes RUNNING. Those two are
 * the refresh-free requirement, and they are testable now.
 */
function MatchPanel({ match, me }: { match: MatchView; me: string }) {
  const mine = match.participants.find((seat) => seat.userId === me);
  const [game, setGame] = useState<MatchState>(EMPTY_MATCH);
  const socketRef = useRef<MatchSocket | null>(null);
  const running = match.status === "RUNNING";
  const [confirmingAbandon, setConfirmingAbandon] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [abandonFailure, setAbandonFailure] = useState<string | null>(null);
  const finished = match.outcome !== null || match.status === "FAILED_RUNTIME";

  // §6.107 — the match socket, open only once there is a game to
  // connect to. Keyed on the match id so a second match opens a
  // second connection rather than quietly reusing the first.
  useEffect(() => {
    if (!running) return undefined;
    setGame(EMPTY_MATCH);
    const socket = connectMatch(matchUrl(match.matchId), (apply) => setGame(apply));
    socketRef.current = socket;
    return () => {
      socketRef.current = null;
      socket.close();
    };
  }, [match.matchId, running]);

  /**
   * §6.162 — the escape hatch.
   *
   * Nothing optimistic happens: the page does not clear the
   * match, because the SERVER decides whether the match ended
   * and the MATCH message is what says so. A page that cleared
   * it locally on a request that was refused would show a lobby
   * for a game still running.
   */
  const abandon = async () => {
    setAbandoning(true);
    setAbandonFailure(null);
    const result = await abandonMatch(match.matchId);
    setAbandoning(false);
    setConfirmingAbandon(false);
    if (!result.ok) setAbandonFailure(result.failure.detail);
  };

  const answer = (actionId: string | null) => {
    const decision = game.decision;
    if (!decision) return;
    // §6.132's shape, carried here: the page does not predict.
    // The question stays on screen until the SERVER says it was
    // taken, because a refusal has to put the player back where
    // they were rather than in front of an empty game.
    setGame((previous) => ({ ...previous, awaiting: decision.decisionId, notice: null }));
    socketRef.current?.answer(decision.decisionId, actionId);
  };

  return (
    <section className="panel" aria-label="Your match">
      <h2>Your match</h2>
      <p>
        {finished
          ? resultText(match, mine?.seatNumber ?? null)
          : match.status === "LAUNCHING"
            ? "Starting the game. Forge is loading — this takes a few seconds."
            : "The game is running."}
      </p>
      {mine?.deckName && (
        // §5.47 into §6: your own deck by name. The server sends
        // nobody else's, so there is nothing here to leak.
        <p className="hint">You are playing {mine.deckName}.</p>
      )}
      <p className="hint">
        Seat {mine ? mine.seatNumber : "?"} of {match.participants.length}.
      </p>

      {running && game.connection === "closed" && (
        // §5.133's rule for the game: a page that stopped being
        // told must say so rather than showing a live-looking
        // game. The decision is still pending on the server
        // (§6.112) — nothing passed on this player's behalf.
        <p className="error-text">
          You are no longer connected to the game. Reload the page — the game is still running and
          nothing has been answered for you.
        </p>
      )}

      {game.notice && <p className="error-text">{game.notice}</p>}
      {abandonFailure && <p className="error-text">{abandonFailure}</p>}

      {(running || match.status === "LAUNCHING") &&
        (confirmingAbandon ? (
          <div className="actions">
            {/* Said plainly, because it ends the game for BOTH
                players and there is no undo. §6.153 is why it
                can say "nobody wins": an abandoned match records
                no winner at all. */}
            <p className="error-text">
              End this match for both players? Nobody wins it, and it cannot be resumed.
            </p>
            <button type="button" disabled={abandoning} onClick={() => void abandon()}>
              Yes, abandon the match
            </button>
            <button
              type="button"
              className="secondary"
              disabled={abandoning}
              onClick={() => setConfirmingAbandon(false)}
            >
              Keep playing
            </button>
          </div>
        ) : (
          <div className="actions">
            <button type="button" className="secondary" onClick={() => setConfirmingAbandon(true)}>
              Abandon match
            </button>
          </div>
        ))}

      {game.decision ? (
        <div className="decision">
          <h3>
            {game.decision.actedForSeat === mine?.seatNumber
              ? headingFor(game.decision.kind)
              : `Playing for seat ${game.decision.actedForSeat}`}
          </h3>
          <ul className="actions-list">
            {game.decision.options.map((option) => (
              <li key={option.actionId}>
                <button
                  type="button"
                  disabled={game.awaiting !== null}
                  onClick={() => answer(option.actionId)}
                >
                  {option.label ?? option.actionId}
                </button>
              </li>
            ))}
          </ul>
          {/* No Pass when the rules do not allow one. Offering a
              button that is always refused is worse than offering
              nothing: it reads as the game being broken. */}
          {!game.decision.mandatory && (
            <button
              type="button"
              className="secondary"
              disabled={game.awaiting !== null}
              onClick={() => answer(null)}
            >
              Pass
            </button>
          )}
          {/* §6.50 — this list is FORGE's. The page does not add
              to it, remove from it or reorder it, because an
              option Forge offered and a browser hid is a rules
              disagreement the player cannot see. */}
          <p className="hint">{hintFor(game.decision.kind, game.decision.options.length)}</p>
        </div>
      ) : (
        running && <p className="hint">Waiting for the game.</p>
      )}
    </section>
  );
}

/**
 * §6.149 — FORGE decided this, and the page only reads it.
 *
 * Nothing here looks at life totals, connections or who left.
 * The winner is a SEAT the server sent; turning it into "you" or
 * a name is the only interpretation allowed, and it uses the
 * participant list the page already holds.
 */
function resultText(match: MatchView, mySeat: number | null): string {
  if (match.status === "FAILED_RUNTIME" || match.outcome?.kind === "FAILED") {
    // §6.154 — not a loss for anybody. A match that stopped is a
    // fault, and recording a winner for it would be a lie.
    return "The game stopped before it finished. Nobody won it.";
  }
  const outcome = match.outcome;
  if (!outcome) return "The game is over.";

  const turn = outcome.endedOnTurn > 0 ? ` on turn ${outcome.endedOnTurn}` : "";
  if (outcome.kind === "DRAW") return `The game was a draw${turn}.`;
  if (outcome.kind !== "WINNER" || outcome.winningSeat === null) {
    return `The game ended without a result${turn}.`;
  }
  if (outcome.winningSeat === mySeat) return `You won${turn}.`;

  // The match participant list carries seats, not names (§5.47
  // keeps other people's decks out of it, and names were never
  // needed before). With two seats "your opponent" is exact; with
  // more it would not be, so the seat is named instead. FMT-005
  // keeps that case representable even though Open Format is two.
  return match.participants.length === 2
    ? `Your opponent won${turn}.`
    : `Seat ${outcome.winningSeat} won${turn}.`;
}

/**
 * What Forge is asking, in the player's words.
 *
 * Found by LOOKING at it (AGENTS TEST-011): a target choice was
 * headed "Your move" and footed "These are the actions Forge
 * says you can take", so a list of two player names read as a
 * list of things to do. The decision's kind was already in the
 * protocol and simply was not used.
 *
 * An unknown kind falls back to the general wording rather than
 * showing the raw name: a newer server asking something this
 * build has never heard of should still be answerable.
 */
function headingFor(kind: string): string {
  switch (kind) {
    case "chooseTargetsFor":
      return "Choose a target";
    case "getAbilityToPlay":
      return "Choose which ability";
    case "chooseManaAbility":
      return "Choose which mana to make";
    case "applyManaToCost":
      return "Tap something for mana";
    case "chooseCardsToDiscardToMaximumHandSize":
      return "Discard a card";
    default:
      return "Your move";
  }
}

function hintFor(kind: string, options: number): string {
  if (options === 0) {
    return "Forge is not offering any action right now; passing is the only answer.";
  }
  switch (kind) {
    case "chooseTargetsFor":
      // §6.93 — the candidates are Forge's, and saying so is not
      // decoration: it is why an option that looks wrong is not
      // a bug in the page.
      return "These are the legal targets Forge allows. Pass to cancel instead.";
    case "getAbilityToPlay":
      return "That card can do more than one thing. Pass to cancel instead.";
    case "applyManaToCost":
    case "chooseManaAbility":
      // The label carries what is still owed, so the hint says
      // what the choice IS rather than repeating it.
      return "Choose what to tap. Pass to cancel the whole thing.";
    case "chooseCardsToDiscardToMaximumHandSize":
      return "You are over your maximum hand size. This cannot be skipped.";
    default:
      return "These are the actions Forge says you can take.";
  }
}

function matchUrl(matchId: string): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/ws/matches/${matchId}`;
}
