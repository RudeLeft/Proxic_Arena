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
import { logLine, summarise } from "./reportLog";
import { onPageBack, pageIsLeaving } from "./pageLife";
import { asOutcome, type MatchOutcome } from "./lobby";

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
  /** Phase 9 W-12 -- a named card's type line ("Creature — Goblin Scout"). */
  types?: string | null;
  /**
   * Spec 0057, item 5 -- for a card that can be played or discarded for
   * something: what this option does with it, in the game's words.
   */
  use?: OptionUse | null;
}

/**
 * Phase 9 W-16 -- something a card can't do now, and why. Spec 0061, item 1:
 * `use` "land" or "spell" for the PLAY of a card whose only choices throw it
 * away ("Play it as your land" -- "You've already played a land this turn").
 */
export interface NotNowRow {
  label: string;
  why: string;
  use?: "land" | "spell";
}

/** Spec 0057, item 5 -- an option of a play-or-discard card. */
export interface OptionUse {
  /** "land" | "spell" (the play) or "cycling" | "landcycling" | "channel" (discards it). */
  kind: string;
  /** "Play it as your land", "Cast it", "Cycle it instead"… */
  title: string;
  /** What it means: "It comes in tapped.", "Discard Forgotten Cave and draw a card. …" */
  line: string | null;
  /** Its mana, when it has one ("{R}"). */
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
  /** Phase 9 W-16 -- each permanent's abilities not offered now, and why, by object id. */
  notNow?: Record<string, NotNowRow[]> | undefined;
  /** Phase 9 Amendment 13 -- on a payment question, the mana still due ("{1}{R}"). */
  owing?: string | null;
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
  /**
   * Phase 9 W-07..W-10 (owner 2026-11-01) — how the tray lays the question
   * out, from the game's own facts: where the cards go, which end the
   * first pick lands at, a shuffle that may follow, the hidden zone the
   * cards are in, a Fact or Fiction split or its two piles. Absent for
   * every other question.
   */
  arrange?: DecisionArrange | null;
  /**
   * Spec 0005 — a response window: your OWN spell or trigger is on top of
   * the stack. The page counts down and passes for you if you let it run
   * out (Phase 8 Amendment 4); anything that shows you are acting pauses it.
   */
  window: boolean;
  /**
   * Spec 0070 -- a cost paid by picking cards one at a time: what it does to
   * the cards picked so far, and which they are. Each is marked on the
   * table at once (a Ribbon; a tap leans), and clicking one again takes it
   * back with its `actionId` -- an answer the question accepts beside its
   * options. Only the paying player is sent it. Null for every other question.
   */
  picking?: DecisionPicking | null;
}

/** Spec 0070 -- the cards picked so far for a cost (see Decision.picking). */
export interface DecisionPicking {
  /** The Ribbon's word, the game's: "TAP", "SACRIFICE", "TO HAND"... */
  word: string;
  /** Its colour, by what the cost does: tap, untap, sacrifice, exile, hand, library, reveal, discard, other. */
  tone: string;
  /** Picked to tap: the card leans as a tapped card does (never sideways before it is paid). */
  lean: boolean;
  /** In the order picked. */
  picked: { objectId: string; actionId: string; label: string }[];
}

/** Item 5 -- one attacker's combat damage, to split among its blockers. */
export interface DamageFight {
  damage: number;
  attacker: string | null;
  blockers: { card: string; lethal: number }[];
  /** The defending player may take damage once every blocker has lethal (trample). */
  trample: boolean;
  /** The defending player may take any of it (it divides as it chooses). */
  divides: boolean;
}

/** Phase 9 W-07..W-10 — how a tray question is laid out (see Decision.arrange). */
export interface DecisionArrange {
  /** Where the cards go: "top", "bottom" (of the library), "graveyard", … */
  to: string | null;
  /** Which end the FIRST pick lands at: "top", "bottom", or "first" in. */
  first: string | null;
  /** Ponder: "you may shuffle" is asked after the order. */
  shuffle: boolean;
  /** The hidden zone the cards are in: "library", or another player's "hand". */
  zone: string | null;
  /** Fact or Fiction: the cards are being split into two piles. */
  split: boolean;
  /** Fact or Fiction: the two piles to choose from -- the cards you may see, and how many. */
  piles: { cards: string[]; count: number }[] | null;
  /**
   * Owner 2026-11-01 (item 5) -- combat damage to assign: how much, each
   * blocker in the game's order with what it still needs to die, and
   * whether the player can take some (trample, or a creature that divides
   * its damage as it chooses).
   */
  damage?: DamageFight | null;
  /** Phase 9 W-11 (Amendment 14) -- a number question, for the dial. */
  number?: NumberLayout | null;
  /** Phase 9 W-11 (Amendment 14) -- one share of a split, with the whole split. */
  divide?: DivideLayout | null;
  /** Phase 9 W-12 (Amendment 16) -- naming a card. */
  name?: NameLayout | null;
  /** Phase 9 Amendment 17 -- a target question: what is chosen so far. */
  targets?: TargetsLayout | null;
  /** Phase 9 W-17 (Amendment 19) -- a roll question's dice. */
  dice?: DiceLayout | null;
  /** Phase 9 W-17 -- a two-way choice's kind (Forge's BinaryChoiceType: "HeadsOrTails", "IncreaseOrDecrease"...). */
  binary?: string | null;
  /** Phase 9 W-17 -- the sprocket the crank marker moves to next turn. */
  crankNext?: number | null;
  /** Phase 9 Amendment 21 -- a mode question's count (see ModesWindow). */
  modes?: {
    num: number;
    min: number;
    repeat: boolean;
    budget: number | null;
    spent: number | null;
    chosen: string[];
    paws: number[];
    escalate: string | null;
  } | null;
  /** Phase 9 Amendment 20 -- the dungeons offered, each with its rooms (the game's words). */
  dungeons?: { name: string; rooms: { name: string; says: string; next: string[] }[] }[] | null;
  /**
   * Spec 0058, item 8 -- "which resolves first?" for a mutated creature:
   * by option id, the card among its cards that printed that trigger, on
   * top or underneath, and the ability's words.
   */
  sources?: Record<string, TriggerSource> | null;
  /** Spec 0061, item 3 -- discarding to hand size: how many cards are still to go. */
  discard?: number | null;
}

/** Spec 0058, item 8 -- the card of a mutated creature a trigger came from. */
export interface TriggerSource {
  /** "card:N", one of the creature's `merged` cards. */
  card: string;
  name: string;
  place: "top" | "underneath";
  says: string | null;
}

/** Spec 0058, item 8 -- one card of a mutated creature (public). */
export interface MergedCard {
  id: string;
  name: string;
  art: string | null;
}

