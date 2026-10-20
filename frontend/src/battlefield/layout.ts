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
const ATTACK_STEP = 14 / 900; // an attacker steps this far toward the divider
const HAND_DIP = 5 / 900; // per card from the middle of the hand
const HAND_TILT = 2.4; // degrees per card from the middle of the hand
const HAND_PITCH = 0.78; // of card width
const TAPPED_TILT = 15; // degrees (§7.52a, from the canvas)
const ATTACHMENT_PEEK = 0.16; // of card height, per attachment behind a host

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
  /** Attached cards tucked behind it, nearest first (§7.52a L7). */
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

interface RowPlan {
  row: Rect;
  count: number;
  scale: number;
  pitch: number;
}

/** How many cards of width `cardW` fit in a row at `pitch`. */
function capacity(row: Rect, cardW: number, pitch: number, inset: number): number {
  const room = row.w - 2 * inset - cardW;
  if (room < 0) return row.w >= cardW ? 1 : 0;
  return 1 + Math.floor(room / pitch + 1e-9);
}

/**
 * Split `n` slots between a kind's two rows and pick a pitch and scale
 * (contract §3, §7.9, §7.51):
 *
 *   1. fill the first row at the reference pitch;
 *   2. then the second row;
 *   3. past both, split between the rows by width and overlap, down to
 *      the minimum sliver (33% of a card);
 *   4. then shrink both rows uniformly, down to the 75% floor;
 *   5. past that the cards overlap more than the sliver, and the group
 *      is reported overcrowded.
 *
 * Piling (step 5 of the contract) already happened before this: a pile
 * is one slot. Steps 1 and 2 of the contract are one step here
 * (BATTLEFIELD_RENDERING.md §4: the reference pitch IS card width plus
 * the minimum gap, so there is no spare width to spread).
 */
function planRows(
  n: number,
  first: Rect,
  second: Rect,
  g: Geometry,
): { plans: [RowPlan, RowPlan]; overcrowded: boolean } {
  const { cardW, inset, referencePitch } = g;
  const capFirst = capacity(first, cardW, referencePitch, inset);
  const capSecond = capacity(second, cardW, referencePitch, inset);
  const reference = (row: Rect, count: number): RowPlan => ({
    row,
    count,
    scale: 1,
    pitch: referencePitch,
  });

  if (n <= capFirst) {
    return { plans: [reference(first, n), reference(second, 0)], overcrowded: false };
  }
  if (n <= capFirst + capSecond) {
    return {
      plans: [reference(first, capFirst), reference(second, n - capFirst)],
      overcrowded: false,
    };
  }

  // Both rows full: share the slots by width, never fewer than a row's
  // own capacity would have held (so the split moves smoothly on from
  // step 2), and overlap.
  const share = Math.round((n * first.w) / (first.w + second.w));
  const inFirst = Math.min(n - 1, Math.max(capFirst, share));
  const counts: [number, number] = [inFirst, n - inFirst];
  const rows: [Rect, Rect] = [first, second];

  // The largest scale (<= 1) at which every row fits at the sliver.
  let scale = 1;
  for (let i = 0; i < 2; i++) {
    const k = counts[i]!;
    if (k <= 1) continue;
    const fit = (rows[i]!.w - 2 * inset) / (cardW * (1 + SLIVER * (k - 1)));
    scale = Math.min(scale, fit);
  }
  const overcrowded = scale < SCALE_FLOOR;
  scale = Math.max(SCALE_FLOOR, scale);

  const plan = (i: number): RowPlan => {
    const k = counts[i]!;
    const row = rows[i]!;
    const w = cardW * scale;
    const pitch =
      k > 1 ? Math.min(referencePitch * scale, (row.w - 2 * inset - w) / (k - 1)) : referencePitch;
    return { row, count: k, scale, pitch };
  };
  return { plans: [plan(0), plan(1)], overcrowded };
}

/** Centre-out placement (BATTLEFIELD_RENDERING.md §4): the group is
 * centred in its row, clamped to the row's inset. */
function placeRow(plan: RowPlan, g: Geometry): { left: number; top: number; w: number; h: number } {
  const w = g.cardW * plan.scale;
  const h = g.cardH * plan.scale;
  const groupW = plan.count > 0 ? (plan.count - 1) * plan.pitch + w : 0;
  const left = Math.max(plan.row.x + g.inset, plan.row.x + (plan.row.w - groupW) / 2);
  return { left, top: plan.row.y + (plan.row.h - h) / 2, w, h };
}

// --- layout -------------------------------------------------------------------

const Z_BATTLEFIELD = 10;
const Z_HAND = 1000;

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
    const { plans, overcrowded: crowded } = planRows(group.slots.length, first, second, g);
    if (crowded) overcrowded.push(groupKey);

    let next = 0;
    plans.forEach((plan, rowIndex) => {
      const rowId: RowId = `${group.side}:${rowIndex === 0 ? firstName : secondName}`;
      const place = placeRow(plan, g);
      for (let i = 0; i < plan.count; i++) {
        const members = group.slots[next++]!;
        const lead = members[0]!;
        const towardDivider = group.side === "viewer" ? -1 : 1;
        const step = lead.attacking ? towardDivider * ATTACK_STEP * g.height : 0;
        const box: Box = {
          x: place.left + i * plan.pitch,
          y: place.top + step,
          w: place.w,
          h: place.h,
          scale: plan.scale,
          rotation: lead.tapped ? TAPPED_TILT : 0,
          // Left to right, so a card overlaps the one before it (§7.9).
          z: Z_BATTLEFIELD + (rowIndex * 100 + i) * 10,
        };
        const attached = (attachmentsOf.get(lead.id) ?? []).map((card) => card.id);
        for (const member of members) {
          boxes.set(member.id, box);
          rowOf.set(member.id, rowId);
        }
        attached.forEach((id, depth) => {
          boxes.set(id, {
            ...box,
            y: box.y - (depth + 1) * ATTACHMENT_PEEK * box.h,
            rotation: 0,
            z: box.z - (depth + 1),
          });
          rowOf.set(id, rowId);
        });
        slots.push({ row: rowId, ids: members.map((card) => card.id), attached, box });
      }
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
