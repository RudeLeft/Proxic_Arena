// The battlefield layout — PHASE_07 §7.5–§7.12, §7.52a, §7.58;
// docs/architecture/BATTLEFIELD_LAYOUT_CONTRACT.md as amended by spec 0040;
// docs/architecture/BATTLEFIELD_RENDERING.md §3–§4.
//
//   layout(input, viewport) -> where every object sits
//
// PURE. No DOM, no clock, no randomness, no stored state: the same
// (state, viewport, viewer) always gives the same boxes (§7.6). It
// positions what it is handed and decides nothing about the game
// (§6.50): which line a card is in follows Forge's own `kind`, and the
// order within a line follows Forge's own entry timestamp.
//
// The renderer applies it, the overlays read it, the tests assert it.
// Nothing else positions a card.

// --- the lines (spec 0040) ---------------------------------------------------

/**
 * Spec 0040 (owner 2026-10-30, replacing the contract's six fixed boxes a
 * side): each side of the table is a band of LINES running the whole play
 * width, and a line holds one kind only -- creatures nearest the middle,
 * then everything else, then lands at the player's own edge.
 *
 * The opponent's band, as fractions of the board's height; the viewer's is
 * its mirror about y = 0.5. It is exactly what the contract's three rows
 * covered, so a full-size line is one of those rows.
 */
const HALF_TOP = 0.0964;
const HALF_BOTTOM = 0.3642 + 0.1333;
const LINE_PITCH = 0.2302 - 0.0964; // of board height, between line tops, at full size

export type Side = "viewer" | "opponent";
export type Kind = "creature" | "land" | "other";
/** A line: its side, its kind, and its place among that kind's lines
 * (1 = nearest the middle for creatures and the rest, at the edge for lands). */
export type RowId = `${Side}:${Kind}-${number}`;

/** Spec 0040: a side's card size steps down only through these; four
 * lines fit from 75% on. */
export const SIZE_STEPS = [1, 0.9, 0.8, 0.75, 0.7] as const;
/** Each card shows at least this share of its width before cards shrink. */
export const SHOW_MIN = 0.5;
/** A side grows back a step only when every card would show this much. */
export const GROW_SHOW = 0.6;

const ZONE_H = 0.1333; // of board height (2/15): a line at full size
const CARD_H_OF_ZONE = 0.9479;
const CARD_ASPECT = 0.7143; // w / h, 5:7
const INSET = 0.00347; // of board height: the minimum gap and the line inset
const REFERENCE_PITCH = 0.09375; // of board height; = card width + minimum gap
const SLIVER = 0.33; // of card width (§7.51 decision 1): the least ever showing
const RAIL_X = 0.8529; // the rail starts here on the 16:9 board
const HAND_BASELINE = 0.9167; // of board height: the top of a resting hand card
// From the canvas (a 1600x900 board), as fractions of its height:
const HAND_DIP = 5 / 900; // per card from the middle of the hand
const HAND_TILT = 2.4; // degrees per card from the middle of the hand
const HAND_PITCH = 0.78; // of card width
/** Spec 0040: 5 degrees (was 15), so a tapped card fits its line and
 * nothing of it is cut. */
export const TAPPED_TILT = 5;

/** Where a tapped card and a hand card rotate about, as CSS
 * transform-origin percentages of the card box. */
export const TAPPED_ORIGIN = { x: 0.5, y: 0.92 } as const;
export const HAND_ORIGIN = { x: 0.5, y: 1.2 } as const;
/** Spec 0031 — the opponent's hand turns about a point above its cards. */
export const OPPONENT_HAND_ORIGIN = { x: 0.5, y: -0.2 } as const;

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
  /**
   * Spec 0003 — what this attacker attacks ("player:2", "card:N"), set
   * only while it is attacking and unblocked: such identical attackers
   * pile together, one card and one fire line.
   */
  attackPile?: string;
  /** Spec 0037 — the one attacker this blocker blocks: it rides on it. */
  blocks?: string;
  /** Spec 0036 — facts a stack compares (absent: as if none). */
  damage?: number;
  ringBearer?: boolean;
  sector?: string | null;
  sprocket?: number | null;
}

