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
import { countWords } from "./words";
import { withHistory, type HeldHistory } from "./history";
import { applyDelta, DeltaError, firstDifference } from "./delta";

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
  /**
   * Spec 0107 -- a "Change split" option (a blocked trampler's, at declare
   * blockers): the fight it changes. It is about no object; the board draws
   * it as its own small button under the attacker (`fight.attacker`).
   */
  fight?: DamageFight | null;
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
   * Spec 0097 -- why the game refused the answer just given, on the question
   * asked again: an attack or a block a rule forbids (said on the combat
   * button), a name the card won't take (said in red in the naming window).
   */
  refused?: string | null;
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
  /**
   * Spec 0112 -- an "each player" sacrifice (Barter in Blood): what each
   * player asked before you sacrificed, in the game's order, the cards now in
   * a graveyard. The window's first line. Empty for every other question,
   * and when they sacrificed nothing.
   */
  earlier?: DecisionEarlier[];
}

/** Spec 0112 -- one earlier player's sacrifice (see Decision.earlier). */
export interface DecisionEarlier {
  seat: number;
  /** The board's ids and names, in the order they chose. */
  cards: { id: string; name: string }[];
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
  /**
   * Spec 0107 -- on a "Change split" option: the split the game makes for
   * the player when they don't change it (lethal to each blocker in order,
   * the rest to the player); absent on a damage question.
   */
  usual?: { blockers: number[]; player: number } | null;
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
  /** Spec 0104 -- another player's hand: whose (their seat). */
  owner?: number | null;
  /**
   * Spec 0104 -- per card shown with the question but not offered (its id
   * in `looking`), the game's reason in plain words: "mana value 1", "a
   * land". Sent to the chooser only, with the question.
   */
  why?: Record<string, string> | null;
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
  /**
   * Spec 0109, item 5 -- the target is for one mode of a modal spell (a
   * charm, escalate): the short window beside the big card keeps that
   * mode's line. From the game, never from the words.
   */
  mode?: boolean;
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

/** Spec 0087 -- one player's use of a pile card. */
export interface PileUse {
  seat: number;
  how: "cast" | "ability" | "suspended";
}

export interface SnapshotCard {
  /** Typed (`card:51`), and the SAME id a decision uses (§6.47). */
  id: string;
  /**
   * Whose card it is (`seat` is who controls it, on the table): public.
   * Spec 0102 -- a restart sweeps each card into its OWNER's library.
   */
  owner?: number | undefined;
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
  /** Spec 0083 (15 A) -- a Room on the battlefield: the names of its doors still locked. */
  locked?: string[] | undefined;
  /** §6.79 -- a card of more than one face: every face's name (a Room: the whole card, then each door). */
  faces?: string[] | undefined;
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
  /** Spec 0100, item 6 -- the seat an Aura on a player (a Curse) enchants. */
  attachedToPlayer?: number | null;
  /** The Ring-bearer (the Ring's abilities are its alone). Public. */
  ringBearer: boolean;
  /**
   * Spec 0111 -- soulbond: the partner's id ("card:N"), from Forge's current
   * pair, while both are on the battlefield (each names the other). Public.
   */
  pairedWith?: string | undefined;
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
   * Spec 0087 -- in a graveyard or an exile: who may still use it from
   * there, and how ("cast": a spell or a land, by flashback, escape, an
   * adventure, foretell, plot or any "you may play it"; "ability": only an
   * ability, such as Unearth; "suspended": counting down, not playable).
   * From the game's own list; a card hidden from this viewer is listed only
   * for a public reason, and always as "cast".
   */
  uses?: PileUse[] | undefined;
  /** Spec 0087 -- in exile: foretold (public; face down to the other player). */
  foretold?: boolean | undefined;
  /** Spec 0087 -- in exile: plotted (public). */
  plotted?: boolean | undefined;
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
  /**
   * Spec 0079 -- a copy (a Clone, a token copy): public, as its copiable
   * values are. `copyOf` is the card it copied ("card:N"), only while this
   * viewer may see that card.
   */
  copy?: boolean | undefined;
  copyOf?: string | undefined;
  /**
   * Spec 0082 -- a creature that is prepared: its prepared spell ("card:N",
   * waiting face up in exile), the game's own link. Public.
   */
  prepared?: string | undefined;
  /**
   * Spec 0080 -- on the battlefield (public): phased out (still in its place,
   * treated as though it doesn't exist), its regeneration shields waiting, and
   * indestructible now.
   */
  phasedOut?: boolean | undefined;
  shields?: number | undefined;
  indestructible?: boolean | undefined;
  /** Spec 0101, row 7 -- "prevent the next N damage" waiting on it (Forge's total). */
  preventNext?: number | undefined;
  /**
   * Spec 0085 -- on the battlefield (public): the keywords it has that its
   * face does not print (Forge's titles, as `keywords`), a "can't be
   * blocked" it was given, and, on a creature, that it has lost all its
   * abilities (Humility, Turn to Frog).
   */
  gained?: string[] | undefined;
  unblockable?: boolean | undefined;
  lostAbilities?: boolean | undefined;
  /**
   * Spec 0085 (4 A) -- the exiled cards this permanent holds ("card:N", each
   * in `exile`), as the game links them: Banishing Light's, Fiend Hunter's,
   * an imprint, a Hideaway card.
   */
  holds?: string[] | undefined;
  /** Spec 0079 -- in a report window: where a card the spell aimed at is now ("in Bob's hand"). */
  toSaid?: string | undefined;
  /**
   * Spec 0103, items 1-2 -- in a report window: that card on the table
   * ("card:N"), sent only while this viewer's board shows it.
   */
  table?: string | undefined;
}

/** Spec 0103, item 5 -- a player's "this turn" counts (no mana spent: Decided 3). */
export interface ThisTurn {
  spells: number;
  lifeGained: number;
  leftBattlefield: boolean;
}

export interface SnapshotPlayer {
  seat: number;
  name: string;
  life: number;
  /** Spec 0101, row 7 -- "prevent the next N damage" waiting for this player (Forge's total). */
  preventNext?: number | undefined;
  /**
   * Spec 0102, item 2 -- another player controls this one now (Mindslaver):
   * that seat (Forge's Player#getControllingPlayer); absent otherwise.
   */
  controlledBy?: number | undefined;
  /** Spec 0102, item 2 -- the card that made it so ("card:N"), when this viewer may see it. */
  controlledFrom?: string | undefined;
  /**
   * Spec 0103, item 5 -- this turn so far, Forge's own counts: spells this
   * player cast, life it gained, whether a permanent it controlled left the
   * battlefield. Public. Absent from an older worker.
   */
  thisTurn?: ThisTurn | undefined;
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
  /**
   * Spec 0086, Amendment 1 -- the floating mana by colour and the card that
   * made it, in the pool's order (three black from Dark Ritual: one run of
   * 3); `from` absent when the game did not say or the card is now hidden.
   */
  manaFrom?: ManaRun[] | undefined;
  /** Spec 0086 -- each command-zone piece's id ("card:N"), one per `command` entry. */
  commandIds?: string[] | undefined;
}

/** Spec 0086 -- [n] floating mana of [colour] made by [from]. */
export interface ManaRun {
  colour: string;
  from?: string | undefined;
  n: number;
}

/** Spec 0086 (8) -- an emblem, with the card that made it (its tile wears that card's picture). */
export interface SnapshotEmblem {
  /** The emblem's own id, as in its owner's `commandIds`. */
  id: string;
  seat: number;
  /** The card that made it ("card:N"), absent when hidden or not known. */
  from?: string | undefined;
  /** Its maker's name (Sorin, Lord of Innistrad). */
  name?: string | undefined;
  art?: string | null | undefined;
  crop?: string | null | undefined;
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
  /**
   * Spec 0088 (Q3 C) -- the older reports this reader has not closed,
   * gathered with this one, oldest first: one-line rows at the top of the
   * same window. Each is a whole report (its own key, stamp and cards).
   */
  gathered?: SnapshotReveal[];
}

/** Spec 0075 -- one picture in a report window that is not a card. */
export type ReportMark =
  | { kind: "color"; color: "white" | "blue" | "black" | "red" | "green" }
  | { kind: "coin"; won: boolean }
  /** Spec 0086 (8) -- a dungeon completed: its map. */
  | { kind: "dungeon"; dungeon: string };

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
  /** Spec 0079 -- a copy of a spell (Fork's, storm's), and the entry it copies ("stack:N") while that is there. */
  copy?: boolean | undefined;
  copyOf?: string | undefined;
  /**
   * Spec 0082 -- the batch a copy put onto the stack was made in
   * ("copies:N": storm's four, a Resonator's one): stable while it lasts.
   */
  group?: string | undefined;
  /** Spec 0082 -- on the stack, the id this copy had on its way ("copying:N"): the same copy. */
  copyingId?: string | undefined;
  /** Spec 0082 -- a copy on its way (`copying`) whose new targets are being chosen now. */
  aiming?: boolean | undefined;
  /** Spec 0083 (18 B) -- a split-second spell (nobody may answer while it is on the stack). */
  splitSecond?: boolean | undefined;
  /**
   * Spec 0105 -- the top of the stack resting before it resolves, nobody
   * having been asked about it: the game waits `ms` from this board
   * (`arriveMs` of it allowed for the card to reach the stack on the
   * slowest screen). Presentation only (PROTO-007): absent, there is no ring.
   */
  rest?: StackRest | undefined;
  /** Spec 0083 (18 B) -- a spell that can't be countered (Abrupt Decay). */
  cantBeCountered?: boolean | undefined;
  /** Spec 0101, row 6 -- a ward trigger (Forge's keyword origin). */
  ward?: boolean | undefined;
  /** Spec 0086, Amendment 1 -- a trigger that is the monarch's or the initiative's own. */
  from?: "monarch" | "initiative" | undefined;
  /** Spec 0100, item 1 -- the X its caster paid. */
  x?: number | undefined;
  /** Spec 0100, item 2 -- every mode, as printed, the chosen ones marked. */
  modes?: SpellMode[] | undefined;
  /** Spec 0100, item 3 -- the extra costs paid ("kicked", "overloaded", "evoked", "entwined", "escalated"). */
  extra?: string[] | undefined;
  /** Spec 0100, item 3 -- multikicker: how many times. */
  kicks?: number | undefined;
  /** Spec 0100, item 3 -- an overloaded spell: the permanents it would affect now ("card:N"). */
  hits?: string[] | undefined;
  /**
   * Spec 0100, item 4 -- divided damage: each target's share, by its key
   * (the target's `object`, or "player:N"), when the caster chose the split.
   */
  shares?: Record<string, number> | undefined;
}

