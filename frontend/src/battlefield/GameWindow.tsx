// One look for every game window — PHASE_09 W-00 (owner 2026-10-30).
//
// Quick questions are a BUBBLE beside the card asking (on the stack, on the
// board, in the hand), pointing at it; big ones with many cards are a TRAY
// rising from the bottom of the table, over the hand. Both keep the seven
// rules: the card asking is shown; plain words; cards as cards; one button
// style (the main answer gold, on the right); never over the stack or the
// answer button; hold Space to peek at the table; Esc backs out where the
// rules allow (the question's own business) and clicking away answers
// nothing.

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Box, Geometry } from "./layout";
import { ManaText } from "./ManaCost";

// Rule 6 (Amendment 18): holding Space, or holding any window's Peek
// button, fades EVERY open window at once to show the table; letting go
// brings them back. One switch for the whole page, so a Peek pressed in
// one window and Space behave the same.
let peeking = false;
const peekWatchers = new Set<() => void>();
export function setPeeking(on: boolean) {
  if (on === peeking) return;
  peeking = on;
  for (const watcher of peekWatchers) watcher();
}
const watchPeek = (watcher: () => void) => {
  peekWatchers.add(watcher);
  return () => peekWatchers.delete(watcher);
};

/**
 * Phase 9 second audit (Amendment 22) -- what every question window shows,
 * whichever window it is: the game's refusal of the last answer (W-23:
 * "refusals stay inside their question window") and, under Mindslaver,
 * that the answer is for another seat. Given once, by the game screen,
 * around the window; the frame (Bubble, Tray, the opening hand) draws it,
 * so a window built later can't leave it out.
 */
export const WindowFacts = createContext<{ notice: string | null; actingFor: string | null }>({
  notice: null,
  actingFor: null,
});

/** The refusal and the acting-for line, as the frames draw them. */
export function WindowFactLines({ title }: { title?: string }) {
  const { notice, actingFor } = useContext(WindowFacts);
  return (
    <>
      {/* Not when the window's own title already says it (the general window). */}
      {actingFor && !(title ?? "").startsWith("Playing for seat") && (
        <p className="gs-win-prompt gs-win-acting">{actingFor}</p>
      )}
      {notice && (
        <p className="gs-win-prompt gs-win-notice" role="alert">
          <ManaText text={notice} />
        </p>
      )}
    </>
  );
}

/** Whether the windows are faded right now; `active` adds Space while this window is open. */
export function usePeek(active: boolean): boolean {
  const peek = useSyncExternalStore(
    watchPeek,
    () => peeking,
    () => false,
  );
  useEffect(() => {
    if (!active) return undefined;
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable]");
    const down = (event: KeyboardEvent) => {
      // Spec 0035's countdown takes Space first ("resolve now"); the Peek
      // button still works then.
      if (event.code !== "Space" || event.defaultPrevented || typing(event.target)) return;
      event.preventDefault();
      setPeeking(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") setPeeking(false);
    };
    const away = () => setPeeking(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", away);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", away);
      // A window closing while held must not leave the next one faded.
      setPeeking(false);
    };
  }, [active]);
  return active && peek;
}

/**
 * The Peek button (Amendment 18): press and hold to fade every window and
 * see the table, let go and they're back. Holding, not a click, so no
 * question is ever left hidden.
 */
export function PeekButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      className={`gs-win-btn gs-peek-btn ${className}`.trim()}
      aria-label="Peek: hold to see the table (or hold Space)"
      title="Hold to see the table (or hold Space)"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setPeeking(true);
      }}
      onPointerUp={() => setPeeking(false)}
      onPointerCancel={() => setPeeking(false)}
      onLostPointerCapture={() => setPeeking(false)}
      onClick={(event) => event.preventDefault()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="gs-peek-eye">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      Peek
    </button>
  );
}

/**
 * Spec 0057, item 2 -- the Peek footer's left half, the same in every
 * window: Peek, then "or hold Space" (under it, in a narrow window).
 */
export function PeekHint() {
  return (
    <span className="gs-win-peek-hint">
      <PeekButton />
      <span className="gs-peek-or">or hold Space</span>
    </span>
  );
}

/**
 * Spec 0057, item 2 -- a window's footer: the Peek hint on the left, the
 * window's own buttons on the right, a clear gap between.
 */