export interface LayoutInput {
  battlefield: readonly LayoutCard[];
  /** The viewer's own hand, in Forge's order. */
  hand: readonly { id: string }[];
  /** Spec 0031 — the opponent's hand: a back for each hidden card, the
   * card for one shown to the viewer. */
  opponentHand?: readonly { id: string }[];
  /** Whose view this is (§7.12: the layout is per viewer). */
  viewerSeat: number;
  /**
   * Spec 0040 — each side's card size in the layout before this one. A side
   * grows back only with room to spare (GROW_SHOW), so one card coming and
   * going never makes it jump between sizes. Passed in, never stored here.
   */
  previousScale?: Partial<Record<Side, number>>;
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

/** One place in a line: a single permanent (with whatever is attached to
 * it) or a pile of identical ones (§7.58). */
export interface Slot {
  row: RowId;
  /** Every object in the slot's pile, oldest first; one for a single. */
  ids: string[];
  /** Its Auras and Equipment, oldest first; drawn as name tags on it
   * (§7.52a L7 as amended by PHASE 7 AMENDMENT 4). */
  attached: string[];
  box: Box;
  /** Spec 0037 — a blocker riding on an attacker: that attacker's slot
   * lead. Its box hangs from the attacker's toward the board's middle. */
  rides?: string;
}

export interface Geometry {
  width: number;
  height: number;
  cardW: number;
  cardH: number;
  inset: number;
  referencePitch: number;
  /** Everything left of the rail; the lines stretch across it (§7.52a L1). */
  play: Rect;
  rail: Rect;
  /** Spec 0040 — each side's band of lines. */
  halves: Record<Side, Rect>;
  /** A full-size line's height, and the step between line tops. */
  lineH: number;
  linePitch: number;
  handTop: number;
}

/** Spec 0040 — one line as laid out: one kind, at its side's size. */
export interface Line {
  id: RowId;
  side: Side;
  kind: Kind;
  rect: Rect;
  scale: number;
}

export interface Layout {
  geometry: Geometry;
  /** Every placed object: permanents, pile members, attachments and the
   * viewer's hand. Pile members share their pile's box. */
  boxes: Map<string, Box>;
  slots: Slot[];
  /** Which line each battlefield object is in. */
  rowOf: Map<string, RowId>;
  /** Spec 0040 — the lines in use, and each side's card size. */
  lines: Line[];
  scales: Record<Side, number>;
  /** Sides ("viewer:creature"...) whose cards show less than the minimum
   * sliver even at the smallest size. */
  overcrowded: string[];
}

// --- geometry ---------------------------------------------------------------

/**
 * The fixed geometry for a viewport. Card size follows the HEIGHT; the
 * rail's width follows the height too (§7.52a L2); the lines stretch
 * across whatever width is left (§7.52a L1).
 */
export function geometry(viewport: Viewport): Geometry {
  const { width, height } = viewport;
  const railW = (1 - RAIL_X) * (16 / 9) * height;
  const playW = Math.max(0, width - railW);
  const zoneH = ZONE_H * height;
  const half = (HALF_BOTTOM - HALF_TOP) * height;
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
    halves: {
      opponent: { x: 0, y: HALF_TOP * height, w: playW, h: half },
      viewer: { x: 0, y: (1 - HALF_BOTTOM) * height, w: playW, h: half },
    },
    lineH: zoneH,
    linePitch: LINE_PITCH * height,
    handTop: HAND_BASELINE * height,
  };
}

// --- membership -------------------------------------------------------------

export function kindOf(card: LayoutCard): Kind {
  if (card.kind === "creature") return "creature";
  if (card.kind === "land") return "land";
  return "other";
}

/**
 * Combat, as layout needs it (spec 0003, spec 0037): unblocked attackers
 * say what they attack, so identical ones pile (one card, one fire line);
 * a blocker of exactly one attacker rides on it. The board and its tests
 * both lay out through this, so they agree.
 */