/** Spec 0105 -- how long the top of the stack rests (`StackEntry.rest`). */
export interface StackRest {
  ms: number;
  arriveMs: number;
}

/** Spec 0105 -- a stack entry's `rest`, when it is a whole one; anything else is no rest. */
export function asRest(value: unknown): StackRest | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const row = value as Record<string, unknown>;
  const ms = row["ms"];
  const arriveMs = row["arriveMs"];
  if (typeof ms !== "number" || typeof arriveMs !== "number" || ms <= 0) return undefined;
  return { ms, arriveMs };
}

/** Spec 0100, item 2 -- one mode of a modal spell. */
export interface SpellMode {
  text: string;
  chosen: boolean;
}

/** Spec 0100 -- the key a target's share is kept under. */
export function targetKey(t: TargetRef): string {
  return "object" in t ? t.object : `player:${t.player}`;
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
    /**
     * Spec 0080 -- damage a prevention effect stopped (Holy Day, protection
     * from a colour): its would-be amount; `amount` is then 0.
     */
    prevented?: number;
    /** Spec 0101 -- what stopped it, when a survive kind of its own: a shield counter, "prevent the next N". */
    by?: "shield" | "prevent-next";
  }[];
  /** Phase 10 A-13 -- the damage a combat damage step dealt: which step. Absent for a spell's. */
  combat?: "first-strike" | "regular";
  /** Spec 0084 -- a fight or bite spell's damage (Prey Upon, Ram Through): `fights` says who fought whom. */
  fight?: boolean;
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
  /**
   * Spec 0097, item 2 -- this viewer's own turn is being passed for them
   * (nothing they can play): the turn, and why ("2 lands, no land in hand").
   * The act button says it during that turn only. Absent otherwise.
   */
  passing?: SnapshotPassing | null;
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
  /**
   * Spec 0082 -- copies on their way onto the stack (storm's, Fork's, a
   * Strionic Resonator's), top first: each while it is asked "new target?"
   * (`aiming`) and while the game holds it until its maker has resolved.
   * Never cast, so never in `casting`. Ids "copying:N"; empty when none.
   */
  copying?: StackEntry[];
  /** §7.61 B4 — null outside combat. */
  combat: CombatState | null;
  /** §7.61 B13 — the newest damage wave, or null. */
  damage: DamageState | null;
  /** Spec 0077 -- this round's life and poison changes, or null. */
  life?: LifeChanges | null;
  /** Spec 0080 -- this round's phase changes (out: phased out; else phased in). */
  phased?: { card: string; out: boolean }[];
  /** Spec 0080 -- this round's survivors: a regeneration shield used, or a destroy an indestructible permanent shrugged off. */
  /** Spec 0089 (Q4 B) -- "umbra": an Aura's umbra armor (`by`) was destroyed instead. */
  survived?: { card: string; how: SurviveHow; by?: string }[];
  /**
   * Spec 0101, item 2 -- stack entries that left without resolving this
   * round: countered (a counterspell, Stifle, ward) or ended (Time Stop),
   * by the card whose effect did it.
   */
  left?: { stack: string; why: "countered" | "ended"; by?: string }[];
  /** Spec 0101, item 3 -- the creatures the game offers as blockers, from the attack until the blocks. */
  blockerCandidates?: string[];
  /** Spec 0084 -- the seats whose library was shuffled this round (a fetch land, a tutor). */
  shuffles?: number[];
  /** Spec 0084 -- the vehicles crewed this round, and the creatures that crewed each. */
  crewed?: { card: string; by: string[] }[];
  /** Spec 0045 -- the cards Forge last showed this viewer, or null. */
  reveal?: SnapshotReveal | null;
  /** Phase 9 Amendment 12 -- who did what, in this reader's words. */
  action?: SnapshotReveal | null;
  /**
   * Spec 0083 (17) -- permanents whose identical replacement effects just
   * applied without a question (two Leylines of the Void exiling a card):
   * the page pulses them gold, once per key.
   */
  pulse?: { key: string; cards: string[] } | null;
  /** Spec 0086 (8) -- every emblem, with the card that made it; empty when none. */
  emblems?: SnapshotEmblem[];
  /**
   * Spec 0088 (Q4 C) -- the top card of each library this viewer may see
   * (public, or theirs to look at), each with its `owner`, `public` and
   * `uses`. Absent when there is none to show.
   */
  libraryTop?: SnapshotCard[];
  /**
   * Spec 0103, item 4 -- the cards THIS viewer put on top of its own library
   * in an order it chose, top first (Brainstorm's put back, a scry kept on
   * top); sent to the owner alone, each under a stand-in id ("known:S:I").
   * Absent when nothing is known.
   */
  knownTop?: SnapshotCard[];
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