/**
 * Phase 9 W-17 (Amendment 19) -- what a roll question's window draws: how
 * the roll may change ("reroll", "nudge", "swap", "swapValue", "ignore"),
 * the die's sides, the rolls offered, the cards letting the player change
 * it (snapshot ids) and its price ("{1}"); for "swapValue" the creature's
 * power and toughness.
 */
export interface DiceLayout {
  how: string;
  sides: number;
  rolls: number[];
  by: { id: string; name: string }[];
  price: string | null;
  power: number | null;
  toughness: number | null;
}

/** Phase 9 W-17 -- one die roll, public: who, with which card, the sides, the final results. */
export interface SnapshotRoll {
  n: number;
  seat: number;
  source: string | null;
  name: string | null;
  sides: number;
  results: number[];
}

/** Spec 0062 -- one mana of a payment step: its colour, the cost's symbol it paid, its source. */
export interface PaidMana {
  /** W U B R G, or C for colourless. */
  colour: string;
  /** The symbol paid ("1" generic, "B", "B/G"); absent where the cost is hidden from this viewer. */
  shard: string | null;
  /**
   * "card:12" (tapped, or convoked), "pool" (mana already made), "life"
   * (Phyrexian), or "unseen": a card now in a hand or a library this viewer
   * can't see, whose id the game no longer sends (2026-11-08).
   */
  from: string;
}

/**
 * Spec 0062 -- one step of a payment, as it was paid: public (the land
 * tapped is), but a spell still being cast keeps its cost (and so the
 * symbols paid) to its caster.
 */
export interface SnapshotPayment {
  /** Grows by one each step: a page plays each once. */
  n: number;
  /** Who paid. */
  seat: number;
  /** Which payment: the steps of one payment share it. */
  payment: number;
  /** The card paid for (the spell being cast, the ability's or trigger's card). */
  for: string | null;
  /** "cast" (a spell being cast), "spell" (one on the stack), "ability" or "trigger". */
  kind: string;
  /** The cost when the payment began, "{2}{B}{B}"; absent where hidden. */
  cost: string | null;
  /** Still due after this step; absent where hidden. */
  owing: string | null;
  mana: PaidMana[];
}

/**
 * Phase 9 Amendment 17 -- a target question's state, from the game:
 * the targets chosen so far (snapshot ids, in order), whether that is
 * enough (a pass then goes on with them: Done), how many more may be
 * chosen, and the answer that backs out (the act button and Esc).
 */
export interface TargetsLayout {
  chosen: string[];
  enough: boolean;
  more: number;
  cancel: string | null;
}

/**
 * Phase 9 W-12 -- naming a card: the window's title ("Name a nonland
 * card"), the card's own sentence about the name, and the cards this
 * player can see whose names it may name (they glow; a click names one).
 */
export interface NameLayout {
  title: string;
  says: string | null;
  objects: string[];
}

/**
 * Phase 9 W-11 -- what the dial needs besides the options: each option's
 * number in the options' order (a number is never read from a label),
 * how much mana can be made (null when no mana is asked), the keyword
 * paid each time and what each time costs, and the card's own sentence.
 */
export interface NumberLayout {
  values: number[];
  canMake: number | null;
  keyword: string | null;
  each: string | null;
  says: string | null;
}

/**
 * Phase 9 W-11 -- a split ("divided as you choose"): the total, every
 * target in the order chosen with what a creature still needs to die,
 * which target this question is about, and each option's amount.
 */
export interface DivideLayout {
  total: number;
  /** "damage", "counters" or "amount". */
  what: string;
  targets: { object: string | null; lethal: number | null }[];
  at: number;
  values: number[];
}

/** The spell or ability a question is about. */
export interface DecisionAbout {
  name: string;
  /** "spell" | "ability" | "trigger" | "card" */
  kind: string;
  /** For a spell: the zone it is cast from ("hand", "graveyard", …). */
  from: string | null;
  /**
   * Phase 9 W-06 — this trigger is copy `copy` of `copies` copies of one
   * trigger going on the stack together (seven Boggart Shenanigans
   * triggers), so one answer can serve them all. Null otherwise.
   */
  copy: number | null;
  copies: number | null;
  /** Spec 0057, item 6 -- the card itself ("card:N"), on the battlefield or in your hand. */
  card?: string | null;
  /** Spec 0057, item 3 -- a cost you chose to pay: its action ("Sacrifice"). */
  act?: string | null;
  /** Spec 0057, item 3 -- what the ability does. */
  effect?: string | null;
  /**
   * Spec 0061, item 5 -- paying for an ability: what for, after "Pay {R}"
   * ("to cycle Forgotten Cave"), and the line under it.
   */
  pay?: string | null;
  then?: string | null;
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
  /** Spec 0051 -- its art crop (Scryfall's cut of the art), for the art window; only beside `art`. */
  crop?: string | null;
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
   * Spec 0045 -- where its counters came from, oldest first, from what
   * was resolving when Forge put them on ("Ajani's Pridemate's trigger:
   * RudeLeft gained 1 life (Soul Warden)"). Absent when not known.
   */
  counterFrom?: CounterOrigin[] | undefined;
  /** Spec 0046 -- a land's mana, as symbols ("W", "U", "C"), from its abilities now. */
  makes?: string[] | undefined;
  /** Spec 0045 -- on a revealed card: where it went ("hand", "bottom"...), once settled. */
  to?: string | null;
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
  /** Phase 9 W-19 -- a creature's power and toughness before counters and effects. */
  basePower?: number | undefined;
  baseToughness?: number | undefined;
  /** Phase 9 W-18 -- in exile: the card that exiled it (public). */
  exiledBy?: string | undefined;
  /** Phase 9 W-18 -- in exile: this viewer may play it from there. */
  playable?: boolean | undefined;
  /**
   * Spec 0058, item 2 -- in your own hand: what casting it costs right now,
   * when that is not its printed cost (Goblin Warchief's {1} less), and why
   * ("Costs {1} less: Goblin Warchief"). Forge's own reckoning.
   */
  costNow?: string | undefined;
  costWhy?: string | undefined;
  /** Spec 0058, item 8 -- a mutated creature's cards, top first. */
  merged?: MergedCard[] | undefined;
  /**
   * Spec 0070, Amendment 1 -- a hand card another player has seen (the
   * eye): in your own hand, seen by them; in otherHands, revealed to you,
   * shown until it leaves their hand.
   */
  seen?: boolean | undefined;
}

export interface SnapshotPlayer {
  seat: number;
  name: string;
  life: number;
  /** Counts, because a hand's SIZE is public and its contents are not. */
  handCount: number;
  libraryCount: number;
  graveyardCount: number;
  /** Phase 9 W-15 -- how many times this player has mulliganed (public). */
  mulligans?: number | undefined;
  /**
   * §6.96 — Forge's state on the player, carried generically: every
   * counter (poison, energy, experience...), every designation
   * (monarch, initiative, the city's blessing), and what is in the
   * command zone (a dungeon, an emblem, the Ring). Shown as sent.
   */
  counters: SnapshotCounter[];
  designations: string[];
  command: string[];
  /**
   * Phase 9 W-21 (Amendment 18) -- what each command-zone piece does, in
   * the game's own words, one per `command` entry and in its order: an
   * emblem's `says`; a dungeon's rooms. Empty from an older worker.
   */
  commandWords?: CommandWords[] | undefined;
  /** How many times the Ring has tempted this player; 0 for never. */
  ringTempted: number;
  /** Dungeons this player has completed, one entry each time. */
  dungeonsCompleted: string[];
  /** §7.61 B6 — floating mana by colour ({"R": 1}); empty when there is none. Public. */
  manaPool: Record<string, number>;
}

/** Phase 9 W-21 -- one command-zone piece, in the game's own words. */
export interface CommandWords {
  name: string;
  /** An emblem's abilities. */
  says?: string | undefined;
  /** A dungeon's rooms, in its order: what each does, where it leads, the marker. */
  rooms?: { name: string; says: string; next: string[]; here: boolean }[] | undefined;
}

/** Spec 0045 -- some counters, and what put them on. */
export interface CounterOrigin {
  counter: string;
  added: number;
  from: string;
}

/** Spec 0045 -- the cards Forge last showed this viewer, face up. */
export interface SnapshotReveal {
  /** Changes with each new reveal, so a closed tray stays closed. */
  key: string;
  /** "Goblin Ringleader revealed:" */
  title: string;
  cards: SnapshotCard[];
  /** Phase 9 Amendment 12 -- which of a reveal and a report came last. */
  stamp?: number;
  /** Amendment 12 -- a report: the seat that acted. */
  by?: number;
  /** Amendment 12 -- the card that did it ("Demonic Tutor"). */
  source?: string;
  /** Amendment 12 -- the whole action in this reader's words. */
  said?: string;
  /** Spec 0057, item 7 -- why, for a reveal paid as a cost ("to cast … for {1}{G} instead of {4}{G}"). */
  why?: string;
  /** Spec 0075 -- the pictures that are not cards: a colour chosen, a coin flipped. */
  marks?: ReportMark[];
}

/** Spec 0075 -- one picture in a report window that is not a card. */
export type ReportMark =
  | { kind: "color"; color: "white" | "blue" | "black" | "red" | "green" }
  | { kind: "coin"; won: boolean };

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
  /** Spec 0051 -- its art crop, beside `art`. */
  crop?: string | null;
  /** A spell's printed mana cost ("{1}{R}"), when this viewer may know it. */
  manaCost: string | null;
  /** Spec 0045 -- why a trigger triggered ("Ajani's Pridemate entered the battlefield"). */
  why?: string | null;
}

