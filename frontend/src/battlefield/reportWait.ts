// Spec 0085 (canvas gaps-marks-1113, every scene) -- the report window comes
// up once the board has shown what happened, never over it: the canvas
// raises it after the move has played (Bob's Bolt doing nothing, then the
// window; Mother of Runes' shield settling, then Bob's window). Found
// filming 0085: the window came up with the board, over the Bears, and hid
// the red square's pulse and the pale shield it was there to explain.
//
// It waits while anything on the board is still moving (a finite Web
// Animation running: on the board's clock, so a click that hurries the
// board brings it up at once, A-00), at most REPORT_WAIT_MAX_MS -- only what
// was moving when the report came, never what starts after it. Reduce
// motion, or a board that animates nothing: at once.

import { useLayoutEffect, useState } from "react";

/** The longest a report waits for the board (the canvas's longest scene, with room). */
export const REPORT_WAIT_MAX_MS = 4000;

/** The finite animations under [root] still running: what the board is showing now. */
export function boardMotion(root: Element | null): Animation[] {
  if (!root || typeof root.getAnimations !== "function") return [];
  return root.getAnimations({ subtree: true }).filter(stillGoing);
}

function stillGoing(a: Animation): boolean {
  const timing = a.effect?.getComputedTiming();
  if (!timing || timing.iterations === Infinity || a.playState !== "running") return false;
  return Number(timing.endTime ?? 0) - Number(a.currentTime ?? 0) > 0;
}

/** Whether anything under [root] is still moving (a finite animation running). */
export function boardMoving(root: Element | null): boolean {
  return boardMotion(root).length > 0;
}

function stillMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * The key of the report that may show now: [key] once the board has stopped
 * moving (or at once), the one before until then.
 */
export function useReportWait(key: string | null, board: () => Element | null): string | null {
  const [shown, setShown] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (key === null || key === shown) return undefined;
    // What the board is showing as the report comes: only that is waited
    // for -- never what starts after it (a busy game would hold it forever).
    const showing = stillMotion() ? [] : boardMotion(board());
    if (showing.length === 0) {
      setShown(key);
      return undefined;
    }
    const t0 = performance.now();
    let frame = 0;
    const check = () => {
      if (!showing.some(stillGoing) || performance.now() - t0 > REPORT_WAIT_MAX_MS) setShown(key);
      else frame = window.requestAnimationFrame(check);
    };
    frame = window.requestAnimationFrame(check);
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per report
  }, [key]);
  return shown;
}
