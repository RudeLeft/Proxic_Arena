// Spec 0079 -- creature copies, copied spells, and spells that fizzle
// (owner 2026-11-12 on the canvas copies-1112: Q1 A, Q2 A, Q3 B, Q4 A).
//
// Pure: frames and the held spots, from the boards and what the game says
// (a card's `copy` and `copyOf`, a stack entry's `copy` and `copyOf`, a
// move's "fizzled"). Nothing here decides a rule: which card a copy copied,
// and that a spell did nothing, are the game's.
//
//   Q1 A  A ghost lifts off the original: a see-through copy of the copied
//         creature lifts off it and glides onto the copying card, which then
//         lifts, flips (A-09) and settles as the copied face; the gold copy
//         mark grows in. A token copy sparks out of the creature it copies
//         (0073's spark, moved to the original) and glides to its place.
//   Q2 A  A copied spell peels off the original stack card: see-through,
//         lifting off it and settling in front, turning solid. Done, it
//         breaks into gold motes where it is -- never to a graveyard.
//   Q3 B  Storm: the copies aiming at the same thing are one card "xN",
//         ticking up as they land and down as each resolves.
//   Q4 A  A spell whose target is gone reaches for its place, finds
//         nothing (a dashed ring that breaks up), goes grey and see-through
//         as smoke rises, and drifts to its graveyard.
//   Owner The HELD SPOT: while a spell on the stack still aims at a
//         permanent that has left, its place stays a dashed outline with its
//         name faint inside; nothing slides into it until every spell aimed
//         at it is done. Then the gap closes with the Glide.

import type { BoardCard, StackView } from "./Board";
import { glideAt, poseOf, track, type Pose } from "./graves";
import type { Box } from "./layout";
import { FLIP_MS, MOVE_MS } from "./motion";

// --- Q1 A · the ghost of the original -----------------------------------------------

/** The ghost lifts off the original (the canvas's 150 ms, 12 of 134 px up, to 105%). */
export const COPY_LIFT_MS = 150;
/** Then glides onto the copying card. */
export const COPY_GLIDE_MS = 520;
/** And fades as the copying card flips. */
export const COPY_FADE_MS = 200;
export const COPY_GHOST_MS = COPY_LIFT_MS + COPY_GLIDE_MS + COPY_FADE_MS;
/** How see-through the ghost is. */
export const COPY_GHOST_OPACITY = 0.6;
/** The copying card flips (A-09) as the ghost lands on it, after the ghost set off. */
export const COPY_FLIP_AT = COPY_LIFT_MS + COPY_GLIDE_MS;
/** The copy mark grows in once the flip has settled (the canvas: 0.8 s after the flip began). */
export const COPY_MARK_AT = COPY_FLIP_AT + 800;
/** The mark's grow (0076's backOut): 380 ms. */
export const MARK_GROW_MS = 380;
/** The original glows while its ghost lifts and goes (the canvas's 700 ms). */
export const ORIGINAL_GLOW_MS = 700;

const LIFT = 12 / 134;
const GROW = 1.05;
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const clamp = (v: number) => Math.max(0, Math.min(1, v));

/**
 * The original's see-through ghost: it lifts off the original (`from`),
 * glides onto the copying card's place (`to`) and fades. Linear over
 * COPY_GHOST_MS.
 */
export function copyGhostFrames(
  from: Box,
  fromOrigin: { x: number; y: number },
  to: Box,
  toOrigin: { x: number; y: number },
  cardW: number,
  cardH: number,
): Keyframe[] {
  const a = poseOf(from, fromOrigin);
  const b = poseOf(to, toOrigin);
  const lifted: Pose = { ...a, y: a.y - LIFT * cardH * a.s, s: a.s * GROW };
  const at = (ms: number): Pose => {
    if (ms <= COPY_LIFT_MS) {
      const q = easeOut(clamp(ms / COPY_LIFT_MS));
      return {
        ...a,
        y: a.y - LIFT * cardH * a.s * q,
        s: a.s * (1 + (GROW - 1) * q),
        o: COPY_GHOST_OPACITY,
      };
    }
    const p = clamp((ms - COPY_LIFT_MS) / COPY_GLIDE_MS);
    const pose = glideAt(lifted, { ...b, s: b.s * GROW }, p, cardH);
    const fade = clamp((ms - COPY_LIFT_MS - COPY_GLIDE_MS) / COPY_FADE_MS);
    return { ...pose, o: COPY_GHOST_OPACITY * (1 - fade) };
  };
  return track(COPY_GHOST_MS, at, cardW, cardH, fromOrigin, [COPY_LIFT_MS, COPY_FLIP_AT]);
}