/** Combat, while there is one — §7.61 B4. Forge's record. */
export interface CombatState {
  attackers: { id: string; target: TargetRef }[];
  blocks: { blocker: string; attacker: string }[];
}

/** Phase 10 A-13 -- one fight of a combat damage step, as Forge's combat stood when it began. */
export interface CombatFight {
  attacker: string;
  defender: TargetRef;
  /** In Forge's damage-assignment order. */
  blockers: string[];
}

/** One wave of damage — §7.61 B13. A new key is a new wave. */
export interface DamageState {
  key: string;
  hits: {
    source: string;
    target: TargetRef;
    amount: number;
    deathtouch?: boolean;
    /** Spec 0077 -- an infect hit: poison counters, not life (CR 120.3b). */
    infect?: boolean;
  }[];
  /** Phase 10 A-13 -- the damage a combat damage step dealt: which step. Absent for a spell's. */
  combat?: "first-strike" | "regular";
  /** Phase 10 A-13 -- who fought whom in that step (the dead included). */
  fights?: CombatFight[];
  /** Phase 10 A-13 -- life gained as it was dealt (lifelink), and from what when the game knows. */
  gains?: { player: number; amount: number; source?: string }[];
}

/** Spec 0077 -- one change to a player's life or poison, as the game made it. */
export interface LifeChange {
  player: number;
  /** "damage" and "loss" take life, "gain" adds it, "poison" gives poison counters. */
  kind: "damage" | "loss" | "gain" | "poison";
  /** Always above 0. */
  amount: number;
  /** The card it came from ("card:N"), when the game says and this reader may know. */
  source?: string;
  /** In a combat damage step's damage: played with the fights. */
  combat?: boolean;
}

/** Spec 0077 -- the round's life and poison changes, in order. A new key is a new round. */
export interface LifeChanges {
  key: string;
  changes: LifeChange[];
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
  /**
   * Spec 0061 -- how many notices this viewer was told in all. `notices`
   * keeps the last six only, so its length stops changing once full; this
   * says how many of them are new. Absent from an older worker.
   */
  noticesTotal?: number | null;
  battlefield: SnapshotCard[];
  /** Phase 9 W-17 -- the dice rolled lately (public); absent from an older worker. */
  rolls?: SnapshotRoll[] | undefined;
  /** Spec 0062 -- the latest payment steps (each mana paid); absent from an older worker. */
  payments?: SnapshotPayment[] | undefined;
  /**
   * Phase 10 A-00 -- the cards moved since the last board, as the game
   * moved them: where from, where to, why. Empty from an older worker (the
   * board then compares boards, as before). A move this viewer can't see
   * at either end carries no card.
   */
  moves?: SnapshotMove[] | undefined;
  hand: SnapshotCard[];
  /**
   * §6.37, §6.38 — other players' hand cards that FORGE says this
   * viewer may see: under Mindslaver, the controlled player's hand;
   * with Telepathy, an opponent's. Never a hidden card, not even as
   * a blank: the page has nothing to hide.
   */
  otherHands: SnapshotCard[];
  /** Spec 0042 -- the spell being cast: on the stack zone, not yet on the stack. */
  casting: SnapshotCard[];
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
  /** Spec 0077 -- this round's life and poison changes, or null. */
  life?: LifeChanges | null;
  /** Spec 0045 -- the cards Forge last showed this viewer, or null. */
  reveal?: SnapshotReveal | null;
  /** Phase 9 Amendment 12 -- who did what, in this reader's words. */
  action?: SnapshotReveal | null;
  /**
   * Spec 0047 -- the PUBLIC view, sent to spectators: no hand, nothing
   * face down. `seat` is then the side it is drawn from, not the viewer's.
   */
  spectator?: boolean;
}

