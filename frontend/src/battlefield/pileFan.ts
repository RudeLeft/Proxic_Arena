// Spec 0087 (owner 2026-11-13, A · glow and a fan beside the plate; canvas
// gaps-marks-1113 sections 6-9, Amendment 1) -- the cards a player may still
// use from a graveyard or an exile stand in a small fan on the table just
// left of that player's plate, level with its Graveyard and Exile tiles (the
// bottom-right corner for your own, the top-right for the other player's),
// and those tiles glow gold.
//
// Pure, like fromSnapshot and layout: the snapshot in, the fan out. Which
// cards, and how each may be used, is the game's own list (the worker's
// `uses`, PileUses.java), never read off a card's name, type or text
// (UI-001); a card hidden from this viewer is a back with no name.

import type { Snapshot, SnapshotCard } from "../match";
import { BAND_EDGE, type Box, type Geometry, type Side } from "./layout";
import { exilePile } from "./fromSnapshot";

export type FanZone = "graveyard" | "exile";
export type FanHow = "cast" | "ability" | "suspended";

/** One card standing in a fan. */
export interface FanCard {
  id: string;
  /** Whose plate it stands beside: the player whose pile holds it. */
  side: Side;
  zone: FanZone;
  /** How it is used: a play ("cast"), only an ability, or counting down (suspended). */
  how: FanHow;
  /** This viewer may use it from there (so a click can cast it). */
  mine: boolean;
  name: string;
  kind: string;
  types: string;
  power: number | null;
  toughness: number | null;
  manaCost: string | null;
  art: string | null;
  crop: string | null;
  faceDown: boolean;
  known: boolean;
  /** A suspended card's time counters. */
  time: number | null;
  /** Amendment 1 -- the gold-rimmed square it wears: foretold (an eye) or plotted (a clock-hand). */
  square: "foretold" | "plotted" | null;
  /**
   * Spec 0106 -- when it arrived in its pile (Forge's timestamp, `enteredAt`;
   * else its place in the pile): past seven places the fan shows the newest.
   */
  at: number;
}

function timeOf(card: SnapshotCard): number | null {
  const c = card.counters.find((k) => k.name.toUpperCase() === "TIME");
  return c ? c.count : null;
}

/**
 * Every card in a graveyard or an exile some player may still use, in each
 * side's fan order: the graveyard's first, then the exile's, each in its
 * pile's order (the canvas: Think Twice, then the cards as they came).
 */
export function fanCards(snapshot: Snapshot): FanCard[] {
  // A spectator's board is drawn from `viewFrom`, its `seat` (match.ts); nothing is theirs.
  const viewer = snapshot.spectator ? null : snapshot.seat;
  const near = snapshot.seat;
  const out: FanCard[] = [];
  const add = (card: SnapshotCard, zone: FanZone, index: number) => {
    const uses = card.uses ?? [];
    if (uses.length === 0) return;
    const how: FanHow = uses.some((u) => u.how === "cast")
      ? "cast"
      : uses.some((u) => u.how === "ability")
        ? "ability"
        : "suspended";
    out.push({
      id: card.id,
      side: card.seat === near ? "viewer" : "opponent",
      zone,
      how,
      mine: viewer !== null && uses.some((u) => u.seat === viewer && u.how !== "suspended"),
      name: card.known ? card.name : "",
      kind: card.kind,
      types: card.known ? card.types : "",
      power: card.known ? card.power : null,
      toughness: card.known ? card.toughness : null,
      manaCost: card.known ? card.manaCost : null,
      art: card.known ? card.art : null,
      crop: card.known ? (card.crop ?? null) : null,
      // A card this viewer may identify is shown face up in the fan, even one
      // lying face down (your own foretold card, the canvas); one they may
      // not is a back.
      faceDown: !card.known,
      known: card.known,
      // At 0 the game sends no time counter; the badge still says 0 (its last −1).
      time: how === "suspended" ? (timeOf(card) ?? 0) : null,
      square: card.foretold ? "foretold" : card.plotted ? "plotted" : null,
      at: card.enteredAt ?? index,
    });
  };
  snapshot.graveyard.forEach((card, i) => add(card, "graveyard", i));
  exilePile(snapshot).forEach((card, i) => add(card, "exile", i));
  return out;
}