/**
 * The copying card's own look on its way from the stack (Clone, as it was
 * there): it glides to its place (`glide`, MOVE_MS), waits there while the
 * ghost comes, and is gone in the flip -- `hold` ms after it set off, the
 * flip's first half turns it edge-on (its old face, A-09's "out").
 */
export function holdThenFlip(glide: Keyframe[], hold: number): { frames: Keyframe[]; ms: number } {
  const ms = Math.max(MOVE_MS, hold) + FLIP_MS;
  const k = MOVE_MS / ms;
  const frames = glide.map((f) => ({ ...f, offset: (f.offset ?? 0) * k }));
  const last = glide[glide.length - 1]!;
  frames.push({ ...last, offset: 1 });
  return { frames, ms };
}

/** The copy mark growing in (0076's backOut: a little past its size, then settling). */
export function markFrames(): Keyframe[] {
  const back = (p: number) => {
    const c1 = 1.9;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  };
  return Array.from({ length: 11 }, (_, i) => ({
    offset: i / 10,
    transform: `scale(${Math.max(0.01, i === 0 ? 0.01 : back(i / 10)).toFixed(3)})`,
  }));
}

/** The original glowing gold while its ghost lifts off (a bump, as A-09's). */
export function glowFrames(): Keyframe[] {
  const glow = (g: number) =>
    `drop-shadow(0px 0px ${(14 * g).toFixed(1)}px rgba(241, 195, 106, ${(0.9 * g).toFixed(2)}))`;
  return [0, 0.25, 0.5, 0.75, 1].map((p) => ({
    offset: p,
    filter: glow(Math.sin(Math.PI * p)),
  }));
}

// --- Q2 A · a copied spell peels off the original -----------------------------------

/** It lifts off the original (150 ms, 14 and 10 of the canvas's px), then settles in front (450 ms). */
export const PEEL_IN_LIFT_MS = 150;
export const PEEL_IN_MS = PEEL_IN_LIFT_MS + MOVE_MS;
/** See-through as it leaves the original, solid as it settles. */
export const PEEL_IN_OPACITY = 0.5;
/** The mark grows as it settles (the canvas: 1.05 s, the copy left at 0.45). */
export const PEEL_MARK_AT = 600;
/** The next copy of a storm peels off this far behind the one before (the canvas's 150 ms). */
export const PEEL_BEAT_MS = 150;

/**
 * A copied spell's card on the stack: from the original's stack card
 * (`from`), lifted a little up and to the left, see-through, to its own
 * place in front (`to`), turning solid. Stack boxes turn about (0, 0).
 */
export function peelInFrames(from: Box, to: Box, cardW: number, cardH: number): Keyframe[] {
  const o = { x: 0, y: 0 };
  const a = poseOf(from, o);
  const k = from.h / 134;
  const off: Pose = { ...a, x: a.x - 14 * k, y: a.y - 10 * k };
  const b = poseOf(to, o);
  return track(
    PEEL_IN_MS,
    (ms) => {
      if (ms <= PEEL_IN_LIFT_MS) {
        const q = easeOut(clamp(ms / PEEL_IN_LIFT_MS));
        return {
          ...a,
          x: a.x - 14 * k * q,
          y: a.y - 10 * k * q,
          o: PEEL_IN_OPACITY,
        };
      }
      const p = clamp((ms - PEEL_IN_LIFT_MS) / MOVE_MS);
      return { ...glideAt(off, b, p, cardH), o: PEEL_IN_OPACITY + (1 - PEEL_IN_OPACITY) * p };
    },
    cardW,
    cardH,
    o,
    [PEEL_IN_LIFT_MS],
  );
}

// --- a copy ending: gold motes where it is ------------------------------------------

/** It resolves (the resolve glow, 380 ms), then breaks into gold motes over 500 ms. */
export const COPY_END_MS = 500;