/** Fixed while building spec 0102 -- the boards kept for carry.ts (a hold is never longer). */
const RECENT_KEPT = 50;

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
   * Fixed while building spec 0102 (carry.ts) -- the last boards this seat
   * was sent, in order: one never drawn (skipped while another was held)
   * gives its one-time moments to the board that is drawn.
   */
  recent?: Snapshot[];
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
  /**
   * P11-D3 -- the history lists (payments, rolls, notices) as the board this
   * page last took had them: a board sends only the entries the page lacks.
   */
  history?: HeldHistory;
  /**
   * P11-D4 -- the BASE: the last whole board this page took, as sent (after
   * the history is rebuilt, before `asSnapshot`). A MATCH_DELTA builds on it.
   * Kept apart from `board`: MATCH_STEP moves the board shown, never this.
   */
  base?: Record<string, unknown> | null;
  /**
   * P11-D4 -- a delta did not fit (it builds on a board this page does not
   * have): the page has asked for a full board and drops deltas until one
   * comes. The table stays as it is meanwhile (owner decision 3: nothing shown).
   */
  resync?: boolean;
  /**
   * P11-D6 (spec 0119) -- boards that came late (a stall) or were sent again
   * on a resume (MATCH_CATCHUP), not yet drawn: the screen replays them or
   * jumps to now (battlefield/catchUp.ts). `board` is the newest meanwhile.
   */
  catchUp?: CatchUp | null;
  /**
   * P11-D6 (spec 0119; owner answer 4) -- nothing heard on an open
   * connection for SILENCE_MS: the screen says "Reconnecting to the game…"
   * after its usual settle (about 6.5 s in all).
   */
  stalled?: boolean;
}

/** P11-D6 (spec 0119) -- what the page is catching up on (match.ts `arrive`, catchUp.ts). */
export interface CatchUp {
  /** The boards not yet drawn, oldest first. */
  boards: Snapshot[];
  /** Updates (boards and steps) still to come from a MATCH_CATCHUP. */
  missed: number;
  /** Every update queued so far (boards and steps): the limit counts them. */
  updates: number;
  /** The last play log line's number when the table stopped: the away window lists the ones after it. */
  logFrom: number;
  /** The board on the table when it stopped. */
  from: Snapshot | null;
  /** No replay: the page was sent today's whole board on its return (not among the kept ones). */
  jump?: boolean;
  /**
   * The table just went straight to now (past the limit): until this time
   * (ms), late boards still arriving from the same stall go straight to now
   * too, and the away window grows, rather than starting a replay of their own.
   */
  tail?: number;
}