export function inCombat<C extends LayoutCard>(
  battlefield: readonly C[],
  combat: {
    attackers: readonly { id: string; target: { player: number } | { object: string } }[];
    blocks: readonly { blocker: string; attacker: string }[];
  },
): C[] {
  const aims = new Map(
    combat.attackers.map((a) => [
      a.id,
      "player" in a.target ? `player:${a.target.player}` : a.target.object,
    ]),
  );
  const blocked = new Set(combat.blocks.map((b) => b.attacker));
  const blocking = new Map<string, string[]>();
  for (const b of combat.blocks) {
    blocking.set(b.blocker, [...(blocking.get(b.blocker) ?? []), b.attacker]);
  }
  return battlefield.map((card) => {
    const blocks = blocking.get(card.id);
    if (blocks?.length === 1) return { ...card, blocks: blocks[0]! };
    return card.attacking && aims.has(card.id) && !blocked.has(card.id)
      ? { ...card, attackPile: aims.get(card.id)! }
      : card;
  });
}

/** Spec 0036 — at most this many cards to a stack; the next starts another. */
export const PILE_MAX = 15;

/**
 * Spec 0036 — everything a stack compares: two cards stack only when all
 * of it matches, so a stack never hides a difference that could change a
 * choice. Artwork is not compared (two printings of one card stack).
 */
function identity(card: LayoutCard): string {
  return JSON.stringify([
    card.seat,
    card.name,
    card.token === true,
    card.types,
    card.power,
    card.toughness,
    [...card.keywords].sort(),
    card.tapped,
    card.sick,
    card.counters.map((c) => `${c.name}:${c.count}`).sort(),
    card.damage ?? 0,
    card.ringBearer ?? false,
    card.sector ?? null,
    card.sprocket ?? null,
  ]);
}

/**
 * Which stack a card belongs to, or null for a card that stands alone.
 *
 * Spec 0036 (owner 2026-10-29, replacing §7.58 / §7.52a L5 / L8's "basic
 * lands and tokens only"): any identical cards stack -- `identity` says
 * what identical means. Alone: a face-down card, anything with an
 * attachment or attached, and a blocker that does not ride (spec 0037).
 *
 * Attacking (spec 0003): unblocked attackers of the same thing stack, as
 * `attackPile` says. A blocked attacker stacks with the attackers its
 * twins are, blocked by twins of its blockers (spec 0037: identical pairs
 * stack); `riders` are its blockers.
 */
function pileKey(
  card: LayoutCard,
  attachedHosts: ReadonlySet<string>,
  riders: readonly LayoutCard[] | undefined,
): string | null {
  if (card.faceDown || !card.known) return null;
  if (card.attachedTo !== null || attachedHosts.has(card.id)) return null;
  if (card.blocking) return null;
  if (riders) return JSON.stringify(["pair", identity(card), riders.map(identity).sort()]);
  if (card.attacking && card.attackPile === undefined) return null;
  return JSON.stringify([card.attacking ? card.attackPile : null, identity(card)]);
}

/**
 * Spec 0037 — where a blocker sits on its attacker, of a card: a little
 * toward the board's middle and to the right, drawn over it. Measured on
 * the real board (2026-10-29): the two front rows touch in the middle, so
 * a blocker hanging further out covered the defender's own front row.
 */
const RIDE_DOWN = 0.14;
const RIDE_ACROSS = 0.14;

// --- the overflow ladder (spec 0040) -----------------------------------------

/**
 * How far a tilted card reaches past its upright box, left and right,
 * for a card of size w x h tilted TAPPED_TILT degrees about
 * TAPPED_ORIGIN. Computed from the rotation, not estimated: at 5 degrees
 * it is a few percent of a card each way.
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

/** One line's cards placed: each upright box's left edge, and the least
 * share of any card's width left showing (1 when nothing overlaps). */
interface LinePlan {
  xs: number[];
  showing: number;
}

/**
 * Lay one line's slots from x0 to x1 at scale s: one reference pitch apart
 * plus the tilt room a tapped card needs (PHASE 7 AMENDMENT 3: while a line
 * has room, a tapped card overlaps nothing); past the line's width every
 * gap squeezes by one factor, so cards overlap evenly. Creatures and the
 * rest are centred on the table, lands start at its left edge.
 */
