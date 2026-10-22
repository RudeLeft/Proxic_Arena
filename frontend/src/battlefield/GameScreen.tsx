// The game screen — PHASE_07 §7.60, over the board (Parts II-V).
//
// During a match the battlefield takes the whole window: the board, the
// right-hand column (both players, the stack, the act button), the turn
// and step along the top, and whatever Forge is asking. It replaces
// Phase 6's text match panel; the questions are the same questions, the
// answers the same server-issued actionIds (§7.24).
//
// Nothing here decides a rule. The board draws the snapshot (§7.34); a
// click becomes an answer only through interaction.ts's rules over the
// options Forge sent; what a viewer may not see was never sent (§7.45).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import logo from "../assets/logo-header.webp";
import { useLobbyConnection } from "../shell/LobbyConnection";
import {
  EMPTY_MATCH,
  concessionText,
  connectMatch,
  type DecisionOption,
  type MatchSocket,
  type MatchState,
  type Snapshot,
  type SnapshotCard,
  type SnapshotPlayer,
} from "../match";
import { abandonMatch, type MatchView } from "../lobby";
import { NameSearch, headingFor, hintFor, matchUrl, resultText } from "../matchText";
import { Board } from "./Board";
import { boardFromSnapshot } from "./fromSnapshot";
import { clickOn, questionOf, type Question } from "./interaction";
import { LoadingRing } from "./LoadingRing";
import { ManaCost, costChange, withSymbols } from "./ManaCost";
import { STOP_STEPS, fetchStops, passWords, saveStops, type StopSettings } from "./stops";
import "./game.css";

/** The canvas's eight steps; Forge's phase names fold into them. */
const STEPS: { label: string; phases: string[] }[] = [
  { label: "Untap", phases: ["UNTAP"] },
  { label: "Upkeep", phases: ["UPKEEP"] },
  { label: "Draw", phases: ["DRAW"] },
  { label: "Main 1", phases: ["MAIN1"] },
  {
    label: "Combat",
    phases: [
      "COMBAT_BEGIN",
      "COMBAT_DECLARE_ATTACKERS",
      "COMBAT_DECLARE_BLOCKERS",
      "COMBAT_FIRST_STRIKE_DAMAGE",
      "COMBAT_DAMAGE",
      "COMBAT_END",
    ],
  },
  { label: "Main 2", phases: ["MAIN2"] },
  { label: "End", phases: ["END_OF_TURN"] },
  { label: "Cleanup", phases: ["CLEANUP"] },
];

/** A notice stays this long, then fades: the board is the record (§7.57). */
const NOTICE_MS = 7000;

