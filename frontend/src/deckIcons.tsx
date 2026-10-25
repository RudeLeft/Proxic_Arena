// Deck icons — spec 0012 (owner 2026-10-25).
//
// The owner's 100 round icons, cut from their ten sheets and bundled
// with the app like the avatars (they are not card art, so GIT-001 does
// not apply). A deck stores one by name; with none chosen it shows the
// suggestion from its colours, which Forge reported at import.

import type { DeckSummary } from "./decks";

const files = import.meta.glob<string>("./assets/deck-icons/*.webp", {
  eager: true,
  import: "default",
});

const byName = new Map<string, string>();
for (const [path, url] of Object.entries(files)) {
  const name = /([a-z-]+)\.webp$/.exec(path)?.[1];
  if (name) byName.set(name, url);
}

/** The ten sheets, as the picker's tabs, each with its ten icons in order. */
export const ICON_SHEETS: { name: string; icons: string[] }[] = [
  {
    name: "Colours",
    icons: [
      "sun",
      "water",
      "skull",
      "fire",
      "tree",
      "diamond",
      "five-gems",
      "prism",
      "snowflake",
      "storm-orb",
    ],
  },
  {
    name: "Pairs",
    icons: [
      "wings-and-shield",
      "eye",
      "demon",
      "vine-axe",
      "antlers",
      "scales",
      "storm",
      "mushroom-skull",
      "sun-sword",
      "leaf-wave",
    ],
  },
  {
    name: "Strategy",
    icons: [
      "crossed-swords",
      "shield-burst",
      "sword-and-shield",
      "three-rings",
      "winged-hourglass",
      "growing-crystals",
      "comet",
      "helmets",
      "claw-print",
      "scattered-book",
    ],
  },
  {
    name: "Plans",
    icons: [
      "blinking-lion",
      "five-spears",
      "green-fist",
      "armoury",
      "angel-wings",
      "charging-beast",
      "venom-skull",
      "twin-blades",
      "fortress",
      "spiral-dagger",
    ],
  },
  {
    name: "Engines",
    icons: [
      "golden-heart",
      "bleeding-heart",
      "altar",
      "rising-hand",
      "gravestone",
      "three-cards",
      "broken-card",
      "green-crystals",
      "floating-tree",
      "burning-book",
    ],
  },
  {
    name: "Permanents",
    icons: [
      "gear-crystal",
      "rune-stone",
      "sword-and-helm",
      "amulet",
      "airship",
      "portal",
      "crown",
      "mountain-vale",
      "treasure-chest",
      "apple-pie",
    ],
  },
  {
    name: "Creatures",
    icons: [
      "lion",
      "hound",
      "wolf",
      "eagle",
      "faerie",
      "hydra",
      "giant",
      "horror",
      "kraken",
      "fungus",
    ],
  },
  {
    name: "Families",
    icons: [
      "dragon",
      "angel",
      "demon-lord",
      "zombie",
      "vampire",
      "elf",
      "goblin",
      "human",
      "soldier",
      "knight",
    ],
  },
  {
    name: "Families 2",
    icons: [
      "merfolk",
      "spirit",
      "wizard",
      "rogue",
      "warrior",
      "cleric",
      "dryad",
      "dinosaur",
      "elemental",
      "boar",
    ],
  },
  {
    name: "Utility",
    icons: [
      "scrying-lens",
      "twin-crystals",
      "stolen-gem",
      "vortex",
      "wheel-of-cards",
      "gift",
      "masks",
      "cage",
      "chaos-dice",
      "poison-fangs",
    ],
  },
];

/** Spec 0012's table: one colour, a pair, three or more, none. */
const ONE: Record<string, string> = { W: "sun", U: "water", B: "skull", R: "fire", G: "tree" };
const PAIR: Record<string, string> = {
  WU: "wings-and-shield",
  UB: "eye",
  BR: "demon",
  RG: "vine-axe",
  WG: "antlers",
  WB: "scales",
  UR: "storm",
  BG: "mushroom-skull",
  WR: "sun-sword",
  UG: "leaf-wave",
};

/** The icon a deck of these colours ("WR", WUBRG order) is offered first. */
export function suggestedIcon(colors: string | null | undefined): string {
  if (!colors) return "diamond";
  if (colors.length === 1) return ONE[colors] ?? "diamond";
  if (colors.length === 2) return PAIR[colors] ?? "five-gems";
  return "five-gems";
}

/** The icon a deck shows: its owner's choice, else the suggestion. */
export function iconOf(deck: Pick<DeckSummary, "icon" | "colors">): string {
  return deck.icon && byName.has(deck.icon) ? deck.icon : suggestedIcon(deck.colors);
}

/** "storm-orb" -> "Storm orb", for a screen reader. */
export function iconWords(name: string): string {
  const words = name.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A round deck icon. Decorative beside the deck's name unless [label] is given. */
export function DeckIcon({
  name,
  size = 40,
  label,
}: {
  name: string;
  size?: number;
  label?: string;
}) {
  return (
    <img
      className="pa-deck-icon"
      data-icon={name}
      src={byName.get(name) ?? byName.get("diamond")}
      width={size}
      height={size}
      alt={label ?? ""}
      loading="lazy"
      decoding="async"
    />
  );
}
