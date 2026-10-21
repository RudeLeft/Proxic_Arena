// The battlefield layout — PHASE_07 §7.5–§7.12, §7.52a, §7.58;
// docs/architecture/BATTLEFIELD_LAYOUT_CONTRACT.md §2–§3;
// docs/architecture/BATTLEFIELD_RENDERING.md §3–§4.
//
//   layout(input, viewport) -> where every object sits
//
// PURE. No DOM, no clock, no randomness, no stored state: the same
// (state, viewport, viewer) always gives the same boxes (§7.6). It
// positions what it is handed and decides nothing about the game
// (§6.50): which row a card is in follows Forge's own `kind`, and the
// order within a row follows Forge's own entry timestamp.
//
// The renderer applies it, the overlays read it, the tests assert it.
// Nothing else positions a card.

// --- the contract's constants (BATTLEFIELD_LAYOUT_CONTRACT.md §2) ----------

/** The six fractional rectangles of the OPPONENT's half, as the contract
 * tables them: x and w are fractions of the 16:9 board width, y of its
 * height. The viewer's half is their mirror about y = 0.5. */
const ROWS = {
  "land-back": { x: 0.0, y: 0.0964, w: 0.425 },
  "other-back": { x: 0.4293, y: 0.0964, w: 0.4238 },
  "land-front": { x: 0.0, y: 0.2302, w: 0.1609 },
  "creature-back": { x: 0.1883, y: 0.2302, w: 0.4246 },
  "other-front": { x: 0.64, y: 0.2302, w: 0.2129 },
  "creature-front": { x: 0.0, y: 0.3642, w: 0.7422 },
} as const;

export type RowName = keyof typeof ROWS;
export type Side = "viewer" | "opponent";
export type RowId = `${Side}:${RowName}`;
export type Kind = "creature" | "land" | "other";

/** Which row fills first, per kind (§7.52a L4, PHASE 7 AMENDMENT 1):
 * lands start in the long back row by the player's edge; creatures and
 * everything else start in their front row. */
const FILL_ORDER: Record<Kind, readonly [RowName, RowName]> = {
  land: ["land-back", "land-front"],
  creature: ["creature-front", "creature-back"],
  other: ["other-front", "other-back"],
};

const ZONE_H = 0.1333; // of board height (2/15)
const CARD_H_OF_ZONE = 0.9479;
const CARD_ASPECT = 0.7143; // w / h, 5:7
const INSET = 0.00347; // of board height: the minimum gap and the row inset
const REFERENCE_PITCH = 0.09375; // of board height; = card width + minimum gap
const SLIVER = 0.33; // of card width (§7.51 decision 1)
const SCALE_FLOOR = 0.75; // of reference card size (§7.51 decision 2)
const RAIL_X = 0.8529; // the rail starts here on the 16:9 board
const HAND_BASELINE = 0.9167; // of board height: the top of a resting hand card
// From the canvas (a 1600x900 board), as fractions of its height:
const HAND_DIP = 5 / 900; // per card from the middle of the hand
const HAND_TILT = 2.4; // degrees per card from the middle of the hand
const HAND_PITCH = 0.78; // of card width
const TAPPED_TILT = 15; // degrees (§7.52a, from the canvas)

/** Where a tapped card and a hand card rotate about, as CSS
 * transform-origin percentages of the card box. */
export const TAPPED_ORIGIN = { x: 0.5, y: 0.92 } as const;
export const HAND_ORIGIN = { x: 0.5, y: 1.2 } as const;

// --- inputs and outputs ---------------------------------------------------

/** What layout needs to know about a permanent. A subset of the Phase 6
 * snapshot card (frontend/src/match.ts), so any snapshot card fits. */
export interface LayoutCard {
  id: string;
  /** The controller's seat (Phase 6 `seat`). */
  seat: number;
  name: string;
  /** Forge's precedence already: creature, else land, else other
   * (ViewerSnapshot.kindOf). "unknown" falls back to other (§7.10). */
  kind: string;
  types: string;
  tapped: boolean;
  attacking: boolean;
  blocking: boolean;
  sick: boolean;
  faceDown: boolean;
  known: boolean;
  power: number | null;
  toughness: number | null;
  keywords: readonly string[];
  counters: readonly { name: string; count: number }[];
  attachedTo: string | null;
  /** Forge's entry timestamp (§7.61 B11). Absent until the worker sends
   * it; the snapshot's own order (Forge's zone order) is used instead. */
  enteredAt?: number;
  /** A token (§7.61 B12). Absent until the worker sends it: then no
   * token piles. */
  token?: boolean;
}

