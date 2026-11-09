// Lines and combat effects — BATTLEFIELD_RENDERING.md §5.5 and §7 step 5;
// PHASE 7 AMENDMENTS 4 and 7.
//
// Pure geometry, like layout() and motion.ts: where each relationship line
// starts and ends, and its curve. The shapes are the PixiJS mock's
// (`proxic-arena-spike-10`: attack-, block-, target- and
// attach-presentation.mjs), ported to plain points for SVG. (AMENDMENT 7's
// swoop is gone: Phase 10 A-13 plays combat one fight at a time, in
// fights.ts.) Nothing here decides what attacks, blocks or targets what:
// that is Forge's, and arrives as data (§7.61 B3, B4, B13).

import type { Box, Geometry, Slot } from "./layout";
import type { Point } from "./motion";

/** Stacking, between the battlefield (up to ~2000) and the hand (10000). */
/** A card selected to attack or block (W-14): lifted over its neighbours,
    so its seal shows (Amendment 13, item 10); under the lines. */
export const Z_MARKED = 4400;
export const Z_LINES = 5000;
export const Z_EFFECTS = 6000;

/** A spell's damage number (AMENDMENT 7 item 5). Combat's fights are fights.ts
 * (Phase 10 A-13), which replaced AMENDMENT 7's swoop. */
export const NUMBER_MS = 1000;

/** What a line or a hit points at: a permanent, or a player. */
export type TargetRef = { object: string } | { player: number };

/**
 * The colours of each line (owner 2026-10-21, MTG Arena-style): one family
 * of clean, glowing arrows -- gold for a spell's target, ember for an
 * attack, steel blue for a block, copper for an attachment.
 */
export const LINE_THEME = {
  attack: { aura: "#ff5a1f", body: "#ff7a3d", core: "#ffe1c4" },
  block: { aura: "#3aa8ff", body: "#6cc6ff", core: "#e4f5ff" },
  target: { aura: "#f0a830", body: "#f4c25e", core: "#fff4d6" },
  attach: { aura: "#b9782f", body: "#d6a15c", core: "#ffdfac" },
  // Spec 0028 — an ability on the stack, back to the permanent it came from: faint.
  source: { aura: "#5c6472", body: "#8a8f98", core: "#d8dde4" },
} as const;
export type LineKind = keyof typeof LINE_THEME;

/** A point of a card in its own fractions (0..1), where it is drawn. */
export function pointOn(box: Box, origin: { x: number; y: number }, fx: number, fy: number): Point {
  const px = box.x + origin.x * box.w;
  const py = box.y + origin.y * box.h;
  const t = (box.rotation * Math.PI) / 180;
  const dx = box.x + fx * box.w - px;
  const dy = box.y + fy * box.h - py;
  return {
    x: px + dx * Math.cos(t) - dy * Math.sin(t),
    y: py + dx * Math.sin(t) + dy * Math.cos(t),
  };
}

export const centreOf = (box: Box, origin: { x: number; y: number }) =>
  pointOn(box, origin, 0.5, 0.5);

export interface Curve {
  start: Point;
  c1: Point;
  c2: Point;
  end: Point;
}

/**
 * A line's curve. Each kind bends as the mock's did; `lane` spreads
 * several lines into one object apart (the mock's lanes).
 */
export function curve(kind: LineKind, start: Point, end: Point, lane = 0): Curve {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / dist;
  const ny = dx / dist;
  if (kind === "attach" || kind === "source") {
    const bend = Math.min(40, dist * 0.08);
    return {
      start,
      c1: { x: start.x + dx * 0.32 + nx * bend, y: start.y + dy * 0.32 + ny * bend },
      c2: { x: start.x + dx * 0.68 + nx * bend, y: start.y + dy * 0.68 + ny * bend },
      end,
    };
  }
  const bend =
    kind === "block"
      ? Math.min(70, dist * 0.085) + lane * 41
      : Math.min(95, dist * 0.11) + lane * 75;
  const back = kind === "block" ? 0.7 : 0.72;
  return {
    start,
    c1: { x: start.x + dx * 0.33 + nx * bend, y: start.y + dy * 0.33 + ny * bend },
    c2: { x: start.x + dx * back - nx * bend * 0.35, y: start.y + dy * back - ny * bend * 0.35 },
    end,
  };
}

export function pathOf(c: Curve | Route): string {
  const pieces: Route = "start" in c ? [c] : c;
  const n = (v: number) => Math.round(v * 10) / 10;
  const first = pieces[0]!;
  return (
    `M ${n(first.start.x)} ${n(first.start.y)}` +
    pieces
      .map(
        (p) =>
          ` C ${n(p.c1.x)} ${n(p.c1.y)}, ${n(p.c2.x)} ${n(p.c2.y)}, ${n(p.end.x)} ${n(p.end.y)}`,
      )
      .join("")
  );
}

// --- spec 0066: A · Soft arc (owner 2026-11-08) -------------------------------

/**
 * A line made of cubic pieces end to end (each piece starts where the one
 * before ends, in the direction it ended in). A soft arc is one piece.
 */
export type Route = readonly Curve[];