/** P11-D6 -- how long after a jump the rest of the same stall's late boards follow it. */
export const CATCH_UP_TAIL_MS = 3_000;

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
 * A whole board in (a MATCH_SNAPSHOT's, or one a MATCH_DELTA rebuilt), as
 * the worker made it: the play log merged, then the board taken unless it is
 * older than the one shown. P11-D4: it becomes the base too.
 */
function takeBoard(state: MatchState, raw: unknown, history: HeldHistory): MatchState {
  // Spec 0064 -- the play log first: a stale board (a reconnect's stored
  // one) still brings the log's history, which the page keeps by number.
  const lines = asPlayLog(
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>)["playLog"] : null,
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
  return {
    ...state,
    board,
    history,
    base: raw as Record<string, unknown>,
    spotlight: fresh ? board : state.spotlight,
    recent: [...(state.recent ?? []).slice(-(RECENT_KEPT - 1)), board],
  };
}

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
        stalled: false,
        // P11-D6 -- a new connection: nothing more comes from the last one's catch-up.
        ...(state.catchUp ? { catchUp: { ...state.catchUp, missed: 0 } } : {}),
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
      // P11-D3 -- the history lists come once: the whole board first, from
      // the lists this page holds (history.ts), so everything below reads
      // the board the worker made.
      const whole = withHistory(state.history, message["state"]);
      // P11-D4 -- a full board is taken at any time, and ends a wait for one.
      return takeBoard(
        state.resync ? { ...state, resync: false } : state,
        whole.state,
        whole.history,
      );
    }

    // P11-D4 -- only what changed since the board this page was last sent.
    case "MATCH_DELTA": {
      // Waiting for a full board: deltas are dropped until it comes.
      if (state.resync) return state;
      const base = state.base;
      if (
        !base ||
        base["gameEpoch"] !== message["gameEpoch"] ||
        base["stateRevision"] !== message["from"]
      ) {
        // Builds on a board this page does not have: ask (connectMatch sends MATCH_RESYNC).
        return { ...state, resync: true };
      }
      let rebuilt: Record<string, unknown>;
      try {
        rebuilt = applyDelta(base, message);
      } catch (error) {
        if (error instanceof DeltaError) return { ...state, resync: true };
        throw error;
      }
      const whole = withHistory(state.history, rebuilt);
      // TEST ONLY (PROXIC_TEST_DELTA_CHECK): the server sent the full board
      // too. Compared, and a difference logged -- the REBUILT board is drawn.
      if ("whole" in message) {
        const at = firstDifference(whole.state, message["whole"]);
        if (at !== null)
          console.error(`DELTA_MISMATCH at ${at} (revision ${String(message["to"])})`);
      }
      return takeBoard(state, whole.state, whole.history);
    }

    // P11-D6 (spec 0119) -- a resume: the next `count` updates are the ones missed.
    case "MATCH_CATCHUP": {
      const count = asNumber(message["count"]);
      if (count === null || count <= 0) return state;
      const now = state.catchUp ?? beginCatchUp(state);
      return { ...state, catchUp: { ...now, missed: now.missed + count } };
    }

    // P11-D6 (spec 0119) -- a quiet line's beat: the board this connection
    // was sent last. A page holding an older one (a board lost on the way)
    // asks for the whole board (D4's way back); otherwise nothing.
    case "MATCH_BEAT": {
      const base = state.base;
      const epoch = message["gameEpoch"];
      const rev = message["stateRevision"];
      if (state.resync || !base || typeof epoch !== "number" || typeof rev !== "number")
        return state;
      const held = [Number(base["gameEpoch"]), Number(base["stateRevision"])] as const;
      const ahead = epoch > held[0] || (epoch === held[0] && rev > held[1]);
      return ahead ? { ...state, resync: true } : state;
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

/** P11-D6 (spec 0119) -- a catch-up starting now: from the board on the table and the log as it is. */
function beginCatchUp(state: MatchState): CatchUp {
  const log = state.playLog ?? [];
  return {
    boards: [],
    missed: 0,
    updates: 0,
    logFrom: log.length > 0 ? log[log.length - 1]!.n : 0,
    from: state.board,
  };
}

/**
 * P11-D6 (spec 0119) -- how a message arrived: [late] (a board well behind
 * the line's usual: a stall on an open connection) or [jump] (the whole
 * board a returning page is sent when its own was not kept).
 */
export interface Arrival {
  late?: boolean;
  jump?: boolean;
}

/**
 * Apply one server message as it arrived (connectMatch): reduceMatch, then,
 * P11-D6 (spec 0119), a board that came late, or was missed, or any board
 * while a catch-up is under way, joins the catch-up queue for the screen to
 * replay (battlefield/catchUp.ts). Every message is still reduced in order,
 * so `board` is always the newest.
 */
export function arrive(
  state: MatchState,
  message: Record<string, unknown>,
  how: Arrival = {},
): MatchState {
  const next = reduceMatch(state, message);
  const type = message["type"];
  const queued = next.catchUp ?? null;
  if (type === "MATCH_SNAPSHOT" || type === "MATCH_DELTA") {
    // Not taken (an older board, a delta that did not fit): nothing to draw.
    if (!next.board || next.board === state.board) return next;
    const active = queued !== null && queued.boards.length + queued.missed > 0;
    const tail = queued?.tail !== undefined && Date.now() < queued.tail ? queued : null;
    // Live again: a jump's tail is over.
    if (!active && !how.late && !how.jump) return queued?.tail ? { ...next, catchUp: null } : next;
    const now = active ? queued : (tail ?? beginCatchUp(state));
    return {
      ...next,
      catchUp: {
        ...now,
        boards: [...now.boards, next.board],
        missed: Math.max(0, now.missed - 1),
        updates: now.updates + 1,
        ...(how.jump || tail ? { jump: true } : {}),
      },
    };
  }
  if (type === "MATCH_STEP" && queued && queued.missed > 0)
    return {
      ...next,
      catchUp: { ...queued, missed: queued.missed - 1, updates: queued.updates + 1 },
    };
  return next;
}

/**
 * P11-D6 (spec 0119) -- the screen drew or passed the first [count] queued
 * boards: they leave the queue; a queue with nothing left or to come is over.
 */
export function settleCatchUp(state: MatchState, count: number, jumped = false): MatchState {
  const queued = state.catchUp;
  if (!queued) return state;
  const boards = queued.boards.slice(count);
  if (boards.length === 0 && queued.missed === 0) {
    // After a jump, the same stall's late boards still on their way follow it (CATCH_UP_TAIL_MS).
    return jumped
      ? {
          ...state,
          catchUp: {
            ...queued,
            boards: [],
            updates: 0,
            from: state.board,
            tail: Date.now() + CATCH_UP_TAIL_MS,
          },
        }
      : { ...state, catchUp: null };
  }
  return {
    ...state,
    catchUp: {
      ...queued,
      boards,
      from: queued.boards[count - 1] ?? queued.from,
      updates: boards.length,
    },
  };
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
      return `${name} is back, or hasn't been gone ${countWords(awayMinutes, "minute")} yet.`;
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
    passing: asPassing(row["passing"]),
    battlefield: keptCards(row["battlefield"]),
    rolls: asRolls(row["rolls"]),
    payments: asPayments(row["payments"]),
    moves: asMoves(row["moves"]),
    hand: keptCards(row["hand"]),
    otherHands: keptCards(row["otherHands"]),
    casting: asCards(row["casting"]),
    graveyard: keptCards(row["graveyard"]),
    exile: keptCards(row["exile"]),
    stack: asStack(row["stack"]),
    copying: asStack(row["copying"]),
    combat: asCombat(row["combat"]),
    damage: asDamage(row["damage"]),
    life: asLife(row["life"]),
    phased: asPhased(row["phased"]),
    survived: asSurvived(row["survived"]),
    left: asLeft(row["left"]),
    blockerCandidates: Array.isArray(row["blockerCandidates"])
      ? (row["blockerCandidates"] as unknown[]).flatMap((v) => (typeof v === "string" ? [v] : []))
      : [],
    shuffles: asSeats(row["shuffles"]),
    crewed: asCrewed(row["crewed"]),
    reveal: asReveal(row["reveal"]),
    action: asAction(row["action"]),
    pulse: asPulse(row["pulse"]),
    emblems: asEmblems(row["emblems"]),
    libraryTop: asCards(row["libraryTop"]),
    knownTop: asCards(row["knownTop"]),
  };
}

