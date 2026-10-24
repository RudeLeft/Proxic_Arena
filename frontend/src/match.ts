// The match, as DATA — PHASE_06 §6.99–§6.104, §6.110–§6.113.
//
// UI-free, like lobby.ts and decks.ts, and for the same reason:
// everything that could be WRONG about a match in a browser lives
// here, and none of it should need a browser to test.
//
// ONE RULE runs through the whole file, inherited from §5.132 and
// sharpened by §6.39: FORGE OWNS THE GAME. This module never
// decides whether an action is legal, never removes an option it
// thinks has become invalid, never guesses what a choice will do
// and never answers on the player's behalf. It renders the
// question the server sent and sends back the answer the player
// picked. A client that filtered its own options would be a
// second rules engine (§6.50), and a second rules engine is a
// disagreement waiting to happen.
//
// The other rule, §6.100: the browser's own idea of who it is
// carries no authority. Nothing sent from here names a seat, a
// user or a state version — only which decision, and which
// action. Everything else is the server's to know.

/** §6.49 — a presentation hint, never authority. */
export interface DecisionOption {
  actionId: string;
  label: string | null;
  /**
   * PHASE_07 §7.61 B5 — what the option is about: "card:N", "stack:N"
   * or "player:SEAT", so the board can be clicked to answer. The page
   * never parses an actionId to find this out. Several options may
   * share an object (a card's abilities, §7.29).
   */
  objectId: string | null;
  /**
   * §7.61 B8 — false when Forge's own payment check says this cannot
   * be paid right now. Shown dimmed, still choosable (§7.54): Forge
   * has the last word. Absent from the frame means payable.
   */
  payable: boolean;
  /** What a spell costs right now, Forge's reckoning ("{R}"); null otherwise. */
  cost: string | null;
}

/** A target, as the server names it: an object id, or a player's seat. */
export type TargetRef = { object: string } | { player: number };

export interface Decision {
  decisionId: number;
  /**
   * The seat the decision is ABOUT.
   *
   * Usually your own. Under a control effect it is somebody
   * else's, and you need to be told, because "choose an attacker"
   * means something different when the creatures are not yours.
   *
   * There is no `authorisedSeat` here on purpose: that is the
   * server's conclusion, and this frame only ever reaches the
   * player it authorised (§6.38).
   */
  actedForSeat: number;
  kind: string;
  stateVersion: number;
  options: DecisionOption[];
  /**
   * Some decisions have no "no".
   *
   * Discarding to hand size is the plain case: the rules say
   * discard, so only WHICH is open. The page must not offer a
   * Pass the server will refuse -- a button that always fails is
   * worse than no button.
   */
  mandatory: boolean;
  /**
   * Forge's own wording for the question, when it has any.
   *
   * A generic chooser is unanswerable without it — a list of
   * creature names with no question attached could be "choose
   * one to sacrifice" or "choose one to save".
   */
  prompt: string | null;
  /**
   * P6-AG — answered by SEARCHING, not by choosing from a list.
   *
   * Naming any card allows ~30,000 names. The question arrives
   * with `optionCount` and no options; the page sends what the
   * player types and is sent what matched (`results`). Only a name
   * the server has sent can be the answer.
   */
  searchable: boolean;
  optionCount: number;
  results: SearchResults | null;
  /**
   * PHASE_07 B7 (owner 2026-10-21) — why each of your cards that is not
   * offered cannot act now, by object id ("card:N"): "Came in this turn
   * — it can't attack yet." Shown when such a card is clicked.
   */
  unavailable: Record<string, string>;
  /**
   * Owner 2026-10-22 — what a question you can back out of is about (the
   * spell being cast, the ability being paid for), so Cancel says what it
   * undoes. Null when the server says nothing.
   */
  about: DecisionAbout | null;
  /**
   * Spec 0001 D3 (owner 2026-10-22) — the cards this question shows you
   * alone (a scry's or a surveil's top cards), as pictures, described as
   * a snapshot describes a card. Empty for every other question.
   */
  looking: SnapshotCard[];
}