/**
 * One end of a line: where it is, and `out`, the unit direction pointing
 * away from what it belongs to -- the way the line leaves a start.
 */
export interface Port {
  at: Point;
  out: Point;
}

/** How far off its target a line's tip stops, in card heights (a hair's gap, as the canvas). */
export const TIP_GAP = 0.03;
/**
 * Spec 0066 (the canvas "arrows-1108", look A): how high an arc rises off
 * the table -- this share of the distance it travels, never lower than
 * ARC_LOW nor higher than ARC_HIGH card heights (the canvas's 20..92 px on
 * its 86-px cards).
 */
export const ARC_RISE = 0.26;
export const ARC_LOW = 0.23;
export const ARC_HIGH = 1.07;
/** Spec 0066, item 2 -- the stud a stack card's arrow leaves from: its left edge, at the picture. */
export const STUD_AT = 0.45;
/** Where the thread back to an ability's source meets its stack card: the left edge, under the badges. */
export const SOURCE_AT = 0.22;

/**
 * A card's edge facing the middle of the table -- the top edge of a card on
 * your side, the bottom edge on the other -- at its middle, on the frame
 * (tilt included), and the way out of it, toward the middle. `off` moves
 * it that far out. An attack arrow leaves from here.
 */
export function facingPort(
  box: Box,
  origin: { x: number; y: number },
  middle: number,
  off = 0,
  share = 1,
): Port {
  const below = centreOf(box, origin).y > middle;
  const at = pointOn(box, origin, share / 2, below ? 0 : 1);
  const out = { x: 0, y: below ? -1 : 1 };
  return { at: { x: at.x + out.x * off, y: at.y + out.y * off }, out };
}

/**
 * How much of a card shows, from its left, in a line squeezed so tight
 * that the next card covers its right side (1: all of it): a line leaves
 * the middle of the edge that shows (`facingPort`'s `share`).
 */
export function shownShare(slots: readonly Slot[], lead: string): number {
  const slot = slots.find((s) => s.ids[0] === lead);
  if (!slot) return 1;
  const { x, w } = slot.box;
  let next = x + w;
  for (const other of slots) {
    if (other.row === slot.row && other.box.x > x + 0.5) next = Math.min(next, other.box.x);
  }
  return Math.max(0.1, Math.min(1, (next - x) / w));
}

/**
 * Spec 0066 -- where an arc lands on a card: the middle of its top edge as
 * drawn (the highest of its corners, tilt included), `off` above it. Every
 * arc comes down onto the top of what it points at, as the canvas does.
 */
export function topOf(box: Box, origin: { x: number; y: number }, off = 0): Point {
  const corners = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].map(([fx, fy]) => pointOn(box, origin, fx!, fy!));
  const centre = centreOf(box, origin);
  return { x: centre.x, y: Math.min(...corners.map((c) => c.y)) - off };
}

/** How high an arc that travels `dist` rises (spec 0066: higher the further it goes). */
export function arcLift(dist: number, cardH: number): number {
  return Math.min(ARC_HIGH * cardH, Math.max(ARC_LOW * cardH, dist * ARC_RISE));
}

/**
 * Spec 0066, A · Soft arc (the canvas "arrows-1108"): one smooth curve
 * that rises off the table like a thrown ball and comes down onto its end.
 * One cubic piece whose two handles both sit `lift` up the screen from the
 * straight line, so every arc bends the same way (up) and has no corner;
 * higher the further it travels (`arcLift`). It leaves its card outward:
 * from a card's side (a stack card's stud) straight out and rising; from
 * a top edge rising; from a bottom edge (the other player's attacker) it
 * never turns back up over the card it leaves. It always comes DOWN onto
 * its end, from above.
 */