/**
 * Spec 0064 -- one card a play log line names: only a card the worker let
 * this seat identify (anything else is plain words, "a card"). `art` is the
 * picture the server put on it for this seat; `label` is how it reads when
 * that differs from its name (a token: "Goblin" for "Goblin Token").
 */
export interface PlayLogCard {
  name: string;
  label?: string;
  id?: string;
  owner: number;
  seat: number;
  art?: string;
  crop?: string;
  token?: boolean;
  faceDown?: boolean;
}

/** Words, a player (by seat) or a card. */
export type PlayLogPart = string | { player: number } | PlayLogCard;

/**
 * Spec 0064 -- one line of this seat's play log, as the worker wrote it for
 * this seat. `rev` is the board it came with: the page shows it only once
 * the board on the table is at least that one (HID-005).
 */
export interface PlayLogLine {
  n: number;
  rev: number;
  turn: number;
  /** Whose turn it was. */
  active: number;
  step: string;
  kind: string;
  parts: PlayLogPart[];
  /** Life totals after it, by seat. */
  life?: { seat: number; total: number }[];
  /** Only you were told this much. */
  private?: boolean;
}

/** Spec 0064 -- how many play log lines the page keeps (the server keeps as many). */
export const PLAY_LOG_KEPT = 2000;

/** The lines of a snapshot's `playLog`, as far as they are well formed. */
export function asPlayLog(value: unknown): PlayLogLine[] {
  if (!Array.isArray(value)) return [];
  const out: PlayLogLine[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const row = raw as Record<string, unknown>;
    const n = asNumber(row["n"]);
    const rev = asNumber(row["rev"]);
    if (n === null || rev === null || !Array.isArray(row["parts"])) continue;
    const parts: PlayLogPart[] = [];
    for (const part of row["parts"] as unknown[]) {
      if (typeof part === "string") parts.push(part);
      else if (typeof part === "object" && part !== null) {
        const p = part as Record<string, unknown>;
        const player = asNumber(p["player"]);
        const name = asString(p["name"]);
        if (player !== null) parts.push({ player });
        else if (name) {
          const card: PlayLogCard = {
            name,
            owner: asNumber(p["owner"]) ?? 0,
            seat: asNumber(p["seat"]) ?? 0,
          };
          const label = asString(p["label"]);
          const id = asString(p["id"]);
          const art = asString(p["art"]);
          const crop = asString(p["crop"]);
          if (label) card.label = label;
          if (id) card.id = id;
          if (art) card.art = art;
          if (crop) card.crop = crop;
          if (p["token"] === true) card.token = true;
          if (p["faceDown"] === true) card.faceDown = true;
          parts.push(card);
        }
      }
    }
    const line: PlayLogLine = {
      n,
      rev,
      turn: asNumber(row["turn"]) ?? 0,
      active: asNumber(row["active"]) ?? 0,
      step: asString(row["step"]) ?? "",
      kind: asString(row["kind"]) ?? "other",
      parts,
    };
    if (Array.isArray(row["life"])) {
      line.life = (row["life"] as unknown[]).flatMap((t) => {
        const r = (t ?? {}) as Record<string, unknown>;
        const seat = asNumber(r["seat"]);
        const total = asNumber(r["total"]);
        return seat === null || total === null ? [] : [{ seat, total }];
      });
    }
    if (row["private"] === true) line.private = true;
    out.push(line);
  }
  return out;
}

/**
 * Spec 0064 -- the log with [incoming] added: by number, so a line sent
 * twice (the whole log again on a reconnect) is kept once; oldest first;
 * bounded as the server bounds it.
 */