function planLine(
  tapped: readonly boolean[],
  x0: number,
  x1: number,
  s: number,
  g: Geometry,
  centred: boolean,
): LinePlan {
  const n = tapped.length;
  if (n === 0) return { xs: [], showing: 1 };
  const w = g.cardW * s;
  const { left: L, right: R } = tiltOverhang(w, g.cardH * s);
  const at: number[] = [];
  const reach: number[] = [];
  let offset = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) offset += g.referencePitch * s + (tapped[i - 1] ? R : 0) + (tapped[i] ? L : 0);
    at.push(offset);
    reach.push(w + (tapped[i] ? R : 0));
  }
  const lead = tapped[0] ? L : 0;
  const avail = x1 - x0;
  // The largest squeeze <= 1 at which no card's drawn edge leaves the line.
  let squeeze = 1;
  at.forEach((a, i) => {
    if (a > 0) squeeze = Math.min(squeeze, (avail - lead - reach[i]!) / a);
  });
  squeeze = Math.max(0, squeeze);
  const used = lead + Math.max(...at.map((a, i) => a * squeeze + reach[i]!));
  const left = (centred ? x0 + Math.max(0, (avail - used) / 2) : x0) + lead;
  let showing = 1;
  for (let i = 1; i < n; i++) showing = Math.min(showing, ((at[i]! - at[i - 1]!) * squeeze) / w);
  return { xs: at.map((a) => left + a * squeeze), showing: Math.min(1, showing) };
}

/** Split a kind's slots over n lines, in arrival order, as evenly as can be. */
function share<T>(slots: readonly T[], n: number): T[][] {
  return Array.from({ length: n }, (_, i) =>
    slots.slice(Math.round((i * slots.length) / n), Math.round(((i + 1) * slots.length) / n)),
  );
}

/** A side's lines at one size: each line's kind, rectangle and plan. */
interface SidePlan {
  scale: number;
  lines: { kind: Kind; index: number; rect: Rect; slots: number[]; plan: LinePlan }[];
  showing: number;
}

const KIND_ORDER: readonly Kind[] = ["creature", "other", "land"];

/**
 * Spec 0040 — a side's lines at size s. Every kind present gets a line; a
 * spare line goes, one at a time, to the kind whose cards overlap most;
 * creature lines run from the middle of the table outward, the rest next,
 * land lines from the player's edge inward.
 */
function planSide(
  side: Side,
  kinds: ReadonlyMap<Kind, readonly boolean[]>,
  s: number,
  g: Geometry,
): SidePlan {
  const half = g.halves[side];
  const lineH = g.lineH * s;
  const pitch = g.linePitch * s;
  const total = Math.floor((half.h - lineH) / pitch + 1e-9) + 1;
  const x0 = g.play.x + g.inset;
  const x1 = g.play.x + g.play.w - g.inset;
  const present = KIND_ORDER.filter((k) => (kinds.get(k)?.length ?? 0) > 0);
  const count = new Map(present.map((k) => [k, 1]));
  const indices = (k: Kind) => kinds.get(k)!.map((_, i) => i);
  const plansOf = (k: Kind, n: number) =>
    share(indices(k), n).map((part) => ({
      slots: part,
      plan: planLine(
        part.map((i) => kinds.get(k)![i]!),
        x0,
        x1,
        s,
        g,
        k !== "land",
      ),
    }));
  const showingOf = (k: Kind, n: number) => Math.min(...plansOf(k, n).map((p) => p.plan.showing));
  for (let spare = total - present.length; spare > 0; spare--) {
    let worst: Kind | null = null;
    let least = 1 - 1e-9;
    for (const k of present) {
      const showing = showingOf(k, count.get(k)!);
      if (showing < least) {
        least = showing;
        worst = k;
      }
    }
    if (worst === null) break;
    count.set(worst, count.get(worst)! + 1);
  }
  const fromMiddle = (j: number) =>
    side === "opponent" ? half.y + half.h - lineH - j * pitch : half.y + j * pitch;
  const fromEdge = (j: number) =>
    side === "opponent" ? half.y + j * pitch : half.y + half.h - lineH - j * pitch;
  const lines: SidePlan["lines"] = [];
  let j = 0;
  for (const k of present) {
    plansOf(k, count.get(k)!).forEach((p, index) => {
      const y = k === "land" ? fromEdge(index) : fromMiddle(j++);
      lines.push({ kind: k, index, rect: { x: x0, y, w: x1 - x0, h: lineH }, ...p });
    });
  }
  return { scale: s, lines, showing: Math.min(1, ...lines.map((l) => l.plan.showing)) };
}

