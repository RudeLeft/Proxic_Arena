// Spec 0083 (owner 2026-11-13, canvas gaps-polish-1113, 14 C) -- the
// sun/moon medallion by the turn ladder. When day becomes night (or back)
// it turns over -- growing a little and glowing gold as it does -- and stays,
// showing which it is (the table's wash says "it changed"). A click hurries
// it (A-00); with reduce motion it simply shows the new face.

import { useEffect, useLayoutEffect, useRef } from "react";
import { hurry } from "./motion";

const SUN = (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="10" cy="10" r="4" fill="#fff6d0" />
    <g stroke="#fff6d0" strokeWidth="1.6" strokeLinecap="round">
      <path d="M10 1.5V4M10 16V18.5M1.5 10H4M16 10H18.5M4 4L5.7 5.7M14.3 14.3L16 16M16 4L14.3 5.7M5.7 14.3L4 16" />
    </g>
  </svg>
);
const MOON = (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path d="M13.5 3.5 A7 7 0 1 0 16.5 13 A5.6 5.6 0 0 1 13.5 3.5 Z" fill="#eef2ff" />
  </svg>
);

/** The turn: over in the first 0.5 s; the swell and glow over 0.9 s (the canvas's). */
export const MEDALLION_MS = 900;
const TURN_MS = 500;

/** The medallion's turning: edge-on at the middle of the turn, a swell and a gold glow round it. */
export function medallionFrames(): Keyframe[] {
  const frames: Keyframe[] = [];
  for (let i = 0; i <= 18; i++) {
    const t = (i / 18) * MEDALLION_MS;
    const q = Math.min(1, t / TURN_MS);
    const sx = Math.max(0.02, Math.abs(Math.cos(q * Math.PI)));
    const g = Math.sin(Math.PI * (t / MEDALLION_MS));
    frames.push({
      offset: i / 18,
      transform: `scaleX(${sx.toFixed(3)}) scale(${(1 + 0.35 * g).toFixed(3)})`,
      filter: `drop-shadow(0 0 ${(8 * g).toFixed(2)}px #f2c46a)`,
    });
  }
  return frames;
}

/** A face: shown until (or from) the moment the medallion is edge-on. */
function faceFrames(showing: boolean): Keyframe[] {
  const at = TURN_MS / 2 / MEDALLION_MS;
  return [
    { offset: 0, opacity: showing ? 0 : 1 },
    { offset: at, opacity: showing ? 0 : 1 },
    { offset: at, opacity: showing ? 1 : 0 },
    { offset: 1, opacity: showing ? 1 : 0 },
  ];
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : true;
}

export function DayMedallion({ night }: { night: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const was = useRef(night);
  useLayoutEffect(() => {
    if (was.current === night) return;
    was.current = night;
    const el = ref.current;
    if (!el || typeof el.animate !== "function" || reducedMotion()) return;
    el.animate(medallionFrames(), { duration: MEDALLION_MS, easing: "linear" });
    const now = el.querySelector<HTMLElement>(night ? ".gs-medal-moon" : ".gs-medal-sun");
    const then = el.querySelector<HTMLElement>(night ? ".gs-medal-sun" : ".gs-medal-moon");
    now?.animate(faceFrames(true), { duration: MEDALLION_MS, easing: "linear" });
    then?.animate(faceFrames(false), { duration: MEDALLION_MS, easing: "linear" });
  }, [night]);
  // A click or a key hurries it, as the board does with its own movements.
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const now = () => hurry(el);
    document.addEventListener("pointerdown", now, true);
    document.addEventListener("keydown", now, true);
    return () => {
      document.removeEventListener("pointerdown", now, true);
      document.removeEventListener("keydown", now, true);
    };
  }, []);
  return (
    <span
      ref={ref}
      className={`gs-medal${night ? " gs-medal-night" : ""}`}
      data-day-medallion={night ? "night" : "day"}
      aria-hidden="true"
    >
      <span className="gs-medal-face gs-medal-sun">{SUN}</span>
      <span className="gs-medal-face gs-medal-moon">{MOON}</span>
    </span>
  );
}
