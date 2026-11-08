// Spec 0062 -- a spark of mana for every payment (owner 2026-11-07, canvas
// "mana-1107", look C · Spark arc).
//
// Every mana paid sends a small ball on a high arc, dropping twinkling
// sparks, from what paid it -- the land, creature or artifact tapped, the
// mana display (mana already made), the life total (2 life for a Phyrexian
// symbol), the creature tapped for convoke -- to the symbol of the cost it
// paid, which pops and lights in that mana's colour. The game says what each
// mana paid as it is paid (`payments` on every board), so the last mana of a
// payment gets its ball too, and the other player sees the balls: into a
// spell still face down to them they fly to its back, with no symbols (its
// cost stays hidden; the game does not even send it).
//
// Phase 10: a click or a key hurries the balls to their end, like every
// movement; with reduced motion there is no ball, the symbol just lights.

import { useEffect, useLayoutEffect, useRef } from "react";
import type { SnapshotPayment } from "../match";
import type { Box, Geometry } from "./layout";
import { hurry } from "./motion";

/** One ball's flight (the canvas's look C: 0.62 s). */
export const BALL_MS = 620;
/** Several mana from one tap set off this far apart, flying together. */
export const BALL_LAG_MS = 70;
/** How high the arc rises, as a share of the distance (look C). */
const BALL_BOW = 0.42;
/** The symbol's pop when hit. */
export const POP_MS = 260;
/** A spark dropped on the way: it falls and fades. */
const SPARK_MS = 480;
/** The few sparks thrown out when the ball lands. */
const BURST_MS = 340;
/** "Still to pay" stays this long once its last ball has landed. */
export const PILL_HOLD_MS = 600;
/**
 * However the balls fare, a cast card waits no longer than this for them
 * (a tab in the background may not run them). Their flight is 0.62 s; this
 * is long enough for one filmed at a tenth of the speed.
 */
export const BALLS_LONGEST_MS = 8000;

/**
 * Each mana's ball (the canvas's colours): a bright core, its body, the glow
 * around it. Black is dark purple-black with a pale ring, to show on the felt;
 * colourless is grey.
 */
export const MANA_BALL: Record<string, { core: string; body: string; glow: string }> = {
  W: { core: "#fffdf2", body: "#f8f2d6", glow: "#fff0b0" },
  U: { core: "#e6f3ff", body: "#3b8ee8", glow: "#8cc6ff" },
  B: { core: "#eadfff", body: "#2a1838", glow: "#d2bff5" },
  R: { core: "#ffe6db", body: "#e63f27", glow: "#ff8e6a" },
  G: { core: "#e8ffeb", body: "#2aa84a", glow: "#86ec9a" },
  C: { core: "#ffffff", body: "#9da3ab", glow: "#d9dee4" },
};

export function ballColour(colour: string) {
  return MANA_BALL[colour] ?? MANA_BALL["C"]!;
}

/** The ball's look: a core, its body (radial), and a ring of glow. */
export function ballBackground(colour: string, coreAt = 22): string {
  const c = ballColour(colour);
  return `radial-gradient(circle at 38% 36%, ${c.core} 0 ${coreAt}%, ${c.body} ${coreAt + 26}%, ${c.body} 100%)`;
}

function ballShadow(colour: string, k: number): string {
  const c = ballColour(colour);
  return `0 0 0 ${1.5 * k}px ${c.glow}, 0 0 ${10 * k}px ${3 * k}px ${c.glow}`;
}

/** A symbol lit by a mana of this colour: its ring and glow (black: dark, with a pale ring). */
export function litShadow(colour: string): string {
  const c = ballColour(colour);
  return colour === "B"
    ? `0 0 0 2.5px ${c.body}, 0 0 0 4px ${c.glow}, 0 0 14px 4px ${c.glow}`
    : `0 0 0 2.5px ${c.body}, 0 0 14px 4px ${c.glow}`;
}

/** One mana of a payment, with the step it was paid in. */
export interface PaidStep {
  /** The step's number (`payments[].n`) and the mana's place in it. */
  n: number;
  k: number;
  colour: string;
  shard: string | null;
  from: string;
  seat: number;
}

/** One payment's steps so far, oldest first. */
export interface PaymentGroup {
  payment: number;
  for: string | null;
  kind: string;
  seat: number;
  /** The cost when it began ("{2}{B}{B}"); null where hidden from this viewer. */
  cost: string | null;
  /** Still due after the latest step. */
  owing: string | null;
  mana: PaidStep[];
  /** The latest step's number. */
  last: number;
  steps: number[];
}