/**
 * A copy of a spell that has resolved (or fizzled): where it is -- a little
 * off the card it breaks away from, for the next of a storm's xN -- it
 * swells by 8% and fades as its gold motes rise. `after` ms first (the
 * resolve glow). Stack boxes turn about (0, 0).
 */
export function copyEndFrames(
  box: Box,
  cardW: number,
  cardH: number,
  after: number,
  apart: { x: number; y: number } = { x: 0, y: 0 },
): { frames: Keyframe[]; ms: number } {
  const o = { x: 0, y: 0 };
  const a = poseOf(box, o);
  const ms = after + COPY_END_MS;
  const frames = track(
    ms,
    (t) => {
      const q = clamp((t - after) / COPY_END_MS);
      const e = easeOut(clamp(t / Math.max(1, after)));
      return {
        ...a,
        x: a.x + apart.x * e,
        y: a.y + apart.y * e,
        s: a.s * (1 + 0.08 * q),
        o: t < after ? 1 : 1 - q,
      };
    },
    cardW,
    cardH,
    o,
    [after],
  );
  return { frames, ms };
}

// --- Q4 A · reaches, finds nothing --------------------------------------------------

/** Its beam reaches the held spot (300 ms) and finds nothing: the ring breaks up (500 ms). */
export const FIZZLE_REACH_MS = 300;
export const FIZZLE_RING_MS = 500;
/** The beam fades from here, over 300 ms. */
export const FIZZLE_BEAM_OUT_AT = 550;
/** The spell goes grey and see-through, smoke rising, from here over 700 ms. */
export const FIZZLE_GREY_AT = 500;
export const FIZZLE_GREY_MS = 700;
/** Then it drifts to its graveyard, fading (450 ms); a copy just fades away. */
export const FIZZLE_GO_AT = 1200;
export const FIZZLE_MS = FIZZLE_GO_AT + MOVE_MS;
/** The held spot stays until the spell is done with it: then the gap closes. */
export const FIZZLE_HOLD_MS = FIZZLE_GO_AT;

const GREY = (p: number) =>
  `grayscale(${(0.85 * p).toFixed(3)}) brightness(${(1 - 0.35 * p).toFixed(3)})`;

/**
 * The fizzled spell, from its place on the stack (`from`): it waits while
 * its beam reaches, goes grey and see-through (to 40%), then drifts to its
 * graveyard tile (`to`) fading -- or, a copy (`to` null), fades where it is.
 * Run linear over FIZZLE_MS.
 */
export function fizzleFrames(
  from: Pose,
  to: Pose | null,
  cardW: number,
  cardH: number,
  origin: { x: number; y: number },
): Keyframe[] {
  return track(
    FIZZLE_MS,
    (ms) => {
      const grey = clamp((ms - FIZZLE_GREY_AT) / FIZZLE_GREY_MS);
      const o = 1 - 0.6 * grey;
      if (ms <= FIZZLE_GO_AT) return { ...from, o, filter: GREY(grey) };
      const p = clamp((ms - FIZZLE_GO_AT) / MOVE_MS);
      if (!to) return { ...from, o: 0.4 * (1 - p), filter: GREY(1) };
      return { ...glideAt(from, to, p, cardH), o: 0.4 * (1 - p), filter: GREY(1) };
    },
    cardW,
    cardH,
    origin,
    [FIZZLE_GREY_AT, FIZZLE_GO_AT],
    undefined,
    30,
  );
}

/** The held spot's outline: it flares as the beam finds nothing, then breaks up and goes. */
export function heldBreakFrames(): Keyframe[] {
  const at = (ms: number) => ms / FIZZLE_HOLD_MS;
  return [
    { offset: 0, opacity: 1, transform: "scale(1)" },
    { offset: at(FIZZLE_REACH_MS), opacity: 1, transform: "scale(1)" },
    { offset: at(FIZZLE_REACH_MS + 120), opacity: 1, transform: "scale(1.04)" },
    { offset: at(FIZZLE_REACH_MS + FIZZLE_RING_MS), opacity: 0.25, transform: "scale(1.08)" },
    { offset: 1, opacity: 0, transform: "scale(1.1)" },
  ];
}

// --- Q3 B · storm: one card xN ------------------------------------------------------