/** The spell or ability a question is about. */
export interface DecisionAbout {
  name: string;
  /** "spell" | "ability" | "trigger" | "card" */
  kind: string;
  /** For a spell: the zone it is cast from ("hand", "graveyard", …). */
  from: string | null;
}

/** What one search matched: the best few, and how many there were. */
export interface SearchResults {
  query: string;
  options: DecisionOption[];
  total: number;
}

/**
 * One card, as this viewer is allowed to see it — §6.42, §6.46.
 *
 * `known` false means the SERVER did not send an identity, not
 * that the page is hiding one. There is nothing here to reveal:
 * hidden information is removed before serialisation, so a
 * developer console shows the same "Face-down" this does.
 */
export interface SnapshotCounter {
  name: string;
  count: number;
}

export interface SnapshotCard {
  /** Typed (`card:51`), and the SAME id a decision uses (§6.47). */
  id: string;
  /**
   * §6.123 — a server-issued reference to this card's artwork, or
   * absent.
   *
   * Absent is ordinary and means one of three different things,
   * none of which the page has to tell apart: the card is hidden
   * from this viewer (§6.124, and then there is no name either),
   * the deck was imported without art for it, or it is a token
   * (§6.128 — a token is in nobody's deck package).
   *
   * It is a content hash, not a path. The page does not build it
   * and cannot guess another one.
   */
  art: string | null;
  seat: number;
  name: string;
  tapped: boolean;
  faceDown: boolean;
  known: boolean;
  /**
   * How to draw it: "creature", "land", "other", or "unknown"
   * when the viewer may not identify it.
   *
   * Forge's type line decided this, not the name. The old
   * project's client worked out land-ness from basic-land names
   * and put every nonbasic land in the wrong row.
   */
  kind: string;
  types: string;
  /** Creatures only; absent on everything else. */
  power: number | null;
  toughness: number | null;
  /** The printed mana cost of the face that is up ("{1}{R}"); null for a land or unknown. */
  manaCost: string | null;
  damage: number;
  sick: boolean;
  attacking: boolean;
  blocking: boolean;
  counters: SnapshotCounter[];
  /**
   * §6.85 — the keywords it has NOW, as Forge reports them after every
   * continuous effect. Not the printed text: under Humility a Serra
   * Angel has none, and the page must not say it flies.
   */
  keywords: string[];
  /** The card this is attached to, for auras and equipment. */
  attachedTo: string | null;
  /** The Ring-bearer (the Ring's abilities are its alone). Public. */
  ringBearer: boolean;
  /** Un-sets (public): a creature's sector (Alpha, Beta, Gamma), else null. */
  sector: string | null;
  /** Un-sets (public): the sprocket a Contraption is on (1-3), else null. */
  sprocket: number | null;
  /** §7.61 B11 — Forge's game timestamp: arrival order in a row. */
  enteredAt: number | null;
  /** §7.61 B12 — a token (they pile when identical). */
  token: boolean;
}

export interface SnapshotPlayer {
  seat: number;
  name: string;
  life: number;
  /** Counts, because a hand's SIZE is public and its contents are not. */
  handCount: number;
  libraryCount: number;
  graveyardCount: number;
  /**
   * §6.96 — Forge's state on the player, carried generically: every
   * counter (poison, energy, experience...), every designation
   * (monarch, initiative, the city's blessing), and what is in the
   * command zone (a dungeon, an emblem, the Ring). Shown as sent.
   */
  counters: SnapshotCounter[];
  designations: string[];
  command: string[];
  /** How many times the Ring has tempted this player; 0 for never. */
  ringTempted: number;
  /** Dungeons this player has completed, one entry each time. */
  dungeonsCompleted: string[];
  /** §7.61 B6 — floating mana by colour ({"R": 1}); empty when there is none. Public. */
  manaPool: Record<string, number>;
}

