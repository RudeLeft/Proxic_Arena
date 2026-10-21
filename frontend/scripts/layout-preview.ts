// Draws layout()'s boxes as plain rectangles, so the maths can be LOOKED
// at before any renderer exists (PHASE_07 §7.46, AGENTS TEST-011).
//
//   npx vite-node scripts/layout-preview.ts <out-dir>
//
// Writes one SVG per viewport of a seeded mid-game board. Labels are the
// card names; the dashed outlines are the contract's rows and the rail.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { layout, type LayoutCard, type LayoutInput } from "../src/battlefield/layout";

const out = process.argv[2] ?? "layout-preview";
mkdirSync(out, { recursive: true });

let id = 1;
const c = (
  seat: number,
  name: string,
  kind: string,
  types: string,
  over: Partial<LayoutCard> = {},
): LayoutCard => ({
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
  power: kind === "creature" ? 2 : null,
  toughness: kind === "creature" ? 2 : null,
  keywords: [],
  counters: [],
  attachedTo: null,
  ...over,
});
const forest = (seat: number, tapped = false) =>
  c(seat, "Forest", "land", "Basic Land — Forest", { tapped });
const mountain = (seat: number, tapped = false) =>
  c(seat, "Mountain", "land", "Basic Land — Mountain", { tapped });

const goblin = c(1, "Goblin Guide", "creature", "Creature — Goblin");
const angel = c(2, "Serra Angel", "creature", "Creature — Angel");
const battlefield: LayoutCard[] = [
  // Viewer (seat 1): red-green
  forest(1),
  forest(1),
  forest(1, true),
  mountain(1),
  mountain(1, true),
  c(1, "Horizon Canopy", "land", "Land"),
  goblin,
  c(1, "Bonesplitter", "other", "Artifact — Equipment", { attachedTo: goblin.id }),
  c(1, "Tarmogoyf", "creature", "Creature — Lhurgoyf", { attacking: true, tapped: true }),
  c(1, "Llanowar Elves", "creature", "Creature — Elf Druid", { tapped: true }),
  c(1, "Goblin Token", "creature", "Creature — Goblin", { token: true }),
  c(1, "Goblin Token", "creature", "Creature — Goblin", { token: true }),
  c(1, "Goblin Token", "creature", "Creature — Goblin", { token: true }),
  c(1, "Sylvan Library", "other", "Enchantment"),
  // Opponent (seat 2): white
  ...Array.from({ length: 9 }, () => c(2, "Plains", "land", "Basic Land — Plains")),
  c(2, "Plains", "land", "Basic Land — Plains", { tapped: true }),
  angel,
  c(2, "Pacifism", "other", "Enchantment — Aura", { attachedTo: angel.id, seat: 1 }),
  c(2, "Thraben Inspector", "creature", "Creature — Human Soldier"),
  c(2, "Karn Liberated", "other", "Legendary Planeswalker — Karn"),
  c(2, "Urza's Saga", "land", "Enchantment Land — Urza's Saga"),
];
const input: LayoutInput = {
  viewerSeat: 1,
  battlefield,
  hand: Array.from({ length: 7 }, (_, i) => ({ id: `card:h${i}` })),
};
const names = new Map(battlefield.map((card) => [card.id, card.name]));

for (const vp of [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 3440, height: 1440 },
]) {
  const l = layout(input, vp);
  const g = l.geometry;
  const parts: string[] = [];
  parts.push(`<rect width="${vp.width}" height="${vp.height}" fill="#0d1014"/>`);
  for (const r of Object.values(g.rows)) {
    parts.push(
      `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="#2c3440" stroke-dasharray="6 4"/>`,
    );
  }
  parts.push(
    `<rect x="${g.rail.x}" y="0" width="${g.rail.w}" height="${vp.height}" fill="#11161d" stroke="#2c3440"/>`,
  );
  parts.push(
    `<text x="${g.rail.x + 12}" y="28" fill="#8a8f98" font-size="${g.cardH / 8}" font-family="sans-serif">rail</text>`,
  );
  parts.push(
    `<line x1="0" y1="${vp.height / 2}" x2="${g.rail.x}" y2="${vp.height / 2}" stroke="#39424f"/>`,
  );
  const pileOf = new Map<string, number>();
  for (const s of l.slots) pileOf.set(s.ids[0]!, s.ids.length);
  const drawn = [...l.boxes.entries()].sort(([, a], [, b]) => a.z - b.z);
  const seen = new Set<string>();
  for (const [cardId, b] of drawn) {
    const key = JSON.stringify(b);
    if (seen.has(key)) continue; // a pile is drawn once
    seen.add(key);
    const name = names.get(cardId) ?? "hand";
    const ox = b.x + 0.5 * b.w;
    const oy = b.y + (cardId.startsWith("card:h") ? 1.2 : 0.92) * b.h;
    const fill = cardId.startsWith("card:h") ? "#2f4157" : b.rotation ? "#3a3f46" : "#243327";
    const count = pileOf.get(cardId);
    const fs = (b.h / 9).toFixed(1);
    parts.push(
      `<g transform="rotate(${b.rotation} ${ox} ${oy})"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="4" fill="${fill}" stroke="#c6d4c3" stroke-width="1"/>` +
        `<text x="${b.x + 4}" y="${b.y + b.h / 7}" fill="#e6e9ee" font-size="${fs}" font-family="sans-serif">${name}</text>` +
        (count && count > 1
          ? `<text x="${b.x + 4}" y="${b.y + b.h - 6}" fill="#f0dcb6" font-size="${fs}" font-family="sans-serif">x${count}</text>`
          : "") +
        `</g>`,
    );
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${vp.width}" height="${vp.height}" viewBox="0 0 ${vp.width} ${vp.height}">${parts.join("")}</svg>`;
  writeFileSync(join(out, `layout-${vp.width}x${vp.height}.svg`), svg);
  console.log(`layout-${vp.width}x${vp.height}.svg`);
}
