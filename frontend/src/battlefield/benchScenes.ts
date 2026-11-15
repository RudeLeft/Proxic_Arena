// Spec 0090 (F-0090-A) -- the speed test's Phase 10 moments, for /dev/bench
// (?scene=<name>). Each scene is a board drawn first, then the boards the
// game would send for the moment, each at its time; the page records frame
// times over `ms` (the moment's length, with a margin) and the benchmark
// spec holds them to a budget (BUDGETS, below).
//
// Synthetic, like the rest of /dev/bench: nothing here is a game and
// nothing reaches the server. The boards are drawn by the real Board; the
// storm's are made by the page's own parser (fromSnapshot) from the shapes
// the worker sends, as in a game.

import { EMPTY_MATCH, reduceMatch, type SnapshotReveal } from "../match";
import type { AnchorId } from "./motion";
import { MOVE_MS, SWEEP_MS, fateMs } from "./motion";
import { FIGHTS_MAX_MS } from "./fights";
import { TOKEN_AFTER_MS, TOKEN_MS, tokenStart } from "./piles";
import { boardFromSnapshot } from "./fromSnapshot";
import { openReports } from "./reports";
import { SCENES, type SceneName } from "./benchBudgets";
export { SCENES, type SceneName };
import type {
  BoardCard,
  BoardHandCard,
  CombatView,
  DamageWave,
  OpponentHandCard,
  StackView,
} from "./Board";

/** What one board of a scene sets on the Board (the rest stays empty). */
export interface SceneBoard {
  battlefield: BoardCard[];
  hand?: BoardHandCard[];
  opponentHand?: OpponentHandCard[];
  departures?: Map<string, AnchorId>;
  arrivals?: Map<string, AnchorId>;
  stack?: StackView[];
  copying?: StackView[];
  combat?: CombatView | null;
  damage?: DamageWave | null;
  dayTime?: string | null;
  choosable?: ReadonlySet<string>;
  asking?: boolean;
  /** The report window (drawn over the board, as the game screen draws it). */
  reports?: SnapshotReveal | null;
}

export interface BenchScene {
  name: SceneName;
  /** What it is, on the page. */
  label: string;
  start: SceneBoard;
  /** The game's boards for the moment, each `at` ms after Play. */
  steps: { at: number; board: SceneBoard }[];
  /** How long frames are recorded from Play: the moment's length and a margin. */
  ms: number;
}

/** How many distinct pictures the scenes' cards share (round-robin). */
export const SCENE_FACES = 16;

let entered = 0;
let faceAt = 0;
function card(id: string, seat: number, name: string, extra: Partial<BoardCard> = {}): BoardCard {
  const land = extra.kind === "land";
  return {
    id,
    seat,
    name,
    kind: "creature",
    types: land ? `Basic Land — ${name}` : `Creature — ${name}`,
    tapped: false,
    attacking: false,
    blocking: false,
    sick: false,
    faceDown: false,
    known: true,
    power: land ? null : 2,
    toughness: land ? null : 2,
    keywords: [],
    counters: [],
    attachedTo: null,
    enteredAt: ++entered,
    art: `face:${faceAt++ % SCENE_FACES}`,
    ...extra,
  };
}

const NAMES = [
  "Grizzly Bears",
  "Hill Giant",
  "Savannah Lions",
  "Serra Angel",
  "Goblin Guide",
  "Tarmogoyf",
  "Llanowar Elves",
  "Thraben Inspector",
  "Scavenging Ooze",
  "Memnite",
  "Esper Sentinel",
  "Legion Warboss",
  "Mardu Scout",
  "Walking Corpse",
  "Raging Goblin",
  "White Knight",
];
/** A creature's name, distinct per index (so no two pile together). */
const named = (i: number) => `${NAMES[i % NAMES.length]}${i >= NAMES.length ? ` ${i}` : ""}`;

/** Six basic lands for a seat (they pile: two cards a side). */
function lands(seat: number, from: number): BoardCard[] {
  return Array.from({ length: 6 }, (_, i) =>
    card(`card:${from + i}`, seat, i < 3 ? "Forest" : "Mountain", { kind: "land", art: null }),
  );
}

function creatures(seat: number, from: number, n: number, extra: Partial<BoardCard> = {}) {
  return Array.from({ length: n }, (_, i) => card(`card:${from + i}`, seat, named(i), extra));
}

