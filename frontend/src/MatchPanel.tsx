// The match, as the Lobby page shows it today — PHASE_06 §6.17.
//
// Moved out of LobbyPage.tsx unchanged when PHASE_07 Part X rebuilt the
// Lobby to the canvas: this is Phase 6's playable match view, and it
// stays exactly as it is until the battlefield (Phase 7 Parts I-IX)
// replaces it on the game screen (§7.60).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_MATCH,
  connectMatch,
  type Decision,
  type MatchSocket,
  type MatchState,
  type Snapshot,
  type SnapshotCard,
  type SnapshotPlayer,
} from "./match";
import { abandonMatch, type MatchView } from "./lobby";

/**
 * What the lobby shows about a live match — PHASE_06 §6.17.
 *
 * Deliberately thin. The board, the hand and the decisions are the
 * next slice; what this has to do today is stop the page claiming
 * a player is sitting in a lobby when they are in a game, and
 * change by itself when LAUNCHING becomes RUNNING. Those two are
 * the refresh-free requirement, and they are testable now.
 */
export function MatchPanel({ match, me }: { match: MatchView; me: string }) {
  const mine = match.participants.find((seat) => seat.userId === me);
  const [game, setGame] = useState<MatchState>(EMPTY_MATCH);
  const socketRef = useRef<MatchSocket | null>(null);
  const running = match.status === "RUNNING";

  // LAUNCHING COUNTS AS LIVE, and that is the whole fix for a
  // three-layer deadlock.
  //
  // The match row turns RUNNING at the first priority window,
  // which is AFTER the mulligans. Connecting only at RUNNING meant
  // a pregame question had nowhere to go: Forge waited for an
  // answer, the worker waited for Forge, the server waited for the
  // worker, and the browser was not listening yet. It went
  // unnoticed for as long as the adapter answered those questions
  // itself.
  const live = running || match.status === "LAUNCHING";
  const [confirmingAbandon, setConfirmingAbandon] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [abandonFailure, setAbandonFailure] = useState<string | null>(null);
  const finished = match.outcome !== null || match.status === "FAILED_RUNTIME";

  // §6.107 — the match socket, open only once there is a game to
  // connect to. Keyed on the match id so a second match opens a
  // second connection rather than quietly reusing the first.
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

  const decisionId = game.decision?.decisionId ?? null;
  const search = useCallback(
    (query: string) => {
      if (decisionId !== null) socketRef.current?.search(decisionId, query);
    },
    [decisionId],
  );

  return (
    <section className="panel" aria-label="Your match">
      <h2>Your match</h2>
      <p>
        {finished
          ? resultText(match, mine?.seatNumber ?? null)
          : match.status === "LAUNCHING"
            ? // A question during LAUNCHING is not a contradiction:
              // mulligans happen before the first priority window,
              // and the match row only turns RUNNING at that
              // window. Saying "Forge is loading" above a real
              // question the player has to answer would be the
              // page describing itself wrongly.
              game.decision
              ? "Setting the game up — and it needs an answer from you."
              : "Starting the game. Forge is loading — this takes a few seconds."
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

      {live && game.connection === "closed" && (
        // §5.133's rule for the game: a page that stopped being
        // told must say so rather than showing a live-looking
        // game. The decision is still pending on the server
        // (§6.112) — nothing passed on this player's behalf.
        <p className="error-text">
          You are no longer connected to the game. Reload the page — the game is still running and
          nothing has been answered for you.
        </p>
      )}

      {game.board && <Board board={game.board} matchId={match.matchId} finished={finished} />}

      {game.notice && <p className="error-text">{game.notice}</p>}
      {abandonFailure && <p className="error-text">{abandonFailure}</p>}

      {/* Not once the match is over: a question from a game that has
          ended cannot be answered (the socket is closed), and CI found a
          test clicking a failed match's mulligan for eighteen minutes.
          A player would have done the same, to no effect. */}
      {game.decision && !finished ? (
        <div className="decision">
          <h3>
            {game.decision.actedForSeat === mine?.seatNumber
              ? headingFor(game.decision.kind)
              : `Playing for seat ${game.decision.actedForSeat}`}
          </h3>
          {/* Forge's own wording, when it has any. It is more
              specific than anything this page could infer from
              the kind, so it goes above the options rather than
              replacing the heading. */}
          {game.decision.prompt && <p className="decision-prompt">{game.decision.prompt}</p>}
          {game.decision.searchable ? (
            <NameSearch
              key={game.decision.decisionId}
              decision={game.decision}
              disabled={game.awaiting !== null}
              onSearch={search}
              onChoose={answer}
            />
          ) : (
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
          )}
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
          {!game.decision.searchable && (
            <p className="hint">{hintFor(game.decision.kind, game.decision.options.length)}</p>
          )}
        </div>
      ) : (
        live && <p className="hint">Waiting for the game.</p>
      )}

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
    </section>
  );
}

/**
 * P6-AG — naming a card: search, then pick.
 *
 * Forge allows tens of thousands of names, so they are never sent.
 * The player types; the server returns what matched, from FORGE's
 * list, best match first; the player picks one of those. The page
 * never invents a name and never accepts typed text as the answer:
 * the answer is always one of the results it was sent.
 *
 * Results are shown only for the text currently in the box. A
 * reply for an older keystroke arriving late would otherwise
 * replace the list under the player's cursor.
 */
function NameSearch({
  decision,
  disabled,
  onSearch,
  onChoose,
}: {
  decision: Decision;
  disabled: boolean;
  onSearch: (query: string) => void;
  onChoose: (actionId: string) => void;
}) {
  const [query, setQuery] = useState("");
  // The server trims and caps what it searches for; compare like with like.
  const asked = query.trim().slice(0, 64);

  useEffect(() => {
    if (!asked) return;
    // Wait for a pause in typing rather than searching every key.
    const timer = window.setTimeout(() => onSearch(asked), 200);
    return () => window.clearTimeout(timer);
  }, [asked, onSearch]);

  const results = decision.results?.query === asked ? decision.results : null;

  return (
    <div className="name-search">
      <label>
        Card name
        <input
          type="search"
          value={query}
          autoFocus
          autoComplete="off"
          placeholder="Start typing a card's name"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {asked && !results && <p className="hint">Searching…</p>}
      {results && results.total === 0 && <p className="hint">No card is called that.</p>}
      {results && results.options.length > 0 && (
        <ul className="actions-list" aria-label="Matching names">
          {results.options.map((option) => (
            <li key={option.actionId}>
              <button type="button" disabled={disabled} onClick={() => onChoose(option.actionId)}>
                {option.label ?? option.actionId}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        {results && results.total > results.options.length
          ? `Showing ${results.options.length} of ${results.total.toLocaleString()} matches — type more to narrow it down.`
          : `Any of ${decision.optionCount.toLocaleString()} names Forge allows here. The list is Forge's, not this page's.`}
      </p>
    </div>
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
  // P6-AP — Forge's own sentence for why, when it gave one. Every
  // PlayerOutcome reads "has won ...", so "The winner" is its
  // subject; nothing about it is reworded.
  const why = outcome.reason ? ` The winner ${outcome.reason}.` : "";
  if (outcome.winningSeat === mySeat) return `You won${turn}.${why}`;

  // The match participant list carries seats, not names (§5.47
  // keeps other people's decks out of it, and names were never
  // needed before). With two seats "your opponent" is exact; with
  // more it would not be, so the seat is named instead. FMT-005
  // keeps that case representable even though Open Format is two.
  return match.participants.length === 2
    ? `Your opponent won${turn}.${why}`
    : `Seat ${outcome.winningSeat} won${turn}.${why}`;
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
    case "declareAttackers":
      return "Declare attackers";
    case "declareBlockers":
      return "Declare blockers";
    case "chooseDefender":
      return "Choose what to attack";
    case "chooseBlockTarget":
      return "Choose what to block";
    case "assignCombatDamage":
      return "Assign combat damage";
    case "orderSimultaneousAbilities":
      return "Choose what resolves first";
    case "chooseSingleReplacementEffect":
      return "Choose which effect applies";
    case "chooseCounterType":
      return "Choose a kind of counter";
    case "chooseModeForAbility":
      return "Choose a mode";
    case "announceRequirements":
      return "Choose how much";
    case "chooseSingleEntityForEffect":
      return "Choose one";
    case "chooseEntitiesForEffect":
      return "Choose from these";
    case "orderMoveToZoneList":
      return "Put them in order";
    case "mulliganKeepHand":
      return "Keep or mulligan";
    case "tuckCardsViaMulligan":
      return "Put a card back";
    case "chooseStartingPlayer":
      return "Play or draw";
    case "chooseSaToActivateFromOpeningHand":
      return "Begin with it on the battlefield";
    case "chooseSomeType":
      return "Choose a type";
    case "chooseColor":
    case "chooseColors":
      return "Choose a colour";
    case "chooseProtectionType":
      return "Choose protection";
    case "chooseCardName":
      return "Name a card";
    case "chooseBinary":
      return "Call it";
    case "chooseNumber":
      return "Choose a number";
    case "chooseSingleCardFace":
    case "chooseSingleSpellForEffect":
      return "Choose one";
    case "chooseSpellAbilitiesForEffect":
      return "Choose what it does";
    case "arrangeForScry":
      return "Order the top of your library";
    case "willPutCardOnTop":
      return "Top or bottom";
    case "CostPutCounter":
      return "Choose where the counter goes";
    case "CostRemoveCounter":
      return "Choose where to take a counter from";
    case "confirmTrigger":
    case "confirmAction":
    case "confirmPayment":
    case "confirmReplacementEffect":
    case "confirmStaticApplication":
      return "Confirm";
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
    case "declareAttackers":
      return "Choose attackers one at a time. Pass when you are done attacking.";
    case "declareBlockers":
      return "Choose blockers one at a time. Pass to take the damage.";
    case "assignCombatDamage":
      return "One point at a time, so nothing is assigned for you.";
    case "chooseCounterType":
      // The prompt above already names the card, because Forge
      // wrote it. What this adds is that the kind MATTERS: these
      // are not interchangeable, and nothing will pick for you.
      return "Which counter this is changes what it does. This cannot be skipped.";
    case "chooseModeForAbility":
      // A modal card does ONE of these. Passing, where it is
      // allowed at all, means "no more modes" rather than
      // cancelling the spell -- which is worth saying, because
      // every other Pass in this panel cancels something.
      return "The card does the mode you pick. Pass, if offered, takes no further mode.";
    case "chooseSingleEntityForEffect":
      // The generic chooser: sacrificing something, exiling
      // something, searching a library. Forge's own line above
      // says which, so this says where the list came from -- a
      // library search shows cards nobody else can see, and that
      // being deliberate rather than a leak is worth knowing.
      return "Forge decides what may be chosen here. The line above says what for.";
    case "mulliganKeepHand":
      // Says what mulliganing COSTS, because the prompt gives the
      // hand size and not the consequence.
      return "A mulligan draws seven again and puts one more back each time.";
    case "tuckCardsViaMulligan":
      return "These go to the bottom of your library. This cannot be skipped.";
    case "chooseStartingPlayer":
      return "On the play you are a turn ahead; on the draw you are a card ahead.";
    case "chooseSaToActivateFromOpeningHand":
      // §6.68 — it is NOT cast: no mana, no stack, nothing to respond
      // to. Saying so stops the page reading like a free spell.
      return "These start the game already on the battlefield — not cast, nothing paid. Choose them one at a time in the order they happen, then pass when you have the ones you want.";
    case "chooseSomeType":
    case "chooseColor":
    case "chooseColors":
    case "chooseProtectionType":
    case "chooseCardName":
      // Says where the list came from, because this is the one
      // family of choices that is NOT about anything on the
      // board: the list is Forge's, not the page's (P6-AH).
      return "These are the values Forge allows. Nothing here is a card on the board.";
    case "chooseBinary":
      // The call is yours; the flip is not. Worth saying, because
      // a player who calls heads and loses should know the game
      // flipped it, not the page.
      return "You call it. Forge flips it, and the result is announced.";
    case "orderMoveToZoneList":
      // The prompt names the END being chosen for — "closest to
      // the top", "closest to the bottom" — because that is the
      // entire decision, and a list of cards with no end named
      // reads as a choice of ONE rather than a sort.
      return "Each pick is the next one in order. This cannot be skipped.";
    case "chooseEntitiesForEffect":
      // Several, one click at a time. The prompt carries the
      // count -- how many more are needed, or how many more are
      // allowed -- so this says what the clicking IS.
      return "Pick them one at a time. The line above says how many more.";
    case "announceRequirements":
      // Says what the number COSTS, because that is the part a
      // list of numbers does not show. Not "the list stops at
      // what you can pay" -- it does not, deliberately, and a
      // hint that describes the page wrongly is worse than none.
      return "You pay for what you choose. The list grows as the board can pay for more.";
    case "CostPutCounter":
    case "CostRemoveCounter":
      return "This is part of paying for what you are doing. Pass to cancel it.";
    case "arrangeForScry":
    case "willPutCardOnTop":
      // A scry names library cards: worth saying they are shown to
      // this player alone, as Forge shows them.
      return "Only you can see these cards. This cannot be skipped.";
    case "chooseNumber":
      return "Forge allows these numbers. This cannot be skipped.";
    default:
      return "These are the actions Forge says you can take.";
  }
}

/**
 * The board, as this player may see it — PHASE_06 §6.40, §6.42.
 *
 * Laid out the way a table is: the opponent across from you,
 * your own side nearest. Lands sit apart from creatures because
 * that is how players actually read a board — "can they block"
 * and "can they pay" are different questions and mixing the rows
 * forces you to answer both at once.
 *
 * Nothing here is concealed. §6.42 requires hidden information
 * to be removed BEFORE serialisation, so a card this page cannot
 * name is a card whose name never arrived; a developer console
 * shows exactly what this does.
 */
function Board({
  board,
  matchId,
  finished,
}: {
  board: Snapshot;
  matchId: string;
  finished: boolean;
}) {
  const me = board.players.find((player) => player.seat === board.seat);
  const opponents = board.players.filter((player) => player.seat !== board.seat);
  const nameOf = (seat: number) =>
    board.players.find((player) => player.seat === seat)?.name ?? `Seat ${seat}`;

  return (
    <div className="board">
      <p className="hint board-turn">
        {/* §6.70 — after a restart, say which game this is, or "turn 1"
            reads as the game having gone backwards. */}
        {board.gameEpoch > 1 && `Game ${board.gameEpoch} · `}
        {board.dayTime && `It is ${board.dayTime} · `}
        {finished && board.phase ? (
          // The board is the final position; nobody's turn is going
          // on any more, and "draw · opponent's turn" said one was.
          <>
            Game over · it ended on turn {board.turn}, in the{" "}
            {board.phase.toLowerCase().replace(/_/g, " ")} step.
          </>
        ) : board.phase ? (
          <>
            Turn {board.turn} · {board.phase.toLowerCase().replace(/_/g, " ")} ·{" "}
            {board.activeSeat === board.seat ? "your turn" : "opponent’s turn"}
          </>
        ) : (
          // Before the first turn there is no phase and no active
          // player, and saying "turn 0, opponent’s turn" about a
          // mulligan is three wrong things in one line.
          "Before the game begins."
        )}
      </p>

      {/*
        P6-AM — what Forge told YOU. A flip, a roll, a card looked
        at. Private to this seat, and the newest last so it reads
        like a short log rather than a stack.
      */}
      {board.notices.length > 0 && (
        <ul className="board-notices">
          {board.notices.map((text, index) => (
            <li key={`${index}-${text}`}>{text}</li>
          ))}
        </ul>
      )}

      {opponents.map((player) => {
        const seen = board.otherHands.filter((card) => card.seat === player.seat);
        return (
          <div key={player.seat}>
            <PlayerSide
              player={player}
              cards={board.battlefield.filter((card) => card.seat === player.seat)}
              battlefield={board.battlefield}
              viewerSeat={board.seat}
              nameOf={nameOf}
              mine={false}
              matchId={matchId}
            />
            {seen.length > 0 && (
              // Only ever what Forge let this viewer see -- Mindslaver's
              // controller, or an effect that reveals a hand.
              <div className="board-zone board-other-hand">
                <h4>
                  {player.name}’s hand — you can see it ({seen.length})
                </h4>
                <ul className="board-cards">
                  {seen.map((card) => (
                    <CardChip
                      key={card.id}
                      card={card}
                      mine={false}
                      attachments={[]}
                      matchId={matchId}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}

      {board.stack.length > 0 && (
        <div className="board-stack">
          <h4>On the stack</h4>
          <ul className="board-cards">
            {board.stack.map((item) => (
              <li key={item.id} className="card-chip stacked">
                {item.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      {me && (
        <PlayerSide
          player={me}
          cards={board.battlefield.filter((card) => card.seat === me.seat)}
          battlefield={board.battlefield}
          viewerSeat={board.seat}
          nameOf={nameOf}
          mine
          matchId={matchId}
        />
      )}

      <div className="board-zone board-hand">
        <h4>Your hand ({board.hand.length})</h4>
        {board.hand.length === 0 ? (
          <p className="hint">Empty.</p>
        ) : (
          <ul className="board-cards">
            {board.hand.map((card) => (
              <CardChip key={card.id} card={card} mine attachments={[]} matchId={matchId} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** One player: their totals, then their creatures, then their lands. */
function PlayerSide({
  player,
  cards,
  battlefield,
  viewerSeat,
  nameOf,
  mine,
  matchId,
}: {
  player: SnapshotPlayer;
  cards: SnapshotCard[];
  battlefield: SnapshotCard[];
  viewerSeat: number;
  nameOf: (seat: number) => string;
  mine: boolean;
  matchId: string;
}) {
  // Auras and equipment are drawn WITH what they modify. An
  // equipment in its own row tells you nothing about which
  // creature is now a 5/5.
  //
  // WHOEVER controls them (P6-AK). They were looked for among this
  // side's own cards only, so your Pacifism on an opponent's creature
  // was drawn nowhere at all: an attachment on your side, its host on
  // theirs. One whose host is not on the battlefield stays a card of
  // its own rather than vanishing.
  const present = new Set(battlefield.map((card) => card.id));
  const standalone = cards.filter(
    (card) => card.attachedTo === null || !present.has(card.attachedTo),
  );
  const attachedTo = (id: string) => {
    const host = battlefield.find((card) => card.id === id);
    return battlefield
      .filter((card) => card.attachedTo === id)
      .map((attached) =>
        !host || attached.seat === host.seat
          ? attached
          : {
              ...attached,
              name: `${attached.name} (${attached.seat === viewerSeat ? "yours" : `${nameOf(attached.seat)}'s`})`,
            },
      );
  };

  const creatures = standalone.filter((card) => card.kind === "creature");
  const lands = standalone.filter((card) => card.kind === "land");
  const rest = standalone.filter((card) => card.kind !== "creature" && card.kind !== "land");

  return (
    <section className={mine ? "board-side mine" : "board-side theirs"}>
      <div className="row board-totals">
        <span className="name">
          {player.name}
          {mine ? " (you)" : ""}
        </span>
        <span className="state">
          {player.life} life · {player.handCount} in hand · {player.libraryCount} in library
          {player.graveyardCount > 0 ? ` · ${player.graveyardCount} in graveyard` : ""}
          {/* §6.96 — Forge's player state, as sent: poison, energy,
              the monarch, a dungeon or emblem in the command zone. */}
          {player.counters
            .map((counter) => ` · ${counter.count} ${counter.name.toLowerCase()}`)
            .join("")}
          {player.designations.map((designation) => ` · ${designation}`).join("")}
          {player.command.length > 0 ? ` · command zone: ${player.command.join(", ")}` : ""}
          {player.ringTempted > 0
            ? ` · the Ring has tempted ${mine ? "you" : player.name} ${player.ringTempted}×`
            : ""}
          {player.dungeonsCompleted.length > 0
            ? ` · dungeons completed: ${player.dungeonsCompleted.join(", ")}`
            : ""}
        </span>
      </div>

      {standalone.length === 0 ? (
        <p className="hint board-empty">Nothing in play.</p>
      ) : (
        <>
          <CardRow
            label="Creatures"
            cards={creatures}
            mine={mine}
            attachedTo={attachedTo}
            matchId={matchId}
          />
          <CardRow
            label="Other"
            cards={rest}
            mine={mine}
            attachedTo={attachedTo}
            matchId={matchId}
          />
          <CardRow
            label="Lands"
            cards={lands}
            mine={mine}
            attachedTo={attachedTo}
            matchId={matchId}
          />
        </>
      )}
    </section>
  );
}

function CardRow({
  label,
  cards,
  mine,
  attachedTo,
  matchId,
}: {
  label: string;
  cards: SnapshotCard[];
  mine: boolean;
  attachedTo: (id: string) => SnapshotCard[];
  matchId: string;
}) {
  if (cards.length === 0) return null;
  return (
    <div className="board-row">
      <span className="board-row-label">{label}</span>
      <ul className="board-cards">
        {cards.map((card) => (
          <CardChip
            key={card.id}
            card={card}
            mine={mine}
            attachments={attachedTo(card.id)}
            matchId={matchId}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * One permanent.
 *
 * Tapped is shown by rotating it AND said in words, because
 * colour and angle alone are not labels — a player who cannot
 * tell the two apart still has to know which lands are spent.
 */
function CardChip({
  card,
  mine,
  attachments,
  matchId,
}: {
  card: SnapshotCard;
  mine: boolean;
  attachments: SnapshotCard[];
  matchId: string;
}) {
  const classes = ["card-chip"];
  if (card.tapped) classes.push("tapped");
  if (!mine) classes.push("theirs");
  if (!card.known) classes.push("unknown");
  if (card.attacking) classes.push("attacking");
  if (card.blocking) classes.push("blocking");

  // Damage is subtracted so the number means what a player
  // means by it: what this creature has LEFT.
  const remaining = card.toughness === null ? null : card.toughness - card.damage;

  return (
    <li className={classes.join(" ")}>
      {/*
        §6.131 — a functional image, and the name stays either way.
        The artwork is small at this size and a player still has to
        be able to read what something is; Phase 7 owns what this
        eventually looks like (§6.121 is explicit that layout, size
        and composition are not Phase 6's).

        A broken or missing image must not take the card with it,
        so the name is a sibling rather than a caption, and the
        element simply is not rendered when there is no reference.
      */}
      {card.art && (
        <img
          className="card-art"
          src={`/api/matches/${matchId}/assets/${card.art}`}
          alt=""
          loading="lazy"
        />
      )}
      <span className="card-name">{card.name}</span>
      {card.power !== null && card.toughness !== null && (
        <span className="card-pt">
          {card.power}/{remaining}
          {card.damage > 0 ? ` (${card.damage} damage)` : ""}
        </span>
      )}
      {card.keywords.length > 0 && (
        <span className="card-keywords">{card.keywords.join(" · ")}</span>
      )}
      {card.counters.length > 0 && (
        <span className="card-counters">
          {card.counters.map((counter) => `${counter.count} ${counter.name}`).join(", ")}
        </span>
      )}
      {/* P6-I — your own face-down card, named for you (the worker
          only names it to a viewer Forge lets identify it) and said
          to be face down; the opponent's chip just says Face-down. */}
      {card.faceDown && card.known && <span className="card-note">face down</span>}
      {card.ringBearer && <span className="card-note">Ring-bearer</span>}
      {card.sick && <span className="card-note">summoning sick</span>}
      {card.attacking && <span className="card-note">attacking</span>}
      {card.blocking && <span className="card-note">blocking</span>}
      {card.tapped && <span className="card-note">tapped</span>}
      {attachments.length > 0 && (
        <span className="card-attached">
          {attachments.map((attached) => attached.name).join(", ")}
        </span>
      )}
    </li>
  );
}

function matchUrl(matchId: string): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/ws/matches/${matchId}`;
}