export function arc(
  start: Port,
  end: Point,
  cardH: number,
  lift?: number,
  clear?: Clear,
  avoid?: readonly Point[],
): Route {
  const s = start.at;
  const dx = end.x - s.x;
  const dy = end.y - s.y;
  const dist = Math.hypot(dx, dy);
  const up = lift ?? arcLift(dist, cardH);
  // Coming down onto the end: the second handle is above it.
  let r2 = Math.max(up, 0.2 * cardH - 0.22 * dy);
  const piece = (c1: Point): Curve => ({
    start: s,
    c1,
    c2: { x: s.x + dx * 0.78, y: s.y + dy * 0.78 - r2 },
    end,
  });
  if (Math.abs(start.out.x) > 0.7) {
    // From a card's side (a stack card's stud): straight out, rising --
    // kept only while it still bends one way (convex handles).
    if (start.out.x * dx > 0) {
      const c2y = s.y + dy * 0.78 - r2;
      const x = s.x + start.out.x * Math.max(0.33 * cardH, Math.abs(dx) * 0.3);
      // Kept above the line to the second handle: rising all the way.
      const share = Math.min(1, (x - s.x) / (dx * 0.78));
      // (Rising less toward a target well below: it is mostly a fall.)
      const rise = up * 0.55 * Math.min(1, Math.max(0.25, Math.abs(dx) / Math.max(1, dy)));
      const y = Math.min(s.y - rise, s.y + (c2y - s.y) * share - 0.08 * cardH);
      // Landing as the canvas did; else (it would cut its target's corner)
      // coming down more steeply onto it.
      for (const along of [0.78, 0.9, 0.97]) {
        const side: Curve = { start: s, c1: { x, y }, c2: { x: s.x + dx * along, y: c2y }, end };
        if (oneBend(side) && !(avoid && crosses(side, avoid))) return [side];
      }
      if (avoid && end.y < s.y) {
        // Its target close beside the card it leaves, and higher: straight
        // up past it first, then over and down onto its top.
        let top = Math.min(s.y, end.y) - 0.3 * cardH;
        const climb = (y: number): Curve => ({
          start: s,
          c1: { x: s.x + start.out.x * Math.min(0.5 * cardH, Math.abs(dx) * 0.02), y },
          c2: { x: end.x - dx * 0.5, y },
          end,
        });
        for (let i = 0; i < 40 && crosses(climb(top), avoid) && top > 0.15 * cardH; i++)
          top -= 0.1 * cardH;
        if (!crosses(climb(top), avoid)) return [climb(top)];
        // Right above the stud: round one side of it (the left, else the
        // right, under the stack), over, and down onto it.
        const roof = Math.max(0.15 * cardH, Math.min(...avoid.map((q) => q.y)) - 0.6 * cardH);
        for (const far of [
          Math.min(...avoid.map((q) => q.x)) - 0.5 * cardH,
          Math.max(...avoid.map((q) => q.x)) + 0.5 * cardH,
        ]) {
          const around: Curve = {
            start: s,
            c1: { x: far, y: roof },
            c2: { x: end.x + (far - end.x) * 0.15, y: roof },
            end,
          };
          if (!crosses(around, avoid)) return [around];
        }
      }
    } else {
      // Its end behind the stack it leaves (a life circle in the rail,
      // beyond the stack): spec 0066 (owner, 2026-11-08) -- never behind a
      // stack card on its way. Out from the stud, away from the stack, and
      // round it: over its top (`clear.top`) to a circle above the stack's
      // middle, under its caption (`clear.bottom`) to one below; then onto
      // the circle.
      const over = clear?.top;
      const below = clear !== undefined && end.y > (clear.top + clear.bottom) / 2;
      const climb = clear ? Math.abs(s.y - (below ? clear.bottom : clear.top)) : 0;
      const hook = (y: number): Curve => ({
        start: s,
        c1: {
          x:
            s.x +
            start.out.x *
              Math.max(
                0.5 * cardH,
                climb * 0.6,
                below && clear?.captionLeft !== undefined
                  ? s.x - clear.captionLeft + 0.3 * cardH
                  : 0,
                // (Wide of the badges beside the cards' name bars.)
                clear?.badges?.length ? s.x - leftOf(clear.badges) + 0.6 * cardH : 0,
              ),
          // (Out to the side first, under the badges, then up.)
          y: clear?.badges?.length && !below ? s.y - (s.y - y) * 0.2 : y,
        },
        c2: { x: end.x - dx * 0.04, y },
        end,
      });
      // Round the stack: no point past the stud inside its rows.
      const inside = (c: Curve) => clear !== undefined && throughStack(c, start, clear, cardH);
      if (below && avoid) {
        // A permanent below the stack's foot: under the caption, then down
        // onto its top (else, with no room, the plain arc below).
        const low = clear.bottom + 0.15 * cardH;
        const c = hook(low);
        if (low < end.y - 0.1 * cardH && !inside(c) && !crosses(c, avoid) && oneBend(c)) return [c];
      } else if (below) {
        // Out to the left of the stack and its caption, down past them,
        // and round under the caption onto the circle.
        // The first shape that clears them, lowest first.
        const edge = Math.min(s.x, clear.captionLeft ?? s.x);
        const under = (y: number, out: number, down: number, along: number): Curve => {
          const left = edge - out * cardH;
          return {
            start: s,
            c1: { x: left, y: s.y + (y - s.y) * down },
            c2: { x: left + (end.x - left) * along, y },
            end,
          };
        };
        let first: Curve | null = null;
        for (let i = 0; i < 12 && !first; i++) {
          const low = clear.bottom + (0.3 + 0.15 * i) * cardH;
          for (const out of [0.8, 1.4])
            for (const down of [0.3, 0.6, 0.9])
              for (const along of [0.9, 0.75, 0.55, 0.35]) {
                const c = under(low, out, down, along);
                if (!first && !inside(c) && oneBend(c)) first = c;
              }
        }
        return [first ?? under(clear.bottom + 2 * cardH, 1.4, 0.9, 0.35)];
      } else {
        // (Never off the top of the board: the other player's life circle
        // sits near it.)
        let top = Math.max(
          0.15 * cardH,
          Math.min(Math.min(s.y, end.y) - up * 0.55, end.y - 0.2 * cardH),
        );
        for (let i = 0; i < 40 && over !== undefined && top > 0.15 * cardH; i++) {
          if (!inside(hook(top))) break;
          top -= 0.1 * cardH;
        }
        return [hook(top)];
      }
    }
  }
  // The handles both lifted off the straight line; one bend while neither
  // is under 0.282 of the other (the turns at both handles agree).
  let r1 = up;
  if (start.out.y > 0) {
    // From a bottom edge it never turns back up over its card: it leaves
    // level at most, and the landing flattens to keep one bend.
    // (Below a tilted card's edge -- 5 degrees -- 0.1 of the way across at least; and a
    // first handle a tenth of the way long, so a steep fall has no kink.)
    const drop = Math.max(
      0.022 * Math.abs(dx),
      Math.sqrt(Math.max(0, (0.1 * dist) ** 2 - (0.22 * dx) ** 2)),
    );
    r1 = Math.min(up, Math.max(0, 0.22 * dy - drop));
    r2 = Math.min(r2, r1 / 0.282);
  } else r1 = Math.max(r1, 0.282 * r2);
  return [piece({ x: s.x + dx * 0.22, y: s.y + dy * 0.22 - r1 })];
}