export function mergePlayLog(log: PlayLogLine[], incoming: PlayLogLine[]): PlayLogLine[] {
  if (incoming.length === 0) return log;
  const last = log.length > 0 ? log[log.length - 1]!.n : 0;
  // The ordinary case: this round's lines, all new and in order.
  if (incoming[0]!.n > last && incoming.every((l, i) => i === 0 || l.n > incoming[i - 1]!.n)) {
    return [...log, ...incoming].slice(-PLAY_LOG_KEPT);
  }
  const byN = new Map<number, PlayLogLine>();
  for (const line of log) byN.set(line.n, line);
  for (const line of incoming) byN.set(line.n, line);
  return [...byN.values()].sort((a, b) => a.n - b.n).slice(-PLAY_LOG_KEPT);
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
   * Spec 0054 — "End the game" for an away player: "SENT" once the server
   * took it (the game's end follows), or why it was not.
   */
  awayEnd?: string | null;
  /**
   * Spec 0002 — who the server says is being asked: `{ seat: null }`
   * when nobody is and the rules engine is working; null before it has
   * said (an older server never does, and the screen then guesses from
   * priority as it used to).
   */
  /** Phase 9 Amendment 21 -- `doing`: the server's word for what they are doing ("Splitting the cards"). */
  asking: { seat: number | null; doing?: string | null } | null;
  /** Spec 0047 -- how many people are watching (players are told). */
  watching: number;
  /** Spec 0067 -- who is watching, by display name (players are told). */
  watchers?: string[];
  /**
   * Spec 0067 -- the game is over, as the server told a SPECTATOR on this
   * socket (players hear it as the lobby's MATCH): its status and result,
   * by seat. Null until then.
   */
  ended?: MatchEnding | null;
  /**
   * Spec 0054 -- minutes the other player is offline before "End the
   * game" is offered: the server's setting, from the greeting.
   */
  awayMinutes: number;
  /**
   * Spec 0056 — the server said it is stopping under this game (an update):
   * the game cannot be finished, and the screen says so plainly.
   */
  serverStopping?: boolean;
  /**
   * Spec 0064 -- this seat's play log, oldest first, as far as it has come
   * (each line says which board it came with; the screen holds back a line
   * until that board is on the table).
   */
  playLog?: PlayLogLine[];
}

/** Spec 0067 -- how a game ended, told to a spectator (MATCH_ENDED). */
export interface MatchEnding {
  matchId: string | null;
  status: string;
  failureCode: string | null;
  outcome: MatchOutcome | null;
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
  watching: 0,
  awayMinutes: 10,
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
    // Spec 0056 — no words come with it: the screen has them.
    case "SERVER_STOPPING":
      return { ...state, serverStopping: true, decision: null, awaiting: null };

    case "MATCH_HELLO": {
      const seat = asNumber(message["seat"]);
      if (seat === null) return state;
      const away = asNumber(message["awayMinutes"]);
      return {
        ...state,
        connection: "open",
        seat,
        ...(away !== null && away > 0 ? { awayMinutes: away } : {}),
      };
    }

    // Spec 0047 -- how many people are watching this game; spec 0067 -- and who.
    case "WATCHING": {
      const names = Array.isArray(message["names"])
        ? (message["names"] as unknown[]).filter((n): n is string => typeof n === "string")
        : [];
      return { ...state, watching: asNumber(message["count"]) ?? 0, watchers: names };
    }

    // Spec 0067 -- the game is over (to a spectator): who won and why, by
    // seat. The socket is closed after it; nothing more is asked.
    case "MATCH_ENDED": {
      const status = asString(message["status"]);
      if (!status) return state;
      return {
        ...state,
        decision: null,
        awaiting: null,
        ended: {
          matchId: asString(message["matchId"]),
          status,
          failureCode: asString(message["failureCode"]),
          outcome: asOutcome(message),
        },
      };
    }

    case "MATCH_SNAPSHOT": {
      // Spec 0064 -- the play log first: a stale board (a reconnect's stored
      // one) still brings the log's history, which the page keeps by number.
      const raw = message["state"];
      const lines = asPlayLog(
        typeof raw === "object" && raw !== null
          ? (raw as Record<string, unknown>)["playLog"]
          : null,
      );
      if (lines.length > 0) state = { ...state, playLog: mergePlayLog(state.playLog ?? [], lines) };
      const board = asSnapshot(raw);
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
      const doing = asString(message["doing"]);
      return asked === null
        ? state
        : { ...state, asking: doing ? { seat: asked, doing } : { seat: asked } };
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

    case "AWAY_END_ACCEPTED":
      return { ...state, awayEnd: "SENT" };

    case "AWAY_END_REFUSED":
      return { ...state, awayEnd: asString(message["reason"]) ?? "REFUSED" };

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

/** Spec 0054 — where "End the game" stands, in words; null when there is none. */
export function awayEndText(
  awayEnd: string | null | undefined,
  name: string,
  awayMinutes = 10,
): string | null {
  switch (awayEnd) {
    case null:
    case undefined:
      return null;
    case "SENT":
      return `Ending the game: ${name} concedes.`;
    case "NOT_AWAY":
      return `${name} is back, or hasn't been gone ${awayMinutes} ${awayMinutes === 1 ? "minute" : "minutes"} yet.`;
    case "UNREACHABLE":
      return "The game did not receive that. It may have stopped.";
    default:
      return "The game could not be ended that way.";
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
      return "You can't skip this. The rules require a choice.";
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
  // Spec 0047 -- the public view is seat 0, nobody's; drawn from `viewFrom`.
  const spectator = row["spectator"] === true;
  const seat = spectator ? (asNumber(row["viewFrom"]) ?? 1) : asNumber(row["seat"]);
  if (revision === null || seat === null) return null;
  return {
    stateRevision: revision,
    seat,
    ...(spectator ? { spectator: true } : {}),
    // Absent means the first game: an older worker never restarts.
    gameEpoch: asNumber(row["gameEpoch"]) ?? 1,
    dayTime: asString(row["dayTime"]),
    turn: asNumber(row["turn"]) ?? 0,
    phase: asString(row["phase"]) ?? "",
    activeSeat: asNumber(row["activeSeat"]) ?? 0,
    prioritySeat: asNumber(row["prioritySeat"]),
    players: asPlayers(row["players"]),
    notices: asNotices(row["notices"]),
    noticesTotal: asNumber(row["noticesTotal"]),
    battlefield: asCards(row["battlefield"]),
    rolls: asRolls(row["rolls"]),
    payments: asPayments(row["payments"]),
    moves: asMoves(row["moves"]),
    hand: asCards(row["hand"]),
    otherHands: asCards(row["otherHands"]),
    casting: asCards(row["casting"]),
    graveyard: asCards(row["graveyard"]),
    exile: asCards(row["exile"]),
    stack: asStack(row["stack"]),
    combat: asCombat(row["combat"]),
    damage: asDamage(row["damage"]),
    life: asLife(row["life"]),
    reveal: asReveal(row["reveal"]),
    action: asAction(row["action"]),
  };
}

function asReveal(value: unknown): SnapshotReveal | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const key = asString(row["key"]);
  const cards = asCards(row["cards"]);
  if (!key || cards.length === 0) return null;
  const said = asString(row["said"]);
  const why = asString(row["why"]);
  return {
    key,
    title: asString(row["title"]) ?? "Revealed:",
    cards,
    stamp: asNumber(row["stamp"]) ?? 0,
    // Spec 0057, item 7 -- a reveal paid as a cost: who, the card, why.
    ...(said
      ? {
          said,
          by: asNumber(row["by"]) ?? 0,
          source: asString(row["source"]) ?? "",
          ...(why ? { why } : {}),
        }
      : {}),
  };
}

/** Phase 9 Amendment 12 -- a report: who acted, the sentence, the cards (a look may have none). */
function asAction(value: unknown): SnapshotReveal | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const key = asString(row["key"]);
  const said = asString(row["said"]);
  if (!key || !said) return null;
  const marks = asMarks(row["marks"]);
  return {
    key,
    title: said,
    said,
    cards: asCards(row["cards"]),
    stamp: asNumber(row["stamp"]) ?? 0,
    by: asNumber(row["by"]) ?? 0,
    source: asString(row["source"]) ?? "",
    ...(marks.length ? { marks } : {}),
  };
}

const COLOURS = ["white", "blue", "black", "red", "green"] as const;

/** Spec 0075 -- a report's pictures that are not cards; anything unknown is left out. */
function asMarks(value: unknown): ReportMark[] {
  if (!Array.isArray(value)) return [];
  const out: ReportMark[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    if (row["kind"] === "coin") out.push({ kind: "coin", won: row["won"] === true });
    const color = COLOURS.find((c) => c === row["color"]);
    if (row["kind"] === "color" && color) out.push({ kind: "color", color });
  }
  return out;
}

function asOrigins(value: unknown): CounterOrigin[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const origins: CounterOrigin[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const counter = asString(row["counter"]);
    const from = asString(row["from"]);
    if (!counter || !from) continue;
    origins.push({ counter, added: asNumber(row["added"]) ?? 1, from });
  }
  return origins.length ? origins : undefined;
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
      mulligans: asNumber(row["mulligans"]) ?? 0,
      counters: asCounters(row["counters"]),
      designations: asNotices(row["designations"]),
      command: asNotices(row["command"]),
      commandWords: asCommandWords(row["commandWords"]),
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

/** Phase 9 W-16 -- {objectId: [{label, why}]}, keeping only well-formed rows. */
function asNotNow(value: unknown): Record<string, NotNowRow[]> {
  const out: Record<string, NotNowRow[]> = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return out;
  for (const [id, rows] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(rows)) continue;
    const kept = rows.flatMap((row) => {
      const r = row as Record<string, unknown>;
      const use: NotNowRow["use"] =
        r?.["use"] === "land" || r?.["use"] === "spell" ? r["use"] : undefined;
      return typeof r?.["label"] === "string" && typeof r?.["why"] === "string"
        ? [{ label: r["label"], why: r["why"], ...(use ? { use } : {}) }]
        : [];
    });
    if (kept.length > 0) out[id] = kept;
  }
  return out;
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
      crop: asHash(row["crop"]),
      enteredAt: asNumber(row["enteredAt"]),
      token: row["token"] === true,
      counterFrom: asOrigins(row["counterFrom"]),
      makes: Array.isArray(row["makes"])
        ? (row["makes"] as unknown[]).filter(
            (s): s is string => typeof s === "string" && /^[WUBRGC]$/.test(s),
          )
        : undefined,
      to: asString(row["to"]),
      basePower: asNumber(row["basePower"]) ?? undefined,
      baseToughness: asNumber(row["baseToughness"]) ?? undefined,
      exiledBy: asString(row["exiledBy"]) ?? undefined,
      playable: row["playable"] === true ? true : undefined,
      costNow: asString(row["costNow"]) ?? undefined,
      costWhy: asString(row["costWhy"]) ?? undefined,
      merged: asMerged(row["merged"]),
      seen: row["seen"] === true ? true : undefined,
    });
  }
  return cards;
}