/**
 * Spec 0040 — a side's size: the largest step at which every card shows at
 * least SHOW_MIN of itself (GROW_SHOW for a step above the side's previous
 * size); at the floor, whatever it takes, overcrowded below the sliver.
 */
function sizeSide(
  side: Side,
  kinds: ReadonlyMap<Kind, readonly boolean[]>,
  g: Geometry,
  previous: number | undefined,
): SidePlan & { overcrowded: boolean } {
  let plan: SidePlan | null = null;
  for (const s of SIZE_STEPS) {
    plan = planSide(side, kinds, s, g);
    const needed = previous !== undefined && s > previous + 1e-9 ? GROW_SHOW : SHOW_MIN;
    if (plan.showing >= needed - 1e-9) return { ...plan, overcrowded: false };
  }
  return { ...plan!, overcrowded: plan!.showing < SLIVER - 1e-9 };
}

// --- layout -------------------------------------------------------------------

const Z_BATTLEFIELD = 10;
/** Spec 0037 — a riding blocker draws over every line's cards (which stay
 * under 2000), and under the lines and effects (5000, 6000). */
const RIDER_Z = 2000;
const Z_HAND = 10000; // above every battlefield z (riders reach ~4000), the lines and the effects

/** A hand of [n] cards fanned across the play area: where the first
 * card's left edge is, the step between cards, and the middle index. */
