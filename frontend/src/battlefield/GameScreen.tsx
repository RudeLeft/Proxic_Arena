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

import { AimPointer } from "./AimPointer";
import { ReportButton, type ReportGame } from "../ReportDialog";
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useShownLife } from "./lifeTicks";
import libraryArt from "../assets/zones/library.webp";
import graveyardArt from "../assets/zones/graveyard.webp";
import exileArt from "../assets/zones/exile.webp";
import { useLobbyConnection } from "../shell/LobbyConnection";
import { Avatar, avatarUrl } from "../avatars";
import { GameChat } from "./GameChat";
import { avatarOf, holdsBelt, rankOf } from "../lobbyView";
import { BeltMark } from "../BeltMark";
import { FitName } from "../FitName";
import {
  EMPTY_MATCH,
  concessionText,
  awayEndText,
  connectMatch,
  type Decision,
  type DecisionOption,
  type MatchSocket,
  type MatchState,
  type NotNowRow,
  type Snapshot,
  type SnapshotCard,
  type SnapshotPlayer,
} from "../match";
import { abandonMatch, type MatchView } from "../lobby";
import {
  NameSearch,
  cancelWords,
  headingFor,
  hintFor,
  matchUrl,
  optionalCostTitle,
  resultText,
  SERVER_UPDATE_LINE,
  SERVER_UPDATE_TITLE,
  SERVER_UPDATE_WORDS,
  serverWasUpdated,
  targetWords,
} from "../matchText";
import { Board, CardFace, counterWords, figure, lookOf, shortType } from "./Board";
import { boardFromSnapshot } from "./fromSnapshot";
import { clickOn, questionOf, type Question } from "./interaction";
import { DISCARD_KIND, discardCount, discardWords, togglePick } from "./discard";
import { PAY_HOLD_MS, payMarks, withPick, withoutPick, type PayMark } from "./payPicks";
import { LoadingRing, useVortexHandover } from "./LoadingRing";
import { stackSpotBoxes } from "./effects";
import { OPPONENT_HAND_ORIGIN, type Box, type Geometry } from "./layout";
import { anchors, boxAt } from "./motion";
import { castCancelled, castOrigin, hiddenInHand, type CastOrigin } from "./theirCast";
import type { TheirGlide } from "./CastingCard";
import {
  CastingCard,
  CastingFlight,
  castingBox,
  owingSymbols,
  keepPaying,
  costPips,
  type Paying,
} from "./CastingCard";
import {
  BALLS_LONGEST_MS,
  ManaBalls,
  PILL_HOLD_MS,
  assignBalls,
  latestPayment,
  newLedger,
  paymentFor,
  pending,
  type PayPip,
} from "./manaBalls";
import {
  ChoiceWindow,
  ListTray,
  NameWindow,
  NUMBER_KINDS,
  NumberWindow,
  TableQuestionWindow,
  payTitle,
  sourceOf,
  targetsTitle,
} from "./QuestionWindows";
import { RevealTray } from "./RevealTray";
import { StatusTray } from "./StatusTray";
import { AwayWindow } from "./AwayWindow";
import {
  CrankWindow,
  DICE_KINDS,
  DiceWindow,
  DungeonWindow,
  ModesWindow,
  ROLL_LINGER_MS,
  RollsOverlay,
  SectorWindow,
  SprocketWindow,
  binaryTitle,
} from "./DiceWindows";
import { anchorByCard, PeekFoot, usePeek, WindowFacts, type Anchor } from "./GameWindow";
import { ConfirmWindow, CopyTargetWindow, OrderTray } from "./TriggerWindows";
import {
  DamageTray,
  DivideTray,
  HiddenZoneTray,
  OrderCardsTray,
  PilesTray,
  RowsTray,
  SplitTray,
} from "./CardTrays";
import { orderSteps, stepAnswer, trayOf, type PlanStep } from "./cardPlans";
import {
  afterAuto,
  autoAnswer,
  endsCopies,
  isCopyTarget,
  PASS_ANSWER,
  sameTrigger,
  stackWords,
  yesNo,
  type Copies,
} from "./triggers";
import { holdActive } from "../activity";
import { useSettled } from "../useSettled";
import { NoticeStack } from "../NoticeStack";
import { GAME_MESSAGE_MS, inArrival, newNotices, noticeParts, type Notice } from "../notices";
import { usePageNotices } from "../shell/PageNotices";
import { SharpCard, closeUpOf, fetchAhead, pictureUrl } from "../closeUp";
import { ManaCost, ManaText, costChange, manaSymbols, withSymbols } from "./ManaCost";
import {
  combatPart,
  gameOverWords,
  passWords,
  STEPS,
  totalPower,
  unblockedPower,
  waitingLine,
} from "./stops";
import { groupCopies, printedPt, zoneNotes, type ZoneName } from "./zoneTray";
import { OpeningHand, OPENING_KINDS, optionFor } from "./OpeningHand";
import { abilityParts } from "./abilities";
import {
  DECLARE_KINDS,
  combatTargets,
  joinable,
  planAnswer,
  planFor,
  toggleSelected,
  type CombatPlan,
} from "./combatPlan";
import "./game.css";

/** A notice stays this long, then fades: the board is the record (§7.57). */
/** Spec 0005 — the response window on your own spell or trigger (spec 0035, owner 2026-10-29: 5 s). */
const RESPONSE_WINDOW_MS = 5000;
/** How long an opponent's spell nobody could answer stays on screen (owner 2026-10-22). */
const HOLD_MS = 1500;