export function PeekFoot({
  className = "",
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`gs-peek-foot ${className}`.trim()}>
      <PeekHint />
      {children && <span className="gs-peek-foot-buttons">{children}</span>}
    </div>
  );
}

const BUBBLE_W = 380;
const GAP = 18;
/** About how tall a quick question is, for choosing where it fits. */
export const BUBBLE_H = 240;

/**
 * Spec 0057, item 6 -- which side of the card asking a bubble sits on:
 * left of it (the stack's top card, as before), right of it, or above it
 * (a card in the hand).
 */
export type BubbleSide = "left" | "right" | "above";

/** Where a bubble points: a card's box, and the side the bubble takes. */
export type Anchor = Box & { side?: BubbleSide };

/** A bubble's width on this table. */
export function bubbleWidth(geometry: Geometry): number {
  return Math.min(BUBBLE_W, geometry.play.w * 0.34);
}

/** Where a bubble pointing at `anchor` is drawn: its left, top, and (for "above") its bottom edge. */
export function bubbleSpot(
  anchor: Anchor,
  geometry: Geometry,
): { left: number; top: number; above: boolean } {
  const width = bubbleWidth(geometry);
  const side = anchor.side ?? "left";
  if (side === "above") {
    const left = Math.min(
      Math.max(anchor.x + anchor.w / 2 - width / 2, geometry.play.x + geometry.inset),
      geometry.play.x + geometry.play.w - geometry.inset - width,
    );
    return { left, top: anchor.y - GAP, above: true };
  }
  const left =
    side === "right" ? anchor.x + anchor.w + GAP : Math.max(geometry.inset, anchor.x - GAP - width);
  const top = Math.min(Math.max(anchor.y - 8, geometry.inset), geometry.height * 0.6);
  return { left, top, above: false };
}

/** The box a bubble at `anchor` takes, at about its usual height. */
export function bubbleBox(anchor: Anchor, geometry: Geometry, height = BUBBLE_H) {
  const spot = bubbleSpot(anchor, geometry);
  const w = bubbleWidth(geometry);
  return { x: spot.left, y: spot.above ? spot.top - height : spot.top, w, h: height };
}