/**
 * Spec 0066 -- does an arc from a stud pass behind the stack (past the
 * stud, within its rows) or under its caption?
 */
function throughStack(c: Curve, start: Port, clear: Clear, cardH: number): boolean {
  const s = start.at;
  const m = 0.05 * cardH;
  return routePoints([c], 64).some(
    (p) =>
      ((p.x - s.x) * -start.out.x > 0 && p.y > clear.top && p.y < clear.bottom + m) ||
      (clear.captionLeft !== undefined &&
        p.x > clear.captionLeft - m &&
        p.y > (clear.captionTop ?? clear.bottom) &&
        p.y < clear.bottom + m) ||
      // (Its way out, level with the stud: a card further back has its
      // stud in the badges' column.)
      (Math.abs(p.y - s.y) > 0.15 * cardH &&
        (clear.badges ?? []).some(
          (b) => p.x > b.x0 - m && p.x < b.x1 && p.y > b.y0 - m && p.y < b.y1 + m,
        )),
  );
}

/** A rectangle on the board, an arc must not enter (a player's plate's picture, name or tiles). */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The left edge of the leftmost rectangle (`fallback` for none). */
function leftOf(rects: readonly Rect[] | undefined, fallback = Infinity): number {
  return Math.min(fallback, ...(rects ?? []).map((r) => r.x0));
}

/** Does a curve enter any of these rectangles? */
export function entersAny(c: Curve, rects: readonly Rect[]): boolean {
  return routePoints([c], 64).some((p) =>
    rects.some((r) => p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1),
  );
}

/** Does a curve pass over a card (its four corners, in order), more than 2 px in? */
function crosses(c: Curve, poly: readonly Point[]): boolean {
  const sign = Math.sign(
    (poly[1]!.x - poly[0]!.x) * (poly[2]!.y - poly[0]!.y) -
      (poly[1]!.y - poly[0]!.y) * (poly[2]!.x - poly[0]!.x),
  );
  return routePoints([c], 48).some((p) =>
    poly.every((a, i) => {
      const b = poly[(i + 1) % poly.length]!;
      const len = Math.max(1e-9, Math.hypot(b.x - a.x, b.y - a.y));
      return (sign * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x))) / len > 2;
    }),
  );
}

/** The four corners of a card as drawn (tilt included), in order. */
export function cornersOf(box: Box, origin: { x: number; y: number }): Point[] {
  return [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].map(([fx, fy]) => pointOn(box, origin, fx!, fy!));
}

/**
 * Spec 0066 -- what an arrow from a stack card's stud goes round: the
 * stack's rows (`top` to `bottom`, from the stud rightward) and its caption
 * (from `captionLeft`, below `captionTop`).
 */
export interface Clear {
  top: number;
  bottom: number;
  captionLeft?: number;
  captionTop?: number;
  /** The number and face badges beside the stack cards' name bars. */
  badges?: readonly Rect[];
}