export function GameScreen({
  match,
  me,
  onLeave,
  watching = false,
  onSpectateAnother = null,
}: {
  match: MatchView;
  me: string;
  /** Back to the lobby, once the game is over. */
  onLeave: () => void;
  /** Spec 0047 -- a spectator: the public table, never asked, nothing to send. */
  watching?: boolean;
  /** Spec 0067 -- a spectator's "Spectate another game", when one is running; null when none. */
  onSpectateAnother?: (() => void) | null;
}) {
  const mine = match.participants.find((seat) => seat.userId === me);
  const [game, setGame] = useState<MatchState>(EMPTY_MATCH);
  const socketRef = useRef<MatchSocket | null>(null);
  // LAUNCHING counts as live: the mulligans come before the match row
  // turns RUNNING (Phase 6's three-layer deadlock).
  const live = match.status === "RUNNING" || match.status === "LAUNCHING";
  // Spec 0067 -- a spectator is told the end on this socket (MATCH_ENDED),
  // not by the lobby: the result, by seat. A spectator's socket the server
  // closed for good with no word (a server restarted under it) is over too.
  const ended = watching ? (game.ended ?? null) : null;
  const lostTouch = watching && game.connection === "closed" && !ended;
  const result: MatchView = ended
    ? { ...match, status: ended.status, failureCode: ended.failureCode, outcome: ended.outcome }
    : match;
  // Spec 0056 — the server stopped under the game (an update): over, and
  // said plainly, from the server's word on this socket or the match's end.
  const updated = serverWasUpdated(result, game.serverStopping === true);
  const finished =
    result.outcome !== null ||
    result.status === "FAILED_RUNTIME" ||
    updated ||
    ended !== null ||
    lostTouch;
  const sentence = updated
    ? SERVER_UPDATE_WORDS
    : resultText(
        result,
        mine?.seatNumber ?? null,
        watching ? (seat) => game.board?.players.find((p) => p.seat === seat)?.name : null,
      );
  // W-24 — the result banner put away, to look at how the game ended.
  const [resultAside, setResultAside] = useState(false);
  // Shown only when it lasts: a refresh or a blip is not news (owner 2026-10-24).
  const reconnecting = useSettled(game.connection === "reconnecting", 1500);
  // Spec 0050 — the page's notices and the game's own, top right of the table.
  const pageNotices = usePageNotices();
  const said = useGameMessages(game.board);
  const tableOrder = useRef(new Map<string, number>());
  const connection: Notice[] = [];
  if (live && reconnecting && !finished) {
    connection.push({
      key: "game-reconnecting",
      tone: "blue",
      label: "Connection",
      title: "Reconnecting to the game…",
      // Spec 0067 -- a spectator's hiccup: the game carries on, and so do they.
      line: watching
        ? "The game carries on. You'll be back in a moment."
        : "The game is still running, and nothing is answered for you while you're away.",
      actions: [],
    });
  }
  if (live && game.connection === "closed" && !finished) {
    connection.push({
      key: "game-lost",
      tone: "red",
      label: "Connection",
      title: "You're no longer connected to the game",
      line: "The game is still running and nothing has been answered for you.",
      actions: [{ label: "Reload", primary: true, run: () => window.location.reload() }],
    });
  }
  const tableNotices = inArrival([...pageNotices, ...connection, ...said], tableOrder.current);

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

  // Owner 2026-10-22: a spell the other player cast, that you could not
  // answer, resolved before it was ever drawn -- it read as being skipped.
  // A board that shows it on the stack is held HOLD_MS before the next is
  // drawn, unless a question for you arrives first (then you see it on
  // the question's board anyway).
  const latest = game.board;
  // Spec 0015 — the close-ups of the cards in view, fetched ahead so a
  // zoom is sharp at once. Each picture is fetched once per tab -- and,
  // at its one address (spec 0052), once per browser across games.
  useEffect(() => {
    if (!latest) return;
    const cards = [...latest.hand, ...latest.battlefield, ...latest.otherHands, ...latest.stack];
    fetchAhead(cards.flatMap((card) => (card.art ? [closeUpOf(pictureUrl(card.art))] : [])));
  }, [latest]);
  const [held, setHeld] = useState<Snapshot | null>(null);
  const askedNow = !finished && game.decision !== null;
  // Spec 0009 — a player the game is asking is not away.
  useEffect(() => {
    holdActive(askedNow);
    return () => holdActive(false);
  }, [askedNow]);
  const spotlight = game.spotlight;
  const askedRef = useRef(askedNow);
  askedRef.current = askedNow;
  useEffect(() => {
    // Only when you are not asked: a question shows the stack itself.
    if (spotlight && !askedRef.current) setHeld(spotlight);
  }, [spotlight]);
  useEffect(() => {
    if (askedNow) setHeld(null);
  }, [askedNow]);
  useEffect(() => {
    if (!held) return undefined;
    const timer = window.setTimeout(() => setHeld(null), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [held]);

  // The snapshot before this one, for where arriving cards came from.
  const frames = useRef<{ current: Snapshot | null; previous: Snapshot | null }>({
    current: null,
    previous: null,
  });
  // Spec 0067 (checklist 7) -- "Switch sides": a spectator looks from the
  // other player's side. The public view is the same for both (no hand,
  // nothing face down is named), so this only turns the table round.
  const [flipped, setFlipped] = useState(false);
  // The turn: the table fades to the felt, turns round under it, and fades
  // back while the plates glide to their new ends (P10-R1: nothing jumps).
  const [turning, setTurning] = useState(0);
  const switchSides = useCallback(() => {
    setTurning((n) => n + 1);
    window.setTimeout(() => setFlipped((was) => !was), SWITCH_SIDES_MS / 2);
  }, []);
  useEffect(() => {
    if (turning === 0) return undefined;
    const timer = window.setTimeout(() => setTurning(0), SWITCH_SIDES_MS);
    return () => window.clearTimeout(timer);
  }, [turning]);
  const shownBoard = held && !askedNow ? held : latest;
  const board = useMemo(
    () => turnedRound(shownBoard, watching && flipped),
    [shownBoard, watching, flipped],
  );
  // Spec 0039 — what a report sent from here knows about this moment.
  const reportGame = useMemo<ReportGame | undefined>(() => {
    if (!board) return undefined;
    const them = board.players.find((p) => p.seat !== board.seat);
    const names = [...board.battlefield, ...board.hand, ...board.stack]
      .map((card) => card.name)
      .filter((name) => name && name !== "Face-down");
    return {
      matchId: match.matchId,
      opponent: them?.name ?? "your opponent",
      turn: board.turn,
      whose: board.activeSeat === board.seat ? "your turn" : `${them?.name ?? "their"}’s turn`,
      step: STEPS.find((s) => s.phases.includes(board.phase))?.label ?? board.phase,
      cards: [...new Set(names)].sort(),
    };
  }, [board, match.matchId]);
  if (board && board !== frames.current.current) {
    // Spec 0067 -- a spectator's table turned round is not a move: nothing
    // flies from where it was drawn on the other side (the turn is a fade).
    const turned = frames.current.current !== null && frames.current.current.seat !== board.seat;
    frames.current = { current: board, previous: turned ? null : frames.current.current };
  }
  const data = useMemo(
    () => (board ? boardFromSnapshot(board, frames.current.previous) : null),
    [board],
  );
  // Spec 0064 -- the play log only as far as the board on the table: a line
  // that came with a board still held back (a spell shown for a moment) waits
  // for it (HID-005: never ahead of the table).
  const shownRevision = board?.stateRevision ?? -1;
  const playLog = useMemo(
    () => (game.playLog ?? []).filter((line) => line.rev <= shownRevision),
    [game.playLog, shownRevision],
  );
  // The loading ring only once loading takes a moment: a refreshed game
  // draws its board in a few hundredths of a second, and the ring
  // flashing first looked like a hiccup (owner 2026-10-24).
  // Spec 0067 (checklist 8): a spectator's page has shown the swirl since
  // the click, so it carries straight on -- one loading screen, not two.
  const ringWait = useSettled(!(data && board), 400);
  const ringDue = ringWait || (watching && !(data && board));
  // Spec 0013 — the corner icons wait for the board. A start that hangs
  // must still be abandonable, so after a long wait the gear comes back.
  const longLoad = useSettled(!(data && board), 20_000);
  const drawn = Boolean(data && board);
  // Spec 0065 -- the loading screen stays on past the board's arrival for
  // its burst (BURST_MS), over the table, which is drawn at once.
  const vortex = useVortexHandover(drawn, ringDue);
  // W-24 — said once: the banner, and the column's button under it. A
  // spectator is nobody's "you"; a spectator goes back to the lobby, a
  // player to their room, which is open again with both still seated.
  const over: GameOver | null = finished
    ? {
        ...(lostTouch && !updated
          ? { word: "Game over", sub: "", turn: "" }
          : endingWords(result, board, updated, sentence)),
        won: Boolean(
          !updated && board && !board.spectator && result.outcome?.winningSeat === board.seat,
        ),
        aside: resultAside,
        leaveWord: watching ? "Back to the lobby" : "Back to the room",
        onShow: () => setResultAside(false),
      }
    : null;

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
  const chosenTargets = useMemo(() => new Set(question?.chosen ?? []), [question]);
  // Spec 0070 -- the cards picked so far to pay a cost: marked, and a click takes one back.
  // Held between a pick and the next question (payPicks.ts PAY_HOLD_MS).
  const [heldPicks, setHeldPicks] = useState<ReadonlyMap<string, PayMark>>(() => new Map());
  useEffect(() => {
    if (decision) {
      setHeldPicks(payMarks(decision));
      return;
    }
    const timer = window.setTimeout(() => setHeldPicks(new Map()), PAY_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [decision]);
  // Once answered (awaiting its receipt) the held marks show: the card just
  // clicked is marked at once.
  const answeredPick = decision !== null && game.awaiting === decision.decisionId;
  const payPicks = useMemo(
    () => (decision && !answeredPick ? payMarks(decision) : heldPicks),
    [decision, answeredPick, heldPicks],
  );
  // Owner 2026-10-21: what each hand card's cast costs right now.
  // Spec 0058, item 2: from every snapshot of your hand (`costNow`), not only
  // the options of a "what will you play" question -- so the cost stays
  // reduced while you pay, target, wait, and on the other player's turn.
  const handCosts = useMemo(() => {
    const costs = new Map<string, string>();
    for (const card of board?.hand ?? []) if (card.costNow) costs.set(card.id, card.costNow);
    return costs;
  }, [board]);
  // Spec 0058, item 2 -- and the card being cast keeps the cost it had in
  // the hand until the game says what is being paid (items 6-7).
  const lastHandCosts = useRef(new Map<string, string>());
  for (const [id, cost] of handCosts) lastHandCosts.current.set(id, cost);
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
  // Phase 9 W-16: in the ability panel, until clicked away (it faded).
  const [why, setWhy] = useState<{ objectId: string; text: string } | null>(null);
  // Spec 0058, item 4 -- a click that only selects (the blue ring): a note
  // by the card that fades. `n` counts clicks, so each one shows it again.
  const [nothing, setNothing] = useState<{ objectId: string; n: number } | null>(null);
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
  // Spec 0054 (owner 2026-11-03) — the other player has been offline as
  // long as the server's away setting (game.awayMinutes, from the
  // greeting): the one still here may keep waiting, or end the game as the
  // other's concession. The server checks the time again; this only says
  // when to offer it. Offline is the lobby's word for it, and only trusted
  // while the lobby can see YOU (a dropped lobby shows everybody gone).
  const theirId = match.participants.find((seat) => seat.userId !== me)?.userId ?? null;
  const lobbySeesMe = lobby.presence.some((p) => p.userId === me);
  const theyAreGone =
    theirId !== null && lobbySeesMe && !lobby.presence.some((p) => p.userId === theirId);
  const theirLastSeen = lobby.players.find((p) => p.userId === theirId)?.lastSeenAt ?? null;
  const theirName =
    lobby.players.find((p) => p.userId === theirId)?.displayName ?? "The other player";
  const [goneSince, setGoneSince] = useState<number | null>(null);
  useEffect(() => {
    if (!theyAreGone) setGoneSince(null);
    else {
      // The earliest we know of: "last seen" may arrive after "gone".
      const seen = theirLastSeen ? Date.parse(theirLastSeen) : NaN;
      setGoneSince((was) =>
        Number.isNaN(seen) ? (was ?? Date.now()) : was === null ? seen : Math.min(was, seen),
      );
    }
  }, [theyAreGone, theirLastSeen]);
  const [awayNow, setAwayNow] = useState(() => Date.now());
  useEffect(() => {
    if (goneSince === null) return undefined;
    setAwayNow(Date.now());
    const timer = window.setInterval(() => setAwayNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [goneSince]);
  const [keptWaiting, setKeptWaiting] = useState<number | null>(null);
  // W-26 -- how long they have been gone, on their plate from the moment they drop.
  const theirAway =
    !watching && live && goneSince !== null
      ? Math.max(0, Math.floor((awayNow - goneSince) / 60_000))
      : null;
  const awayLong =
    !watching &&
    live &&
    goneSince !== null &&
    awayNow - goneSince >= game.awayMinutes * 60_000 &&
    keptWaiting !== goneSince;
  // Spec 0028 — each stack object with its caster's picture.
  const stackShown = useMemo(
    () =>
      (data?.stack ?? []).map((entry) => {
        const userId = match.participants.find((p) => p.seatNumber === entry.seat)?.userId;
        return { ...entry, caster: userId ? avatarUrl(avatarOf(lobby, userId)) : null };
      }),
    [data, match.participants, lobby],
  );
  const [listOpen, setListOpen] = useState(false);

  // A new question (or none) clears what the last one had picked.
  useEffect(() => {
    setSelected(null);
    setOffer(null);
    setListOpen(false);
  }, [decision?.decisionId]);

  // PHASE_09 W-06 (owner 2026-10-30) -- what the player chose to answer
  // once for many copies of one trigger: "Same target for all" (ticked to
  // start) and "Yes to all".
  const [copies, setCopies] = useState<Copies | null>(null);
  const [sameTarget, setSameTarget] = useState(true);
  // The last question answered, by the player or for them: never twice.
  const answered = useRef<number | null>(null);
  useEffect(() => {
    if (decision && isCopyTarget(decision) && decision.about?.copy === 1) setSameTarget(true);
  }, [decision]);

  const answer = useCallback(
    (actionId: string | null) => {
      if (!decision) return;
      answered.current = decision.decisionId;
      // Amendment 13 (item 1): a pause lasts until the player passes --
      // resolving the spell, or moving on.
      if (actionId === null && decision.kind === "chooseSpellAbilityToPlay") setPaused(false);
      // W-07 -- Brainstorm: a card from the hand to the top, numbered in
      // the order clicked.
      if (
        actionId &&
        decision.kind === "chooseEntitiesForEffect" &&
        decision.arrange?.to === "top"
      ) {
        const card = decision.options.find((o) => o.actionId === actionId)?.objectId;
        if (card) setHandOrder((list) => [...list, card]);
      }
      // The first copy's target, however it was chosen (bubble or board).
      if (actionId && isCopyTarget(decision) && (decision.about?.copy ?? 1) === 1) {
        const chosen = decision.options.find((o) => o.actionId === actionId);
        setCopies({
          name: decision.about!.name,
          target: sameTarget ? (chosen?.objectId ?? null) : null,
          yesLeft: 0,
          noLeft: 0,
        });
      }
      // §6.132: the question stays on screen until the server says it was
      // taken; a refusal puts the player back where they were.
      setGame((previous) => ({ ...previous, awaiting: decision.decisionId, notice: null }));
      setSelected(null);
      setOffer(null);
      socketRef.current?.answer(decision.decisionId, actionId);
    },
    [decision, sameTarget],
  );

  // PHASE_09 W-05, W-06 -- answers the player already gave: the same
  // target again, yes again, the rest of an order they clicked. Once per
  // question; a question of another card ends them.
  const [orderQueue, setOrderQueue] = useState<string[]>([]);
  // Phase 9 Amendment 21 -- the modes ticked in one window, still to give
  // the game's one-mode-at-a-time questions; [] then means "no more".
  // Kept across the other questions casting asks between them (a cost);
  // the next priority question ends it.
  const [modeQueue, setModeQueue] = useState<string[] | null>(null);
  // Phase 9 W-15 -- the cards still to put back, or to begin in play
  // (then no more), clicked at once and asked one at a time.
  const [openingQueue, setOpeningQueue] = useState<{
    kind:
      | "tuckCardsViaMulligan"
      | "chooseSaToActivateFromOpeningHand"
      // Spec 0061, item 3 -- the rest of the cards picked to discard.
      | typeof DISCARD_KIND;
    cards: string[];
  } | null>(null);
  // PHASE_09 group 3 (W-07..W-10) -- the answers a card tray gave for the
  // game's one-card-at-a-time questions still to come (cardPlans.ts),
  // and Brainstorm's cards clicked in the hand, in the order they go on
  // top. A question a step does not fit ends the plan.
  const [plan, setPlan] = useState<PlanStep[]>([]);
  const [handOrder, setHandOrder] = useState<string[]>([]);
  // Spec 0043 -- "Let it all resolve": the stack objects there when it was
  // pressed. The page passes while only those are left; anything new on
  // the stack, or an empty one, ends it.
  const [resolveAll, setResolveAll] = useState<Set<string> | null>(null);

  // Spec 0042 -- the spell being cast floats in the middle (CastingCard):
  // it rises from where it was clicked, and when it is cast (or cancelled)
  // flies to where it went. `atRef` is the board's latest "where is it".
  //
  // Spec 0044 -- an optional cost (Bargain, kicker) is asked while the
  // card is still in the hand: it floats for that question too. The
  // opponent's spell shows its back until it is on the stack.
  //
  // Spec 0068 -- always in the middle of the screen (castingBox).
  const optionalSource =
    board && decision?.kind === "chooseOptionalCosts" && !board.casting.length
      ? sourceOf(board, decision)
      : null;
  const optionalFromHand =
    optionalSource && board?.hand.some((card) => card.id === optionalSource.id)
      ? optionalSource
      : null;
  const castingNow = board?.casting[0] ?? optionalFromHand;
  // Spec 0062 -- the balls: which steps flew, which landed (manaBalls). A
  // landing re-draws the page (the cast card may then go).
  const balls = useRef(newLedger());
  const [, setBallsLanded] = useState(0);
  const ballsLanded = useCallback(() => setBallsLanded((n) => n + 1), []);
  const payments = board?.payments;
  // Spec 0062 -- the last mana's ball flies after the card is cast: the card
  // stays exactly where it is until every ball for it has landed (P10-R1:
  // its pips must still be there to light), then flies as before. Bounded
  // by BALLS_LONGEST_MS, whatever the balls do.
  const lastCasting = useRef<{
    card: SnapshotCard;
    hidden: boolean;
    handCount: number;
    /** Spec 0072 -- the other player's: where it was cast from (null: yours). */
    origin: CastOrigin | null;
    libraryCount: number;
    /** The battlefield while it was being cast: what is new after is it. */
    battlefield: Set<string>;
  } | null>(null);
  const lingerSince = useRef<{ id: string; at: number } | null>(null);
  const wasCasting = lastCasting.current;
  const lingerFor =
    !castingNow &&
    wasCasting &&
    (payments ?? []).some((p) => p.for === wasCasting.card.id && pending(balls.current, p.n))
      ? wasCasting.card
      : null;
  if (lingerFor && lingerSince.current?.id !== lingerFor.id) {
    lingerSince.current = { id: lingerFor.id, at: Date.now() };
  }
  if (!lingerFor) lingerSince.current = null;
  const lingering =
    lingerFor && lingerSince.current && Date.now() - lingerSince.current.at < BALLS_LONGEST_MS
      ? lingerFor
      : null;
  useEffect(() => {
    if (!lingering) return undefined;
    const timer = window.setTimeout(ballsLanded, BALLS_LONGEST_MS);
    return () => window.clearTimeout(timer);
  }, [lingering, ballsLanded]);
  const casting = castingNow ?? lingering;
  // Spec 0062 -- this cast's payment: its steps since the card appeared (an
  // earlier cast of the same card, cancelled, is not this one).
  const castSince = useRef<{ id: string; n: number } | null>(null);
  if (casting && castSince.current?.id !== casting.id) {
    castSince.current = {
      id: casting.id,
      n: (payments ?? []).reduce((most, p) => Math.max(most, p.n), 0),
    };
  }
  const castPaid = casting
    ? paymentFor(
        payments,
        casting.id,
        castSince.current?.id === casting.id ? castSince.current.n : 0,
      )
    : null;
  // Spec 0058, items 6-7 -- the cost under the card being cast: the cost
  // being PAID (the first payment question's "still owing": mutate's
  // {2}{B/G}{B/G}, an evoke or a reduced cost), and the last "still owing"
  // kept between payment questions, so nothing flashes back to unpaid.
  // Before the first payment (a target is asked first), the cost it had in
  // the hand, reduced or not.
  const paying = useRef<Paying | null>(null);
  paying.current = keepPaying(
    paying.current,
    casting?.id ?? null,
    decision?.kind === "applyManaToCost"
      ? owingSymbols(
          decision.owing,
          decision.options.map((o) => o.label),
        )
      : null,
  );
  // Spec 0062 -- the cost the game says this payment began with (convoke's
  // whole {4}{W}, not what was left for the lands) comes first.
  const castCost =
    (castPaid?.cost ? manaSymbols(castPaid.cost) : null) ??
    paying.current?.cost ??
    (casting ? manaSymbols(lastHandCosts.current.get(casting.id) ?? casting.manaCost) : null);
  const castOwing = paying.current?.owing ?? null;
  // Spec 0062 -- "Still to pay" for an ability or trigger: every symbol of
  // its cost kept, each lit as it is paid. The payer's while asked (until
  // the first step, the cost asked is all there is); anyone's -- the other
  // player sees it too: an ability is public -- while its balls fly, and a
  // moment after (PILL_HOLD_MS), so the last symbol is seen lit.
  const newest = latestPayment(payments);
  const abilityPay = newest && newest.kind !== "cast" ? newest : null;
  const abilityFlying = abilityPay?.steps.some((n) => pending(balls.current, n)) ?? false;
  const abilityLanded = abilityPay
    ? Math.max(0, ...abilityPay.steps.map((n) => balls.current.landed.get(n) ?? 0))
    : 0;
  const abilityHeld =
    !abilityFlying && abilityLanded > 0 && Date.now() - abilityLanded < PILL_HOLD_MS;
  useEffect(() => {
    if (!abilityHeld) return undefined;
    const timer = window.setTimeout(ballsLanded, PILL_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [abilityHeld, abilityLanded, ballsLanded]);
  const owingNow =
    decision?.kind === "applyManaToCost" && !casting
      ? owingSymbols(
          decision.owing,
          decision.options.map((o) => o.label),
        )
      : null;
  let stackPay: PayPip[] | null = null;
  if (owingNow) {
    // This payment's steps, if the game has told any: the newest payment,
    // this player's, owing what the question says.
    const same =
      abilityPay?.cost &&
      abilityPay.seat === board?.seat &&
      manaSymbols(abilityPay.owing).join() === owingNow.join();
    stackPay = same
      ? assignBalls(costPips(manaSymbols(abilityPay.cost), owingNow), abilityPay.mana)
      : assignBalls(costPips(owingNow, null), []);
  } else if (abilityPay?.cost && (abilityFlying || abilityHeld)) {
    stackPay = assignBalls(
      costPips(manaSymbols(abilityPay.cost), manaSymbols(abilityPay.owing)),
      abilityPay.mana,
    );
  }
  // Spec 0068 -- the middle of the screen, for every question and between
  // them: no sliding aside, no docking, no remembered spot (the old
  // castingSpot / docks / heldSpot).
  const castingAt = (geometry: Geometry): Box | null => (casting ? castingBox(geometry) : null);
  // Spec 0072 -- the other player's spell (to a spectator, either
  // player's): where it was cast from, read once, on the board where it
  // first appears being cast (theirCast.ts). A card that was face up there
  // (flashback from the graveyard) is shown face up the whole way.
  const theirCast =
    casting && board && (casting.seat !== board.seat || board.spectator) ? casting : null;
  const originOf = useRef<{ id: string; origin: CastOrigin } | null>(null);
  if (!casting) originOf.current = null;
  if (theirCast && board && originOf.current?.id !== theirCast.id) {
    originOf.current = {
      id: theirCast.id,
      origin: castOrigin(theirCast, board, frames.current.previous),
    };
  }
  const theirOrigin =
    theirCast && originOf.current?.id === theirCast.id ? originOf.current.origin : null;
  const castingHiddenBy =
    theirCast && board && !theirOrigin?.faceUp
      ? (board.players.find((p) => p.seat === theirCast.seat)?.name ?? "Your opponent")
      : null;
  // Spec 0072, item 1 -- where it glides from: the middle back of their fan
  // as it was drawn (the board before this one), a card of theirs you were
  // shown, or a pile. Chosen once, as the card first appears.
  const riseFrom = useRef<{ id: string; glide: TheirGlide } | null>(null);
  if (!casting) riseFrom.current = null;
  const lastFan = useRef<{ hidden: Box[]; shown: Map<string, Box> }>({
    hidden: [],
    shown: new Map(),
  });
  // Spec 0072, item 3 -- their spell cancelled: back where it came from, at
  // once, in the same frame the cast card goes (decided here, while the
  // board is drawn, not after it). Their hidden hand's new back makes the
  // same Glide from the middle, fading in.
  const theirBack = useRef<{
    id: string;
    key: number;
    card: SnapshotCard;
    origin: CastOrigin;
    faceUp: boolean;
    backId: string | null;
  } | null>(null);
  const [, setBackDone] = useState(0);
  {
    const gone = lastCasting.current;
    if (
      gone?.origin &&
      board &&
      gone.card.id !== casting?.id &&
      theirBack.current?.id !== gone.card.id &&
      castCancelled(gone.card, gone.origin, gone, board)
    ) {
      const hiddenNow = hiddenInHand(board, gone.card.seat);
      theirBack.current = {
        id: gone.card.id,
        key: Date.now(),
        card: gone.card,
        origin: gone.origin,
        faceUp: !gone.hidden,
        backId:
          gone.origin.zone === "hand" &&
          gone.origin.side === "opponent" &&
          !gone.origin.shown &&
          hiddenNow > 0
            ? `hidden-hand:${gone.card.seat}:${hiddenNow - 1}`
            : null,
      };
    }
  }
  const atRef = useRef<((objectId: string) => Box | null) | null>(null);
  // W-17 -- the cards lit while a sector or sprocket choice is pointed at.
  const [lit, setLit] = useState<ReadonlySet<string>>(() => new Set());
  const lightCards = useCallback((ids: readonly string[]) => setLit(new Set(ids)), []);
  useEffect(() => setLit(new Set()), [decision?.decisionId]);
  // W-17 -- the dice rolled: each tumbles once, when first seen; the ones
  // rolled before this page opened (a reload, a late join) don't.
  const rollsBefore = useRef<number | null>(null);
  const rollsArrived = useRef(new Map<number, number>());
  const [rollsNow, setRollsNow] = useState(() => Date.now());
  useEffect(() => {
    if (!board) return undefined;
    const rolls = board.rolls ?? [];
    if (rollsBefore.current === null) {
      rollsBefore.current = rolls.reduce((most, roll) => Math.max(most, roll.n), 0);
    }
    let fresh = false;
    for (const roll of rolls) {
      if (rollsArrived.current.has(roll.n)) continue;
      rollsArrived.current.set(roll.n, Date.now());
      fresh = true;
    }
    if (fresh) setRollsNow(Date.now());
    // Again once the newest linger is over, so a resolved roll's die goes
    // even when no new board comes.
    const newest = Math.max(0, ...rollsArrived.current.values());
    const left = newest + ROLL_LINGER_MS + 700 - Date.now();
    if (left <= 0) return undefined;
    const later = window.setTimeout(() => setRollsNow(Date.now()), left);
    return () => window.clearTimeout(later);
  }, [board]);
  // Owner 2026-11-01 (item 2) -- the spell being flown already resolved
  // onto the battlefield (nothing answered it): the flight lands on its
  // place there, and the board shows the card only once it has.
  const castFrom = useRef<{ id: string; box: Box } | null>(null);
  const handCountOf = (seat: number) => board?.players.find((p) => p.seat === seat)?.handCount ?? 0;
  const [flight, setFlight] = useState<{
    card: SnapshotCard;
    /** The opponent's spell: turns face up (committed) or stays down (cancelled). */
    reveal: boolean;
    hidden: boolean;
    key: number;
    battlefield: Set<string>;
  } | null>(null);
  // Owner 2026-11-01 (item 2) -- the spell being flown already resolved
  // onto the battlefield (nothing answered it): the flight lands on its
  // place there, and the board shows the card only once it has.
  // The battlefield as it is while a spell is being cast, read on every
  // board: the last one before it is paid is what "new" is measured from.
  const fieldWhileCasting = useRef<Set<string>>(new Set());
  // Not while it lingers for its balls (spec 0062): by then the spell may
  // already be on the battlefield.
  if (castingNow && board)
    fieldWhileCasting.current = new Set(board.battlefield.map((card) => card.id));
  // Chosen once per flight, then kept: the newest card of that name, that
  // player's, not there while it was being cast.
  const landingChoice = useRef<{ key: number; id: string } | null>(null);
  // Spec 0072 -- their spell cancelled into their hand lands on its place
  // there: a card of theirs you were shown, or the fan's new last back. That
  // card is not drawn until it has landed, then is, exactly there: one card
  // at a time, never two pictures overlapping.
  let flyingOnto: string | null =
    theirBack.current?.origin.shown ?? theirBack.current?.backId ?? null;
  // Spec 0062 -- lingering for its balls, a spell already resolved is not
  // drawn on the battlefield yet either: the flight still lands there.
  const going =
    flight && !flight.hidden
      ? flight
      : lingering && lastCasting.current
        ? { key: -1, card: lingering, battlefield: lastCasting.current.battlefield }
        : null;
  if (going && board && !board.stack.some((entry) => spellOf(entry, going.card.id))) {
    if (landingChoice.current?.key === going.key) {
      flyingOnto = landingChoice.current.id;
    } else {
      const fresh = board.battlefield
        .filter(
          (card) =>
            !going.battlefield.has(card.id) &&
            card.name === going.card.name &&
            card.seat === going.card.seat,
        )
        .sort((a, b) => Number(b.id.replace(/\D/g, "")) - Number(a.id.replace(/\D/g, "")));
      if (fresh[0]) {
        flyingOnto = fresh[0].id;
        landingChoice.current = { key: going.key, id: fresh[0].id };
      }
    }
  }
  useEffect(() => {
    const before = lastCasting.current;
    // Spec 0072 -- the other player's spell, cancelled, is already gliding back (theirBack).
    if (before && before.card.id !== casting?.id && theirBack.current?.id !== before.card.id) {
      // The opponent's card is a back to this viewer: cancelled, it went
      // back to their hand (one more card there); otherwise it was cast --
      // it may be on the stack, or already resolved, before this frame.
      const cancelled = handCountOf(before.card.seat) > before.handCount;
      setFlight({
        card: before.card,
        reveal: before.hidden && !cancelled,
        hidden: before.hidden && cancelled,
        key: Date.now(),
        battlefield: before.battlefield,
      });
    }
    // Lingering for its balls: what it was while cast is kept (a cancel is
    // read from the hand count before).
    if (lingering) return;
    lastCasting.current = casting
      ? {
          card: casting,
          hidden: castingHiddenBy !== null,
          handCount: handCountOf(casting.seat),
          origin: theirCast ? theirOrigin : null,
          libraryCount: board?.players.find((p) => p.seat === casting.seat)?.libraryCount ?? 0,
          battlefield: fieldWhileCasting.current,
        }
      : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handCountOf reads this board
  }, [casting, castingHiddenBy, lingering]);
  // Amendment 13 (item 2) -- while your cast card is in the air, the spell
  // is not also drawn on the stack: it shows there only once the card has
  // flown there, and a spell that resolves first never shows there at all.
  // Read in render (not an effect), so the first frame after the cast is
  // covered too, before the flight exists. Spec 0066, item 1: the other
  // player's card too, while it turns over, is held and flies (a reveal
  // flight) -- never a second copy waiting on the stack with its arrow.
  const castNow = castOnItsWay(
    flight,
    lingering?.id ?? null,
    lastCasting.current?.card.id ?? null,
    casting?.id ?? null,
  );
  const hiddenStack = castNow
    ? (board?.stack.find((entry) => spellOf(entry, castNow))?.id ?? null)
    : null;
  // A stack card first drawn under a flight does not slide in again later.
  const quietStack = useRef(new Set<string>());
  if (hiddenStack) quietStack.current.add(hiddenStack);
  const arrived = useRef<number | null>(null);
  useEffect(() => {
    if (!decision) return;
    // Whether a question ends the player's choice is decided once, as it
    // arrives -- answering the first copy must not end the choice it made.
    if (arrived.current !== decision.decisionId) {
      arrived.current = decision.decisionId;
      if (endsCopies(decision, copies)) {
        setCopies(null);
        return;
      }
    }
    if (answered.current === decision.decisionId) return;
    // W-07..W-10 -- the next answer the player's tray gave, if it fits.
    if (plan.length > 0) {
      const reply = stepAnswer(plan[0]!, decision);
      if (reply !== undefined) {
        setPlan(plan.slice(1));
        answer(reply);
        return;
      }
      setPlan([]);
    }
    // W-07 -- Brainstorm's order is the order its cards were clicked in.
    const toTop = decision.kind === "chooseEntitiesForEffect" && decision.arrange?.to === "top";
    if (!toTop && handOrder.length > 0) {
      const same =
        decision.kind === "orderMoveToZoneList" &&
        decision.arrange?.to === "top" &&
        decision.looking.length === handOrder.length &&
        decision.looking.every((card) => handOrder.includes(card.id));
      setHandOrder([]);
      if (same) {
        setPlan(orderSteps(decision.kind, handOrder));
        return;
      }
    }
    if (openingQueue) {
      if (decision.kind !== openingQueue.kind) {
        setOpeningQueue(null);
      } else {
        const [first, ...rest] = openingQueue.cards;
        const next = first ? optionFor(decision, { id: first } as SnapshotCard) : undefined;
        setOpeningQueue(rest.length > 0 ? { ...openingQueue, cards: rest } : null);
        // Beginning in play: once the ticked ones are in, no more.
        if (next) answer(next.actionId);
        else if (!first && openingQueue.kind === "chooseSaToActivateFromOpeningHand") answer(null);
        return;
      }
    }
    if (decision.kind === "chooseModeForAbility" && modeQueue !== null) {
      if (modeQueue.length === 0) {
        setModeQueue(null);
        if (!decision.mandatory) answer(null);
        return;
      }
      const next = decision.options.find((o) => o.label === modeQueue[0]);
      setModeQueue(next ? modeQueue.slice(1) : null);
      if (next) answer(next.actionId);
      return;
    }
    if (decision.kind === "chooseSpellAbilityToPlay" && modeQueue !== null) setModeQueue(null);
    if (decision.kind === "orderSimultaneousAbilities" && orderQueue.length > 0) {
      const next = decision.options.find((o) => o.label === orderQueue[0]);
      setOrderQueue(next ? orderQueue.slice(1) : []);
      if (next) answer(next.actionId);
      return;
    }
    if (decision.kind !== "orderSimultaneousAbilities" && orderQueue.length > 0) setOrderQueue([]);
    const auto = autoAnswer(decision, copies);
    if (auto !== null && copies) {
      setCopies(afterAuto(decision, copies));
      answer(auto);
    }
  }, [decision, copies, orderQueue, modeQueue, openingQueue, plan, handOrder, answer]);
  // W-14 -- the plan the page is answering combat from (below).
  const planRef = useRef<CombatPlan | null>(null);
  const answeredForYou =
    !!decision &&
    (autoAnswer(decision, copies) !== null ||
      (decision.kind === "orderSimultaneousAbilities" && orderQueue.length > 0) ||
      (decision.kind === "chooseModeForAbility" &&
        modeQueue !== null &&
        (modeQueue.length === 0
          ? !decision.mandatory
          : decision.options.some((o) => o.label === modeQueue[0]))) ||
      (!!openingQueue && decision.kind === openingQueue.kind) ||
      (plan.length > 0 && stepAnswer(plan[0]!, decision) !== undefined) ||
      (handOrder.length > 0 &&
        decision.kind === "orderMoveToZoneList" &&
        decision.looking.every((card) => handOrder.includes(card.id))) ||
      // W-14: the game's "What does X attack?" while a plan answers it.
      (planRef.current !== null && !DECLARE_KINDS.has(decision.kind)));
  // Spec 0069, items 5 and 7 -- while you choose targets the beam follows
  // your pointer from the card it is for (the card being cast, or the card
  // whose ability it is, or the front stack card); an Aura or Equipment
  // shows no line, only the tab it will sit in on the creature pointed at.
  const aiming =
    decision?.kind === "chooseTargetsFor" && !answeredForYou && !!board && !board.spectator;
  const aimCard = casting && board && casting.seat === board.seat ? casting : null;
  const aimSource =
    !aimCard && decision?.about?.card
      ? (board?.battlefield.find((c) => c.id === decision.about?.card) ?? null)
      : null;
  const aimAttach = !aiming
    ? null
    : aimCard && /\bAura\b/.test(aimCard.types)
      ? aimCard.name
      : aimSource &&
          decision.about?.kind === "ability" &&
          /\b(Equipment|Fortification)\b/.test(aimSource.types)
        ? aimSource.name
        : null;

  // Phase 9 W-14 (owner 2026-11-03, Amendment 11) -- select several, then
  // point. A click on your creature selects it (a pile, one more each
  // click); a click on what to attack or block sends every selected one
  // there. The page then answers the game's own questions one creature at
  // a time from the plan, each checked by the game, and stops at the first
  // one it does not offer: the rest stay selected, with why.
  const [marked, setMarked] = useState<string[]>([]);
  // Spec 0061, item 3 -- the hand cards picked to discard, not yet confirmed.
  const [discardPick, setDiscardPick] = useState<string[]>([]);
  const [combatNote, setCombatNote] = useState<string | null>(null);
  const planHandled = useRef<number | null>(null);
  const declaring = decision && DECLARE_KINDS.has(decision.kind) ? decision.kind : null;
  const aimAt = useMemo(
    () => (declaring && board && marked.length > 0 ? combatTargets(declaring, board) : null),
    [declaring, board, marked.length],
  );
  // W-12 (Amendment 16): the cards this question may name glow; a click
  // looks the name up and answers with it.
  const nameable = useMemo(
    () =>
      decision?.kind === "chooseCardName" && decision.arrange?.name
        ? new Set(decision.arrange.name.objects)
        : null,
    [decision],
  );
  const [naming, setNaming] = useState<string | null>(null);
  // Set below, once the search it uses exists.
  const nameCardRef = useRef<(objectId: string) => void>(() => undefined);
  const boardChoosable = useMemo(() => {
    const base = aimAt ? new Set([...choosable, ...aimAt]) : choosable;
    return nameable ? new Set([...base, ...nameable]) : base;
  }, [aimAt, choosable, nameable]);
  // Between two questions there is a moment with none: only a question of
  // another kind (and no plan running) ends the selection.
  useEffect(() => {
    if (decision && !planRef.current && !DECLARE_KINDS.has(decision.kind)) {
      setMarked([]);
      setCombatNote(null);
    }
  }, [decision]);
  // What is still selected and still on the board (a creature can leave).
  useEffect(() => {
    if (!board || marked.length === 0) return;
    const here = marked.filter((id) => board.battlefield.some((c) => c.id === id));
    if (here.length !== marked.length) setMarked(here);
  }, [board, marked]);

  // Spec 0061, item 3 -- the picks belong to one discard: another question
  // ends them, and a card no longer offered is no longer picked.
  const discarding = decision?.kind === DISCARD_KIND ? decision : null;
  useEffect(() => {
    if (!discarding) {
      setDiscardPick((picked) => (picked.length > 0 ? [] : picked));
      return;
    }
    setDiscardPick((picked) => {
      const kept = picked.filter((id) => discarding.options.some((o) => o.objectId === id));
      return kept.length === picked.length ? picked : kept;
    });
  }, [discarding]);
  const pickedNow = useMemo(() => new Set(discardPick), [discardPick]);
  const discardButton =
    discarding && board && !answeredForYou
      ? {
          heading: headingFor(DISCARD_KIND),
          ...discardWords(
            discardPick.map((id) => nameOf(board, id)),
            discardCount(discarding),
          ),
        }
      : null;
  const confirmDiscard = useCallback(() => {
    if (!discarding) return;
    const [first, ...rest] = discardPick
      .map((id) => discarding.options.find((o) => o.objectId === id))
      .filter((o): o is DecisionOption => !!o);
    if (!first) return;
    setDiscardPick([]);
    // The game asks one card at a time: the rest as it asks for them.
    if (rest.length > 0) {
      setOpeningQueue({ kind: DISCARD_KIND, cards: rest.map((o) => o.objectId!) });
    }
    answer(first.actionId);
  }, [discarding, discardPick, answer]);

  const lastTarget = useRef<string | null>(null);
  const pick = useCallback(
    (objectId: string, members?: readonly string[]) => {
      // Spec 0070 -- a card picked to pay a cost, clicked again: taken back.
      const back = payPicks.get(objectId);
      if (back) {
        setHeldPicks(withoutPick(payPicks, objectId));
        setSelected(null);
        setOffer(null);
        setWhy(null);
        answer(back.actionId);
        return;
      }
      // Spec 0061, item 3 -- discarding to hand size: a click only picks
      // the card (red outline); the act button discards it.
      if (decision?.kind === DISCARD_KIND && question?.onBoard.has(objectId)) {
        setDiscardPick((picked) => togglePick(picked, objectId, discardCount(decision)));
        setSelected(null);
        setOffer(null);
        setWhy(null);
        return;
      }
      if (decision?.kind === "chooseCardName" && decision.arrange?.name) {
        nameCardRef.current(objectId);
        return;
      }
      if (decision && DECLARE_KINDS.has(decision.kind) && !planRef.current) {
        const ids = members && members.length > 0 ? members : [objectId];
        // Pointed at a target: the selection goes there.
        if (aimAt && ids.some((id) => aimAt.has(id))) {
          const targets = ids.filter((id) => aimAt.has(id));
          planRef.current = planFor(decision, marked, targets);
          planHandled.current = null;
          setMarked([]);
          setCombatNote(null);
          setSelected(null);
          setOffer(null);
          const move = planAnswer(decision, planRef.current);
          planRef.current = move.plan;
          if (move.plan) planHandled.current = decision.decisionId;
          if (move.left.length > 0) {
            setMarked(move.left);
            setCombatNote(
              move.why ?? `${nameOf(board, move.left[0]!)} can't go there. Still selected.`,
            );
          }
          if (move.answer) answer(move.answer);
          return;
        }
        const next = toggleSelected(decision, ids, marked);
        if (next) {
          setMarked(next);
          setCombatNote(null);
          setSelected(null);
          setOffer(null);
          setWhy(null);
          return;
        }
      }
      // Amendment 13 (item 3) -- a cost asked right after a target (Wirewood
      // Symbiote: untap a creature, then return an Elf): a click on a pile
      // takes another of its cards than the one just targeted, when it can.
      if (
        decision?.kind.startsWith("Cost") &&
        members &&
        members.length > 1 &&
        objectId === lastTarget.current
      ) {
        const other = members.find((id) => id !== objectId && question?.onBoard.has(id));
        if (other) objectId = other;
      }
      if (decision?.kind === "chooseTargetsFor") lastTarget.current = objectId;
      // Spec 0042: where a card rose from, if this click casts it.
      const box = atRef.current?.(objectId);
      if (box) castFrom.current = { id: objectId, box };
      const result = clickOn(question, objectId, decision?.notNow?.[objectId]?.length ?? 0);
      // Spec 0005: a card you could play pauses the response window.
      if (result.kind !== "select" && decision?.window) setPaused(true);
      const reason = result.kind === "select" ? decision?.unavailable[objectId] : undefined;
      setWhy(reason ? { objectId, text: reason } : null);
      if (result.kind === "answer") {
        // Spec 0070: the card picked is marked at once, before the game asks again.
        const pickedId = decision?.options.find((o) => o.actionId === result.actionId)?.objectId;
        if (decision?.picking && pickedId) {
          setHeldPicks(withPick(payPicks, decision.picking, pickedId));
        }
        answer(result.actionId);
        return;
      }
      // Spec 0028 — a stack card with nothing to do opens its close-up.
      if (result.kind === "select" && objectId.startsWith("stack:")) {
        setInspecting(objectId);
        return;
      }
      // A card with nothing to do is only highlighted: no window
      // (AMENDMENT 12). Right-click is the close look (§7.30).
      setSelected(objectId);
      setOffer(result.kind === "offer" ? result.options : null);
      // Spec 0058, item 4 -- and says so, briefly, when nothing else will
      // (no reason to show, no greyed abilities).
      setNothing(
        result.kind === "select" && !reason && (decision?.notNow?.[objectId]?.length ?? 0) === 0
          ? (previous) => ({ objectId, n: (previous?.n ?? 0) + 1 })
          : null,
      );
    },
    [question, answer, decision, marked, aimAt, board, payPicks],
  );

  // "All attack" selects every creature that can attack; you then point.
  const selectAll = useCallback(() => {
    if (decision) setMarked(joinable(decision));
  }, [decision]);

  // The plan answers each question the game asks next.
  useEffect(() => {
    const plan = planRef.current;
    if (!plan || !decision || game.awaiting !== null) return;
    // The same question back means the game refused the last answer: stop.
    if (planHandled.current === decision.decisionId) return;
    planHandled.current = decision.decisionId;
    const move = planAnswer(decision, plan);
    planRef.current = move.plan;
    if (!move.plan && move.left.length > 0) {
      setMarked(move.left);
      setCombatNote(
        move.why ?? `${nameOf(board, move.left[0]!)} can't go there. The rest are still selected.`,
      );
    }
    if (move.answer) answer(move.answer);
  }, [decision, game.awaiting, answer, board]);

  // Esc unselects everything.
  useEffect(() => {
    if (marked.length === 0) return undefined;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setMarked([]);
      setCombatNote(null);
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [marked.length]);

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
      // Amendment 17: a target question's own cancel, else a pass.
      answer(question?.cancel ?? null);
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [cancellable, offer, inspecting, viewer, answer, question]);

  // Spec 0005 — the response window. Your own spell or trigger is on top:
  // the act button counts down and, if you let it run out, your page passes
  // (Phase 8 Amendment 4). Anything that shows you are acting or reading
  // pauses it for good: an ordinary question from then on.
  const windowId =
    decision?.window && question?.context === "priority" && game.awaiting === null
      ? decision.decisionId
      : null;
  // A pause holds until the player passes (answer, above): not tied to one
  // question or one stack entry, which the game may change under it (CI
  // 2026-11-03: a paused countdown ran out twice, once after the pause was
  // keyed to the question and the stack's top). Amendment 13, item 1.
  const [paused, setPaused] = useState(false);
  const windowPaused = windowId !== null && paused;
  // Owner 2026-11-04: only the tab in front counts down. A hidden tab (a
  // second one, forgotten) never resolves anything for the player; back
  // in front, its countdown starts again from 5.
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    const changed = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  const counting = windowId !== null && !paused && !hidden;
  const pauseWindow = useCallback(() => {
    if (windowId !== null) setPaused(true);
  }, [windowId]);
  const [countdown, setCountdown] = useState<number | null>(null);
  // The latest answer, so a question updated mid-countdown never restarts it.
  const answerRef = useRef(answer);
  answerRef.current = answer;
  useEffect(() => {
    if (!counting) {
      setCountdown(null);
      return undefined;
    }
    const ends = Date.now() + RESPONSE_WINDOW_MS;
    setCountdown(Math.ceil(RESPONSE_WINDOW_MS / 1000));
    const timer = window.setInterval(() => {
      const left = ends - Date.now();
      if (left <= 0) {
        window.clearInterval(timer);
        setCountdown(null);
        answerRef.current(null);
        return;
      }
      setCountdown(Math.ceil(left / 1000));
    }, 100);
    return () => window.clearInterval(timer);
  }, [counting, windowId]);
  // Reading a card or a list pauses it: you are thinking.
  useEffect(() => {
    if (counting && (inspecting || viewer)) pauseWindow();
  }, [counting, inspecting, viewer, pauseWindow]);
  // Space resolves now.
  useEffect(() => {
    if (!counting) return undefined;
    const space = (event: KeyboardEvent) => {
      if (event.key !== " " || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      // Typing is not Space-to-resolve; a focused button is its own click --
      // except the act button itself, still focused from the last answer.
      const onAct = !!target?.closest(".gs-act");
      if (!onAct && target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)) return;
      event.preventDefault();
      answer(null);
    };
    document.addEventListener("keydown", space);
    return () => document.removeEventListener("keydown", space);
  }, [counting, answer]);

  const decisionId = decision?.decisionId ?? null;
  const search = useCallback(
    (query: string) => {
      if (decisionId !== null) socketRef.current?.search(decisionId, query);
    },
    [decisionId],
  );

  // W-12 (Amendment 16): a card clicked to name it. Its exact name is
  // searched, and the result with that name is the answer (below): the
  // answer is always one the game sent. A card on the table it may not
  // name says why.
  const nameCard = useCallback(
    (objectId: string) => {
      if (!board || !decision?.arrange?.name) return;
      const card = [...board.battlefield, ...board.graveyard, ...board.exile].find(
        (c) => c.id === objectId,
      );
      if (!card) return;
      if (!nameable?.has(objectId)) {
        if (board.battlefield.some((c) => c.id === objectId)) {
          const asker = decision.about?.name ?? "This card";
          const what = /\bLand\b/.test(card.types) ? "a land" : "that card";
          setSelected(objectId);
          setWhy({ objectId, text: `${asker} can't name ${what}.` });
        }
        return;
      }
      setWhy(null);
      setNaming(card.name);
      search(card.name);
    },
    [board, decision, nameable, search],
  );
  nameCardRef.current = nameCard;
  useEffect(() => {
    if (!naming || decision?.results?.query !== naming.slice(0, 64)) return;
    const exact = decision.results.options.find((o) => o.label === naming);
    setNaming(null);
    if (exact) answer(exact.actionId);
  }, [naming, decision, answer]);
  // A new question ends a look-up.
  useEffect(() => setNaming(null), [decision?.decisionId]);

  // Spec 0043 -- while "Let it all resolve" holds: pass each time the
  // player is asked whether to respond, until the stack is empty or holds
  // something that was not there when it was pressed.
  useEffect(() => {
    if (!resolveAll || !board) return;
    const ids = board.stack.map((entry) => entry.id);
    if (ids.length === 0 || ids.some((id) => !resolveAll.has(id))) {
      setResolveAll(null);
      return;
    }
    if (decision?.kind === "chooseSpellAbilityToPlay" && game.awaiting === null) answer(null);
  }, [resolveAll, board, decision, game.awaiting, answer]);

  const busy = game.awaiting !== null;

  // Spec 0045 -- the cards Forge last showed this player, until closed
  // (the worker stops sending them at the next turn).
  const [closedReveal, setClosedReveal] = useState<string | null>(null);
  // PHASE_09 group 3 -- a tray that shows the revealed cards itself (a
  // hand to choose from, Fact or Fiction's five) takes the reveal's place.
  const trayShowsReveal =
    !!decision &&
    (trayOf(decision) === "split" || trayOf(decision) === "piles" || trayOf(decision) === "hidden");
  // Phase 9 Amendment 12 -- a report of who did what, or a plain reveal:
  // whichever came last.
  const latestTray =
    board?.action && (!board.reveal || (board.action.stamp ?? 0) >= (board.reveal.stamp ?? 0))
      ? board.action
      : (board?.reveal ?? null);
  const reveal =
    latestTray && latestTray.key !== closedReveal && !trayShowsReveal ? latestTray : null;
  const actingSeat = reveal?.by ?? null;
  const actingUser = match.participants.find((p) => p.seatNumber === actingSeat)?.userId ?? null;
  const acting = actingSeat
    ? {
        name:
          actingSeat === board?.seat && !board?.spectator
            ? "You"
            : (board?.players.find((p) => p.seat === actingSeat)?.name ?? "A player"),
        face: (
          <span className="gs-reveal-face">
            <Avatar
              avatar={actingUser ? avatarOf(lobby, actingUser) : null}
              size={44}
              rank={actingUser ? rankOf(lobby, actingUser) : undefined}
            />
          </span>
        ),
      }
    : null;

  // PHASE_09 group 1 -- the questions in the W-00 frame: a yes/no, a
  // trigger's target for many copies, different triggers to order. The
  // old question bar steps aside for them, and while the page answers for
  // the player; "List choices" still lists every option (§7.29).
  //
  // PHASE_09 group 2 -- every other question too (W-01, W-02), and "List
  // choices" as the tray (W-03). The bar stays only where it is its own
  // window already: cards you are looking at (scry, surveil), naming a
  // card, and your move with nothing to list (the bar is then only words
  // for a screen reader). Combat is the act button (owner 2026-10-22).
  // Naming a card is its search box, list or no list.
  const barOnly =
    !!decision &&
    !!question &&
    ((decision.searchable && !decision.arrange?.name) ||
      (!listOpen &&
        ((decision.looking.length > 0 && !trayOf(decision)) ||
          COMBAT_KINDS.has(decision.kind) ||
          (question.context === "priority" && question.listed.length === 0))));
  const windowed = !!decision && (answeredForYou || !barOnly);
  const artUrl = pictureUrl;
  const gameWindow = (geometry: Geometry) => {
    if (!decision || !question || !board || answeredForYou) return null;
    // Spec 0042: beside the card being cast, when one is.
    // Spec 0057, item 6: else by the card asking, in the hand (above it) or
    // on the battlefield (beside it); else by the stack.
    const stackSpot = stackSpotBoxes(geometry, Math.max(1, board.stack.length))[0]!;
    const middle = castingAt(geometry);
    const anchor: Anchor = middle
      ? castingWindowAnchor(
          middle,
          casting!.id,
          question,
          board,
          geometry,
          stackSpot,
          atRef.current,
        )
      : askingCardAnchor(decision, question, board, geometry, stackSpot, atRef.current);
    const common = {
      decision,
      question,
      board,
      geometry,
      anchor,
      busy,
      notice: game.notice,
      heading:
        decision.actedForSeat !== mine?.seatNumber
          ? `Playing for seat ${decision.actedForSeat}`
          : decision.kind === "chooseOptionalCosts"
            ? optionalCostTitle(decision)
            : (payTitle(decision) ??
              binaryTitle(decision) ??
              targetsTitle(
                decision,
                // Spec 0055: the action ("Deal 1 damage"), when the card's words say.
                (decision.kind === "chooseTargetsFor"
                  ? targetWords(decision.prompt, decision.about?.name ?? null)?.title
                  : null) ?? headingFor(decision.kind),
              )),
      passWord: passWordFor(decision, question, listOpen),
      artUrl,
      onAnswer: answer,
    };
    // W-12 (Amendment 16): naming a card, beside the card asking.
    if (decision.kind === "chooseCardName" && decision.searchable && decision.arrange?.name) {
      return <NameWindow key={decision.decisionId} {...common} onSearch={search} naming={naming} />;
    }
    if (listOpen && !decision.searchable) {
      return <ListTray key={decision.decisionId} {...common} onClose={() => setListOpen(false)} />;
    }
    // Spec 0061, item 3 -- the discard is the act button and the hand.
    if (decision.kind === DISCARD_KIND) return null;
    // Phase 9 W-15 -- the start of the game, the opening hand laid out.
    if (OPENING_KINDS.has(decision.kind)) {
      return (
        <OpeningHand
          key={decision.decisionId}
          area={{ x: geometry.play.x, w: geometry.play.w, h: geometry.height }}
          decision={decision}
          board={board}
          busy={busy}
          artUrl={artUrl}
          onAnswer={answer}
          onPutBack={(cards) => {
            const [first, ...rest] = cards;
            const now = first ? optionFor(decision, { id: first } as SnapshotCard) : undefined;
            if (!now) return;
            if (rest.length > 0) setOpeningQueue({ kind: "tuckCardsViaMulligan", cards: rest });
            answer(now.actionId);
          }}
          onBegin={(cards) => {
            const [first, ...rest] = cards;
            const now = first ? optionFor(decision, { id: first } as SnapshotCard) : undefined;
            if (!now) {
              answer(null);
              return;
            }
            // The rest as asked, then "no more" (an empty queue).
            setOpeningQueue({ kind: "chooseSaToActivateFromOpeningHand", cards: rest });
            answer(now.actionId);
          }}
        />
      );
    }
    // W-17 (Amendment 19) -- dice, sectors, sprockets, cranking.
    if (DICE_KINDS.has(decision.kind) && decision.arrange?.dice) {
      return <DiceWindow key={decision.decisionId} {...common} />;
    }
    if (decision.kind === "chooseSector") {
      return <SectorWindow key={decision.decisionId} {...common} onLight={lightCards} />;
    }
    if (decision.kind === "chooseSprocket") {
      return <SprocketWindow key={decision.decisionId} {...common} onLight={lightCards} />;
    }
    // Amendment 21 -- several modes: tick them, then Done.
    // "Choose one" stays one click (the general window).
    const modes = decision.arrange?.modes;
    if (
      decision.kind === "chooseModeForAbility" &&
      modes &&
      (modes.num > 1 || modes.budget != null)
    ) {
      return (
        <ModesWindow
          key={decision.decisionId}
          {...common}
          onDone={(labels) => {
            const [first, ...rest] = labels;
            const now = decision.options.find((o) => o.label === first);
            if (!now) return;
            setModeQueue(rest);
            answer(now.actionId);
          }}
        />
      );
    }
    // Amendment 20 -- which dungeon: each with its rooms.
    if (decision.kind === "chooseSingleCardFace" && decision.arrange?.dungeons) {
      return <DungeonWindow key={decision.decisionId} {...common} />;
    }
    if (decision.kind === "chooseContraptionsToCrank") {
      return <CrankWindow key={decision.decisionId} {...common} />;
    }
    // PHASE_09 group 3 -- the card trays (W-07..W-10).
    const tray = trayOf(decision);
    if (tray) {
      const trayProps = {
        decision,
        board,
        geometry,
        busy,
        artUrl,
        onAnswer: answer,
        onPlan: setPlan,
      };
      if (tray === "order") return <OrderCardsTray key={decision.decisionId} {...trayProps} />;
      if (tray === "rows") return <RowsTray key={decision.decisionId} {...trayProps} />;
      if (tray === "hidden") return <HiddenZoneTray key={decision.decisionId} {...trayProps} />;
      if (tray === "split") return <SplitTray key={decision.decisionId} {...trayProps} />;
      if (tray === "damage") return <DamageTray key={decision.decisionId} {...trayProps} />;
      if (tray === "divide") return <DivideTray key={decision.decisionId} {...trayProps} />;
      return <PilesTray key={decision.decisionId} {...trayProps} />;
    }
    // W-11 -- one number, on the dial (Amendment 14).
    if (NUMBER_KINDS.has(decision.kind) && decision.arrange?.number) {
      return <NumberWindow key={decision.decisionId} {...common} />;
    }
    if (yesNo(decision)) {
      return (
        <ConfirmWindow
          key={decision.decisionId}
          decision={decision}
          board={board}
          anchor={anchor}
          geometry={geometry}
          busy={busy}
          artUrl={artUrl}
          onAnswer={(id) => answer(id === PASS_ANSWER ? null : id)}
          onYesToAll={(count, actionId) => {
            setCopies((previous) => ({
              name: decision.about?.name ?? "",
              target: previous?.target ?? null,
              yesLeft: count - 1,
              noLeft: 0,
            }));
            answer(actionId === PASS_ANSWER ? null : actionId);
          }}
          onSkipAll={(count, actionId) => {
            setCopies((previous) => ({
              name: decision.about?.name ?? "",
              target: previous?.target ?? null,
              yesLeft: 0,
              noLeft: count - 1,
            }));
            answer(actionId === PASS_ANSWER ? null : actionId);
          }}
        />
      );
    }
    if (isCopyTarget(decision)) {
      return (
        <CopyTargetWindow
          key={decision.decisionId}
          decision={decision}
          board={board}
          anchor={anchor}
          geometry={geometry}
          busy={busy}
          same={sameTarget}
          artUrl={artUrl}
          onSame={setSameTarget}
          onAnswer={answer}
        />
      );
    }
    if (decision.kind === "orderSimultaneousAbilities") {
      return (
        <OrderTray
          key={decision.decisionId}
          decision={decision}
          board={board}
          geometry={geometry}
          busy={busy}
          artUrl={artUrl}
          onDone={(order) => {
            setOrderQueue(order.slice(1).map((o) => o.label ?? ""));
            answer(order[0]!.actionId);
          }}
        />
      );
    }
    if (barOnly) return null;
    const onBoardCount = [...question.onBoard.values()].reduce((n, list) => n + list.length, 0);
    // Everything asked is on the table (a target, a land to tap): a
    // bubble asking, the table is the answer (W-01).
    if (question.listed.length <= 3 && onBoardCount > 0) {
      return <TableQuestionWindow key={decision.decisionId} {...common} />;
    }
    return <ChoiceWindow key={decision.decisionId} {...common} />;
  };
  const objectName = (id: string) => nameOf(board, id);

  return (
    <SeatsContext.Provider value={match.participants}>
      <section className="gs-screen" aria-label={watching ? "The match" : "Your match"}>
        <h1 className="pa-visually-hidden">{watching ? "The match" : "Your match"}</h1>
        {data && board ? (
          <Board
            battlefield={data.battlefield}
            hand={data.hand}
            opponentHand={data.opponentHand}
            opponentName={board.players.find((p) => p.seat !== board.seat)?.name}
            viewerName={
              board.spectator
                ? (board.players.find((p) => p.seat === board.seat)?.name ?? null)
                : null
            }
            onOpponentHand={
              data.opponentHand.some((card) => card.shown)
                ? () => {
                    const them = board.players.find((p) => p.seat !== board.seat);
                    if (them) setViewer({ seat: them.seat, zone: "hand" });
                  }
                : undefined
            }
            viewerSeat={board.seat}
            artUrl={pictureUrl}
            arrivals={data.arrivals}
            departures={data.departures}
            merges={data.merges}
            returns={data.returns}
            graves={data.graves}
            tileMoves={data.tileMoves}
            countered={data.countered}
            flyingOnto={flyingOnto}
            handLeft={
              theirOrigin?.zone === "hand" && theirOrigin.side === "opponent"
                ? theirOrigin.back
                : null
            }
            hiddenStack={hiddenStack}
            stackPay={stackPay}
            stackPayLive={owingNow !== null}
            quietStack={quietStack.current}
            combat={data.combat}
            stack={stackShown}
            clock={counting && windowId !== null ? String(windowId) : null}
            clockMs={RESPONSE_WINDOW_MS}
            handCosts={handCosts}
            damage={data.damage}
            onPick={pick}
            onInspect={setInspecting}
            choosable={boardChoosable}
            marked={marked}
            picked={pickedNow}
            chosenTargets={chosenTargets}
            payPicks={payPicks}
            lit={lit}
            unpayable={unpayable}
            selected={selected}
            asking={question?.context === "choose"}
            top={
              <>
                {over && !over.aside && watching && (
                  <SpectatorOver over={over} onLeave={onLeave} onAnother={onSpectateAnother} />
                )}
                {over && !over.aside && !watching && (
                  <ResultBanner
                    over={over}
                    sentence={sentence}
                    onLeave={onLeave}
                    onAside={() => setResultAside(true)}
                  />
                )}
                {turning > 0 && <div key={turning} className="gs-turning" aria-hidden="true" />}
                <NoticeStack notices={tableNotices} place="table" />
                {awayLong && !finished && (
                  // W-26 (Amendment 20): a game window beside their plate.
                  <AwayWindow
                    name={theirName}
                    face={
                      <Avatar
                        avatar={theirId ? avatarOf(lobby, theirId) : null}
                        size={48}
                        rank={theirId ? rankOf(lobby, theirId) : undefined}
                      />
                    }
                    minutes={game.awayMinutes}
                    note={awayEndText(game.awayEnd, theirName, game.awayMinutes)}
                    sent={game.awayEnd === "SENT"}
                    onWait={() => setKeptWaiting(goneSince)}
                    onEnd={() => {
                      setGame((previous) => ({ ...previous, awayEnd: null }));
                      socketRef.current?.endForAway();
                    }}
                  />
                )}
              </>
            }
            rail={
              <Rail
                theirAway={theirAway}
                board={board}
                question={question}
                aim={aimAt}
                actingSeat={actingSeat}
                mySeat={board.seat}
                asking={game.asking}
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
                        // W-14: "All attack" selects; you then point.
                        onAll:
                          decision.options.some((o) => o.actionId === ALL_ATTACK) &&
                          joinable(decision).some((id) => !marked.includes(id))
                            ? selectAll
                            : null,
                        marked: marked.length,
                        canPass: question.canPass,
                        notice: game.notice ?? combatNote,
                      }
                    : null
                }
                cancel={
                  decision &&
                  question &&
                  CANCEL_KINDS.has(decision.kind) &&
                  question.canPass &&
                  !listOpen
                    ? { ...cancelWords(decision.about), answer: question.cancel }
                    : null
                }
                onAnswer={answer}
                countdown={countdown}
                windowPaused={windowPaused}
                onPauseWindow={pauseWindow}
                onResolveAll={() => {
                  setResolveAll(new Set(board.stack.map((entry) => entry.id)));
                  answer(null);
                }}
                onView={setViewer}
                over={over}
                onLeave={onLeave}
                watching={game.watching}
                watchers={game.watchers ?? []}
                placing={
                  placingTriggers(decision) ? (answeredForYou ? "answering" : "asking") : null
                }
                discard={discardButton}
                onDiscard={confirmDiscard}
              />
            }
            overlay={(at, geometry) => {
              atRef.current = at;
              // Spec 0072 -- their fan as drawn now; the casting card, first
              // seen, rises from the fan as it was drawn just before.
              const fan = { hidden: [] as Box[], shown: new Map<string, Box>() };
              for (const card of data.opponentHand) {
                const box = at(card.id);
                if (!box) continue;
                if (card.shown) fan.shown.set(card.id, box);
                else fan.hidden.push(box);
              }
              if (theirCast && theirOrigin && riseFrom.current?.id !== theirCast.id) {
                riseFrom.current = {
                  id: theirCast.id,
                  glide: placeOf(theirOrigin, lastFan.current, geometry),
                };
              }
              lastFan.current = fan;
              return (
                <>
                  {board && (
                    <RollsOverlay
                      rolls={board.rolls ?? []}
                      stack={board.stack}
                      since={rollsBefore.current ?? Number.MAX_SAFE_INTEGER}
                      arrived={rollsArrived.current}
                      now={rollsNow}
                      at={at}
                    />
                  )}
                  {board && (
                    <ManaBalls
                      payments={board.payments ?? []}
                      at={at}
                      geometry={geometry}
                      ledger={balls.current}
                      onLanded={ballsLanded}
                    />
                  )}
                  {aiming && (
                    <AimPointer
                      key={decision.decisionId}
                      geometry={geometry}
                      from={
                        aimCard
                          ? castingBox(geometry)
                          : aimSource
                            ? at(aimSource.id)
                            : board?.stack[0]
                              ? at(board.stack[0].id)
                              : null
                      }
                      attach={aimAttach}
                    />
                  )}
                  {casting && (
                    <CastingCard
                      key={casting.id}
                      card={casting}
                      geometry={geometry}
                      from={castFrom.current?.id === casting.id ? castFrom.current.box : null}
                      owing={castOwing}
                      cost={castCost}
                      paid={castPaid?.mana ?? null}
                      artUrl={artUrl}
                      hiddenBy={castingHiddenBy}
                      asking={decision?.decisionId ?? null}
                      theirs={
                        theirCast && riseFrom.current?.id === theirCast.id
                          ? riseFrom.current.glide
                          : null
                      }
                    />
                  )}
                  {theirBack.current &&
                    (() => {
                      const going = theirBack.current;
                      const place = placeOf(going.origin, fan, geometry);
                      const own = going.backId ? at(going.backId) : null;
                      const shown = going.origin.shown ? at(going.origin.shown) : null;
                      return (
                        <CastingFlight
                          key={`back:${going.key}`}
                          card={going.card}
                          geometry={geometry}
                          to={null}
                          artUrl={artUrl}
                          hidden={!going.faceUp}
                          back={{
                            box: own ?? shown ?? place.box,
                            origin: place.origin,
                            // Into their hand it lands as the card there (the
                            // fan's new back, turning round on the way to face
                            // him as his backs do); into a pile, it shrinks and
                            // fades there, as a spell going to the stack.
                            opacity: going.origin.zone === "hand" ? 1 : 0.3,
                            turn: own !== null,
                          }}
                          onDone={() => {
                            if (theirBack.current?.key === going.key) theirBack.current = null;
                            setBackDone((n) => n + 1);
                          }}
                        />
                      );
                    })()}
                  {flight &&
                    (() => {
                      const onStack = board?.stack.find((entry) => spellOf(entry, flight.card.id));
                      return (
                        <CastingFlight
                          key={flight.key}
                          card={flight.card}
                          geometry={geometry}
                          to={at(onStack?.id ?? flyingOnto ?? flight.card.id)}
                          artUrl={artUrl}
                          onDone={() => setFlight(null)}
                          reveal={flight.reveal}
                          hidden={flight.hidden}
                          landing={flyingOnto !== null && !onStack}
                        />
                      );
                    })()}
                  {reveal && (
                    <RevealTray
                      reveal={reveal}
                      who={acting}
                      geometry={geometry}
                      atTop={windowed}
                      artUrl={artUrl}
                      onClose={() => setClosedReveal(reveal.key)}
                    />
                  )}
                  {/* Amendment 22: every window shows a refusal, and who it answers for. */}
                  <WindowFacts.Provider
                    value={{
                      notice: game.notice,
                      actingFor:
                        decision && mine && decision.actedForSeat !== mine.seatNumber
                          ? `Playing for seat ${decision.actedForSeat}${
                              board?.players.find((p) => p.seat === decision.actedForSeat)?.name
                                ? ` (${board.players.find((p) => p.seat === decision.actedForSeat)!.name})`
                                : ""
                            }`
                          : null,
                    }}
                  >
                    {gameWindow(geometry)}
                  </WindowFacts.Provider>
                  {handOrder.map((id, i) => {
                    const box = at(id);
                    return box ? (
                      <span
                        key={id}
                        className="gs-hand-num"
                        aria-label={`Number ${i + 1}`}
                        style={{ left: box.x + box.w / 2, top: box.y }}
                      >
                        {i + 1}
                      </span>
                    ) : null;
                  })}
                  {nothing &&
                    nothing.objectId === selected &&
                    !offer &&
                    (() => {
                      const box = at(selected);
                      return box ? (
                        <NothingNote key={nothing.n} box={box} onDone={() => setNothing(null)} />
                      ) : null;
                    })()}
                  {selected && (offer || why || (decision?.notNow?.[selected]?.length ?? 0) > 0) ? (
                    // Phase 9 W-16: one panel -- what it can do, cost first;
                    // what it can't do now, greyed with why; or, for a card
                    // that can't be played, the reason, until clicked away.
                    <ActionPopup
                      box={at(selected)}
                      name={objectName(selected)}
                      card={board ? cardOf(board, selected) : null}
                      artUrl={pictureUrl}
                      options={offer ?? []}
                      notNow={decision?.notNow?.[selected] ?? []}
                      why={why && why.objectId === selected ? why.text : null}
                      busy={busy}
                      onChoose={answer}
                      onInspect={() => setInspecting(selected)}
                      onClose={() => {
                        setSelected(null);
                        setOffer(null);
                        setWhy(null);
                      }}
                    />
                  ) : null}
                </>
              );
            }}
          />
        ) : null}
        {/* Spec 0065 -- the mana vortex while the table is coming, and its
          burst played over the table once it is here (never holding it up). */}
        {vortex.show && (
          <LoadingRing
            words={
              finished
                ? "The game is over."
                : reconnecting
                  ? "Reconnecting to the game…"
                  : watching
                    ? SPECTATE_LOADING_WORDS
                    : match.status === "LAUNCHING"
                      ? "Setting up the table…"
                      : "Shuffling up and dealing…"
            }
            ready={vortex.ready}
            onDone={vortex.done}
          />
        )}

        <div className="gs-corner">
          {/* Spec 0067 (item 10, B) -- what a spectator is watching, and how
            to leave it, in one place: "Spectating Alice vs Bob · Stop". */}
          {watching && board && drawn && (
            <SpectatingChip
              names={[...board.players].sort((a, b) => a.seat - b.seat).map((p) => p.name)}
              onStop={onLeave}
            />
          )}
          {/* Spec 0065 (owner 2026-11-07): no logo in the corner; nothing
            replaces it. The game's state is still said to a screen reader. */}
          <p className="gs-status pa-visually-hidden" role="status">
            {finished
              ? updated
                ? SERVER_UPDATE_WORDS
                : "Game over."
              : match.status === "LAUNCHING"
                ? game.decision
                  ? "Setting up the game. It needs an answer from you."
                  : "Starting the game."
                : "The game is running."}
          </p>
        </div>

        {/* Owner 2026-10-21: the game's controls at the bottom left, where no
          card is drawn -- a gear (Concede, Abandon; spec 0035 took Stops out). The chat opens
          from its tab on the left edge, which pulses for a new message
          (owner 2026-10-28: no chat icon here). */}
        <div className="gs-dock-anchor" hidden={!drawn && !longLoad}>
          {/* Spec 0047 -- a spectator concedes nothing: they can only leave
            (the chip, top left) or, spec 0067, turn the table round. */}
          {watching ? (
            board && (
              <SwitchSides
                from={board.players.find((p) => p.seat === board.seat)?.name ?? "one player"}
                onSwitch={switchSides}
              />
            )
          ) : (
            <GameMenu
              match={match}
              report={reportGame}
              live={live && !finished}
              choices={decision ? decision.options.length - (question?.cancel ? 1 : 0) : null}
              listOpen={listOpen}
              onList={() => setListOpen((open) => !open)}
              concession={finished ? null : concessionText(game.concession)}
              onConcede={() => {
                setGame((previous) => ({ ...previous, concession: null }));
                socketRef.current?.concede();
              }}
            />
          )}
        </div>

        {decision && question && !windowed && (
          <QuestionBar
            decision={decision}
            question={question}
            mySeat={mine?.seatNumber ?? null}
            busy={busy}
            notice={game.notice}
            onAnswer={answer}
            onSearch={search}
            artUrl={pictureUrl}
          />
        )}

        {inspecting && board && board.stack.some((entry) => entry.id === inspecting) && (
          <StackInspect
            board={board}
            id={inspecting}
            mySeat={mine?.seatNumber ?? null}
            artUrl={pictureUrl}
            onClose={() => setInspecting(null)}
          />
        )}

        {viewer && board && (
          <ZoneViewer
            board={board}
            seat={viewer.seat}
            zone={viewer.zone}
            mySeat={board.spectator ? -1 : board.seat}
            artUrl={pictureUrl}
            onZone={setViewer}
            onInspect={setInspecting}
            nameable={nameable}
            onName={nameCard}
            onClose={() => setViewer(null)}
          />
        )}

        {/* A stack object that has resolved is gone, and so is its close-up.
            After the zone viewer, so a card opened from it is on top
            (Phase 9 W-19: it opened behind the list). */}
        {inspecting && board && !inspecting.startsWith("stack:") && (
          <Inspect
            card={cardOf(board, inspecting)}
            name={objectName(inspecting)}
            costNow={cardOf(board, inspecting)?.costNow ?? null}
            artUrl={pictureUrl}
            board={board}
            mySeat={board.spectator ? -1 : board.seat}
            onClose={() => setInspecting(null)}
          />
        )}

        {/* A game that ended before the table was drawn: the result alone. */}
        {over && !over.aside && !drawn && (
          <ResultBanner over={over} sentence={sentence} onLeave={onLeave} onAside={null} />
        )}

        {/* Spec 0067 (checklist 5) -- a spectator reads the public play log,
          read-only: no chat, no box to type in. */}
        {drawn && board && (
          <GameChat
            open={chatOpen}
            onToggle={setChatOpen}
            me={me}
            matchId={match.matchId}
            lines={playLog}
            players={board.players}
            mySeat={board.spectator ? -1 : board.seat}
            handCount={board.hand.length}
            logOnly={watching}
            onInspect={(id) => {
              if (!cardOf(board, id)) return false;
              setInspecting(id);
              return true;
            }}
          />
        )}
      </section>
    </SeatsContext.Provider>
  );
}

/**
 * Spec 0047 -- who sits where, for the plates' pictures: the match on the
 * screen, which a spectator has although the lobby holds no match of theirs.
 */
const SeatsContext = createContext<MatchView["participants"] | null>(null);

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

// --- the turn ladder ------------------------------------------------------------------

/** Spec 0034 (M2) — how long the gem takes to sweep to a new step, however far. */
const SWEEP_MS = 450;
/** Spec 0034 (M4) — how long the steps dim at a new turn before the gem starts again. */
const HANDOFF_MS = 220;
/** The ladder's row pitch: a 20px row and a 2px gap (game.css). */
const ROW_PX = 22;

/**
 * Spec 0030 — the turn's steps, top to bottom, between the plates. It
 * replaced the bar over the board. Spec 0034 — a gem for each step on a
 * rail (S1); the glowing gem sweeps to the step the game is in (M2), and
 * at a new turn the steps dim and it starts again from the top (M4).
 */
function StepLadder({
  board,
  mySeat,
  watching = 0,
  watchers = [],
}: {
  board: Snapshot;
  mySeat: number;
  /** Spec 0047 -- how many people are watching this game. */
  watching?: number;
  /** Spec 0067 -- who, by name: pointing at the count lists them. */
  watchers?: readonly string[];
}) {
  const target = STEPS.findIndex((step) => step.phases.includes(board.phase));
  // Owner 2026-10-22: steps nobody stops at went by in one jump, and the
  // game felt fast-forwarded. The gem sweeps over every step passed, the
  // passed gems filling as it goes. It only shows; the game is never held
  // for it. `from`: where this sweep started; `still`: placed, not swept.
  const [shown, setShown] = useState({ index: target, from: target, still: true, dim: false });
  const was = useRef({ turn: board.turn, index: target });
  // A hand-off under way: the step it sweeps to when it is done. A new
  // turn comes as several boards in quick succession (Untap, then Main 1),
  // and the later ones only move where the hand-off ends.
  const handoff = useRef<{ target: number; timers: number[] } | null>(null);
  useEffect(() => () => handoff.current?.timers.forEach((t) => window.clearTimeout(t)), []);
  useEffect(() => {
    const before = was.current;
    was.current = { turn: board.turn, index: target };
    if (target < 0) return;
    if (handoff.current && board.turn >= before.turn) {
      handoff.current.target = target;
      return;
    }
    if (board.turn === before.turn && target >= before.index) {
      setShown((s) => ({ index: target, from: s.index, still: false, dim: false }));
      return;
    }
    if (board.turn > before.turn) {
      setShown((s) => ({ ...s, dim: true }));
      const run = { target, timers: [] as number[] };
      handoff.current = run;
      run.timers.push(
        window.setTimeout(
          () => setShown({ index: 0, from: 0, still: true, dim: false }),
          HANDOFF_MS,
        ),
        window.setTimeout(() => {
          handoff.current = null;
          setShown({ index: run.target, from: 0, still: false, dim: false });
        }, HANDOFF_MS + 40),
      );
      return;
    }
    // Backwards in the same turn, or an earlier turn (a restart): placed.
    handoff.current?.timers.forEach((t) => window.clearTimeout(t));
    handoff.current = null;
    setShown({ index: target, from: target, still: true, dim: false });
  }, [board.turn, target]);
  const now = shown.index;
  const mine = board.activeSeat === mySeat;
  // Owner 2026-10-29: "Your turn" and "Opponent's turn", not a name --
  // except to a spectator (spec 0047), whose turn it is nobody's.
  const whose = board.spectator
    ? `${board.players.find((p) => p.seat === board.activeSeat)?.name ?? "Their"}’s turn`
    : mine
      ? "Your turn"
      : "Opponent’s turn";
  const part = combatPart(board.phase);
  // The passed gems fill in order as the gem goes over them.
  const delayOf = (i: number) =>
    !shown.still && i > shown.from && i <= now && now > shown.from
      ? `${Math.round(((i - shown.from) / (now - shown.from)) * SWEEP_MS * 0.8)}ms`
      : undefined;
  return (
    <div className={`gs-ladder${shown.dim ? " gs-ladder-dim" : ""}`}>
      <div className="gs-ladder-head">
        {/* Phase 9 W-15: before the first turn there is no turn 0, and it
            is nobody's turn yet. */}
        {board.turn === 0 ? (
          <span className="gs-turn">Before the game</span>
        ) : (
          <span className="gs-turn" aria-label={`Turn ${board.turn}`}>
            Turn <span className="gs-turn-value">{board.turn}</span>
            {board.dayTime && (
              <span className="gs-day"> · {board.dayTime === "night" ? "Night" : "Day"}</span>
            )}
            {/* §6.70 — after a restart, say which game this is, or "turn 1"
              reads as the game having gone backwards. */}
            {board.gameEpoch > 1 && (
              <span className="gs-day gs-game" title="The game was restarted">
                {" "}
                · Game {board.gameEpoch}
              </span>
            )}
          </span>
        )}
        {board.turn > 0 && (
          <span className={`gs-whose${mine ? " gs-whose-mine" : ""}`}>{whose}</span>
        )}
      </div>
      {/* Spec 0047 -- players see how many are watching (spec 0067 item 2:
          a spectator no longer sees "You are watching"; the chip says it).
          Its own line, so whose turn it is keeps the head. Spec 0067 --
          pointing at it lists who. */}
      {!board.spectator && watching > 0 && (
        <span
          className="gs-watching"
          role="status"
          tabIndex={0}
          aria-label={
            watchers.length > 0
              ? `${watching} watching: ${watchers.join(", ")}`
              : `${watching} watching`
          }
        >
          {`${watching} watching`}
        </span>
      )}
      {/* Spec 0067 -- pointing at (or focusing) the pill opens who, beside
          the column over the table's edge, so the ladder stays readable. */}
      {!board.spectator && watching > 0 && watchers.length > 0 && (
        <div className="gs-watching-list" aria-hidden="true" data-testid="watching-list">
          <span className="gs-status-pointer gs-watching-pointer" />
          <p className="gs-watching-head">Watching</p>
          <ul>
            {watchers.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      )}
      {/* data-step: the step the game is IN; the highlight may still be
          walking towards it. */}
      <div className={`gs-steps-rail${shown.still ? " gs-steps-still" : ""}`}>
        <span
          className="gs-gem"
          aria-hidden="true"
          style={{
            transform: `translateY(${Math.max(0, now) * ROW_PX}px) rotate(45deg)`,
            visibility: now < 0 ? "hidden" : undefined,
          }}
        />
        <ol className="gs-steps" aria-label="Steps of the turn" data-step={STEPS[target]?.label}>
          {STEPS.map((step, i) => (
            <li
              key={step.label}
              className={`gs-step${i === now ? " gs-step-now" : i < now ? " gs-step-past" : ""}`}
              aria-current={i === now ? "step" : undefined}
              style={{ transitionDelay: delayOf(i) }}
            >
              <span
                className="gs-step-dot"
                aria-hidden="true"
                style={{ transitionDelay: delayOf(i) }}
              />
              <span className="gs-step-name">{step.label}</span>
              {i === now && i === target && part && <span className="gs-step-part">{part}</span>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// --- the right-hand column ------------------------------------------------------------

/** Spec 0045 -- a library nearly empty ("low", 3 or fewer) or empty. */
/**
 * Spec 0066 -- the stack object that IS the spell cast from this card: its
 * source is the card, and it is a spell -- not a trigger of the permanent
 * it became (Wasteland Strangler's "When it enters..." has the same
 * source), which rises from the card on the table instead.
 */
export function spellOf(entry: { source?: string | null; kind?: string }, card: string): boolean {
  return entry.source === card && (entry.kind ?? "spell") === "spell";
}

/**
 * Amendment 13 (item 2), spec 0066 item 1 -- the card whose spell is still on
 * its way to the stack, so its stack card (and its arrows) wait: a cast
 * card in the air -- yours, or the other player's turning over, held and
 * flying (a reveal flight) -- or lingering for its balls, or cast this very
 * frame (before its flight exists). Null for none. (A cancelled hidden cast
 * goes back to a hand: no stack card has it as its source.)
 */
export function castOnItsWay(
  flight: { card: { id: string }; hidden: boolean } | null,
  lingering: string | null,
  lastCast: string | null,
  casting: string | null,
): string | null {
  if (flight && !flight.hidden) return flight.card.id;
  // (The other player's too, face down while its balls fly: spec 0066.)
  if (lingering !== null) return lingering;
  return lastCast !== null && lastCast !== casting ? lastCast : null;
}

export function libraryWarning(count: number): "low" | "empty" | null {
  return count === 0 ? "empty" : count <= 3 ? "low" : null;
}

/** Spec 0045 -- the warning in words; `whose` is null for your own library. */
/**
 * W-24 — the banner's words for a finished game. Spec 0056: a game the
 * server stopped under says so plainly, never a result and never "Game
 * over"; otherwise Forge's result, from the board when there is one.
 */
export function endingWords(
  match: MatchView,
  board: Snapshot | null,
  updated: boolean,
  sentence: string,
): { word: string; sub: string; turn: string } {
  if (updated) return { word: SERVER_UPDATE_TITLE, sub: SERVER_UPDATE_LINE, turn: "" };
  if (!board) return { word: "Game over", sub: sentence, turn: "" };
  return gameOverWords(
    board,
    board.spectator ? -1 : board.seat,
    match.outcome,
    match.status === "FAILED_RUNTIME",
  );
}

export function libraryWords(count: number, whose: string | null): string | null {
  const next = whose === null ? "your next draw" : `${whose}’s next draw`;
  if (count === 0) return `Empty: ${next} loses the game`;
  if (count <= 3)
    return `${count} ${count === 1 ? "card" : "cards"} left: drawing from an empty library loses the game`;
  return null;
}

function SeatBlock({
  player,
  board,
  mine,
  deciding = false,
  away = null,
  question,
  aim = null,
  busy,
  onPick,
  onView,
}: {
  player: SnapshotPlayer;
  board: Snapshot;
  mine: boolean;
  /** W-26 -- minutes this player has been gone, or null. */
  away?: number | null;
  /** W-25 — it is this player's move and you are waiting: the plate glows. */
  deciding?: boolean;
  question: Question | null;
  /** W-14 -- a selection can be pointed at this player. */
  aim?: ReadonlySet<string> | null;
  busy: boolean;
  onPick: (id: string) => void;
  onView: (view: { seat: number; zone: "graveyard" | "exile" | "hand" }) => void;
}) {
  const id = `player:${player.seat}`;
  const active = board.activeSeat === player.seat;
  // Spec 0013 (G1) — the player's own picture, beside their life total.
  const { lobby } = useLobbyConnection();
  const seats = useContext(SeatsContext) ?? lobby.match?.participants;
  const seatedAs = seats?.find((p) => p.seatNumber === player.seat)?.userId;
  const priority = board.prioritySeat === player.seat;
  const choosable = Boolean(question?.onBoard.has(id) || aim?.has(id));
  // Amendment 17: already chosen as a target of the spell being cast.
  const chosenTarget = question?.chosen.includes(id) ?? false;
  // The spell resolving next targets this player: their life total glows
  // (owner 2026-10-21), as a targeted card does on the board.
  const targeted = (board.stack[0]?.targets ?? []).some(
    (t) => "player" in t && t.player === player.seat,
  );
  // Said to a screen reader only (owner 2026-10-28: the medallion shows
  // just the name and the Belt; the gold ring on the life says whose turn).
  // Spec 0067 -- a spectator is nobody's "you" or "opponent".
  const role = `${board.spectator ? "player" : mine ? "you" : "opponent"}${active ? ", active turn" : ""}`;
  const visibleHand = board.otherHands.filter((card) => card.seat === player.seat);
  const exiled = board.exile.filter((card) => card.seat === player.seat).length;
  // Spec 0067, item 1 -- the life steps down at each blow of the fights
  // playing (lifeTicks), and settles on the board's when they end.
  const shown = useShownLife(player.seat, player.life);
  const life = shown.life;
  const lifeRef = useRef<HTMLButtonElement>(null);
  const hitsSeen = useRef(shown.hits);
  useEffect(() => {
    if (shown.hits === hitsSeen.current) return;
    hitsSeen.current = shown.hits;
    const shield = lifeRef.current;
    if (!shield || typeof shield.animate !== "function") return;
    // The canvas's A: a short red shake as the number drops.
    shield.animate(LIFE_HIT_FRAMES, { duration: LIFE_HIT_MS, easing: "ease-out" });
  }, [shown.hits]);
  return (
    // Spec 0029 — a raised plate: picture, name and Belt, life in a banner,
    // and a grid of tiles for the zones. Whose turn: the plate's top edge.
    <div
      className={`gs-seat gs-seat-${mine ? "viewer" : "opponent"}${active ? " gs-seat-active" : ""}${deciding ? " gs-seat-deciding" : ""}`}
      data-seat={player.seat}
    >
      <span className="pa-visually-hidden">
        {player.name} ({role}): {life} life, {player.handCount} in hand, {player.libraryCount} in
        library, {player.graveyardCount} in graveyard, {exiled} in exile.
      </span>
      <div className="gs-seat-head">
        <span className="gs-life-face">
          {/* The lobby's gold, silver or bronze ring for a Hall place. */}
          <Avatar
            avatar={seatedAs ? avatarOf(lobby, seatedAs) : null}
            size={48}
            rank={seatedAs ? rankOf(lobby, seatedAs) : undefined}
          />
        </span>
        <span className="gs-seat-who">
          {/* Spec 0041: 12 characters in full, smaller if need be. */}
          <FitName className="gs-seat-name" name={player.name} />
          {away !== null && <span className="gs-seat-away">Away · {away} min</span>}
          {/* Spec 0047 -- a spectator sees no hand: how many cards it holds. */}
          {board.spectator && <span className="gs-seat-hand">{player.handCount} in hand</span>}
          {/* Under the name: who may act (the dot) and the Belt, so the
              name keeps the whole row. */}
          {(priority || holdsBelt(lobby, seatedAs)) && (
            <span className="gs-seat-marks">
              {priority && (
                <>
                  <span aria-hidden="true" className="gs-priority-dot" />
                  <span className="pa-visually-hidden">has priority</span>
                </>
              )}
              {holdsBelt(lobby, seatedAs) && <BeltMark />}
            </span>
          )}
        </span>
        <button
          type="button"
          ref={lifeRef}
          className={`gs-life${active ? " gs-life-active" : ""}${choosable ? " gs-choosable" : ""}${targeted ? " gs-targeted" : ""}${chosenTarget ? " gs-chosen-target" : ""}${lifeIsLong(life) ? " gs-life-long" : ""}`}
          aria-label={`${player.name}, ${life} life${chosenTarget ? ", chosen as a target" : ""}${choosable ? ", can be chosen" : ""}`}
          data-life={life}
          data-object-id={id}
          data-choosable={choosable ? "true" : undefined}
          data-chosen-target={chosenTarget ? "true" : undefined}
          disabled={busy && choosable}
          onClick={() => onPick(id)}
        >
          <span className="gs-life-n">{life}</span>
          {chosenTarget && (
            <span className="gs-life-target" aria-hidden="true">
              TARGET
            </span>
          )}
        </button>
      </div>
      {/* Spec 0031 — the opponent's hand is drawn on the board, fanned down
          from the top edge; its count stays here for screen readers. */}
      {!mine && (
        <p className="pa-visually-hidden">
          {`${player.name}'s hand, ${player.handCount} cards${visibleHand.length ? `, ${visibleHand.length} visible to you` : ""}`}
        </p>
      )}
      <div className="gs-zones">
        {/* Spec 0045 -- gold when nearly empty, red when empty: a draw
            from an empty library loses the game (CR 704.5b). */}
        <div
          className={`gs-zone${libraryWarning(player.libraryCount) ? ` gs-zone-${libraryWarning(player.libraryCount)}` : ""}`}
          title={
            libraryWords(player.libraryCount, mine && !board.spectator ? null : player.name) ??
            "Library"
          }
          aria-label={`${player.name}'s library, ${player.libraryCount} cards${libraryWarning(player.libraryCount) ? `. ${libraryWords(player.libraryCount, mine && !board.spectator ? null : player.name)}` : ""}`}
          data-warning={libraryWarning(player.libraryCount) ?? undefined}
          data-zone-tile={`${mine ? "viewer" : "opponent"}:library`}
        >
          <ZoneIcon zone="library" />
          <span className="gs-zone-n">{player.libraryCount}</span>
          <span className="gs-zone-key">
            {libraryWarning(player.libraryCount) === "empty"
              ? libraryWords(0, mine && !board.spectator ? null : player.name)
              : "Library"}
          </span>
        </div>
        <button
          type="button"
          className="gs-zone"
          title="Graveyard"
          aria-label={`${player.name}'s graveyard, ${player.graveyardCount} cards`}
          onClick={() => onView({ seat: player.seat, zone: "graveyard" })}
          data-zone-tile={`${mine ? "viewer" : "opponent"}:graveyard`}
        >
          <ZoneIcon zone="graveyard" />
          <span className="gs-zone-n">{player.graveyardCount}</span>
          <span className="gs-zone-key">Graveyard</span>
        </button>
        <button
          type="button"
          className="gs-zone"
          title="Exile"
          aria-label={`${player.name}'s exile, ${exiled} cards`}
          onClick={() => onView({ seat: player.seat, zone: "exile" })}
          data-zone-tile={`${mine ? "viewer" : "opponent"}:exile`}
        >
          <ZoneIcon zone="exile" />
          <span className="gs-zone-n">{exiled}</span>
          <span className="gs-zone-key">Exile</span>
        </button>
      </div>
    </div>
  );
}

/** Spec 0029 — the zone tiles' icons; the word is beside them (and read aloud). */
/** Spec 0031 — the owner's pictures, drawn faded behind each tile's count. */
const ZONE_ART = { library: libraryArt, graveyard: graveyardArt, exile: exileArt };

function ZoneIcon({ zone }: { zone: keyof typeof ZONE_ART }) {
  return <img className="gs-zone-art" src={ZONE_ART[zone]} alt="" draggable={false} />;
}

/** Spec 0034 (B2, Seal) — the act button's coin: what pressing it does, as a picture. */
const EMBLEM = {
  next: "M5 12h14M13 6l6 6-6 6",
  end: "M5 6l6 6-6 6M12 6l6 6-6 6",
  resolve: "M12 4v11M7 10l5 5 5-5M6 20h12",
  sword: "M14.5 17.5L4 7V4h3l10.5 10.5M13 19l6-6M16 16l4 4",
  shield: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z",
  cancel: "M7 7l10 10M17 7L7 17",
  wait: "M7 4h10M7 20h10M8 4c0 5 8 5 8 8s-8 3-8 8M16 4c0 5-8 5-8 8s8 3 8 8",
  flag: "M6 21V4M6 4h11l-2.5 4L17 12H6",
  ask: "M12 19V6M6 11l6-6 6 6",
  leave: "M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  // Amendment 13 (item 1) -- the countdown's pause, and resolving when paused.
  pause: "M9 5v14M15 5v14",
  play: "M8 5l11 7-11 7z",
} as const;

function passEmblem(word: string): keyof typeof EMBLEM {
  if (word === "Resolve") return "resolve";
  if (word === "End turn") return "end";
  if (word === "To blocks") return "shield";
  if (word === "To damage") return "sword";
  return "next";
}

/**
 * The coin; with `seconds`, the countdown's seconds inside a gold ring
 * that empties once over the response window (it starts when the
 * countdown button appears, as the countdown does).
 */
function Coin({ emblem, seconds }: { emblem: keyof typeof EMBLEM; seconds?: number }) {
  if (seconds !== undefined) {
    return (
      <span className="gs-coin gs-coin-timer" aria-hidden="true">
        <svg className="gs-coin-dial" viewBox="0 0 46 46" width="46" height="46">
          <circle
            className="gs-coin-ring"
            cx="23"
            cy="23"
            r="20"
            pathLength={100}
            style={{ animationDuration: `${RESPONSE_WINDOW_MS}ms` }}
          />
        </svg>
        {/* Amendment 13 (item 1) -- a pause sign in the circle; the seconds
            are in the words beside it. */}
        <svg className="gs-coin-pause" viewBox="0 0 24 24" width="22" height="22">
          <path d={EMBLEM.pause} />
        </svg>
      </span>
    );
  }
  return (
    <span className="gs-coin" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path d={EMBLEM[emblem]} />
      </svg>
    </span>
  );
}

/** Spec 0002 — how long nobody must be asked before the rail says "Resolving…". */
const RESOLVING_AFTER_MS = 500;

/**
 * Spec 0002 — true once nobody has been asked for [RESOLVING_AFTER_MS]:
 * questions follow each other in milliseconds, and saying "Resolving…"
 * for each gap would flicker.
 */
function useResolving(asking: { seat: number | null } | null): boolean {
  const nobody = asking !== null && asking.seat === null;
  const [quiet, setQuiet] = useState(false);
  useEffect(() => {
    setQuiet(false);
    if (!nobody) return undefined;
    const timer = setTimeout(() => setQuiet(true), RESOLVING_AFTER_MS);
    return () => clearTimeout(timer);
  }, [nobody]);
  return nobody && quiet;
}

/** Spec 0058, item 5 -- how long the act button holds its last state when nothing is asked. */
export const STEADY_MS = 400;
/** Spec 0058, item 5 -- while triggers go on the stack, the gaps between their questions. */
export const PLACING_QUIET_MS = 1500;
const PLACING_KINDS = new Set(["chooseTargetsFor", "confirmTrigger", "chooseModeForAbility"]);

/**
 * Spec 0058, item 5 -- a question asked while the game puts triggers on the
 * stack: their order, or a trigger's target, "use it?" or mode (each is
 * chosen as it goes on the stack, rule 603.3d).
 */
export function placingTriggers(decision: Decision | null): boolean {
  if (!decision) return false;
  if (decision.kind === "orderSimultaneousAbilities") return true;
  return PLACING_KINDS.has(decision.kind) && decision.about?.kind === "trigger";
}

/**
 * Spec 0058, item 5 -- the act button, steady. Each trigger going on the
 * stack is its own question; between them nothing is asked for a moment,
 * and the button cycled through several labels in a second and a half.
 * So: while [placing] (a trigger question the page answers itself), and in
 * the quiet after one, it says "One moment · Putting triggers on the stack";
 * any other quiet moment shows the last button, unclickable, for
 * [STEADY_MS] -- then what is true now.
 */
export function useSteadyAct(
  act: ReactNode,
  quiet: boolean,
  placing: "answering" | "asking" | null,
): ReactNode {
  const live = useRef<ReactNode>(null);
  const wasPlacing = useRef(false);
  const [since, setSince] = useState<number | null>(null);
  const [, setTick] = useState(0);
  if (!quiet) {
    live.current = act;
    wasPlacing.current = placing !== null;
  }
  useEffect(() => {
    if (!quiet) {
      setSince(null);
      return undefined;
    }
    setSince(Date.now());
    const timer = setTimeout(
      () => setTick((n) => n + 1),
      wasPlacing.current ? PLACING_QUIET_MS : STEADY_MS,
    );
    return () => clearTimeout(timer);
  }, [quiet]);
  const placingNode = (
    <div className="gs-waiting gs-waiting-placing" role="status">
      <Coin emblem="wait" />
      <span className="gs-act-text">
        <span className="gs-waiting-word">One moment</span>
        <span className="gs-waiting-sub">Putting triggers on the stack</span>
      </span>
    </div>
  );
  // A trigger question the page answers itself: no button of its own.
  if (!quiet) return placing === "answering" ? placingNode : act;
  const held = since === null ? 0 : Date.now() - since;
  if (wasPlacing.current && held < PLACING_QUIET_MS) return placingNode;
  if (live.current && held < STEADY_MS) {
    return (
      // A disabled fieldset: every button in it is disabled, clicked or not.
      <fieldset className="gs-act-held" disabled aria-hidden="true">
        {live.current}
      </fieldset>
    );
  }
  return act;
}

/**
 * Spec 0061, item 3 (owner's way "a") -- the act button while discarding to
 * hand size: grey until the cards are picked ("Discard 1 · Click a card to
 * pick it"), then red and naming them ("Discard Elvish Warrior"); only it
 * discards.
 */
export function DiscardAct({
  discard,
  busy,
  onDiscard,
}: {
  discard: { heading: string; word: string; sub: string; ready: boolean };
  busy: boolean;
  onDiscard?: (() => void) | undefined;
}) {
  return (
    <div className="gs-act-group gs-discard" data-kind={DISCARD_KIND}>
      <h2 className="gs-question-title pa-visually-hidden">{discard.heading}</h2>
      <button
        type="button"
        className={`gs-act gs-act-discard${discard.ready ? "" : " gs-act-discard-idle"}`}
        disabled={busy || !discard.ready}
        onClick={onDiscard}
        aria-label={`${discard.word}. ${discard.sub}`}
      >
        <Coin emblem="cancel" />
        <span className="gs-act-text">
          <span className="gs-act-word">{discard.word}</span>
          <span className="gs-act-sub">{discard.sub}</span>
        </span>
      </button>
    </div>
  );
}

/** Spec 0002 — the last seat the server said was asked. */
function useLastAsked(asking: { seat: number | null } | null): number | null {
  const [last, setLast] = useState<number | null>(null);
  const seat = asking?.seat ?? null;
  useEffect(() => {
    if (seat !== null) setLast(seat);
  }, [seat]);
  return seat ?? last;
}

function Rail({
  theirAway = null,
  board,
  question,
  aim = null,
  actingSeat = null,
  mySeat,
  asking,
  busy,
  onPick,
  onPass,
  combat,
  cancel,
  onAnswer,
  countdown,
  windowPaused = false,
  onPauseWindow,
  onResolveAll,
  onView,
  over,
  onLeave,
  watching = 0,
  watchers = [],
  placing = null,
  discard = null,
  onDiscard,
}: {
  board: Snapshot;
  question: Question | null;
  /** W-14 -- what the selected creatures can be pointed at. */
  aim?: ReadonlySet<string> | null;
  /** W-26 -- minutes the other player has been gone, or null. */
  theirAway?: number | null;
  /** Amendment 12 -- the seat whose action the open tray reports: it glows. */
  actingSeat?: number | null;
  mySeat: number;
  /** Spec 0002 — who the server says is being asked; null before it says. */
  asking: { seat: number | null } | null;
  busy: boolean;
  onPick: (id: string) => void;
  onPass: () => void;
  /** Declaring attackers or blockers: the act button is the combat button. */
  combat: CombatButton | null;
  /** A question whose "no" backs out (a target, a payment): what Cancel
   * says, and the answer it sends (null: a pass; Amendment 17: a target
   * question's own cancel, since there a pass can mean "no more"). */
  cancel: { word: string; sub: string; answer: string | null } | null;
  onAnswer: (actionId: string | null) => void;
  /** Spec 0005 — seconds left in a response window, or null when none is counting. */
  countdown: number | null;
  /** Amendment 13 (item 1) -- your own spell's countdown, paused by you. */
  windowPaused?: boolean;
  onPauseWindow?: () => void;
  /** Spec 0043 — "Let it all resolve": pass until the stack empties or grows. */
  onResolveAll: () => void;
  onView: (view: { seat: number; zone: "graveyard" | "exile" | "hand" }) => void;
  /**
   * The game is over (W-24): who won and why, for the column; `aside`
   * once the banner is put away, when the button here leaves instead.
   */
  over: GameOver | null;
  onLeave: () => void;
  /** Spec 0047 — how many people are watching. */
  watching?: number;
  /** Spec 0067 — who is watching, by name. */
  watchers?: readonly string[];
  /**
   * Spec 0058, item 5 -- the game is putting triggers on the stack: a
   * question about one the page answers itself, or the gap after one.
   */
  placing?: "answering" | "asking" | null;
  /** Spec 0061, item 3 -- discarding to hand size: what the button says, and whether it can. */
  discard?: { heading: string; word: string; sub: string; ready: boolean } | null;
  onDiscard?: () => void;
}) {
  const me = board.players.find((p) => p.seat === mySeat);
  const them = board.players.find((p) => p.seat !== mySeat);
  const top = board.stack[0];
  const resolving = useResolving(asking);
  const lastAsked = useLastAsked(asking);
  const myPriority = question?.context === "priority";
  const words = passWords(board, mySeat);
  // W-25 — whose move it is, when nothing is asked of you; their corner glows.
  const waiting =
    !over && !combat && !cancel && !myPriority && !question
      ? waitingLine(board, board.spectator ? -1 : mySeat, asking, lastAsked, resolving)
      : null;
  const act = over?.aside ? (
    // W-24 — the banner put away to look at the board: this leaves.
    <div className="gs-act-group">
      <button type="button" className="gs-act gs-act-leave" onClick={onLeave}>
        <Coin emblem="leave" />
        <span className="gs-act-text">
          <span className="gs-act-word">{over.leaveWord}</span>
          <span className="gs-act-sub">{over.word}</span>
        </span>
      </button>
      {/* In "All attack"'s place, above the button. */}
      <ul className="gs-combat-options">
        <li>
          <button type="button" className="gs-act-all" onClick={over.onShow}>
            Show the result
          </button>
        </li>
      </ul>
    </div>
  ) : over ? (
    <div className="gs-waiting" role="status">
      <Coin emblem="flag" />
      <span className="gs-act-text">
        <span className="gs-waiting-word">{over.word}</span>
        {(over.sub || over.turn) && <span className="gs-waiting-sub">{over.sub || over.turn}</span>}
      </span>
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
      {combat.onAll && (
        <ul className="gs-combat-options">
          <li>
            <button type="button" className="gs-act-all" disabled={busy} onClick={combat.onAll}>
              All attack
            </button>
          </li>
        </ul>
      )}
      {combat.marked > 0 ? (
        // W-14 (owner: the button locked) -- selected but not pointed:
        // nothing moves on until they are pointed or unselected.
        <button
          type="button"
          className="gs-act gs-act-combat gs-act-waiting"
          disabled
          aria-label={`${combat.marked} selected. Click what they ${combat.kind === "declareAttackers" ? "attack" : "block"}, or press Escape to unselect them.`}
        >
          <Coin emblem={combat.kind === "declareAttackers" ? "sword" : "shield"} />
          <span className="gs-act-text">
            <span className="gs-act-word">{combat.marked} selected</span>
            <span className="gs-act-sub">
              Click what they {combat.kind === "declareAttackers" ? "attack" : "block"} · Esc
              unselects
            </span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          className="gs-act gs-act-combat"
          disabled={busy || !combat.canPass}
          onClick={() => onAnswer(null)}
          aria-label={`Pass: ${combat.word}. ${combat.sub}`}
        >
          <Coin emblem={combat.kind === "declareAttackers" ? "sword" : "shield"} />
          <span className="gs-act-text">
            <span className="gs-act-word">{combat.word}</span>
            <span className="gs-act-sub">{combat.sub}</span>
          </span>
        </button>
      )}
    </div>
  ) : discard ? (
    // Spec 0061, item 3 (way a) -- pick, then confirm.
    <DiscardAct discard={discard} busy={busy} onDiscard={onDiscard} />
  ) : cancel ? (
    // Owner 2026-10-22: a misclick must be undoable where every other
    // answer is -- the act button. Esc does the same.
    <button
      type="button"
      className="gs-act gs-act-cancel"
      disabled={busy}
      onClick={() => onAnswer(cancel.answer)}
      aria-label={`${cancel.word}: ${cancel.sub}`}
    >
      <Coin emblem="cancel" />
      <span className="gs-act-text">
        <span className="gs-act-word">{cancel.word}</span>
        <span className="gs-act-sub">{cancel.sub} · Esc</span>
      </span>
    </button>
  ) : myPriority && countdown !== null ? (
    // Spec 0005: your own spell or trigger is on top. It resolves when
    // the countdown runs out; clicking here resolves it now (spec 0035:
    // an ordinary Pass). Clicking a card you could play still pauses.
    <div className="gs-act-group">
      <button
        type="button"
        className="gs-act gs-act-window"
        disabled={busy}
        onClick={() => onAnswer(null)}
        aria-label={`Pass: Resolve ${top?.name ?? "it"} now, or in ${countdown}.`}
      >
        {/* Keyed: a new spell on top starts its ring again. */}
        <Coin key={top?.id} emblem="resolve" seconds={countdown} />
        <span className="gs-act-text">
          <span className="gs-act-word">Resolves in {countdown}</span>
          <span className="gs-act-sub">
            {top ? `Your ${top.name}` : "Yours"} · click to resolve now
          </span>
        </span>
      </button>
      {/* Amendment 13 (item 1) -- the circle pauses the countdown. Its own
              button over the coin: the words beside it still resolve now. */}
      {onPauseWindow && (
        <button
          type="button"
          className="gs-act-pause"
          aria-label="Pause the countdown"
          onClick={onPauseWindow}
        />
      )}
      {/* Spec 0043: pass until the stack is empty -- asked again if
              anything new is added to it. */}
      {board.stack.length > 1 && (
        <button type="button" className="gs-act-all" disabled={busy} onClick={onResolveAll}>
          Let it all resolve
        </button>
      )}
    </div>
  ) : myPriority && windowPaused ? (
    // Amendment 13 (item 1) -- paused: nothing resolves until you say.
    <button
      type="button"
      className="gs-act gs-act-window"
      disabled={busy}
      onClick={() => onAnswer(null)}
      aria-label={`Pass: Resolve ${top?.name ?? "it"}. Paused.`}
    >
      <Coin emblem="play" />
      <span className="gs-act-text">
        <span className="gs-act-word">Paused</span>
        <span className="gs-act-sub">Resolve when you're ready</span>
      </span>
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
        <Coin emblem={passEmblem(words.word)} />
        <span className="gs-act-text">
          <span className="gs-act-word">{words.word}</span>
          <span className="gs-act-sub">{words.sub}</span>
        </span>
      </button>
      {board.stack.length > 1 && (
        <button type="button" className="gs-act-all" disabled={busy} onClick={onResolveAll}>
          Let it all resolve
        </button>
      )}
    </div>
  ) : waiting ? (
    <div className="gs-waiting" role="status">
      {/* W-25: whose move, in plain letters, and what they are doing. */}
      <Coin emblem="wait" />
      <span className="gs-act-text">
        <span className="gs-waiting-name">{waiting.word}</span>
        {waiting.sub && <span className="gs-waiting-sub">{waiting.sub}</span>}
      </span>
    </div>
  ) : (
    <div className="gs-waiting gs-waiting-question" role="status">
      <Coin emblem="ask" />
      <span className="gs-act-text">
        <span className="gs-waiting-word">Your answer</span>
        <span className="gs-waiting-sub">Your choice is above the board</span>
      </span>
    </div>
  );
  // Spec 0058, item 5 -- nothing asked of you: the last button, for a moment.
  const steadyAct = useSteadyAct(act, waiting !== null && !over, placing);
  // Spec 0067 -- a spectator's "Switch sides": the plates swap ends with
  // the table, gliding there (P10-R1), each keyed by its seat so it is the
  // same plate that moves.
  const railRef = useRef<HTMLDivElement>(null);
  const plates = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const before = plates.current;
    const now = new Map<string, number>();
    for (const plate of rail.querySelectorAll<HTMLElement>(".gs-seat[data-seat]")) {
      const seat = plate.dataset["seat"] ?? "";
      const top = plate.getBoundingClientRect().top;
      now.set(seat, top);
      const was = before.get(seat);
      if (was !== undefined && Math.abs(was - top) > 1 && typeof plate.animate === "function") {
        plate.animate(
          [{ transform: `translateY(${was - top}px)` }, { transform: "translateY(0)" }],
          { duration: SWITCH_SIDES_MS * 0.6, easing: "cubic-bezier(.45,0,.25,1)" },
        );
      }
    }
    plates.current = now;
  }, [mySeat]);
  return (
    <div className="gs-rail" ref={railRef}>
      {them && (
        <StatusTray
          key={`tray-${them.seat}`}
          player={them}
          side="opponent"
          spectating={board.spectator === true}
        />
      )}
      {me && (
        <StatusTray
          key={`tray-${me.seat}`}
          player={me}
          side="viewer"
          spectating={board.spectator === true}
        />
      )}
      {them && (
        <SeatBlock
          key={`seat-${them.seat}`}
          player={them}
          board={board}
          mine={false}
          away={theirAway ?? null}
          deciding={waiting?.seat === them.seat || actingSeat === them.seat}
          question={question}
          aim={aim}
          busy={busy}
          onPick={onPick}
          onView={onView}
        />
      )}

      <StepLadder board={board} mySeat={mySeat} watching={watching} watchers={watchers} />

      {/* The act button keeps its canvas place. The stack is drawn as cards
          on the board (owner 2026-10-22: the column's Stack box is gone).
          Spec 0058, item 5: held steady between questions. */}
      {steadyAct}

      {me && (
        <SeatBlock
          key={`seat-${me.seat}`}
          player={me}
          board={board}
          mine
          deciding={actingSeat === me.seat}
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
  onAnswer,
  onSearch,
  artUrl,
}: {
  decision: NonNullable<MatchState["decision"]>;
  question: Question;
  mySeat: number | null;
  busy: boolean;
  notice: string | null;
  onAnswer: (actionId: string | null) => void;
  onSearch: (query: string) => void;
  artUrl: (art: string) => string;
}) {
  // Declaring attackers or blockers is answered on the board and the act
  // button (owner 2026-10-22); the list, opened from the menu, still works.
  if (COMBAT_KINDS.has(decision.kind)) return null;
  const onBoardCount = [...question.onBoard.values()].reduce((n, list) => n + list.length, 0);
  // On your move with nothing to list, the board and the Pass button are
  // the whole question: NO bar over the table (AMENDMENT 12).
  if (
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
        <ManaText text={o.label ?? o.actionId} />
        {!o.payable && <span className="gs-option-note"> (not enough mana right now)</span>}
      </button>
    </li>
  );
  const heading =
    decision.actedForSeat === mySeat
      ? headingFor(decision.kind)
      : `Playing for seat ${decision.actedForSeat}`;
  // Spec 0001 D3 (owner 2026-10-22): a scry's or a surveil's cards, shown
  // to you alone as pictures, and clicked like the board. A card no
  // option is about is only shown -- or, while others are still being
  // chosen, already chosen.
  if (decision.looking.length > 0) {
    const byCard = new Map<string, DecisionOption>();
    for (const o of decision.options) if (o.objectId) byCard.set(o.objectId, o);
    const shown = new Set(decision.looking.map((card) => card.id));
    const choosing = decision.looking.some((card) => byCard.has(card.id));
    const rest = decision.options.filter((o) => !o.objectId || !shown.has(o.objectId));
    return (
      <div className="gs-question gs-question-looking" data-kind={decision.kind}>
        <h2 className="gs-question-title">{heading}</h2>
        {decision.prompt && (
          <p className="gs-question-prompt decision-prompt">
            <ManaText text={decision.prompt} />
          </p>
        )}
        {notice && (
          <p className="gs-question-notice" role="alert">
            <ManaText text={notice} />
          </p>
        )}
        <ul className="gs-looking bf-asking" aria-label="The cards you are looking at">
          {decision.looking.map((card) => {
            const pick = byCard.get(card.id);
            const chosen = choosing && !pick;
            const look = lookOf(card.kind, card.types);
            return (
              <li key={card.id} className="gs-looking-slot">
                <button
                  type="button"
                  className={`bf-card bf-look-${look}${pick ? " bf-choosable" : ""}${chosen ? " bf-dim" : ""}`}
                  disabled={busy || !pick}
                  data-object-id={card.id}
                  data-choosable={pick ? "true" : undefined}
                  aria-label={`${card.name}${pick ? ", can be chosen" : chosen ? ", chosen" : ""}`}
                  onClick={() => pick && onAnswer(pick.actionId)}
                >
                  <CardFace
                    name={card.name}
                    look={look}
                    type={shortType(card.types)}
                    pt={figure(card)}
                    art={card.art ? artUrl(card.art) : null}
                    faceDown={card.faceDown}
                    known={card.known}
                  />
                  {chosen && <span className="bf-state">CHOSEN</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {rest.length > 0 && <ul className="gs-options">{rest.map(option)}</ul>}
        <p className="gs-question-foot">{hintFor(decision.kind, decision.options.length)}</p>
        {/* "No more": the rules allow stopping here (none, or no more). */}
        {question.canPass && (
          <button type="button" className="gs-pass" disabled={busy} onClick={() => onAnswer(null)}>
            Done
          </button>
        )}
      </div>
    );
  }
  // Everything asked is on the board (a target, a land to tap): the
  // board is the answer, so the question is one line over the table,
  // never a box in the middle of it (AMENDMENT 12).
  if (!decision.searchable && question.listed.length <= 3 && onBoardCount > 0) {
    return (
      <div className="gs-question gs-question-slim" data-kind={decision.kind}>
        <h2 className="gs-question-title">{heading}</h2>
        {decision.prompt && (
          <p className="gs-question-prompt decision-prompt">
            <ManaText text={decision.prompt} />
          </p>
        )}
        <p className="gs-question-hint">{hintFor(decision.kind, decision.options.length)}</p>
        {/* A few choices the board cannot show ("All attack"): inline. */}
        {question.listed.length > 0 && (
          <ul className="gs-options gs-options-inline">{question.listed.map(option)}</ul>
        )}
        {notice && (
          <p className="gs-question-notice" role="alert">
            <ManaText text={notice} />
          </p>
        )}
        {question.context !== "priority" &&
          question.canPass &&
          !CANCEL_KINDS.has(decision.kind) && (
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
      {decision.prompt && (
        <p className="gs-question-prompt decision-prompt">
          <ManaText text={decision.prompt} />
        </p>
      )}
      {notice && (
        <p className="gs-question-notice" role="alert">
          <ManaText text={notice} />
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
          {question.listed.length > 0 && (
            <ul className="gs-options">{question.listed.map(option)}</ul>
          )}
          <p className="gs-question-foot">{hintFor(decision.kind, decision.options.length)}</p>
        </>
      )}
      {/* On your move, Pass is the act button under the stack (the
          canvas); here only when this question's "no" is not a pass of
          priority. Never when the rules give no "no" (Phase 6). */}
      {question.context !== "priority" && question.canPass && !CANCEL_KINDS.has(decision.kind) && (
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
/**
 * A window's "no": Pass where the rules allow one; none on your move (the
 * act button passes) or when the rules give no "no" (Phase 6). Backing out
 * of a target or a payment is the act button under the stack and Esc, not
 * the window (owner 2026-10-30) -- except in "List choices", which the act
 * button steps aside for.
 */
function passWordFor(decision: Decision, question: Question, inList: boolean): string | null {
  if (question.context === "priority" || !question.canPass) return null;
  // An optional cost's "no" casts the spell without it (spec 0042).
  if (decision.kind === "chooseOptionalCosts") return "No";
  if (!CANCEL_KINDS.has(decision.kind)) return "Pass";
  return inList ? cancelWords(decision.about).word : null;
}

const CANCEL_KINDS = new Set([
  "chooseTargetsFor",
  "getAbilityToPlay",
  "applyManaToCost",
  "chooseManaAbility",
  "CostPutCounter",
  "CostRemoveCounter",
  "CostTapType",
  "CostSacrifice",
  "CostDiscard",
  "CostExile",
  "CostReturn",
  "CostReveal",
  "CostExert",
  "CostBehold",
  "CostCollectEvidence",
  "CostBlight",
  "CostEnlist",
  "CostForage",
  "CostGainLife",
  "CostPutCardToLib",
  "CostUntapType",
  "CostRemoveAnyCounter",
  "CostExiledMoveToGrave",
  "CostUnattach",
  "CostExileFromStack",
]);

/** The two combat questions, answered on the board and the act button. */
const COMBAT_KINDS = new Set(["declareAttackers", "declareBlockers"]);
/** Forge's "every creature still offered" (CombatChoices.ALL_ATTACK). */
const ALL_ATTACK = "attackers:all";

/**
 * Phase 9 W-24 (owner 2026-11-02, option B) — the result across the
 * table, said once; Look at the board puts it away and the column's
 * button leaves instead. The full sentence is what a screen reader hears.
 * `onAside` null: no table to look at.
 */
function ResultBanner({
  over,
  sentence,
  onLeave,
  onAside,
}: {
  over: GameOver;
  sentence: string;
  onLeave: () => void;
  onAside: (() => void) | null;
}) {
  return (
    <div
      className={`gs-over${over.won ? " gs-over-won" : ""}${onAside ? "" : " gs-over-alone"}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby="gs-over-title"
      aria-describedby="gs-over-text"
    >
      <h2 id="gs-over-title" className="gs-over-title">
        {over.word}
      </h2>
      <p className="gs-over-why" aria-hidden="true">
        {[over.sub, over.turn].filter(Boolean).join(" · ")}
      </p>
      <p id="gs-over-text" className="pa-visually-hidden">
        {sentence}
      </p>
      <div className="gs-over-buttons">
        <button type="button" className="pa-button pa-button-brass" onClick={onLeave}>
          {over.leaveWord}
        </button>
        {onAside && (
          <button type="button" className="pa-button pa-button-quiet" onClick={onAside}>
            Look at the board
          </button>
        )}
      </div>
    </div>
  );
}

/** W-24 — the end of the game, as the banner and the column say it. */
interface GameOver {
  word: string;
  sub: string;
  turn: string;
  /** You won: the banner is gold. */
  won: boolean;
  /** The banner is put away; the column's button leaves. */
  aside: boolean;
  leaveWord: string;
  onShow: () => void;
}

interface CombatButton {
  kind: string;
  heading: string;
  word: string;
  sub: string;
  /** "All attack": select every creature that can attack. */
  onAll: (() => void) | null;
  /** W-14 -- how many are selected and not yet pointed: the button waits. */
  marked: number;
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
    const attacking = board.battlefield.filter((c) => c.attacking && c.seat === mySeat);
    // Spec 0034: and their total power.
    return attacking.length > 0
      ? {
          word: `Attack with ${attacking.length}`,
          sub: `${totalPower(attacking)} power · select more, or click one to take it back`,
        }
      : { word: "No attacks", sub: "Select creatures, then click what they attack" };
  }
  const n = board.battlefield.filter((c) => c.blocking && c.seat === mySeat).length;
  const through = unblockedPower(board);
  return n > 0
    ? {
        word: `Block with ${n}`,
        sub:
          through === null
            ? "Select more, or click a blocker to take it back"
            : `${through} power still gets through`,
      }
    : { word: "No blocks", sub: "Select creatures, then click what they block" };
}

/**
 * Spec 0057, item 6 (owner A) -- where a question's window sits: by the card
 * it is about when that card is in the hand or on the battlefield (the game
 * names it: `about.card`, for an ability or a card being played -- a
 * trigger or a spell is on the stack, and stays by it); otherwise by the
 * stack. Clear of whatever the question needs clicked.
 */
/**
 * Spec 0068 -- the window of a question about the card being cast: beside
 * that card (always in the middle of the screen), on whichever side covers
 * nothing the question needs clicked (anchorByCard); on its left, as
 * before, if neither side is clear. The card no longer moves out of the
 * window's way, so the window does: found in a real game, Swords to
 * Plowshares' window on the left hid the creature to exile.
 */
export function castingWindowAnchor(
  middle: Box,
  castingId: string,
  question: Question | null,
  board: Snapshot,
  geometry: Geometry,
  stackSpot: Box,
  at: ((objectId: string) => Box | null) | null,
): Anchor {
  const avoid =
    question && at
      ? [...question.onBoard.keys()]
          .filter((id) => id !== castingId && !board.hand.some((c) => c.id === id))
          .map((id) => at(id))
          .filter((b): b is Box => b !== null)
      : [];
  return anchorByCard({
    card: middle,
    inHand: false,
    geometry,
    stack: stackSpot,
    avoid,
    fallback: middle,
  });
}

export function askingCardAnchor(
  decision: Decision,
  question: Question | null,
  board: Snapshot,
  geometry: Geometry,
  stackSpot: Box,
  at: ((objectId: string) => Box | null) | null,
): Anchor {
  const about = decision.about;
  const id = about?.card && (about.kind === "ability" || about.kind === "card") ? about.card : null;
  const inHand = !!id && board.hand.some((c) => c.id === id);
  const onField = !!id && board.battlefield.some((c) => c.id === id);
  if (!id || (!inHand && !onField) || !at) return stackSpot;
  const avoid = [...(question?.onBoard.keys() ?? [])]
    .filter((other) => other !== id)
    .map((other) => at(other))
    .filter((b): b is Box => b !== null);
  return anchorByCard({
    card: at(id),
    inHand,
    geometry,
    stack: stackSpot,
    avoid,
    fallback: stackSpot,
  });
}

/**
 * Phase 9 W-16 (owner 2026-11-03, option A) -- what a card can do: its
 * picture and name once; each ability with its cost first and large (a
 * green +1, a red -3, mana), then its words; the abilities it can't use
 * now greyed with why; and for a card that can't be played, the reason.
 * Each choice keeps the game's whole line for a screen reader.
 */
export function ActionPopup({
  box,
  name,
  card,
  artUrl,
  options,
  notNow,
  why,
  busy,
  onChoose,
  onInspect,
  onClose,
}: {
  box: { x: number; y: number; w: number; h: number } | null;
  name: string;
  card: SnapshotCard | null;
  artUrl: (art: string) => string;
  options: DecisionOption[];
  notNow: NotNowRow[];
  why: string | null;
  busy: boolean;
  onChoose: (actionId: string) => void;
  onInspect: () => void;
  onClose: () => void;
}) {
  // Amendment 22: Space or Peek fades the ability menu too (owner 2026-11-06).
  const peek = usePeek(true);
  const first = useRef<HTMLButtonElement | null>(null);
  useEffect(() => first.current?.focus({ preventScroll: true }), []);
  // Centred on the card, but never past the board's edges (owner
  // 2026-11-03): a card in the far-left column opens it fully on screen.
  // Half the menu's 380px width, plus 8px (40px on the left, clear of the
  // game chat's tab).
  const style = box
    ? {
        left: `clamp(230px, ${box.x + box.w / 2}px, calc(100% - 198px))`,
        top: box.y > 300 ? box.y - 12 : box.y + box.h + 12,
        transform: box.y > 300 ? "translate(-50%, -100%)" : "translate(-50%, 0)",
      }
    : { left: "40%", top: "40%" };
  const cost = (c: string | null, kind: string | null) =>
    c ? (
      <span className={`gs-ab-cost gs-ab-${kind ?? "mana"}`} aria-hidden="true">
        {kind === "mana" ? <ManaText text={c} /> : c.replace("-", "−")}
      </span>
    ) : (
      <span className="gs-ab-cost gs-ab-none" aria-hidden="true" />
    );
  return (
    <div
      className={`gs-popup${peek ? " gs-win-peek" : ""}`}
      role="dialog"
      aria-label={`${name}: what it can do`}
      style={style}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="gs-popup-head">
        {card?.art && !(card.faceDown && !card.known) && (
          <img className="gs-popup-pic" src={artUrl(card.art)} alt="" draggable={false} />
        )}
        <span>
          <span className="gs-popup-name">{name}</span>
          {card?.types && <span className="gs-popup-count">{card.types}</span>}
        </span>
      </div>
      {why && (
        <p className="gs-popup-why" role="status">
          <b>Not now.</b> <ManaText text={why} />
        </p>
      )}
      {(options.length > 0 || notNow.length > 0) && (
        <ul className="gs-popup-actions">
          {/* Spec 0061, item 1 -- the play this card can't make now, first and
              greyed, with why: its only choices throw it away. */}
          {notNow
            .filter((row) => row.use)
            .map((row) => (
              <li
                key={row.label}
                className="gs-ab-no gs-ab-use-no"
                data-use={row.use}
                aria-label={`${row.label}: ${row.why}`}
              >
                <span className="gs-ab-words">
                  <span className="gs-ab-said gs-ab-title">{row.label}</span>
                  <em className="gs-ab-why">{row.why}</em>
                </span>
              </li>
            ))}
          {playFirst(options).map((o, i) => {
            const use = o.use ?? null;
            if (use) {
              // Spec 0057, item 5 -- play it (gold, the main choice), or
              // throw it away for something (red: says what is lost).
              const plays = use.kind === "land" || use.kind === "spell";
              const price = use.cost ?? (plays ? o.cost : null);
              return (
                <li key={o.actionId}>
                  <button
                    ref={i === 0 ? first : undefined}
                    type="button"
                    className={`gs-option gs-ab gs-ab-use ${plays ? "gs-ab-play" : "gs-ab-discard"}${
                      o.payable ? "" : " gs-option-unpayable"
                    }`}
                    data-use={use.kind}
                    aria-label={`${use.title}${price ? ` ${price}` : ""}${use.line ? `. ${use.line}` : ""}${
                      o.payable ? "" : ", not enough mana right now"
                    }`}
                    disabled={busy}
                    onClick={() => onChoose(o.actionId)}
                  >
                    <span className="gs-ab-words">
                      <span className="gs-ab-said gs-ab-title">
                        <ManaText text={plays || !price ? use.title : `${use.title}: ${price}`} />
                        {plays && price && (
                          <span className="gs-ab-use-cost">
                            <ManaText text={price} />
                          </span>
                        )}
                      </span>
                      {use.line && (
                        <span className="gs-ab-line">
                          <ManaText text={use.line} />
                        </span>
                      )}
                      {!o.payable && <em className="gs-ab-why">Not enough mana right now</em>}
                    </span>
                  </button>
                </li>
              );
            }
            const parts = abilityParts(o.label ?? o.actionId, name);
            return (
              <li key={o.actionId}>
                <button
                  ref={i === 0 ? first : undefined}
                  type="button"
                  className={`gs-option gs-ab${o.payable ? "" : " gs-option-unpayable"}`}
                  aria-label={`${o.label ?? o.actionId}${o.payable ? "" : ", not enough mana right now"}`}
                  disabled={busy}
                  onClick={() => onChoose(o.actionId)}
                >
                  {cost(parts.cost, parts.kind)}
                  <span className="gs-ab-words">
                    {/* Amendment 13 (item 4) -- one paragraph, symbols inline. */}
                    <span className="gs-ab-said">
                      <ManaText text={parts.text} />
                    </span>
                    {!o.payable && <em className="gs-ab-why">Not enough mana right now</em>}
                  </span>
                </button>
              </li>
            );
          })}
          {notNow
            .filter((row) => !row.use)
            .map((row) => {
              const parts = abilityParts(row.label, name);
              return (
                <li
                  key={row.label}
                  className="gs-ab gs-ab-no"
                  aria-label={`${row.label}: ${row.why}`}
                >
                  {cost(parts.cost, parts.kind)}
                  <span className="gs-ab-words">
                    <span className="gs-ab-said">
                      <ManaText text={parts.text} />
                    </span>
                    <em className="gs-ab-why">{row.why}</em>
                  </span>
                </li>
              );
            })}
        </ul>
      )}
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

/**
 * Spec 0058, item 4 -- the note by a clicked card that has nothing to do
 * right now (it keeps its blue ring); it fades after about two seconds.
 */
export function NothingNote({ box, onDone }: { box: Box; onDone: () => void }) {
  return (
    <p
      className="gs-nothing-note"
      role="status"
      style={{ left: Math.max(box.x + box.w / 2, 140), top: box.y - 8 }}
      onAnimationEnd={onDone}
    >
      Nothing to do with this card right now
    </p>
  );
}

/** Spec 0057, item 5 -- the card's play first, then the rest in the game's order. */
export function playFirst(options: DecisionOption[]): DecisionOption[] {
  const plays = (o: DecisionOption) => o.use?.kind === "land" || o.use?.kind === "spell";
  return [...options.filter(plays), ...options.filter((o) => !plays(o))];
}

// --- looking at things --------------------------------------------------------------------

export function Inspect({
  card,
  name,
  costNow,
  artUrl,
  board,
  mySeat,
  onClose,
}: {
  card: SnapshotCard | null;
  name: string;
  /** What its cast costs right now, when Forge has said. */
  costNow: string | null;
  artUrl: (art: string) => string;
  board: Snapshot;
  /** -1 for a spectator: nobody's "yours". */
  mySeat: number;
  onClose: () => void;
}) {
  const close = useRef<HTMLButtonElement | null>(null);
  // Amendment 18 -- Space or Peek fades this window too.
  const peek = usePeek(true);
  useEffect(() => close.current?.focus({ preventScroll: true }), []);
  const hidden = card && card.faceDown && !card.known;
  return (
    <div className={`gs-backdrop${peek ? " gs-win-peek" : ""}`} onClick={onClose}>
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
          // The close-up copy (AMENDMENT 8): the table's copy is 384 px
          // wide, and this is drawn at up to 300 px times the screen's
          // scaling. The table's copy shows until it is whole (spec 0015).
          <SharpCard
            className="gs-inspect-art"
            low={artUrl(card.art)}
            high={closeUpOf(artUrl(card.art))}
            alt=""
          />
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
              {/* Spec 0058, item 2 -- why it costs what it does now. */}
              {card.costWhy && (
                <p className="gs-inspect-costwhy">
                  <ManaText text={card.costWhy} />
                </p>
              )}
              {card.power !== null && card.toughness !== null && (
                <p className="gs-inspect-pt">
                  {/* Phase 9 W-19: as printed, then as it is now. */}
                  {printedPt(card) && (
                    <s className="gs-inspect-printed" title="As printed">
                      {printedPt(card)}
                    </s>
                  )}
                  {card.power}/{card.toughness}
                  {card.damage > 0 && ` · ${card.damage} damage`}
                </p>
              )}
              {card.keywords.length > 0 && <p>{withSymbols(card.keywords.join(", "))}</p>}
              {/* Spec 0058, item 8 -- a mutated creature: the cards in it, top first. */}
              {card.merged && card.merged.length > 1 && (
                <>
                  <p className="gs-inspect-merged">
                    <b>Cards in this creature:</b>{" "}
                    {card.merged.map((p, i) => (i === 0 ? `${p.name} (top)` : p.name)).join(", ")}
                  </p>
                  <p className="gs-inspect-merged-note">
                    A mutated creature has every ability of its cards.
                  </p>
                </>
              )}
              <InspectFacts card={card} board={board} mySeat={mySeat} />
              {/* Spec 0045: each kind of counter, and where the last came from. */}
              {counterWords(card).map((words) => (
                <p key={words} className="gs-inspect-counter">
                  {words}
                </p>
              ))}
              <InspectChips card={card} />
            </>
          )}
          {/* Spec 0057, item 2 -- Peek and "or hold Space" left, Close right. */}
          <PeekFoot className="gs-inspect-foot">
            <button
              ref={close}
              type="button"
              className="pa-button pa-button-quiet"
              onClick={onClose}
            >
              Close
            </button>
          </PeekFoot>
        </div>
      </div>
    </div>
  );
}

/**
 * Phase 9 W-19 -- what has changed about it, and whose it is: what is
 * attached to it (and to what it is attached), and in exile, why it is
 * there and whether you may play it.
 */
function InspectFacts({
  card,
  board,
  mySeat,
}: {
  card: SnapshotCard;
  board: Snapshot;
  mySeat: number;
}) {
  const nameOf = (seat: number) => board.players.find((p) => p.seat === seat)?.name ?? "Their";
  const onTable = board.battlefield.some((c) => c.id === card.id);
  const attached = board.battlefield.filter((c) => c.attachedTo === card.id);
  const host = card.attachedTo ? cardOf(board, card.attachedTo) : null;
  const rows: [string, string][] = [];
  if (onTable) rows.push(["Whose", card.seat === mySeat ? "Yours" : `${nameOf(card.seat)}'s`]);
  if (attached.length > 0) rows.push(["Attached", attached.map((c) => c.name).join(", ")]);
  if (host) rows.push(["On", host.name]);
  if (card.exiledBy) rows.push(["Exiled by", card.exiledBy]);
  if (card.playable) rows.push(["You may", "play it from exile"]);
  if (rows.length === 0) return null;
  return (
    <dl className="gs-inspect-facts">
      {rows.map(([k, v]) => (
        <Fragment key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** Phase 9 W-19 -- its state now, as chips. */
function InspectChips({ card }: { card: SnapshotCard }) {
  const chips = [
    card.tapped && "Tapped",
    card.sick && "New this turn: can't attack yet",
    card.attacking && "Attacking",
    card.blocking && "Blocking",
    card.ringBearer && "Ring-bearer",
    card.sector && `Sector ${card.sector}`,
    card.sprocket && `On sprocket ${card.sprocket}`,
    card.token && "Token",
  ].filter((c): c is string => typeof c === "string");
  if (chips.length === 0) return null;
  return (
    <ul className="gs-inspect-chips">
      {chips.map((chip) => (
        <li key={chip}>{chip}</li>
      ))}
    </ul>
  );
}

/**
 * Spec 0045 -- a stack object, close up: the card it came from, large,
 * beside what it does, why it triggered, what it targets, whose it is,
 * its place in the order and how many copies of it wait together.
 */
export function StackInspect({
  board,
  id,
  mySeat,
  artUrl,
  onClose,
}: {
  board: Snapshot;
  id: string;
  mySeat: number | null;
  artUrl: (art: string) => string;
  onClose: () => void;
}) {
  const close = useRef<HTMLButtonElement | null>(null);
  // Amendment 18 -- Space or Peek fades this window too.
  const peek = usePeek(true);
  useEffect(() => close.current?.focus({ preventScroll: true }), []);
  const at = board.stack.findIndex((entry) => entry.id === id);
  const entry = board.stack[at]!;
  const source = entry.source ? cardOf(board, entry.source) : null;
  const art = source?.art && !(source.faceDown && !source.known) ? source.art : entry.art;
  let copies = 1;
  while (board.stack[at + copies] && sameTrigger(entry, board.stack[at + copies]!)) copies++;
  const whose =
    entry.controller === mySeat
      ? "Yours"
      : (board.players.find((p) => p.seat === entry.controller)?.name ?? "Theirs");
  const targets = entry.targets.map((t) =>
    "player" in t
      ? t.player === mySeat
        ? "you"
        : (board.players.find((p) => p.seat === t.player)?.name ?? "a player")
      : nameOf(board, t.object),
  );
  const kind =
    entry.kind === "trigger" ? "Triggered ability" : entry.kind === "ability" ? "Ability" : "Spell";
  return (
    <div className={`gs-backdrop${peek ? " gs-win-peek" : ""}`} onClick={onClose}>
      <div
        className="gs-inspect"
        role="dialog"
        aria-modal="true"
        aria-label={`${entry.name}, on the stack, close up`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        {art ? (
          <SharpCard
            className="gs-inspect-art"
            low={artUrl(art)}
            high={closeUpOf(artUrl(art))}
            alt=""
          />
        ) : (
          <div className="gs-inspect-art gs-inspect-noart">{entry.name}</div>
        )}
        <div className="gs-inspect-text">
          <h2 className="gs-inspect-name">
            {entry.name}
            {entry.manaCost && <ManaCost cost={entry.manaCost} />}
          </h2>
          <p className="gs-inspect-types">{kind}, on the stack</p>
          <dl className="gs-inspect-facts">
            {/* A spell's rules text is not in the snapshot: its words are
                its card's. A trigger's and an ability's are Forge's own. */}
            {entry.kind !== "spell" && (
              <>
                <dt>Does</dt>
                <dd>
                  <ManaText text={stackWords(entry.description, entry.name)} />
                </dd>
              </>
            )}
            {entry.why && (
              <>
                <dt>Why</dt>
                <dd>{entry.why}</dd>
              </>
            )}
            {targets.length > 0 && (
              <>
                <dt>{targets.length === 1 ? "Target" : "Targets"}</dt>
                <dd>{targets.join(", ")}</dd>
              </>
            )}
            <dt>Whose</dt>
            <dd>{whose}</dd>
            <dt>Order</dt>
            <dd>{at === 0 ? "Resolves next" : `Resolves ${ordinalWord(at + 1)}`}</dd>
            {copies > 1 && (
              <>
                <dt>Copies</dt>
                <dd>{copies} the same, resolving one after another</dd>
              </>
            )}
          </dl>
          {/* Spec 0057, item 2 -- Peek and "or hold Space" left, Close right. */}
          <PeekFoot className="gs-inspect-foot">
            <button
              ref={close}
              type="button"
              className="pa-button pa-button-quiet"
              onClick={onClose}
            >
              Close
            </button>
          </PeekFoot>
        </div>
      </div>
    </div>
  );
}

/** "2nd", "3rd", "11th". */
function ordinalWord(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/**
 * Phase 9 W-18 (owner 2026-11-02, option A) -- a graveyard or exile as the
 * card tray: the cards as pictures, newest first, copies as one "×N";
 * tabs for each player's graveyard and exile. In exile a card says why it
 * is there (what exiled it, a suspend's time counters) and whether you may
 * play it from there. A card opens its close-up, on top.
 */
export function ZoneViewer({
  board,
  seat,
  zone,
  mySeat,
  artUrl,
  onZone,
  onInspect,
  onClose,
  nameable = null,
  onName,
}: {
  board: Snapshot;
  seat: number;
  zone: ZoneName;
  /** W-12: while a card is being named, the cards here it may name, and naming one. */
  nameable?: ReadonlySet<string> | null;
  onName?: (id: string) => void;
  /** -1 for a spectator: every pile is somebody else's. */
  mySeat: number;
  artUrl: (art: string) => string;
  onZone: (view: { seat: number; zone: ZoneName }) => void;
  onInspect: (id: string) => void;
  onClose: () => void;
}) {
  const close = useRef<HTMLButtonElement | null>(null);
  // Amendment 18 -- Space or Peek fades this window too.
  const peek = usePeek(true);
  useEffect(() => close.current?.focus({ preventScroll: true }), []);
  const whose = (s: number) =>
    s === mySeat ? "Your" : `${board.players.find((p) => p.seat === s)?.name ?? "Their"}'s`;
  const pile = (s: number, z: ZoneName) =>
    (z === "graveyard" ? board.graveyard : z === "exile" ? board.exile : board.otherHands).filter(
      (c) => c.seat === s,
    );
  const cards = groupCopies(
    pile(seat, zone)
      .slice()
      // Newest first: Forge's timestamp is when it arrived where it is.
      .sort((a, b) => (b.enteredAt ?? 0) - (a.enteredAt ?? 0)),
  );
  const count = pile(seat, zone).length;
  const title =
    zone === "hand" ? `${whose(seat)} hand, as far as you may see it` : `${whose(seat)} ${zone}`;
  // Your piles first, then theirs; a hand only when it is the one open.
  const seats = [...board.players]
    .sort((a, b) => Number(b.seat === mySeat) - Number(a.seat === mySeat))
    .map((p) => p.seat);
  const tabs = seats.flatMap((s) =>
    (["graveyard", "exile"] as ZoneName[]).map((z) => ({ seat: s, zone: z })),
  );
  if (zone === "hand") tabs.push({ seat, zone });
  return (
    <div className={`gs-backdrop${peek ? " gs-win-peek" : ""}`} onClick={onClose}>
      <div
        className="gs-viewer gs-ztray"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <div className="gs-ztray-head">
          <h2 className="gs-viewer-title">{title}</h2>
          <span className="gs-ztray-count">
            {count === 0 ? "empty" : `${count} card${count === 1 ? "" : "s"} · newest first`}
          </span>
          <button
            ref={close}
            type="button"
            className="gs-ztray-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="gs-ztray-tabs" role="tablist">
          {tabs.map((t) => {
            const on = t.seat === seat && t.zone === zone;
            const n = pile(t.seat, t.zone).length;
            return (
              <button
                key={`${t.seat}:${t.zone}`}
                type="button"
                role="tab"
                aria-selected={on}
                className={`gs-ztray-tab${on ? " gs-ztray-tab-on" : ""}`}
                onClick={() => onZone(t)}
              >
                {t.zone === "hand" ? "Hand" : `${whose(t.seat)} ${t.zone}`} · {n}
              </button>
            );
          })}
        </div>
        {cards.length === 0 && <p className="gs-viewer-empty">Nothing here.</p>}
        <ul className={`gs-ztray-cards${zone === "hand" ? " board-other-hand" : ""}`}>
          {cards.map(({ card, copies }) => {
            const notes = zoneNotes(card, zone);
            return (
              <li key={card.id}>
                <button
                  type="button"
                  className={`gs-viewer-card gs-ztray-card${nameable?.has(card.id) ? " gs-nameable" : ""}`}
                  aria-label={[
                    `${card.name}${copies > 1 ? ` ×${copies}` : ""}`,
                    card.types,
                    ...notes,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  onClick={() =>
                    nameable?.has(card.id) && onName ? onName(card.id) : onInspect(card.id)
                  }
                >
                  {card.art && !(card.faceDown && !card.known) ? (
                    <img src={artUrl(card.art)} alt="" draggable={false} />
                  ) : (
                    <span className="gs-ztray-plain">
                      <b>{card.faceDown && !card.known ? "Face down" : card.name}</b>
                      <span>{card.types}</span>
                    </span>
                  )}
                  {copies > 1 && <span className="gs-ztray-many">×{copies}</span>}
                </button>
                {notes.length > 0 && <span className="gs-ztray-note">{notes.join(" · ")}</span>}
              </li>
            );
          })}
        </ul>
        {/* Spec 0057, item 2 -- Peek and "or hold Space", clear of the close. */}
        <PeekFoot className="gs-ztray-foot" />
      </div>
    </div>
  );
}

/**
 * What Forge told this player, briefly (§7.57). A missed one costs nothing.
 * Spec 0050 (Phase 9 W-22): grey cards top right of the table, clicks going
 * through them; four at most, each gone after 7 s.
 */
function useGameMessages(board: Snapshot | null): Notice[] {
  const [shown, setShown] = useState<{ key: string; text: string }[]>([]);
  const seen = useRef(0);
  const seenTotal = useRef<number | null>(null);
  useEffect(() => {
    if (!board) return;
    const fresh = newNotices(board, seen.current, seenTotal.current);
    seen.current = board.notices.length;
    seenTotal.current = board.noticesTotal ?? null;
    if (fresh.length === 0) return;
    // Spec 0045 -- a reveal's line ("Looking at your library: A, B") is the
    // reveal tray's cards already.
    const inTray = board.reveal ? `: ${board.reveal.cards.map((c) => c.name).join(", ")}` : null;
    // Phase 9 Amendment 12 -- a report says who did what; Forge's own
    // "Looking at ..." line beside it said it worse (and sometimes wrong).
    const reported = !!board.action;
    const added = fresh
      .filter((text) => !(inTray && text.endsWith(inTray)))
      .filter((text) => !(reported && text.startsWith("Looking at ")))
      .map((text, i) => ({ key: `said-${board.stateRevision}:${i}`, text }));
    setShown((list) => [...list, ...added].slice(-4));
  }, [board]);
  return shown.map((said) => {
    const { title, line } = noticeParts(said.text);
    return {
      key: said.key,
      tone: "grey",
      label: "Game",
      // The game's own words, exactly as it says them.
      title,
      titleNode: <ManaText text={title} />,
      ...(line ? { line } : {}),
      actions: [],
      quiet: true,
      fadeMs: GAME_MESSAGE_MS,
      close: () => setShown((list) => list.filter((n) => n.key !== said.key)),
    };
  });
}

// --- the game menu and the chat drawer ------------------------------------------------------

function GameMenu({
  match,
  report,
  live,
  choices,
  listOpen,
  onList,
  concession,
  onConcede,
}: {
  match: MatchView;
  /** Spec 0039 — what a report from here knows about the game. */
  report: ReportGame | undefined;
  live: boolean;
  /** How many options the question on screen has, or null for none. */
  choices: number | null;
  listOpen: boolean;
  onList: () => void;
  /** Where a concession stands, in words (§7.55). */
  concession: string | null;
  onConcede: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
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
  const choose = (what: "concede" | "abandon") => {
    setMenuOpen(false);
    setConfirming(what);
  };
  return (
    <div className="gs-dock" ref={dock}>
      {/* Above the icons, opening upwards: the menu, the panels it opens,
          and what became of a concession or an abandon. */}
      <div className="gs-dock-pop">
        {live && menuOpen && (
          <div className="gs-dock-menu" role="group" aria-label="Game menu">
            {/* Spec 0013 — each option says what it does. */}
            <button type="button" className="gs-dock-item" onClick={() => choose("concede")}>
              <span className="gs-dock-item-name">Concede</span>
              <span className="gs-dock-item-what">End the game now; your opponent wins.</span>
            </button>
            <button
              type="button"
              className="gs-dock-item gs-dock-item-warn"
              onClick={() => choose("abandon")}
            >
              <span className="gs-dock-item-name">Abandon match</span>
              <span className="gs-dock-item-what">
                For a stuck game: it ends for both of you with no winner.
              </span>
            </button>
          </div>
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
            title="Concede, Abandon match"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <GearIcon />
          </button>
        )}
        {/* Spec 0039 — a problem or an idea, beside the gear. */}
        <ReportButton place="game" {...(report ? { game: report } : {})} />
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

// --- spectating (spec 0067) -----------------------------------------------------------

/** What the one loading screen says while a spectator's game comes (WatchPage too). */
export const SPECTATE_LOADING_WORDS = "Finding the game…";

/** How long the table and the plates take to turn round (Switch sides): fade out, turn, fade in. */
const SWITCH_SIDES_MS = 700;

/** Spec 0067, item 1 -- the shield's short red shake as a blow lands (the canvas's A). */
const LIFE_HIT_MS = 320;
const LIFE_HIT_FRAMES: Keyframe[] = [
  { transform: "translateX(0)", filter: "drop-shadow(0 0 8px rgb(255 60 40 / 100%))" },
  { transform: "translateX(3px)", offset: 0.17 },
  { transform: "translateX(-2.5px)", offset: 0.33 },
  { transform: "translateX(2px)", offset: 0.5 },
  { transform: "translateX(-1px)", offset: 0.67 },
  { transform: "translateX(0)", filter: "drop-shadow(0 0 0 rgb(255 60 40 / 0%))" },
];

/** Spec 0067, item 8 (A) -- three characters ("-12", "100"): the shield's number shrinks to fit. */
export function lifeIsLong(life: number): boolean {
  return String(life).length >= 3;
}

/**
 * Spec 0067 (checklist 7) -- the public view from the other player's side:
 * the same board, drawn with the other seat at the bottom. Nothing is
 * added or uncovered (a spectator is only ever sent public cards).
 */
export function turnedRound(board: Snapshot | null, flip: boolean): Snapshot | null {
  if (!board || !flip || !board.spectator) return board;
  const other = board.players.find((p) => p.seat !== board.seat);
  return other ? { ...board, seat: other.seat } : board;
}

const EYE = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

/** Spec 0067 (item 10, B) -- top left: "Spectating Alice vs Bob · Stop". */
function SpectatingChip({ names, onStop }: { names: string[]; onStop: () => void }) {
  return (
    <span className="gs-spectating" data-testid="spectating-chip">
      <span className="gs-spectating-eye">{EYE}</span>
      <span>
        Spectating <b>{names.join(" vs ")}</b>
      </span>
      <button
        type="button"
        className="gs-spectating-stop"
        onClick={onStop}
        aria-label="Stop spectating"
      >
        Stop
      </button>
    </span>
  );
}

/** Spec 0067 (checklist 7) -- bottom left: which side you look from, and the switch. */
function SwitchSides({ from, onSwitch }: { from: string; onSwitch: () => void }) {
  return (
    <span className="gs-spectating gs-switch-sides">
      <span>
        From <b>{from}</b>’s side
      </span>
      <button type="button" className="gs-switch-sides-button" onClick={onSwitch}>
        Switch sides
      </button>
    </span>
  );
}

/**
 * Spec 0067 (item 9, B) -- the game is over, for a spectator: one slim card
 * over the final board -- who won and why, Back to the lobby, and Spectate
 * another game when one is running.
 */
function SpectatorOver({
  over,
  onLeave,
  onAnother,
}: {
  over: GameOver;
  onLeave: () => void;
  onAnother: (() => void) | null;
}) {
  return (
    <div
      className="gs-spectator-over"
      role="dialog"
      aria-modal="false"
      aria-labelledby="gs-spectator-over-title"
      data-testid="spectator-over"
    >
      <h2 id="gs-spectator-over-title" className="gs-spectator-over-title">
        {over.word}
      </h2>
      <p className="gs-spectator-over-why">{[over.sub, over.turn].filter(Boolean).join(" · ")}</p>
      <div className="gs-spectator-over-buttons">
        <button type="button" className="pa-button pa-button-brass" onClick={onLeave}>
          Back to the lobby
        </button>
        {onAnother && (
          <button
            type="button"
            className="pa-button pa-button-quiet gs-spectate-another"
            onClick={onAnother}
          >
            {EYE}
            Spectate another game
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Spec 0072 -- where the other player's spell was cast from, on the table:
 * the back that left their fan (as it was drawn), a card of theirs you were
 * shown, their hand's place (a spectator's bottom player, whose hand is not
 * drawn), or their pile's tile.
 */
function placeOf(
  origin: CastOrigin,
  fan: { hidden: readonly Box[]; shown: ReadonlyMap<string, Box> },
  g: Geometry,
): TheirGlide {
  const where = anchors(g);
  if (origin.zone === "hand") {
    if (origin.side === "opponent") {
      const box =
        (origin.shown ? fan.shown.get(origin.shown) : undefined) ??
        (origin.back !== null ? fan.hidden[origin.back] : undefined);
      if (box) return { box, origin: OPPONENT_HAND_ORIGIN };
    }
    const at = where[`${origin.side}:hand`];
    return {
      box: {
        x: at.x - g.cardW / 2,
        y: at.y - g.cardH / 2,
        w: g.cardW,
        h: g.cardH,
        scale: 1,
        rotation: 0,
        z: 0,
      },
      origin: { x: 0.5, y: 0.5 },
    };
  }
  return { box: boxAt(where[`${origin.side}:${origin.zone}`], g), origin: { x: 0.5, y: 0.5 } };
}
