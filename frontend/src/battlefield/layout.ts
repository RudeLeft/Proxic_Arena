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
 * its mirror about y = 0.5. It is what the contract's three rows covered,
 * so a full-size line is one of those rows -- except that since spec 0059
 * it reaches on to the land line's edge, LAND_GAP from the hand (BAND_EDGE),
 * so the land line sits lower; the lines from the middle are where they were.
 *
 * Spec 0059 (owner 2026-11-07): before a side shrinks for want of lines, the
 * other permanents share a line (the land line, else the line of creatures
 * not in combat), each kind from its own end (planShared, sizeSide).
 */
const HALF_TOP = 0.0964;
const HALF_BOTTOM = 0.3642 + 0.1333;
const LINE_PITCH = 0.2302 - HALF_TOP; // of board height, between line tops, at full size

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
/**
 * Spec 0059 item 11 (owner 2026-11-07, Option 1 "lands lower"): the land
 * line's bottom edge sits this far above the hand's resting top (4 px at
 * 1920x1080, scaling with the board's height like everything else); the
 * other player's mirrors it. It was 0.0131 (14 px; a land's edge 18 px)
 * when the band ended at the contract's third row. The band reaches this
 * far on the player's edge only: the lines from the middle are unchanged,
 * and a tapped land's corner stays inside its line, so nothing of a land
 * touches the hand fan (layout.test.ts "the land line").
 */
export const LAND_GAP = 4 / 1080;
/** Where each side's band ends at the player's edge (the opponent's top). */
const BAND_EDGE = 1 - (HAND_BASELINE - LAND_GAP);
// From the canvas (a 1600x900 board), as fractions of its height:
const HAND_DIP = 5 / 900; // per card from the middle of the hand
const HAND_TILT = 2.4; // degrees per card from the middle of the hand
const HAND_PITCH = 0.78; // of card width
/** Spec 0040: 5 degrees (was 15), so a tapped card fits its line and
 * nothing of it is cut. */
export const TAPPED_TILT = 5;
/**
 * Phase 10 A-17 (owner 2026-11-06, Amendment 9): an attached card is a TAB
 * on its host's right edge, the card's full height, this wide (of the card's
 * height: the old name tag's height). The host's slot is wider by its tabs,
 * so the cards beside it make room; past TAB_FAN the tabs fan over each
 * other in the room of TAB_FAN, plus FAN_EXTRA.
 */
export const TAB_W = 0.12;
export const TAB_FAN = 4;
export const FAN_EXTRA = 0.045;

/** The room n tabs take beside their host, as a share of the card's height. */
export function tabRoom(n: number): number {
  if (n <= 0) return 0;
  return n <= TAB_FAN ? n * TAB_W : TAB_FAN * TAB_W + FAN_EXTRA;
}

/** Where the i-th of n tabs starts, from the host's right edge, as a share
 * of the card's height (they fan past TAB_FAN). */
