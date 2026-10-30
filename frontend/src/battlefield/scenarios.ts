// Named battlefields — spec 0040. The ten boards the owner chose the layout
// on (the Busy Board Lab canvas), from a quiet turn 3 to a Commander-size
// table, so the layout's tests and the dev page (`/dev/board?scenario=`)
// keep looking at the same boards. Nothing here is a game.

import type { BoardCard, BoardHandCard } from "./Board";
import { syntheticScan } from "./fixture";

type Copies = string | [string, number];

interface SideSpec {
  lands?: Copies[];
  /** The first this-many lands are tapped. */
  tappedLands?: number;
  creatures?: Copies[];
  tappedCreatures?: number;
  /** The first this-many creatures attack (and so are tapped). */
  attackers?: number;
  /** A token's name, how many, and how many of them are tapped. */
  tokens?: [string, number, number?][];
  others?: [string, string][];
}

const NONBASIC = [
  "Sacred Foundry",
  "Horizon Canopy",
  "Urza's Saga",
  "Boseiju, Who Endures",
  "Den of the Bugbear",
  "Arid Mesa",
  "Steam Vents",
  "Raging Ravine",
  "Gemstone Caverns",
  "Field of the Dead",
  "Valakut",
  "Hall of Heliod",
  "Castle Garenbrig",
  "Mutavault",
  "Urza's Tower",
  "Urza's Mine",
];
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
  "Elvish Mystic",
  "Fyndhorn Elves",
  "Heritage Druid",
  "Elvish Visionary",
  "Dwynen's Elite",
  "Imperious Perfect",
  "Elvish Archdruid",
  "Ezuri",
  "Craterhoof Behemoth",
  "Priest of Titania",
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
  ["Oblivion Ring", "Enchantment"],
  ["Sol Ring", "Artifact"],
  ["Smothering Tithe", "Enchantment"],
  ["Rhystic Study", "Enchantment"],
  ["Jace, the Mind Sculptor", "Legendary Planeswalker — Jace"],
  ["Teferi, Hero of Dominaria", "Legendary Planeswalker — Teferi"],
  ["Coat of Arms", "Artifact"],
  ["Intruder Alarm", "Enchantment"],
];

const SCENARIOS: Record<string, { label: string; you: SideSpec; them: SideSpec }> = {
  early: {
    label: "Turn 3: a quiet start",
    you: {
      lands: ["Mountain", "Mountain", "Sacred Foundry"],
      tappedLands: 2,
      creatures: ["Goblin Guide", "Legion Warboss"],
    },
    them: { lands: ["Forest", "Forest", "Horizon Canopy"], creatures: ["Llanowar Elves"] },
  },
  mid: {
    label: "Turn 7: a normal midgame",
    you: {
      lands: [["Mountain", 3], ["Forest", 2], "Sacred Foundry", "Arid Mesa"],
      tappedLands: 5,
      creatures: CREATURES.slice(0, 5),
      others: OTHERS.slice(0, 2),
    },
    them: {
      lands: [["Island", 3], ["Plains", 2], "Hall of Heliod"],
      creatures: CREATURES.slice(10, 13),
      others: OTHERS.slice(6, 9),
    },
  },
  landsheavy: {
    label: "Lands deck: 14 different lands",
    you: {
      lands: NONBASIC.slice(0, 14),
      tappedLands: 6,
      creatures: CREATURES.slice(0, 3),
      others: OTHERS.slice(0, 1),
    },
    them: { lands: [["Forest", 4], "Arid Mesa", "Steam Vents"], creatures: CREATURES.slice(5, 9) },
  },
  wide: {
    label: "Go-wide: 16 different creatures",
    you: {
      lands: [["Forest", 5], "Gemstone Caverns", "Castle Garenbrig"],
      tappedLands: 4,
      creatures: CREATURES.slice(9, 25),
      others: [OTHERS[6]!, OTHERS[14]!],
    },
    them: {
      lands: [["Swamp", 4], "Den of the Bugbear"],
      creatures: CREATURES.slice(0, 4),
      others: OTHERS.slice(1, 3),
    },
  },
  tokens: {
    label: "Token swarm: 30 tokens, mixed states",
    you: {
      lands: [["Plains", 4], ["Forest", 3], "Field of the Dead"],
      tappedLands: 5,
      creatures: CREATURES.slice(0, 4),
      tokens: [
        ["Soldier", 12, 5],
        ["Saproling", 9, 3],
        ["Spirit", 5],
        ["Zombie", 4, 4],
      ],
      others: [OTHERS[6]!, OTHERS[15]!],
    },
    them: { lands: [["Island", 6]], creatures: CREATURES.slice(5, 8), others: OTHERS.slice(9, 11) },
  },
  artifacts: {
    label: "Artifacts and enchantments: 16 of them",
    you: {
      lands: [["Island", 3], "Urza's Saga", "Urza's Tower", "Urza's Mine", "Mutavault"],
      tappedLands: 3,
      creatures: CREATURES.slice(5, 9),
      others: OTHERS,
    },
    them: { lands: [["Mountain", 5]], creatures: CREATURES.slice(1, 4) },
  },
  combat: {
    label: "Big attack: 10 attackers",
    you: {
      lands: [
        ["Forest", 5],
        ["Mountain", 3],
      ],
      tappedLands: 4,
      creatures: CREATURES.slice(9, 23),
      attackers: 10,
      others: OTHERS.slice(0, 2),
    },
    them: { lands: [["Plains", 6]], creatures: CREATURES.slice(0, 5), others: OTHERS.slice(4, 6) },
  },
  stress: {
    label: "Stress: both sides full",
    you: {
      lands: NONBASIC.slice(0, 15),
      tappedLands: 7,
      creatures: CREATURES.slice(0, 22),
      tappedCreatures: 6,
      others: OTHERS.slice(0, 14),
    },
    them: {
      lands: NONBASIC.slice(1, 13),
      tappedLands: 4,
      creatures: CREATURES.slice(3, 20),
      tappedCreatures: 3,
      others: OTHERS.slice(2, 12),
    },
  },
  horde: {
    label: "Horde: 34 different creatures, no artifacts",
    you: {
      lands: [["Forest", 6], "Gemstone Caverns", "Castle Garenbrig"],
      tappedLands: 6,
      creatures: CREATURES,
      tokens: [
        ["Soldier", 2],
        ["Saproling", 1],
        ["Spirit", 1],
        ["Zombie", 1],
        ["Goblin", 1],
        ["Elf Warrior", 1],
        ["Beast", 1],
        ["Insect", 1],
        ["Thopter", 1],
      ],
    },
    them: {
      lands: [["Island", 5], "Steam Vents"],
      creatures: CREATURES.slice(0, 6),
      others: OTHERS.slice(0, 3),
    },
  },
  commander: {
    label: "Everything at once (Commander-size)",
    you: {
      lands: [...NONBASIC, ["Forest", 5], ["Island", 3]],
      tappedLands: 9,
      creatures: CREATURES,
      tappedCreatures: 8,
      tokens: [
        ["Soldier", 6, 2],
        ["Saproling", 4],
        ["Spirit", 3, 3],
        ["Zombie", 2],
        ["Goblin", 3, 1],
        ["Elf Warrior", 2],
      ],
      others: [
        ...OTHERS,
        ["Treasure", "Token Artifact — Treasure"],
        ["Clue", "Token Artifact — Clue"],
        ["Food", "Token Artifact — Food"],
        ["Map", "Token Artifact — Map"],
      ],
    },
    them: {
      lands: [...NONBASIC.slice(0, 12), ["Swamp", 4]],
      tappedLands: 5,
      creatures: CREATURES.slice(0, 20),
      tappedCreatures: 5,
      others: OTHERS.slice(0, 12),
    },
  },
};

