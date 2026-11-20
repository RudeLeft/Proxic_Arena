// Spec 0080 (owner 2026-11-12, canvas survive-1112) -- cards that survive,
// and damage that never landed. Pure, like fights.ts: from where a card or a
// player's shield stands and when the blow lands, the marks to play -- each
// one animation on the board's clock (A-00: a click hurries it). The Board
// only applies them. Nothing here decides that a card survived or that
// damage was prevented: the game says so (`survived`, a hit's `prevented`).
//
//   Q3 B   regenerated: the shield mark breaks -- it bursts in green with
//          green sparks -- instead of the card.
//   Q4b F1 indestructible: a gold hex-grid dome flickers up round the card at
//          the blow, sparks bounce off top and bottom, and it fades.
//   Q5 A   prevented: a pale see-through round shield in front of what was
//          hit soaks the blow up (it ripples), and a grey "0" rises.
//          Protection from a colour stopping a spell uses the same shield.
//
// The two must never read alike: the dome is gold, a hex grid, wrapped round
// the card; the prevention shield is pale blue-white, round, in front.

import type { Box } from "./layout";
import type { Point } from "./motion";
import { paced } from "./motion";

/** One mark, as the Board's FightMark takes it. */
export interface SurviveMark {
  key: string;
  kind:
    | "dome"
    | "spark"
    | "ward"
    | "number"
    | "shieldbreak"
    | "regenshield"
    | "silvershield"
    | "shard"
    | "wardring";
  style: Record<string, string | number>;
  frames: Keyframe[];
  duration: number;
  delay: number;
  text?: string;
  of: string;
  /** The number's colour: grey (nothing dealt) or gold (bounced off the dome). */
  tone?: "grey" | "gold" | "green" | "silver";
}

/** The dome: up in 120 ms, flickering; held; gone by 1 s (the canvas's F1). */
export const DOME_MS = paced(1000);
/** Its size round the card (the canvas's 1.7 x 1.32 of the card). */
export const DOME_W = 1.7;
export const DOME_H = 1.32;
/** The prevention shield: up, the ripple at the blow, gone (the canvas's domeAt). */
export const WARD_MS = paced(1200);
/** The shield mark breaking. */
export const BREAK_MS = paced(600);
export const SPARK_MS = paced(450);
/** A grey "0" (or the gold number off the dome), rising as the fights' numbers do. */
export const ZERO_MS = 1400; // not paced: a wait (spec 0106)

const centre = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

// Spec 0101 (combat Q6 v3, missed Q3 A; owner 2026-11-17) -- one shared
// lead: every shield shape is fully up SHIELD_UP_MS before the blow (it
// takes SHAPE_IN_MS to come up), and every save shows a grey number rising
// (greyNumber: 0 when nothing got through, or the damage it lived through).
// New shapes: regeneration's green shield over the card, a shield counter's
// silver heater shield that cracks and shatters, ward's ring.

/** Spec 0101 -- every shield shape is fully up this long before the blow. */
export const SHIELD_UP_MS = paced(150);
/** ...and takes this long to come up. */
export const SHAPE_IN_MS = paced(120);
/** When a shape starts coming up, for a blow at `delay` (never before now). */
export const shapeStart = (delay: number) => Math.max(0, delay - SHIELD_UP_MS - SHAPE_IN_MS);

/**
 * Spec 0101 -- the grey number a save shows, rising off the card's top
 * (`at`) as 0080's "0" does: "0" when nothing got through, else the damage
 * the card lived through.
 */
