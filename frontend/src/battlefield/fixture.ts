// A synthetic battlefield for development and measurement —
// BATTLEFIELD_RENDERING.md §6 ("a dev route that generates a synthetic
// board: ?permanents=N&faces=M&seed=S"). Seeded, so a board is the same
// every time it is asked for; nothing here is a game, and nothing reaches
// the server.

import type { BoardCard, BoardHandCard } from "./Board";
import type { AnchorId } from "./motion";
import type { AttachView, CombatView, DamageWave, StackView } from "./Board";

/** mulberry32: small, fast, deterministic. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CREATURES = [
  "Serra Angel",
  "Goblin Guide",
  "Tarmogoyf",
  "Llanowar Elves",
  "Thraben Inspector",
  "Scavenging Ooze",
  "Arcbound Ravager",
  "Memnite",
  "Esper Sentinel",
  "Voldaren Epicure",
  "Legion Warboss",
  "Mardu Scout",
  "Gemrazer",
  "Ornithopter",
  "Walking Corpse",
];
const OTHERS: [string, string][] = [
  ["Sylvan Library", "Enchantment"],
  ["Ensnaring Bridge", "Artifact"],
  ["Karn Liberated", "Legendary Planeswalker — Karn"],
  ["Blood Moon", "Enchantment"],
  ["Icy Manipulator", "Artifact"],
  ["Mind Stone", "Artifact"],
  ["Glorious Anthem", "Enchantment"],
  ["The Wandering Emperor", "Legendary Planeswalker — Emperor"],
];
const NONBASICS = [
  "Horizon Canopy",
  "Sacred Foundry",
  "Urza's Saga",
  "Boseiju, Who Endures",
  "Den of the Bugbear",
];
const BASICS = ["Forest", "Mountain", "Plains", "Island", "Swamp"];
const AURAS: [string, string][] = [
  ["Pacifism", "Enchantment — Aura"],
  ["Bonesplitter", "Artifact — Equipment"],
];

/**
 * A stand-in for an imported card scan, 745 x 1040 like the real ones,
 * with its "art" where a real card's art box is, so the board's crop of
 * a scan can be checked by eye. A data URI: nothing is fetched.
 */