function handFan(n: number, g: Geometry): { left: number; pitch: number; mid: number } {
  const room = g.play.w - 2 * g.inset - g.cardW;
  const pitch = n > 1 ? Math.min(HAND_PITCH * g.cardW, room / (n - 1)) : 0;
  const groupW = Math.max(0, n - 1) * pitch + g.cardW;
  return { left: g.play.x + (g.play.w - groupW) / 2, pitch, mid: (n - 1) / 2 };
}

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

  // Spec 0037 — a blocker rides on the one attacker it blocks, unless
  // something is attached to it (its tags need a card of its own).
  const ridersOf = new Map<string, LayoutCard[]>();
  for (const card of [...input.battlefield].sort(arrival)) {
    const host = card.blocks ? byId.get(card.blocks) : undefined;
    if (!card.blocking || !host || isAttachment(card) || hosts.has(card.id)) continue;
    const list = ridersOf.get(host.id) ?? [];
    list.push(card);
    ridersOf.set(host.id, list);
  }
  const riding = new Set([...ridersOf.values()].flat().map((card) => card.id));
  // The same order for every pair, so a stack's k-th riders are twins.
  for (const list of ridersOf.values()) list.sort((a, b) => (identity(a) < identity(b) ? -1 : 1));

  // Group the free-standing permanents into slots, per side and kind.
  type Group = { side: Side; kind: Kind; slots: LayoutCard[][] };
  const groups = new Map<string, Group>();
  const piles = new Map<string, LayoutCard[]>();
  for (const card of [...input.battlefield].sort(arrival)) {
    if (isAttachment(card) || riding.has(card.id)) continue;
    const side: Side = card.seat === input.viewerSeat ? "viewer" : "opponent";
    const kind = kindOf(card);
    const groupKey = `${side}:${kind}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = { side, kind, slots: [] };
      groups.set(groupKey, group);
    }
    const key = pileKey(card, hosts, ridersOf.get(card.id));
    const pile = key === null ? undefined : piles.get(key);
    // Spec 0036: a full stack stays full; the next twin starts another.
    if (pile && pile.length < PILE_MAX) {
      pile.push(card);
    } else {
      const slot = [card];
      group.slots.push(slot);
      if (key !== null) piles.set(key, slot);
    }
  }

  // Spec 0040 — each side's lines and size, then every slot's box.
  const lines: Line[] = [];
  const scales: Record<Side, number> = { viewer: 1, opponent: 1 };
  for (const side of ["opponent", "viewer"] as const) {
    const kinds = new Map<Kind, LayoutCard[][]>();
    for (const kind of KIND_ORDER) {
      const group = groups.get(`${side}:${kind}`);
      if (group) kinds.set(kind, group.slots);
    }
    const tapped = new Map(
      [...kinds].map(([kind, list]) => [kind, list.map((members) => members[0]!.tapped)]),
    );
    const plan = sizeSide(side, tapped, g, input.previousScale?.[side]);
    scales[side] = plan.scale;
    if (plan.overcrowded) overcrowded.push(side);
    const w = g.cardW * plan.scale;
    const h = g.cardH * plan.scale;

    plan.lines.forEach((line, lineIndex) => {
      const rowId: RowId = `${side}:${line.kind}-${line.index + 1}`;
      lines.push({ id: rowId, side, kind: line.kind, rect: line.rect, scale: plan.scale });
      const top = line.rect.y + (line.rect.h - h) / 2;
      line.slots.forEach((slotIndex, i) => {
        const members = kinds.get(line.kind)![slotIndex]!;
        const lead = members[0]!;
        // An attacker keeps its place (PHASE 7 AMENDMENT 4): what it
        // attacks is shown by a line, not by moving it over the divider.
        const box: Box = {
          x: line.plan.xs[i]!,
          y: top,
          w,
          h,
          scale: plan.scale,
          rotation: lead.tapped ? TAPPED_TILT : 0,
          // Left to right, so a card overlaps the one before it (§7.9);
          // up to four lines a side stay under RIDER_Z.
          z: Z_BATTLEFIELD + (lineIndex * 100 + i) * 4,
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
        // Spec 0037 — the blockers ride: each member's k-th blocker shares
        // the k-th rider box, sitting on the attacker, over every line.
        const toward = side === "opponent" ? 1 : -1;
        const deepest = Math.max(0, ...members.map((m) => ridersOf.get(m.id)?.length ?? 0));
        for (let k = 0; k < deepest; k++) {
          const ids = members.flatMap((m) => {
            const rider = ridersOf.get(m.id)?.[k];
            return rider ? [rider.id] : [];
          });
          const ride: Box = {
            x: box.x + (k + 1) * RIDE_ACROSS * w,
            y: box.y + toward * (RIDE_DOWN + k * 0.06) * h,
            w,
            h,
            scale: plan.scale,
            rotation: 0,
            z: box.z + RIDER_Z + k,
          };
          for (const id of ids) {
            boxes.set(id, ride);
            rowOf.set(id, rowId);
          }
          slots.push({ row: rowId, ids, attached: [], box: ride, rides: lead.id });
        }
      });
    });
  }

  // The viewer's hand: a shallow arc along the baseline, centred in the
  // play area, partly below the edge (§7.52a, from the canvas).
  const fan = handFan(input.hand.length, g);
  input.hand.forEach((card, i) => {
    const off = i - fan.mid;
    boxes.set(card.id, {
      x: fan.left + i * fan.pitch,
      y: g.handTop + Math.abs(off) * HAND_DIP * g.height,
      w: g.cardW,
      h: g.cardH,
      scale: 1,
      rotation: off * HAND_TILT,
      z: Z_HAND + i,
    });
  });

  // Spec 0031 — the opponent's hand: the viewer's mirrored about the
  // board's middle, fanning down from the top edge into the band above
  // the opponent's back row.
  const theirs = input.opponentHand ?? [];
  const theirFan = handFan(theirs.length, g);
  theirs.forEach((card, i) => {
    const off = i - theirFan.mid;
    boxes.set(card.id, {
      x: theirFan.left + i * theirFan.pitch,
      y: g.height - g.handTop - g.cardH - Math.abs(off) * HAND_DIP * g.height,
      w: g.cardW,
      h: g.cardH,
      scale: 1,
      rotation: -off * HAND_TILT,
      z: Z_HAND + i,
    });
  });

  return { geometry: g, boxes, slots, rowOf, lines, scales, overcrowded };
}