const HAND: BoardHandCard[] = Array.from({ length: 7 }, (_, i) => ({
  id: `card:${900 + i}`,
  name: named(i + 3),
  kind: "creature",
  types: "Creature",
  power: 2,
  toughness: 2,
  art: `face:${i % SCENE_FACES}`,
  manaCost: "{1}{G}",
}));
const BACKS: OpponentHandCard[] = Array.from({ length: 7 }, (_, i) => ({
  id: `hidden-hand:2:${i}`,
  shown: null,
}));
const table = (battlefield: BoardCard[], extra: Partial<SceneBoard> = {}): SceneBoard => ({
  battlefield,
  hand: HAND,
  opponentHand: BACKS,
  ...extra,
});

/** A 31-card Wrath of God: 16 of yours, 15 of theirs, all defeated at once. */
function wipe(): BenchScene {
  const ground = [...lands(1, 1), ...lands(2, 11)];
  const dying = [...creatures(1, 100, 16), ...creatures(2, 200, 15)];
  const departures = new Map<string, AnchorId>(
    dying.map((c) => [c.id, c.seat === 1 ? "viewer:graveyard" : "opponent:graveyard"]),
  );
  return {
    name: "wipe",
    label: "A 31-card board wipe",
    start: table([...ground, ...dying]),
    steps: [{ at: 0, board: table(ground, { departures }) }],
    ms: SWEEP_MS + fateMs("defeated") + MOVE_MS + 600,
  };
}

/** Spec 0089 -- 64 tokens in one update: eight waves of eight. */
function tokens(): BenchScene {
  const ground = [...lands(1, 1), ...lands(2, 11), ...creatures(2, 200, 6)];
  const maker = card("card:40", 1, "Krenko, Mob Boss");
  const ability: StackView = {
    id: "stack:7",
    name: "Krenko, Mob Boss",
    kind: "ability",
    source: maker.id,
    targets: [],
    seat: 1,
  };
  const made = Array.from({ length: 64 }, (_, i) =>
    card(`card:${300 + i}`, 1, "Goblin", {
      token: true,
      types: "Token Creature — Goblin",
      power: 1,
      toughness: 1,
      art: null,
    }),
  );
  return {
    name: "tokens",
    label: "A 64-token wave",
    start: table([...ground, maker], { stack: [ability] }),
    steps: [{ at: 0, board: table([...ground, maker, ...made]) }],
    ms: TOKEN_AFTER_MS + tokenStart(63, 64, 120) + TOKEN_MS + 600,
  };
}

/** Ten creatures in combat: five attack, five block, first strike, then regular damage. */
function combat(): BenchScene {
  const ground = [...lands(1, 1), ...lands(2, 11)];
  const attackers = creatures(2, 200, 5, { attacking: true, power: 3, toughness: 3 });
  const blockers = creatures(1, 100, 5, { blocking: true }).map((b, i) => ({
    ...b,
    blocks: attackers[i]!.id,
  }));
  const view: CombatView = {
    attackers: attackers.map((a) => ({ id: a.id, target: { player: 1 } })),
    blocks: blockers.map((b, i) => ({ blocker: b.id, attacker: attackers[i]!.id })),
  };
  const fights = (pairs: number[]) =>
    pairs.map((i) => ({
      attacker: attackers[i]!.id,
      defender: { player: 1 },
      blockers: [blockers[i]!.id],
    }));
  // The first three have first strike: their blockers die before they deal anything.
  const first: DamageWave = {
    key: "bench:first-strike",
    combat: "first-strike",
    fights: fights([0, 1, 2]),
    hits: [0, 1, 2].map((i) => ({
      source: attackers[i]!.id,
      target: { object: blockers[i]!.id },
      amount: 3,
    })),
  };
  const regular: DamageWave = {
    key: "bench:regular",
    combat: "regular",
    fights: fights([3, 4]),
    hits: [3, 4].flatMap((i) => [
      { source: attackers[i]!.id, target: { object: blockers[i]!.id }, amount: 3 },
      { source: blockers[i]!.id, target: { object: attackers[i]!.id }, amount: 2 },
    ]),
  };
  const afterFirst = [...ground, ...attackers, ...blockers.slice(3)];
  const afterRegular = [...ground, ...attackers.slice(0, 3)];
  const toGrave = (list: BoardCard[]) =>
    new Map<string, AnchorId>(
      list.map((c) => [c.id, c.seat === 1 ? "viewer:graveyard" : "opponent:graveyard"]),
    );
  return {
    name: "combat",
    label: "A 10-creature combat with first strike",
    start: table([...ground, ...attackers, ...blockers], { combat: view }),
    steps: [
      {
        at: 0,
        board: table(afterFirst, {
          combat: { ...view, blocks: view.blocks.slice(3) },
          damage: first,
          departures: toGrave(blockers.slice(0, 3)),
        }),
      },
      {
        // The regular step's board comes while the first strike still
        // plays: the board plays its wave after the first (A-13).
        at: 400,
        board: table(afterRegular, {
          combat: null,
          damage: regular,
          departures: toGrave([...attackers.slice(3), ...blockers.slice(3)]),
        }),
      },
    ],
    ms: 2 * FIGHTS_MAX_MS + 1500,
  };
}

