// Spec 0084, item 3 (owner 2026-11-13, canvas "gaps-moves-1113", 6 B ·
// "Power flows in") -- a permanent becoming a creature, and back.
//
// Pure, like motion.ts: the canvas's numbers and the marks they make. The
// Board decides what came alive (a permanent whose kind the game now says is
// "creature", that was not on the board drawn before), and what made it so:
// the creatures that crewed it (the game's `crewed`), or its own ability (the
// stack entry that just resolved). These say how it looks.
//
//   Comes alive: gold motes run from the cause into the card; a gold ring
//   breathes out from it and the card breathes (a little bigger, a gold
//   glow); it slides to the creature line (the layout's own move, held until
//   then); its power/toughness pops in as a green "3/3" rises (0078).
//   End of turn: a grey ring closes in on it, a grey "3/3" rises off, and
//   it slides back to its line.

import type { Box } from "./layout";
import type { Point } from "./motion";

/** The motes run for this long (the canvas's 0.5 s): each one half of it, spread over the other half. */
export const ALIVE_MOTES_MS = 500;
export const ALIVE_MOTE_COUNT = 12;
/** The breath, and the gold ring opening (the canvas's 0.35 s and 0.45 s). */
export const ALIVE_PULSE_MS = 350;
export const ALIVE_RING_MS = 450;
/** End of turn: the grey ring closes (0.4 s); it slides back after 0.3 s. */
export const ALIVE_CLOSE_MS = 400;
export const ALIVE_BACK_MS = 300;
/** The rising number's life (0078's). */
export const ALIVE_FLOAT_MS = 1100;
/** The number's pop on the card (0078's). */
export const ALIVE_POP_MS = 240;

/** A mark, as the board draws its fights' marks. */
export interface AliveMark {
  key: string;
  kind: "mote" | "alivering" | "ptfloat";
  style: Record<string, string | number>;
  frames: Keyframe[];
  duration: number;
  delay: number;
  text?: string;
  of: string;
  tone?: "grey";
}

/** When each part plays, from `start` (ms): the motes (if any), the pulse, the slide, the number. */
export function aliveTimes(
  start: number,
  motes: boolean,
  moveMs: number,
): { motes: number; pulse: number; slide: number; number: number } {
  const pulse = start + (motes ? ALIVE_MOTES_MS : 0);
  const slide = pulse + ALIVE_PULSE_MS;
  return { motes: start, pulse, slide, number: slide + moveMs };
}

const centre = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const easeIO = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const easeOut = (p: number) => 1 - (1 - p) ** 3;

/** The gold motes from each cause to the card (the canvas's streamSet). */
export function moteMarks(
  key: string,
  from: readonly Point[],
  to: Box,
  at: number,
  of: string,
): AliveMark[] {
  const size = Math.max(4, to.h * 0.08);
  const b = centre(to);
  const marks: AliveMark[] = [];
  const each = ALIVE_MOTES_MS / 2;
  from.forEach((a, n) => {
    for (let i = 0; i < ALIVE_MOTE_COUNT; i++) {
      const frames: Keyframe[] = [];
      for (let k = 0; k <= 8; k++) {
        const q = k / 8;
        const e = easeIO(q);
        const dx = (b.x - a.x) * e + Math.sin(i * 1.7 + q * 6) * size * 0.8;
        const dy = (b.y - a.y) * e - to.h * 0.37 * Math.sin(Math.PI * q);
        frames.push({
          offset: q,
          opacity: k === 8 ? 0 : Math.min(1, q * 6),
          transform: `translate(${dx}px, ${dy}px)`,
        });
      }
      marks.push({
        key: `${key}:mote:${n}:${i}`,
        kind: "mote",
        style: { left: a.x - size / 2, top: a.y - size / 2, width: size, height: size },
        frames,
        duration: each,
        delay: at + (i / ALIVE_MOTE_COUNT) * each,
        of,
      });
    }
  });
  return marks;
}

/**
 * The ring: gold, opening from 0.34 to 0.95 of the card's height and fading
 * (comes alive); grey, closing from 0.95 to 0.34 and back (end of turn).
 */
export function ringMark(
  key: string,
  box: Box,
  at: number,
  of: string,
  closing: boolean,
): AliveMark {
  const c = centre(box);
  const big = box.h * 0.95 * 2;
  const small = box.h * 0.34 * 2;
  const frames: Keyframe[] = closing
    ? [0, 0.25, 0.5, 0.75, 1].map((q) => {
        const d = big - (big - small) * q ** 3;
        return {
          offset: q,
          opacity: 0.8 * Math.sin(Math.PI * q),
          transform: `translate(-50%, -50%) scale(${d / big})`,
        };
      })
    : [0, 0.04, 0.25, 0.5, 0.75, 1].map((q) => {
        const d = small + (big - small) * easeOut(q);
        // Unseen until it starts (the mark is held at its first frame while it waits).
        return {
          offset: q,
          opacity: q === 0 ? 0 : 1 - q,
          transform: `translate(-50%, -50%) scale(${d / big})`,
        };
      });
  return {
    key: `${key}:ring`,
    kind: "alivering",
    style: { left: c.x, top: c.y, width: big, height: big },
    frames,
    duration: closing ? ALIVE_CLOSE_MS : ALIVE_RING_MS,
    delay: at,
    of,
    ...(closing ? { tone: "grey" as const } : {}),
  };
}

/** The power/toughness rising off the card's right (0078's float): green in, grey off. */
export function ptFloat(
  key: string,
  box: Box,
  text: string,
  at: number,
  of: string,
  off: boolean,
): AliveMark {
  const c = centre(box);
  return {
    key: `${key}:pt`,
    kind: "ptfloat",
    style: {
      left: c.x + box.w / 2 + box.h * 0.29,
      top: c.y - box.h * 0.05,
      fontSize: box.h * 0.26,
    },
    frames: [
      { offset: 0, opacity: 0, transform: "translate(-50%, -50%) translateY(0px)" },
      { offset: 0.12, opacity: 1 },
      { offset: 0.7, opacity: 1 },
      { offset: 1, opacity: 0, transform: `translate(-50%, -50%) translateY(${-box.h * 0.32}px)` },
    ],
    duration: ALIVE_FLOAT_MS,
    delay: at,
    text,
    of,
    ...(off ? { tone: "grey" as const } : {}),
  };
}

/** The card's breath: a little bigger and gold for a moment (composited onto its own transform). */
export function breathFrames(): Keyframe[] {
  return [
    { offset: 0, transform: "scale(1)", filter: "drop-shadow(0 0 0 rgba(242, 196, 106, 0))" },
    {
      offset: 0.5,
      transform: "scale(1.08)",
      filter: "drop-shadow(0 0 12px rgba(242, 196, 106, 0.85))",
    },
    { offset: 1, transform: "scale(1)", filter: "drop-shadow(0 0 0 rgba(242, 196, 106, 0))" },
  ];
}

/** Its number hidden until it arrives, then popping in (0078's pop). */
export function numberInFrames(wait: number): { frames: Keyframe[]; duration: number } {
  const duration = wait + ALIVE_POP_MS;
  const at = (ms: number) => Math.min(1, ms / duration);
  return {
    frames: [
      { offset: 0, opacity: 0, transform: "scale(1)" },
      { offset: at(wait), opacity: 0, transform: "scale(1)" },
      { offset: at(wait + ALIVE_POP_MS / 2), opacity: 1, transform: "scale(1.35)" },
      { offset: 1, opacity: 1, transform: "scale(1)" },
    ],
    duration,
  };
}