/** A cubic's handles turn the same way at both (no S-bend): its control polygon is convex. */
function oneBend(c: Curve): boolean {
  const turn = (a: Point, b: Point, d: Point) =>
    (b.x - a.x) * (d.y - b.y) - (b.y - a.y) * (d.x - b.x);
  const t1 = turn(c.start, c.c1, c.c2);
  const t2 = turn(c.c1, c.c2, c.end);
  // ...and never doubles back on itself at a handle (a cusp).
  const open = (a: Point, b: Point, d: Point) => {
    const u = { x: b.x - a.x, y: b.y - a.y };
    const v = { x: d.x - b.x, y: d.y - b.y };
    return (u.x * v.x + u.y * v.y) / Math.max(1e-9, Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
  };
  return t1 * t2 > 0 && open(c.start, c.c1, c.c2) > -0.35 && open(c.c1, c.c2, c.end) > -0.35;
}

/**
 * Spec 0066 -- an arc into a life circle (centre `ring`): aimed at the
 * centre, it stops on the rim `r` out, on the side it comes down from --
 * never over the total.
 */
export function arcToRing(
  start: Port,
  ring: Point,
  r: number,
  cardH: number,
  clear?: Clear,
  keepOut: readonly Rect[] = [],
): Route {
  // Owner, 2026-11-08 ("tighter path"): from a stack card's stud to a
  // circle beyond the stack, the tightest clear way round it.
  if (clear && Math.abs(start.out.x) > 0.7 && (ring.x - start.at.x) * start.out.x < 0) {
    const tight = studRound(start, ring, r, cardH, clear, keepOut);
    if (tight) return tight;
  }
  const aimed = arc(start, ring, cardH, undefined, clear)[0]!;
  const rim = ringEdge(ring, aimed.c2, r);
  const first = arc(start, rim, cardH, undefined, clear);
  if (keepOut.length === 0 || !entersAny(first[0]!, keepOut)) return first;
  // A stack card's arrow to a circle below the stack's foot (your own, under
  // the stack): out left of the stack and its caption, round under the
  // caption, and down onto the circle's top -- two pieces, the second its
  // landing turn (2026-11-08 review: never across the plate's picture).
  if (clear && Math.abs(start.out.x) > 0.7 && ring.y > clear.bottom) {
    const s = start.at;
    const end = { x: ring.x, y: ring.y - r };
    const left = Math.min(s.x, clear.captionLeft ?? s.x) - 0.25 * cardH;
    for (const d of [0.35, 0.25, 0.5, 0.15]) {
      const w = {
        x: left,
        y: Math.max(
          clear.bottom + 0.12 * cardH,
          Math.min(clear.bottom + d * cardH, end.y - 0.25 * cardH),
        ),
      };
      const round: Curve = {
        start: s,
        c1: { x: s.x + start.out.x * Math.max(0.6 * cardH, (s.x - w.x) * 1.8), y: s.y },
        c2: { x: w.x - 0.5 * cardH, y: w.y },
        end: w,
      };
      const reach = Math.max(0.3 * cardH, Math.min(0.6 * cardH, end.y - w.y));
      const down: Curve = {
        start: w,
        c1: { x: w.x + (end.x - w.x) * 0.45, y: w.y },
        c2: { x: end.x, y: end.y - reach },
        end,
      };
      if (
        [round, down].every((c) => !entersAny(c, keepOut) && !throughStack(c, start, clear, cardH))
      )
        return [round, down];
    }
  }
  // Spec 0066 (2026-11-08 review): never across a player's picture, name or
  // tiles -- come in onto the circle from another side, from straight
  // above first, landing along the circle's own radius.
  for (const deg of [-90, -70, -110, -50, -130, -30, -150, -10, -170]) {
    const a = (deg * Math.PI) / 180;
    const n = { x: Math.cos(a), y: Math.sin(a) };
    const end = { x: ring.x + n.x * r, y: ring.y + n.y * r };
    const base = arc(start, end, cardH, undefined, clear)[0]!;
    const far = Math.hypot(end.x - start.at.x, end.y - start.at.y);
    for (const k of [0, 0.15, 0.3, 0.5])
      for (const lift of [0, 0.5, 1, -0.3, -0.6, -1])
        for (const cx of [base.c1.x, start.at.x]) {
          let reach = Math.max(0.3 * cardH, far * k);
          // (Not off the board's top: the other player's circle is near it.)
          if (n.y < 0) reach = Math.min(reach, (end.y - 2) / -n.y);
          const c2 = { x: end.x + n.x * reach, y: end.y + n.y * reach };
          // (Rising sooner, to pass over a plate near the board's top.)
          const high = Math.min(c2.y, end.y);
          // (Or, round the stack's foot, dipping lower: under its caption.)
          const c1 =
            lift >= 0
              ? { x: cx, y: base.c1.y + Math.min(0, high - base.c1.y) * lift }
              : {
                  x: cx,
                  y: Math.max(base.c1.y, (clear?.bottom ?? base.c1.y) - lift * cardH),
                };
          const c: Curve = { ...base, c1, c2 };
          // Round the stack's foot to a circle below it, the arrow can come
          // down onto it only with a second, gentle turn at its landing.
          const landing = clear !== undefined && end.y > clear.bottom && n.y < 0;
          // (Out of its card, never back over it.)
          const outward =
            Math.abs(start.out.y) > 0.7 ? (c1.y - start.at.y) * start.out.y >= 0 : true;
          if (
            outward &&
            (oneBend(c) || landing) &&
            !entersAny(c, keepOut) &&
            !(clear && throughStack(c, start, clear, cardH)) &&
            routePoints([c], 32).every((p) => p.y > 0)
          )
            return [c];
        }
  }
  // Else over the plate: up to a point just above its head and left of
  // it, then along and down onto the circle's top -- two pieces, both
  // turning the same way (a corner of the plate rounded, not crossed).
  const head = keepOut.find((k) => ring.y > k.y0 && ring.y < k.y1);
  if (head) {
    const s = start.at;
    const end = { x: ring.x, y: ring.y - r };
    const w = {
      x: Math.min(head.x0 - 0.1 * cardH, Math.max(head.x0 - 0.3 * cardH, s.x + 0.1 * cardH)),
      y: head.y0 - Math.min(0.3 * cardH, head.y0 / 2),
    };
    const bend = { x: w.x - Math.max(0.5 * cardH, (w.x - s.x) * 0.4), y: w.y };
    const rise: Curve = {
      start: s,
      c1:
        Math.abs(start.out.x) > 0.7
          ? {
              x: Math.min(s.x - 0.4 * cardH, leftOf(clear?.badges, s.x) - 0.6 * cardH),
              y: s.y,
            }
          : { x: start.out.y < 0 ? Math.min(s.x, bend.x) : s.x, y: s.y - (s.y - w.y) * 0.5 },
      c2: bend,
      end: w,
    };
    const reach = Math.max(0.1 * cardH, Math.min(0.5 * cardH, end.y - w.y));
    const land: Curve = {
      start: w,
      c1: { x: w.x + (end.x - w.x) * 0.5, y: w.y },
      c2: { x: end.x, y: end.y - reach },
      end,
    };
    if (
      [rise, land].every(
        (c) => !entersAny(c, keepOut) && !(clear && throughStack(c, start, clear, cardH)),
      )
    )
      return [rise, land];
    // From a stack card's stud: first out to the side under the badges,
    // to a point left of them, then up and over, then down -- three
    // pieces, all turning the same way.
    if (Math.abs(start.out.x) > 0.7) {
      const b = 0.3 * cardH;
      const side = Math.min(s.x - b, leftOf(clear?.badges, s.x) - 0.8 * cardH);
      // (Up past the badges' left side, to above them.)
      const p = {
        x: side,
        y: Math.min(s.y - b, Math.min(s.y, ...(clear?.badges ?? []).map((q) => q.y0)) - b),
      };
      const lead: Curve = {
        start: s,
        c1: { x: s.x + start.out.x * Math.max(b, (s.x - side) * 0.8), y: s.y },
        c2: { x: p.x, y: p.y + (s.y - p.y) * 0.85 },
        end: p,
      };
      const up: Curve = {
        start: p,
        c1: { x: p.x, y: p.y - Math.max(b, (p.y - w.y) * 0.4) },
        c2: bend,
        end: w,
      };
      if (
        [lead, up, land].every(
          (c) => !entersAny(c, keepOut) && !(clear && throughStack(c, start, clear, cardH)),
        )
      )
        return [lead, up, land];
    }
  }
  return first;
}

/**
 * Owner, 2026-11-08 ("tighter path") -- a stack card's arrow to a life
 * circle beyond the stack: out level from the stud to just past the
 * badges' column (`STUD_CLEAR` card heights), then straight up past the
 * stack's top (or down past its caption), over (or under) to the plate,
 * and onto the circle's top from above, never over the plate's picture,
 * name or tiles. Three pieces, each corner rounded. Null when it cannot
 * be done clear of them.
 */
export const STUD_CLEAR = 0.2;
function studRound(
  start: Port,
  ring: Point,
  r: number,
  cardH: number,
  clear: Clear,
  keepOut: readonly Rect[],
): Route | null {
  const s = start.at;
  const end = { x: ring.x, y: ring.y - r };
  // (Going under the caption needs room to turn under its corner.)
  const x =
    Math.min(s.x, leftOf(clear.badges, s.x), clear.captionLeft ?? s.x) - 2 * STUD_CLEAR * cardH;
  // (`x`: badges first, the caption too when going under it.)
  const above = end.y < clear.top;
  const lane = above ? Math.min(s.x, leftOf(clear.badges, s.x)) - STUD_CLEAR * cardH : x;
  const head = keepOut.find((k) => ring.y > k.y0 && ring.y < k.y1);
  // The level the arrow crosses to the plate at: over the stack (and over
  // the plate's head, for the top circle), or under the caption -- as close
  // to it as stays clear.
  for (const gap of [0.15, 0.25, 0.35])
    for (const k of [0.7, 0.9, 1]) {
      const level = above
        ? Math.min(clear.top, head ? head.y0 : clear.top) - gap * cardH
        : clear.bottom + gap * cardH;
      if (level <= 0.05 * cardH || (!above && level > end.y - 0.15 * cardH)) continue;
      const turn = Math.min(0.4 * cardH, Math.abs(s.y - level) / 3);
      const p = { x: lane, y: s.y + (above ? -turn : turn) };
      const out: Curve = {
        start: s,
        c1: { x: lane, y: s.y },
        c2: { x: lane, y: s.y + (p.y - s.y) * 0.5 },
        end: p,
      };
      const w = {
        x: head ? Math.min(head.x0 - 0.15 * cardH, (lane + end.x) / 2) : (lane + end.x) / 2,
        y: level,
      };
      const go = Math.abs(level - p.y);
      const rise: Curve = {
        start: p,
        c1: { x: lane, y: p.y + (above ? -1 : 1) * go * k },
        c2: { x: lane + (w.x - lane) * (1.15 - k), y: level },
        end: w,
      };
      const drop = Math.max(0.1 * cardH, end.y - level);
      const land: Curve = {
        start: w,
        c1: { x: w.x + (end.x - w.x) * 0.5, y: level },
        c2: { x: end.x, y: end.y - drop * 0.7 },
        end,
      };
      const route = [out, rise, land];
      if (
        route.every((c) => !entersAny(c, keepOut) && !throughStack(c, start, clear, cardH)) &&
        routePoints(route, 24).every((q) => q.y > 0)
      )
        return route;
    }
  return null;
}

/**
 * Spec 0066 -- how far up off the felt an arc flies at its highest: its
 * shadow on the felt falls about this far below it.
 */
export function arcHeight(r: Route): number {
  const c = r[0]!;
  const last = r[r.length - 1]!;
  let most = 0;
  for (let i = 1; i < 16; i++) {
    const t = i / 16;
    const p = bez(c, t);
    const chordY = c.start.y + (last.end.y - c.start.y) * t;
    most = Math.max(most, chordY - p.y);
  }
  return most;
}

/**
 * Spec 0066 -- the soft shadow on the felt under a lifted arc: the arc's
 * own points moved down (and a little right) by how high it is there --
 * nothing at its ends, most at its middle (the canvas's `shadow`).
 */
export function arcShadow(r: Route, depth: number): string {
  const pts = routePoints(r, 30);
  const lengths = [0];
  for (let i = 1; i < pts.length; i++)
    lengths.push(
      lengths[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y),
    );
  const total = Math.max(0.001, lengths[lengths.length - 1]!);
  const n = (v: number) => Math.round(v * 10) / 10;
  return pts
    .map((p, i) => {
      const h = Math.sin((Math.PI * lengths[i]!) / total) * depth;
      return `${i ? "L" : "M"} ${n(p.x + h * 0.35)} ${n(p.y + h * 0.9)}`;
    })
    .join(" ");
}

const bez = (c: Curve, t: number): Point => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const f = t * t * t;
  return {
    x: a * c.start.x + b * c.c1.x + d * c.c2.x + f * c.end.x,
    y: a * c.start.y + b * c.c1.y + d * c.c2.y + f * c.end.y,
  };
};