/** Spec 0083 (17) -- the permanents to pulse gold, once per key; null when absent or malformed. */
function asPulse(value: unknown): { key: string; cards: string[] } | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const key = asString(row["key"]);
  const cards = Array.isArray(row["cards"]) ? onlyStrings(row["cards"]) : [];
  return key && cards.length > 0 ? { key, cards } : null;
}

/** The strings of a list, in order. */
function onlyStrings(value: unknown[]): string[] {
  return value.filter((entry): entry is string => typeof entry === "string");
}

/** Spec 0080 -- the round's phase changes, keeping only well-formed ones. */
function asPhased(value: unknown): { card: string; out: boolean }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const e = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
    const card = asString(e["card"]);
    return card && typeof e["out"] === "boolean" ? [{ card, out: e["out"] }] : [];
  });
}

/** Spec 0080, 0089, 0101 -- how a card survived: Forge's own way. */
export type SurviveHow = "regenerated" | "indestructible" | "umbra" | "shield";

/** Spec 0101, item 2 -- the round's entries that left without resolving, well-formed ones only. */
function asLeft(value: unknown): { stack: string; why: "countered" | "ended"; by?: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const e = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
    const stack = asString(e["stack"]);
    const why = e["why"];
    const by = asString(e["by"]);
    return stack && (why === "countered" || why === "ended")
      ? [{ stack, why, ...(by ? { by } : {}) }]
      : [];
  });
}

/** Spec 0080 -- the round's survivors, keeping only well-formed ones. */
type Survivor = { card: string; how: SurviveHow; by?: string };

function asSurvived(value: unknown): Survivor[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): Survivor[] => {
    const e = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
    const card = asString(e["card"]);
    const how = e["how"];
    if (card && how === "umbra") {
      const by = asString(e["by"]);
      return [{ card, how, ...(by ? { by } : {}) }];
    }
    return card && (how === "regenerated" || how === "indestructible" || how === "shield")
      ? [{ card, how }]
      : [];
  });
}

/** Spec 0084 -- seat numbers, keeping only numbers. */
function asSeats(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => (typeof v === "number" ? [v] : []));
}

/** Spec 0084 -- each vehicle crewed this round, and what crewed it. */
function asCrewed(value: unknown): { card: string; by: string[] }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const e = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
    const card = asString(e["card"]);
    const by = (Array.isArray(e["by"]) ? (e["by"] as unknown[]) : []).flatMap((b) => {
      const id = asString(b);
      return id ? [id] : [];
    });
    return card ? [{ card, by }] : [];
  });
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
function asAction(value: unknown, nested = false): SnapshotReveal | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const key = asString(row["key"]);
  const said = asString(row["said"]);
  if (!key || !said) return null;
  const marks = asMarks(row["marks"]);
  // Spec 0088 (Q3 C) -- the older reports gathered with it, one level deep.
  const gathered =
    !nested && Array.isArray(row["gathered"])
      ? (row["gathered"] as unknown[]).flatMap((one) => {
          const r = asAction(one, true);
          return r ? [r] : [];
        })
      : [];
  return {
    key,
    title: said,
    said,
    cards: asCards(row["cards"]),
    stamp: asNumber(row["stamp"]) ?? 0,
    by: asNumber(row["by"]) ?? 0,
    source: asString(row["source"]) ?? "",
    ...(marks.length ? { marks } : {}),
    ...(gathered.length ? { gathered } : {}),
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
    const dungeon = asString(row["dungeon"]);
    if (row["kind"] === "dungeon" && dungeon) out.push({ kind: "dungeon", dungeon });
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

/** Spec 0103, item 5 -- {spells, lifeGained, leftBattlefield}, or undefined when absent or malformed. */
function asThisTurn(value: unknown): ThisTurn | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const row = value as Record<string, unknown>;
  const spells = asNumber(row["spells"]);
  const lifeGained = asNumber(row["lifeGained"]);
  if (spells === null || lifeGained === null) return undefined;
  return { spells, lifeGained, leftBattlefield: row["leftBattlefield"] === true };
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
      preventNext:
        (asNumber(row["preventNext"]) ?? 0) > 0 ? asNumber(row["preventNext"])! : undefined,
      controlledBy: asNumber(row["controlledBy"]) ?? undefined,
      controlledFrom: asString(row["controlledFrom"]) ?? undefined,
      thisTurn: asThisTurn(row["thisTurn"]),
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
      manaFrom: asManaFrom(row["manaFrom"]),
      commandIds: Array.isArray(row["commandIds"]) ? onlyStrings(row["commandIds"]) : undefined,
    });
  }
  return players;
}

/** Spec 0086 -- the pool's runs, keeping only well-formed ones. */
function asManaFrom(value: unknown): ManaRun[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((entry) => {
    const e = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
    const colour = asString(e["colour"]);
    const n = asNumber(e["n"]);
    if (!colour || n === null || n <= 0) return [];
    const from = asString(e["from"]);
    return [{ colour, n, ...(from ? { from } : {}) }];
  });
}

/** Spec 0086 -- the emblems, keeping only well-formed ones. */
function asEmblems(value: unknown): SnapshotEmblem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const e = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
    const id = asString(e["id"]);
    const seat = asNumber(e["seat"]);
    if (!id || seat === null) return [];
    return [
      {
        id,
        seat,
        from: asString(e["from"]) ?? undefined,
        name: asString(e["name"]) ?? undefined,
        art: asHash(e["art"]),
        crop: asHash(e["crop"]),
      },
    ];
  });
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
    const card = asCard(entry as Record<string, unknown>);
    if (card) cards.push(card);
  }
  return cards;
}

/**
 * P11-C2 (2026-11-25) -- each card row the page has read once, as it read it.
 * A MATCH_DELTA's rebuild keeps every card nothing happened to as the base's
 * own row object (`delta.ts` `applyDelta`), and a row is never changed after
 * it arrives, so the card read from it last time is the card it is now: the
 * same object, from the socket onward (fromSnapshot's `keptBoardCard` and
 * GameScreen's `keepCards` then see it at a glance). A whole board brings new
 * rows, which are read afresh.
 */
const readRows = new WeakMap<object, SnapshotCard | null>();