export interface LayoutInput {
  battlefield: readonly LayoutCard[];
  /** The viewer's own hand, in Forge's order. */
  hand: readonly { id: string }[];
  /** Whose view this is (§7.12: the layout is per viewer). */
  viewerSeat: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** A card's place, in CSS px for this viewport. `x`, `y`, `w`, `h` are
 * the UNROTATED box; `rotation` (degrees) turns it about its origin
 * (TAPPED_ORIGIN or HAND_ORIGIN). Larger `z` is drawn on top. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
  rotation: number;
  z: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One place in a row: a single permanent (with whatever is attached to
 * it) or a pile of identical ones (§7.58). */
export interface Slot {
  row: RowId;
  /** Every object in the slot's pile, oldest first; one for a single. */
  ids: string[];
  /** Its Auras and Equipment, oldest first; drawn as name tags on it
   * (§7.52a L7 as amended by PHASE 7 AMENDMENT 4). */
  attached: string[];
  box: Box;
}

export interface Geometry {
  width: number;
  height: number;
  cardW: number;
  cardH: number;
  inset: number;
  referencePitch: number;
  /** Everything left of the rail; the rows stretch across it (§7.52a L1). */
  play: Rect;
  rail: Rect;
  rows: Record<RowId, Rect>;
  handTop: number;
}

export interface Layout {
  geometry: Geometry;
  /** Every placed object: permanents, pile members, attachments and the
   * viewer's hand. Pile members share their pile's box. */
  boxes: Map<string, Box>;
  slots: Slot[];
  /** Which row each battlefield object is in. */
  rowOf: Map<string, RowId>;
  /** Kind groups that did not fit even at the scale floor, so their
   * cards overlap more than the minimum sliver. */
  overcrowded: string[];
}

// --- geometry ---------------------------------------------------------------

/**
 * The fixed geometry for a viewport. Card size follows the HEIGHT; the
 * rail's width follows the height too (§7.52a L2); the rows stretch
 * across whatever width is left (§7.52a L1). At 16:9 this reproduces
 * the contract's 36 rectangles exactly.
 */
export function geometry(viewport: Viewport): Geometry {
  const { width, height } = viewport;
  const railW = (1 - RAIL_X) * (16 / 9) * height;
  const playW = Math.max(0, width - railW);
  // A contract x/w is a fraction of the 16:9 board, whose play area is
  // RAIL_X of it -- so scale by the play area actually available.
  const unit = playW / RAIL_X;
  const zoneH = ZONE_H * height;
  const rows = {} as Record<RowId, Rect>;
  for (const [name, r] of Object.entries(ROWS) as [RowName, (typeof ROWS)[RowName]][]) {
    rows[`opponent:${name}`] = { x: r.x * unit, y: r.y * height, w: r.w * unit, h: zoneH };
    rows[`viewer:${name}`] = {
      x: r.x * unit,
      y: (1 - r.y) * height - zoneH,
      w: r.w * unit,
      h: zoneH,
    };
  }
  const cardH = CARD_H_OF_ZONE * zoneH;
  return {
    width,
    height,
    cardH,
    cardW: CARD_ASPECT * cardH,
    inset: INSET * height,
    referencePitch: REFERENCE_PITCH * height,
    play: { x: 0, y: 0, w: playW, h: height },
    rail: { x: playW, y: 0, w: railW, h: height },
    rows,
    handTop: HAND_BASELINE * height,
  };
}

// --- membership -------------------------------------------------------------

export function kindOf(card: LayoutCard): Kind {
  if (card.kind === "creature") return "creature";
  if (card.kind === "land") return "land";
  return "other";
}

/** A basic land: Forge's type line says so ("Basic Land — Forest"). */
function isBasicLand(card: LayoutCard): boolean {
  return /\bBasic\b/.test(card.types) && /\bLand\b/.test(card.types);
}

/**
 * Which pile a card belongs to, or null for a card that never piles.
 *
 * Identical untapped basics pile from the start, tapped ones in their own
 * pile (§7.58, §7.52a L8); identical tokens pile too (§7.52a L5). A card
 * piles only when nothing about it differs from its twins: anything that
 * could make one of them a different choice -- counters, an attachment,
 * combat, summoning sickness, a changed characteristic -- keeps it out.
 */
function pileKey(card: LayoutCard, attachedHosts: ReadonlySet<string>): string | null {
  const pileable = isBasicLand(card) || card.token === true;
  if (!pileable || card.faceDown || !card.known) return null;
  if (card.counters.length > 0 || card.attachedTo !== null || attachedHosts.has(card.id))
    return null;
  if (card.attacking || card.blocking) return null;
  return JSON.stringify([
    card.seat,
    card.name,
    card.types,
    card.power,
    card.toughness,
    [...card.keywords].sort(),
    card.tapped,
    card.sick,
  ]);
}

// --- the overflow ladder ----------------------------------------------------

/**
 * How far a tilted card reaches past its upright box, left and right,
 * for a card of size w x h tilted TAPPED_TILT degrees about
 * TAPPED_ORIGIN. Computed from the rotation, not estimated: at 15 degrees
 * it is ~1% of a card on the left and ~32% on the right.
 */
export function tiltOverhang(w: number, h: number): { left: number; right: number } {
  const t = (TAPPED_TILT * Math.PI) / 180;
  const px = TAPPED_ORIGIN.x * w;
  const py = TAPPED_ORIGIN.y * h;
  const xs = [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ].map(([x, y]) => px + (x! - px) * Math.cos(t) - (y! - py) * Math.sin(t));
  return { left: Math.max(0, -Math.min(...xs)), right: Math.max(0, Math.max(...xs) - w) };
}

/** One row's share of a kind group: which slots, at what scale, where. */
interface RowPlan {
  row: Rect;
  /** Indices into the group's slots, in order. */
  slots: number[];
  scale: number;
  /** Each slot's upright box's left edge. */
  xs: number[];
}

/**
 * Lay a kind's slots into its two rows (contract §3, §7.9, §7.51, §7.52a):
 *
 *   1. fill the first row, each card one reference pitch from the last
 *      plus the TILT ROOM a tapped card needs (PHASE 7 AMENDMENT 3: while
 *      a row is not overflowing, a tapped card overlaps nothing);
 *   2. then the second row the same way;
 *   3. past both, split the slots between the rows by width and squeeze
 *      every gap in a row by the same factor -- tilt room included, so
 *      squeezing starts from exactly where step 2 stopped and nothing
 *      jumps -- down to the minimum sliver (33% of a card);
 *   4. then shrink both rows uniformly, down to the 75% floor;
 *   5. past that the cards overlap more than the sliver, and the group is
 *      reported overcrowded.
 *
 * Piling (step 5 of the contract) already happened before this: a pile is
 * one slot. Steps 1 and 2 of the contract are one step here
 * (BATTLEFIELD_RENDERING.md §4: the reference pitch IS card width plus the
 * minimum gap, so there is no spare width to spread).
 *
 * Every length here is proportional to the scale, so a row is described at
 * scale 1 and scaled: `gaps` are the distances between consecutive left
 * edges, `ends` the first card plus the tilt hanging off either end.
 */
function planRows(
  tapped: readonly boolean[],
  first: Rect,
  second: Rect,
  g: Geometry,
): { plans: [RowPlan, RowPlan]; overcrowded: boolean } {
  const { cardW, cardH, inset, referencePitch } = g;
  const n = tapped.length;
  const { left: L, right: R } = tiltOverhang(cardW, cardH);

  /** A run of slots [from, to) at scale 1. */
  /**
   * A run of slots [from, to) at scale 1: where each card's left edge is
   * (`at`, from the first card's), how far each reaches to the right
   * (`reach`: the card, plus its tilt if tapped), and the tilt hanging off
   * the left end (`lead`). Squeezing multiplies every `at` by one factor.
   */
  const measure = (from: number, to: number) => {
    const at: number[] = [];
    const reach: number[] = [];
    let offset = 0;
    let min = Infinity;
    for (let i = from; i < to; i++) {
      if (i > from) {
        const gap = referencePitch + (tapped[i - 1] ? R : 0) + (tapped[i] ? L : 0);
        offset += gap;
        min = Math.min(min, gap);
      }
      at.push(offset);
      reach.push(cardW + (tapped[i] ? R : 0));
    }
    const lead = to > from && tapped[from] ? L : 0;
    return { at, reach, lead, min };
  };
  type Run = ReturnType<typeof measure>;
  /** The run's drawn width at a squeeze: its furthest-reaching card,
   * which in a tight squeeze need not be the last one. */
  const extent = (m: Run, squeeze: number) =>
    m.at.length === 0 ? 0 : m.lead + Math.max(...m.at.map((a, i) => a * squeeze + m.reach[i]!));
  const avail = (row: Rect) => row.w - 2 * inset;
  const fits = (row: Rect, from: number, to: number) =>
    extent(measure(from, to), 1) <= avail(row) + 1e-9;

  /** Place a run in a row at a scale, squeezing its gaps if it must: by
   * the largest factor <= 1 at which no card's drawn edge leaves the row. */
  const place = (row: Rect, from: number, to: number, scale: number): RowPlan => {
    const m = measure(from, to);
    let squeeze = 1;
    m.at.forEach((a, i) => {
      if (a > 0) squeeze = Math.min(squeeze, (avail(row) / scale - m.lead - m.reach[i]!) / a);
    });
    squeeze = Math.max(0, squeeze);
    const used = extent(m, squeeze) * scale;
    const left = Math.max(row.x + inset, row.x + (row.w - used) / 2) + m.lead * scale;
    const slots = Array.from({ length: to - from }, (_, k) => from + k);
    return { row, slots, scale, xs: m.at.map((a) => left + a * squeeze * scale) };
  };

  // Steps 1 and 2.
  if (fits(first, 0, n)) {
    return { plans: [place(first, 0, n, 1), place(second, n, n, 1)], overcrowded: false };
  }
  let k = 0;
  while (k < n && fits(first, 0, k + 1)) k++;
  if (fits(second, k, n)) {
    return { plans: [place(first, 0, k, 1), place(second, k, n, 1)], overcrowded: false };
  }

  // Step 3 on: both rows full. Share the slots by width, never fewer in
  // the first than it held at step 2 (so the split moves on smoothly).
  const share = Math.round((n * first.w) / (first.w + second.w));
  const inFirst = Math.min(n - 1, Math.max(k, share));
  const runs: [Rect, number, number][] = [
    [first, 0, inFirst],
    [second, inFirst, n],
  ];

  // The largest scale (<= 1) at which every row still fits with its
  // tightest gap squeezed no further than the sliver.
  let scale = 1;
  for (const [row, from, to] of runs) {
    const m = measure(from, to);
    if (m.at.length <= 1) continue;
    scale = Math.min(scale, avail(row) / extent(m, (SLIVER * cardW) / m.min));
  }
  const overcrowded = scale < SCALE_FLOOR - 1e-9;
  scale = Math.max(SCALE_FLOOR, scale);
  return {
    plans: [place(first, 0, inFirst, scale), place(second, inFirst, n, scale)],
    overcrowded,
  };
}

// --- layout -------------------------------------------------------------------

const Z_BATTLEFIELD = 10;
const Z_HAND = 10000; // above every battlefield z (rows reach ~2000), the lines and the effects

export function layout(input: LayoutInput, viewport: Viewport): Layout {
  const g = geometry(viewport);
  const boxes = new Map<string, Box>();
  const rowOf = new Map<string, RowId>();
  const slots: Slot[] = [];
  const overcrowded: string[] = [];

  const byId = new Map(input.battlefield.map((card) => [card.id, card]));
  // Arrival order (§7.52a L6): Forge's timestamp, else Forge's zone order.
  const order = new Map(
    input.battlefield.map((card, index) => [card.id, [card.enteredAt ?? index, index] as const]),
  );
  const arrival = (a: LayoutCard, b: LayoutCard): number => {
    const [ta, ia] = order.get(a.id)!;
    const [tb, ib] = order.get(b.id)!;
    return ta - tb || ia - ib;
  };

  // Attachments ride with their host (§7.52a L7) when the host is here.
  const attachmentsOf = new Map<string, LayoutCard[]>();
  for (const card of input.battlefield) {
    if (card.attachedTo !== null && byId.has(card.attachedTo) && card.attachedTo !== card.id) {
      const list = attachmentsOf.get(card.attachedTo) ?? [];
      list.push(card);
      attachmentsOf.set(card.attachedTo, list);
    }
  }
  for (const list of attachmentsOf.values()) list.sort(arrival);
  const hosts = new Set(attachmentsOf.keys());
  const isAttachment = (card: LayoutCard): boolean =>
    card.attachedTo !== null && byId.has(card.attachedTo) && card.attachedTo !== card.id;

  // Group the free-standing permanents into slots, per side and kind.
  type Group = { side: Side; kind: Kind; slots: LayoutCard[][] };
  const groups = new Map<string, Group>();
  const piles = new Map<string, LayoutCard[]>();
  for (const card of [...input.battlefield].sort(arrival)) {
    if (isAttachment(card)) continue;
    const side: Side = card.seat === input.viewerSeat ? "viewer" : "opponent";
    const kind = kindOf(card);
    const groupKey = `${side}:${kind}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = { side, kind, slots: [] };
      groups.set(groupKey, group);
    }
    const key = pileKey(card, hosts);
    const pile = key === null ? undefined : piles.get(key);
    if (pile) {
      pile.push(card);
    } else {
      const slot = [card];
      group.slots.push(slot);
      if (key !== null) piles.set(key, slot);
    }
  }

  for (const [groupKey, group] of [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const [firstName, secondName] = FILL_ORDER[group.kind];
    const first = g.rows[`${group.side}:${firstName}`];
    const second = g.rows[`${group.side}:${secondName}`];
    const tapped = group.slots.map((members) => members[0]!.tapped);
    const { plans, overcrowded: crowded } = planRows(tapped, first, second, g);
    if (crowded) overcrowded.push(groupKey);

    plans.forEach((plan, rowIndex) => {
      const rowId: RowId = `${group.side}:${rowIndex === 0 ? firstName : secondName}`;
      const w = g.cardW * plan.scale;
      const h = g.cardH * plan.scale;
      const top = plan.row.y + (plan.row.h - h) / 2;
      plan.slots.forEach((slotIndex, i) => {
        const members = group.slots[slotIndex]!;
        const lead = members[0]!;
        // An attacker keeps its place (PHASE 7 AMENDMENT 4): what it
        // attacks is shown by a line, not by moving it over the divider.
        const box: Box = {
          x: plan.xs[i]!,
          y: top,
          w,
          h,
          scale: plan.scale,
          rotation: lead.tapped ? TAPPED_TILT : 0,
          // Left to right, so a card overlaps the one before it (§7.9).
          z: Z_BATTLEFIELD + (rowIndex * 100 + i) * 10,
        };
        const attachedCards = attachmentsOf.get(lead.id) ?? [];
        for (const member of members) {
          boxes.set(member.id, box);
          rowOf.set(member.id, rowId);
        }
        // An Aura or Equipment is drawn as a name tag on its host
        // (PHASE 7 AMENDMENT 4), so it is where its host is.
        for (const card of attachedCards) {
          boxes.set(card.id, box);
          rowOf.set(card.id, rowId);
        }
        slots.push({
          row: rowId,
          ids: members.map((card) => card.id),
          attached: attachedCards.map((card) => card.id),
          box,
        });
      });
    });
  }

  // The viewer's hand: a shallow arc along the baseline, centred in the
  // play area, partly below the edge (§7.52a, from the canvas).
  const n = input.hand.length;
  if (n > 0) {
    const room = g.play.w - 2 * g.inset - g.cardW;
    const pitch = n > 1 ? Math.min(HAND_PITCH * g.cardW, room / (n - 1)) : 0;
    const groupW = (n - 1) * pitch + g.cardW;
    const left = g.play.x + (g.play.w - groupW) / 2;
    const mid = (n - 1) / 2;
    input.hand.forEach((card, i) => {
      const off = i - mid;
      boxes.set(card.id, {
        x: left + i * pitch,
        y: g.handTop + Math.abs(off) * HAND_DIP * g.height,
        w: g.cardW,
        h: g.cardH,
        scale: 1,
        rotation: off * HAND_TILT,
        z: Z_HAND + i,
      });
    });
  }

  return { geometry: g, boxes, slots, rowOf, overcrowded };
}
