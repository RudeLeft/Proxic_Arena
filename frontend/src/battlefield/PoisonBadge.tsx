// Spec 0077, item 5 (owner 2026-11-12, canvas life-1112 "A · Badge by the
// shield") -- a player's poison counters as a round badge in spec 0076's
// language (something you count: a picture and its number): a green-black
// drop with the count, touching the life shield at its lower left -- placed
// down and to the left far enough that it never covers the life number
// (owner) -- and a ring of 10 notches round it, one lit per counter (ten
// poison counters lose the game, CR 704.5c). It pulses as counters arrive
// and its full ring breathes at 10. It replaces the status tray's "N poison"
// chip. With reduce motion: no pulse, no breathing; the count shows.

import { useEffect, useRef } from "react";
import type { Snapshot } from "../match";

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

/** The badge, or nothing at no poison. [pulses] counts the counters' arrivals: each new one pulses. */
export function PoisonBadge({ count, pulses }: { count: number; pulses: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useRef(pulses);
  // The count the badge showed before this pulse: none means it appears now.
  const shownBefore = useRef(count);
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
  if (count <= 0) return null;
  const lit = Math.min(count, POISON_NOTCHES);
  const words = `${count} poison counter${count === 1 ? "" : "s"}`;
  return (
    <span
      ref={ref}
      className={`gs-poison${count >= POISON_NOTCHES ? " gs-poison-full" : ""}`}
      data-poison={count}
      data-blows={pulses}
      title={words}
    >
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