export function greyNumber(
  key: string,
  at: Point,
  text: string,
  delay: number,
  fontSize: number,
  of: string,
): SurviveMark {
  return {
    key: `${key}:grey`,
    kind: "number",
    style: { left: at.x, top: at.y, fontSize },
    frames: [
      { offset: 0, opacity: 0, transform: "translate(-50%, -50%) translateY(-30%) scale(1.6)" },
      { offset: 0.18, opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
      { offset: 0.8, opacity: 1, transform: "translate(-50%, -50%) translateY(-25%) scale(1)" },
      { offset: 1, opacity: 0, transform: "translate(-50%, -50%) translateY(-40%) scale(1)" },
    ],
    duration: ZERO_MS,
    delay,
    text,
    of,
    tone: "grey",
  };
}

/** Where a card's grey number rises: just over its top edge (the canvas's 0.58 of its height up from the middle). */
export const numberPoint = (box: Box): Point => ({
  x: box.x + box.w / 2,
  y: box.y + box.h / 2 - box.h * 0.58,
});

/** Spec 0101, row 1 -- the green shield holds this long after the blow, then bursts. */
export const REGEN_BURST_AT = paced(350);
export const REGEN_BURST_MS = paced(200);

/**
 * Spec 0101, row 1 (combat Q6 v3) -- a green shield comes up over the card
 * (fully up SHIELD_UP_MS before the blow), takes the hit, then bursts with
 * green sparks REGEN_BURST_AT after it.
 */
export function regenShieldMarks(key: string, box: Box, delay: number, of: string): SurviveMark[] {
  const c = centre(box);
  const w = box.w * 0.92;
  const h = box.h * 0.78;
  const start = shapeStart(delay);
  const end = delay + REGEN_BURST_AT + REGEN_BURST_MS;
  const total = end - start;
  const at = (ms: number) => Math.min(1, Math.max(0, (ms - start) / total));
  return [
    {
      key: `${key}:regenshield`,
      kind: "regenshield",
      style: { left: c.x - w / 2, top: c.y - h / 2, width: w, height: h },
      frames: [
        { offset: 0, opacity: 0, transform: "scale(0.5)" },
        { offset: at(start + SHAPE_IN_MS), opacity: 1, transform: "scale(1)" },
        { offset: at(delay), opacity: 1, transform: "scale(1)" },
        { offset: at(delay + paced(60)), opacity: 1, transform: "scale(1.06)" },
        { offset: at(delay + REGEN_BURST_AT), opacity: 1, transform: "scale(1)" },
        { offset: 1, opacity: 0, transform: "scale(1.5)" },
      ],
      duration: total,
      delay: start,
      of,
    },
    ...sparks(`${key}:regen`, c, box.h * 0.6, delay + REGEN_BURST_AT, of, "green", 12),
  ];
}

/** Spec 0101, row 3 -- the silver shield cracks at the blow and shatters this long after. */
export const SILVER_SHATTER_AT = paced(550);
export const SILVER_GONE_MS = paced(120);
export const SILVER_SHARDS = 10;
export const SILVER_SHARD_MS = paced(600);

/**
 * Spec 0101, row 3 (missed Q3 A) -- a shield counter used: the silver
 * (steel-blue) heater shield grows over the card, fully up SHIELD_UP_MS
 * before the blow, takes it and cracks (the crack shows from `--crack-at`,
 * the blow), then shatters into pieces SILVER_SHATTER_AT after.
 */
export function silverShieldMarks(key: string, box: Box, delay: number, of: string): SurviveMark[] {
  const c = centre(box);
  const k = box.h / 135;
  const w = 106 * k;
  const h = 130 * k;
  const start = shapeStart(delay);
  const end = delay + SILVER_SHATTER_AT + SILVER_GONE_MS;
  const total = end - start;
  const at = (ms: number) => Math.min(1, Math.max(0, (ms - start) / total));
  const out: SurviveMark[] = [
    {
      key: `${key}:silver`,
      kind: "silvershield",
      style: {
        left: c.x - w / 2,
        top: c.y - h / 2,
        width: w,
        height: h,
        ["--crack-at"]: `${delay}ms`,
      },
      frames: [
        { offset: 0, opacity: 0, transform: "scale(0.72)" },
        { offset: at(start + SHAPE_IN_MS), opacity: 1, transform: "scale(1)" },
        { offset: at(delay), opacity: 1, transform: "scale(1)" },
        { offset: at(delay + paced(120)), opacity: 1, transform: "scale(1.08)" },
        { offset: at(delay + paced(250)), opacity: 1, transform: "scale(1)" },
        { offset: at(delay + SILVER_SHATTER_AT), opacity: 1, transform: "scale(1)" },
        { offset: 1, opacity: 0, transform: "scale(1)" },
      ],
      duration: total,
      delay: start,
      of,
    },
  ];
  const ease = (q: number) => 1 - (1 - q) ** 3;
  for (let i = 0; i < SILVER_SHARDS; i++) {
    const a = (i / SILVER_SHARDS) * Math.PI * 2 + 0.5;
    const r = 78 * k;
    out.push({
      key: `${key}:silvershard:${i}`,
      kind: "shard",
      style: {
        left: c.x,
        top: c.y,
        width: (10 + ((i * 7) % 10)) * k,
        height: (6 + ((i * 5) % 8)) * k,
      },
      frames: [0, 0.25, 0.5, 0.75, 1].map((q) => ({
        offset: q,
        opacity: 1 - q,
        transform: `translate(${(Math.cos(a) * r * ease(q)).toFixed(1)}px, ${(Math.sin(a) * r * ease(q) + 46 * k * q * q).toFixed(1)}px) rotate(${(i * 67 + q * 240).toFixed(0)}deg)`,
      })),
      duration: SILVER_SHARD_MS,
      delay: delay + SILVER_SHATTER_AT,
      of,
      tone: "silver",
    });
  }
  return out;
}

/** Spec 0101, row 6 -- the ring pulsing out from a warded creature (the canvas's 0.8 s, to 240 of a 135 card). */
export const WARD_RING_MS = paced(800);
export function wardRingMarks(key: string, box: Box, delay: number, of: string): SurviveMark[] {
  const c = centre(box);
  const r = (240 / 135) * box.h * 0.5;
  return [
    {
      key: `${key}:wardring`,
      kind: "wardring",
      style: { left: c.x - r, top: c.y - r, width: 2 * r, height: 2 * r },
      frames: [
        { offset: 0, opacity: 0.95, transform: "scale(0.25)" },
        { offset: 0.6, opacity: 0.5, transform: "scale(0.8)" },
        { offset: 1, opacity: 0, transform: "scale(1)" },
      ],
      duration: WARD_RING_MS,
      delay,
      of,
    },
  ];
}

/** Spec 0101, rows 2, 5, 6 -- a square's pulse or flare (the canvas's bump over 0.55 s). */
export const WARD_FLARE_MS = paced(550);
/** Ward's flare: swells x2.5 and glows pale blue. */
export function wardFlareFrames(): Keyframe[] {
  return [0, 0.25, 0.5, 0.75, 1].map((p) => {
    const b = Math.sin(Math.PI * p);
    return {
      offset: p,
      transform: `scale(${(1 + 1.5 * b).toFixed(3)})`,
      boxShadow:
        b > 0.01
          ? `0 0 ${(18 * b).toFixed(1)}px ${(6 * b).toFixed(1)}px rgb(159 196 255 / ${(0.9 * b).toFixed(2)}), 0 1px 3px #000a`
          : "0 1px 3px #000a",
    };
  });
}

/** Sparks thrown out from a point (the canvas's sparksAt): n of them, round it. */
export function sparks(
  key: string,
  at: Point,
  reach: number,
  delay: number,
  of: string,
  tone: "gold" | "green",
  n = 8,
): SurviveMark[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + 0.3;
    const dx = Math.cos(a) * reach;
    const dy = Math.sin(a) * reach;
    return {
      key: `${key}:spark:${i}`,
      kind: "spark" as const,
      style: { left: at.x, top: at.y },
      frames: [
        { offset: 0, opacity: 1, transform: "translate(0px, 0px)" },
        { offset: 1, opacity: 0, transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` },
      ],
      duration: SPARK_MS,
      delay,
      of,
      tone,
    };
  });
}

/**
 * Q4b F1 -- the hex dome round a card whose blow lands at `delay`: it
 * flickers up just before, swells a little with the blow, and fades; sparks
 * bounce off its top and bottom.
 */
export function domeMarks(key: string, box: Box, delay: number, of: string): SurviveMark[] {
  const c = centre(box);
  const w = box.w * DOME_W;
  const h = box.h * DOME_H;
  // Spec 0101: fully up (its 120 ms frame) SHIELD_UP_MS before the blow.
  const start = shapeStart(delay);
  const at = (ms: number) => Math.min(1, paced(ms) / DOME_MS);
  return [
    {
      key: `${key}:dome`,
      kind: "dome",
      style: { left: c.x - w / 2, top: c.y - h / 2, width: w, height: h },
      frames: [
        { offset: 0, opacity: 0, transform: "scale(0.9)" },
        { offset: at(40), opacity: 0.55, transform: "scale(0.94)" },
        { offset: at(70), opacity: 0.25, transform: "scale(0.96)" },
        { offset: at(120), opacity: 1, transform: "scale(1)" },
        { offset: at(200), opacity: 1, transform: "scale(1.05)" },
        { offset: at(420), opacity: 1, transform: "scale(1)" },
        { offset: at(550), opacity: 0.9, transform: "scale(1)" },
        { offset: 1, opacity: 0, transform: "scale(1)" },
      ],
      duration: DOME_MS,
      delay: start,
      of,
    },
    ...sparks(`${key}:top`, { x: c.x, y: c.y - h / 2 + 4 }, box.h * 0.32, delay, of, "gold"),
    ...sparks(
      `${key}:bottom`,
      { x: c.x, y: c.y + h / 2 - 4 },
      box.h * 0.32,
      delay + paced(40),
      of,
      "gold",
    ),
  ];
}

/**
 * Q5 A -- the pale shield in front of what was hit, `r` its radius, the blow
 * at `delay`; and a grey "0" rising off it (no number for a spell that found
 * nothing to hit: `zero` false).
 */
export function wardMarks(
  key: string,
  at: Point,
  r: number,
  delay: number,
  of: string,
  zero: boolean,
  fontSize: number,
  /** Where the "0" rises from: off to the life shield's left (as 0077's numbers), or the card's top. */
  numberAt: Point = at,
): SurviveMark[] {
  // Spec 0101: fully up SHIELD_UP_MS before the blow; it ripples at the blow.
  const start = shapeStart(delay);
  const up = Math.min(delay - start, SHAPE_IN_MS) / WARD_MS;
  const lead = (delay - start) / WARD_MS;
  const out: SurviveMark[] = [
    {
      key: `${key}:ward`,
      kind: "ward",
      style: { left: at.x - r, top: at.y - r, width: 2 * r, height: 2 * r },
      frames: [
        { offset: 0, opacity: 0, transform: "scale(0.85)" },
        { offset: Math.min(0.4, up), opacity: 1, transform: "scale(1)" },
        { offset: Math.min(0.5, Math.max(up, lead)), opacity: 1, transform: "scale(1)" },
        { offset: Math.min(0.6, lead + 0.12), opacity: 1, transform: "scale(1.08)" },
        { offset: Math.min(0.7, lead + 0.3), opacity: 1, transform: "scale(1)" },
        { offset: 0.75, opacity: 0.9, transform: "scale(1)" },
        { offset: 1, opacity: 0, transform: "scale(1)" },
      ],
      duration: WARD_MS,
      delay: start,
      of,
    },
  ];
  if (zero)
    out.push({
      key: `${key}:zero`,
      kind: "number",
      style: { left: numberAt.x, top: numberAt.y, fontSize },
      frames: [
        { offset: 0, opacity: 0, transform: "translate(-50%, -50%) translateY(-30%) scale(1.6)" },
        { offset: 0.18, opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
        { offset: 0.8, opacity: 1, transform: "translate(-50%, -50%) translateY(-25%) scale(1)" },
        { offset: 1, opacity: 0, transform: "translate(-50%, -50%) translateY(-40%) scale(1)" },
      ],
      duration: ZERO_MS,
      delay: delay + paced(50),
      text: "0",
      of,
      tone: "grey",
    });
  return out;
}

/**
 * Q3 B -- the shield mark at its place on the card (0076's lowest square at
 * the lower left, `markH` of the card high) bursting in green at `delay`,
 * with green sparks.
 */
export function shieldBreakMarks(
  key: string,
  box: Box,
  markH: number,
  floor: number,
  delay: number,
  of: string,
): SurviveMark[] {
  const size = box.h * markH;
  const left = box.x + box.h * 0.03;
  const top = box.y + box.h * (1 - floor) - size;
  return [
    {
      key: `${key}:break`,
      kind: "shieldbreak",
      style: { left, top, width: size, height: size, ["--card-h"]: `${box.h}px` },
      frames: [
        { offset: 0, opacity: 1, transform: "scale(1)", boxShadow: "0 0 0 0px #7be08a" },
        { offset: 0.3, opacity: 1, transform: "scale(1.6)", boxShadow: "0 0 0 4px #7be08a" },
        { offset: 1, opacity: 0, transform: "scale(2.2)", boxShadow: "0 0 18px 6px #7be08a00" },
      ],
      duration: BREAK_MS,
      delay,
      of,
    },
    ...sparks(
      key,
      { x: left + size / 2, y: top + size / 2 },
      box.h * 0.3,
      delay + paced(120),
      of,
      "green",
      10,
    ),
  ];
}