export function syntheticScan(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="745" height="1040" viewBox="0 0 745 1040">` +
    `<rect width="745" height="1040" rx="36" fill="#181818"/>` +
    `<rect x="30" y="30" width="685" height="980" rx="18" fill="hsl(${hue} 25% 62%)"/>` +
    `<rect x="45" y="48" width="655" height="58" rx="10" fill="hsl(${hue} 20% 85%)"/>` +
    `<text x="62" y="90" font-size="38" font-family="serif" fill="#111">${name.replace(/[<&]/g, "")}</text>` +
    `<rect x="56" y="115" width="633" height="463" fill="hsl(${hue} 55% 38%)"/>` +
    `<circle cx="372" cy="330" r="120" fill="hsl(${(hue + 40) % 360} 70% 60%)"/>` +
    `<path d="M56 578 L240 360 L372 520 L520 300 L689 578 Z" fill="hsl(${(hue + 180) % 360} 35% 25%)"/>` +
    `<rect x="45" y="590" width="655" height="52" rx="8" fill="hsl(${hue} 20% 85%)"/>` +
    `<rect x="56" y="655" width="633" height="300" fill="hsl(${hue} 15% 90%)"/>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export interface SyntheticBoard {
  battlefield: BoardCard[];
  hand: BoardHandCard[];
  viewerSeat: number;
}

/**
 * `permanents` permanents split between the two seats, drawn from
 * `faces` distinct names, with piles, tokens, attackers, tapped cards and
 * attachments in roughly a real game's proportions.
 */
export function syntheticBoard(permanents: number, faces: number, seed: number): SyntheticBoard {
  const rnd = random(seed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)]!;
  const pool = [...CREATURES, ...OTHERS.map(([n]) => n), ...NONBASICS].slice(0, Math.max(1, faces));
  let id = 1;
  const battlefield: BoardCard[] = [];
  const base = (seat: number, name: string, kind: string, types: string): BoardCard => ({
    id: `card:${id++}`,
    seat,
    name,
    kind,
    types,
    tapped: false,
    attacking: false,
    blocking: false,
    sick: false,
    faceDown: false,
    known: true,
    power: kind === "creature" ? 1 + Math.floor(rnd() * 5) : null,
    toughness: kind === "creature" ? 1 + Math.floor(rnd() * 5) : null,
    keywords: [],
    counters: [],
    attachedTo: null,
    enteredAt: id,
    art: name === "Face-down" ? null : syntheticScan(name),
  });

  for (let i = 0; i < permanents; i++) {
    const seat = i % 2 === 0 ? 1 : 2;
    const roll = rnd();
    let card: BoardCard;
    if (roll < 0.25) {
      card = { ...base(seat, pick(BASICS), "land", `Basic Land — ${pick(BASICS)}`) };
      card = { ...card, types: `Basic Land — ${card.name}`, tapped: rnd() < 0.4 };
    } else if (roll < 0.35) {
      const name = pick(NONBASICS.filter((n) => pool.includes(n)).concat(NONBASICS[0]!));
      card = {
        ...base(
          seat,
          name,
          "land",
          name === "Urza's Saga" ? "Enchantment Land — Urza's Saga" : "Land",
        ),
        tapped: rnd() < 0.3,
      };
    } else if (roll < 0.45) {
      card = {
        ...base(seat, "Goblin Token", "creature", "Token Creature — Goblin"),
        token: true,
        power: 1,
        toughness: 1,
        art: null,
      };
    } else if (roll < 0.8) {
      const name = pick(pool.filter((n) => CREATURES.includes(n)).concat(CREATURES[0]!));
      card = {
        ...base(seat, name, "creature", "Creature — Test"),
        tapped: rnd() < 0.2,
        attacking: seat === 2 && rnd() < 0.25,
        keywords: rnd() < 0.3 ? ["Flying"] : [],
        counters: rnd() < 0.1 ? [{ name: "P1P1", count: 2 }] : [],
      };
      if (card.attacking) card.tapped = true;
    } else if (roll < 0.95) {
      const [name, types] = pick(OTHERS);
      card = { ...base(seat, name, "other", types), tapped: rnd() < 0.15 };
    } else {
      card = {
        ...base(seat, "Face-down", "creature", "Creature"),
        faceDown: true,
        known: seat === 1,
        power: 2,
        toughness: 2,
      };
      if (seat === 1) card = { ...card, name: "Willbender" };
    }
    battlefield.push(card);
  }
  // A few attachments onto creatures, either side.
  const creatures = battlefield.filter((c) => c.kind === "creature" && !c.token);
  for (let i = 0; i < Math.floor(permanents / 12) && creatures.length > 0; i++) {
    const host = pick(creatures);
    const [name, types] = pick(AURAS);
    battlefield.push({ ...base(rnd() < 0.5 ? 1 : 2, name, "other", types), attachedTo: host.id });
  }
  const hand: BoardHandCard[] = Array.from({ length: 7 }, (_, i) => {
    const name = pick(pool);
    const isCreature = CREATURES.includes(name);
    return {
      id: `card:h${i}`,
      name,
      kind: isCreature ? "creature" : NONBASICS.includes(name) ? "land" : "other",
      types: isCreature ? "Creature — Test" : "Spell",
      power: isCreature ? 2 : null,
      toughness: isCreature ? 2 : null,
      art: syntheticScan(name),
    };
  });
  return { battlefield, hand, viewerSeat: 1 };
}

/** What one synthetic change did: the board after it, and where the cards
 * that appeared came from and the ones that went went (rail zones). */
export interface SyntheticChange {
  board: SyntheticBoard;
  /** A short description, for the dev page and test messages. */
  what: string;
  arrivals: Map<string, AnchorId>;
  departures: Map<string, AnchorId>;
}

const CHANGES = ["tap", "dies", "resolves", "land", "bounce", "attack", "draw", "untap"] as const;

/**
 * The board after `n` seeded changes (BATTLEFIELD_RENDERING.md §7 step 4:
 * something to watch move). Each change is one kind of thing a real game
 * does to the board, in turn: a land taps, a creature dies (its Auras and
 * Equipment go with it), a creature spell resolves, a land is played from
 * the hand, a creature is returned to its owner's hand, creatures attack,
 * a card is drawn, a land untaps. Deterministic for (board, n, seed),
 * so a test can compute the board it should see.
 */
