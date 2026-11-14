// Spec 0077, item 5 (owner 2026-11-12, canvas life-1112 "A · Badge by the
// shield") -- a player's poison counters as a round badge in spec 0076's
// language (something you count: a picture and its number): a green-black
// drop with the count, touching the life shield at its lower left -- placed
// down and to the left far enough that it never covers the life number
// (owner) -- and a ring of 10 notches round it, one lit per counter (ten
// poison counters lose the game, CR 704.5c). It pulses as counters arrive
// and its full ring breathes at 10. It replaces the status tray's "N poison"
// chip. With reduce motion: no pulse, no breathing; the count shows.
//
// Spec 0083 (owner 2026-11-13, canvas gaps-polish-1113, 16 A) -- poison
// counters REMOVED (Leeches): the same dark pill as poison given, now "-N",
// rises off the badge; the notches go dark one by one (0077's 90 ms a point)
// as the badge swells a little; at zero the badge shrinks away. A click
// hurries it (A-00); with reduce motion the count just shows (none: gone).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Snapshot } from "../match";
import { hurry } from "./motion";

type Player = Snapshot["players"][number];

/** The poison counters Forge says a player has. */
export function poisonOf(player: Pick<Player, "counters">): number {
  return player.counters.find((c) => c.name.toUpperCase() === "POISON")?.count ?? 0;
}

/** The ring's notches: CR 704.5c's ten. */
export const POISON_NOTCHES = 10;

const R = 17.5;
const NOTCH_GAP = 0.06;

/** One notch's arc, the i-th of ten clockwise from the top, on the badge's 40x40 box. */
function notch(i: number): string {
  const a0 = (i / POISON_NOTCHES) * Math.PI * 2 - Math.PI / 2 + NOTCH_GAP;
  const a1 = ((i + 1) / POISON_NOTCHES) * Math.PI * 2 - Math.PI / 2 - NOTCH_GAP;
  const f = (n: number) => n.toFixed(2);
  return `M${f(Math.cos(a0) * R)} ${f(Math.sin(a0) * R)} A${R} ${R} 0 0 1 ${f(Math.cos(a1) * R)} ${f(Math.sin(a1) * R)}`;
}

const PULSE_FRAMES: Keyframe[] = [
  { transform: "scale(1.25)", filter: "drop-shadow(0 0 10px #7be08a)" },
  { transform: "scale(1)", filter: "drop-shadow(0 0 0 rgb(123 224 138 / 0%))" },
];
const PULSE_MS = 400;
/** The first counter: the badge grows in at its place, then pulses. */
const GROW_FRAMES: Keyframe[] = [
  { transform: "scale(0)", opacity: 0, offset: 0 },
  { transform: "scale(1.25)", opacity: 1, offset: 0.55, filter: "drop-shadow(0 0 10px #7be08a)" },
  {
    transform: "scale(1)",
    opacity: 1,
    offset: 1,
    filter: "drop-shadow(0 0 0 rgb(123 224 138 / 0%))",
  },
];
const GROW_MS = 520;

/** Spec 0083 (16 A) -- each notch goes dark this long after the one before (0077's point). */
export const UNPOISON_STEP_MS = 90;
/** The "-N" pill's rise (0077's, LIFE_MARK_MS). */
export const UNPOISON_PILL_MS = 1000;
/** At zero, the badge shrinks away from this long after the removal (the canvas's 0.67 s), over 0.3 s. */
export const UNPOISON_GONE_AT = 670;
export const UNPOISON_GONE_MS = 300;
const UNPOISON_SWELL: Keyframe[] = [
  { offset: 0, transform: "scale(1)" },
  { offset: 0.5, transform: "scale(1.15)" },
  { offset: 1, transform: "scale(1)" },
];
const UNPOISON_PILL: Keyframe[] = [
  { offset: 0, opacity: 0, transform: "translate(-50%, -50%) scale(0.6)" },
  { offset: 0.15, opacity: 1, transform: "translate(-50%, -110%) scale(1)" },
  { offset: 0.75, opacity: 1, transform: "translate(-50%, -150%) scale(1)" },
  { offset: 1, opacity: 0, transform: "translate(-50%, -170%) scale(1)" },
];

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : true;
}