/** Points along a route, `per` to a piece (its ends included). */
export function routePoints(r: Route, per = 24): Point[] {
  const out: Point[] = [r[0]!.start];
  for (const c of r) for (let i = 1; i <= per; i++) out.push(bez(c, i / per));
  return out;
}

/** The point `share` (0..1) of the way along a route, by length. */
export function routeAt(r: Route, share: number): Point {
  const pts = routePoints(r);
  const lengths = [0];
  for (let i = 1; i < pts.length; i++)
    lengths.push(
      lengths[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y),
    );
  const want = lengths[lengths.length - 1]! * share;
  const i = Math.max(
    1,
    lengths.findIndex((l) => l >= want),
  );
  const span = Math.max(0.001, lengths[i]! - lengths[i - 1]!);
  const t = (want - lengths[i - 1]!) / span;
  return {
    x: pts[i - 1]!.x + (pts[i]!.x - pts[i - 1]!.x) * t,
    y: pts[i - 1]!.y + (pts[i]!.y - pts[i - 1]!.y) * t,
  };
}

/**
 * The route with its last piece stopping `by` short of its tip, along the
 * way it arrives: the body ends under the arrowhead, so the head (not the
 * stroke's round cap) makes the point.
 */
export function trimmed(r: Route, by: number): Route {
  const last = r[r.length - 1]!;
  const u = arrival(last);
  return [
    ...r.slice(0, -1),
    { ...last, end: { x: last.end.x - u.x * by, y: last.end.y - u.y * by } },
  ];
}

