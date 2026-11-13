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

/** One mark, as the Board's FightMark takes it. */
export interface SurviveMark {
  key: string;
  kind: "dome" | "spark" | "ward" | "number" | "shieldbreak";
  style: Record<string, string | number>;
  frames: Keyframe[];
  duration: number;
  delay: number;
  text?: string;
  of: string;
  /** The number's colour: grey (nothing dealt) or gold (bounced off the dome). */
  tone?: "grey" | "gold" | "green";
}

/** The dome: up in 120 ms, flickering; held; gone by 1 s (the canvas's F1). */
export const DOME_MS = 1000;
/** Its size round the card (the canvas's 1.7 x 1.32 of the card). */
export const DOME_W = 1.7;
export const DOME_H = 1.32;
/** The prevention shield: up, the ripple at the blow, gone (the canvas's domeAt). */
export const WARD_MS = 1200;
/** The shield mark breaking. */
export const BREAK_MS = 600;
export const SPARK_MS = 450;
/** A grey "0" (or the gold number off the dome), rising as the fights' numbers do. */
export const ZERO_MS = 1400;

const centre = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

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
  const start = Math.max(0, delay - 80);
  const at = (ms: number) => Math.min(1, ms / DOME_MS);
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
      delay + 40,
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
  const start = Math.max(0, delay - 120);
  const lead = (delay - start) / WARD_MS;
  const out: SurviveMark[] = [
    {
      key: `${key}:ward`,
      kind: "ward",
      style: { left: at.x - r, top: at.y - r, width: 2 * r, height: 2 * r },
      frames: [
        { offset: 0, opacity: 0, transform: "scale(0.85)" },
        { offset: Math.min(0.5, lead), opacity: 1, transform: "scale(1)" },
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
      delay: delay + 50,
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
      delay + 120,
      of,
      "green",
      10,
    ),
  ];
}