/**
 * The table, the hands, the graveyards and exile (the lists that grow with
 * the table), each card kept by its row (above). The small lists (`casting`,
 * the library's top, the reports' cards) are read afresh every board, as
 * before: hooks on the page key on the casting card's object (GameScreen's
 * `lastCasting`).
 */
export function keptCards(value: unknown): SnapshotCard[] {
  if (!Array.isArray(value)) return [];
  const cards: SnapshotCard[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== "object" || entry === null) continue;
    let card = readRows.get(entry);
    if (card === undefined) {
      card = asCard(entry as Record<string, unknown>);
      readRows.set(entry, card);
    }
    if (card) cards.push(card);
  }
  return cards;
}

/** One card row as the page reads it, or null when it is not one (no id or seat). */
function asCard(row: Record<string, unknown>): SnapshotCard | null {
  const id = asString(row["id"]);
  const seat = asNumber(row["seat"]);
  if (!id || seat === null) return null;
  return {
    id,
    seat,
    owner: asNumber(row["owner"]) ?? undefined,
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
    attachedToPlayer: asNumber(row["attachedToPlayer"]),
    ringBearer: row["ringBearer"] === true,
    pairedWith: asString(row["pairedWith"]) ?? undefined,
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
    uses: asUses(row["uses"]),
    foretold: row["foretold"] === true ? true : undefined,
    plotted: row["plotted"] === true ? true : undefined,
    costNow: asString(row["costNow"]) ?? undefined,
    costWhy: asString(row["costWhy"]) ?? undefined,
    merged: asMerged(row["merged"]),
    seen: row["seen"] === true ? true : undefined,
    copy: row["copy"] === true ? true : undefined,
    copyOf: asString(row["copyOf"]) ?? undefined,
    prepared: asString(row["prepared"]) ?? undefined,
    toSaid: asString(row["toSaid"]) ?? undefined,
    table: /^card:\d+$/.test(asString(row["table"]) ?? "") ? asString(row["table"])! : undefined,
    phasedOut: row["phasedOut"] === true ? true : undefined,
    shields: (asNumber(row["shields"]) ?? 0) > 0 ? asNumber(row["shields"])! : undefined,
    indestructible: row["indestructible"] === true ? true : undefined,
    preventNext:
      (asNumber(row["preventNext"]) ?? 0) > 0 ? asNumber(row["preventNext"])! : undefined,
    // Spec 0085 -- gained keywords, given "can't be blocked", lost abilities, held cards.
    gained: Array.isArray(row["gained"]) ? onlyStrings(row["gained"]) : undefined,
    unblockable: row["unblockable"] === true ? true : undefined,
    lostAbilities: row["lostAbilities"] === true ? true : undefined,
    holds: Array.isArray(row["holds"])
      ? onlyStrings(row["holds"]).filter((id) => /^card:\d+$/.test(id))
      : undefined,
    // Spec 0083 (15 A) -- a Room: its faces, and its doors still locked.
    faces: Array.isArray(row["faces"]) ? onlyStrings(row["faces"]) : undefined,
    locked: Array.isArray(row["locked"]) ? onlyStrings(row["locked"]) : undefined,
  };
}

/** Spec 0058, item 8 -- a mutated creature's cards; undefined for anything else. */
/** Spec 0087 -- a pile card's uses: a seat and a known kind each, or nothing. */
function asUses(value: unknown): PileUse[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: PileUse[] = [];
  for (const one of value as unknown[]) {
    if (!one || typeof one !== "object") continue;
    const row = one as Record<string, unknown>;
    const seat = asNumber(row["seat"]);
    const how = row["how"];
    if (seat === null || (how !== "cast" && how !== "ability" && how !== "suspended")) continue;
    out.push({ seat, how });
  }
  return out.length > 0 ? out : undefined;
}

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

/** Spec 0100 -- a stack entry's x, modes, extra, kicks, hits and per-target shares. */
function spellChoices(row: Record<string, unknown>): Partial<StackEntry> {
  const out: Partial<StackEntry> = {};
  const x = asNumber(row["x"]);
  if (x !== null) out.x = x;
  if (Array.isArray(row["modes"])) {
    const modes = row["modes"].flatMap((m) => {
      if (typeof m !== "object" || m === null) return [];
      const r = m as Record<string, unknown>;
      const text = asString(r["text"]);
      return text ? [{ text, chosen: r["chosen"] === true }] : [];
    });
    if (modes.length > 0) out.modes = modes;
  }
  const extra = asNotices(row["extra"]);
  if (extra.length > 0) out.extra = extra;
  const kicks = asNumber(row["kicks"]);
  if (kicks !== null && kicks > 0) out.kicks = kicks;
  const hits = asNotices(row["hits"]).filter((id) => id.startsWith("card:"));
  if (hits.length > 0) out.hits = hits;
  if (Array.isArray(row["targets"])) {
    const shares: Record<string, number> = {};
    for (const t of row["targets"] as unknown[]) {
      const ref = asTarget(t);
      const amount =
        typeof t === "object" && t !== null
          ? asNumber((t as Record<string, unknown>)["amount"])
          : null;
      if (ref && amount !== null) shares[targetKey(ref)] = amount;
    }
    if (Object.keys(shares).length > 0) out.shares = shares;
  }
  return out;
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
        ...(typeof h["prevented"] === "number" && h["prevented"] > 0
          ? { prevented: h["prevented"] }
          : {}),
        ...(h["by"] === "shield" || h["by"] === "prevent-next" ? { by: h["by"] } : {}),
      });
  }
  const step = row["combat"];
  const spellFight = row["fight"] === true;
  if (step !== "first-strike" && step !== "regular" && !spellFight) return { key, hits };
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
  if (step !== "first-strike" && step !== "regular") return { key, hits, fight: true, fights };
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
      copy: row["copy"] === true ? true : undefined,
      copyOf: asString(row["copyOf"]) ?? undefined,
      group: asString(row["group"]) ?? undefined,
      copyingId: asString(row["copyingId"]) ?? undefined,
      aiming: row["aiming"] === true ? true : undefined,
      // Spec 0083 (18 B) -- what the spell is.
      splitSecond: row["splitSecond"] === true ? true : undefined,
      cantBeCountered: row["cantBeCountered"] === true ? true : undefined,
      ward: row["ward"] === true ? true : undefined,
      // Spec 0105 -- resting before it resolves.
      rest: asRest(row["rest"]),
      // Spec 0086, Amendment 1 -- the monarch's or the initiative's own trigger.
      from: row["from"] === "monarch" || row["from"] === "initiative" ? row["from"] : undefined,
      targets: Array.isArray(row["targets"])
        ? (row["targets"] as unknown[]).map(asTarget).filter((t): t is TargetRef => t !== null)
        : [],
      // Spec 0100 -- what its caster chose; all optional (an older worker sends none).
      ...spellChoices(row),
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
    refused: asString(message["refused"]),
    about: asAbout(message["about"]),
    looking: asCards(message["looking"]),
    arrange: asArrange(message["arrange"]),
    window: message["window"] === true,
    picking: asPicking(message["picking"]),
    earlier: asEarlier(message["earlier"]),
  };
}

