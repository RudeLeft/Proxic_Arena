// A player's name on one line, whole -- spec 0041 (owner 2026-10-30).
//
// Display names are at most 12 characters, and every place a name shows
// must show 12 in full. Where a place is narrower than the name at its
// normal size (the game's name plates, the Hall podium), the name gets
// smaller until it fits, down to MIN of its size; only a name past that
// (one from before the limit) still ends in "…". The element keeps its
// own CSS (nowrap, overflow hidden, ellipsis); this only sets font-size.

import { useLayoutEffect, useRef } from "react";

/** The smallest a name shrinks to, as a share of its normal size. */
export const MIN = 0.6;
const STEP = 0.05;

/** The scale at which `fits(scale)` first holds, stepping down from 1 to MIN. */
export function fitScale(fits: (scale: number) => boolean, min = MIN): number {
  let scale = 1;
  while (!fits(scale) && scale > min) scale = Math.max(min, +(scale - STEP).toFixed(2));
  return scale;
}

export function FitName({
  name,
  className,
  as: Tag = "span",
}: {
  name: string;
  className?: string;
  as?: "span" | "b";
}) {
  const ref = useRef<HTMLElement>(null);
  useFit(ref, name);
  return (
    <Tag ref={ref} className={className} title={name}>
      {name}
    </Tag>
  );
}

/**
 * Spec 0089 (Q6 A) -- the same rule for any element that shows a name on one
 * line (a stack card's top bar, the casting card's name): smaller in 5% steps
 * until it fits, never below MIN, and only then cut by its own CSS ("…").
 * [ref]'s element keeps its CSS; this sets only its font-size, again when its
 * place changes size, its words change, or the display face loads.
 */
export function useFit(ref: { current: HTMLElement | null }, words: string, on = true): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !on) return undefined;
    const fit = () => {
      el.style.fontSize = "";
      const base = parseFloat(getComputedStyle(el).fontSize);
      if (!base) return;
      fitScale((scale) => {
        el.style.fontSize = scale === 1 ? "" : `${base * scale}px`;
        return el.scrollWidth <= el.clientWidth + 0.5;
      });
    };
    fit();
    // Again when the place changes size, when the words change, and once
    // the display face loads (the fallback face is a different width).
    const resized = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    if (el.parentElement) resized?.observe(el.parentElement);
    const changed = typeof MutationObserver === "undefined" ? null : new MutationObserver(fit);
    changed?.observe(el, { childList: true, characterData: true, subtree: true });
    void document.fonts?.ready.then(fit);
    return () => {
      resized?.disconnect();
      changed?.disconnect();
    };
  }, [ref, words, on]);
}