/** Spec 0058, item 8 -- a mutated creature's cards; undefined for anything else. */
function asMerged(value: unknown): MergedCard[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parts = value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const r = entry as Record<string, unknown>;
    const id = asString(r["id"]);
    const name = asString(r["name"]);
    return id && name ? [{ id, name, art: asHash(r["art"]) }] : [];
  });
  return parts.length > 1 ? parts : undefined;
}

/** Spec 0058, item 8 -- each trigger's own card, by option id. */
function asSources(value: unknown): Record<string, TriggerSource> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const out: Record<string, TriggerSource> = {};
  for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== "object" || entry === null) continue;
    const r = entry as Record<string, unknown>;
    const card = asString(r["card"]);
    const name = asString(r["name"]);
    const place = r["place"] === "top" ? "top" : r["place"] === "underneath" ? "underneath" : null;
    if (card && name && place) out[id] = { card, name, place, says: asString(r["says"]) };
  }
  return Object.keys(out).length > 0 ? out : null;
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

const LIFE_KINDS = new Set(["damage", "loss", "gain", "poison"]);

/** Spec 0077 -- the round's life changes; anything malformed is left out. */
function asLife(value: unknown): LifeChanges | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const key = asString(row["key"]);
  if (!key) return null;
  const changes: LifeChange[] = [];
  for (const entry of Array.isArray(row["changes"]) ? (row["changes"] as unknown[]) : []) {
    if (typeof entry !== "object" || entry === null) continue;
    const c = entry as Record<string, unknown>;
    const player = asNumber(c["player"]);
    const amount = asNumber(c["amount"]);
    const kind = c["kind"];
    if (player === null || amount === null || amount <= 0) continue;
    if (typeof kind !== "string" || !LIFE_KINDS.has(kind)) continue;
    const source = asString(c["source"]);
    changes.push({
      player,
      kind: kind as LifeChange["kind"],
      amount,
      ...(source ? { source } : {}),
      ...(c["combat"] === true ? { combat: true } : {}),
    });
  }
  return { key, changes };
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
    if (source && target && amount !== null)
      hits.push({
        source,
        target,
        amount,
        ...(h["deathtouch"] === true ? { deathtouch: true } : {}),
        ...(h["infect"] === true ? { infect: true } : {}),
      });
  }
  const step = row["combat"];
  if (step !== "first-strike" && step !== "regular") return { key, hits };
  const fights: CombatFight[] = [];
  for (const entry of Array.isArray(row["fights"]) ? (row["fights"] as unknown[]) : []) {
    if (typeof entry !== "object" || entry === null) continue;
    const f = entry as Record<string, unknown>;
    const attacker = asString(f["attacker"]);
    const defender = asTarget(f["defender"]);
    if (!attacker || !defender) continue;
    const blockers = (Array.isArray(f["blockers"]) ? (f["blockers"] as unknown[]) : []).flatMap(
      (b) => {
        const id = asString(b);
        return id ? [id] : [];
      },
    );
    fights.push({ attacker, defender, blockers });
  }
  const gains: NonNullable<DamageState["gains"]> = [];
  for (const entry of Array.isArray(row["gains"]) ? (row["gains"] as unknown[]) : []) {
    if (typeof entry !== "object" || entry === null) continue;
    const g = entry as Record<string, unknown>;
    const player = asNumber(g["player"]);
    const amount = asNumber(g["amount"]);
    const source = asString(g["source"]);
    if (player !== null && amount !== null)
      gains.push({ player, amount, ...(source ? { source } : {}) });
  }
  return { key, hits, combat: step, fights, gains };
}

/** Phase 9 W-21 -- the command zone's words, keeping only well-formed entries. */
function asCommandWords(value: unknown): CommandWords[] {
  if (!Array.isArray(value)) return [];
  const words: CommandWords[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const name = asString(row["name"]);
    if (!name) continue;
    const rooms = Array.isArray(row["rooms"])
      ? (row["rooms"] as unknown[]).flatMap((room) => {
          if (typeof room !== "object" || room === null) return [];
          const r = room as Record<string, unknown>;
          const roomName = asString(r["name"]);
          if (!roomName) return [];
          return [
            {
              name: roomName,
              says: asString(r["says"]) ?? "",
              next: asNotices(r["next"]),
              here: r["here"] === true,
            },
          ];
        })
      : undefined;
    words.push({ name, says: asString(row["says"]) ?? undefined, rooms });
  }
  return words;
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
      crop: asHash(row["crop"]),
      manaCost: asString(row["manaCost"]),
      why: asString(row["why"]),
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
    notNow: asNotNow(message["notNow"]),
    owing: asString(message["owing"]),
    about: asAbout(message["about"]),
    looking: asCards(message["looking"]),
    arrange: asArrange(message["arrange"]),
    window: message["window"] === true,
    picking: asPicking(message["picking"]),
  };
}

/** Spec 0070 -- anything malformed is no picking at all; a pick without its ids is dropped. */
function asPicking(value: unknown): DecisionPicking | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const word = asString(v["word"]);
  if (!word) return null;
  const picked = Array.isArray(v["picked"])
    ? v["picked"].flatMap((one) => {
        if (typeof one !== "object" || one === null) return [];
        const p = one as Record<string, unknown>;
        const objectId = asString(p["objectId"]);
        const actionId = asString(p["actionId"]);
        return objectId && actionId
          ? [{ objectId, actionId, label: asString(p["label"]) ?? "" }]
          : [];
      })
    : [];
  return { word, tone: asString(v["tone"]) ?? "other", lean: v["lean"] === true, picked };
}

