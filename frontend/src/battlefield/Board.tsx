// The battlefield, drawn — PHASE_07 §7.15–§7.20, BATTLEFIELD_RENDERING.md
// §5, §7 steps 2 and 4.
//
// Draws what layout() decides and nothing else: every position comes from
// it, every card is a real <button> placed by transform, and each carries
// its Phase 6 id and state as data attributes so a test reads the board
// the way a player sees it (§7.42, §7.45). No game logic: what a card IS
// is Forge's, from the snapshot; where it is, is layout()'s.
//
// Movement (step 4, PHASE 7 AMENDMENT 6). Every card is one element keyed
// by its object id, in one layer, so when its box changes -- a tap, a row
// re-centring, a land played from the hand, a creature returned to it --
// the same element glides there (a CSS transition on `transform`). A card
// that was nowhere on the board travels in from its zone in the rail; a
// card that left travels to its zone as a "ghost" (no id, no clicks) and
// fades. None of it gates input (§7.36): the board's state is always the
// newest snapshot's, and an animation only decorates the way there.
//
// Lines and effects (step 5, PHASE 7 AMENDMENTS 4 and 7; restyled MTG
// Arena-fashion, owner 2026-10-21): glowing arrows from attackers to what
// they attack and from blockers to what they block, from a spell's card on
// the stack (drawn large at the right edge of the play area) to what it
// targets, which glows, and a chain while an Aura or Equipment's host is
// chosen -- in one SVG layer that takes no clicks. When damage is dealt, attackers swoop onto
// what they hit, a burst plays there and the amount rises and fades. All
// of it is drawn from data Forge supplies (§7.61 B2-B4, B13); none of it is
// inferred here.

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./battlefield.css";
import cardBack from "../assets/card-back.webp";
import { ManaCost, costChange } from "./ManaCost";
import {
  HAND_ORIGIN,
  OPPONENT_HAND_ORIGIN,
  TAPPED_ORIGIN,
  layout,
  type Box,
  type Geometry,
  type LayoutCard,
  type Viewport,
} from "./layout";
import {
  anchors,
  bandClip,
  bandOf,
  boxAt,
  handZoomBox,
  LIFE_R,
  MOVE_EASING,
  MOVE_MS,
  placement,
  type AnchorId,
  type Point,
} from "./motion";
import {
  arrowHead,
  centreOf,
  curve,
  effectSizes,
  LINE_THEME,
  NUMBER_MS,
  pathOf,
  playerPoint,
  rectEdge,
  ringEdge,
  stackSpotBoxes,
  SWOOP_ARRIVE,
  SWOOP_LEAVE,
  SWOOP_MS,
  swoopBox,
  type LineKind,
  type TargetRef,
  Z_EFFECTS,
  Z_LINES,
  Z_SWOOP,
} from "./effects";

export type { TargetRef } from "./effects";

/** A permanent as the board needs it: layout's fields plus its picture. */
export interface BoardCard extends LayoutCard {
  /** An imported picture's reference, or null (tokens, hidden cards,
   * back faces without a picture). */
  art: string | null;
  /** The Ring-bearer (public): marked on the card, in words too. */
  ringBearer?: boolean;
  /** Un-sets (public): the creature's sector, marked like the Ring-bearer. */
  sector?: string;
  /** Un-sets (public): the sprocket a Contraption is on. */
  sprocket?: number;
}

export interface BoardHandCard {
  id: string;
  name: string;
  kind: string;
  types: string;
  power: number | null;
  toughness: number | null;
  art: string | null;
  /** The printed mana cost ("{1}{R}"); null for a land. */
  manaCost?: string | null;
}

/** Spec 0031 — a card in the opponent's hand: hidden (drawn as a back),
 * or one the server has shown this viewer. */
export interface OpponentHandCard {
  id: string;
  shown: BoardHandCard | null;
}

/** Who attacks what, and who blocks whom (§7.61 B4). */
export interface CombatView {
  attackers: readonly { id: string; target: TargetRef }[];
  blocks: readonly { blocker: string; attacker: string }[];
}

/** One object on the stack and what it targets (§7.61 B2, B3). */
export interface StackView {
  id: string;
  name: string;
  /** Its picture (the caster's deck's), when this viewer may see it. */
  art?: string | null;
  /** A spell's printed mana cost, when this viewer may know it. */
  manaCost?: string | null;
  /** "spell" | "ability" | "trigger" */
  kind?: string;
  /** Who cast or controls it, as the players read it (the stack caption). */
  by?: string | null;
  /** The permanent it came from, if one is on the battlefield (an
   * activated ability); null for a spell, whose line starts at the stack. */
  source: string | null;
  targets: readonly TargetRef[];
  /** Spec 0028 — the seat that controls it: gold edge yours, red theirs. */
  seat?: number;
  /** Spec 0028 — its caster's picture, on the card's corner. */
  caster?: string | null;
  /** Spec 0028 — the card it is (a spell's own card), so a permanent spell
   * that resolves flies onto the table from its place in the stack. */
  card?: string | null;
}

/** An Aura or Equipment whose host is being chosen (the gold chain). */
export interface AttachView {
  source: string;
  host: string;
}

/** Damage just dealt, one wave (one combat damage step, or one spell):
 * what Forge actually dealt (§7.61 B13). A new `key` is a new wave. */
export interface DamageWave {
  key: string;
  hits: readonly { source: string; target: TargetRef; amount: number }[];
}