/** The badge, or nothing at no poison. [pulses] counts the counters' arrivals: each new one pulses. */
export function PoisonBadge({ count, pulses }: { count: number; pulses: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useRef(pulses);
  // The count the badge showed before this pulse: none means it appears now.
  const shownBefore = useRef(count);
  // Spec 0083 -- counters taken away: from how many (the badge stays, at
  // zero too, until it has shrunk away).
  const [removed, setRemoved] = useState<{ from: number; to: number; key: number } | null>(null);
  const lastCount = useRef(count);
  if (lastCount.current !== count) {
    const was = lastCount.current;
    lastCount.current = count;
    if (count < was && !reducedMotion()) setRemoved({ from: was, to: count, key: Date.now() });
    else if (removed && count > removed.to) setRemoved(null);
  }
  useEffect(() => {
    const before = shownBefore.current;
    shownBefore.current = count;
    if (pulses === seen.current) return;
    seen.current = pulses;
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (before <= 0) el.animate(GROW_FRAMES, { duration: GROW_MS, easing: "ease-out" });
    else el.animate(PULSE_FRAMES, { duration: PULSE_MS, easing: "ease-out" });
  }, [pulses, count]);
  // Spec 0083 -- the removal's movements, each on the page's animation clock.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!removed || !el || typeof el.animate !== "function") return;
    el.animate(UNPOISON_SWELL, { duration: 500, easing: "linear" });
    const pill = el.querySelector<HTMLElement>(".gs-unpoison");
    const rise = pill?.animate(UNPOISON_PILL, {
      duration: UNPOISON_PILL_MS,
      easing: "linear",
      fill: "both",
    });
    // The notches that went dark, from the highest down, one a point.
    const dark = [...el.querySelectorAll<SVGPathElement>("[data-notch]")];
    for (let i = Math.min(removed.from, POISON_NOTCHES) - 1, k = 0; i >= removed.to; i--, k++) {
      dark[i]?.animate(
        [
          { offset: 0, stroke: "#9fe05a" },
          { offset: 1, stroke: "#9fe05a" },
        ],
        { duration: (k + 1) * UNPOISON_STEP_MS, easing: "steps(1, end)" },
      );
    }
    const done = () => setRemoved((now) => (now?.key === removed.key ? null : now));
    if (removed.to > 0) {
      // Counters left: the badge stays; the pill goes when it has risen.
      if (rise) {
        rise.onfinish = done;
        rise.oncancel = done;
      } else done();
      return;
    }
    const shrink = el.animate(
      [
        { offset: 0, transform: "scale(1)", opacity: 1 },
        { offset: 1, transform: "scale(0)", opacity: 0 },
      ],
      {
        duration: UNPOISON_GONE_MS,
        delay: UNPOISON_GONE_AT,
        easing: "cubic-bezier(0.65, 0, 0.35, 1)",
        fill: "forwards",
      },
    );
    shrink.onfinish = done;
    shrink.oncancel = done;
  }, [removed]);
  // A click or a key hurries it, as the board does with its own movements.
  useEffect(() => {
    const el = ref.current;
    if (!el || !removed) return undefined;
    const now = () => hurry(el);
    document.addEventListener("pointerdown", now, true);
    document.addEventListener("keydown", now, true);
    return () => {
      document.removeEventListener("pointerdown", now, true);
      document.removeEventListener("keydown", now, true);
    };
  }, [removed]);
  if (count <= 0 && !removed) return null;
  const lit = Math.min(count, POISON_NOTCHES);
  const words = `${count} poison counter${count === 1 ? "" : "s"}`;
  return (
    <span
      ref={ref}
      className={`gs-poison${count >= POISON_NOTCHES ? " gs-poison-full" : ""}`}
      data-poison={count}
      data-blows={pulses}
      data-unpoison={removed ? removed.from - removed.to : undefined}
      title={words}
    >
      {removed && (
        // The same dark pill as poison given (Board's), now "-N".
        <span className="bf-fight-poison gs-unpoison" aria-hidden="true">
          <svg viewBox="-8 -11 16 18" aria-hidden="true">
            <path d="M0 -10.2 C6 -1.8 7.8 2.4 6 6 A6.3 6.3 0 0 1 -6 6 C-7.8 2.4 -6 -1.8 0 -10.2Z" />
          </svg>
          <span>−{removed.from - removed.to}</span>
        </span>
      )}
      <svg viewBox="-20 -20 40 40" aria-hidden="true">
        {Array.from({ length: POISON_NOTCHES }, (_, i) => (
          <path
            key={i}
            d={notch(i)}
            className={i < lit ? "gs-poison-lit" : "gs-poison-unlit"}
            data-notch={i < lit ? "lit" : "unlit"}
          />
        ))}
        {count >= POISON_NOTCHES && <circle r="19.4" className="gs-poison-ring" />}
        <circle r="13.5" className="gs-poison-face" />
        <path
          d="M0 -10.2 C6 -1.8 7.8 2.4 6 6 A6.3 6.3 0 0 1 -6 6 C-7.8 2.4 -6 -1.8 0 -10.2Z"
          className="gs-poison-drop"
        />
      </svg>
      <b className="gs-poison-n">{count}</b>
    </span>
  );
}