/**
 * Spec 0087 -- a fan card the game has moved to the stack whose spell is not
 * there yet (a suspended card cast at 0: one board has it in no list, the next
 * puts it on the stack). It keeps its place in the fan until then, so the cast
 * rises from where it stood -- never a card blinking out and a spell fading in.
 */
export function onTheirWay(snapshot: Snapshot, previous: Snapshot | null): FanCard[] {
  if (!previous || previous.gameEpoch !== snapshot.gameEpoch) return [];
  const was = new Map(fanCards(previous).map((c) => [c.id, c]));
  const out: FanCard[] = [];
  for (const move of snapshot.moves ?? []) {
    const card = move.card ? was.get(move.card) : undefined;
    if (!card || move.to.zone !== "stack") continue;
    const there =
      // (Its own "cast it" trigger, sourced from it, may be there: not the spell.)
      snapshot.stack.some((e) => e.source === card.id && (e.kind ?? "spell") === "spell") ||
      snapshot.casting.some((c) => c.id === card.id) ||
      [...snapshot.graveyard, ...snapshot.exile].some((c) => c.id === card.id);
    if (!there) out.push(card);
  }
  return out;
}

/** Which of a side's tiles glow: a card there someone may use now (a suspended one does not). */
export function pileGlows(cards: readonly FanCard[], side: Side): Record<FanZone, boolean> {
  const lit = (zone: FanZone) =>
    cards.some((c) => c.side === side && c.zone === zone && c.how !== "suspended");
  return { graveyard: lit("graveyard"), exile: lit("exile") };
}

// --- where the fan stands (the canvas's real table: 1920 x 1080 board px) ---

const CANVAS_H = 1080;
// Amendment 2 (owner, 2026-11-14: "move the fan off the lands") -- the fan
// stands in the strip between a side's band (where its land line ends,
// layout's BAND_EDGE: 94 px at 1080) and the screen's edge, never over a
// table line.
// Spec 0106 (owner 2026-11-19, Q4 B) -- whole cards, 88 x 63 at 1080, the
// whole strip: the corner sign sits inside the card's top-right corner (it
// no longer stands out above it), the cards stand 4 px apart and never
// overlap, and at most seven places: past that, six cards and a "+N".
/** The corner sign's size, of the card's height (battlefield.css .bf-fan-sign). */
export const FAN_SIGN = 0.2;
/** The fan keeps this far from the band (as the land line keeps from the hand). */
const FAN_LAND_GAP = 4 / CANVAS_H;
/** And this far inside the screen's edge. */
const FAN_EDGE = 2 / CANVAS_H;
/** A fan card's height: the strip, less its two gaps (88 px at 1080). */
export const FAN_H = BAND_EDGE - FAN_LAND_GAP - FAN_EDGE;
/** Between one fan card and the next (4 px at 1080): no overlap. */
export const FAN_GAP = 4 / CANVAS_H;
/** At most this many places in a fan; past it, the last place is "+N". */
export const FAN_PLACES = 7;
/** The fan's right end, this far left of the column. */
const FAN_RIGHT = 10 / CANVAS_H;
/** Each side's card top: just past its band at the bottom (990 at 1080); just inside the top edge for the other player. */
const FAN_TOP: Record<Side, number> = {
  viewer: 1 - BAND_EDGE + FAN_LAND_GAP,
  opponent: FAN_EDGE,
};
/** At most this much of the table's width. */
const FAN_MAX_W = 0.3;
/** The hand keeps this far from the fan. */
export const FAN_HAND_GAP = 16 / CANVAS_H;

/** The fan's z: above the table's cards, under the hand (Z_HAND 10000). */
export const Z_FAN = 9000;

/** A fan card's drawn size at this geometry. */
function fanSize(g: Geometry): { w: number; h: number; gap: number } {
  const h = FAN_H * g.height;
  return { w: h * (g.cardW / g.cardH), h, gap: FAN_GAP * g.height };
}