/** Spec 0112 -- a row without its seat, or a card without its id, is dropped; a row of none too. */
function asEarlier(value: unknown): DecisionEarlier[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (typeof row !== "object" || row === null) return [];
    const r = row as Record<string, unknown>;
    const seat = asNumber(r["seat"]);
    const cards = Array.isArray(r["cards"])
      ? r["cards"].flatMap((one) => {
          if (typeof one !== "object" || one === null) return [];
          const c = one as Record<string, unknown>;
          const id = asString(c["id"]);
          return id ? [{ id, name: asString(c["name"]) ?? "" }] : [];
        })
      : [];
    return seat !== null && cards.length > 0 ? [{ seat, cards }] : [];
  });
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
  const usual = v["usual"];
  const split =
    typeof usual === "object" && usual !== null && !Array.isArray(usual)
      ? (usual as Record<string, unknown>)
      : null;
  return {
    damage,
    attacker: asString(v["attacker"]),
    blockers,
    trample: v["trample"] === true,
    divides: v["divides"] === true,
    ...(split
      ? {
          usual: { blockers: asNumbers(split["blockers"]), player: asNumber(split["player"]) ?? 0 },
        }
      : {}),
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
    ...(v["mode"] === true ? { mode: true } : {}),
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

/** Spec 0104 -- `arrange.why`: card id to the game's words, strings only. */
function asWhy(value: unknown): Record<string, string> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [id, words] of Object.entries(value as Record<string, unknown>)) {
    if (typeof words === "string") out[id] = words;
  }
  return Object.keys(out).length > 0 ? out : null;
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
    owner: asNumber(v["owner"]),
    why: asWhy(v["why"]),
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
  why:
    | "destroyed"
    | "sacrificed"
    | "cycled"
    | "discarded"
    | "countered"
    | "died"
    /** Spec 0079 -- a spell that did nothing: its targets were gone. */
    | "fizzled"
    /** Spec 0080 -- exiled and returned in one go (Ephemerate): battlefield to battlefield, `via` its exile. */
    | "flickered"
    | null;
  /** Spec 0080 -- a flicker's exile, on its way back: whose. */
  via?: { zone: string; seat: number | null } | null;
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
  /**
   * Spec 0078, item 4 -- a creature leaving the battlefield: its power and
   * toughness as it last stood there (Grasp of Darkness on a 4/4: 0/0).
   * Only with a named card.
   */
  last?: { power: number; toughness: number } | null;
  /**
   * Spec 0084 -- sacrificed as a cost, by its own ability or a Saga's end
   * (a Treasure, a fetch land, a Clue): used up, not killed. Only with a
   * named card.
   */
  spent?: boolean;
}

const MOVE_WHYS = new Set([
  "destroyed",
  "sacrificed",
  "cycled",
  "discarded",
  "countered",
  "died",
  "fizzled",
  "flickered",
]);

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
        into: asString(e["into"]),
        where: where === "top" || where === "bottom" || where === "shuffled" ? where : null,
        last: asLast(e["last"]),
        via: e["via"] ? place(e["via"]) : null,
        ...(e["spent"] === true ? { spent: true } : {}),
      },
    ];
  });
}

/** Spec 0078 -- a move's last size; anything malformed is none. */
function asLast(value: unknown): { power: number; toughness: number } | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const power = asNumber(row["power"]);
  const toughness = asNumber(row["toughness"]);
  return power === null || toughness === null ? null : { power, toughness };
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

/** Spec 0097, item 2 -- see Snapshot.passing. */
export interface SnapshotPassing {
  turn: number;
  why: string;
}

function asPassing(value: unknown): SnapshotPassing | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const turn = asNumber(row["turn"]);
  const why = asString(row["why"]);
  return turn === null || why === null ? null : { turn, why };
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
      fight: asFight(row["fight"]),
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

/**
 * P11-D4 -- how long the page waits for the full board it asked for
 * (MATCH_RESYNC) before closing the socket; the reconnect then brings one.
 */
export const MATCH_RESYNC_WAIT_MS = 3_000;

/**
 * P11-D6 (spec 0119) -- a board this much later than the line's usual (its
 * `sentAt` against its arrival, less the connection's smallest gap) is late:
 * the page fell behind, and it is caught up rather than drawn at once.
 */
export const LATE_MS = 1_500;

/**
 * P11-D6 (spec 0119; owner answer 4) -- nothing heard on an open connection
 * for this long: the page says it is reconnecting (after the notice's own
 * 1.5 s settle: about 6.5 s). The server's beat (MATCH_BEAT, every 2 s of
 * quiet) keeps a healthy quiet line from ever reaching it.
 */
export const SILENCE_MS = 5_000;
/** P11-D6 -- and for this long: the page closes the connection and comes back with `resume`. */
export const SILENCE_CLOSE_MS = 10_000;
/** P11-D6 -- how often the silence is looked at. */
export const SILENCE_LOOK_MS = 1_000;
/**
 * P11-D6 (decision 7, P11-E13) -- a look that runs this much later than
 * asked judges nothing and starts again: a hidden tab's timers run once a
 * minute and a frozen tab's not at all, while its messages still arrive.
 */
export const SILENCE_LATE_MS = 2_000;

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
  /**
   * Spec 0088 (Q3 C) — the report window was closed, showing reports up to
   * the stamp [upTo]: they are gone from this seat's next boards. Whose
   * window it was is the session's.
   */
  reportsClosed(upTo: number): void;
  /**
   * P11-D6 (spec 0119) -- the table is live again after a catch-up (CAUGHT_UP).
   * Nothing else is said; the server only notes it (spec 0120 reads it).
   */
  caughtUp(): void;
  close(): void;
}