/** One object on the stack — §7.61 B2, B3. */
export interface StackEntry {
  /** "stack:N", the snapshot's own id, which a counterspell's option names. */
  id: string;
  description: string;
  /** The card it came from, "card:N"; null when unknown. */
  source: string | null;
  /** As this viewer may know it ("Face-down" for a face-down spell). */
  name: string;
  controller: number | null;
  /** "spell" | "ability" | "trigger" */
  kind: string;
  targets: TargetRef[];
  /** Its picture, from the caster's deck, when this viewer may see it. */
  art: string | null;
  /** A spell's printed mana cost ("{1}{R}"), when this viewer may know it. */
  manaCost: string | null;
}

/** Combat, while there is one — §7.61 B4. Forge's record. */
export interface CombatState {
  attackers: { id: string; target: TargetRef }[];
  blocks: { blocker: string; attacker: string }[];
}

/** One wave of damage — §7.61 B13. A new key is a new wave. */
export interface DamageState {
  key: string;
  hits: { source: string; target: TargetRef; amount: number }[];
}

/** §6.40 — the board as one seat may see it. */
export interface Snapshot {
  stateRevision: number;
  /**
   * §6.70 — which Forge game of the match this board is from.
   *
   * 1 for an ordinary match. Karn Liberated restarts the game inside
   * the same match, and the board after it is a different game, not
   * a rearranged one: the turn starts again from 1.
   */
  gameEpoch: number;
  /** §6.96 — "day" or "night" once a daybound card has made it one; null before. */
  dayTime: string | null;
  turn: number;
  phase: string;
  activeSeat: number;
  /** §7.61 B1 — who holds priority now; not always the active seat. Null if not sent. */
  prioritySeat: number | null;
  seat: number;
  players: SnapshotPlayer[];
  /**
   * What Forge TOLD this viewer, oldest first — P6-AM.
   *
   * A coin flip and a die roll are the engine's to make, so the
   * only thing owed is that the player sees the outcome. Private
   * to the seat it was sent to: "you looked at X" is a notice for
   * exactly one person.
   */
  notices: string[];
  battlefield: SnapshotCard[];
  hand: SnapshotCard[];
  /**
   * §6.37, §6.38 — other players' hand cards that FORGE says this
   * viewer may see: under Mindslaver, the controlled player's hand;
   * with Telepathy, an opponent's. Never a hidden card, not even as
   * a blank: the page has nothing to hide.
   */
  otherHands: SnapshotCard[];
  graveyard: SnapshotCard[];
  /**
   * Every player's exile, as this viewer may know it (public; a
   * face-down exiled card stays "Face-down"). Owner 2026-10-21: counted
   * beside each graveyard, and opened the same way.
   */
  exile: SnapshotCard[];
  /** The stack, as Forge orders it (the top, which resolves next, first). */
  stack: StackEntry[];
  /** §7.61 B4 — null outside combat. */
  combat: CombatState | null;
  /** §7.61 B13 — the newest damage wave, or null. */
  damage: DamageState | null;
}

/** "reconnecting": dropped and being retried on its own; "closed": refused, reload. */
export type MatchConnection = "connecting" | "open" | "reconnecting" | "closed";

export interface MatchState {
  connection: MatchConnection;
  /** Your own seat, as the server greeted you (§6.110). */
  seat: number | null;
  /** What Forge is waiting for, or null when it is not waiting on you. */
  decision: Decision | null;
  /**
   * An answer that has been sent and not yet resolved.
   *
   * Held so the buttons can be disabled without removing the
   * question: §6.112 says a decision stays pending until it is
   * answered, and a page that cleared it optimistically would
   * show an empty game if the gate refused.
   */
  awaiting: number | null;
  notice: string | null;
  /** The board, or null before the first snapshot arrives. */
  board: Snapshot | null;
  /**
   * Owner 2026-10-22 — the last board that brought something the OTHER
   * player put on the stack. Kept here, not left to the screen, because
   * when nobody could answer it the next board arrives milliseconds
   * later and the page would never draw this one; the screen shows it
   * for a moment.
   */
  spotlight: Snapshot | null;
  /**
   * PHASE_07 §7.55 — a concession: "SENT" once the server has passed
   * it to Forge (the game's end follows), or why it was not taken.
   */
  concession: string | null;
  /**
   * Spec 0002 — who the server says is being asked: `{ seat: null }`
   * when nobody is and the rules engine is working; null before it has
   * said (an older server never does, and the screen then guesses from
   * priority as it used to).
   */
  asking: { seat: number | null } | null;
}