export function applyChanges(start: SyntheticBoard, n: number, seed: number): SyntheticChange {
  const rnd = random(seed * 7919 + 17);
  let board: SyntheticBoard = {
    ...start,
    battlefield: [...start.battlefield],
    hand: [...start.hand],
  };
  let last: SyntheticChange = {
    board,
    what: "the starting board",
    arrivals: new Map(),
    departures: new Map(),
  };
  let id = 100000;
  let clock = 100000;
  const pick = <T>(list: readonly T[]): T | undefined =>
    list.length > 0 ? list[Math.floor(rnd() * list.length)] : undefined;
  const side = (seat: number) => (seat === board.viewerSeat ? "viewer" : "opponent");

  for (let step = 0; step < n; step++) {
    const kind = CHANGES[step % CHANGES.length]!;
    const arrivals = new Map<string, AnchorId>();
    const departures = new Map<string, AnchorId>();
    let battlefield = [...board.battlefield];
    let hand = [...board.hand];
    let what: string = kind;
    const free = (c: BoardCard) => c.attachedTo === null;

    if (kind === "tap" || kind === "untap") {
      const target = pick(
        battlefield.filter((c) => c.kind === "land" && c.tapped === (kind === "untap")),
      );
      if (target) {
        battlefield = battlefield.map((c) =>
          c.id === target.id ? { ...c, tapped: !c.tapped } : c,
        );
        what = `${target.name} ${kind}s`;
      }
    } else if (kind === "dies") {
      const victim = pick(battlefield.filter((c) => c.kind === "creature" && free(c)));
      if (victim) {
        const going = battlefield.filter((c) => c.id === victim.id || c.attachedTo === victim.id);
        for (const c of going) departures.set(c.id, `${side(c.seat)}:graveyard`);
        battlefield = battlefield.filter((c) => !going.includes(c));
        what = `${victim.name} dies`;
      }
    } else if (kind === "resolves") {
      const seat = rnd() < 0.5 ? 1 : 2;
      const name = pick(CREATURES)!;
      const card: BoardCard = {
        id: `card:${id++}`,
        seat,
        name,
        kind: "creature",
        types: "Creature — Test",
        tapped: false,
        attacking: false,
        blocking: false,
        sick: true,
        faceDown: false,
        known: true,
        power: 1 + Math.floor(rnd() * 5),
        toughness: 1 + Math.floor(rnd() * 5),
        keywords: [],
        counters: [],
        attachedTo: null,
        enteredAt: clock++,
        art: syntheticScan(name),
      };
      battlefield.push(card);
      arrivals.set(card.id, "stack");
      what = `${name} resolves for ${side(seat) === "viewer" ? "you" : "the opponent"}`;
    } else if (kind === "land") {
      const card = hand[0];
      if (card) {
        // The same object, from the hand to the battlefield: no arrival,
        // it moves from where it was drawn.
        hand = hand.slice(1);
        battlefield.push({
          id: card.id,
          seat: board.viewerSeat,
          name: "Forest",
          kind: "land",
          types: "Basic Land — Forest",
          tapped: false,
          attacking: false,
          blocking: false,
          sick: false,
          faceDown: false,
          known: true,
          power: null,
          toughness: null,
          keywords: [],
          counters: [],
          attachedTo: null,
          enteredAt: clock++,
          art: syntheticScan("Forest"),
        });
        what = "a land is played from the hand";
      }
    } else if (kind === "bounce") {
      const card = pick(
        battlefield.filter(
          (c) =>
            c.kind === "creature" &&
            c.seat === board.viewerSeat &&
            !c.faceDown &&
            !battlefield.some((a) => a.attachedTo === c.id),
        ),
      );
      if (card) {
        battlefield = battlefield.filter((c) => c.id !== card.id);
        hand = [
          ...hand,
          {
            id: card.id,
            name: card.name,
            kind: card.kind,
            types: card.types,
            power: card.power,
            toughness: card.toughness,
            art: card.art,
          },
        ];
        what = `${card.name} returns to your hand`;
      }
    } else if (kind === "attack") {
      const ready = battlefield.filter(
        (c) => c.kind === "creature" && c.seat !== board.viewerSeat && !c.tapped && !c.faceDown,
      );
      const attackers = new Set(ready.slice(0, 2).map((c) => c.id));
      battlefield = battlefield.map((c) =>
        attackers.has(c.id) ? { ...c, attacking: true, tapped: true } : c,
      );
      what = `${attackers.size} creature(s) attack you`;
    } else if (kind === "draw") {
      const name = pick(CREATURES)!;
      const card: BoardHandCard = {
        id: `card:${id++}`,
        name,
        kind: "creature",
        types: "Creature — Test",
        power: 2,
        toughness: 2,
        art: syntheticScan(name),
      };
      hand = [...hand, card];
      arrivals.set(card.id, "viewer:library");
      what = `you draw ${name}`;
    }

    board = { ...board, battlefield, hand };
    last = { board, what, arrivals, departures };
  }
  return last;
}

// --- the combat script (§7 step 5) ---------------------------------------------

/** What the board is told about besides the cards: combat, the stack, an
 * attachment being chosen, and damage just dealt (§7.61 B2-B4, B13). */