/** P11-D6 (spec 0119) -- [url] with the board the page holds, for the server to resume from. */
export function resumeUrl(url: string, base: Record<string, unknown> | null | undefined): string {
  const epoch = base?.["gameEpoch"];
  const rev = base?.["stateRevision"];
  if (typeof epoch !== "number" || typeof rev !== "number") return url;
  return `${url}${url.includes("?") ? "&" : "?"}resume=${epoch}.${rev}`;
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
  // P11-D6 (spec 0119) -- the board this page holds (its delta base), for a resume.
  let held: Record<string, unknown> | null = null;
  let opened = 0;

  const open = () => {
    // P11-D6 -- a fresh page asks for nothing (a refresh starts fresh: owner
    // answer 5); a page coming back says which board it holds.
    const current = factory(opened > 0 ? resumeUrl(url, held) : url);
    const resuming = opened > 0 && held !== null;
    opened += 1;
    socket = current;
    let dropped = false;
    // P11-D6 -- this connection's smallest gap between a message's sentAt and
    // its arrival (the clocks' difference and the line's usual delay).
    let skew: number | null = null;
    // P11-D6 -- the updates of a MATCH_CATCHUP still to come (their sentAt is old: not late).
    let catchingUp = 0;
    // P11-D6 -- a resumed connection that has not yet said what it needs.
    let unsure = resuming;
    let caughtUpSent = false;
    const sayCaughtUp = () => {
      if (caughtUpSent || current.readyState !== WebSocket.OPEN) return;
      caughtUpSent = true;
      current.send(JSON.stringify({ type: "CAUGHT_UP" }));
    };
    // P11-D6 -- the silence check (owner answer 4; decision 7's late rule).
    let heard = Date.now();
    let looked = Date.now();
    let stalled = false;
    // Only once this server has been heard beating (MATCH_BEAT): an older
    // server, and a spectator's connection (no beat), are never judged silent.
    let beating = false;
    const silence = setInterval(() => {
      const now = Date.now();
      const late = now - looked > SILENCE_LOOK_MS + SILENCE_LATE_MS;
      looked = now;
      if (late) {
        // A hidden or frozen tab's timer: it judges nothing, and starts again.
        heard = now;
        return;
      }
      if (!beating || current.readyState !== WebSocket.OPEN || closedByUs) return;
      const quiet = now - heard;
      if (quiet >= SILENCE_CLOSE_MS) {
        logLine("connection", "game connection silent: reconnecting");
        current.close(4001, "silent");
        lost(4001);
      } else if (quiet >= SILENCE_MS && !stalled) {
        stalled = true;
        onState((previous) => ({ ...previous, stalled: true }));
      }
    }, SILENCE_LOOK_MS);
    current.addEventListener?.("close", () => clearInterval(silence));
    // P11-D4 -- this socket asked for a full board; the timer that closes it
    // (the reconnect then brings one) if none has come in time.
    let resyncAsked = false;
    let resyncTimer: ReturnType<typeof setTimeout> | null = null;
    const askForBoard = (base: Record<string, unknown> | null | undefined) => {
      if (resyncAsked || current.readyState !== WebSocket.OPEN) return;
      resyncAsked = true;
      const have =
        base && typeof base["gameEpoch"] === "number" && typeof base["stateRevision"] === "number"
          ? { gameEpoch: base["gameEpoch"], stateRevision: base["stateRevision"] }
          : undefined;
      logLine("game", "asked for the whole table again");
      current.send(JSON.stringify({ type: "MATCH_RESYNC", ...(have ? { have } : {}) }));
      resyncTimer = setTimeout(() => {
        resyncTimer = null;
        if (resyncAsked && !closedByUs) current.close(4000, "no full board");
      }, MATCH_RESYNC_WAIT_MS);
    };
    current.onopen = () => {
      if (attempt > 0) logLine("connection", "game connection back");
      attempt = 0;
    };
    current.onmessage = (event) => {
      // P11-D6 -- a connection given up as silent says nothing more.
      if (dropped) return;
      heard = Date.now();
      if (stalled) {
        stalled = false;
        onState((previous) => ({ ...previous, stalled: false }));
      }
      const parsed = parse(event.data);
      if (!parsed) return;
      const type = parsed["type"];
      if (type === "MATCH_BEAT") beating = true;
      // P11-D6 (spec 0119) -- late, missed, or the whole board after a resume.
      const how: Arrival = {};
      const isBoard = type === "MATCH_SNAPSHOT" || type === "MATCH_DELTA";
      if (type === "MATCH_CATCHUP") {
        unsure = false;
        catchingUp = Math.max(0, Number(parsed["count"]) || 0);
      } else if (isBoard || type === "MATCH_STEP") {
        if (catchingUp > 0) catchingUp -= 1;
        else if (typeof parsed["sentAt"] === "number") {
          const gap = Date.now() - parsed["sentAt"];
          skew = skew === null ? gap : Math.min(skew, gap);
          if (isBoard && gap - skew > LATE_MS) how.late = true;
        }
        if (unsure && isBoard) how.jump = true;
        unsure = false;
      } else if (unsure && type !== "MATCH_HELLO" && type !== "WATCHING") {
        // Back, and holding the newest board already: live at once.
        unsure = false;
        sayCaughtUp();
      }
      // Spec 0067 -- the game is over: the server closes this socket next,
      // and there is nothing to come back to.
      if (parsed["type"] === "MATCH_ENDED") over = true;
      // P11-D4 -- a full board answers a request for one.
      if (parsed["type"] === "MATCH_SNAPSHOT" && resyncAsked) {
        resyncAsked = false;
        if (resyncTimer !== null) clearTimeout(resyncTimer);
        resyncTimer = null;
      }
      logLine("game", summarise("in", parsed)); // spec 0039
      onState((previous) => {
        const next = arrive(previous, parsed, how);
        // P11-D4 -- a delta that does not fit: ask once for the whole board.
        if (next.resync && !previous.resync) askForBoard(previous.base);
        held = next.base ?? held;
        return next;
      });
      // A resumed page sent today's whole board: it is drawn at once (no replay).
      if (how.jump) sayCaughtUp();
    };
    // P11-D6 -- the connection is gone: closed by either side, or given up
    // as silent (a browser may wait a long time for a frozen line's close).
    const lost = (code: number) => {
      clearInterval(silence);
      if (resyncTimer !== null) clearTimeout(resyncTimer);
      resyncTimer = null;
      if (dropped || closedByUs) return;
      dropped = true;
      logLine("connection", `game connection closed (${code})`);
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
      if (code === 1008) {
        onState((previous) => ({ ...previous, connection: "closed" }));
        return;
      }
      onState((previous) => ({
        ...previous,
        connection: "reconnecting",
        stalled: false,
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
    current.onclose = (event) => lost(event.code);
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
    reportsClosed(upTo) {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "REPORTS_CLOSED", upTo }));
    },
    caughtUp() {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "CAUGHT_UP" }));
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