export const EMPTY_MATCH: MatchState = {
  connection: "connecting",
  seat: null,
  decision: null,
  awaiting: null,
  notice: null,
  board: null,
  spotlight: null,
  concession: null,
  asking: null,
};

/**
 * Apply one server message.
 *
 * Unknown types return the state unchanged. A newer server that
 * invents a message must not blank an older client's game.
 */
export function reduceMatch(state: MatchState, message: Record<string, unknown>): MatchState {
  const type = typeof message["type"] === "string" ? message["type"] : "";

  switch (type) {
    case "MATCH_HELLO": {
      const seat = asNumber(message["seat"]);
      if (seat === null) return state;
      return { ...state, connection: "open", seat };
    }

    case "MATCH_SNAPSHOT": {
      const board = asSnapshot(message["state"]);
      if (!board) return state;
      // §6.41 — the revision is monotonic, so an older snapshot
      // arriving late must not overwrite a newer one. Frames are
      // ordered on one socket, but a reconnect sends the stored
      // snapshot while the live one may already be in flight.
      if (state.board && board.stateRevision < state.board.stateRevision) return state;
      const before = new Set((state.board?.stack ?? []).map((entry) => entry.id));
      const fresh = board.stack.some(
        (entry) =>
          entry.controller !== null && entry.controller !== board.seat && !before.has(entry.id),
      );
      return { ...state, board, spotlight: fresh ? board : state.spotlight };
    }

    case "MATCH_STEP": {
      // PHASE_07 AMENDMENT 13 — the game passed through a step nobody is
      // asked at: the step bar moves; the cards stay as the last board
      // has them (the next board comes with the next question).
      const step = message["state"];
      if (!state.board || typeof step !== "object" || step === null) return state;
      const row = step as Record<string, unknown>;
      const epoch = asNumber(row["gameEpoch"]);
      if (epoch !== null && epoch !== state.board.gameEpoch) return state;
      const phase = asString(row["phase"]);
      return {
        ...state,
        board: {
          ...state.board,
          turn: asNumber(row["turn"]) ?? state.board.turn,
          phase: phase ?? state.board.phase,
          activeSeat: asNumber(row["activeSeat"]) ?? state.board.activeSeat,
          prioritySeat: asNumber(row["prioritySeat"]) ?? state.board.prioritySeat,
        },
      };
    }

    case "DECISION_REQUEST": {
      const decision = asDecision(message);
      if (!decision) return state;
      // A new question clears any answer still in flight: the
      // server only asks once the previous one was taken.
      return { ...state, decision, awaiting: null, notice: null };
    }

    case "DECISION_ACCEPTED": {
      const decisionId = asNumber(message["decisionId"]);
      // Only the one we are waiting on. A receipt for an older
      // decision must not clear the question we are now being
      // asked — the server and Forge write those two from
      // different threads, so they can arrive in either order.
      if (decisionId === null || state.decision?.decisionId !== decisionId) return state;
      return { ...state, decision: null, awaiting: null };
    }

    case "DECISION_CLEARED": {
      // Priority moved to somebody else. Only one player holds it
      // at a time, so a prompt left on screen here is a prompt for
      // a question that no longer exists -- which is what the
      // first build did, and it made the game look broken.
      //
      // The notice goes too: whatever it said was about the
      // question being removed.
      return { ...state, decision: null, awaiting: null, notice: null };
    }

    case "MATCH_ASKING": {
      // Spec 0002 — a seat, or null for nobody; anything else is ignored.
      const seat = message["seat"];
      if (seat === null) return { ...state, asking: { seat: null } };
      const asked = asNumber(seat);
      return asked === null ? state : { ...state, asking: { seat: asked } };
    }

    case "DECISION_OPTIONS": {
      const decisionId = asNumber(message["decisionId"]);
      const decision = state.decision;
      // Only for the question on screen: results for one that has
      // gone must not appear under the next.
      if (decisionId === null || decision?.decisionId !== decisionId) return state;
      const results: SearchResults = {
        query: asString(message["query"]) ?? "",
        options: asOptions(message["options"]),
        total: asNumber(message["total"]) ?? 0,
      };
      return { ...state, decision: { ...decision, results } };
    }

    case "DECISION_SEARCH_REFUSED": {
      const decisionId = asNumber(message["decisionId"]);
      if (decisionId === null || state.decision?.decisionId !== decisionId) return state;
      return { ...state, notice: refusalText(asString(message["reason"])) };
    }

    case "CONCEDE_ACCEPTED":
      return { ...state, concession: "SENT" };

    case "CONCEDE_REFUSED":
      return { ...state, concession: asString(message["reason"]) ?? "REFUSED" };

    case "DECISION_REFUSED": {
      const decisionId = asNumber(message["decisionId"]);
      if (decisionId === null) return state;
      // The question STAYS. A refusal means the answer did not
      // take, not that the game moved on — and if it did move on,
      // the next DECISION_REQUEST is what says so.
      return {
        ...state,
        awaiting: null,
        notice: refusalText(asString(message["reason"])),
      };
    }

    default:
      return state;
  }
}