/**
 * Spec 0079 (Q3 B) -- two copies of one spell are drawn as one card "xN"
 * when they copy the same entry and aim at the same thing (Grapeshot's
 * storm copies, all at Bob); aimed at different things, each is its own.
 */
export function sameCopy(a: CopyEntry, b: CopyEntry): boolean {
  return (
    a.copy === true &&
    b.copy === true &&
    a.copyOf !== undefined &&
    a.copyOf === b.copyOf &&
    // Spec 0082: and made together (two Forks of one Bolt are two cards).
    a.group === b.group &&
    a.name === b.name &&
    a.controller === b.controller &&
    JSON.stringify(a.targets) === JSON.stringify(b.targets)
  );
}

/** What the stack grouping reads of an entry (a StackEntry, on the stack or on its way). */
export interface CopyEntry {
  id: string;
  kind?: string;
  source?: string | null;
  copy?: boolean | undefined;
  copyOf?: string | undefined;
  group?: string | undefined;
  copyingId?: string | undefined;
  aiming?: boolean | undefined;
  name: string;
  controller: number | null;
  targets: readonly unknown[];
}

// --- spec 0082: copies put onto the stack, and cast copies ---------------------------

/**
 * Spec 0082 -- the copy being asked "new target?" (its targets cleared while
 * they are chosen) is drawn on the card of its batch made just before it:
 * the "xN" counts up as it peels on. Picked at something else, it then
 * forms its own card.
 */
export function joinsAimed(a: CopyEntry, b: CopyEntry): boolean {
  return (
    a.copy === true &&
    b.copy === true &&
    b.aiming === true &&
    a.group !== undefined &&
    a.group === b.group &&
    a.copyOf === b.copyOf &&
    a.name === b.name &&
    a.controller === b.controller
  );
}

/**
 * Spec 0082 -- the lasting key of a card of copies made together: its batch
 * and what it aims at, so it is one card on its way, on the stack and while
 * it ticks down (never its first member's id, which changes as each
 * resolves). Null for anything else (its id is its key).
 */
export function copyKey(e: CopyEntry): string | null {
  if (!e.copy || !e.group) return null;
  return `${e.group}|${e.aiming ? "aiming" : JSON.stringify(e.targets)}`;
}

/**
 * Spec 0082 -- what one copy is, for the jump check, the same on its way and
 * on the stack: a spell copy's own card; an ability copy, the id it had on
 * its way (its host card is the original's too).
 */
export function copyThing(e: CopyEntry): string {
  if ((e.kind ?? "spell") === "spell" && e.source) return e.source;
  return e.copyingId ?? e.id;
}

/** How far a copy on its way sits from the card it copies, as the canvas draws it. */
export const BESIDE = { x: -0.8, y: -0.08, scale: 0.88, step: 0.46 };

/**
 * Spec 0082 -- where a card of copies on its way waits: beside the entry it
 * copies (`of`, its stack card), a little to the left and smaller (the
 * canvas's 54 px left and 8 up of a 68 px card, drawn at 0.88 of it); a
 * second group (split targets) under the first.
 */
export function besideBox(of: Box, nth: number): Box {
  const w = of.w * BESIDE.scale;
  const h = of.h * BESIDE.scale;
  const cx = of.x + of.w / 2 + BESIDE.x * of.w;
  const cy = of.y + of.h / 2 + BESIDE.y * of.h + nth * BESIDE.step * of.h;
  return { ...of, x: cx - w / 2, y: cy - h / 2, w, h, scale: of.scale * BESIDE.scale };
}

// --- the held spot ------------------------------------------------------------------

/** A permanent's place held: its card as it last stood, and the stack entries still aimed at it. */
export interface HeldSpot {
  card: BoardCard;
  by: ReadonlySet<string>;
  /** Kept after the last of them went (the fizzle playing), until this time (ms). */
  until?: number;
}

/** What the board remembers between boards to hold spots. */
export interface HeldMemory {
  /** Each stack entry still there, and every card it has aimed at while there. */
  aims: ReadonlyMap<string, ReadonlySet<string>>;
  /** The permanents on the board drawn before. */
  cards: ReadonlyMap<string, BoardCard>;
  /** The places held now, by the card that left. */
  held: ReadonlyMap<string, HeldSpot>;
}