/** Twenty creatures that fly, hovering (ten a side); nothing else moves. */
function flyers(): BenchScene {
  const fly = { keywords: ["Flying"] };
  const board = table([
    ...lands(1, 1),
    ...lands(2, 11),
    ...creatures(1, 100, 10, fly),
    ...creatures(2, 200, 10, fly),
  ]);
  return {
    name: "flyers",
    label: "20 flyers hovering",
    start: board,
    steps: [],
    ms: 3000,
  };
}

/** Day becomes night: the wash across a full table. */
function wash(): BenchScene {
  const cards = [
    ...lands(1, 1),
    ...lands(2, 11),
    ...creatures(1, 100, 14),
    ...creatures(2, 200, 14),
  ];
  return {
    name: "wash",
    label: "The day/night wash",
    start: table(cards, { dayTime: "day" }),
    steps: [{ at: 0, board: table(cards, { dayTime: "night" }) }],
    ms: 1250 + 600,
  };
}

/** A whole army able to attack: every creature of yours breathes "you can pick this". */
function army(): BenchScene {
  const yours = [
    ...creatures(1, 100, 24),
    ...creatures(1, 140, 6, { keywords: ["Flying"] }).map((c, i) => ({
      ...c,
      name: `Faerie ${i + 1}`,
    })),
  ];
  const cards = [...lands(1, 1), ...lands(2, 11), ...yours, ...creatures(2, 200, 10)];
  return {
    name: "army",
    label: 'A full "you can pick this" army',
    start: table(cards),
    steps: [
      {
        at: 0,
        board: table(cards, { choosable: new Set(yours.map((c) => c.id)), asking: true }),
      },
    ],
    ms: 3000,
  };
}