/** §7.55 — where a concession stands, in words; null when there is none. */
export function concessionText(concession: string | null): string | null {
  switch (concession) {
    case null:
      return null;
    case "SENT":
      return "You conceded. Ending the game…";
    case "NOT_STARTED":
      return "You can concede once the game has begun. Before that, Abandon ends it with no winner.";
    case "GAME_OVER":
      return "The game is already over.";
    case "NOT_A_PLAYER":
      return "Only a player in this game can concede.";
    case "UNREACHABLE":
      return "The game did not receive that. It may have stopped.";
    default:
      return "That concession was not accepted.";
  }
}

/** §6.104 and friends, in words a player can act on. */
function refusalText(reason: string | null): string {
  switch (reason) {
    case "STALE_STATE":
    case "STALE_DECISION":
      return "The game moved on before that arrived. Have another look.";
    case "DUPLICATE":
      return "That was already answered.";
    case "NOT_PENDING":
      return "There was nothing waiting for an answer.";
    case "WRONG_SEAT":
    case "NOT_YOURS":
      return "That decision is not yours to make.";
    case "PASS_NOT_ALLOWED":
      return "This one cannot be skipped — the rules require a choice.";
    case "UNREACHABLE":
      return "The game did not receive that. It may have stopped.";
    case "NOT_SEARCHABLE":
      return "That question is answered from the list, not by searching.";
    default:
      return "That answer was not accepted.";
  }
}

function asNotices(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function asSnapshot(value: unknown): Snapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const revision = asNumber(row["stateRevision"]);
  const seat = asNumber(row["seat"]);
  if (revision === null || seat === null) return null;
  return {
    stateRevision: revision,
    seat,
    // Absent means the first game: an older worker never restarts.
    gameEpoch: asNumber(row["gameEpoch"]) ?? 1,
    dayTime: asString(row["dayTime"]),
    turn: asNumber(row["turn"]) ?? 0,
    phase: asString(row["phase"]) ?? "",
    activeSeat: asNumber(row["activeSeat"]) ?? 0,
    prioritySeat: asNumber(row["prioritySeat"]),
    players: asPlayers(row["players"]),
    notices: asNotices(row["notices"]),
    battlefield: asCards(row["battlefield"]),
    hand: asCards(row["hand"]),
    otherHands: asCards(row["otherHands"]),
    graveyard: asCards(row["graveyard"]),
    exile: asCards(row["exile"]),
    stack: asStack(row["stack"]),
    combat: asCombat(row["combat"]),
    damage: asDamage(row["damage"]),
  };
}