export interface BoardProps {
  battlefield: readonly BoardCard[];
  hand: readonly BoardHandCard[];
  /** Spec 0031 — the opponent's hand, fanned down from the top edge. */
  opponentHand?: readonly OpponentHandCard[];
  /** Whose that hand is, for its words. */
  opponentName?: string | undefined;
  /** Clicking the opponent's hand: opens the cards shown to the viewer;
   * absent when none are. */
  onOpponentHand?: (() => void) | undefined;
  viewerSeat: number;
  /** Turns a picture reference into a URL (a match-scoped asset route in a
   * match, the reference itself for a synthetic board). */
  artUrl: (art: string) => string;
  /** Where a card that was not on the board came from (default: the
   * stack, which is where most permanents come from). */
  arrivals?: ReadonlyMap<string, AnchorId>;
  /** Where a card that left the board went (default: its controller's
   * graveyard). A card that moved to the hand needs nothing: it is still
   * drawn, and simply moves. */
  departures?: ReadonlyMap<string, AnchorId>;
  /** Combat, while there is one (fire and shield lines, AMENDMENT 7). */
  combat?: CombatView | null;
  /** The stack, the object that resolves next FIRST. */
  stack?: readonly StackView[];
  /** A stack object the player is pointing at: its lines show too. */
  pointedStack?: string | null;
  /** Spec 0028 — a key for the response window now counting down (a new
   * key restarts the ring round the front card), or null for none. */
  clock?: string | null;
  /** How long that countdown runs. */
  clockMs?: number;
  /** What each hand card's cast costs right now, by card id (Forge's reckoning). */
  handCosts?: ReadonlyMap<string, string>;
  /** An attachment's host being chosen. */
  attaching?: AttachView | null;
  /** The newest damage dealt: played once per `key`. */
  damage?: DamageWave | null;
  // --- PHASE_07 §7.24-§7.33: the board answers questions -------------
  /** A primary click on an object (a card, a pile, a tag, a hand card). */
  onPick?: (objectId: string) => void;
  /** Right-click (or the context-menu key): inspect, never act (§7.30). */
  onInspect?: (objectId: string) => void;
  /** Objects the question on screen can be answered with (§7.27): shown
   * as choosable, by an outline AND a word, never colour alone (§7.40). */
  choosable?: ReadonlySet<string>;
  /** Objects whose only answers Forge says cannot be paid now (§7.54):
   * dimmed, still clickable. */
  unpayable?: ReadonlySet<string>;
  /** The object the player picked (§7.25: selected, not acted on). */
  selected?: string | null;
  /** Forge is asking for a CHOICE (a target, an attacker...), not just
   * what to do with priority: choosable objects then say "choose". */
  asking?: boolean;
  /** The right-hand column's contents, drawn inside the rail. */
  rail?: ReactNode;
  /** The top bar (turn and step), drawn over the play area. */
  top?: ReactNode;
  /** Things drawn beside an object (the action pop-up), given where each
   * object is now. */
  overlay?: (at: (objectId: string) => Box | null, geometry: Geometry) => ReactNode;
}

/** The canvas's palette, by what a card is (§7.40: the type also shows
 * as a glyph and words, never colour alone). */
export type Look = "land" | "creature" | "artifact" | "walker";
export function lookOf(kind: string, types: string): Look {
  if (kind === "creature") return "creature";
  if (kind === "land") return "land";
  if (/\bPlaneswalker\b/.test(types)) return "walker";
  return "artifact";
}
const GLYPH: Record<Look, string> = {
  land: "M12 20 V7 M12 7 L7 12 M12 7 L17 12",
  creature: "M4 18 L10 8 L14 14 L17 10 L20 18 Z",
  artifact: "M12 4 V20 M4 12 H20 M6.5 6.5 L17.5 17.5 M17.5 6.5 L6.5 17.5",
  walker: "M12 3 L19 9 V17 L12 21 L5 17 V9 Z",
};

/** Spec 0028 — the stack object whose line shows: the pointed one, else the front. */
function stackFocus(stack: readonly StackView[] | undefined, pointed: string | null | undefined) {
  if (!stack || stack.length === 0) return null;
  return pointed && stack.some((s) => s.id === pointed) ? pointed : stack[0]!.id;
}

/** "1st", "2nd", "3rd", "4th"… for a screen reader's "2nd to resolve". */
function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** A stack object's kind, on its card's bottom bar. */
const STACK_KIND: Record<string, string> = {
  spell: "Spell",
  ability: "Ability",
  trigger: "Trigger",
};

function Glyph({ look, className }: { look: Look; className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d={GLYPH[look]} />
    </svg>
  );
}

/** The type line's first part, as the canvas's bottom bar shows it:
 * "Creature — Angel" reads "Creature". */
export function shortType(types: string): string {
  const head = types.split(/\s+—\s+/)[0] ?? "";
  return head.replace(/\bBasic\s+/, "");
}

/** Current power/toughness, or a planeswalker's loyalty, from Forge
 * (§7.20) -- never printed values. */
export function figure(card: {
  power: number | null;
  toughness: number | null;
  counters?: readonly { name: string; count: number }[];
}): string {
  if (card.power !== null && card.toughness !== null) return `${card.power}/${card.toughness}`;
  const loyalty = card.counters?.find((c) => c.name === "LOYALTY");
  return loyalty ? String(loyalty.count) : "";
}

export function CardFace({
  name,
  look,
  type,
  pt,
  art,
  faceDown,
  known,
  cost,
  costChange,
  costFirst,
}: {
  name: string;
  look: Look;
  type: string;
  pt: string;
  art: string | null;
  faceDown: boolean;
  /** Whether this viewer may know what a face-down card is (§7.18). */
  known?: boolean;
  cost?: string | null;
  costChange?: "down" | "up" | null;
  costFirst?: boolean;
}) {
  if (faceDown) {
    // §7.18: the back, to both players; what the rules make public (a
    // face-down 2/2) on its bar; the card's name only to the player the
    // server told (the snapshot carries no name for anybody else).
    return (
      <>
        <span className="bf-card-back" aria-hidden="true" />
        {known && (
          <span className="bf-bar bf-bar-top bf-bar-secret">
            <span className="bf-name">{name}</span>
          </span>
        )}
        <span className="bf-bar bf-bar-bottom">
          {pt && <span className="bf-pt">{pt}</span>}
          <span className="bf-type">Face down</span>
        </span>
      </>
    );
  }
  return (
    <>
      <span className={`bf-bar bf-bar-top${cost && costFirst ? " bf-cost-first" : ""}`}>
        {cost && costFirst && <ManaCost cost={cost} change={costChange ?? null} />}
        <span className="bf-name">{name}</span>
        {cost && !costFirst && <ManaCost cost={cost} change={costChange ?? null} />}
      </span>
      <span className="bf-window" aria-hidden="true">
        {art ? (
          // The scan's art box, cropped (owner decision 2026-10-20): the
          // whole card is for inspect, not for the table.
          <img className="bf-art" src={art} alt="" decoding="async" draggable={false} />
        ) : (
          <Glyph look={look} className="bf-glyph" />
        )}
      </span>
      {/* Power/toughness on the LEFT (PHASE 7 AMENDMENT 4): a squeezed
          row shows each card's left third, and that must include it. */}
      <span className="bf-bar bf-bar-bottom">
        {pt && <span className="bf-pt">{pt}</span>}
        <span className="bf-type">{type}</span>
      </span>
    </>
  );
}

/** Enough of a card to draw it on its way out, after it has left. */
interface Drawn {
  name: string;
  look: Look;
  type: string;
  pt: string;
  art: string | null;
  faceDown: boolean;
  known?: boolean;
  /** Its mana cost, drawn as symbols (hand and stack cards only). */
  cost?: string | null;
  /** Lower or higher than printed right now (Forge's reckoning). */
  costChange?: "down" | "up" | null;
  /** The cost before the name: a hand card's right side is under the next card. */
  costFirst?: boolean;
  side: "viewer" | "opponent";
}