/** The direction the curve arrives in, at its end. */
function arrival(c: Curve): Point {
  let dx = c.end.x - c.c2.x;
  let dy = c.end.y - c.c2.y;
  if (Math.hypot(dx, dy) < 0.001) {
    dx = c.end.x - c.c1.x;
    dy = c.end.y - c.c1.y;
  }
  if (Math.hypot(dx, dy) < 0.001) {
    dx = c.end.x - c.start.x;
    dy = c.end.y - c.start.y;
  }
  const len = Math.max(0.001, Math.hypot(dx, dy));
  return { x: dx / len, y: dy / len };
}

/** The fire line's arrowhead (the mock's attackArrow), scaled to `size`:
 * the same size on every line, along the curve's own direction at its tip. */
export function arrowHead(route: Curve | Route, size: number): string {
  const c = "start" in route ? route : route[route.length - 1]!;
  const u = arrival(c);
  const p = { x: -u.y, y: u.x };
  const back = { x: c.end.x - u.x * size, y: c.end.y - u.y * size };
  const half = size / 2;
  const pts = [
    c.end,
    { x: back.x + p.x * half, y: back.y + p.y * half },
    { x: back.x - u.x * size * 0.3, y: back.y - u.y * size * 0.3 },
    { x: back.x - p.x * half, y: back.y - p.y * half },
  ];
  return pts.map((q) => `${Math.round(q.x * 10) / 10},${Math.round(q.y * 10) / 10}`).join(" ");
}

// --- the stack, as cards (owner 2026-10-21) -----------------------------------