function asPlayers(value: unknown): SnapshotPlayer[] {
  if (!Array.isArray(value)) return [];
  const players: SnapshotPlayer[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const seat = asNumber(row["seat"]);
    if (seat === null) continue;
    players.push({
      seat,
      name: asString(row["name"]) ?? `Seat ${seat}`,
      life: asNumber(row["life"]) ?? 0,
      handCount: asNumber(row["handCount"]) ?? 0,
      libraryCount: asNumber(row["libraryCount"]) ?? 0,
      graveyardCount: asNumber(row["graveyardCount"]) ?? 0,
      counters: asCounters(row["counters"]),
      designations: asNotices(row["designations"]),
      command: asNotices(row["command"]),
      ringTempted: asNumber(row["ringTempted"]) ?? 0,
      dungeonsCompleted: asNotices(row["dungeonsCompleted"]),
      manaPool: asManaPool(row["manaPool"]),
    });
  }
  return players;
}

/** A 64-character content hash, or nothing. */
function asHash(value: unknown): string | null {
  const text = asString(value);
  return text && /^[0-9a-f]{64}$/.test(text) ? text : null;
}

function asCards(value: unknown): SnapshotCard[] {
  if (!Array.isArray(value)) return [];
  const cards: SnapshotCard[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const id = asString(row["id"]);
    const seat = asNumber(row["seat"]);
    if (!id || seat === null) continue;
    cards.push({
      id,
      seat,
      name: asString(row["name"]) ?? "Face-down",
      tapped: row["tapped"] === true,
      faceDown: row["faceDown"] === true,
      // Only an explicit true counts. Anything else is treated
      // as "not identified", which errs toward showing less.
      known: row["known"] === true,
      kind: asString(row["kind"]) ?? "unknown",
      types: asString(row["types"]) ?? "",
      manaCost: asString(row["manaCost"]),
      power: asNumber(row["power"]),
      toughness: asNumber(row["toughness"]),
      damage: asNumber(row["damage"]) ?? 0,
      sick: row["sick"] === true,
      attacking: row["attacking"] === true,
      blocking: row["blocking"] === true,
      counters: asCounters(row["counters"]),
      keywords: asNotices(row["keywords"]),
      attachedTo: asString(row["attachedTo"]),
      ringBearer: row["ringBearer"] === true,
      sector: asString(row["sector"]),
      sprocket: typeof row["sprocket"] === "number" ? row["sprocket"] : null,
      // §6.123 — a content hash or nothing.
      //
      // Validated to the same shape the server validates, so a
      // value that is not one cannot become part of a request
      // URL. This parser copies named fields rather than
      // spreading the row, which is the right discipline and is
      // also why artwork did not appear the first time: the
      // server was sending `art` and this dropped it.
      art: asHash(row["art"]),
      enteredAt: asNumber(row["enteredAt"]),
      token: row["token"] === true,
    });
  }
  return cards;
}

function asManaPool(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const pool: Record<string, number> = {};
  for (const [colour, amount] of Object.entries(value as Record<string, unknown>)) {
    const n = asNumber(amount);
    if (n !== null && n > 0 && /^[WUBRGC]$/.test(colour)) pool[colour] = n;
  }
  return pool;
}

/** A target as the server writes it, or null. Never parsed out of a label. */
function asTarget(value: unknown): TargetRef | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const object = asString(row["object"]);
  if (object) return { object };
  const player = asNumber(row["player"]);
  return player === null ? null : { player };
}