export interface SyntheticScene extends SyntheticChange {
  combat: CombatView | null;
  stack: StackView[];
  pointedStack: string | null;
  attaching: AttachView | null;
  damage: DamageWave | null;
}

function scriptCard(
  id: string,
  seat: number,
  name: string,
  kind: string,
  types: string,
  over: Partial<BoardCard> = {},
): BoardCard {
  return {
    id,
    seat,
    name,
    kind,
    types,
    tapped: false,
    attacking: false,
    blocking: false,
    sick: false,
    faceDown: false,
    known: true,
    power: null,
    toughness: null,
    keywords: [],
    counters: [],
    attachedTo: null,
    enteredAt: Number(id.replace(/\D/g, "")),
    art: syntheticScan(name),
    ...over,
  };
}

const SCRIPT_STEPS = [
  "the board before combat",
  "Bob attacks: Serra Angel and White Knight at you, a Goblin token at The Wandering Emperor",
  "you block: Goblin Guide and Llanowar Elves on Serra Angel, Grizzly Bears on White Knight",
  "first-strike damage: White Knight deals 2 to Grizzly Bears",
  "Grizzly Bears dies",
  "combat damage: Serra Angel 2 to each blocker, they hit back, the token hits the Emperor",
  "Goblin Guide and Llanowar Elves die; combat ends",
  "Bob casts Lightning Bolt at The Wandering Emperor",
  "you respond: Shock at White Knight",
  "pointing at Lightning Bolt in the stack",
  "Shock resolves: White Knight dies",
  "Lightning Bolt resolves: The Wandering Emperor dies",
  "you equip Bonesplitter: choosing Walking Corpse",
  "Bonesplitter is attached to Walking Corpse",
] as const;

export const COMBAT_SCRIPT_LENGTH = SCRIPT_STEPS.length;

/**
 * A short, fixed game to watch every line and effect in turn (PHASE 7
 * AMENDMENTS 4 and 7), one step per "Next change". Its names are the
 * owner's examples. A step past the end stays on the last.
 */