function group(records: readonly SnapshotPayment[]): PaymentGroup {
  const first = records[0]!;
  const latest = records[records.length - 1]!;
  return {
    payment: first.payment,
    for: first.for,
    kind: first.kind,
    seat: first.seat,
    cost: first.cost,
    owing: latest.owing,
    mana: records.flatMap((r) =>
      r.mana.map((m, k) => ({
        n: r.n,
        k,
        colour: m.colour,
        shard: m.shard,
        from: m.from,
        seat: r.seat,
      })),
    ),
    last: latest.n,
    steps: records.map((r) => r.n),
  };
}

/** The newest payment for the card [forId] with a step after [since], or null. */
export function paymentFor(
  payments: readonly SnapshotPayment[] | undefined,
  forId: string | null,
  since = 0,
): PaymentGroup | null {
  if (!forId || !payments) return null;
  const mine = payments.filter((p) => p.for === forId && p.n > since);
  if (mine.length === 0) return null;
  const newest = mine[mine.length - 1]!.payment;
  return group(mine.filter((p) => p.payment === newest));
}

/** The newest payment of all (any card), or null. */
export function latestPayment(
  payments: readonly SnapshotPayment[] | undefined,
): PaymentGroup | null {
  if (!payments || payments.length === 0) return null;
  const newest = payments[payments.length - 1]!.payment;
  return group(payments.filter((p) => p.payment === newest));
}

/** A symbol of a cost being paid: lit (`paid`), in the colour of the mana that paid it, and its ball. */
export interface PayPip {
  symbol: string;
  paid: boolean;
  generic?: true;
  /** The colour of the mana that paid it (W U B R G C); none when the game did not say. */
  colour?: string;
  /** `n:k` -- the step and mana whose ball flies to it. */
  ball?: string;
}

/**
 * The pips with each mana the game says it paid put on its symbol: the
 * first one of that symbol not yet taken ("1" is a generic pip), as the
 * pips light from the left. A pip lit by "still owing" but not named by any
 * step stays lit, with no colour of its own (an older worker).
 */
export function assignBalls(
  pips: readonly { symbol: string; paid: boolean; generic?: true }[],
  mana: readonly PaidStep[],
): PayPip[] {
  const out: PayPip[] = pips.map((p) => ({ ...p }));
  const taken = new Set<number>();
  for (const m of mana) {
    if (!m.shard) continue;
    const generic = /^\d+$/.test(m.shard);
    const at = out.findIndex(
      (p, i) => !taken.has(i) && (generic ? !!p.generic : !p.generic && p.symbol === m.shard),
    );
    if (at < 0) continue;
    taken.add(at);
    out[at] = { ...out[at]!, paid: true, colour: m.colour, ball: `${m.n}:${m.k}` };
  }
  // "Still owing" lights the leftmost of each kind; steps took the leftmost
  // free ones: a pip lit only by "still owing" is one no step named yet.
  return out;
}

/** "Still to pay: 1 B" -- the unpaid generic as one number, then the other symbols. */
export function owingWords(pips: readonly PayPip[]): string {
  const generic = pips.filter((p) => p.generic && !p.paid).length;
  const rest = pips.filter((p) => !p.generic && !p.paid).map((p) => p.symbol);
  return [...(generic > 0 ? [String(generic)] : []), ...rest].join(" ");
}

/**
 * What the board knows of the balls: which steps were seen (each plays
 * once), which have landed, and when. Steps on the first board seen (a
 * reload, a late join) never fly.
 */
export interface BallLedger {
  first: number | null;
  seen: Set<number>;
  landed: Map<number, number>;
}

export function newLedger(): BallLedger {
  return { first: null, seen: new Set(), landed: new Map() };
}

/** A step still flying (or not yet started) for this board. */
export function pending(ledger: BallLedger, n: number): boolean {
  return ledger.first !== null && n > ledger.first && !ledger.landed.has(n);
}

interface Point {
  x: number;
  y: number;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** The arc (look C): a quadratic curve rising [bow] of the distance above the higher end. */
export function ballPath(a: Point, b: Point, bow = BALL_BOW, n = 26): (Point & { t: number })[] {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const c = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - d * bow };
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = ease(i / n);
    const u = 1 - t;
    return {
      x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
      t: i / n,
    };
  });
}

