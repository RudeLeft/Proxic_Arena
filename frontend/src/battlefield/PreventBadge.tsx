// Spec 0125, item 2 (owner 2026-11-27, "On the life shield"; canvas
// a6-menace-and-prevention, "Prevent: Option A" and "part of a hit") -- a
// player's "prevent the next N damage" (Healing Salve on yourself): the
// creature's pale round badge (spec 0101, row 7), touching the life shield at
// its lower right, the poison drop's mirror (poison sits at the lower left,
// so both can show at once). It grows in as the effect arrives. When a hit is
// stopped by it on this board (the damage wave's `by: "prevent-next"`), its
// number ticks down one step at a time (PREVENT_STEP_MS) from the moment the
// blow lands -- a combat blow at its moment on the fight clock, a resolving
// spell's at the creature square's beat (PREVENT_TICK_AT_MS) -- and at 0 it
// shrinks away; when the
// effect simply ends (the turn ends), it shrinks away. The same on both
// screens; no window. A click hurries it, as the board's own movements.
// With reduce motion: no growing, ticking or shrinking; the count shows.

import { sameProps } from "./sameProps";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { paced, hurry } from "./motion";
import { PREVENT_STEP_MS, PREVENT_TICK_AT_MS } from "./CardBadges";
import { onLifeClocks, preventedBlowIn } from "./lifeTicks";

/** As it arrives: the badge grows in at its place. */
const GROW_FRAMES: Keyframe[] = [
  { transform: "scale(0)", opacity: 0, offset: 0 },
  { transform: "scale(1.2)", opacity: 1, offset: 0.6, filter: "drop-shadow(0 0 8px #dff0ff)" },
  {
    transform: "scale(1)",
    opacity: 1,
    offset: 1,
    filter: "drop-shadow(0 0 0 rgb(223 240 255 / 0%))",
  },
];
export const PREVENT_GROW_MS = paced(420);
/** Gone: it shrinks away (0101's square: 150 ms) after the last step. */
export const PREVENT_GONE_MS = paced(150);

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : true;
}

/** The hover words: "Prevent the next 3 damage to Bob this turn" ("to you" on your own plate). */
export function preventWords(n: number, who: string): string {
  return `Prevent the next ${n} damage to ${who} this turn`;
}

interface Leaving {
  from: number;
  to: number;
  /** Used by a hit on this board: the count ticks down first. Else it only goes. */
  tick: boolean;
  key: number;
}