/**
 * How many places a fan has at this size: seven, or fewer where the table's
 * FAN_MAX_W cannot hold seven at the gap (narrower than the supported
 * screens, UI-006 best effort) -- fewer places, never an overlap.
 */
export function fanPlaces(g: Geometry): number {
  const { w, gap } = fanSize(g);
  const fit = Math.floor((FAN_MAX_W * g.play.w + gap) / (w + gap));
  return Math.max(1, Math.min(FAN_PLACES, fit));
}

/**
 * One side's fan split into what it shows and what the "+N" stands for:
 * all of it when it fits [places]; else the newest places - 1 (by `at`),
 * kept in the fan's order, and the rest behind the "+N".
 */
export function fanSplit(
  cards: readonly FanCard[],
  places: number = FAN_PLACES,
): { shown: FanCard[]; hidden: FanCard[] } {
  if (cards.length <= places) return { shown: [...cards], hidden: [] };
  const keep = new Set(
    cards
      .map((card, i) => ({ card, i }))
      .sort((a, b) => b.card.at - a.card.at || b.i - a.i)
      .slice(0, Math.max(0, places - 1))
      .map(({ card }) => card.id),
  );
  return {
    shown: cards.filter((c) => keep.has(c.id)),
    hidden: cards.filter((c) => !keep.has(c.id)),
  };
}

/** Spec 0106 -- the "+N" in a side's last place: how many it stands for, and the pile it opens. */
export interface FanMore {
  side: Side;
  /** The cards not shown. */
  count: number;
  /** The pile of the newest hidden card: the viewer's tab it opens. */
  zone: FanZone;
  box: Box;
}

/** How wide [n] fan cards are at this size (0 for none): at most its places. */
export function fanWidth(n: number, g: Geometry): number {
  if (n <= 0) return 0;
  const { w, gap } = fanSize(g);
  const k = Math.min(n, fanPlaces(g));
  return k * w + (k - 1) * gap;
}

/** Each shown fan card's box (its drawn size; `scale` against a table card), by id. */
export function fanBoxes(cards: readonly FanCard[], g: Geometry): Map<string, Box> {
  return fanLayout(cards, g).boxes;
}

/** Each side's "+N", when its fan has more cards than places. */
export function fanMore(cards: readonly FanCard[], g: Geometry): FanMore[] {
  return fanLayout(cards, g).more;
}

function fanLayout(
  cards: readonly FanCard[],
  g: Geometry,
): { boxes: Map<string, Box>; more: FanMore[] } {
  const boxes = new Map<string, Box>();
  const more: FanMore[] = [];
  const { w, h, gap } = fanSize(g);
  const scale = h / g.cardH;
  const pitch = w + gap;
  const places = fanPlaces(g);
  for (const side of ["viewer", "opponent"] as const) {
    const { shown, hidden } = fanSplit(
      cards.filter((c) => c.side === side),
      places,
    );
    const right = g.rail.x - FAN_RIGHT * g.height;
    const top = FAN_TOP[side] * g.height;
    const at = (i: number): Box => ({
      x: right - w - i * pitch,
      y: top,
      w,
      h,
      scale,
      rotation: 0,
      z: Z_FAN + i,
    });
    shown.forEach((card, i) => boxes.set(card.id, at(i)));
    if (hidden.length > 0) {
      const newest = hidden.reduce((a, b) => (b.at >= a.at ? b : a));
      more.push({ side, count: hidden.length, zone: newest.zone, box: at(shown.length) });
    }
  }
  return { boxes, more };
}

/** How far each side's fan reaches into the table from the column (for the hands). */
export function fanReach(counts: Record<Side, number>, g: Geometry): Record<Side, number> {
  const reach = (n: number) =>
    n === 0 ? 0 : fanWidth(n, g) + (FAN_RIGHT + FAN_HAND_GAP) * g.height;
  return { viewer: reach(counts.viewer), opponent: reach(counts.opponent) };
}