function asCombat(value: unknown): CombatState | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const attackers: CombatState["attackers"] = [];
  for (const entry of Array.isArray(row["attackers"]) ? (row["attackers"] as unknown[]) : []) {
    if (typeof entry !== "object" || entry === null) continue;
    const a = entry as Record<string, unknown>;
    const id = asString(a["id"]);
    const target = asTarget(a["target"]);
    if (id && target) attackers.push({ id, target });
  }
  const blocks: CombatState["blocks"] = [];
  for (const entry of Array.isArray(row["blocks"]) ? (row["blocks"] as unknown[]) : []) {
    if (typeof entry !== "object" || entry === null) continue;
    const b = entry as Record<string, unknown>;
    const blocker = asString(b["blocker"]);
    const attacker = asString(b["attacker"]);
    if (blocker && attacker) blocks.push({ blocker, attacker });
  }
  return { attackers, blocks };
}

function asDamage(value: unknown): DamageState | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const key = asString(row["key"]);
  if (!key) return null;
  const hits: DamageState["hits"] = [];
  for (const entry of Array.isArray(row["hits"]) ? (row["hits"] as unknown[]) : []) {
    if (typeof entry !== "object" || entry === null) continue;
    const h = entry as Record<string, unknown>;
    const source = asString(h["source"]);
    const target = asTarget(h["target"]);
    const amount = asNumber(h["amount"]);
    if (source && target && amount !== null) hits.push({ source, target, amount });
  }
  return { key, hits };
}

function asCounters(value: unknown): SnapshotCounter[] {
  if (!Array.isArray(value)) return [];
  const counters: SnapshotCounter[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const name = asString(row["name"]);
    const count = asNumber(row["count"]);
    if (!name || count === null) continue;
    counters.push({ name, count });
  }
  return counters;
}

function asStack(value: unknown): StackEntry[] {
  if (!Array.isArray(value)) return [];
  const items: StackEntry[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const id = asString(row["id"]);
    if (!id) continue;
    const description = asString(row["description"]) ?? "";
    items.push({
      id,
      description,
      source: asString(row["source"]),
      name: asString(row["name"]) ?? description,
      controller: asNumber(row["controller"]),
      kind: asString(row["kind"]) ?? "spell",
      art: asString(row["art"]),
      manaCost: asString(row["manaCost"]),
      targets: Array.isArray(row["targets"])
        ? (row["targets"] as unknown[]).map(asTarget).filter((t): t is TargetRef => t !== null)
        : [],
    });
  }
  return items;
}

function asDecision(message: Record<string, unknown>): Decision | null {
  const decisionId = asNumber(message["decisionId"]);
  const actedForSeat = asNumber(message["actedForSeat"]);
  const stateVersion = asNumber(message["stateVersion"]);
  if (decisionId === null || actedForSeat === null || stateVersion === null) return null;
  return {
    decisionId,
    actedForSeat,
    stateVersion,
    kind: asString(message["kind"]) ?? "unknown",
    options: asOptions(message["options"]),
    // Absent means optional, matching the server: an older
    // server cannot accidentally make a decision unrefusable.
    mandatory: message["mandatory"] === true,
    prompt: asString(message["prompt"]),
    searchable: message["searchable"] === true,
    optionCount: asNumber(message["optionCount"]) ?? 0,
    results: null,
    unavailable: asReasons(message["unavailable"]),
    about: asAbout(message["about"]),
    looking: asCards(message["looking"]),
  };
}

function asAbout(value: unknown): DecisionAbout | null {
  const pairs = asReasons(value);
  if (!pairs["name"]) return null;
  return { name: pairs["name"], kind: pairs["kind"] ?? "spell", from: pairs["from"] ?? null };
}

function asReasons(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [id, why] of Object.entries(value as Record<string, unknown>)) {
    if (typeof why === "string") out[id] = why;
  }
  return out;
}