export function GameScreen({
  match,
  me,
  onLeave,
}: {
  match: MatchView;
  me: string;
  /** Back to the lobby, once the game is over. */
  onLeave: () => void;
}) {
  const mine = match.participants.find((seat) => seat.userId === me);
  const [game, setGame] = useState<MatchState>(EMPTY_MATCH);
  const socketRef = useRef<MatchSocket | null>(null);
  // LAUNCHING counts as live: the mulligans come before the match row
  // turns RUNNING (Phase 6's three-layer deadlock).
  const live = match.status === "RUNNING" || match.status === "LAUNCHING";
  const finished = match.outcome !== null || match.status === "FAILED_RUNTIME";

  useEffect(() => {
    if (!live) return undefined;
    setGame(EMPTY_MATCH);
    const socket = connectMatch(matchUrl(match.matchId), (apply) => setGame(apply));
    socketRef.current = socket;
    return () => {
      socketRef.current = null;
      socket.close();
    };
  }, [match.matchId, live]);

  // The snapshot before this one, for where arriving cards came from.
  const frames = useRef<{ current: Snapshot | null; previous: Snapshot | null }>({
    current: null,
    previous: null,
  });
  const board = game.board;
  if (board && board !== frames.current.current) {
    frames.current = { current: board, previous: frames.current.current };
  }
  const data = useMemo(
    () => (board ? boardFromSnapshot(board, frames.current.previous) : null),
    [board],
  );

  // Everything the board draws that an option may name.
  const visible = useMemo(() => {
    const ids = new Set<string>();
    if (!board) return ids;
    for (const card of [...board.battlefield, ...board.hand]) ids.add(card.id);
    for (const entry of board.stack) ids.add(entry.id);
    for (const player of board.players) ids.add(`player:${player.seat}`);
    return ids;
  }, [board]);

  const decision = finished ? null : game.decision;
  const question = useMemo(
    () => (decision ? questionOf(decision, visible) : null),
    [decision, visible],
  );
  const choosable = useMemo(() => new Set(question?.onBoard.keys() ?? []), [question]);
  // Owner 2026-10-21: what each hand card's cast costs right now -- Forge
  // says, on the options of the question you are asked; the first spell
  // option of a card is its ordinary cast.
  const handCosts = useMemo(() => {
    const costs = new Map<string, string>();
    for (const option of decision?.options ?? []) {
      if (option.cost && option.objectId && !costs.has(option.objectId)) {
        costs.set(option.objectId, option.cost);
      }
    }
    return costs;
  }, [decision]);
  const unpayable = useMemo(() => {
    const dim = new Set<string>();
    for (const [id, options] of question?.onBoard ?? []) {
      if (options.every((o) => !o.payable)) dim.add(id);
    }
    return dim;
  }, [question]);

  const [selected, setSelected] = useState<string | null>(null);
  const [offer, setOffer] = useState<DecisionOption[] | null>(null);
  // B7 (owner 2026-10-21): a card clicked that cannot act now says why,
  // briefly, beside it -- not a window.
  const [why, setWhy] = useState<{ objectId: string; text: string } | null>(null);
  useEffect(() => {
    if (!why) return undefined;
    const timer = window.setTimeout(() => setWhy(null), WHY_MS);
    return () => window.clearTimeout(timer);
  }, [why]);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{
    seat: number;
    zone: "graveyard" | "exile" | "hand";
  } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  // The chat icon flashes when somebody ELSE says something while the
  // chat is closed (owner 2026-10-21). By the line's id, not a count: the
  // log keeps only the latest lines, so its length stops growing.
  const { lobby } = useLobbyConnection();
  const latestFromOthers = useMemo(() => {
    for (let i = lobby.chat.length - 1; i >= 0; i--) {
      if (lobby.chat[i]!.fromUserId !== me) return lobby.chat[i]!.id;
    }
    return null;
  }, [lobby.chat, me]);
  const [chatSeen, setChatSeen] = useState(latestFromOthers);
  useEffect(() => {
    if (chatOpen) setChatSeen(latestFromOthers);
  }, [chatOpen, latestFromOthers]);
  const unread = !chatOpen && latestFromOthers !== chatSeen;
  const [listOpen, setListOpen] = useState(false);

  // A new question (or none) clears what the last one had picked.
  useEffect(() => {
    setSelected(null);
    setOffer(null);
    setListOpen(false);
  }, [decision?.decisionId]);

  const answer = useCallback(
    (actionId: string | null) => {
      if (!decision) return;
      // §6.132: the question stays on screen until the server says it was
      // taken; a refusal puts the player back where they were.
      setGame((previous) => ({ ...previous, awaiting: decision.decisionId, notice: null }));
      setSelected(null);
      setOffer(null);
      socketRef.current?.answer(decision.decisionId, actionId);
    },
    [decision],
  );

  const pick = useCallback(
    (objectId: string) => {
      const result = clickOn(question, objectId);
      const reason = result.kind === "select" ? decision?.unavailable[objectId] : undefined;
      setWhy(reason ? { objectId, text: reason } : null);
      if (result.kind === "answer") {
        answer(result.actionId);
        return;
      }
      // A card with nothing to do is only highlighted: no window
      // (AMENDMENT 12). Right-click is the close look (§7.30).
      setSelected(objectId);
      setOffer(result.kind === "offer" ? result.options : null);
    },
    [question, answer, decision],
  );

  // Esc backs out of a target, a payment or an ability choice (owner
  // 2026-10-22), unless a window of its own is open and takes Esc first.
  const cancellable =
    !!decision &&
    !!question &&
    CANCEL_KINDS.has(decision.kind) &&
    question.canPass &&
    game.awaiting === null;
  useEffect(() => {
    if (!cancellable || offer || inspecting || viewer) return undefined;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      answer(null);
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [cancellable, offer, inspecting, viewer, answer]);

  const decisionId = decision?.decisionId ?? null;
  const search = useCallback(
    (query: string) => {
      if (decisionId !== null) socketRef.current?.search(decisionId, query);
    },
    [decisionId],
  );

  const busy = game.awaiting !== null;
  const objectName = (id: string) => nameOf(board, id);

  return (
    <section className="gs-screen" aria-label="Your match">
      <h1 className="pa-visually-hidden">Your match</h1>
      {data && board ? (
        <Board
          battlefield={data.battlefield}
          hand={data.hand}
          viewerSeat={board.seat}
          artUrl={(art) => `/api/matches/${match.matchId}/assets/${art}`}
          arrivals={data.arrivals}
          departures={data.departures}
          combat={data.combat}
          stack={data.stack}
          handCosts={handCosts}
          damage={data.damage}
          onPick={pick}
          onInspect={setInspecting}
          choosable={choosable}
          unpayable={unpayable}
          selected={selected}
          asking={question?.context === "choose"}
          top={<TopBar board={board} />}
          rail={
            <Rail
              board={board}
              question={question}
              mySeat={board.seat}
              busy={busy}
              onPick={pick}
              onPass={() => answer(null)}
              combat={
                decision && question && COMBAT_KINDS.has(decision.kind) && !listOpen
                  ? {
                      kind: decision.kind,
                      heading:
                        decision.actedForSeat === mine?.seatNumber
                          ? headingFor(decision.kind)
                          : `Playing for seat ${decision.actedForSeat}`,
                      ...combatWords(decision.kind, board, board.seat),
                      all: decision.options.find((o) => o.actionId === ALL_ATTACK) ?? null,
                      canPass: question.canPass,
                      notice: game.notice,
                    }
                  : null
              }
              cancel={
                !!decision &&
                !!question &&
                CANCEL_KINDS.has(decision.kind) &&
                question.canPass &&
                !listOpen
              }
              onAnswer={answer}
              onPassTurn={() => {
                socketRef.current?.passTurn();
                answer(null);
              }}
              onView={setViewer}
              finished={finished}
            />
          }
          overlay={(at) =>
            why && !offer ? (
              <WhyNot box={at(why.objectId)} text={why.text} />
            ) : selected && offer ? (
              <ActionPopup
                box={at(selected)}
                name={objectName(selected)}
                options={offer}
                busy={busy}
                onChoose={answer}
                onInspect={() => setInspecting(selected)}
                onClose={() => {
                  setSelected(null);
                  setOffer(null);
                }}
              />
            ) : null
          }
        />
      ) : (
        <LoadingRing
          words={
            finished
              ? "The game is over."
              : game.connection === "reconnecting"
                ? "Reconnecting to the game…"
                : match.status === "LAUNCHING"
                  ? "Setting up the table…"
                  : "Shuffling up and dealing…"
          }
        />
      )}

      <div className="gs-corner">
        <img className="gs-logo" src={logo} alt="Proxic Arena" />
        <p className="gs-status" role="status">
          {finished
            ? "Game over."
            : match.status === "LAUNCHING"
              ? game.decision
                ? "Setting the game up — and it needs an answer from you."
                : "Starting the game."
              : "The game is running."}
        </p>
      </div>

      {/* Owner 2026-10-21: the game's controls at the bottom left, where no
          card is drawn -- a gear (Stops, Concede, Abandon) and chat. */}
      <div className="gs-dock-anchor">
        <GameMenu
          match={match}
          live={live && !finished}
          chatOpen={chatOpen}
          unread={unread}
          onChat={() => setChatOpen((open) => !open)}
          choices={decision ? decision.options.length : null}
          listOpen={listOpen}
          onList={() => setListOpen((open) => !open)}
          concession={finished ? null : concessionText(game.concession)}
          onStops={(settings) => socketRef.current?.stops(settings)}
          onConcede={() => {
            setGame((previous) => ({ ...previous, concession: null }));
            socketRef.current?.concede();
          }}
        />
      </div>

      {live && game.connection === "reconnecting" && !finished && (
        <div className="gs-banner pa-notice pa-notice-warn" role="status">
          <span aria-hidden="true" className="pa-notice-mark" />
          <span className="pa-notice-text">
            Reconnecting to the game… It is still running, and nothing is answered for you while you
            are away.
          </span>
        </div>
      )}
      {live && game.connection === "closed" && !finished && (
        <div className="gs-banner pa-notice pa-notice-bad" role="alert">
          <span aria-hidden="true" className="pa-notice-mark" />
          <span className="pa-notice-text">
            You are no longer connected to the game. Reload the page — the game is still running and
            nothing has been answered for you.
          </span>
        </div>
      )}

      {decision && question && (
        <QuestionBar
          decision={decision}
          question={question}
          mySeat={mine?.seatNumber ?? null}
          busy={busy}
          notice={game.notice}
          all={listOpen}
          onToggleAll={() => setListOpen((open) => !open)}
          onAnswer={answer}
          onSearch={search}
        />
      )}

      {board && <Notices board={board} />}

      {inspecting && board && (
        <Inspect
          card={cardOf(board, inspecting)}
          name={objectName(inspecting)}
          costNow={handCosts.get(inspecting) ?? null}
          artUrl={(art) => `/api/matches/${match.matchId}/assets/${art}`}
          onClose={() => setInspecting(null)}
        />
      )}

      {viewer && board && (
        <ZoneViewer
          board={board}
          seat={viewer.seat}
          zone={viewer.zone}
          onInspect={setInspecting}
          onClose={() => setViewer(null)}
        />
      )}

      {chatOpen && <ChatDrawer onClose={() => setChatOpen(false)} />}

      {finished && (
        <div className="gs-over" role="dialog" aria-modal="false" aria-labelledby="gs-over-title">
          <h2 id="gs-over-title" className="gs-over-title">
            {board ? `Game over · it ended on turn ${board.turn}` : "Game over"}
          </h2>
          <p className="gs-over-text">{resultText(match, mine?.seatNumber ?? null)}</p>
          <button type="button" className="pa-button pa-button-brass" onClick={onLeave}>
            Back to the lobby
          </button>
        </div>
      )}
    </section>
  );
}

// --- helpers -----------------------------------------------------------------------

function cardOf(board: Snapshot, id: string): SnapshotCard | null {
  return (
    [
      ...board.battlefield,
      ...board.hand,
      ...board.otherHands,
      ...board.graveyard,
      ...board.exile,
    ].find((card) => card.id === id) ?? null
  );
}

function nameOf(board: Snapshot | null, id: string): string {
  if (!board) return id;
  if (id.startsWith("player:")) {
    const seat = Number(id.slice("player:".length));
    return board.players.find((p) => p.seat === seat)?.name ?? `Seat ${seat}`;
  }
  const stackEntry = board.stack.find((entry) => entry.id === id);
  if (stackEntry) return stackEntry.name;
  const card = cardOf(board, id);
  if (!card) return "That card";
  return card.faceDown && !card.known ? "Face-down card" : card.name;
}

// --- top bar ------------------------------------------------------------------------

function TopBar({ board }: { board: Snapshot }) {
  const now = STEPS.findIndex((step) => step.phases.includes(board.phase));
  return (
    <div className="gs-top">
      <div className="gs-turn" aria-label={`Turn ${board.turn}`}>
        <span className="gs-turn-key">Turn</span>
        <span className="gs-turn-value">{board.turn}</span>
      </div>
      <ol className="gs-steps" aria-label="Steps of the turn">
        {STEPS.map((step, i) => (
          <li
            key={step.label}
            className={`gs-step${i === now ? " gs-step-now" : ""}`}
            aria-current={i === now ? "step" : undefined}
          >
            {step.label}
          </li>
        ))}
      </ol>
      {board.dayTime && (
        <span className="gs-day">{board.dayTime === "night" ? "Night" : "Day"}</span>
      )}
      {/* §6.70 — after a restart, say which game this is, or "turn 1"
          reads as the game having gone backwards. */}
      {board.gameEpoch > 1 && (
        <span className="gs-day gs-game">Game {board.gameEpoch} · restarted</span>
      )}
    </div>
  );
}

// --- the right-hand column ------------------------------------------------------------

function manaText(pool: Record<string, number>): string {
  return Object.entries(pool)
    .map(([colour, n]) => `${n} ${colour}`)
    .join(" · ");
}

function SeatBlock({
  player,
  board,
  mine,
  question,
  busy,
  onPick,
  onView,
}: {
  player: SnapshotPlayer;
  board: Snapshot;
  mine: boolean;
  question: Question | null;
  busy: boolean;
  onPick: (id: string) => void;
  onView: (view: { seat: number; zone: "graveyard" | "exile" | "hand" }) => void;
}) {
  const id = `player:${player.seat}`;
  const active = board.activeSeat === player.seat;
  const priority = board.prioritySeat === player.seat;
  const choosable = Boolean(question?.onBoard.has(id));
  // The spell resolving next targets this player: their life total glows
  // (owner 2026-10-21), as a targeted card does on the board.
  const targeted = (board.stack[0]?.targets ?? []).some(
    (t) => "player" in t && t.player === player.seat,
  );
  const role = mine
    ? active
      ? "You · active turn"
      : "You"
    : active
      ? "Opponent · active turn"
      : "Opponent";
  const visibleHand = board.otherHands.filter((card) => card.seat === player.seat);
  const exiled = board.exile.filter((card) => card.seat === player.seat).length;
  const facts = [
    ...player.counters.map((c) => `${c.count} ${c.name.toLowerCase()}`),
    ...player.designations.map((d) => `· ${d.toLowerCase()}`),
    ...(Object.keys(player.manaPool).length > 0 ? [`mana ${manaText(player.manaPool)}`] : []),
  ];
  return (
    <div className={`gs-seat gs-seat-${mine ? "viewer" : "opponent"}`} data-seat={player.seat}>
      <span className="pa-visually-hidden">
        {player.name}: {player.life} life, {player.handCount} in hand, {player.libraryCount} in
        library, {player.graveyardCount} in graveyard, {exiled} in exile.
      </span>
      <div className="gs-seat-head">
        <button
          type="button"
          className={`gs-life${active ? " gs-life-active" : ""}${choosable ? " gs-choosable" : ""}${targeted ? " gs-targeted" : ""}`}
          aria-label={`${player.name}, ${player.life} life${choosable ? ", can be chosen" : ""}`}
          data-object-id={id}
          data-choosable={choosable ? "true" : undefined}
          disabled={busy && choosable}
          onClick={() => onPick(id)}
        >
          {player.life}
        </button>
        <span className="gs-seat-who">
          <span className="gs-seat-name-row">
            {priority && (
              <>
                <span aria-hidden="true" className="gs-priority-dot" />
                <span className="pa-visually-hidden">has priority</span>
              </>
            )}
            <span className="gs-seat-name">{player.name}</span>
          </span>
          <span className={`gs-seat-role${mine ? " gs-seat-role-you" : ""}`}>{role}</span>
        </span>
      </div>
      {facts.length > 0 && <p className="gs-seat-facts board-totals">{facts.join("  ")}</p>}
      {player.command.length > 0 && (
        <p className="gs-seat-facts">
          command zone: {player.command.join(", ")}
          {player.ringTempted > 0 && ` · the Ring has tempted ${player.ringTempted}×`}
        </p>
      )}
      <div className="gs-zones">
        {!mine && (
          <button
            type="button"
            className="gs-zone"
            aria-label={`${player.name}'s hand, ${player.handCount} cards${visibleHand.length ? `, ${visibleHand.length} visible to you` : ""}`}
            disabled={visibleHand.length === 0}
            onClick={() => onView({ seat: player.seat, zone: "hand" })}
          >
            <span className="gs-zone-key">Hand</span>
            <span className="gs-zone-n">{player.handCount}</span>
          </button>
        )}
        <div
          className="gs-zone"
          aria-label={`${player.name}'s library, ${player.libraryCount} cards`}
        >
          <span className="gs-zone-key">Library</span>
          <span className="gs-zone-n">{player.libraryCount}</span>
        </div>
        {/* Owner 2026-10-21: exile beside the graveyard, one row, so
            nothing else in the rail moves. */}
        <div className="gs-zone-pair">
          <button
            type="button"
            className="gs-zone"
            aria-label={`${player.name}'s graveyard, ${player.graveyardCount} cards`}
            onClick={() => onView({ seat: player.seat, zone: "graveyard" })}
          >
            <span className="gs-zone-key">Graveyard</span>
            <span className="gs-zone-n">{player.graveyardCount}</span>
          </button>
          <button
            type="button"
            className="gs-zone"
            aria-label={`${player.name}'s exile, ${exiled} cards`}
            onClick={() => onView({ seat: player.seat, zone: "exile" })}
          >
            <span className="gs-zone-key">Exile</span>
            <span className="gs-zone-n">{exiled}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Rail({
  board,
  question,
  mySeat,
  busy,
  onPick,
  onPass,
  combat,
  cancel,
  onAnswer,
  onPassTurn,
  onView,
  finished,
}: {
  board: Snapshot;
  question: Question | null;
  mySeat: number;
  busy: boolean;
  onPick: (id: string) => void;
  onPass: () => void;
  /** Declaring attackers or blockers: the act button is the combat button. */
  combat: CombatButton | null;
  /** A question whose "no" backs out (a target, a payment): the act button cancels. */
  cancel: boolean;
  onAnswer: (actionId: string | null) => void;
  /** §7.53 extra — pass now, and no more stops this turn. */
  onPassTurn: () => void;
  onView: (view: { seat: number; zone: "graveyard" | "exile" | "hand" }) => void;
  /** The game is over: nobody holds priority any more. */
  finished: boolean;
}) {
  const me = board.players.find((p) => p.seat === mySeat);
  const them = board.players.find((p) => p.seat !== mySeat);
  const top = board.stack[0];
  const priorityName =
    board.players.find((p) => p.seat === board.prioritySeat)?.name ?? "The other player";
  const myPriority = question?.context === "priority";
  const words = passWords(board, mySeat);
  return (
    <div className="gs-rail">
      {them && (
        <SeatBlock
          player={them}
          board={board}
          mine={false}
          question={question}
          busy={busy}
          onPick={onPick}
          onView={onView}
        />
      )}

      {/* The act button keeps its canvas place. The stack is drawn as cards
          on the board (owner 2026-10-22: the column's Stack box is gone). */}
      {finished ? (
        <div className="gs-waiting" role="status">
          <span className="gs-waiting-word">Game over</span>
          <span className="gs-waiting-sub">Nobody holds priority now</span>
        </div>
      ) : combat ? (
        // Owner 2026-10-22: combat on the act button, as MTG Arena has it --
        // no bar over the table. It says what pressing it does, and counts.
        <div className="gs-combat" data-kind={combat.kind}>
          <h2 className="gs-question-title pa-visually-hidden">{combat.heading}</h2>
          {combat.notice && (
            <p className="gs-combat-notice" role="alert">
              {combat.notice}
            </p>
          )}
          {combat.all && (
            <ul className="gs-combat-options">
              <li>
                <button
                  type="button"
                  className="gs-act-all"
                  disabled={busy}
                  onClick={() => onAnswer(combat.all!.actionId)}
                >
                  {combat.all.label ?? "All attack"}
                </button>
              </li>
            </ul>
          )}
          <button
            type="button"
            className="gs-act gs-act-combat"
            disabled={busy || !combat.canPass}
            onClick={() => onAnswer(null)}
            aria-label={`Pass: ${combat.word}. ${combat.sub}`}
          >
            <span className="gs-act-word">{combat.word}</span>
            <span className="gs-act-sub">{combat.sub}</span>
          </button>
        </div>
      ) : cancel ? (
        // Owner 2026-10-22: a misclick must be undoable where every other
        // answer is -- the act button. Esc does the same.
        <button
          type="button"
          className="gs-act gs-act-cancel"
          disabled={busy}
          onClick={() => onAnswer(null)}
          aria-label="Cancel: back out, nothing happens. Escape does the same."
        >
          <span className="gs-act-word">Cancel</span>
          <span className="gs-act-sub">Back out — nothing happens · Esc</span>
        </button>
      ) : myPriority ? (
        <div className="gs-act-group">
          {/* The same pass whatever it says (§7.53 extra): the words say
              what happens next, as MTG Arena's button does. Named "Pass"
              for a screen reader, whatever it shows. */}
          <button
            type="button"
            className="gs-act"
            disabled={busy}
            onClick={onPass}
            aria-label={`Pass: ${words.word}. ${words.sub}`}
          >
            <span className="gs-act-word">{words.word}</span>
            <span className="gs-act-sub">{words.sub}</span>
          </button>
          {!top && (
            <button type="button" className="gs-act-turn" disabled={busy} onClick={onPassTurn}>
              Skip to end of turn
            </button>
          )}
        </div>
      ) : !question ? (
        <div className="gs-waiting" role="status">
          <span className="gs-waiting-word">
            <span aria-hidden="true" className="gs-priority-dot" />
            {board.prioritySeat === mySeat ? "Your priority" : `${priorityName} to act`}
          </span>
          <span className="gs-waiting-sub">
            {board.prioritySeat === mySeat ? "Working it out…" : "You will get priority back"}
          </span>
        </div>
      ) : (
        <div className="gs-waiting gs-waiting-question" role="status">
          <span className="gs-waiting-word">Your answer</span>
          <span className="gs-waiting-sub">Your choice is above the board</span>
        </div>
      )}

      {me && (
        <SeatBlock
          player={me}
          board={board}
          mine
          question={question}
          busy={busy}
          onPick={onPick}
          onView={onView}
        />
      )}
    </div>
  );
}

// --- the question ----------------------------------------------------------------------

function QuestionBar({
  decision,
  question,
  mySeat,
  busy,
  notice,
  all,
  onToggleAll,
  onAnswer,
  onSearch,
}: {
  decision: NonNullable<MatchState["decision"]>;
  question: Question;
  mySeat: number | null;
  busy: boolean;
  notice: string | null;
  /** Every option as a list (§7.29: reachable without the board). */
  all: boolean;
  onToggleAll: () => void;
  onAnswer: (actionId: string | null) => void;
  onSearch: (query: string) => void;
}) {
  // Declaring attackers or blockers is answered on the board and the act
  // button (owner 2026-10-22); the list, opened from the menu, still works.
  if (!all && COMBAT_KINDS.has(decision.kind)) return null;
  const onBoardCount = [...question.onBoard.values()].reduce((n, list) => n + list.length, 0);
  // On your move with nothing to list, the board and the Pass button are
  // the whole question: NO bar over the table (AMENDMENT 12), unless the
  // list is asked for from the menu.
  if (
    !all &&
    question.context === "priority" &&
    question.listed.length === 0 &&
    !notice &&
    !decision.prompt
  ) {
    // Still SAID, to a screen reader: whose move it is.
    return (
      <div className="gs-your-move" data-kind={decision.kind}>
        <h2 className="gs-question-title pa-visually-hidden">
          {decision.actedForSeat === mySeat
            ? headingFor(decision.kind)
            : `Playing for seat ${decision.actedForSeat}`}
        </h2>
      </div>
    );
  }
  const option = (o: DecisionOption) => (
    <li key={o.actionId}>
      <button
        type="button"
        className={`gs-option${o.payable ? "" : " gs-option-unpayable"}`}
        disabled={busy}
        onClick={() => onAnswer(o.actionId)}
      >
        {o.label ?? o.actionId}
        {!o.payable && <span className="gs-option-note"> — not enough mana right now</span>}
      </button>
    </li>
  );
  const heading =
    decision.actedForSeat === mySeat
      ? headingFor(decision.kind)
      : `Playing for seat ${decision.actedForSeat}`;
  // Everything asked is on the board (a target, a land to tap): the
  // board is the answer, so the question is one line over the table,
  // never a box in the middle of it (AMENDMENT 12).
  if (!all && !decision.searchable && question.listed.length <= 3 && onBoardCount > 0) {
    return (
      <div className="gs-question gs-question-slim" data-kind={decision.kind}>
        <h2 className="gs-question-title">{heading}</h2>
        {decision.prompt && <p className="gs-question-prompt decision-prompt">{decision.prompt}</p>}
        <p className="gs-question-hint">{hintFor(decision.kind, decision.options.length)}</p>
        {/* A few choices the board cannot show ("All attack"): inline. */}
        {question.listed.length > 0 && (
          <ul className="gs-options gs-options-inline">{question.listed.map(option)}</ul>
        )}
        {notice && (
          <p className="gs-question-notice" role="alert">
            {notice}
          </p>
        )}
        {question.context !== "priority" &&
          question.canPass &&
          (all || !CANCEL_KINDS.has(decision.kind)) && (
            <button
              type="button"
              className="gs-pass"
              disabled={busy}
              onClick={() => onAnswer(null)}
            >
              Pass
            </button>
          )}
      </div>
    );
  }
  return (
    <div className="gs-question" data-kind={decision.kind}>
      <h2 className="gs-question-title">{heading}</h2>
      {decision.prompt && <p className="gs-question-prompt decision-prompt">{decision.prompt}</p>}
      {notice && (
        <p className="gs-question-notice" role="alert">
          {notice}
        </p>
      )}
      {decision.searchable ? (
        <NameSearch
          key={decision.decisionId}
          decision={decision}
          disabled={busy}
          onSearch={onSearch}
          onChoose={onAnswer}
        />
      ) : (
        <>
          {onBoardCount > 0 && (
            <p className="gs-question-hint">
              {question.context === "priority"
                ? "Click a card to see what it can do."
                : "Click a highlighted card or player to choose it."}
            </p>
          )}
          {/* One list at a time: what the board cannot show, or, opened,
              every choice -- never the same option twice. */}
          {all ? (
            <ul className="gs-options gs-options-all">{decision.options.map(option)}</ul>
          ) : (
            question.listed.length > 0 && (
              <ul className="gs-options">{question.listed.map(option)}</ul>
            )
          )}
          {onBoardCount > 0 && (
            <button
              type="button"
              className="gs-all-toggle"
              aria-expanded={all}
              onClick={onToggleAll}
            >
              {all ? "Hide the list" : `Every choice as a list (${decision.options.length})`}
            </button>
          )}
          <p className="gs-question-foot">{hintFor(decision.kind, decision.options.length)}</p>
        </>
      )}
      {/* On your move, Pass is the act button under the stack (the
          canvas); here only when this question's "no" is not a pass of
          priority. Never when the rules give no "no" (Phase 6). */}
      {question.context !== "priority" &&
        question.canPass &&
        (all || !CANCEL_KINDS.has(decision.kind)) && (
          <button type="button" className="gs-pass" disabled={busy} onClick={() => onAnswer(null)}>
            Pass
          </button>
        )}
    </div>
  );
}

/**
 * Questions whose "no" backs out of what was started -- a target, a
 * payment, which ability, a cost's counters (the hints say "cancel"). The
 * act button reads Cancel for them, and Esc does the same.
 */
const CANCEL_KINDS = new Set([
  "chooseTargetsFor",
  "getAbilityToPlay",
  "applyManaToCost",
  "chooseManaAbility",
  "CostPutCounter",
  "CostRemoveCounter",
]);

/** The two combat questions, answered on the board and the act button. */
const COMBAT_KINDS = new Set(["declareAttackers", "declareBlockers"]);
/** Forge's "every creature still offered" (CombatChoices.ALL_ATTACK). */
const ALL_ATTACK = "attackers:all";

interface CombatButton {
  kind: string;
  heading: string;
  word: string;
  sub: string;
  all: DecisionOption | null;
  canPass: boolean;
  notice: string | null;
}

/**
 * What the combat button says (AMENDMENT 13, owner 2026-10-22): what
 * pressing it does, and how many are in -- "No attacks", then "Attack (2)"
 * as creatures are clicked; the same for blocks.
 */
function combatWords(kind: string, board: Snapshot, mySeat: number): { word: string; sub: string } {
  if (kind === "declareAttackers") {
    const n = board.battlefield.filter((c) => c.attacking && c.seat === mySeat).length;
    return n > 0
      ? { word: `Attack (${n})`, sub: "Click a creature to add it or take it back" }
      : { word: "No attacks", sub: "Click creatures to attack with them" };
  }
  const n = board.battlefield.filter((c) => c.blocking && c.seat === mySeat).length;
  return n > 0
    ? { word: `Done blocking (${n})`, sub: "Click a creature to add a block or take it back" }
    : { word: "No blocks", sub: "Click your creatures to block with them" };
}

/** How long a "why not" stays beside the card. */
const WHY_MS = 3500;

/** Why the card just clicked cannot act now (B7). Says it; asks nothing. */
function WhyNot({
  box,
  text,
}: {
  box: { x: number; y: number; w: number; h: number } | null;
  text: string;
}) {
  const style = box
    ? {
        left: box.x + box.w / 2,
        top: box.y > 300 ? box.y - 10 : box.y + box.h + 10,
        transform: box.y > 300 ? "translate(-50%, -100%)" : "translate(-50%, 0)",
      }
    : { left: "50%", top: "45%", transform: "translate(-50%, 0)" };
  return (
    <div className="gs-why" role="status" style={style}>
      {text}
    </div>
  );
}

function ActionPopup({
  box,
  name,
  options,
  busy,
  onChoose,
  onInspect,
  onClose,
}: {
  box: { x: number; y: number; w: number; h: number } | null;
  name: string;
  options: DecisionOption[];
  busy: boolean;
  onChoose: (actionId: string) => void;
  onInspect: () => void;
  onClose: () => void;
}) {
  const first = useRef<HTMLButtonElement | null>(null);
  useEffect(() => first.current?.focus({ preventScroll: true }), []);
  const style = box
    ? {
        left: box.x + box.w / 2,
        top: box.y > 300 ? box.y - 12 : box.y + box.h + 12,
        transform: box.y > 300 ? "translate(-50%, -100%)" : "translate(-50%, 0)",
      }
    : { left: "40%", top: "40%" };
  return (
    <div
      className="gs-popup"
      role="dialog"
      aria-label={`${name}: what it can do`}
      style={style}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="gs-popup-head">
        <span className="gs-popup-name">{name}</span>
        <span className="gs-popup-count">
          {options.length === 0
            ? "Nothing to do with it right now"
            : options.length === 1
              ? "1 action offered"
              : `${options.length} actions offered`}
        </span>
      </div>
      <ul className="gs-popup-actions">
        {options.map((o, i) => (
          <li key={o.actionId}>
            <button
              ref={i === 0 ? first : undefined}
              type="button"
              className={`gs-option${o.payable ? "" : " gs-option-unpayable"}`}
              disabled={busy}
              onClick={() => onChoose(o.actionId)}
            >
              {o.label ?? o.actionId}
              {!o.payable && <span className="gs-option-note"> — not enough mana right now</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className="gs-popup-foot">
        <button
          ref={options.length === 0 ? first : undefined}
          type="button"
          className="gs-link"
          onClick={onInspect}
        >
          Look closer
        </button>
        <button type="button" className="gs-link" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

// --- looking at things --------------------------------------------------------------------

function Inspect({
  card,
  name,
  costNow,
  artUrl,
  onClose,
}: {
  card: SnapshotCard | null;
  name: string;
  /** What its cast costs right now, when Forge has said. */
  costNow: string | null;
  artUrl: (art: string) => string;
  onClose: () => void;
}) {
  const close = useRef<HTMLButtonElement | null>(null);
  useEffect(() => close.current?.focus({ preventScroll: true }), []);
  const hidden = card && card.faceDown && !card.known;
  return (
    <div className="gs-backdrop" onClick={onClose}>
      <div
        className="gs-inspect"
        role="dialog"
        aria-modal="true"
        aria-label={`${name}, close up`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        {card?.art && !hidden ? (
          // The full scan for the close-up (AMENDMENT 8): the table's copy is
          // 384 px wide, and this is drawn at up to 300 px times the screen's
          // scaling.
          <img className="gs-inspect-art" src={`${artUrl(card.art)}?size=full`} alt="" />
        ) : (
          <div className="gs-inspect-art gs-inspect-noart">
            {hidden ? "Face down" : "No picture"}
          </div>
        )}
        <div className="gs-inspect-text">
          <h2 className="gs-inspect-name">
            {name}
            {card && !hidden && (costNow ?? card.manaCost) && (
              <ManaCost
                cost={(costNow ?? card.manaCost)!}
                change={costChange(costNow, card.manaCost)}
              />
            )}
          </h2>
          {card && !hidden && (
            <>
              <p className="gs-inspect-types">{card.types}</p>
              {card.power !== null && card.toughness !== null && (
                <p className="gs-inspect-pt">
                  {card.power}/{card.toughness}
                  {card.damage > 0 && ` · ${card.damage} damage`}
                </p>
              )}
              {card.keywords.length > 0 && <p>{withSymbols(card.keywords.join(", "))}</p>}
              {card.counters.length > 0 && (
                <p>{card.counters.map((c) => `${c.count} ${c.name.toLowerCase()}`).join(", ")}</p>
              )}
              {card.tapped && <p>Tapped</p>}
              {card.sick && <p>Summoning sick</p>}
              {card.ringBearer && <p>Ring-bearer</p>}
              {card.token && <p>Token</p>}
            </>
          )}
          <button ref={close} type="button" className="pa-button pa-button-quiet" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ZoneViewer({
  board,
  seat,
  zone,
  onInspect,
  onClose,
}: {
  board: Snapshot;
  seat: number;
  zone: "graveyard" | "exile" | "hand";
  onInspect: (id: string) => void;
  onClose: () => void;
}) {
  const player = board.players.find((p) => p.seat === seat);
  const cards = (
    zone === "graveyard" ? board.graveyard : zone === "exile" ? board.exile : board.otherHands
  ).filter((c) => c.seat === seat);
  const title = `${player?.name ?? "Their"}'s ${zone === "hand" ? "hand, as far as you may see it" : zone}`;
  return (
    <div className="gs-backdrop" onClick={onClose}>
      <div
        className="gs-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <h2 className="gs-viewer-title">{title}</h2>
        {cards.length === 0 && <p className="gs-viewer-empty">Nothing here.</p>}
        <ul className={`gs-viewer-list${zone === "hand" ? " board-other-hand" : ""}`}>
          {cards.map((card) => (
            <li key={card.id}>
              <button type="button" className="gs-viewer-card" onClick={() => onInspect(card.id)}>
                {card.name}
                <span className="gs-viewer-types"> {card.types}</span>
                {/* A suspended card's time counters say when it comes back. */}
                {card.counters.length > 0 && (
                  <span className="gs-viewer-types">
                    {" · "}
                    {card.counters
                      .map(
                        (c) =>
                          `${c.count} ${c.name.toLowerCase()} counter${c.count === 1 ? "" : "s"}`,
                      )
                      .join(", ")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="pa-button pa-button-quiet" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

/** What Forge told this player, briefly (§7.57). A missed one costs nothing. */
function Notices({ board }: { board: Snapshot }) {
  const [shown, setShown] = useState<{ key: string; text: string }[]>([]);
  const seen = useRef(0);
  useEffect(() => {
    const fresh = board.notices.slice(seen.current);
    seen.current = board.notices.length;
    if (fresh.length === 0) return undefined;
    const added = fresh.map((text, i) => ({ key: `${board.stateRevision}:${i}`, text }));
    setShown((list) => [...list, ...added].slice(-4));
    const timer = window.setTimeout(
      () => setShown((list) => list.filter((n) => !added.includes(n))),
      NOTICE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [board]);
  if (shown.length === 0) return null;
  return (
    <ul className="gs-notices" aria-live="polite">
      {shown.map((n) => (
        <li key={n.key} className="gs-notice">
          {n.text}
        </li>
      ))}
    </ul>
  );
}

// --- the game menu and the chat drawer ------------------------------------------------------

function GameMenu({
  match,
  live,
  chatOpen,
  unread,
  onChat,
  choices,
  listOpen,
  onList,
  concession,
  onConcede,
  onStops,
}: {
  match: MatchView;
  live: boolean;
  chatOpen: boolean;
  /** Somebody else said something since the chat was last open. */
  unread: boolean;
  onChat: () => void;
  /** How many options the question on screen has, or null for none. */
  choices: number | null;
  listOpen: boolean;
  onList: () => void;
  /** Where a concession stands, in words (§7.55). */
  concession: string | null;
  onConcede: () => void;
  /** §7.53 — saved stops, to apply to this game now. */
  onStops: (settings: StopSettings) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [stopsOpen, setStopsOpen] = useState(false);
  // §7.55: Concede is a real loss, Forge's; Abandon is for a stuck or
  // broken game and has no winner. Each asks first, and only one asks
  // at a time.
  const [confirming, setConfirming] = useState<"concede" | "abandon" | null>(null);
  const [abandoning, setAbandoning] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const dock = useRef<HTMLDivElement | null>(null);
  // The gear's menu closes on a click anywhere else, or Escape.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const away = (event: MouseEvent) => {
      if (dock.current && !dock.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);
  const abandon = async () => {
    setAbandoning(true);
    const result = await abandonMatch(match.matchId);
    setAbandoning(false);
    setConfirming(null);
    if (!result.ok) setFailure(result.failure.detail);
  };
  const choose = (what: "stops" | "concede" | "abandon") => {
    setMenuOpen(false);
    if (what === "stops") setStopsOpen(true);
    else setConfirming(what);
  };
  return (
    <div className="gs-dock" ref={dock}>
      {/* Above the icons, opening upwards: the menu, the panels it opens,
          and what became of a concession or an abandon. */}
      <div className="gs-dock-pop">
        {live && menuOpen && (
          <div className="gs-dock-menu" role="group" aria-label="Game menu">
            <button type="button" className="gs-dock-item" onClick={() => choose("stops")}>
              Stops
            </button>
            <button type="button" className="gs-dock-item" onClick={() => choose("concede")}>
              Concede
            </button>
            <button type="button" className="gs-dock-item" onClick={() => choose("abandon")}>
              Abandon match
            </button>
          </div>
        )}
        {live && stopsOpen && (
          <StopsPanel
            onClose={() => setStopsOpen(false)}
            onSaved={(settings) => {
              onStops(settings);
              setStopsOpen(false);
            }}
          />
        )}
        {live && confirming === "concede" && (
          <span className="gs-menu-confirm" role="alert">
            Concede this game? Your opponent wins it, and it cannot be undone.
            <button
              type="button"
              className="gs-menu-button gs-menu-warn"
              onClick={() => {
                setConfirming(null);
                onConcede();
              }}
            >
              Yes, concede
            </button>
            <button type="button" className="gs-menu-button" onClick={() => setConfirming(null)}>
              Keep playing
            </button>
          </span>
        )}
        {live && confirming === "abandon" && (
          <span className="gs-menu-confirm" role="alert">
            End this match for both players? Nobody wins it, and it cannot be resumed.
            <button
              type="button"
              className="gs-menu-button gs-menu-warn"
              disabled={abandoning}
              onClick={() => void abandon()}
            >
              Yes, abandon the match
            </button>
            <button
              type="button"
              className="gs-menu-button"
              disabled={abandoning}
              onClick={() => setConfirming(null)}
            >
              Keep playing
            </button>
          </span>
        )}
        {concession && (
          <span className="gs-menu-failure" role="status">
            {concession}
          </span>
        )}
        {failure && (
          <span className="gs-menu-failure" role="alert">
            {failure}
          </span>
        )}
      </div>
      <div className="gs-dock-row">
        {live && (
          <button
            type="button"
            className="gs-icon-button"
            aria-label="Game menu"
            aria-expanded={menuOpen}
            title="Stops, Concede, Abandon match"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <GearIcon />
          </button>
        )}
        <button
          type="button"
          className={`gs-icon-button${unread ? " gs-icon-unread" : ""}`}
          aria-label={unread ? "Chat, new messages" : "Chat"}
          aria-pressed={chatOpen}
          title="Chat"
          onClick={onChat}
        >
          <ChatIcon />
          {unread && <span className="gs-icon-dot" aria-hidden="true" />}
        </button>
        {choices !== null && choices > 0 && (
          // §7.29 and the keyboard: every answer, as a plain list, from
          // anywhere -- the board is the quick way, never the only way.
          <button
            type="button"
            className="gs-menu-button"
            aria-expanded={listOpen}
            onClick={onList}
          >
            List choices ({choices})
          </button>
        )}
      </div>
    </div>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M10.3 2h3.4l.5 2.6c.7.2 1.3.5 1.9.9l2.3-1.4 2.4 2.4-1.4 2.3c.4.6.7 1.2.9 1.9l2.6.5v3.4l-2.6.5c-.2.7-.5 1.3-.9 1.9l1.4 2.3-2.4 2.4-2.3-1.4c-.6.4-1.2.7-1.9.9l-.5 2.6h-3.4l-.5-2.6c-.7-.2-1.3-.5-1.9-.9l-2.3 1.4-2.4-2.4 1.4-2.3c-.4-.6-.7-1.2-.9-1.9L1 13.7v-3.4l2.6-.5c.2-.7.5-1.3.9-1.9L3.1 5.6 5.5 3.2l2.3 1.4c.6-.4 1.2-.7 1.9-.9L10.3 2ZM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"
      />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10l-5 4v-4H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"
      />
    </svg>
  );
}

/**
 * §7.53 — where you are asked "act or pass?". Everywhere else the game
 * passes for you, and only ever passes: targets, payments, blocks and
 * mulligans are always asked. Saved for your account, and applied to the
 * game in progress.
 */
function StopsPanel({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (settings: StopSettings) => void;
}) {
  const [settings, setSettings] = useState<StopSettings | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetchStops().then((loaded) => {
      if (!alive) return;
      if (loaded) setSettings(loaded);
      else setFailure("Your stops could not be loaded.");
    });
    return () => {
      alive = false;
    };
  }, []);
  const toggle = (side: "own" | "opponent", key: string) =>
    setSettings((current) => {
      if (!current) return current;
      const list = current[side];
      return {
        ...current,
        [side]: list.includes(key) ? list.filter((k) => k !== key) : [...list, key],
      };
    });
  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const saved = await saveStops(settings);
    setSaving(false);
    if (saved) onSaved(saved);
    else setFailure("Your stops could not be saved. Try again.");
  };
  return (
    <div className="gs-stops" role="dialog" aria-label="Where the game stops for you">
      <h2 className="gs-stops-title">Where the game stops for you</h2>
      <p className="gs-stops-note">
        At a step without a tick the game passes for you, but only when nothing your opponent did is
        waiting to resolve, and never past a target, a payment or a block. Your main phases stop
        only when you have something to play.
      </p>
      {settings ? (
        <table className="gs-stops-table">
          <thead>
            <tr>
              <th scope="col">Step</th>
              <th scope="col">Your turn</th>
              <th scope="col">Their turn</th>
            </tr>
          </thead>
          <tbody>
            {STOP_STEPS.map((step) => (
              <tr key={step.key}>
                <th scope="row">{step.label}</th>
                {(["own", "opponent"] as const).map((side) => (
                  <td key={side}>
                    <input
                      type="checkbox"
                      aria-label={`${step.label}, ${side === "own" ? "your turn" : "their turn"}`}
                      checked={settings[side].includes(step.key)}
                      onChange={() => toggle(side, step.key)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        !failure && <p className="gs-stops-note">Loading…</p>
      )}
      {failure && (
        <p className="gs-menu-failure" role="alert">
          {failure}
        </p>
      )}
      <div className="gs-stops-actions">
        <button
          type="button"
          className="gs-menu-button gs-menu-warn"
          disabled={!settings || saving}
          onClick={() => void save()}
        >
          Save
        </button>
        <button type="button" className="gs-menu-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function ChatDrawer({ onClose }: { onClose: () => void }) {
  const { lobby, send } = useLobbyConnection();
  const [draft, setDraft] = useState("");
  const log = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [lobby.chat.length]);
  return (
    <aside className="gs-chat" aria-label="Lobby chat">
      <div className="gs-chat-head">
        <h2>Lobby chat</h2>
        <button type="button" className="gs-link" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="gs-chat-log" role="log" ref={log}>
        {lobby.chat.length === 0 && <p className="gs-viewer-empty">Nothing yet.</p>}
        {lobby.chat.map((line) => (
          <p key={line.id} className="gs-chat-line">
            <span className="gs-chat-who">{line.displayName}</span> {line.text}
          </p>
        ))}
      </div>
      <form
        className="gs-chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          const text = draft.trim();
          if (!text) return;
          send({ type: "CHAT", text });
          setDraft("");
        }}
      >
        <label className="pa-visually-hidden" htmlFor="gs-chat-input">
          Message the lobby
        </label>
        <input
          id="gs-chat-input"
          className="pa-input"
          value={draft}
          maxLength={500}
          autoComplete="off"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          type="submit"
          className="pa-button"
          disabled={!draft.trim() || lobby.connection !== "open"}
        >
          Send
        </button>
      </form>
    </aside>
  );
}
