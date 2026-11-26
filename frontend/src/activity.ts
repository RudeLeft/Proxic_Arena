// Is anybody at the keyboard? — spec 0009 (owner 2026-10-24).
//
// Away is 5 minutes with no mouse, keyboard, wheel or touch anywhere in
// Proxic Arena; a hidden tab gets none of those, so it goes away in the
// same 5 minutes, and coming back to the tab counts as a move. A game
// that is asking you something holds you active: it has its own clock.
//
// The page tells the server only when the answer flips, never per move;
// the server decides what that means for a player with several tabs.

export const IDLE_MS = 5 * 60_000;
/** How often the watcher looks at the clock. A minute late is fine for "away". */
const CHECK_MS = 15_000;

export interface Activity {
  /** When the last move was, by the page's clock. */
  lastMove: number;
  /** True while the game is waiting on this player. */
  held: boolean;
}

/** The rule, without a browser. */
export function isAway(activity: Activity, now: number): boolean {
  return !activity.held && now - activity.lastMove >= IDLE_MS;
}

let held = false;
let nudge: (() => void) | null = null;

/** The game screen holds you active while it is asking you something. */
export function holdActive(on: boolean): void {
  held = on;
  nudge?.();
}

/**
 * Watch this page, and call [onChange] with true when it goes away and
 * false when it comes back -- only on a change. Returns the stop.
 */
export function watchActivity(
  onChange: (away: boolean) => void,
  clock: () => number = Date.now,
): () => void {
  const activity: Activity = { lastMove: clock(), held };
  let away = false;

  const check = () => {
    activity.held = held;
    const next = isAway(activity, clock());
    if (next !== away) {
      away = next;
      onChange(away);
    }
  };
  const moved = () => {
    activity.lastMove = clock();
    if (away) check();
  };
  // The browser also sends a "move" when the page changes under a still
  // pointer (a chat line arriving, a list redrawn); only a pointer that
  // actually went somewhere is somebody at the mouse.
  let at = "";
  const pointed = (event: PointerEvent) => {
    const here = `${event.screenX},${event.screenY}`;
    if (here === at) return;
    at = here;
    moved();
  };
  // P11-E15: a hidden tab gets no moves, so instead of looking every 15 s
  // it sets one timer for the moment it would go away (and none once it
  // is away). Shown again, it is a move, and the 15 s look starts again.
  let timer: number | null = null;
  let due: number | null = null;
  const rest = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    if (due !== null) window.clearTimeout(due);
    due = null;
  };
  const watch = () => {
    rest();
    if (document.visibilityState === "visible") {
      timer = window.setInterval(check, CHECK_MS);
      return;
    }
    check();
    if (away) return;
    const left = activity.lastMove + IDLE_MS - clock();
    due = window.setTimeout(
      () => {
        due = null;
        check();
      },
      Math.max(0, left),
    );
  };
  const shown = () => {
    if (document.visibilityState === "visible") moved();
    watch();
  };

  const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
  for (const name of events) window.addEventListener(name, moved, { passive: true });
  window.addEventListener("pointermove", pointed, { passive: true });
  document.addEventListener("visibilitychange", shown);
  watch();
  nudge = check;

  return () => {
    for (const name of events) window.removeEventListener(name, moved);
    window.removeEventListener("pointermove", pointed);
    document.removeEventListener("visibilitychange", shown);
    rest();
    if (nudge === check) nudge = null;
  };
}