/** How much bigger than a battlefield card a spell on the stack is drawn. */
export const STACK_SCALE = 1.5;
/**
 * Phase 9 W-20 (owner 2026-11-02, option A) -- the stack drawn readable:
 * the whole card, the close-up's size. Only while nothing is to be chosen
 * on the table; then the stack steps back to STACK_SCALE, off what might
 * be clicked under it.
 */
export const STACK_READ_SCALE = 3;
/** How much of each card behind the front one shows: its name bar and a little art. */
export const STACK_PEEK = 0.2;
/** The least of it that may show when a tall stack has to tighten: the name bar. */
export const STACK_PEEK_MIN = 0.12;

/**
 * Spec 0028 — where the stack's objects are drawn while they wait: a
 * cascade at the right edge of the play area. The object that resolves
 * next is the front card, lowest; each one under it on the stack sits
 * higher, behind it, so its name bar shows. Every object is drawn, all
 * the same size. A tall stack tightens towards STACK_PEEK_MIN; past what
 * still fits between the turn track and the hand, the oldest are left
 * out (the caption counts them). Centred on the board's middle line when
 * there is room. The boxes come top-of-stack first, as the stack does.
 */
export function stackSpotBoxes(g: Geometry, count: number, scale = STACK_SCALE): Box[] {
  if (count <= 0) return [];
  const w = g.cardW * scale;
  const h = g.cardH * scale;
  const right = g.play.x + g.play.w - g.inset * 2;
  // Between the turn track (the top tenth) and the hand.
  const top = g.height * 0.1;
  const bottom = Math.max(top + h, g.handTop - g.inset);
  const room = bottom - top;
  const most = Math.max(1, Math.floor((room - h) / (h * STACK_PEEK_MIN)) + 1);
  const shown = Math.min(count, most);
  const peek =
    shown > 1
      ? Math.min(h * STACK_PEEK, Math.max(h * STACK_PEEK_MIN, (room - h) / (shown - 1)))
      : 0;
  const total = h + peek * (shown - 1);
  const y0 = Math.min(Math.max(g.height / 2 - total / 2, top), bottom - total);
  return Array.from({ length: shown }, (_, i) => ({
    x: right - w,
    y: y0 + (shown - 1 - i) * peek,
    w,
    h,
    scale,
    rotation: 0,
    z: 0,
  }));
}

/**
 * Spec 0066 -- the bottom of the stack's caption ("Next: ..."), under its
 * front card: an arrow to a life circle beyond the stack passes below it.
 */
export function stackCaptionBottom(front: Box, g: Geometry): number {
  return front.y + front.h + g.cardH * 0.05 + Math.max(11, g.cardH * 0.085) * 1.9;
}

/**
 * Spec 0066 -- where each stack card's number and face badges are drawn
 * (Board.tsx's `.bf-stack-tag`: two badges 0.15 card heights each and
 * 4 px apart, at 1.5x whatever the stack's size, 4 px left of the card,
 * at its top; a little room for a "×N" chip).
 */
export function stackBadgeRects(spots: readonly Box[], cardH: number): Rect[] {
  return spots.map((b) => {
    const right = b.x - 4 * b.scale;
    const y0 = b.y + b.h * 0.01;
    return {
      x0: right - (0.3 * cardH + 4) * 1.5 - 0.05 * cardH,
      x1: right,
      y0,
      y1: y0 + 0.15 * cardH * 1.5,
    };
  });
}

/**
 * Spec 0066 -- the height of stack card `index`'s stud: at the picture
 * (STUD_AT), or -- a card further back, whose stud would sit on a front
 * card's badges -- just below those badges.
 */
export function studY(spots: readonly Box[], index: number, cardH: number): number {
  const box = spots[index]!;
  let y = box.y + box.h * STUD_AT;
  for (const b of stackBadgeRects(spots, cardH))
    if (y > b.y0 - 0.06 * cardH && y < b.y1 + 0.06 * cardH) y = b.y1 + 0.08 * cardH;
  return y;
}

/** Where a line from inside an upright box toward `toward` leaves its edge. */
export function rectEdge(box: Box, toward: Point): Point {
  const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const t = Math.min(
    dx === 0 ? Infinity : box.w / 2 / Math.abs(dx),
    dy === 0 ? Infinity : box.h / 2 / Math.abs(dy),
  );
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** Where a line toward a circle's centre meets its edge (a life total). */
export function ringEdge(centre: Point, from: Point, r: number): Point {
  const dx = from.x - centre.x;
  const dy = from.y - centre.y;
  const len = Math.max(0.001, Math.hypot(dx, dy));
  return { x: centre.x + (dx / len) * r, y: centre.y + (dy / len) * r };
}

/** Where a player's life total is, for lines and hits that point at them. */
export function playerPoint(seat: number, viewerSeat: number, where: Record<string, Point>): Point {
  return where[`${seat === viewerSeat ? "viewer" : "opponent"}:life`]!;
}

/** How big the impact burst and the damage number are, from the card. */
export function effectSizes(g: Geometry) {
  return {
    burst: g.cardW, // AMENDMENT 7 item 4: about a card wide
    number: g.cardH * 0.22,
    line: Math.max(2, g.cardH * 0.035),
  };
}
