// Spec 0086 (10, owner C + B on the canvas gaps-players-1113) -- a turn
// starting, about forty times a game, so quick and never in the way:
//
//   - every turn, the new active player's plate lights up: a light runs
//     along its top edge (0.45 s), the shield glows (0.25-0.75 s), and the
//     turn number and the "whose turn" words roll over (0.3 s; the owner's
//     exception to rising numbers: a "+1" every turn would be noise);
//   - only when the turn becomes YOURS, a soft band of light also sweeps
//     across the table toward you (0.55 s);
//   - an extra turn (Time Warp) lights the same plate again; its report
//     window comes from the game (the worker's EXTRA_TURN report).
//
// Each is a Web Animation, so a click hurries it (A-00); with reduce motion
// nothing runs, rolls or sweeps -- the edge, the number and the words simply
// change.

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Snapshot } from "../match";
import type { Geometry } from "./layout";
import { reducedMotion, useHurry } from "./playerMarks";

/** The light along the plate's top edge (the canvas: 0.45 s). */
export const PLATE_RUN_MS = 450;
/** The shield's glow: from 0.25 s, for 0.5 s. */
export const SHIELD_GLOW_AT = 250;
export const SHIELD_GLOW_MS = 500;
/** The turn number and the words rolling over. */
export const ROLL_MS = 300;
/** The band across the table, toward you. */
export const SWEEP_MS = 550;

/** A turn began for [seat] on [now] (not the first board seen, not another game's). */
export function turnBeganFor(was: Snapshot | null, now: Snapshot, seat: number): boolean {
  if (!was || was.gameEpoch !== now.gameEpoch || now.turn <= was.turn) return false;
  return now.activeSeat === seat;
}

/** The turn became YOURS: it was not your turn before (an extra turn of yours does not sweep again). */
export function turnBecameYours(was: Snapshot | null, now: Snapshot): boolean {
  if (now.spectator || !was || was.gameEpoch !== now.gameEpoch || now.turn <= was.turn)
    return false;
  return now.activeSeat === now.seat && was.activeSeat !== now.seat;
}

export function runFrames(width: number): Keyframe[] {
  return [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    offset: t,
    transform: `translateX(${(t * width).toFixed(1)}px) scaleX(${(1 + 0.85 * Math.sin(Math.PI * t)).toFixed(3)})`,
    opacity: t === 0 || t === 1 ? 0 : Math.min(1, Math.sin(Math.PI * t) * 1.6),
  }));
}

const SHIELD_FRAMES: Keyframe[] = [
  { offset: 0, filter: "drop-shadow(0 0 0 rgb(240 190 90 / 0%))" },
  { offset: 0.5, filter: "drop-shadow(0 0 12px rgb(240 190 90 / 100%))" },
  { offset: 1, filter: "drop-shadow(0 0 0 rgb(240 190 90 / 0%))" },
];

/** Lights [plate]'s top edge and glows [shield] when a turn begins for [seat]. */
export function usePlateLight(
  board: Snapshot,
  seat: number,
  run: RefObject<HTMLElement | null>,
  shield: RefObject<HTMLElement | null>,
): void {
  const was = useRef<Snapshot | null>(null);
  const [lit, setLit] = useState(0);
  useLayoutEffect(() => {
    const before = was.current;
    was.current = board;
    if (!turnBeganFor(before, board, seat) || reducedMotion()) return;
    const el = run.current;
    if (!el || typeof el.animate !== "function") return;
    const width = el.parentElement?.offsetWidth || 216;
    el.animate(runFrames(width), { duration: PLATE_RUN_MS, easing: "linear" });
    shield.current?.animate?.(SHIELD_FRAMES, {
      duration: SHIELD_GLOW_MS,
      delay: SHIELD_GLOW_AT,
      easing: "ease-in-out",
    });
    setLit((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per board
  }, [board]);
  useHurry(run, lit > 0);
}

/** Words or a number that roll over when they change: the old out the top, the new in from below. */
export function Rolling({ value, className }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [old, setOld] = useState<{ text: string; key: number } | null>(null);
  const last = useRef(value);
  useLayoutEffect(() => {
    const before = last.current;
    last.current = value;
    if (before === value || reducedMotion()) {
      setOld(null);
      return;
    }
    setOld({ text: before, key: performance.now() });
  }, [value]);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!old || !root) return;
    const out = root.querySelector<HTMLElement>(".gs-roll-old");
    const now = root.querySelector<HTMLElement>(".gs-roll-new");
    if (typeof now?.animate !== "function") return;
    out?.animate(
      [
        { transform: "translateY(0)", opacity: 1 },
        { transform: "translateY(-100%)", opacity: 0 },
      ],
      { duration: ROLL_MS, easing: "cubic-bezier(0.33, 1, 0.68, 1)", fill: "forwards" },
    );
    const roll = now.animate(
      [
        { transform: "translateY(100%)", opacity: 0 },
        { transform: "translateY(0)", opacity: 1 },
      ],
      { duration: ROLL_MS, easing: "cubic-bezier(0.33, 1, 0.68, 1)" },
    );
    const done = () => setOld((o) => (o?.key === old.key ? null : o));
    roll.onfinish = done;
    roll.oncancel = done;
  }, [old]);
  useHurry(ref, old !== null);
  return (
    <span ref={ref} className="gs-roll" data-rolling={old ? "true" : undefined}>
      {old && (
        <span className="gs-roll-old" aria-hidden="true">
          {old.text}
        </span>
      )}
      <span className={`gs-roll-new${className ? ` ${className}` : ""}`}>{value}</span>
    </span>
  );
}

/**
 * The band of light across the table toward you, when the turn becomes
 * yours (owner C). Put in the board's overlay; nothing to click.
 */
export function TurnSweep({ board, geometry }: { board: Snapshot; geometry: Geometry }) {
  const ref = useRef<HTMLDivElement>(null);
  const was = useRef<Snapshot | null>(null);
  const [sweeping, setSweeping] = useState(0);
  useLayoutEffect(() => {
    const before = was.current;
    was.current = board;
    if (!turnBecameYours(before, board) || reducedMotion()) return;
    setSweeping((n) => n + 1);
  }, [board]);
  const play = geometry.play;
  useLayoutEffect(() => {
    const el = ref.current;
    if (sweeping === 0 || !el || typeof el.animate !== "function") return;
    const band = Math.max(80, play.h * 0.13);
    const from = play.y - band / 2;
    const to = play.y + play.h - band / 2;
    const sweep = el.animate(
      [0, 0.25, 0.5, 0.75, 1].map((t) => {
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        return {
          offset: t,
          transform: `translateY(${(from + (to - from) * e).toFixed(1)}px)`,
          opacity: t === 0 || t === 1 ? 0 : Math.min(1, Math.sin(Math.PI * t) * 1.4),
        };
      }),
      { duration: SWEEP_MS, easing: "linear", fill: "both" },
    );
    const done = () => setSweeping(0);
    sweep.onfinish = done;
    sweep.oncancel = done;
  }, [sweeping, play.y, play.h]);
  useHurry(ref, sweeping > 0);
  if (sweeping === 0) return null;
  return (
    <div
      ref={ref}
      className="gs-turn-sweep"
      aria-hidden="true"
      data-sweep={sweeping}
      style={{ left: play.x, width: play.w, height: Math.max(80, play.h * 0.13) }}
    />
  );
}