interface Ghost extends Drawn {
  id: string;
  box: Box;
  origin: { x: number; y: number };
  /** Where it goes: a zone in the rail (fading as it shrinks there), or
   * the spot of the card it joined (a pile, a host). */
  to: Box;
  toOrigin: { x: number; y: number };
  fade: boolean;
  /** Held in place this long first: a creature killed by damage waits for
   * its impact before it leaves. */
  delay: number;
}

/** A burst, a damage number or a resolving spell's spark, on its way out. */
interface Effect {
  key: string;
  kind: "burst" | "number" | "spark";
  /** What was hit: an object id, or "player:N". */
  target: string;
  at: Point;
  amount: number;
  delay: number;
  /** A spark's end: where it travels to (spec 0028). */
  to?: Point;
}

/** Spec 0028 — how long a resolving stack card glows, its spark travelling, before it leaves. */
const RESOLVE_MS = 380;

/** A line, ready to draw. */
interface Line {
  key: string;
  kind: LineKind;
  from: string;
  to: string;
  start: Point;
  end: Point;
  lane: number;
  /** How many relationships it stands for: a pile's members are one line. */
  count: number;
}

const refKey = (ref: TargetRef) => ("player" in ref ? `player:${ref.player}` : ref.object);

/** One thing layout() placed, ready to draw. */
interface Item {
  id: string;
  /** Every object id it stands for: a pile's members, a host's tags. */
  ids: string[];
  box: Box;
  origin: { x: number; y: number };
  clip?: string;
  drawn: Drawn;
  content: ReactNode;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : true;
}

const NO_CARDS: readonly OpponentHandCard[] = [];