function asFight(value: unknown): DamageFight | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const damage = asNumber(v["damage"]);
  if (!damage || !Array.isArray(v["blockers"])) return null;
  const blockers = v["blockers"].flatMap((b) => {
    if (typeof b !== "object" || b === null) return [];
    const one = b as Record<string, unknown>;
    const card = asString(one["card"]);
    return card ? [{ card, lethal: asNumber(one["lethal"]) ?? 0 }] : [];
  });
  return {
    damage,
    attacker: asString(v["attacker"]),
    blockers,
    trample: v["trample"] === true,
    divides: v["divides"] === true,
  };
}

function asNumbers(value: unknown): number[] {
  return Array.isArray(value) ? value.map(asNumber).filter((n): n is number => n !== null) : [];
}

function asNumberLayout(value: unknown): NumberLayout | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const values = asNumbers(v["values"]);
  if (values.length === 0) return null;
  return {
    values,
    canMake: asNumber(v["canMake"]),
    keyword: asString(v["keyword"]),
    each: asString(v["each"]),
    says: asString(v["says"]),
  };
}

function asDivide(value: unknown): DivideLayout | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const total = asNumber(v["total"]);
  if (!total || !Array.isArray(v["targets"])) return null;
  const targets = v["targets"].map((t) => {
    const one = (typeof t === "object" && t !== null ? t : {}) as Record<string, unknown>;
    return { object: asString(one["object"]), lethal: asNumber(one["lethal"]) };
  });
  return {
    total,
    what: asString(v["what"]) ?? "amount",
    targets,
    at: asNumber(v["at"]) ?? 0,
    values: asNumbers(v["values"]),
  };
}

function asTargets(value: unknown): TargetsLayout | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  return {
    chosen: Array.isArray(v["chosen"])
      ? v["chosen"].filter((id): id is string => typeof id === "string")
      : [],
    enough: v["enough"] === true,
    more: asNumber(v["more"]) ?? 0,
    cancel: asString(v["cancel"]),
  };
}

function asNameLayout(value: unknown): NameLayout | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  return {
    title: asString(v["title"]) ?? "Name a card",
    says: asString(v["says"]),
    objects: Array.isArray(v["objects"])
      ? v["objects"].filter((id): id is string => typeof id === "string")
      : [],
  };
}

function asArrange(value: unknown): DecisionArrange | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const piles = Array.isArray(v["piles"])
    ? v["piles"].flatMap((pile) => {
        if (typeof pile !== "object" || pile === null) return [];
        const p = pile as Record<string, unknown>;
        const cards = Array.isArray(p["cards"])
          ? p["cards"].filter((id): id is string => typeof id === "string")
          : [];
        return [{ cards, count: asNumber(p["count"]) ?? cards.length }];
      })
    : null;
  return {
    to: asString(v["to"]),
    first: asString(v["first"]),
    shuffle: v["shuffle"] === true,
    zone: asString(v["zone"]),
    split: typeof v["split"] === "string" || v["split"] === true,
    piles: piles && piles.length === 2 ? piles : null,
    damage: asFight(v["damage"]),
    number: asNumberLayout(v["number"]),
    divide: asDivide(v["divide"]),
    name: asNameLayout(v["name"]),
    targets: asTargets(v["targets"]),
    dice: asDice(v["dice"]),
    binary: asString(v["binary"]),
    crankNext: asNumber(v["crankNext"]),
    dungeons: asDungeons(v["dungeons"]),
    modes: asModes(v["modes"]),
    sources: asSources(v["sources"]),
    discard: asNumber(v["discard"]),
  };
}

function asModes(value: unknown): NonNullable<DecisionArrange["modes"]> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const num = asNumber(v["num"]);
  if (num === null) return null;
  const nums = (x: unknown) => (Array.isArray(x) ? x.map((n) => asNumber(n) ?? 0) : []);
  return {
    num,
    min: asNumber(v["min"]) ?? 1,
    repeat: v["repeat"] === true,
    budget: asNumber(v["budget"]),
    spent: asNumber(v["spent"]),
    chosen: asNotices(v["chosen"]),
    paws: nums(v["paws"]),
    escalate: asString(v["escalate"]),
  };
}

function asDungeons(value: unknown): NonNullable<DecisionArrange["dungeons"]> | null {
  if (!Array.isArray(value)) return null;
  const out = value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const e = entry as Record<string, unknown>;
    const name = asString(e["name"]);
    if (!name || !Array.isArray(e["rooms"])) return [];
    const rooms = (e["rooms"] as unknown[]).flatMap((room) => {
      if (typeof room !== "object" || room === null) return [];
      const r = room as Record<string, unknown>;
      const roomName = asString(r["name"]);
      return roomName
        ? [{ name: roomName, says: asString(r["says"]) ?? "", next: asNotices(r["next"]) }]
        : [];
    });
    return [{ name, rooms }];
  });
  return out.length ? out : null;
}

function asDice(value: unknown): DiceLayout | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const how = asString(v["how"]);
  if (!how) return null;
  const rolls = Array.isArray(v["rolls"])
    ? v["rolls"].map((r) => asNumber(r)).filter((r): r is number => r !== null)
    : [];
  const by = Array.isArray(v["by"])
    ? v["by"].flatMap((entry) => {
        if (typeof entry !== "object" || entry === null) return [];
        const e = entry as Record<string, unknown>;
        const id = asString(e["id"]);
        const name = asString(e["name"]);
        return id && name ? [{ id, name }] : [];
      })
    : [];
  return {
    how,
    sides: asNumber(v["sides"]) ?? 6,
    rolls,
    by,
    price: asString(v["price"]),
    power: asNumber(v["power"]),
    toughness: asNumber(v["toughness"]),
  };
}