function reducedMotion(): boolean {
  return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function centre(el: Element): Point {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

const UNLIT: Keyframe = {
  opacity: 0.5,
  filter: "grayscale(0.25)",
  transform: "scale(1)",
  boxShadow: "0 0 0 0 transparent",
};

/**
 * The balls, drawn over everything (they fly from the rail's life total and
 * mana display too), for every new step on [payments]. Rendered in the
 * board's overlay: an invisible box the board's size gives where its
 * coordinates are on the screen.
 */
export function ManaBalls({
  payments,
  at,
  geometry,
  ledger,
  onLanded,
}: {
  payments: readonly SnapshotPayment[];
  /** Where a card is on the board, in the board's coordinates. */
  at: (objectId: string) => Box | null;
  geometry: Geometry;
  ledger: BallLedger;
  /** A step's balls have all landed (or had nowhere to go). */
  onLanded: () => void;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement | null>(null);
  if (layer.current === null && typeof document !== "undefined") {
    const el = document.createElement("div");
    el.className = "gs-balls";
    el.setAttribute("aria-hidden", "true");
    layer.current = el;
  }
  const atRef = useRef(at);
  atRef.current = at;
  // Where each player's floating mana was last drawn: spent, the chip may be
  // gone from the board the ball leaves on.
  const poolAt = useRef(new Map<string, Point>());
  const live = useRef(new Set<HTMLElement>());

  useLayoutEffect(() => {
    if (ledger.first === null) {
      ledger.first = payments.reduce((most, p) => Math.max(most, p.n), 0);
      for (const p of payments) ledger.seen.add(p.n);
      return;
    }
    const fresh = payments.filter((p) => !ledger.seen.has(p.n));
    if (fresh.length === 0) return;
    const box = anchor.current?.getBoundingClientRect();
    const scale = box && geometry.width > 0 ? box.width / geometry.width : 1;
    const motion =
      !reducedMotion() && !!layer.current && typeof layer.current.animate === "function";
    let settled = false;
    for (const p of fresh) {
      ledger.seen.add(p.n);
      let left = p.mana.length;
      const land = () => {
        left -= 1;
        if (left > 0) return;
        ledger.landed.set(p.n, Date.now());
        settled = true;
      };
      if (left === 0) land();
      p.mana.forEach((m, k) => {
        const pip = document.querySelector<HTMLElement>(`[data-ball="${p.n}:${k}"]`);
        const target =
          pip ?? (p.for ? document.querySelector<HTMLElement>(`[data-ball-for="${p.for}"]`) : null);
        const from = motion ? source(m.from, m.colour, p.seat, box ?? null, scale) : null;
        if (!target || !from || !motion) {
          land();
          return;
        }
        const size = Math.max(10, Math.min(26, geometry.cardH * 0.13 * scale));
        fly(from, centre(target), m.colour, k * BALL_LAG_MS, size, pip)
          .catch(() => undefined)
          .finally(() => {
            land();
            if (left === 0) onLanded();
          });
      });
    }
    if (settled) onLanded();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per new step
  }, [payments]);

  // After the balls set off: where each floating mana is drawn now.
  useLayoutEffect(() => {
    for (const chip of document.querySelectorAll<HTMLElement>("[data-pool]")) {
      poolAt.current.set(chip.dataset.pool ?? "", centre(chip));
    }
  });

  // The layer lives on the page (fixed, over the rail too); a click or key
  // hurries what is flying, as the board does with its own movements.
  useEffect(() => {
    const el = layer.current;
    if (!el) return undefined;
    document.body.appendChild(el);
    const now = () => hurry(el);
    document.addEventListener("pointerdown", now, true);
    document.addEventListener("keydown", now, true);
    const flying = live.current;
    return () => {
      document.removeEventListener("pointerdown", now, true);
      document.removeEventListener("keydown", now, true);
      flying.forEach((dot) => dot.remove());
      flying.clear();
      el.remove();
    };
  }, []);

  function source(from: string, colour: string, seat: number, box: DOMRect | null, scale: number) {
    if (from.startsWith("card:")) {
      const b = atRef.current(from);
      if (b && box) {
        return { x: box.left + (b.x + b.w / 2) * scale, y: box.top + (b.y + b.h / 2) * scale };
      }
      const el = document.querySelector(`[data-object-id="${from}"]`);
      return el ? centre(el) : null;
    }
    const life = document.querySelector(`.gs-life[data-object-id="player:${seat}"]`);
    if (from === "pool") {
      const chip = document.querySelector(`[data-pool="${seat}:${colour}"]`);
      if (chip) return centre(chip);
      const was = poolAt.current.get(`${seat}:${colour}`);
      if (was) return was;
    }
    return life ? centre(life) : null;
  }

  function dot(css: Partial<CSSStyleDeclaration>): HTMLElement {
    const el = document.createElement("span");
    el.className = "gs-ball";
    Object.assign(el.style, css);
    layer.current!.appendChild(el);
    live.current.add(el);
    return el;
  }

  function gone(el: HTMLElement) {
    el.remove();
    live.current.delete(el);
  }

  /** One ball from [a] to [b]; the pip (if any) pops and lights when it lands. */
  async function fly(
    a: Point,
    b: Point,
    colour: string,
    lag: number,
    size: number,
    pip: HTMLElement | null,
  ) {
    const c = ballColour(colour);
    const z = size / 15;
    const pts = ballPath(a, b);
    const tf = (p: Point, s: number, extra = "") =>
      `translate(${p.x - s / 2}px, ${p.y - s / 2}px) ${extra}`;
    // Until it lands, the symbol it lights looks unlit (it is drawn lit).
    const hold = pip?.animate([UNLIT, UNLIT], { duration: lag + BALL_MS });
    const head = dot({
      width: `${size}px`,
      height: `${size}px`,
      background: ballBackground(colour),
      boxShadow: ballShadow(colour, 1.1 * z),
    });
    const flight = head.animate(
      pts.map((p, j) => ({ transform: tf(p, size), opacity: j === 0 ? 0 : 1 })),
      { duration: BALL_MS, delay: lag, easing: "linear", fill: "both" },
    );
    // Sparks dropped along the way, falling and fading.
    const sp = 5 * z;
    pts.forEach((p, j) => {
      if (j % 3 !== 1 || j > pts.length - 3) return;
      const s = dot({
        width: `${sp}px`,
        height: `${sp}px`,
        background: c.core,
        boxShadow: `0 0 ${6 * z}px ${2 * z}px ${c.glow}`,
        opacity: "0",
      });
      const spark = s.animate(
        [
          { transform: tf(p, sp), opacity: 0 },
          { transform: tf(p, sp), opacity: 1, offset: 0.1 },
          {
            transform: tf({ x: p.x + (j % 2 ? 5 : -5) * z, y: p.y + 14 * z }, sp, "scale(.4)"),
            opacity: 0,
          },
        ],
        { duration: SPARK_MS, delay: lag + BALL_MS * p.t, easing: "ease-out", fill: "both" },
      );
      void spark.finished.catch(() => undefined).finally(() => gone(s));
    });
    try {
      await flight.finished;
    } finally {
      gone(head);
      hold?.cancel();
    }
    // It lands: the symbol pops and lights in the mana's colour.
    const lit: Keyframe = { opacity: 1, filter: "none", boxShadow: litShadow(colour) };
    const pop = pip?.animate(
      [
        UNLIT,
        { transform: "scale(1.38)", ...lit, offset: 0.4 },
        { transform: "scale(1.12)", ...lit },
      ],
      { duration: POP_MS, easing: "ease-out" },
    );
    for (let k = 0; k < 6; k++) {
      const angle = (k / 6) * Math.PI * 2 + 0.3;
      const q = 5 * z;
      const s = dot({
        width: `${q}px`,
        height: `${q}px`,
        background: c.core,
        boxShadow: `0 0 ${6 * z}px ${2 * z}px ${c.glow}`,
      });
      const burst = s.animate(
        [
          { transform: tf(b, q), opacity: 1 },
          {
            transform: tf(
              { x: b.x + Math.cos(angle) * 28 * z, y: b.y + Math.sin(angle) * 28 * z },
              q,
              "scale(.5)",
            ),
            opacity: 0,
          },
        ],
        { duration: BURST_MS, easing: "ease-out", fill: "forwards" },
      );
      void burst.finished.catch(() => undefined).finally(() => gone(s));
    }
    // Landed once the symbol has popped (the card being cast waits for
    // this, so the pop is seen): in the animation's own time, so a hurry
    // or a slowed clock keeps them together.
    await pop?.finished.catch(() => undefined);
  }

  return (
    <div
      ref={anchor}
      className="gs-balls-anchor"
      aria-hidden="true"
      style={{ width: geometry.width, height: geometry.height }}
    />
  );
}