/** The board fills its container and lays itself out for that size. */
export function Board({
  battlefield,
  hand,
  opponentHand = NO_CARDS,
  opponentName = "Your opponent",
  onOpponentHand,
  viewerSeat,
  artUrl,
  arrivals,
  departures,
  combat,
  stack,
  pointedStack,
  clock,
  clockMs,
  handCosts,
  attaching,
  damage,
  onPick,
  onInspect,
  choosable,
  unpayable,
  selected,
  asking,
  rail,
  top,
  overlay,
}: BoardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [pointed, setPointed] = useState<string | null>(null);
  // Spec 0028 — the stack card the player points at: its line shows
  // instead of the front card's, and the rest of the stack fades.
  const [pointedOnStack, setPointedOnStack] = useState<string | null>(null);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [effects, setEffects] = useState<Effect[]>([]);
  const wave = useRef<{ key: string; impactAt: number; targets: Set<string> } | null>(null);
  const timers = useRef<number[]>([]);
  useLayoutEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );
  const elements = useRef(new Map<string, HTMLDivElement>());
  const previous = useRef<{
    viewport: Viewport;
    at: Map<string, { box: Box; origin: { x: number; y: number } }>;
    drawn: Map<string, Drawn>;
    mounted: Set<string>;
    /** Spec 0028 — the stack as it was drawn: each object and its card's box. */
    stack: { s: StackView; box: Box }[];
  } | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setViewport({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Spec 0003 — unblocked attackers say what they attack, so identical
  // ones pile (one card, one fire line) instead of 300 of each.
  const laidOut = useMemo(() => {
    if (!combat) return battlefield;
    const aims = new Map(combat.attackers.map((a) => [a.id, refKey(a.target)]));
    const blocked = new Set(combat.blocks.map((b) => b.attacker));
    return battlefield.map((card) =>
      card.attacking && aims.has(card.id) && !blocked.has(card.id)
        ? { ...card, attackPile: aims.get(card.id)! }
        : card,
    );
  }, [battlefield, combat]);
  const result = useMemo(
    () =>
      viewport ? layout({ battlefield: laidOut, hand, opponentHand, viewerSeat }, viewport) : null,
    [laidOut, hand, opponentHand, viewerSeat, viewport],
  );
  const byId = useMemo(() => new Map(battlefield.map((card) => [card.id, card])), [battlefield]);

  /**
   * What one object's button does and says (§7.24-§7.30). A pile answers
   * as its first choosable member (tapping "a Forest" is choosing one of
   * them, §7.58), else as its lead.
   */
  // What the stack's shown objects target glows (owner 2026-10-21).
  const targeted = useMemo(
    () =>
      new Set(
        (stack ?? [])
          .filter((s) => s.id === stackFocus(stack, pointedOnStack ?? pointedStack))
          .flatMap((s) => s.targets.flatMap((t) => ("object" in t ? [t.object] : []))),
      ),
    [stack, pointedStack, pointedOnStack],
  );
  const act = useMemo(() => {
    const pickOf = (ids: readonly string[]) => ids.find((id) => choosable?.has(id)) ?? ids[0]!;
    return (ids: readonly string[]) => {
      const id = pickOf(ids);
      const canChoose = ids.some((one) => choosable?.has(one));
      const dim = !canChoose && ids.some((one) => unpayable?.has(one));
      const isSelected = ids.some((one) => one === selected);
      const isTargeted = ids.some((one) => targeted.has(one));
      return {
        className: `${canChoose ? " bf-choosable" : ""}${isSelected ? " bf-selected" : ""}${dim ? " bf-unpayable" : ""}${isTargeted ? " bf-targeted" : ""}`,
        words: [
          canChoose ? "can be chosen" : "",
          dim ? "not enough mana right now" : "",
          isSelected ? "selected" : "",
          isTargeted ? "targeted" : "",
        ],
        data: {
          "data-choosable": canChoose ? "true" : undefined,
          "data-selected": isSelected ? "true" : undefined,
          "data-unpayable": dim ? "true" : undefined,
        },
        handlers: {
          onClick: onPick ? () => onPick(id) : undefined,
          onContextMenu: onInspect
            ? (event: { preventDefault: () => void }) => {
                event.preventDefault();
                onInspect(id);
              }
            : undefined,
        },
      };
    };
  }, [choosable, unpayable, selected, targeted, onPick, onInspect]);

  const items = useMemo<Item[]>(() => {
    if (!result) return [];
    const g = result.geometry;
    const sideOf = (seat: number) => (seat === viewerSeat ? "viewer" : "opponent");
    const out: Item[] = [];

    for (const slot of result.slots) {
      const lead = byId.get(slot.ids[0]!)!;
      const count = slot.ids.length;
      const look = lookOf(lead.kind, lead.types);
      const side = slot.row.startsWith("viewer") ? "viewer" : "opponent";
      const pt = figure(lead);
      const attached = slot.attached.map((id) => byId.get(id)!);
      const band = bandOf(g, slot.row);
      const label = [
        lead.faceDown && !lead.known
          ? "Face-down card"
          : lead.faceDown
            ? `${lead.name}, face down`
            : lead.name,
        count > 1 ? `${count} of them` : "",
        pt,
        lead.tapped ? "tapped" : "",
        lead.attacking ? "attacking" : "",
        lead.ringBearer ? "Ring-bearer" : "",
        lead.sector ? `sector ${lead.sector}` : "",
        lead.sprocket ? `on sprocket ${lead.sprocket}` : "",
        attached.length > 0 ? `with ${attached.map((card) => card.name).join(" and ")}` : "",
        side === "viewer" ? "yours" : "opponent's",
        ...act(slot.ids).words,
      ]
        .filter(Boolean)
        .join(", ");
      const leadAct = act(slot.ids);
      const drawn: Drawn = {
        name: lead.name,
        look,
        type: shortType(lead.types),
        pt,
        art: lead.art ? artUrl(lead.art) : null,
        faceDown: lead.faceDown,
        known: lead.known,
        side,
      };
      out.push({
        id: lead.id,
        ids: [...slot.ids, ...slot.attached],
        box: slot.box,
        origin: TAPPED_ORIGIN,
        // Tilted corners tuck under the next band (AMENDMENT 4).
        clip: bandClip(slot.box, g.cardW, g.cardH, TAPPED_ORIGIN, band.top, band.bottom),
        drawn,
        content: (
          <>
            <button
              type="button"
              className={`bf-card bf-look-${look}${lead.tapped ? " bf-dim" : ""}${lead.attacking ? " bf-attacking" : ""}${leadAct.className}`}
              aria-label={label}
              {...leadAct.data}
              {...leadAct.handlers}
              data-object-id={lead.id}
              data-zone={slot.row}
              data-controller={side}
              data-tapped={String(lead.tapped)}
              data-attacking={lead.attacking ? "true" : undefined}
              data-pt={pt || undefined}
              data-face={lead.faceDown ? "down" : "up"}
              data-pile={count > 1 ? count : undefined}
            >
              <CardFace {...drawn} />
              {lead.attacking ? (
                <span className="bf-state bf-state-attacking">ATTACKING</span>
              ) : lead.tapped ? (
                <span className="bf-state">TAPPED</span>
              ) : null}
              {count > 1 && <span className="bf-pile">×{count}</span>}
              {lead.ringBearer && <span className="bf-ring">Ring-bearer</span>}
              {lead.sector && <span className="bf-zone">{lead.sector}</span>}
              {lead.sprocket && <span className="bf-zone">Sprocket {lead.sprocket}</span>}
            </button>
            {attached.length > 0 && (
              // Auras and Equipment as name tags across the host's picture
              // (AMENDMENT 4). Each is its own button, with its own id, so
              // it can be targeted and inspected like any permanent.
              <div className="bf-tags">
                {attached.map((card) => {
                  const tagLook = lookOf(card.kind, card.types);
                  const tagAct = act([card.id]);
                  return (
                    <button
                      key={card.id}
                      type="button"
                      className={`bf-tag bf-look-${tagLook}${tagAct.className}`}
                      {...tagAct.data}
                      {...tagAct.handlers}
                      aria-label={[
                        `${card.name}, attached to ${lead.faceDown && !lead.known ? "a face-down card" : lead.name}`,
                        sideOf(card.seat) === "viewer" ? "yours" : "opponent's",
                        ...tagAct.words,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                      data-object-id={card.id}
                      data-zone={slot.row}
                      data-controller={sideOf(card.seat)}
                      data-attached-to={lead.id}
                      data-tapped={String(card.tapped)}
                      data-face="up"
                    >
                      <Glyph look={tagLook} className="bf-tag-glyph" />
                      <span className="bf-tag-name">{card.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ),
      });
    }

    for (const card of hand) {
      const rest = result.boxes.get(card.id);
      if (!rest) continue;
      const look = lookOf(card.kind, card.types);
      const pt = figure(card);
      // Owner 2026-10-21: the cost the cast would take right now when
      // Forge has said (you hold priority), the printed cost otherwise.
      const now = handCosts?.get(card.id) ?? null;
      const drawn: Drawn = {
        name: card.name,
        look,
        type: shortType(card.types),
        pt,
        art: card.art ? artUrl(card.art) : null,
        faceDown: false,
        side: "viewer",
        cost: now ?? card.manaCost ?? null,
        costChange: costChange(now, card.manaCost),
        costFirst: true,
      };
      const zoomed = pointed === card.id;
      const box = zoomed ? handZoomBox(rest, g) : rest;
      const handAct = act([card.id]);
      const show = () => setPointed(card.id);
      const hide = () => setPointed((now) => (now === card.id ? null : now));
      out.push({
        id: card.id,
        ids: [card.id],
        box,
        origin: HAND_ORIGIN,
        drawn,
        content: (
          <button
            type="button"
            className={`bf-card bf-hand bf-look-${look}${handAct.className}`}
            aria-label={[`${card.name}, in your hand`, pt, ...handAct.words]
              .filter(Boolean)
              .join(", ")}
            {...handAct.data}
            {...handAct.handlers}
            data-object-id={card.id}
            data-zone="viewer:hand"
            data-controller="viewer"
            data-face="up"
            data-zoomed={zoomed ? "true" : undefined}
            onPointerEnter={show}
            onPointerLeave={hide}
            onFocus={show}
            onBlur={hide}
          >
            <CardFace {...drawn} />
          </button>
        ),
      });
    }

    // Spec 0031 — the opponent's hand: backs, and any card shown to you.
    // Clicking it opens the shown cards, as the plate's Hand tile did.
    opponentHand.forEach((card, i) => {
      const box = result.boxes.get(card.id);
      if (!box) return;
      const shown = card.shown;
      const drawn: Drawn = shown
        ? {
            name: shown.name,
            look: lookOf(shown.kind, shown.types),
            type: shortType(shown.types),
            pt: figure(shown),
            art: shown.art ? artUrl(shown.art) : null,
            faceDown: false,
            side: "opponent",
            cost: shown.manaCost ?? null,
          }
        : {
            name: "",
            look: "artifact",
            type: "",
            pt: "",
            art: null,
            faceDown: true,
            side: "opponent",
          };
      out.push({
        id: card.id,
        ids: [card.id],
        box,
        origin: OPPONENT_HAND_ORIGIN,
        drawn,
        content: (
          <button
            type="button"
            className={`bf-card bf-opp-hand${shown ? ` bf-look-${drawn.look} bf-opp-hand-shown` : ""}`}
            aria-label={
              shown
                ? `${shown.name}, in ${opponentName}'s hand, shown to you`
                : `Card ${i + 1} of ${opponentHand.length} in ${opponentName}'s hand`
            }
            disabled={!onOpponentHand}
            onClick={onOpponentHand}
            data-object-id={card.id}
            data-zone="opponent:hand"
            data-controller="opponent"
            data-face={shown ? "up" : "down"}
          >
            {shown ? (
              <CardFace {...drawn} />
            ) : (
              // The Proxic card back (docs/assets/brand), owner 2026-10-28.
              <img className="bf-opp-back" src={cardBack} alt="" draggable={false} />
            )}
          </button>
        ),
      });
    });
    return out;
  }, [
    result,
    byId,
    hand,
    opponentHand,
    opponentName,
    onOpponentHand,
    viewerSeat,
    artUrl,
    pointed,
    act,
    handCosts,
  ]);

  /** Where every object is drawn now: piles' members and hosts' tags
   * share their card's box. */
  const positions = useMemo(() => {
    const at = new Map<string, { box: Box; origin: { x: number; y: number }; item: string }>();
    for (const item of items) {
      for (const id of item.ids) at.set(id, { box: item.box, origin: item.origin, item: item.id });
    }
    return at;
  }, [items]);

  // Damage: swoops, bursts and numbers, once per wave. Declared before the
  // movement effect so a creature the same snapshot killed knows to wait.
  useLayoutEffect(() => {
    if (!result || !damage || damage.key === wave.current?.key) return;
    const g = result.geometry;
    const where = anchors(g);
    const still = reducedMotion();
    // Where a hit object is: drawn now, or (killed by this very snapshot)
    // where it was drawn last.
    const at = (id: string) => positions.get(id) ?? previous.current?.at.get(id);
    // A swooping attacker is hit where it lands, not where it rests.
    const landed = new Map<string, Point>();
    const pointOf = (ref: TargetRef): Point | null => {
      if ("player" in ref) return playerPoint(ref.player, viewerSeat, where);
      const swooped = landed.get(ref.object);
      if (swooped) return swooped;
      const p = at(ref.object);
      return p ? centreOf(p.box, p.origin) : null;
    };

    // Attackers swoop onto what they hit, all at once (AMENDMENT 7).
    const attackers = new Set(combat?.attackers.map((a) => a.id) ?? []);
    const bySource = new Map<string, TargetRef[]>();
    for (const hit of damage.hits) {
      bySource.set(hit.source, [...(bySource.get(hit.source) ?? []), hit.target]);
    }
    let swooped = false;
    // One swoop per drawn card: a pile of attacking tokens moves as one,
    // not once per token on the same element (owner report 2026-10-23).
    const moving = new Map<string, Point>();
    for (const [source, targets] of bySource) {
      if (still || !attackers.has(source)) continue;
      const from = positions.get(source);
      const already = from ? moving.get(from.item) : undefined;
      if (already) {
        landed.set(source, already);
        continue;
      }
      const element = from ? elements.current.get(from.item) : undefined;
      if (!from || !element || typeof element.animate !== "function") continue;
      const boxes = targets.flatMap((t) => ("object" in t ? [at(t.object)?.box ?? []].flat() : []));
      const player = targets.find((t) => "player" in t);
      const landing =
        boxes.length > 0
          ? swoopBox(from.box, from.origin, { boxes })
          : player
            ? swoopBox(from.box, from.origin, { point: pointOf(player)! })
            : null;
      if (!landing) continue;
      landed.set(source, centreOf(landing, from.origin));
      moving.set(from.item, centreOf(landing, from.origin));
      const rest = placement(from.box, g.cardW, g.cardH, from.origin).transform;
      const there = placement(landing, g.cardW, g.cardH, from.origin).transform;
      element.style.zIndex = String(Z_SWOOP);
      const animation = element.animate(
        [
          { transform: rest },
          { transform: there, offset: SWOOP_ARRIVE },
          { transform: there, offset: SWOOP_LEAVE },
          { transform: rest },
        ],
        { duration: SWOOP_MS, easing: "ease-in-out", id: "swoop" },
      );
      const back = () => {
        element.style.zIndex = element.dataset.z ?? "";
      };
      animation.onfinish = back;
      animation.oncancel = back;
      swooped = true;
    }

    // A burst and a number on everything hit, as the swoops land.
    const delay = swooped ? SWOOP_ARRIVE * SWOOP_MS : 0;
    const totals = new Map<string, { ref: TargetRef; amount: number }>();
    for (const hit of damage.hits) {
      const k = refKey(hit.target);
      totals.set(k, { ref: hit.target, amount: (totals.get(k)?.amount ?? 0) + hit.amount });
    }
    const added: Effect[] = [];
    for (const [k, { ref, amount }] of totals) {
      const point = pointOf(ref);
      if (!point) continue;
      // The burst is where the hit happened; the number rises from where
      // the card stays -- a swooping attacker's home, not its landing.
      const home =
        "object" in ref && landed.has(ref.object)
          ? (() => {
              const p = at(ref.object)!;
              return centreOf(p.box, p.origin);
            })()
          : point;
      if (!still)
        added.push({
          key: `${damage.key}:${k}:burst`,
          kind: "burst",
          target: k,
          at: point,
          amount,
          delay,
        });
      added.push({
        key: `${damage.key}:${k}:number`,
        kind: "number",
        target: k,
        at: home,
        amount,
        delay,
      });
    }
    setEffects((list) => [...list.filter((e) => !e.key.startsWith(`${damage.key}:`)), ...added]);
    timers.current.push(
      window.setTimeout(
        () => setEffects((list) => list.filter((e) => !added.includes(e))),
        delay + NUMBER_MS + 50,
      ),
    );
    wave.current = {
      key: damage.key,
      impactAt: performance.now() + delay,
      targets: new Set([...totals.keys()]),
    };
  }, [damage, result, positions, combat, viewerSeat]);

  // After each commit, before paint: start what should move.
  useLayoutEffect(() => {
    if (!result) return;
    const g = result.geometry;
    const where = anchors(g);
    const now = new Map<string, { box: Box; origin: { x: number; y: number } }>();
    const drawn = new Map<string, Drawn>();
    for (const item of items) {
      for (const id of item.ids) now.set(id, { box: item.box, origin: item.origin });
      drawn.set(item.id, item.drawn);
    }
    const before = previous.current;
    const resized =
      before !== null && (before.viewport.width !== g.width || before.viewport.height !== g.height);
    const still = reducedMotion();

    if (resized && cardsRef.current) {
      // A new window size is not a move: everything goes straight there.
      // Forcing a style pass with transitions off makes it so.
      cardsRef.current.dataset.instant = "true";
      void cardsRef.current.offsetWidth;
      delete cardsRef.current.dataset.instant;
    }

    if (before && !resized && !still) {
      for (const item of items) {
        if (before.mounted.has(item.id)) continue; // the same element: CSS glides it
        const element = elements.current.get(item.id);
        if (!element || typeof element.animate !== "function") continue;
        // A new element: from wherever the object was drawn before (a
        // pile it left, the hand), or else from its zone in the rail.
        const was = before.at.get(item.id);
        const fromStack = was ? undefined : before.stack.find((e) => e.s.card === item.id);
        const from = was
          ? placement(was.box, g.cardW, g.cardH, was.origin).transform
          : fromStack
            ? placement(fromStack.box, g.cardW, g.cardH, item.origin).transform
            : placement(
                boxAt(where[arrivals?.get(item.id) ?? "stack"], g),
                g.cardW,
                g.cardH,
                item.origin,
              ).transform;
        const to = placement(item.box, g.cardW, g.cardH, item.origin).transform;
        element.animate(
          [
            { transform: from, opacity: was ? 1 : 0.2 },
            { transform: to, opacity: 1 },
          ],
          { duration: MOVE_MS, easing: MOVE_EASING },
        );
      }
      // A card that no longer has an element of its own leaves as a ghost:
      // into the spot of the card it joined (a land into its pile), or,
      // gone from the board, toward its zone in the rail.
      const leaving: Ghost[] = [];
      const elementsNow = new Set(items.map((item) => item.id));
      for (const [id, d] of before.drawn) {
        if (elementsNow.has(id)) continue;
        const at = before.at.get(id);
        if (!at) continue;
        const joined = now.get(id);
        const hit = wave.current;
        const delay =
          hit && hit.targets.has(id) ? Math.max(0, hit.impactAt - performance.now()) + 150 : 0;
        leaving.push(
          joined
            ? { ...d, id, ...at, to: joined.box, toOrigin: joined.origin, fade: false, delay }
            : {
                ...d,
                id,
                ...at,
                to: boxAt(where[departures?.get(id) ?? `${d.side}:graveyard`], g),
                toOrigin: at.origin,
                fade: true,
                delay,
              },
        );
      }
      if (leaving.length > 0) setGhosts((list) => [...list, ...leaving]);

      // Spec 0028 — a stack object that resolved (or was countered) glows,
      // its spark runs to what it targeted, then it leaves: a spell to its
      // owner's graveyard, an ability into the permanent it came from. A
      // permanent spell flies onto the table instead (the arrivals above).
      const stillThere = new Set((stack ?? []).map((s) => s.id));
      const sparks: Effect[] = [];
      const gone: Ghost[] = [];
      for (const { s, box } of before.stack) {
        if (stillThere.has(s.id)) continue;
        if (s.card && now.has(s.card)) continue;
        const side = s.seat === undefined || s.seat === viewerSeat ? "viewer" : "opponent";
        const centreBox = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
        for (const t of s.targets) {
          const at =
            "player" in t
              ? where[`${t.player === viewerSeat ? "viewer" : "opponent"}:life`]
              : (() => {
                  const p = before.at.get(t.object);
                  return p ? centreOf(p.box, p.origin) : null;
                })();
          if (at) {
            sparks.push({
              key: `spark:${s.id}:${sparks.length}`,
              kind: "spark",
              target: "player" in t ? `player:${t.player}` : t.object,
              at: centreBox,
              to: at,
              amount: 0,
              delay: 0,
            });
          }
        }
        const into = s.source ? now.get(s.source) : undefined;
        gone.push({
          name: s.name,
          look: "artifact",
          type: STACK_KIND[s.kind ?? "spell"] ?? "Spell",
          pt: "",
          art: s.art ? artUrl(s.art) : null,
          faceDown: s.name === "Face-down",
          known: false,
          cost: s.manaCost ?? null,
          side,
          id: s.id,
          box,
          origin: { x: 0, y: 0 },
          to: into ? into.box : boxAt(where[`${side}:graveyard`], g),
          toOrigin: into ? into.origin : { x: 0, y: 0 },
          fade: true,
          delay: RESOLVE_MS,
        });
      }
      if (gone.length > 0) setGhosts((list) => [...list, ...gone]);
      if (sparks.length > 0) {
        setEffects((list) => [...list, ...sparks]);
        timers.current.push(
          window.setTimeout(
            () => setEffects((list) => list.filter((e) => !sparks.includes(e))),
            RESOLVE_MS + 200,
          ),
        );
      }
    }

    const spots = stackSpotBoxes(g, (stack ?? []).length);
    previous.current = {
      viewport: { width: g.width, height: g.height },
      at: now,
      drawn,
      mounted: new Set(items.map((item) => item.id)),
      stack: (stack ?? []).slice(0, spots.length).map((s, i) => ({ s, box: spots[i]! })),
    };
  }, [items, result, arrivals, departures, stack, viewerSeat, artUrl]);

  if (!result) return <div ref={ref} className="bf-board" data-testid="battlefield" />;
  const g = result.geometry;
  const where = anchors(g);
  const sizes = effectSizes(g);

  // The lines (AMENDMENT 7): every end is a drawn object or a rail point.
  const centre = (id: string) => {
    const p = positions.get(id);
    return p ? centreOf(p.box, p.origin) : null;
  };
  // A point inside the card's picture, toward `toward`: a line starts and
  // ends there, never on the name or power/toughness bars (as the mock's
  // block line ended at 72% of the card's height).
  const edge = (id: string, toward: Point, depth: number) => {
    const p = positions.get(id)!;
    const c = centreOf(p.box, p.origin);
    const dx = toward.x - c.x;
    const dy = toward.y - c.y;
    const len = Math.max(0.001, Math.hypot(dx, dy));
    const reach = Math.min(p.box.h * depth, len / 3);
    return { x: c.x + (dx / len) * reach, y: c.y + (dy / len) * reach };
  };
  const refPoint = (ref: TargetRef) =>
    "player" in ref ? playerPoint(ref.player, viewerSeat, where) : centre(ref.object);
  // A line into a player meets their life circle's edge, never covers it.
  const lifeR = LIFE_R * g.height;
  // The stack, drawn as cards at the right edge of the play area.
  const spot = stackSpotBoxes(g, (stack ?? []).length);
  const spotBox = new Map((stack ?? []).slice(0, spot.length).map((s, i) => [s.id, spot[i]!]));
  // One line per DRAWN thing, not per object: a pile of 300 Goblin tokens
  // attacking is one card on the table, so it is one fire line (owner
  // report 2026-10-23: 300 lines, each blurred and fanned into its own
  // lane, buried the screen and stalled the page).
  const drawn = (id: string) => positions.get(id)?.item ?? id;
  const byKey = new Map<string, Line>();
  const add = (kind: LineKind, from: string, to: string, start: Point, end: Point) => {
    const key = `${kind}:${drawn(from)}:${to.startsWith("player:") ? to : drawn(to)}`;
    const same = byKey.get(key);
    if (same) same.count += 1;
    else byKey.set(key, { key, kind, from, to, start, end, lane: 0, count: 1 });
  };
  for (const a of combat?.attackers ?? []) {
    const from = centre(a.id);
    const aim = refPoint(a.target);
    if (!from || !aim) continue;
    const end =
      "object" in a.target ? edge(a.target.object, from, 0.18) : ringEdge(aim, from, lifeR);
    add("attack", a.id, refKey(a.target), edge(a.id, end, 0.22), end);
  }
  for (const b of combat?.blocks ?? []) {
    const from = centre(b.blocker);
    const to = centre(b.attacker);
    if (!from || !to) continue;
    add("block", b.blocker, b.attacker, edge(b.blocker, to, 0.2), edge(b.attacker, from, 0.22));
  }
  const focus = stackFocus(stack, pointedOnStack ?? pointedStack);
  const shown = (stack ?? []).filter((s) => s.id === focus);
  for (const s of shown) {
    // From the spell's own card on the stack (the last drawn one, for an
    // object further down than the cards shown).
    const box = spotBox.get(s.id) ?? spot[spot.length - 1];
    const from = box ? { x: box.x + box.w / 2, y: box.y + box.h / 2 } : where.stack;
    for (const t of s.targets) {
      const aim = refPoint(t);
      if (!aim) continue;
      const end = "player" in t ? ringEdge(aim, from, lifeR) : edge(t.object, from, 0.18);
      add("target", s.id, refKey(t), box ? rectEdge(box, end) : from, end);
    }
  }
  // Spec 0028 — an ability, faintly, back to the permanent it came from.
  for (const s of stack ?? []) {
    const box = spotBox.get(s.id);
    if (!s.source || !box || !centre(s.source)) continue;
    const mid = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const end = rectEdge(box, centre(s.source)!);
    add("source", s.source, s.id, edge(s.source, mid, 0.22), end);
  }
  if (attaching) {
    const from = centre(attaching.source);
    const to = centre(attaching.host);
    if (from && to) {
      add(
        "attach",
        attaching.source,
        attaching.host,
        edge(attaching.source, to, 0.22),
        edge(attaching.host, from, 0.22),
      );
    }
  }
  const lines = [...byKey.values()];
  // Several lines into one thing spread into lanes (the mock's).
  const into = new Map<string, Line[]>();
  for (const line of lines) {
    const to = line.to.startsWith("player:") ? line.to : drawn(line.to);
    into.set(to, [...(into.get(to) ?? []), line]);
  }
  for (const group of into.values()) {
    group.forEach((line, i) => (line.lane = i - (group.length - 1) / 2));
  }

  return (
    <div ref={ref} className="bf-board" data-testid="battlefield">
      <div className="bf-divider" style={{ top: g.height / 2, width: g.play.w }} />
      <aside
        className="bf-rail"
        aria-label="Game status"
        style={{
          left: g.rail.x,
          width: g.rail.w,
          // The canvas draws the rail on a 900-pixel-high board; its
          // blocks scale with the board, so the zones cards fly to and
          // from (motion.ts anchors) are where they are drawn.
          ["--rail-scale" as string]: String(g.height / 900),
        }}
      >
        {rail}
      </aside>
      {top && (
        <div
          className="bf-top"
          style={{ width: g.play.w, ["--rail-scale" as string]: String(g.height / 900) }}
        >
          {top}
        </div>
      )}
      <div
        ref={cardsRef}
        className={`bf-cards${asking ? " bf-asking" : ""}`}
        style={{
          ["--card-h" as string]: `${g.cardH}px`,
          ["--move-ms" as string]: `${MOVE_MS}ms`,
          ["--move-easing" as string]: MOVE_EASING,
        }}
      >
        {items.map((item) => (
          <div
            key={item.id}
            ref={(element) => {
              if (element) elements.current.set(item.id, element);
              else elements.current.delete(item.id);
            }}
            className="bf-slot"
            data-z={item.box.z}
            style={{
              width: g.cardW,
              height: g.cardH,
              ...placement(item.box, g.cardW, g.cardH, item.origin),
              clipPath: item.clip,
              zIndex: item.box.z,
            }}
          >
            {item.content}
          </div>
        ))}
        {(stack ?? []).slice(0, spot.length).map((s, i) => {
          const box = spot[i]!;
          const a = act([s.id]);
          // Spec 0028: whose (gold yours, red theirs), its place in the
          // order (1 resolves next), its caster's picture; pointing at it
          // shows its line and fades the rest.
          const whose =
            s.seat === undefined
              ? ""
              : s.seat === viewerSeat
                ? " bf-stack-mine"
                : " bf-stack-theirs";
          const faded = pointedOnStack !== null && pointedOnStack !== s.id;
          return (
            <div
              key={`stack-spot:${s.id}`}
              className={`bf-slot bf-stack-slot${faded ? " bf-stack-faded" : ""}`}
              style={{
                width: g.cardW,
                height: g.cardH,
                transformOrigin: "0 0",
                transform: `translate3d(${box.x}px, ${box.y}px, 0) scale(${box.scale})`,
                zIndex: Z_LINES - 100 - i,
              }}
            >
              <button
                type="button"
                className={`bf-card bf-stack-card bf-look-artifact${i === 0 ? " bf-stack-top" : ""}${whose}${a.className}`}
                aria-label={[
                  `${s.name}, on the stack`,
                  `${ordinal(i + 1)} to resolve`,
                  s.by ? `from ${s.by}` : "",
                  ...a.words,
                ]
                  .filter(Boolean)
                  .join(", ")}
                data-object-id={s.id}
                data-zone="stack"
                data-order={i + 1}
                {...a.data}
                {...a.handlers}
                onPointerEnter={() => setPointedOnStack(s.id)}
                onPointerLeave={() => setPointedOnStack((now) => (now === s.id ? null : now))}
                onFocus={() => setPointedOnStack(s.id)}
                onBlur={() => setPointedOnStack((now) => (now === s.id ? null : now))}
              >
                <CardFace
                  name={s.name}
                  look="artifact"
                  type={STACK_KIND[s.kind ?? "spell"] ?? "Spell"}
                  pt=""
                  art={s.art ? artUrl(s.art) : null}
                  faceDown={s.name === "Face-down"}
                  known={false}
                  cost={s.manaCost ?? null}
                />
              </button>
              {/* Beside the card's name bar, so neither covers the name. */}
              <span className="bf-stack-tag" aria-hidden="true">
                <span className="bf-stack-n">{i + 1}</span>
                {s.caster && <img className="bf-stack-by" src={s.caster} alt="" />}
              </span>
              {i === 0 && clock && (
                // Spec 0028 — the 2-second auto-pass, counting down round the card.
                <svg
                  key={clock}
                  className="bf-stack-clock"
                  viewBox="0 0 100 140"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  style={{ ["--clock-ms" as string]: `${clockMs ?? 2000}ms` }}
                >
                  <rect x="1.5" y="1.5" width="97" height="137" rx="6" pathLength={100} />
                </svg>
              )}
            </div>
          );
        })}
        {/* The stack's words, under its front card (owner 2026-10-22: the
            cards ARE the stack; the column's Stack box is gone). */}
        {stack && stack.length > 0 && spot[0] && (
          <div
            className="bf-stack-caption"
            aria-hidden="true"
            style={{
              // Wider than the card, its right edge on the card's: the
              // words stay on one line without running off the table.
              left: spot[0].x + spot[0].w - Math.max(spot[0].w, g.cardW * 2.6),
              top: spot[0].y + spot[0].h + g.cardH * 0.05,
              width: Math.max(spot[0].w, g.cardW * 2.6),
              fontSize: Math.max(11, g.cardH * 0.085),
              zIndex: Z_LINES - 99,
            }}
          >
            <span className="bf-stack-next">
              {stack[0]!.by ? `1 resolves next · ${stack[0]!.by}` : "1 resolves next"}
            </span>
            {stack.length > 1 && (
              <span className="bf-stack-count">
                {stack.length} on the stack
                {stack.length > spot.length
                  ? ` · ${stack.length - spot.length} older not shown`
                  : " · point at one to see its target"}
              </span>
            )}
          </div>
        )}
        <svg
          className="bf-lines"
          width={g.width}
          height={g.height}
          style={{ zIndex: Z_LINES }}
          aria-hidden="true"
        >
          <defs>
            <filter id="bf-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
          </defs>
          {lines.map((line) => {
            const c = curve(line.kind, line.start, line.end, line.lane);
            const d = pathOf(c);
            const theme = LINE_THEME[line.kind];
            const w = sizes.line;
            return (
              <g
                key={line.key}
                className={`bf-line bf-line-${line.kind}`}
                data-line={line.kind}
                data-from={line.from}
                data-to={line.to}
                data-count={line.count > 1 ? line.count : undefined}
                data-start={`${line.start.x.toFixed(1)},${line.start.y.toFixed(1)}`}
                data-end={`${line.end.x.toFixed(1)},${line.end.y.toFixed(1)}`}
              >
                <path
                  d={d}
                  stroke={theme.aura}
                  strokeWidth={w * 2.6}
                  className="bf-line-aura"
                  filter="url(#bf-glow)"
                />
                <path
                  d={d}
                  stroke={theme.body}
                  strokeWidth={w}
                  className="bf-line-body"
                  pathLength={1}
                />
                <path
                  d={d}
                  stroke={theme.core}
                  strokeWidth={w * 0.35}
                  className="bf-line-core"
                  pathLength={1}
                />
                {line.kind !== "attach" && (
                  <polygon
                    points={arrowHead(c, w * 4.4)}
                    fill={theme.body}
                    stroke={theme.core}
                    strokeWidth={w * 0.3}
                    strokeLinejoin="round"
                    className="bf-line-head"
                  />
                )}
                {line.kind === "attach" && (
                  <g fill={theme.core} stroke={theme.body}>
                    <circle cx={c.start.x} cy={c.start.y} r={w * 1.6} />
                    <circle cx={c.end.x} cy={c.end.y} r={w * 1.6} />
                  </g>
                )}
              </g>
            );
          })}
        </svg>
        {overlay?.((id) => positions.get(id)?.box ?? null, g)}
        <div className="bf-effects" style={{ zIndex: Z_EFFECTS }} aria-hidden="true">
          {effects.map((effect) =>
            effect.kind === "spark" ? (
              <div
                key={effect.key}
                className="bf-spark"
                data-spark={effect.target}
                style={{
                  left: effect.at.x,
                  top: effect.at.y,
                  ["--dx" as string]: `${(effect.to?.x ?? effect.at.x) - effect.at.x}px`,
                  ["--dy" as string]: `${(effect.to?.y ?? effect.at.y) - effect.at.y}px`,
                  ["--spark-ms" as string]: `${RESOLVE_MS}ms`,
                }}
              />
            ) : effect.kind === "burst" ? (
              <div
                key={effect.key}
                className="bf-burst"
                data-impact={effect.target}
                style={{
                  left: effect.at.x,
                  top: effect.at.y,
                  width: sizes.burst,
                  height: sizes.burst,
                  animationDelay: `${effect.delay}ms`,
                }}
              >
                <svg viewBox="-50 -50 100 100">
                  <circle r="22" className="bf-burst-core" />
                  {Array.from({ length: 10 }, (_, i) => {
                    const t = (i / 10) * Math.PI * 2;
                    const r1 = i % 2 ? 26 : 30;
                    return (
                      <line
                        key={i}
                        x1={Math.cos(t) * r1}
                        y1={Math.sin(t) * r1}
                        x2={Math.cos(t) * 48}
                        y2={Math.sin(t) * 48}
                        className="bf-burst-ray"
                      />
                    );
                  })}
                </svg>
              </div>
            ) : (
              <div
                key={effect.key}
                className="bf-number"
                data-damage-number={effect.target}
                style={{
                  left: effect.at.x,
                  top: effect.at.y,
                  fontSize: sizes.number,
                  animationDelay: `${effect.delay}ms`,
                }}
              >
                −{effect.amount}
              </div>
            ),
          )}
        </div>
        {ghosts.map((ghost) => (
          <GhostCard
            key={`ghost:${ghost.id}`}
            ghost={ghost}
            cardW={g.cardW}
            cardH={g.cardH}
            done={() => setGhosts((list) => list.filter((x) => x !== ghost))}
          />
        ))}
      </div>
    </div>
  );
}

/** A card that has left, on its way to its zone: drawn, never clickable,
 * gone once it gets there. */
function GhostCard({
  ghost,
  cardW,
  cardH,
  done,
}: {
  ghost: Ghost;
  cardW: number;
  cardH: number;
  done: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const from = placement(ghost.box, cardW, cardH, ghost.origin);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof element.animate !== "function" || reducedMotion()) {
      done();
      return;
    }
    const animation = element.animate(
      [
        { transform: from.transform, opacity: 1 },
        {
          transform: placement(ghost.to, cardW, cardH, ghost.toOrigin).transform,
          opacity: ghost.fade ? 0.15 : 1,
        },
      ],
      { duration: MOVE_MS, easing: MOVE_EASING, delay: ghost.delay, fill: "both" },
    );
    animation.onfinish = done;
    // Unmounting (or StrictMode's rehearsal) stops it without finishing it.
    return () => {
      animation.onfinish = null;
      animation.cancel();
    };
    // Runs once: a ghost goes where it was sent when it appeared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      className="bf-slot bf-ghost"
      aria-hidden="true"
      data-ghost-of={ghost.id}
      style={{ width: cardW, height: cardH, ...from, zIndex: ghost.box.z + 2000 }}
    >
      <div className={`bf-card bf-look-${ghost.look}`}>
        <CardFace {...ghost} />
      </div>
    </div>
  );
}