export function combatScript(n: number): SyntheticScene {
  const you = 1;
  const bob = 2;
  const angel = scriptCard("card:201", bob, "Serra Angel", "creature", "Creature — Angel", {
    power: 4,
    toughness: 4,
    keywords: ["Flying", "Vigilance"],
  });
  const knight = scriptCard("card:202", bob, "White Knight", "creature", "Creature — Knight", {
    power: 2,
    toughness: 2,
    keywords: ["First strike"],
  });
  const token = scriptCard("card:203", bob, "Goblin Token", "creature", "Token Creature — Goblin", {
    power: 1,
    toughness: 1,
    token: true,
    art: null,
  });
  const guide = scriptCard("card:211", you, "Goblin Guide", "creature", "Creature — Goblin", {
    power: 2,
    toughness: 2,
  });
  const elves = scriptCard("card:212", you, "Llanowar Elves", "creature", "Creature — Elf", {
    power: 1,
    toughness: 1,
  });
  const bears = scriptCard("card:213", you, "Grizzly Bears", "creature", "Creature — Bear", {
    power: 2,
    toughness: 2,
  });
  const corpse = scriptCard("card:214", you, "Walking Corpse", "creature", "Creature — Zombie", {
    power: 2,
    toughness: 2,
  });
  const emperor = scriptCard(
    "card:215",
    you,
    "The Wandering Emperor",
    "other",
    "Legendary Planeswalker — Emperor",
    { counters: [{ name: "LOYALTY", count: 4 }] },
  );
  const splitter = scriptCard("card:216", you, "Bonesplitter", "other", "Artifact — Equipment");
  const lands = [
    ...[221, 222, 223, 224].map((i) =>
      scriptCard(`card:${i}`, bob, "Plains", "land", "Basic Land — Plains"),
    ),
    ...[231, 232, 233].map((i) =>
      scriptCard(`card:${i}`, you, "Forest", "land", "Basic Land — Forest"),
    ),
    ...[234, 235].map((i) =>
      scriptCard(`card:${i}`, you, "Mountain", "land", "Basic Land — Mountain"),
    ),
  ];
  const handNames = ["Shock", "Forest", "Thraben Inspector", "Mind Stone"];
  const hand: BoardHandCard[] = handNames.map((name, i) => ({
    id: `card:24${i}`,
    name,
    kind: name === "Forest" ? "land" : name === "Thraben Inspector" ? "creature" : "other",
    types:
      name === "Forest"
        ? "Basic Land — Forest"
        : name === "Thraben Inspector"
          ? "Creature — Human"
          : "Spell",
    power: name === "Thraben Inspector" ? 1 : null,
    toughness: name === "Thraben Inspector" ? 2 : null,
    art: syntheticScan(name),
  }));

  const step = Math.max(0, Math.min(n, SCRIPT_STEPS.length - 1));
  let battlefield: BoardCard[] = [
    angel,
    knight,
    token,
    guide,
    elves,
    bears,
    corpse,
    emperor,
    splitter,
    ...lands,
  ];
  const set = (id: string, over: Partial<BoardCard>) => {
    battlefield = battlefield.map((c) => (c.id === id ? { ...c, ...over } : c));
  };
  const remove = (...ids: string[]) => {
    battlefield = battlefield.filter((c) => !ids.includes(c.id));
  };
  const scene: SyntheticScene = {
    board: { battlefield, hand, viewerSeat: you },
    what: SCRIPT_STEPS[step]!,
    arrivals: new Map(),
    departures: new Map(),
    combat: null,
    stack: [],
    pointedStack: null,
    attaching: null,
    damage: null,
  };

  // Combat: steps 1-5 (it ends at step 6).
  if (step >= 1 && step <= 5) {
    set(angel.id, { attacking: true }); // vigilance: attacks untapped
    set(knight.id, { attacking: true, tapped: true });
    set(token.id, { attacking: true, tapped: true });
    scene.combat = {
      attackers: [
        { id: angel.id, target: { player: you } },
        { id: knight.id, target: { player: you } },
        { id: token.id, target: { object: emperor.id } },
      ],
      blocks: [],
    };
  }
  if (step >= 2 && step <= 5) {
    set(guide.id, { blocking: true });
    set(elves.id, { blocking: true });
    if (step <= 3) set(bears.id, { blocking: true });
    scene.combat!.blocks = [
      { blocker: guide.id, attacker: angel.id },
      { blocker: elves.id, attacker: angel.id },
      ...(step <= 3 ? [{ blocker: bears.id, attacker: knight.id }] : []),
    ];
  }
  if (step === 3) {
    scene.damage = {
      key: "first-strike",
      hits: [{ source: knight.id, target: { object: bears.id }, amount: 2 }],
    };
  }
  if (step >= 4) {
    remove(bears.id);
    if (step === 4) scene.departures.set(bears.id, "viewer:graveyard");
  }
  if (step === 5) {
    scene.damage = {
      key: "regular",
      hits: [
        { source: angel.id, target: { object: guide.id }, amount: 2 },
        { source: angel.id, target: { object: elves.id }, amount: 2 },
        { source: guide.id, target: { object: angel.id }, amount: 2 },
        { source: elves.id, target: { object: angel.id }, amount: 1 },
        { source: token.id, target: { object: emperor.id }, amount: 1 },
      ],
    };
  }
  if (step >= 5) set(emperor.id, { counters: [{ name: "LOYALTY", count: 3 }] });
  if (step >= 6) {
    remove(guide.id, elves.id);
    if (step === 6) {
      scene.departures.set(guide.id, "viewer:graveyard");
      scene.departures.set(elves.id, "viewer:graveyard");
    }
  }

  // The stack: steps 7-11.
  const bolt: StackView = {
    id: "stack:1",
    name: "Lightning Bolt",
    source: null,
    targets: [{ object: emperor.id }],
  };
  const shock: StackView = {
    id: "stack:2",
    name: "Shock",
    source: null,
    targets: [{ object: knight.id }],
  };
  if (step === 7) scene.stack = [bolt];
  if (step === 8 || step === 9) scene.stack = [shock, bolt];
  if (step === 9) scene.pointedStack = bolt.id;
  if (step >= 10) {
    remove(knight.id);
    if (step === 10) {
      scene.stack = [bolt];
      scene.damage = {
        key: "shock",
        hits: [{ source: shock.id, target: { object: knight.id }, amount: 2 }],
      };
      scene.departures.set(knight.id, "opponent:graveyard");
    }
  }
  if (step >= 11) {
    remove(emperor.id);
    if (step === 11) {
      scene.damage = {
        key: "bolt",
        hits: [{ source: bolt.id, target: { object: emperor.id }, amount: 3 }],
      };
      scene.departures.set(emperor.id, "viewer:graveyard");
    }
  }

  // Equip: steps 12-13.
  if (step === 12) scene.attaching = { source: splitter.id, host: corpse.id };
  if (step >= 13) set(splitter.id, { attachedTo: corpse.id });

  scene.board = { battlefield, hand, viewerSeat: you };
  return scene;
}
