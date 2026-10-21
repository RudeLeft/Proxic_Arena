// A synthetic battlefield for development and measurement —
// BATTLEFIELD_RENDERING.md §6 ("a dev route that generates a synthetic
// board: ?permanents=N&faces=M&seed=S"). Seeded, so a board is the same
// every time it is asked for; nothing here is a game, and nothing reaches
// the server.

import type { BoardCard, BoardHandCard } from "./Board";

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