function asOptions(value: unknown): DecisionOption[] {
  if (!Array.isArray(value)) return [];
  const options: DecisionOption[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const actionId = asString(row["actionId"]);
    // An option with no id is one that cannot be chosen. Dropped
    // rather than shown as a button that does nothing.
    if (!actionId) continue;
    options.push({
      actionId,
      label: asString(row["label"]),
      objectId: asString(row["objectId"]),
      // Only an explicit false dims: absent means payable (§7.54).
      payable: row["payable"] !== false,
      cost: asString(row["cost"]),
    });
  }
  return options;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  // The server writes ids as JSON numbers, but Kotlin's Long and
  // JavaScript's number disagree about size, so a string form is
  // accepted too rather than becoming NaN silently.
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Waits before each try to reconnect to a game, in milliseconds; the last one repeats. */
export const MATCH_RECONNECT_DELAYS: readonly number[] = [500, 1000, 2000, 4000, 8000];

export interface MatchSocket {
  /** §6.100 — the decision and the action. Nothing else. */
  answer(decisionId: number, actionId: string | null): void;
  /** P6-AG — search a searchable question. Results arrive as DECISION_OPTIONS. */
  search(decisionId: number, query: string): void;
  /** §7.55 — concede. Nothing else is sent: who concedes is the session's. */
  concede(): void;
  /** §7.53 — apply changed stops to the game in progress (saved over HTTP first). */
  stops(settings: { own: string[]; opponent: string[]; hold: boolean }): void;
  /** §7.53 extra — no more stops for you this turn, unless the opponent acts. */
  passTurn(): void;
  close(): void;
}

/**
 * Connect to a match — §6.107 -- and stay connected.
 *
 * §6.111's reconnect is a real sequence (re-authenticate, re-verify
 * participation, re-send the snapshot and the still-valid pending
 * question), and the server performs all of it on every fresh
 * connection; reloading the page did exactly that. So a dropped
 * connection now simply opens a fresh one, on its own (owner report
 * 2026-10-21). The question on screen is set aside meanwhile -- the
 * server re-sends it if it is still the question -- so nothing is
 * answered against a question that has moved on.
 */
export function connectMatch(
  url: string,
  onState: (apply: (previous: MatchState) => MatchState) => void,
  factory: (url: string) => WebSocket = (u) => new WebSocket(u),
  delays: readonly number[] = MATCH_RECONNECT_DELAYS,
): MatchSocket {
  let socket: WebSocket;
  let closedByUs = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const open = () => {
    const current = factory(url);
    socket = current;
    let dropped = false;
    current.onopen = () => {
      attempt = 0;
    };
    current.onmessage = (event) => {
      const parsed = parse(event.data);
      if (!parsed) return;
      onState((previous) => reduceMatch(previous, parsed));
    };
    current.onclose = (event) => {
      if (dropped || closedByUs) return;
      dropped = true;
      // 1008: not signed in, or not a player in this match. A retry
      // cannot fix either.
      if (event.code === 1008) {
        onState((previous) => ({ ...previous, connection: "closed" }));
        return;
      }
      onState((previous) => ({
        ...previous,
        connection: "reconnecting",
        decision: null,
        awaiting: null,
        // Spec 0002 — told again on reconnect; stale meanwhile.
        asking: null,
      }));
      const wait = delays[Math.min(attempt, delays.length - 1)] ?? 0;
      attempt += 1;
      timer = setTimeout(() => {
        timer = null;
        if (!closedByUs) open();
      }, wait);
    };
  };
  open();

  return {
    answer(decisionId, actionId) {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(
        JSON.stringify(
          // A null action is a PASS, and it is sent explicitly
          // rather than by omitting the field, so "I choose to do
          // nothing" and "this message lost a field" are not the
          // same message.
          { type: "DECISION_RESPONSE", decisionId, actionId },
        ),
      );
    },
    search(decisionId, query) {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "DECISION_SEARCH", decisionId, query }));
    },
    concede() {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "CONCEDE" }));
    },
    stops(settings) {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(
        JSON.stringify({
          type: "STOPS",
          own: settings.own,
          opponent: settings.opponent,
          hold: settings.hold,
        }),
      );
    },
    passTurn() {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "PASS_TURN" }));
    },
    close() {
      closedByUs = true;
      if (timer !== null) clearTimeout(timer);
      socket.close();
    },
  };
}

function parse(data: unknown): Record<string, unknown> | null {
  if (typeof data !== "string") return null;
  try {
    const parsed = JSON.parse(data) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