function PreventBadgeView({
  seat,
  count,
  soaked,
  who,
}: {
  /** Whose plate (the player's seat). */
  seat: number;
  /** What is left to prevent this turn (the player's `preventNext`; 0: none). */
  count: number;
  /** The damage wave's key when a hit on this player was stopped by it on this board; else null. */
  soaked: string | null;
  /** The player's name, or "you" on your own plate. */
  who: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  const lastCount = useRef(count);
  const grew = useRef(count > 0);
  if (lastCount.current !== count) {
    const was = lastCount.current;
    lastCount.current = count;
    if (count < was && !reducedMotion() && (soaked || count === 0))
      setLeaving({ from: was, to: count, tick: soaked !== null, key: Date.now() });
    else if (leaving && count > leaving.to) setLeaving(null);
  }
  // The first count: the badge grows in (not on the first board drawn).
  useEffect(() => {
    if (count <= 0) {
      grew.current = false;
      return;
    }
    if (grew.current) return;
    grew.current = true;
    const el = ref.current;
    if (!el || typeof el.animate !== "function" || reducedMotion()) return;
    el.animate(GROW_FRAMES, { duration: PREVENT_GROW_MS, easing: "ease-out" });
  }, [count]);
  // The tick and the shrink, each on the page's animation clock. The tick
  // starts as the blow lands: a combat or fight blow at its moment on the
  // fight clock (when its pale shield or red "−N" shows on the life shield,
  // lifeTicks' preventedBlowIn), a resolving spell's on the creature square's
  // beat (PREVENT_TICK_AT_MS). The fight clock may start just after this
  // plate is drawn (the board's own layout effect): then it is timed again.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!leaving || !el || typeof el.animate !== "function") return undefined;
    const made: Animation[] = [];
    let startsAt = Number.NaN;
    const done = () => setLeaving((now) => (now?.key === leaving.key ? null : now));
    const play = (start: number) => {
      for (const a of made.splice(0)) {
        a.onfinish = null;
        a.oncancel = null;
        a.cancel();
      }
      startsAt = performance.now() + start;
      const steps = [...el.querySelectorAll<HTMLElement>("[data-prevent-step]")];
      // Each count in its window: the first until the tick starts, then one
      // a step; the last (what is left) stays.
      steps.forEach((step, i) => {
        const at = i === 0 ? 0 : start + (i - 1) * PREVENT_STEP_MS;
        const last = i === steps.length - 1;
        made.push(
          step.animate(
            [
              { offset: 0, opacity: 1 },
              { offset: 1, opacity: 1 },
            ],
            {
              duration: last ? 1 : i === 0 ? start : PREVENT_STEP_MS,
              delay: at,
              easing: "linear",
              fill: last ? "forwards" : "none",
            },
          ),
        );
      });
      const ticked = leaving.tick ? start + (steps.length - 1) * PREVENT_STEP_MS : 0;
      const end =
        leaving.to > 0
          ? el.animate([{ opacity: 1 }, { opacity: 1 }], { duration: ticked || 1 })
          : el.animate(
              [
                { offset: 0, transform: "scale(1)", opacity: 1 },
                { offset: 1, transform: "scale(0)", opacity: 0 },
              ],
              { duration: PREVENT_GONE_MS, delay: ticked, easing: "ease-in", fill: "forwards" },
            );
      end.onfinish = done;
      end.oncancel = done;
      made.push(end);
    };
    const blowAt = () => (leaving.tick ? (preventedBlowIn(seat) ?? PREVENT_TICK_AT_MS) : 0);
    play(blowAt());
    if (!leaving.tick) return undefined;
    // A clock started (or ended) before the tick began: timed again from it.
    return onLifeClocks(() => {
      const left = startsAt - performance.now();
      const blow = preventedBlowIn(seat);
      if (left <= 0 || blow === null || Math.abs(blow - left) < 1) return;
      play(blow);
    });
  }, [leaving, seat]);
  // A click or a key hurries it, as the board does with its own movements.
  useEffect(() => {
    const el = ref.current;
    if (!el || !leaving) return undefined;
    const now = () => hurry(el);
    document.addEventListener("pointerdown", now, true);
    document.addEventListener("keydown", now, true);
    return () => {
      document.removeEventListener("pointerdown", now, true);
      document.removeEventListener("keydown", now, true);
    };
  }, [leaving]);
  if (count <= 0 && !leaving) return null;
  const steps =
    leaving && leaving.tick
      ? Array.from({ length: leaving.from - leaving.to + 1 }, (_, i) => leaving.from - i)
      : [leaving ? leaving.from : count];
  return (
    <span
      ref={ref}
      className="gs-prevent"
      data-prevent={count}
      data-used={leaving?.tick ? `${leaving.from}-${leaving.to}` : undefined}
      data-gone={leaving && leaving.to === 0 ? "true" : undefined}
      title={preventWords(count > 0 ? count : (leaving?.from ?? count), who)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10.6" className="gs-prevent-face" />
      </svg>
      {steps.map((k) => (
        <b
          key={k}
          className={`gs-prevent-n${steps.length > 1 ? " gs-prevent-step" : ""}`}
          data-prevent-step={steps.length > 1 ? k : undefined}
        >
          {k}
        </b>
      ))}
    </span>
  );
}

export const PreventBadge = memo(PreventBadgeView, sameProps);