export function tabAt(i: number, n: number): number {
  if (n <= TAB_FAN) return i * TAB_W;
  return (i * (tabRoom(n) - TAB_W)) / (n - 1);
}

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
   * Spec 0070 -- picked to pay a cost not yet paid: it stands apart from its
   * pile (so it can be marked, and clicked to take it back); "lean" -- picked
   * to tap -- it leans as a tapped card does (TAPPED_TILT), never sideways.
   */
  paying?: "lean" | "mark";
  /**
   * Spec 0079 (owner) -- the place of a permanent that has left while a
   * spell still aims at it, held empty: drawn alone, never in a pile.
   */
  held?: boolean;
  /**
   * Spec 0003 — what this attacker attacks ("player:2", "card:N"), set
   * only while it is attacking and unblocked: such identical attackers
   * pile together, one card and one fire line.
   */
  attackPile?: string;
  /** Spec 0037 — the attacker this blocker blocks (the first, when it
   * blocks several): Phase 10 A-12, it stands facing it. */
  blocks?: string;
  /** Spec 0036 — facts a stack compares (absent: as if none). */
  damage?: number;
  ringBearer?: boolean;
  sector?: string | null;
  sprocket?: number | null;
  /** Spec 0080 -- phased out, or holding regeneration shields: a stack compares these too. */
  phasedOut?: boolean | undefined;
  shields?: number | undefined;
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
  /** Phase 10 A-12 — a blocker standing facing its attacker (the
   * attacker's slot lead), in its own side's front line, across the middle. */
  faces?: string;
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
  /** Its stretch of the line: the whole play width, or (shared) one kind's end of it. */
  rect: Rect;
  scale: number;
  /** Spec 0059 — two kinds share this line, each from its own end: this is one's stretch. */
  shared?: boolean;
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
  /** Spec 0059 — which line each side's other permanents share, if any. */
  sharing: Record<Side, Sharing | null>;
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
  // Spec 0059: from the middle out to the land line's edge near the hand.
  const half = (HALF_BOTTOM - BAND_EDGE) * height;
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
      opponent: { x: 0, y: BAND_EDGE * height, w: playW, h: half },
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
 * Combat, as layout needs it (spec 0003, spec 0037, Phase 10 A-12):
 * unblocked attackers say what they attack, so identical ones pile (one
 * card, one fire line); a blocker says the attacker it stands facing (the
 * first, if it blocks several). The board and its tests both lay out
 * through this, so they agree.
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
    if (blocks?.length) return { ...card, blocks: blocks[0]! };
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
    card.phasedOut === true,
    card.shields ?? 0,
  ]);
}

/**
 * Which stack a card belongs to, or null for a card that stands alone.
 *
 * Spec 0036 (owner 2026-10-29, replacing §7.58 / §7.52a L5 / L8's "basic
 * lands and tokens only"): any identical cards stack -- `identity` says
 * what identical means. Alone: a face-down card, anything with an
 * attachment or attached, and a blocker that faces no attacker.
 *
 * Attacking (spec 0003): unblocked attackers of the same thing stack, as
 * `attackPile` says. A blocked attacker stacks with the attackers its
 * twins are, blocked by twins of its blockers (spec 0037: identical pairs
 * stack); `riders` are its blockers (Phase 10 A-12: they stand facing it).
 */
function pileKey(
  card: LayoutCard,
  attachedHosts: ReadonlySet<string>,
  riders: readonly LayoutCard[] | undefined,
): string | null {
  if (card.faceDown || !card.known) return null;
  if (card.paying || card.held) return null;
  if (card.attachedTo !== null || attachedHosts.has(card.id)) return null;
  if (card.blocking) return null;
  if (riders) {
    // A blocker with its own tabs, or attached, stands alone: so its attacker does.
    if (riders.some((r) => r.attachedTo !== null || attachedHosts.has(r.id))) return null;
    return JSON.stringify(["pair", identity(card), riders.map(identity).sort()]);
  }
  if (card.attacking && card.attackPile === undefined) return null;
  return JSON.stringify([card.attacking ? card.attackPile : null, identity(card)]);
}

/**
 * Phase 10 A-12 (owner 2026-11-06, Amendment 15): place each attacker's
 * blockers side by side, centred under (or over) it, in the defender's
 * front line: `groups` are the attackers' centres and, per blocker slot,
 * its width; `step` is the gap between two cards. Left to right, a group
 * that would overlap the one before moves along; past the line's right
 * edge they all move back. Null when they cannot fit side by side at all
 * (the line then squeezes them as any line, §3).
 */