export const SCENARIO_NAMES = Object.keys(SCENARIOS);

export function scenarioLabel(name: string): string | null {
  return SCENARIOS[name]?.label ?? null;
}

const BASICS = ["Forest", "Mountain", "Plains", "Island", "Swamp"];
const copies = (list: Copies[] = []) =>
  list.flatMap((e) => (typeof e === "string" ? [e] : Array.from({ length: e[1] }, () => e[0])));

/** One side of a named board, its ids counting on from `next`. */
function side(seat: number, spec: SideSpec, next: () => number): BoardCard[] {
  const base = (name: string, kind: string, types: string, over: Partial<BoardCard>): BoardCard => {
    const id = next();
    return {
      id: `card:${id}`,
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
      power: kind === "creature" ? 2 + (name.length % 4) : null,
      toughness: kind === "creature" ? 2 + (name.length % 3) : null,
      keywords: [],
      counters: [],
      attachedTo: null,
      enteredAt: id,
      art: syntheticScan(name),
      ...over,
    };
  };
  const out: BoardCard[] = [];
  copies(spec.lands).forEach((name, i) =>
    out.push(
      base(name, "land", BASICS.includes(name) ? `Basic Land — ${name}` : "Land", {
        tapped: i < (spec.tappedLands ?? 0),
      }),
    ),
  );
  copies(spec.creatures).forEach((name, i) => {
    const attacking = i < (spec.attackers ?? 0);
    out.push(
      base(name, "creature", "Creature — Test", {
        tapped: attacking || i < (spec.tappedCreatures ?? 0),
        attacking,
      }),
    );
  });
  for (const [name, count, tapped = 0] of spec.tokens ?? []) {
    for (let i = 0; i < count; i++) {
      out.push(
        base(`${name} Token`, "creature", `Token Creature — ${name}`, {
          token: true,
          power: 1,
          toughness: 1,
          tapped: i < tapped,
          art: null,
        }),
      );
    }
  }
  for (const [name, types] of spec.others ?? []) {
    out.push(base(name, "other", types, { token: types.startsWith("Token") }));
  }
  return out;
}

/** A named board, the same every time; null for a name that is not one. */
export function scenarioBoard(
  name: string,
): { battlefield: BoardCard[]; hand: BoardHandCard[]; viewerSeat: number } | null {
  const spec = SCENARIOS[name];
  if (!spec) return null;
  let id = 0;
  const next = () => ++id;
  const hand: BoardHandCard[] = ["Lightning Bolt", "Forest", "Tarmogoyf", "Opt"].map((n, i) => ({
    id: `card:h${i}`,
    name: n,
    kind: n === "Forest" ? "land" : n === "Tarmogoyf" ? "creature" : "other",
    types:
      n === "Forest"
        ? "Basic Land — Forest"
        : n === "Tarmogoyf"
          ? "Creature — Lhurgoyf"
          : "Instant",
    power: n === "Tarmogoyf" ? 2 : null,
    toughness: n === "Tarmogoyf" ? 3 : null,
    art: syntheticScan(n),
  }));
  return {
    battlefield: [...side(1, spec.you, next), ...side(2, spec.them, next)],
    hand,
    viewerSeat: 1,
  };
}
