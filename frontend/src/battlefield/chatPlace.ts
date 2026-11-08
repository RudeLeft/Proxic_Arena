// Spec 0064 -- where the floating game chat window sits, and how it keeps
// clear of your hand and the column with the action button.
//
// Pure geometry, in the page's pixels: the window is a rectangle, the
// places it must not cover are rectangles, and the screen bounds them all.
// The board does not move or resize for the window (Phase 10: nothing on
// the battlefield jumps); the window moves instead.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The smallest and largest the window may be. */
export const CHAT_MIN = { w: 300, h: 260 } as const;
export const CHAT_MAX = { w: 900, h: 1400 } as const;
/** Room left between the window and what it keeps clear of, and the screen's edge. */
export const CLEAR_GAP = 8;

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** [r] sized within the limits and the screen, and moved onto it. */
export function clampTo(r: Rect, bounds: Rect): Rect {
  const w = Math.max(CHAT_MIN.w, Math.min(r.w, CHAT_MAX.w, bounds.w - 2 * CLEAR_GAP));
  const h = Math.max(CHAT_MIN.h, Math.min(r.h, CHAT_MAX.h, bounds.h - 2 * CLEAR_GAP));
  const x = Math.min(Math.max(r.x, bounds.x + CLEAR_GAP), bounds.x + bounds.w - w - CLEAR_GAP);
  const y = Math.min(Math.max(r.y, bounds.y + CLEAR_GAP), bounds.y + bounds.h - h - CLEAR_GAP);
  return { x, y, w, h };
}

/**
 * [r] moved (and, only if it must, made shorter) the least it can be so it
 * covers none of [keepClear], on the screen. Unchanged when it covers none
 * already; as close as it gets when nothing fits (a screen too small).
 */
export function clearOf(r: Rect, keepClear: Rect[], bounds: Rect): Rect {
  const base = clampTo(r, bounds);
  const free = (c: Rect) => !keepClear.some((o) => overlaps(c, o));
  if (free(base)) return base;
  const xs = [
    base.x,
    ...keepClear.flatMap((o) => [o.x - base.w - CLEAR_GAP, o.x + o.w + CLEAR_GAP]),
  ];
  const ys = [
    base.y,
    ...keepClear.flatMap((o) => [o.y - base.h - CLEAR_GAP, o.y + o.h + CLEAR_GAP]),
  ];
  let best = null as Rect | null;
  let cost = Infinity;
  const consider = (c: Rect, extra: number) => {
    const placed = clampTo(c, bounds);
    if (!free(placed)) return;
    const d = Math.abs(placed.x - base.x) + Math.abs(placed.y - base.y) + extra;
    if (d < cost) {
      cost = d;
      best = placed;
    }
  };
  for (const x of xs) for (const y of ys) consider({ x, y, w: base.w, h: base.h }, 0);
  if (best) return best;
  // Too tall to fit beside them: shorter, down to the smallest it may be.
  for (const x of xs) {
    for (const o of keepClear) {
      for (const y of [base.y, bounds.y + CLEAR_GAP]) {
        const h = o.y - CLEAR_GAP - y;
        if (h >= CHAT_MIN.h && h < base.h) consider({ x, y, w: base.w, h }, 2 * (base.h - h));
      }
    }
  }
  return best ?? base;
}

/** Where it first floats: the table's left side, clear of the hand and the column. */
export function firstPlace(bounds: Rect, keepClear: Rect[]): Rect {
  const y = bounds.y + 64;
  return clearOf(
    { x: bounds.x + 16, y, w: 380, h: Math.min(620, bounds.h - y - 16) },
    keepClear,
    bounds,
  );
}

/** What is remembered, per user, in this browser. */
export interface ChatPlace {
  mode: "docked" | "floating";
  rect: Rect | null;
}

const KEY = (user: string) => `proxic.gameChat.v1.${user}`;

function isRect(value: unknown): value is Rect {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return ["x", "y", "w", "h"].every((k) => typeof r[k] === "number" && Number.isFinite(r[k]));
}

export function loadPlace(user: string): ChatPlace {
  try {
    const raw = window.localStorage.getItem(KEY(user));
    if (!raw) return { mode: "docked", rect: null };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      mode: parsed["mode"] === "floating" ? "floating" : "docked",
      rect: isRect(parsed["rect"]) ? parsed["rect"] : null,
    };
  } catch {
    return { mode: "docked", rect: null };
  }
}

export function savePlace(user: string, place: ChatPlace): void {
  try {
    window.localStorage.setItem(KEY(user), JSON.stringify(place));
  } catch {}
}