export function faceBlockers(
  groups: readonly { centre: number; widths: readonly number[] }[],
  step: number,
  x0: number,
  x1: number,
): number[][] | null {
  const width = (g: { widths: readonly number[] }) =>
    g.widths.reduce((n, w) => n + w, 0) + step * Math.max(0, g.widths.length - 1);
  const lefts = groups.map((g) => g.centre - width(g) / 2);
  for (let i = 0; i < groups.length; i++) {
    const before = i > 0 ? lefts[i - 1]! + width(groups[i - 1]!) + step : x0;
    lefts[i] = Math.max(lefts[i]!, before);
  }
  for (let i = groups.length - 1; i >= 0; i--) {
    const after = i < groups.length - 1 ? lefts[i + 1]! - step : x1;
    lefts[i] = Math.min(lefts[i]!, after - width(groups[i]!));
  }
  if (groups.length > 0 && lefts[0]! < x0 - 0.5) return null;
  return groups.map((g, i) => {
    let x = lefts[i]!;
    return g.widths.map((w) => {
      const at = x;
      x += w + step;
      return at;
    });
  });
}

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
  /** How wide the line's cards are drawn, tilt included, from the first's left. */
  used: number;
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
  /** Phase 10 A-17: each slot's tab room at full size, in pixels. */
  extra: readonly number[] = [],
  /** Phase 10 A-12: room before each slot (half its blockers' row), at full size. */
  pre: readonly number[] = [],
): LinePlan {
  const n = tapped.length;
  if (n === 0) return { xs: [], showing: 1, used: 0 };
  const w = g.cardW * s;
  const { left: L, right: R } = tiltOverhang(w, g.cardH * s);
  const at: number[] = [];
  const reach: number[] = [];
  let offset = (pre[0] ?? 0) * s;
  for (let i = 0; i < n; i++) {
    if (i > 0)
      offset +=
        g.referencePitch * s +
        (extra[i - 1] ?? 0) * s +
        (pre[i] ?? 0) * s +
        (tapped[i - 1] ? R : 0) +
        (tapped[i] ? L : 0);
    at.push(offset);
    reach.push(w + (extra[i] ?? 0) * s + (tapped[i] ? R : 0));
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
  return { xs: at.map((a) => left + a * squeeze), showing: Math.min(1, showing), used };
}

/**
 * Spec 0059 item 10 -- the gap between the two kinds sharing a line, in
 * reference pitches at the line's size (the canvas's half a card's step).
 */
export const SHARE_GAP = 0.5;
/**
 * Spec 0059 item 10 -- the least share of a card a shared line may show
 * before the next sharing (or a size step) is tried: the same half as any
 * line would be SHOW_MIN; the owner chose (2026-11-07) the canvas's rule:
 * a shared line is full as soon as its cards would overlap at all, so
 * cards stay side by side and the side shrinks after that (measured at
 * 1920x1080: the land line shared to 30 cards, the creature line to 47).
 */
export const SHARE_SHOW = 1;

/**
 * Spec 0059 item 10 -- two kinds sharing one line: the line's own kind from
 * its left end (as lands always start), the other permanents from its right
 * end -- the oldest at the very end, each newer one further in, so nobody
 * moves when one arrives -- with SHARE_GAP between. Each kind keeps to its
 * own stretch of the line; when the two would meet, both squeeze, each by
 * about the same share, so no card of one ever lies on a card of the other.
 */
function planShared(
  host: { tapped: readonly boolean[]; extra: readonly number[]; pre: readonly number[] },
  others: { tapped: readonly boolean[]; extra: readonly number[]; pre: readonly number[] },
  x0: number,
  x1: number,
  s: number,
  g: Geometry,
): { host: LinePlan & { x0: number; x1: number }; others: LinePlan & { x0: number; x1: number } } {
  const gap = SHARE_GAP * g.referencePitch * s;
  const plan = (part: typeof host, a: number, b: number) =>
    planLine(part.tapped, a, b, s, g, false, part.extra, part.pre);
  // Each kind as wide as it would like (nothing squeezed), and as narrow as
  // it can be (all squeezed onto its first card).
  const wide = (part: typeof host) => plan(part, x0, x0 + 1e9).used;
  const narrow = (part: typeof host) => plan(part, x0, x0).used;
  const [hw, ow] = [wide(host), wide(others)];
  const [hn, on] = [narrow(host), narrow(others)];
  const avail = x1 - x0 - gap;
  let hostW = hw;
  let otherW = ow;
  if (hw + ow > avail) {
    const spare = hw - hn + (ow - on);
    const q = spare > 0 ? Math.max(0, Math.min(1, (avail - hn - on) / spare)) : 0;
    hostW = hn + q * (hw - hn);
    otherW = on + q * (ow - on);
  }
  const hostEnd = x0 + hostW;
  const otherStart = x1 - otherW;
  return {
    host: { ...plan(host, x0, hostEnd), x0, x1: hostEnd },
    others: { ...plan(others, otherStart, x1), x0: otherStart, x1 },
  };
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
  /** Each line, or each kind's stretch of a shared line (spec 0059). */
  lines: {
    kind: LineKind;
    index: number;
    rect: Rect;
    slots: readonly number[];
    plan: LinePlan;
    shared?: boolean;
  }[];
  showing: number;
  /** Every line the side needs fits inside its band at this size. */
  fits: boolean;
  /** Spec 0059 — which line the other permanents share, if any. */
  sharing: Sharing | null;
}

/**
 * Phase 10 A-11/A-12 -- "front": the line nearest the middle while there is
 * combat, holding a side's attackers (stepped forward of everything else of
 * theirs) or its blockers (standing facing them). Its id is `creature-1`;
 * the side's other creature lines follow it.
 */
type LineKind = Kind | "front";
const KIND_ORDER: readonly LineKind[] = ["front", "creature", "other", "land"];

/**
 * Spec 0059 item 10 (owner 2026-11-07, "share a line before shrinking"):
 * which line the other permanents share when a side has more kinds of line
 * than its band holds -- first the land line, then the line of creatures
 * not in combat (behind the front line). The front line is never shared.
 */
export type Sharing = "land" | "creature";
const SHARINGS: readonly (Sharing | null)[] = [null, "land", "creature"];

/**
 * Spec 0040 — a side's lines at size s. Every kind present gets a line; a
 * spare line goes, one at a time, to the kind whose cards overlap most;
 * creature lines run from the middle of the table outward, the rest next,
 * land lines from the player's edge inward.
 *
 * Spec 0059 — with `sharing`, the other permanents take no line of their
 * own: they stand at the right end of the land line ("land") or of the
 * line of creatures not in combat ("creature"), planShared. Null when that
 * sharing cannot be (no other permanents, or nothing to share with).
 */
function planSide(
  side: Side,
  kinds: ReadonlyMap<LineKind, readonly boolean[]>,
  s: number,
  g: Geometry,
  extras: ReadonlyMap<LineKind, readonly number[]> = new Map(),
  pres: ReadonlyMap<LineKind, readonly number[]> = new Map(),
  sharing: Sharing | null = null,
): SidePlan | null {
  const half = g.halves[side];
  const lineH = g.lineH * s;
  const pitch = g.linePitch * s;
  const total = Math.floor((half.h - lineH) / pitch + 1e-9) + 1;
  const x0 = g.play.x + g.inset;
  const x1 = g.play.x + g.play.w - g.inset;
  const present = KIND_ORDER.filter((k) => (kinds.get(k)?.length ?? 0) > 0);
  if (sharing && (!present.includes("other") || !present.includes(sharing))) return null;
  // The kinds with lines of their own.
  const own = sharing ? present.filter((k) => k !== "other") : present;
  const count = new Map(own.map((k) => [k, 1]));
  const indices = (k: LineKind) => kinds.get(k)!.map((_, i) => i);
  const partOf = (k: LineKind, part: readonly number[]) => ({
    tapped: part.map((i) => kinds.get(k)![i]!),
    extra: part.map((i) => extras.get(k)?.[i] ?? 0),
    pre: part.map((i) => pres.get(k)?.[i] ?? 0),
  });
  const plansOf = (k: LineKind, n: number) =>
    share(indices(k), n).map((part) => {
      const p = partOf(k, part);
      return {
        slots: part,
        plan: planLine(p.tapped, x0, x1, s, g, k !== "land", p.extra, p.pre),
      };
    });
  const showingOf = (k: LineKind, n: number) =>
    Math.min(...plansOf(k, n).map((p) => p.plan.showing));
  for (let spare = total - own.length; spare > 0; spare--) {
    let worst: LineKind | null = null;
    let least = 1 - 1e-9;
    for (const k of own) {
      // The front line is one line: its cards face each other across the middle.
      if (k === "front") continue;
      // A shared line stays one line (sharing is only ever for want of lines).
      if (k === sharing) continue;
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
  for (const k of own) {
    if (k === sharing) {
      // The shared line: its own kind from the left, the others from the
      // right, newest furthest in (so they are listed right to left).
      const y = k === "land" ? fromEdge(0) : fromMiddle(j++);
      const mine = indices(k);
      const theirs = indices("other").reverse();
      const both = planShared(partOf(k, mine), partOf("other", theirs), x0, x1, s, g);
      for (const [kind, slots, p] of [
        [k, mine, both.host],
        ["other", theirs, both.others],
      ] as const) {
        lines.push({
          kind,
          index: 0,
          rect: { x: p.x0, y, w: p.x1 - p.x0, h: lineH },
          slots,
          plan: p,
          shared: true,
        });
      }
      continue;
    }
    plansOf(k, count.get(k)!).forEach((p, index) => {
      const y = k === "land" ? fromEdge(index) : fromMiddle(j++);
      lines.push({ kind: k, index, rect: { x: x0, y, w: x1 - x0, h: lineH }, ...p });
    });
  }
  return {
    scale: s,
    lines,
    showing: Math.min(1, ...lines.map((l) => l.plan.showing)),
    fits: own.length <= total,
    sharing,
  };
}

/**
 * Spec 0040 — a side's size: the largest step at which every card shows at
 * least SHOW_MIN of itself (GROW_SHOW for a step above the side's previous
 * size); at the floor, whatever it takes, overcrowded below the sliver.
 *
 * Spec 0059 — at each size, a side with more kinds of line than its band
 * holds first lets the other permanents share the land line, then the line
 * of creatures not in combat; only when no sharing shows every card well
 * enough does it step down. So a side in combat stays full size until a
 * shared line itself runs out of room.
 */
function sizeSide(
  side: Side,
  kinds: ReadonlyMap<LineKind, readonly boolean[]>,
  g: Geometry,
  previous: number | undefined,
  extras: ReadonlyMap<LineKind, readonly number[]> = new Map(),
  pres: ReadonlyMap<LineKind, readonly number[]> = new Map(),
): SidePlan & { overcrowded: boolean } {
  let floor: SidePlan | null = null;
  for (const s of SIZE_STEPS) {
    const needed = previous !== undefined && s > previous + 1e-9 ? GROW_SHOW : SHOW_MIN;
    floor = null;
    for (const sharing of SHARINGS) {
      const plan = planSide(side, kinds, s, g, extras, pres, sharing);
      // Phase 10 A-11/A-12: a size whose band holds fewer lines than the
      // side needs is never taken (its lines would cover each other).
      if (!plan || !plan.fits) continue;
      floor ??= plan;
      const shared = Math.min(1, ...plan.lines.filter((l) => l.shared).map((l) => l.plan.showing));
      if (plan.showing >= needed - 1e-9 && shared >= SHARE_SHOW - 1e-9)
        return { ...plan, overcrowded: false };
      // Spec 0059: sharing is only for want of lines.
      if (sharing === null) break;
    }
  }
  return { ...floor!, overcrowded: floor!.showing < SLIVER - 1e-9 };
}

// --- layout -------------------------------------------------------------------

const Z_BATTLEFIELD = 10;
const Z_HAND = 10000; // above every battlefield z (under ~2000), the lines and the effects

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

  // Phase 10 A-12 (Amendment 15, replacing spec 0037's riding): a blocker
  // stands facing the attacker it blocks, in its own side's front line --
  // never on it. (Spec 0037: an attacker's twins blocked by twins stack.)
  const ridersOf = new Map<string, LayoutCard[]>();
  for (const card of [...input.battlefield].sort(arrival)) {
    const host = card.blocks ? byId.get(card.blocks) : undefined;
    if (!card.blocking || !host || !host.attacking || isAttachment(card) || isAttachment(host))
      continue;
    const list = ridersOf.get(host.id) ?? [];
    list.push(card);
    ridersOf.set(host.id, list);
  }
  const riding = new Set([...ridersOf.values()].flat().map((card) => card.id));
  // The same order for every pair, so a stack's k-th blockers are twins.
  for (const list of ridersOf.values()) list.sort((a, b) => (identity(a) < identity(b) ? -1 : 1));

  // Group the free-standing permanents into slots, per side and kind; a
  // side's attackers are its front line (Phase 10 A-11).
  type Group = { side: Side; kind: LineKind; slots: LayoutCard[][] };
  const groups = new Map<string, Group>();
  const piles = new Map<string, LayoutCard[]>();
  for (const card of [...input.battlefield].sort(arrival)) {
    if (isAttachment(card) || riding.has(card.id)) continue;
    const side: Side = card.seat === input.viewerSeat ? "viewer" : "opponent";
    const kind: LineKind = card.attacking && !isAttachment(card) ? "front" : kindOf(card);
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

  // Spec 0040 — each side's lines and size, then every slot's box. The
  // attacking side first: the other side's blockers stand facing its
  // attackers (Phase 10 A-12).
  const lines: Line[] = [];
  const scales: Record<Side, number> = { viewer: 1, opponent: 1 };
  const sharing: Record<Side, Sharing | null> = { viewer: null, opponent: null };
  const attackingSide: Side =
    groups.has("viewer:front") && !groups.has("opponent:front") ? "viewer" : "opponent";
  const sides: Side[] =
    attackingSide === "viewer" ? ["viewer", "opponent"] : ["opponent", "viewer"];
  /** Each attacker slot placed: its members and its box, left to right. */
  const attackSlots: { members: LayoutCard[]; box: Box; lead: string }[] = [];
  for (const side of sides) {
    const kinds = new Map<LineKind, LayoutCard[][]>();
    for (const kind of KIND_ORDER) {
      const group = groups.get(`${side}:${kind}`);
      if (group) kinds.set(kind, group.slots);
    }
    // The defender's front line: each attacker slot's k-th blockers, a slot
    // each, in the attackers' order (left to right), so each stands facing it.
    const facingOf: string[] = [];
    if (side !== attackingSide && attackSlots.length > 0) {
      const blockSlots: LayoutCard[][] = [];
      for (const a of [...attackSlots].sort((p, q) => p.box.x - q.box.x)) {
        const deepest = Math.max(0, ...a.members.map((m) => ridersOf.get(m.id)?.length ?? 0));
        for (let k = 0; k < deepest; k++) {
          const ids = a.members.flatMap((m) => {
            const rider = ridersOf.get(m.id)?.[k];
            return rider ? [rider] : [];
          });
          if (ids.length === 0) continue;
          blockSlots.push(ids);
          facingOf.push(a.lead);
        }
      }
      if (blockSlots.length > 0) kinds.set("front", blockSlots);
    }
    const tapped = new Map(
      [...kinds].map(([kind, list]) => [kind, list.map((members) => members[0]!.tapped)]),
    );
    // Phase 10 A-17: a host's tabs need room beside it. A-12: an attacker
    // needs room for the blockers standing side by side facing it, half
    // each side of it, so they stand centred on it.
    const facingRoom = (kind: LineKind, members: readonly LayoutCard[]) => {
      if (kind !== "front" || side !== attackingSide) return 0;
      const facing = Math.max(0, ...members.map((m) => ridersOf.get(m.id)?.length ?? 0));
      return (Math.max(0, facing - 1) * g.referencePitch) / 2;
    };
    const extras = new Map(
      [...kinds].map(([kind, list]) => [
        kind,
        list.map((members) => {
          const tabs = g.cardH * tabRoom(attachmentsOf.get(members[0]!.id)?.length ?? 0);
          return Math.max(tabs, facingRoom(kind, members));
        }),
      ]),
    );
    const pres = new Map(
      [...kinds].map(([kind, list]) => [kind, list.map((members) => facingRoom(kind, members))]),
    );
    const plan = sizeSide(side, tapped, g, input.previousScale?.[side], extras, pres);
    scales[side] = plan.scale;
    sharing[side] = plan.sharing;
    if (plan.overcrowded) overcrowded.push(side);
    const w = g.cardW * plan.scale;
    const h = g.cardH * plan.scale;

    const hasFront = plan.lines.some((line) => line.kind === "front");
    plan.lines.forEach((line, lineIndex) => {
      const rowId: RowId =
        line.kind === "front"
          ? `${side}:creature-1`
          : `${side}:${line.kind}-${line.index + 1 + (line.kind === "creature" && hasFront ? 1 : 0)}`;
      lines.push({
        id: rowId,
        side,
        kind: line.kind === "front" ? "creature" : line.kind,
        rect: line.rect,
        scale: plan.scale,
        ...(line.shared ? { shared: true } : {}),
      });
      const top = line.rect.y + (line.rect.h - h) / 2;
      // A-12: the blockers' places, each group facing its attacker.
      let xs = line.plan.xs;
      if (line.kind === "front" && facingOf.length > 0) {
        const slotsHere = line.slots.map((i) => kinds.get("front")![i]!);
        const widths = slotsHere.map(
          (members) =>
            w + g.cardH * tabRoom(attachmentsOf.get(members[0]!.id)?.length ?? 0) * plan.scale,
        );
        const groupsHere: { centre: number; widths: number[]; at: number[] }[] = [];
        line.slots.forEach((slotIndex, i) => {
          const lead = facingOf[slotIndex]!;
          const host = attackSlots.find((a) => a.lead === lead)!;
          const last = groupsHere[groupsHere.length - 1];
          const centre = host.box.x + host.box.w / 2;
          if (last && last.centre === centre) {
            last.widths.push(widths[i]!);
            last.at.push(i);
          } else groupsHere.push({ centre, widths: [widths[i]!], at: [i] });
        });
        const placed = faceBlockers(
          groupsHere,
          g.referencePitch * plan.scale - w,
          line.rect.x,
          line.rect.x + line.rect.w,
        );
        if (placed) {
          const out = [...xs];
          groupsHere.forEach((group, j) => group.at.forEach((i, n) => (out[i] = placed[j]![n]!)));
          xs = out;
        }
      }
      line.slots.forEach((slotIndex, i) => {
        const members = kinds.get(line.kind)![slotIndex]!;
        const lead = members[0]!;
        // Phase 10 A-11 (replacing PHASE 7 AMENDMENT 4's "an attacker keeps
        // its place"): attackers are the front line, nearest the middle.
        const box: Box = {
          x: xs[i]!,
          y: top,
          w,
          h,
          scale: plan.scale,
          // Spec 0070: picked to tap leans as a tapped card does.
          rotation: lead.tapped || lead.paying === "lean" ? TAPPED_TILT : 0,
          // Left to right, so a card overlaps the one before it (§7.9);
          // up to four lines a side stay under 2000.
          z: Z_BATTLEFIELD + (lineIndex * 100 + i) * 4,
        };
        const attachedCards = attachmentsOf.get(lead.id) ?? [];
        for (const member of members) {
          boxes.set(member.id, box);
          rowOf.set(member.id, rowId);
        }
        // An Aura or Equipment is drawn as a tab on its host (PHASE 7
        // AMENDMENT 4; a side tab since Phase 10 A-17), so it is where its
        // host is.
        for (const card of attachedCards) {
          boxes.set(card.id, box);
          rowOf.set(card.id, rowId);
        }
        const faces =
          line.kind === "front" && side !== attackingSide ? facingOf[slotIndex] : undefined;
        slots.push({
          row: rowId,
          ids: members.map((card) => card.id),
          attached: attachedCards.map((card) => card.id),
          box,
          ...(faces ? { faces } : {}),
        });
        if (line.kind === "front" && side === attackingSide) {
          attackSlots.push({ members, box, lead: lead.id });
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

  return { geometry: g, boxes, slots, rowOf, lines, scales, sharing, overcrowded };
}