/** Phase 9 W-17 -- the dice rolled lately, as the worker keeps them. */
/** Phase 10 A-00 -- one card's move, as the game made it. */
export interface SnapshotMove {
  /**
   * "card:N"; absent when this viewer can't see where the card is now (the
   * other player's hand, any library): the game never sends an id for a card
   * in a zone hidden from the viewer (2026-11-08). The page pairs such a move
   * with the card gone from the board it drew before (fromSnapshot).
   */
  card: string | null;
  from: { zone: string; seat: number | null };
  to: { zone: string; seat: number | null };
  /**
   * Why it left the battlefield, when the game says. Spec 0061, item 4: and
   * why it went to a graveyard -- "cycled", "discarded", "countered", "died".
   */
  why: "destroyed" | "sacrificed" | "cycled" | "discarded" | "countered" | "died" | null;
  /**
   * Spec 0061, item 4 -- the tag the card carries on its way to a graveyard,
   * in the game's words ("Cycled", "Discarded: too many cards", "Countered by
   * Counterspell"). Only with a named card; never from the battlefield
   * (spec 0066, item 6).
   */
  said?: string | null;
  /**
   * Phase 10 A-10 -- the permanent this card merged into ("card:N"): a meld
   * partner going to exile, a mutating card going to the merged zone. Only
   * with a named card.
   */
  into?: string | null;
  /**
   * Phase 10 A-14 -- where in the library a card went: "top", "bottom", or
   * "shuffled" in (its place then unknown to anyone). Only on a move into a
   * library, and only when the game knows (null: somewhere else, or an
   * older worker).
   */
  where?: "top" | "bottom" | "shuffled" | null;
}

const MOVE_WHYS = new Set(["destroyed", "sacrificed", "cycled", "discarded", "countered", "died"]);

function asMoves(value: unknown): SnapshotMove[] {
  if (!Array.isArray(value)) return [];
  const place = (v: unknown) => {
    const p = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
    return { zone: asString(p["zone"]) ?? "other", seat: asNumber(p["seat"]) };
  };
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const e = entry as Record<string, unknown>;
    const why = asString(e["why"]);
    const where = asString(e["where"]);
    return [
      {
        card: asString(e["card"]),
        from: place(e["from"]),
        to: place(e["to"]),
        why: MOVE_WHYS.has(why ?? "") ? (why as SnapshotMove["why"]) : null,
        said: asString(e["said"]),
        into: asString(e["into"]),
        where: where === "top" || where === "bottom" || where === "shuffled" ? where : null,
      },
    ];
  });
}

function asPayments(value: unknown): SnapshotPayment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const e = entry as Record<string, unknown>;
    const n = asNumber(e["n"]);
    const seat = asNumber(e["seat"]);
    const payment = asNumber(e["payment"]);
    if (n === null || seat === null || payment === null) return [];
    const mana = Array.isArray(e["mana"])
      ? e["mana"].flatMap((m): PaidMana[] => {
          if (typeof m !== "object" || m === null) return [];
          const r = m as Record<string, unknown>;
          const colour = asString(r["colour"]);
          const from = asString(r["from"]);
          if (!colour || !from) return [];
          return [{ colour, shard: asString(r["shard"]), from }];
        })
      : [];
    return [
      {
        n,
        seat,
        payment,
        for: asString(e["for"]),
        kind: asString(e["kind"]) ?? "ability",
        cost: asString(e["cost"]),
        owing: asString(e["owing"]),
        mana,
      },
    ];
  });
}

function asRolls(value: unknown): SnapshotRoll[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const e = entry as Record<string, unknown>;
    const n = asNumber(e["n"]);
    const seat = asNumber(e["seat"]);
    if (n === null || seat === null) return [];
    const results = Array.isArray(e["results"])
      ? e["results"].map((r) => asNumber(r)).filter((r): r is number => r !== null)
      : [];
    return [
      {
        n,
        seat,
        source: asString(e["source"]),
        name: asString(e["name"]),
        sides: asNumber(e["sides"]) ?? 6,
        results,
      },
    ];
  });
}

function asAbout(value: unknown): DecisionAbout | null {
  const pairs = asReasons(value);
  if (!pairs["name"]) return null;
  const count = (key: string) => {
    const n = Number(pairs[key]);
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  return {
    name: pairs["name"],
    kind: pairs["kind"] ?? "spell",
    from: pairs["from"] ?? null,
    copy: count("copy"),
    copies: count("copies"),
    // Spec 0057, items 3 and 6 -- only when the game sent them.
    ...(pairs["card"] ? { card: pairs["card"] } : {}),
    ...(pairs["act"] ? { act: pairs["act"] } : {}),
    ...(pairs["effect"] ? { effect: pairs["effect"] } : {}),
    // Spec 0061, item 5.
    ...(pairs["pay"] ? { pay: pairs["pay"] } : {}),
    ...(pairs["then"] ? { then: pairs["then"] } : {}),
  };
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
      types: asString(row["types"]),
      use: asUse(row["use"]),
    });
  }
  return options;
}

function asUse(value: unknown): OptionUse | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const kind = asString(row["kind"]);
  const title = asString(row["title"]);
  if (!kind || !title) return null;
  return { kind, title, line: asString(row["line"]), cost: asString(row["cost"]) };
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
  /** Spec 0054 — end the game because the other player is away; the server checks. */
  endForAway(): void;
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
  let over = false;

  const open = () => {
    const current = factory(url);
    socket = current;
    let dropped = false;
    current.onopen = () => {
      if (attempt > 0) logLine("connection", "game connection back");
      attempt = 0;
    };
    current.onmessage = (event) => {
      const parsed = parse(event.data);
      if (!parsed) return;
      // Spec 0067 -- the game is over: the server closes this socket next,
      // and there is nothing to come back to.
      if (parsed["type"] === "MATCH_ENDED") over = true;
      logLine("game", summarise("in", parsed)); // spec 0039
      onState((previous) => reduceMatch(previous, parsed));
    };
    current.onclose = (event) => {
      if (dropped || closedByUs) return;
      dropped = true;
      logLine("connection", `game connection closed (${event.code})`);
      // Spec 0067 -- closed after the game ended (a spectator's): no retry,
      // and nothing to report.
      if (over) {
        onState((previous) => ({ ...previous, connection: "closed" }));
        return;
      }
      // A refresh closes it on the way out: not a lost connection, and
      // the game screen says nothing (owner 2026-10-24).
      if (pageIsLeaving()) return;
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
  // Back from the browser's back/forward cache with the connection gone.
  const stopBack = onPageBack(() => {
    if (!closedByUs && socket.readyState >= 2) open();
  });

  return {
    answer(decisionId, actionId) {
      if (socket.readyState !== WebSocket.OPEN) return;
      // A null action is a PASS, and it is sent explicitly rather than by
      // omitting the field, so "I choose to do nothing" and "this message
      // lost a field" are not the same message.
      const response = { type: "DECISION_RESPONSE", decisionId, actionId };
      logLine("game", summarise("out", response)); // spec 0039
      socket.send(JSON.stringify(response));
    },
    search(decisionId, query) {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "DECISION_SEARCH", decisionId, query }));
    },
    concede() {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "CONCEDE" }));
    },
    endForAway() {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "END_FOR_AWAY" }));
    },
    close() {
      closedByUs = true;
      stopBack();
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