export const NO_HELD: HeldMemory = { aims: new Map(), cards: new Map(), held: new Map() };

/** The id a held spot is drawn under: never a card's own (nothing can be done with it). */
export const heldId = (card: string) => `held:${card}`;

/**
 * Spec 0079 (owner) -- the next held spots. A card the stack aims at (now,
 * or while each entry has been there: the game stops naming a target once
 * it is in a hand this viewer cannot see) that was on the table and is no
 * longer there has its place held, while any entry aimed at it is still on
 * the stack. When the last goes: `linger` (ms from `now`) for the spells
 * that fizzled at it -- the fizzle plays at the spot -- else at once.
 */
export function nextHeld(
  memory: HeldMemory,
  battlefield: readonly BoardCard[],
  stack: readonly StackView[],
  now: number,
  fizzled: ReadonlySet<string>,
  linger: number,
): HeldMemory {
  const onTable = new Set(battlefield.map((c) => c.id));
  const aims = new Map<string, Set<string>>();
  for (const s of stack) {
    for (const id of [s.id, ...(s.members ?? [])]) {
      const seen = new Set(memory.aims.get(id) ?? []);
      for (const t of s.targets)
        if ("object" in t && t.object.startsWith("card:")) seen.add(t.object);
      aims.set(id, seen);
    }
  }
  const held = new Map<string, HeldSpot>();
  for (const [entry, cards] of aims) {
    for (const card of cards) {
      if (onTable.has(card)) continue;
      const was = memory.held.get(card)?.card ?? memory.cards.get(card);
      if (!was) continue;
      const spot = held.get(card);
      held.set(card, { card: was, by: new Set([...(spot?.by ?? []), entry]) });
    }
  }
  for (const [card, spot] of memory.held) {
    if (held.has(card) || onTable.has(card)) continue;
    // Its last spell just fizzled at it: held while the fizzle plays.
    if (spot.until === undefined && [...spot.by].some((entry) => fizzled.has(entry)) && linger > 0)
      held.set(card, { card: spot.card, by: spot.by, until: now + linger });
    else if (spot.until !== undefined && spot.until > now) held.set(card, spot);
  }
  return { aims, cards: new Map(battlefield.map((c) => [c.id, c])), held };
}

/** The stand-in drawn at a held spot: the card as it stood, alone (never in a pile), doing nothing. */
export function heldCard(spot: HeldSpot, card: string): BoardCard {
  return {
    ...spot.card,
    id: heldId(card),
    held: true,
    attacking: false,
    blocking: false,
    attachedTo: null,
  };
}

/**
 * Spec 0082 -- each card of copies on its way (by its id), where it waits:
 * beside the stack card it copies (`spots`, the stack's boxes, top first),
 * a second card for the same original under the first. One whose original
 * is not drawn waits beside the front card.
 */
export function waitingBoxes(
  copying: readonly StackView[],
  stack: readonly StackView[],
  spots: readonly Box[],
): Map<string, Box> {
  const out = new Map<string, Box>();
  const nth = new Map<number, number>();
  for (const w of copying) {
    const j = w.copyOf
      ? stack
          .slice(0, spots.length)
          .findIndex((e) => e.id === w.copyOf || e.members?.includes(w.copyOf!))
      : -1;
    const at = j >= 0 ? j : 0;
    const of = spots[at];
    if (!of) continue;
    const k = nth.get(at) ?? 0;
    nth.set(at, k + 1);
    out.set(w.id, besideBox(of, k));
  }
  return out;
}

/**
 * Spec 0082 -- the prepared mark's place on its creature (`box`, as drawn):
 * the badge column's first square (0076's placement), as a small card there,
 * for the cast copy to rise out of.
 */
export function preparedMarkBox(box: Box, cardW: number, cardH: number): Box {
  const side = box.h * 0.17;
  const cx = box.x + box.h * 0.03 + side / 2;
  const cy = box.y + box.h - box.h * 0.15 - side / 2;
  const k = (box.h * 0.24) / cardH;
  const w = cardW * k;
  const h = cardH * k;
  return { x: cx - w / 2, y: cy - h / 2, w, h, scale: k, rotation: 0, z: 0 };
}