function overlapping(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Spec 0057, item 6 (owner A, "by the card asking") -- a window about a
 * card in the hand sits above it; about a card on the battlefield, beside
 * it, on the side with room. Never over the stack (nor the act button
 * under it), never over a card the question needs clicked (`avoid`), never
 * off the table: if no place by the card is clear, `fallback` (by the
 * stack, as before).
 */
export function anchorByCard({
  card,
  inHand,
  geometry,
  stack,
  avoid,
  fallback,
}: {
  card: Box | null;
  inHand: boolean;
  geometry: Geometry;
  /** The stack's top spot: windows stay left of it. */
  stack: Box;
  avoid: readonly Box[];
  fallback: Anchor;
}): Anchor {
  if (!card) return fallback;
  const right = Math.min(stack.x, geometry.play.x + geometry.play.w) - geometry.inset;
  const fits = (anchor: Anchor) => {
    const box = bubbleBox(anchor, geometry);
    return (
      box.x >= geometry.play.x + geometry.inset &&
      box.x + box.w <= right &&
      box.y >= geometry.inset &&
      box.y + box.h <= geometry.height - geometry.inset &&
      !overlapping(box, stack) &&
      !avoid.some((b) => overlapping(box, b))
    );
  };
  const sides: BubbleSide[] = inHand
    ? ["above"]
    : // The side with more room first.
      right - (card.x + card.w) >= card.x - geometry.play.x
      ? ["right", "left"]
      : ["left", "right"];
  for (const side of sides) {
    const anchor: Anchor = { ...card, side };
    if (fits(anchor)) return anchor;
  }
  return fallback;
}

/**
 * A quick question, beside the card asking: to the left of `anchor` (the
 * stack's top card, or where it will be), its pointer at the card's top,
 * kept on the table. Spec 0057, item 6: or right of a card, or above one
 * in the hand (`anchor.side`), pointing at it.
 */
export function Bubble({
  anchor,
  geometry,
  label,
  from,
  title,
  titleClass,
  kind,
  picture,
  children,
  actions,
}: {
  anchor: Anchor;
  geometry: Geometry;
  /** What a screen reader calls the window. */
  label: string;
  /** The small gold line: the card asking, and which copy it is. */
  from: string;
  title: string;
  /** An extra class on the title (the scripted games read it). */
  titleClass?: string;
  /** The question's kind, as `data-kind` (the scripted games read it). */
  kind?: string;
  picture?: ReactNode;
  children?: ReactNode;
  actions: ReactNode;
}) {
  const peek = usePeek(true);
  const width = bubbleWidth(geometry);
  const { left, top, above } = bubbleSpot(anchor, geometry);
  const side = anchor.side ?? "left";
  return (
    <div
      className={`gs-win gs-bubble gs-bubble-${side}${peek ? " gs-win-peek" : ""}`}
      role="dialog"
      data-kind={kind}
      data-side={side}
      aria-label={label}
      style={{
        left,
        top,
        width,
        ...(above ? { transform: "translateY(-100%)" } : {}),
        ...(side === "above"
          ? {
              ["--gs-pointer-x" as string]: `${Math.min(
                Math.max(anchor.x + anchor.w / 2 - left, 24),
                width - 24,
              )}px`,
            }
          : {}),
      }}
    >
      <span className="gs-bubble-pointer" aria-hidden="true" />
      <div className="gs-win-head">
        {picture && <div className="gs-win-picture">{picture}</div>}
        <div className="gs-win-words">
          <span className="gs-win-from">{from}</span>
          <h2 className={`gs-win-title${titleClass ? ` ${titleClass}` : ""}`}>
            <ManaText text={title} />
          </h2>
        </div>
      </div>
      {children}
      <WindowFactLines title={title} />
      <div className="gs-win-actions">
        <PeekHint />
        {actions}
      </div>
    </div>
  );
}

/** A big question, many cards: a tray from the bottom of the table. */
export function Tray({
  geometry,
  label,
  from,
  title,
  titleClass,
  kind,
  prompt,
  children,
  actions,
}: {
  geometry: Geometry;
  label: string;
  from: string;
  title: string;
  titleClass?: string;
  kind?: string;
  prompt?: string | null;
  children: ReactNode;
  actions: ReactNode;
}) {
  const peek = usePeek(true);
  // As wide as its cards need (owner 2026-10-30: no dead space), centred
  // on the table, never wider than the room left of the stack.
  const centre = geometry.play.x + geometry.play.w * 0.45;
  const maxWidth = geometry.play.w * 0.82;
  // Amendment 22: a wide tray reached under the corner buttons (gear,
  // Report, List choices), which stay on top (rule 5): it then rises
  // just above them instead.
  const self = useRef<HTMLDivElement | null>(null);
  const [lift, setLift] = useState<number | null>(null);
  useLayoutEffect(() => {
    const tray = self.current?.getBoundingClientRect();
    const frame = (self.current?.offsetParent as HTMLElement | null)?.getBoundingClientRect();
    const dock = document.querySelector(".gs-dock-anchor")?.getBoundingClientRect();
    if (!tray || !frame || !dock || dock.width === 0) return;
    // Sideways only: lifted, it no longer overlaps upwards, and must stay lifted.
    const under = tray.left < dock.right;
    const to = under ? Math.round(frame.bottom - dock.top + 8) : null;
    setLift((now) => (now === to ? now : to));
    // Again whenever the table's size or the tray's contents change; the
    // equality above stops a loop.
  }, [geometry, children]);
  return (
    <div
      ref={self}
      className={`gs-win gs-tray${peek ? " gs-win-peek" : ""}`}
      role="dialog"
      data-kind={kind}
      aria-label={label}
      style={{ left: centre, maxWidth, ...(lift !== null ? { bottom: lift } : {}) }}
    >
      <div className="gs-win-words gs-tray-body">
        <span className="gs-win-from">{from}</span>
        <h2 className={`gs-win-title${titleClass ? ` ${titleClass}` : ""}`}>
          <ManaText text={title} />
        </h2>
        {prompt && (
          <p className="gs-win-prompt gs-question-prompt decision-prompt">
            <ManaText text={prompt} />
          </p>
        )}
        {children}
        <WindowFactLines title={title} />
      </div>
      <div className="gs-win-actions gs-tray-actions">
        <PeekHint />
        {actions}
      </div>
    </div>
  );
}