/** Storm x10: Grapeshot's copies, as the worker sends them, through the page's parser. */
export const STORM_COPIES = 10;
const STORM_BEAT_MS = 250;
function storm(): BenchScene {
  let revision = 0;
  const ground = [...lands(1, 1), ...lands(2, 11), ...creatures(2, 200, 8)];
  const state = (over: Record<string, unknown>) => ({
    stateRevision: ++revision,
    gameEpoch: 1,
    turn: 5,
    phase: "MAIN1",
    activeSeat: 1,
    seat: 1,
    players: [
      { seat: 1, name: "Alice", life: 20, handCount: 7, libraryCount: 41 },
      { seat: 2, name: "Bob", life: 20, handCount: 7, libraryCount: 44 },
    ],
    battlefield: [],
    hand: [],
    otherHands: [],
    graveyard: [],
    exile: [],
    stack: [],
    casting: [],
    moves: [],
    ...over,
  });
  const BOB = { player: 2 };
  const trigger = {
    id: "stack:11",
    source: "card:44",
    name: "Grapeshot",
    controller: 1,
    kind: "trigger",
    targets: [],
    description: "Storm: copy Grapeshot for each spell cast before it this turn.",
  };
  const grape = {
    id: "stack:10",
    source: "card:44",
    name: "Grapeshot",
    controller: 1,
    kind: "spell",
    targets: [BOB],
    manaCost: "{1}{R}",
    description: "Grapeshot deals 1 damage to Bob.",
  };
  const copy = (k: number) => ({
    source: `card:${500 + k}`,
    name: "Grapeshot",
    controller: 1,
    kind: "spell",
    manaCost: "{1}{R}",
    description: "Grapeshot",
    copy: true,
    copyOf: "stack:10",
    group: "copies:250",
  });
  const coming = (k: number, aiming: boolean) => ({
    ...copy(k),
    id: `copying:${600 + k}`,
    owner: 1,
    targets: aiming ? [] : [BOB],
    ...(aiming ? { aiming: true } : {}),
  });
  const landed = (k: number) => ({
    ...copy(k),
    id: `stack:${20 + k}`,
    copyingId: `copying:${600 + k}`,
    targets: [BOB],
  });
  const raw = [state({ stack: [trigger, grape] })];
  for (let k = 0; k < STORM_COPIES; k++)
    raw.push(
      state({
        stack: [trigger, grape],
        copying: Array.from({ length: k + 1 }, (_, j) => coming(j, j === k)),
      }),
    );
  raw.push(state({ stack: [...Array.from({ length: STORM_COPIES }, (_, k) => landed(k)), grape] }));
  // The copies resolve one by one.
  for (let gone = 1; gone <= 3; gone++)
    raw.push(
      state({
        stack: [...Array.from({ length: STORM_COPIES - gone }, (_, k) => landed(k + gone)), grape],
        moves: [
          {
            card: `card:${500 + gone - 1}`,
            from: { zone: "stack", seat: 1 },
            to: { zone: "nowhere" },
          },
        ],
      }),
    );
  let previous: ReturnType<typeof snapshotOf> | null = null;
  function snapshotOf(s: Record<string, unknown>) {
    return reduceMatch({ ...EMPTY_MATCH }, { type: "MATCH_SNAPSHOT", state: s }).board!;
  }
  const boards = raw.map((s) => {
    const snap = snapshotOf(s);
    const data = boardFromSnapshot(snap, previous);
    previous = snap;
    return table(ground, { stack: data.stack, copying: data.copying });
  });
  return {
    name: "storm",
    label: `Storm x${STORM_COPIES}`,
    start: boards[0]!,
    steps: boards.slice(1).map((board, i) => ({ at: i * STORM_BEAT_MS, board })),
    ms: (boards.length - 1) * STORM_BEAT_MS + 1500,
  };
}

/** Spec 0088 -- a report window gathering five reports, one after another. */
export const REPORTS = 5;
const REPORT_BEAT_MS = 600;
function reports(): BenchScene {
  const cards = [
    ...lands(1, 1),
    ...lands(2, 11),
    ...creatures(1, 100, 10),
    ...creatures(2, 200, 10),
  ];
  const sources = ["Polluted Delta", "Flooded Strand", "Consider", "Consider", "Opt"];
  const report = (n: number): SnapshotReveal => ({
    key: `action:${n}`,
    title: `Bob used ${sources[n - 1]}.`,
    said: `Bob used ${sources[n - 1]} and put a card into their graveyard.`,
    stamp: n,
    by: 2,
    source: sources[n - 1]!,
    cards: [
      {
        id: `action:${n}:0`,
        seat: 2,
        name: n % 2 ? "Island" : "Lightning Bolt",
        art: `face:${n}`,
        tapped: false,
        faceDown: false,
        known: true,
        kind: "other",
        types: "",
        power: null,
        toughness: null,
      } as never,
    ],
  });
  const windowOf = (n: number): SnapshotReveal | null => {
    const all = Array.from({ length: n }, (_, i) => report(i + 1));
    return openReports({ ...all.at(-1)!, gathered: all.slice(0, -1) }, 0);
  };
  return {
    name: "reports",
    label: `A report window gathering ${REPORTS} reports`,
    start: table(cards),
    steps: Array.from({ length: REPORTS }, (_, i) => ({
      at: i * REPORT_BEAT_MS,
      board: table(cards, { reports: windowOf(i + 1) }),
    })),
    ms: REPORTS * REPORT_BEAT_MS + 800,
  };
}

const MAKERS: Record<SceneName, () => BenchScene> = {
  wipe,
  tokens,
  combat,
  flyers,
  wash,
  army,
  storm,
  reports,
};

/** A scene, made fresh (its cards' ids are its own). */
export function benchScene(name: string): BenchScene | null {
  if (!(SCENES as readonly string[]).includes(name)) return null;
  entered = 0;
  faceAt = 0;
  return MAKERS[name as SceneName]();
}
