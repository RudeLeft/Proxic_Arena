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
// chosen -- in one SVG layer that takes no clicks. Combat damage plays one
// fight at a time (Phase 10 A-13, fights.ts): the table dims, the fighters
// rear back and lunge, slash marks and numbers land; other damage shows a
// burst and the amount. All of it is drawn from data Forge supplies (§7.61
// B2-B4, B13, and the damage wave's fights); none of it is inferred here.

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./battlefield.css";
import cardBack from "../assets/card-back.webp";
import { ManaCost, ManaText, costChange, symbolUrl } from "./ManaCost";
import { litShadow, owingWords, type PayPip } from "./manaBalls";
import { SharpCard, closeUpOf } from "../closeUp";
import {
  inCombat,
  HAND_ORIGIN,
  OPPONENT_HAND_ORIGIN,
  TAPPED_ORIGIN,
  layout,
  tabAt,
  TAB_W,
  type Box,
  type Geometry,
  type LayoutCard,
  type Side,
  type Viewport,
} from "./layout";
import {
  anchors,
  boxAt,
  handZoomBox,
  opponentRevealBox,
  LIFE_R,
  plateRects,
  MOVE_MS,
  SETTLE_EASING,
  SETTLE_MS,
  glideFrames,
  hurry,
  placedNow,
  fateFrames,
  flipFrames,
  FLIP_MS,
  PULL_ARC,
  PULL_LEAN,
  PULL_MS,
  TETHER_MS,
  SWEEP_MS,
  WIPE_AT,
  type Fate,
  MERGE_COLOUR,
  MERGE_DIM,
  MERGE_FLASH_MS,
  MERGE_MS,
  MERGE_PULL_MS,
  MERGE_RING_MS,
  mergeFrames,
  type MergeKind,
  AT_ZONE_SCALE,
  RETURN_MS,
  RETURN_TAG_MS,
  RIFFLE_BEAT_MS,
  RIFFLE_CARDS,
  RIFFLE_MS,
  returnBackFrames,
  returnFrames,
  returnTagFrames,
  graveTagFrames,
  fateMs,
  riffleFrames,
  type Placed,
  placement,
  type AnchorId,
  type Point,
} from "./motion";
import { AttackBlade, SwordsMark, TargetBeam } from "./Arrows";
import {
  beamToBanner,
  centreOf,
  ringEdge,
  effectSizes,
  LINE_THEME,
  NUMBER_MS,
  pathOf,
  playerPoint,
  facingPort,
  arc,
  arcHeight,
  arcShadow,
  arcToRing,
  stackCaptionBottom,
  pointOn,
  routeAt,
  shownShare,
  SOURCE_AT,
  STACK_READ_SCALE,
  STACK_SCALE,
  stackSpotBoxes,
  studY,
  stackBadgeRects,
  TIP_GAP,
  topOf,
  type LineKind,
  type Port,
  type Route,
  type TargetRef,
  Z_EFFECTS,
  Z_LINES,
  Z_MARKED,
} from "./effects";
import {
  FIGHT_DIM,
  FIGHT_FOCUS_MS,
  FIGHTS_FADE_MS,
  fighterFrames,
  HURT_EDGE_MS,
  planFights,
  SLASH_GAP_MS,
  SLASH_MS,
  SLASH_NUMBER_MS,
  type FightPlan,
  type Stand,
} from "./fights";
import { endLifeSteps, lifeSteps, lifeStillPlaying, startLifeSteps } from "./lifeTicks";
import { payWords, type PayMark } from "./payPicks";
import { PaySign } from "./PaySign";

export type { TargetRef } from "./effects";

/** A permanent as the board needs it: layout's fields plus its picture. */
export interface BoardCard extends LayoutCard {
  /** An imported picture's reference, or null (tokens, hidden cards,
   * back faces without a picture). */
  art: string | null;
  /** Spec 0051 -- its art crop, for the art window; null to zoom into `art`. */
  crop?: string | null;
  /** The Ring-bearer (public): marked on the card, in words too. */
  ringBearer?: boolean;
  /** Un-sets (public): the creature's sector, marked like the Ring-bearer. */
  sector?: string;
  /** Un-sets (public): the sprocket a Contraption is on. */
  sprocket?: number;
  /** Spec 0046: the mana a land makes ("W", "U"), from its abilities now. */
  makes?: readonly string[] | undefined;
  /** Spec 0045: what put its counters on, from the game. */
  counterFrom?: readonly { counter: string; added: number; from: string }[] | undefined;
}

/** Spec 0045 -- a counter's name as players say it ("P1P1" is "+1/+1"). */
export function counterName(name: string): string {
  const pt = /^([PM])(\d+)([PM])(\d+)$/.exec(name);
  if (pt) return `${pt[1] === "P" ? "+" : "-"}${pt[2]}/${pt[3] === "P" ? "+" : "-"}${pt[4]}`;
  return name.charAt(0) + name.slice(1).toLowerCase();
}

/**
 * Spec 0045 -- what pointing at a card's counters says: each kind, and
 * where the last ones came from ("+1/+1 from Ajani's Pridemate's
 * trigger: RudeLeft gained 1 life (Soul Warden)").
 */
export function counterWords(card: {
  counters?: readonly { name: string; count: number }[];
  counterFrom?: readonly { counter: string; added: number; from: string }[] | undefined;
}): string[] {
  return (card.counters ?? []).map((c) => {
    const from = [...(card.counterFrom ?? [])].reverse().find((o) => o.counter === c.name);
    const what = `${c.count} ${counterName(c.name)} counter${c.count === 1 ? "" : "s"}`;
    return from ? `${what}, the last from ${from.from}` : what;
  });
}

export interface BoardHandCard {
  id: string;
  name: string;
  kind: string;
  types: string;
  power: number | null;
  toughness: number | null;
  art: string | null;
  /** Spec 0051 -- its art crop, for the art window. */
  crop?: string | null;
  /** The printed mana cost ("{1}{R}"); null for a land. */
  manaCost?: string | null;
  /** Spec 0070, Amendment 1 -- the other player has seen it in its hand (the eye). */
  seen?: boolean;
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
  /** Spec 0051 -- its art crop, for the art window. */
  crop?: string | null;
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
  /** Spec 0043 — this many identical triggers, drawn as one ("×9"). */
  count?: number;
  /** Spec 0045 — what it does, in a player's words (the hover label). */
  does?: string;
}

/** Damage just dealt, one wave (one combat damage step, or one spell):
 * what Forge actually dealt (§7.61 B13). A new `key` is a new wave. */
export interface DamageWave {
  key: string;
  hits: readonly { source: string; target: TargetRef; amount: number; deathtouch?: boolean }[];
  /** Phase 10 A-13 -- a combat damage step's: which step, who fought whom, life gained. */
  combat?: "first-strike" | "regular";
  fights?: readonly { attacker: string; defender: TargetRef; blockers: readonly string[] }[];
  gains?: readonly { player: number; amount: number; source?: string }[];
}

/**
 * Phase 10 A-10 -- cards that merged into a permanent this update: a meld
 * (its partner left the table for exile) or a mutate (from the stack), as
 * the game's move record says (`into`).
 */
export interface Merge {
  kind: MergeKind;
  partners: string[];
}

/**
 * Phase 10 A-14 -- a card that went back to a hand, or onto or into a
 * library, from the table or the stack, as the game's move record says:
 * whose hand or library (`side`), where in the library (`where`, when the
 * game says), and whether this viewer can see it there (`hidden`: a library,
 * or the other player's hand).
 */
export interface Return {
  zone: "hand" | "library";
  side: Side;
  where: "top" | "bottom" | "shuffled" | null;
  hidden: boolean;
}

/** Phase 10 A-14 -- the tag at the destination, in a player's words. */
export function returnTag(
  ret: Return,
  opponentName: string,
  viewerName: string | null = null,
): string {
  // Spec 0067 -- a spectator is nobody's "you": the bottom player by name.
  const whose =
    ret.side === "viewer" ? (viewerName ? `${viewerName}'s` : "your") : `${opponentName}'s`;
  if (ret.zone === "hand") return `Back to ${whose} hand`;
  if (ret.where === "top") return `On top of ${whose} library`;
  if (ret.where === "bottom") return `On the bottom of ${whose} library`;
  if (ret.where === "shuffled") return `Shuffled into ${whose} library`;
  // Somewhere else in it ("third from the top"), or an older worker.
  return `Into ${whose} library`;
}

export interface BoardProps {
  battlefield: readonly BoardCard[];
  hand: readonly BoardHandCard[];
  /** Spec 0031 — the opponent's hand, fanned down from the top edge. */
  opponentHand?: readonly OpponentHandCard[];
  /** Whose that hand is, for its words. */
  opponentName?: string | undefined;
  /**
   * Spec 0067 -- a spectator's board: the name of the player drawn at the
   * bottom, said where a player's board says "you"/"your"/"yours". Null
   * (a player's own board) keeps "you".
   */
  viewerName?: string | null | undefined;
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
  /**
   * Owner 2026-11-01 (item 2) -- a card the cast card is flying onto: not
   * drawn until the flight has landed, and it does not slide in itself.
   */
  flyingOnto?: string | null;
  /**
   * Spec 0072, item 1 -- the other player is casting a card from their
   * hidden hand: the back at this place in their fan (as it was) left for
   * the middle, and the backs after it close the gap. Applied only on the
   * board where their hidden backs went down by one; all backs look alike.
   */
  handLeft?: number | null;
  /** Where a card that left the board went (default: its controller's
   * graveyard). A card that moved to the hand needs nothing: it is still
   * drawn, and simply moves. */
  departures?: ReadonlyMap<string, AnchorId>;
  /** Phase 10 A-10 -- each permanent that cards merged into this update (the game says which). */
  merges?: ReadonlyMap<string, Merge>;
  /** Phase 10 A-14 -- each card that went back to a hand or a library this update (the game says). */
  returns?: ReadonlyMap<string, Return>;
  /**
   * Spec 0061, item 4 -- each card that went to a graveyard this update with
   * a reason, and the game's tag for it ("Cycled", "Countered by Counterspell").
   */
  graves?: ReadonlyMap<string, string>;
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
  /**
   * Amendment 13 (item 2) -- the stack object of the spell whose cast card is
   * in the air: drawn invisible (its spot still there for the flight); and
   * the ones that were, which do not slide in again once shown.
   */
  hiddenStack?: string | null;
  quietStack?: ReadonlySet<string>;
  /** Amendment 13 (item 8) -- the mana still due for the front stack object. */
  stackOwing?: readonly string[] | null;
  /**
   * Spec 0062 -- the cost of the ability or trigger being paid, every
   * symbol kept and each lit as it is paid (in the colour of the mana that
   * paid it; its ball finds it by `data-ball`). Shown under the front stack
   * card, or -- an ability, not on the stack until it is paid -- where the
   * first stack card goes. Instead of `stackOwing` when given.
   */
  stackPay?: readonly PayPip[] | null;
  /**
   * Spec 0066, item 5 -- the payment question is still being asked. Only
   * then is "Still to pay" drawn alone in an empty stack slot; held for its
   * last ball after the question, it goes with its card.
   */
  stackPayLive?: boolean;
  /** The newest damage dealt: played once per `key`. */
  damage?: DamageWave | null;
  // --- PHASE_07 §7.24-§7.33: the board answers questions -------------
  /** A primary click on an object (a card, a pile, a tag, a hand card). */
  onPick?: (objectId: string, members?: readonly string[]) => void;
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
  /** Phase 9 W-14 -- creatures selected to attack or block, not yet
   * pointed: a check mark, and on a pile how many of it ("✓ 2"). */
  marked?: readonly string[];
  /** Spec 0061, item 3 -- hand cards picked to discard, not yet confirmed: a red outline, lifted. */
  picked?: ReadonlySet<string>;
  /** Phase 9 Amendment 17 -- the targets already chosen for the spell
   * being cast: a TARGET tag, so the player sees what is picked. */
  chosenTargets?: ReadonlySet<string>;
  /** Spec 0070 -- the cards picked so far to pay a cost: a Ribbon each (a
   * tap leans); a click on one takes it back. */
  payPicks?: ReadonlyMap<string, PayMark>;
  /** Phase 9 W-17 -- the cards in the sector or on the sprocket the
   * player is pointing at in the question: lit, and said ("pointed at"). */
  lit?: ReadonlySet<string>;
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

/**
 * Amendment 13 (item 12) -- the line under the stack: "Next: Pat's trigger ·
 * 2 on the stack". A spell is named; a trigger or ability is called one.
 */
export function stackCaption(
  stack: readonly { by?: string | null; kind?: string; name: string; seat?: number }[],
  viewerSeat: number,
  total: number,
  shown: number,
  viewerName: string | null = null,
): string {
  const front = stack[0];
  if (!front) return "";
  const what =
    front.kind === "trigger" ? "trigger" : front.kind === "ability" ? "ability" : front.name;
  const whose =
    front.seat === viewerSeat && !viewerName ? "your" : front.by ? `${front.by}'s` : null;
  const next = whose ? `Next: ${whose} ${what}` : `Next: ${what}`;
  if (total <= 1) return next;
  const hidden = stack.length > shown ? `, ${stack.length - shown} not shown` : "";
  return `${next} · ${total} on the stack${hidden}`;
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
  crop,
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
  crop?: string | null;
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
        {crop ? (
          // Spec 0051 -- the card's own art, as Scryfall cut it: filling
          // the window, with no frame or text box of any layout caught in
          // it, as the fixed zoom below catches on old frames and sagas.
          <img className="bf-crop" src={crop} alt="" decoding="async" draggable={false} />
        ) : art ? (
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

/**
 * Owner 2026-11-01 (item 3) -- a creature that flies, untapped and face up:
 * it hovers over the table. A tapped one rests (the board's 5-degree tilt).
 */
function flies(card: BoardCard): boolean {
  return (
    !card.tapped &&
    !card.faceDown &&
    (card.keywords ?? []).some((k) => k.toLowerCase() === "flying")
  );
}

/** Came in this turn and cannot attack yet: not with haste. */
function sick(card: BoardCard): boolean {
  return (
    card.sick === true &&
    !card.faceDown &&
    !(card.keywords ?? []).some((k) => k.toLowerCase() === "haste")
  );
}

/** Each card out of step with the next, so a row does not move in unison. */
function motionDelay(id: string): CSSProperties {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 5000;
  return { animationDelay: `-${h}ms` };
}

/** Enough of a card to draw it on its way out, after it has left. */
interface Drawn {
  name: string;
  look: Look;
  type: string;
  pt: string;
  art: string | null;
  /** Spec 0051 -- the art crop's URL, drawn in the art window instead of zooming into `art`. */
  crop?: string | null;
  faceDown: boolean;
  known?: boolean;
  /** Its mana cost, drawn as symbols (hand and stack cards only). */
  cost?: string | null;
  /** Lower or higher than printed right now (Forge's reckoning). */
  costChange?: "down" | "up" | null;
  /** The cost before the name: a hand card's right side is under the next card. */
  costFirst?: boolean;
  side: "viewer" | "opponent";
  /** A permanent on the table (not a hand card): it can be defeated or exiled. */
  table?: boolean;
}

/**
 * Phase 10 A-00 -- run one Glide on a card's element: linear over MOVE_MS
 * (the easing is in the frames), lifted (a deeper shadow) while it travels.
 */
function glide(element: HTMLElement, frames: Keyframe[], delay = 0, duration = MOVE_MS) {
  // Held at its first frame while it waits (a stolen creature, while its
  // gold line draws): otherwise the CSS settle would slide it there first
  // and the Glide would start by jumping it back (seen in A-08's check).
  const animation = element.animate(frames, {
    duration,
    easing: "linear",
    delay,
    fill: delay > 0 ? "backwards" : "none",
  });
  element.classList.add("bf-moving");
  const landed = () => element.classList.remove("bf-moving");
  animation.onfinish = landed;
  animation.oncancel = landed;
  return animation;
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
  /**
   * Amendment 13 (item 13) -- a resolved stack object leaves in the look it
   * had on the stack (W-20's whole card, a trigger's words plate), never
   * swapped for a different picture; drawn above the stack still there.
   */
  stack?:
    | { low: string; high: string; kind: string; does: string | null; whose: string }
    | undefined;
  zIndex?: number;
  /** Phase 10 A-04/A-05: defeated (to a graveyard) or exiled, shown first. */
  fate?: Fate | undefined;
  /** Phase 10 A-17: pulled on a gold chain into (or out of) a tab. */
  chained?: boolean;
  /** Phase 10 A-09: the old face of a card that changed form, flipping away in place. */
  flip?: boolean;
  /**
   * Phase 10 A-10: part of a merge -- the card merging in ("partner") or
   * the merged card's old face ("old") -- pulled to the merge's spot (`to`)
   * and gone at the slam; `colour` is the merge's, `start` where the card
   * was drawn when it set off.
   */
  merge?: { part: "partner" | "old"; colour: string; start: Placed | null };
  /** Phase 10 A-13: a card that died in a fight -- its moves in the fight, on its card. */
  fight?: { frames: Keyframe[]; duration: number; delay: number };
  /**
   * Phase 10 A-14: going back to a hand or a library (Lift and glide):
   * `seen` as returnFrames takes it; `back` -- a card back turns down over
   * its face on the way (into a library, or a hidden hand with no new card
   * to hand over to).
   */
  returning?: { zone: "hand" | "library"; seen: "sink" | "out"; back: boolean };
}

/** Phase 10 A-14 -- a tag at a destination, or one back of a riffling library: gone when its animation ends. */
interface ReturnMark {
  key: string;
  kind: "tag" | "riffle";
  style: CSSProperties;
  frames: Keyframe[];
  duration: number;
  delay: number;
  text?: string;
  /** The card it is about ("card:N"), for tests and the jump check. */
  of: string;
  /** Spec 0061, item 4 -- a tag riding to a graveyard, not one at a return's destination. */
  grave?: boolean;
}

/** Phase 10 A-14 -- tags and riffles above everything on the table and the hand. */
const Z_RETURN_MARK = 9000;

/**
 * Phase 10 A-11, A-12 (owner 2026-11-06, Amendment 15): an attacker steps
 * forward to its side's front line, the next one a beat later; a blocker
 * glides up to stand facing its attacker.
 */
const ATTACK_MS = 600;
const ATTACK_BEAT_MS = 120;
const BLOCK_MS = 650;
const BLOCK_BEAT_MS = 160;

/** A card a spell killed leaves once its burst has landed. */
const SPELL_HIT_MS = 150;

/** Phase 10 A-13: the fights' dimming, above the table; the fighters above it. */
const Z_FIGHT_DIM = 4550;
const Z_FIGHT = 4600;

/** Phase 10 A-13 -- one mark of a fight (fights.ts): drawn, then gone when its animation ends. */
interface FightMark {
  key: string;
  kind: "dim" | "caption" | "hit" | "slash" | "number" | "gain" | "edge" | "plate";
  style: CSSProperties;
  frames: Keyframe[];
  duration: number;
  delay: number;
  text?: string;
  /** What it marks: an object id or "player:N" (for tests and the jump check). */
  of?: string;
  deathtouch?: boolean;
}

/** Phase 10 A-10 -- a merge's dimming, flash, sparks and ring, at the merged card. */
interface Fusion {
  key: string;
  kind: MergeKind;
  at: Point;
  /** The merged card's width: the burst is sized by it. */
  size: number;
}

/** Above every table card (riders reach ~4000) and a board wipe's flash; below the lines and the hand. */
const Z_MERGE_DIM = 4550;
const Z_MERGE = 4600;
const Z_MERGE_FX = 4700;

/** A-10 -- the burst's sparks: fixed, so a test can count them (the canvas's are random). */
const MERGE_SPARKS = Array.from({ length: 30 }, (_, i) => {
  const angle = (i / 30) * Math.PI * 2 + ((i * 7) % 5) * 0.08;
  // In card widths, as the canvas's 190 pixels at a 110-pixel card.
  const reach = (190 / 110) * (0.6 + ((i * 13) % 10) * 0.06);
  return {
    dx: Math.cos(angle) * reach,
    dy: Math.sin(angle) * reach + 20 / 110,
    ms: Math.round(MERGE_FLASH_MS * (0.7 + ((i * 11) % 7) * 0.05)),
    white: i % 3 === 0,
  };
});

/** Phase 10 A-08/A-17 -- a safety net: a chain line still there this long after it began is removed. */
const TETHERS_GONE_MS = 30_000;

/** Phase 10 A-17 -- a card shrunk into its tab is drawn this small (of a card). */
const TAB_CARD = 0.22;

/** Where an attached card's tab is: a small card's box, centred on the tab. */
function tabBox(host: Box, i: number, n: number, g: Geometry): Box {
  const s = host.scale;
  const cx = host.x + host.w + (tabAt(i, n) + TAB_W / 2) * g.cardH * s;
  const cy = host.y + host.h / 2;
  const scale = TAB_CARD * s;
  const w = g.cardW * scale;
  const h = g.cardH * scale;
  return { x: cx - w / 2, y: cy - h / 2, w, h, scale, rotation: 0, z: host.z + 1 };
}

/** An attached card's tab, and the card as it would be drawn leaving it. */
interface Tab {
  box: Box;
  host: string;
  drawn: Drawn;
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

/** Spec 0063 -- how long a line takes to fade out when it goes (battlefield.css bf-line-out). */
const LINE_OUT_MS = 160;

/** Spec 0028 — how long a resolving stack card glows, its spark travelling, before it leaves. */
const RESOLVE_MS = 380;

/** A line, ready to draw. */
interface Line {
  key: string;
  kind: LineKind;
  from: string;
  to: string;
  /** Spec 0063 -- its pieces; it starts at the first's start, its tip is the last's end. */
  route: Route;
  /** How many relationships it stands for: a pile's members are one line. */
  count: number;
  /** Spec 0069 -- a target pointer's crosshair: where it locks on, and how big. */
  aim?: { at: Point; r: number };
}

const refKey = (ref: TargetRef) => ("player" in ref ? `player:${ref.player}` : ref.object);

/** One thing layout() placed, ready to draw. */
interface Item {
  id: string;
  /** Every object id it stands for: a pile's members, a host's tags. */
  ids: string[];
  box: Box;
  origin: { x: number; y: number };
  drawn: Drawn;
  content: ReactNode;
}

/** Spec 0063 -- focus the keyboard gave (`:focus-visible`), not a click's. */
function keyboardFocus(element: Element): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    return true;
  }
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : true;
}

/** Spec 0069 -- an id for a line's own gradient. */
function lookId(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  return `bf-g${(h >>> 0).toString(36)}`;
}

const NO_CARDS: readonly OpponentHandCard[] = [];

/**
 * Spec 0066, item 1 -- a trigger or ability rises out of its card to the
 * stack in this long (the canvas's 520 ms); a stack card that has no card
 * to rise from slides in (`bf-stack-in`, 260 ms). Its arrows wait for it.
 */
export const RISE_MS = 520;
export const STACK_IN_MS = 260;

/** The board fills its container and lays itself out for that size. */
/**
 * Spec 0062 -- "Still to pay" with every symbol of the cost (Amendment 13's
 * pill, spec 0057's size): a grey pip per generic mana, each lit as it is
 * paid, in that mana's colour.
 */
function OwePill({ pips }: { pips: readonly PayPip[] }) {
  return (
    <span className="bf-stack-owe" aria-label={`Still to pay: ${owingWords(pips) || "nothing"}`}>
      <span className="bf-stack-owe-word">Still to pay</span>
      <span className="bf-owe-pips">
        {pips.map((pip, i) => {
          const className = `bf-owe-pip${pip.generic ? " bf-owe-pip-generic" : ""}${pip.paid ? " bf-owe-pip-paid" : ""}`;
          const style = pip.paid && pip.colour ? { boxShadow: litShadow(pip.colour) } : undefined;
          const data = {
            "data-ball": pip.ball,
            "data-paid-by": pip.paid ? (pip.colour ?? "") : undefined,
          };
          const url = pip.generic ? null : symbolUrl(pip.symbol);
          return url ? (
            <img
              key={i}
              className={className}
              src={url}
              alt={pip.paid ? `${pip.symbol} paid` : pip.symbol}
              style={style}
              {...data}
            />
          ) : (
            <span key={i} className={className} style={style} {...data}>
              {pip.generic ? "" : pip.symbol}
            </span>
          );
        })}
      </span>
    </span>
  );
}

export function Board({
  battlefield,
  hand,
  opponentHand = NO_CARDS,
  opponentName = "Your opponent",
  viewerName = null,
  onOpponentHand,
  viewerSeat,
  artUrl,
  arrivals,
  departures,
  merges,
  returns,
  graves,
  flyingOnto = null,
  handLeft = null,
  hiddenStack = null,
  quietStack,
  stackOwing = null,
  stackPay = null,
  stackPayLive = false,
  combat,
  stack,
  pointedStack,
  clock,
  clockMs,
  handCosts,
  damage,
  onPick,
  onInspect,
  choosable,
  unpayable,
  selected,
  marked,
  picked,
  chosenTargets,
  payPicks,
  lit,
  asking,
  rail,
  top,
  overlay,
}: BoardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [pointed, setPointed] = useState<string | null>(null);
  // Spec 0059 item 9 -- the attacker pointed at (or focused, or tapped on a
  // touch screen): its attack line shows; at rest none do, its badge says.
  const [aimed, setAimed] = useState<string | null>(null);
  // Spec 0028 — the stack card the player points at: its line shows
  // instead of the front card's, and the rest of the stack fades.
  const [pointedOnStack, setPointedOnStack] = useState<string | null>(null);
  // Phase 9 W-20 -- the stack readable (the whole card, close-up size),
  // except while something is to be chosen on the table under it -- and
  // (spec 0066, item 5) while "Still to pay" is shown, held a moment after
  // the payment question for its last ball: it keeps its size till it goes.
  const stackScale = asking || (stackPay && stackPay.length > 0) ? STACK_SCALE : STACK_READ_SCALE;
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  /** Phase 10 A-07: the board wipe's flash, keyed by when it began. */
  const [sweep, setSweep] = useState<number | null>(null);
  /** Phase 10 A-08: the gold lines pulling stolen creatures across. */
  const [tethers, setTethers] = useState<{ key: string; from: Point; to: Point }[]>([]);
  /** Phase 10 A-10: the merges' bursts. */
  const [fusions, setFusions] = useState<Fusion[]>([]);
  /** Phase 10 A-14: the tags at destinations and the riffling libraries. */
  const [returnMarks, setReturnMarks] = useState<ReturnMark[]>([]);
  const [effects, setEffects] = useState<Effect[]>([]);
  const wave = useRef<{ key: string } | null>(null);
  /** Phase 10 A-13: the fights' marks, the clock they all run on, and the dead's part in them. */
  const [marks, setMarks] = useState<FightMark[]>([]);
  const fightClock = useRef<Animation | null>(null);
  // Spec 0067 -- a board that goes takes its fights' life steps with it.
  useEffect(() => () => endLifeSteps(), []);
  /** A spell's damage: what it hit waits for its burst before it leaves. */
  const spellHits = useRef<{ ids: Set<string>; delay: number } | null>(null);
  const fightGhosts = useRef(
    new Map<string, { frames: Keyframe[]; duration: number; delay: number; shatterAt: number }>(),
  );
  const timers = useRef<number[]>([]);
  useLayoutEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );
  const elements = useRef(new Map<string, HTMLDivElement>());
  /** Phase 10 A-10: the merges already played (each board's are played once). */
  const playedMerges = useRef<ReadonlyMap<string, Merge> | undefined>(undefined);
  const previous = useRef<{
    viewport: Viewport;
    at: Map<string, { box: Box; origin: { x: number; y: number } }>;
    drawn: Map<string, Drawn>;
    mounted: Set<string>;
    /** Spec 0028 — the stack as it was drawn: each object and its card's box. */
    stack: { s: StackView; box: Box }[];
    /** The hand card pointed at then: its rise is a settle, not a Glide. */
    pointed: string | null;
    /** Phase 10 A-17 -- every attached card's tab then. */
    tabs: Map<string, Tab>;
    /** Phase 10 A-13 -- the drawn card each object was drawn as, and what it was. */
    itemOf: Map<string, string>;
    members: Map<string, number>;
    cards: Map<string, BoardCard>;
    /** Phase 10 A-11/A-12 -- the drawn cards attacking or blocking then. */
    roles: Map<string, "attack" | "block">;
  } | null>(null);

  /** Phase 10 A-13: how long the fights still playing hold the table (on the animation clock). */
  const holdLeft = () => {
    const clock = fightClock.current;
    if (!clock || clock.playState !== "running") return 0;
    const end = Number(clock.effect?.getComputedTiming().endTime ?? 0);
    const now = Number(clock.currentTime ?? 0);
    return Math.max(0, (end - now) / Math.abs(clock.playbackRate || 1));
  };

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setViewport({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Phase 10 A-13 (found filming the rebuilt stack): the board a combat
  // damage step's wave comes on has already lost the dead, and Forge has
  // already ended the blocks (a dead attacker has none), so its layout is
  // the RESULT -- survivors home, the dead gone. From its very first frame,
  // every card stays where it stood in combat until the fights have played
  // (the clock's end, or a click hurrying it); then all go home together.
  // Pinned here, in the drawing itself, not left to an animation's first
  // frame. Decided as the board is drawn, so nothing waits on an effect.
  const pins = useRef<{ key: string; boxes: Map<string, Box> } | null>(null);
  const [released, setReleased] = useState<string | null>(null);
  if (
    damage?.combat &&
    damage.fights?.length &&
    damage.key !== pins.current?.key &&
    damage.key !== wave.current?.key &&
    previous.current &&
    !reducedMotion()
  ) {
    pins.current = {
      key: damage.key,
      boxes: new Map([...previous.current.at].map(([id, at]) => [id, at.box])),
    };
  }
  const pinned = pins.current && pins.current.key !== released ? pins.current.boxes : null;
  const laidOut = useMemo(() => {
    const fighting = combat ? inCombat(battlefield, combat) : battlefield;
    // Spec 0070: a card picked to pay stands apart from its pile, and a
    // card picked to tap leans (layout's TAPPED_TILT); paid, it is tapped.
    if (!payPicks || payPicks.size === 0) return fighting;
    return fighting.map((card) => {
      const mark = payPicks.get(card.id);
      return mark ? { ...card, paying: mark.lean ? ("lean" as const) : ("mark" as const) } : card;
    });
  }, [battlefield, combat, payPicks]);
  // Spec 0040 — each side's card size last time, so a side grows back only
  // with room to spare. Kept in state, so layout() itself stays pure.
  const [sideSizes, setSideSizes] = useState<Partial<Record<Side, number>>>({});
  const result = useMemo(
    () =>
      viewport
        ? layout(
            { battlefield: laidOut, hand, opponentHand, viewerSeat, previousScale: sideSizes },
            viewport,
          )
        : null,
    [laidOut, hand, opponentHand, viewerSeat, viewport, sideSizes],
  );
  const scales = result?.scales;
  useEffect(() => {
    if (scales && (scales.viewer !== sideSizes.viewer || scales.opponent !== sideSizes.opponent)) {
      setSideSizes(scales);
    }
  }, [scales, sideSizes]);
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
    return (ids: readonly string[], inHand = false) => {
      const id = pickOf(ids);
      const canChoose = ids.some((one) => choosable?.has(one));
      // §7.54, owner 2026-11-05 ("dimmed, no glow"): a hand card Forge
      // says cannot be paid for right now is dimmed and does not breathe,
      // but stays clickable -- Forge has the last word. It used to be
      // dimmed only when NOT choosable, which a hand card never is, so the
      // mark never showed. Elsewhere on the board the old rule stands.
      const dim = inHand
        ? canChoose &&
          ids.some((one) => unpayable?.has(one)) &&
          !ids.some((one) => choosable?.has(one) && !unpayable?.has(one))
        : !canChoose && ids.some((one) => unpayable?.has(one));
      const isSelected = ids.some((one) => one === selected);
      const isTargeted = ids.some((one) => targeted.has(one));
      const isChosen = ids.some((one) => chosenTargets?.has(one));
      const isLit = ids.some((one) => lit?.has(one));
      // W-14: how many of these are selected for the attack or block.
      const marks = marked ? ids.filter((one) => marked.includes(one)).length : 0;
      const isPicked = ids.some((one) => picked?.has(one));
      const pay = ids.map((one) => payPicks?.get(one)).find((mark) => mark !== undefined);
      return {
        className: `${canChoose && !dim ? " bf-choosable" : ""}${isSelected ? " bf-selected" : ""}${dim ? " bf-unpayable" : ""}${isTargeted ? " bf-targeted" : ""}${isChosen ? " bf-chosen-target" : ""}${marks ? " bf-marked" : ""}${isLit ? " bf-lit" : ""}${isPicked ? " bf-picked" : ""}${pay ? ` bf-pay-picked bf-pay-${pay.tone}` : ""}`,
        words: [
          isPicked ? "picked to discard" : "",
          pay ? payWords(pay) : "",
          canChoose ? "can be chosen" : "",
          dim ? "not enough mana right now" : "",
          isSelected ? "selected" : "",
          marks ? (ids.length > 1 ? `${marks} selected` : "selected") : "",
          isTargeted ? "targeted" : "",
          isChosen ? "chosen as a target" : "",
          isLit ? "pointed at" : "",
        ],
        marks,
        chosen: isChosen,
        pay,
        data: {
          "data-choosable": canChoose ? "true" : undefined,
          "data-selected": isSelected ? "true" : undefined,
          "data-marked": marks ? String(marks) : undefined,
          "data-unpayable": dim ? "true" : undefined,
          "data-chosen-target": isChosen ? "true" : undefined,
          "data-lit": isLit ? "true" : undefined,
          "data-picked": isPicked ? "true" : undefined,
          "data-pay-picked": pay ? pay.word : undefined,
        },
        handlers: {
          // Spec 0037: and the whole stack, for "block with all of these".
          onClick: onPick ? () => onPick(id, ids) : undefined,
          onContextMenu: onInspect
            ? (event: { preventDefault: () => void }) => {
                event.preventDefault();
                onInspect(id);
              }
            : undefined,
        },
      };
    };
  }, [
    choosable,
    unpayable,
    selected,
    marked,
    picked,
    chosenTargets,
    payPicks,
    lit,
    targeted,
    onPick,
    onInspect,
  ]);

  const items = useMemo<Item[]>(() => {
    if (!result) return [];
    const g = result.geometry;
    const sideOf = (seat: number) => (seat === viewerSeat ? "viewer" : "opponent");
    const out: Item[] = [];

    // Owner 2026-11-01 (item 3) -- rows whose cards overlap: a flyer there
    // only bobs (no sway into the next card).
    const crowded = new Set<string>();
    const byRow = new Map<string, number[]>();
    for (const slot of result.slots) {
      const xs = byRow.get(slot.row) ?? [];
      xs.push(slot.box.x);
      byRow.set(slot.row, xs);
    }
    for (const [row, xs] of byRow) {
      const sorted = [...xs].sort((a, b) => a - b);
      if (sorted.some((x, i) => i > 0 && x - sorted[i - 1]! < g.cardW * 0.98)) crowded.add(row);
    }

    // Spec 0059 item 9, spec 0063 -- what each unblocked attacker attacks (a
    // blocked one hits its blockers, spec 0037): its words, and its line on
    // pointing. Every attacker answers pointing, blocked ones too.
    const blockedIds = new Set((combat?.blocks ?? []).map((b) => b.attacker));
    const aims = new Map<string, TargetRef>();
    const attacks = new Map<string, TargetRef>();
    for (const a of combat?.attackers ?? []) {
      attacks.set(a.id, a.target);
      if (!blockedIds.has(a.id)) aims.set(a.id, a.target);
    }
    // Spec 0063 (R2) -- what is attacked glows; brighter while an attacker
    // aimed at it is pointed at, and the pointed blocked attacker's
    // blockers light up blue.
    const leadOf = new Map<string, string>();
    for (const slot of result.slots) for (const id of slot.ids) leadOf.set(id, slot.ids[0]!);
    const attacked = new Set<string>();
    const hot = new Set<string>();
    for (const [id, target] of aims) {
      if (!("object" in target)) continue;
      attacked.add(target.object);
      if (aimed !== null && leadOf.get(id) === aimed) hot.add(target.object);
    }
    const litBlockers = new Set<string>();
    for (const b of combat?.blocks ?? []) {
      if (aimed !== null && leadOf.get(b.attacker) === aimed) litBlockers.add(b.blocker);
    }
    const aimWords = (target: TargetRef) =>
      "player" in target
        ? target.player === viewerSeat
          ? (viewerName ?? "you")
          : opponentName
        : (byId.get(target.object)?.name ?? "a permanent");

    for (const slot of result.slots) {
      const lead = byId.get(slot.ids[0]!)!;
      const count = slot.ids.length;
      const look = lookOf(lead.kind, lead.types);
      const side = slot.row.startsWith("viewer") ? "viewer" : sideOf(lead.seat);
      const pt = figure(lead);
      const attached = slot.attached.map((id) => byId.get(id)!);
      const aim = slot.ids.map((id) => aims.get(id)).find((t) => t !== undefined);
      const attacker = slot.ids.map((id) => attacks.get(id)).find((t) => t !== undefined);
      const glows = slot.ids.some((id) => attacked.has(id));
      const label = [
        lead.faceDown && !lead.known
          ? "Face-down card"
          : lead.faceDown
            ? `${lead.name}, face down`
            : lead.name,
        count > 1 ? `${count} of them` : "",
        pt,
        lead.tapped ? "tapped" : "",
        lead.attacking ? (aim ? `attacking ${aimWords(aim)}` : "attacking") : "",
        lead.blocking
          ? `blocking ${byId.get(slot.faces ?? lead.blocks ?? "")?.name ?? "an attacker"}`
          : "",
        lead.ringBearer ? "Ring-bearer" : "",
        flies(lead) ? "flying" : "",
        sick(lead) ? "summoning sick: can attack next turn" : "",
        ...counterWords(lead),
        lead.makes?.length ? `makes ${lead.makes.join(" or ")}` : "",
        lead.sector ? `sector ${lead.sector}` : "",
        lead.sprocket ? `on sprocket ${lead.sprocket}` : "",
        attached.length > 0 ? `with ${attached.map((card) => card.name).join(" and ")}` : "",
        side === "viewer"
          ? viewerName
            ? `${viewerName}'s`
            : "yours"
          : viewerName
            ? `${opponentName}'s`
            : "opponent's",
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
        crop: lead.crop ? artUrl(lead.crop) : null,
        faceDown: lead.faceDown,
        known: lead.known,
        side,
        table: true,
      };
      out.push({
        id: lead.id,
        ids: [...slot.ids, ...slot.attached],
        box: pinned?.get(lead.id) ?? slot.box,
        origin: TAPPED_ORIGIN,
        drawn,
        content: (
          <>
            {flies(lead) && (
              <span
                className={`bf-fly-shadow${crowded.has(slot.row) ? " bf-fly-bob" : ""}`}
                aria-hidden="true"
                style={motionDelay(lead.id)}
              />
            )}
            <button
              type="button"
              className={`bf-card bf-look-${look}${lead.tapped ? " bf-dim" : ""}${lead.attacking ? " bf-attacking" : ""}${lead.blocking ? " bf-blocking" : ""}${leadAct.className}${flies(lead) ? (crowded.has(slot.row) ? " bf-fly bf-fly-bob" : " bf-fly") : ""}`}
              style={flies(lead) ? motionDelay(lead.id) : undefined}
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
              data-blocking={lead.blocking ? "true" : undefined}
              data-blocks={slot.faces ?? lead.blocks}
              data-aims={attacker ? refKey(attacker) : undefined}
              data-aimed={attacker && aimed === lead.id ? "true" : undefined}
              data-attacked={
                glows ? (slot.ids.some((id) => hot.has(id)) ? "hot" : "true") : undefined
              }
              data-pointed-blocker={slot.ids.some((id) => litBlockers.has(id)) ? "true" : undefined}
              {...(attacker
                ? {
                    // Spec 0059 item 9, spec 0063: pointing, keyboard focus,
                    // or a tap on a touch screen (which has no pointing)
                    // shows its line -- every attacker, blocked ones and
                    // piles too.
                    onPointerEnter: (event: { pointerType: string }) => {
                      if (event.pointerType !== "touch") setAimed(lead.id);
                    },
                    onPointerLeave: (event: { pointerType: string }) => {
                      if (event.pointerType !== "touch")
                        setAimed((now) => (now === lead.id ? null : now));
                    },
                    onPointerDown: (event: { pointerType: string }) => {
                      if (event.pointerType === "touch")
                        setAimed((now) => (now === lead.id ? null : lead.id));
                    },
                    // Spec 0063: only focus the keyboard gave (a click
                    // focuses the card too, and must not leave it pointed at).
                    onFocus: (event: { currentTarget: Element }) => {
                      if (keyboardFocus(event.currentTarget)) setAimed(lead.id);
                    },
                    onBlur: () => setAimed((now) => (now === lead.id ? null : now)),
                  }
                : {})}
            >
              <CardFace {...drawn} />
              {leadAct.chosen ? (
                // Phase 9 Amendment 17: already chosen for the spell being cast.
                <span className="bf-state bf-state-target">TARGET</span>
              ) : lead.blocking ? (
                // Phase 10 A-12: blue, on a blocker standing facing its attacker.
                <span className="bf-state bf-state-blocking">BLOCKING</span>
              ) : lead.attacking ? (
                <span className="bf-state bf-state-attacking">ATTACKING</span>
              ) : lead.tapped ? (
                <span className="bf-state">TAPPED</span>
              ) : null}
              {count > 1 && <span className="bf-pile">×{count}</span>}
              {/* Spec 0046 -- what a land makes, as mana symbols. */}
              {lead.makes && lead.makes.length > 0 && !lead.faceDown && (
                <span
                  className="bf-makes"
                  title={`Makes ${lead.makes.map((m) => `{${m}}`).join(" or ")}`}
                >
                  {lead.makes.map((m) => {
                    const url = symbolUrl(m);
                    return url ? (
                      <img key={m} className="bf-makes-pip" src={url} alt={m} />
                    ) : (
                      <span key={m} className="bf-makes-pip">
                        {m}
                      </span>
                    );
                  })}
                </span>
              )}
              {/* Spec 0045 -- its counters; pointing says where from. */}
              {lead.counters.some((c) => c.name !== "LOYALTY") && (
                <span className="bf-counters" title={counterWords(lead).join("\n")}>
                  {lead.counters
                    .filter((c) => c.name !== "LOYALTY")
                    .map((c) => `${counterName(c.name)}${c.count > 1 ? ` ×${c.count}` : ""}`)
                    .join(" · ")}
                </span>
              )}
              {lead.ringBearer && <span className="bf-ring">Ring-bearer</span>}
              {/* Owner 2026-11-01 (item 3) -- came in this turn: drifting zZz. */}
              {sick(lead) && (
                <span className="bf-zz" aria-hidden="true" style={motionDelay(lead.id)}>
                  <i>z</i>
                  <i>z</i>
                  <i>z</i>
                </span>
              )}
              {lead.sector && <span className="bf-zone">{lead.sector}</span>}
              {lead.sprocket && <span className="bf-zone">Sprocket {lead.sprocket}</span>}
            </button>
            {leadAct.pay && (
              // Spec 0070, Amendment 1: picked to pay -- the cost's sign on the
              // card's corner (beside the card, which clips its edge); no words.
              <PaySign tone={leadAct.pay.tone} />
            )}
            {/* Amendment 13 (item 10): the seal hangs over the card's corner, so
                it sits beside the card, which clips what crosses its edge. */}
            {leadAct.marks > 0 && (
              <span className="bf-marked-n" aria-hidden="true">
                <svg viewBox="0 0 20 20">
                  <path
                    d="M4 10.5 L8.5 15 L16 6"
                    stroke="#1a1408"
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {count > 1 && <b>{leadAct.marks}</b>}
              </span>
            )}
            {attached.length > 0 && (
              // Auras and Equipment as tabs on the host's right edge (Phase
              // 10 A-17, owner 2026-11-06; name tags across its picture
              // before, AMENDMENT 4), fanning past TAB_FAN. Each is its own
              // button, with its own id, so it can be targeted and inspected
              // like any permanent.
              <div className="bf-tags" data-tabs={attached.length}>
                {attached.map((card, index) => {
                  const tagLook = lookOf(card.kind, card.types);
                  const tagAct = act([card.id]);
                  return (
                    <button
                      key={card.id}
                      type="button"
                      style={{
                        left: `calc(var(--card-h) * ${tabAt(index, attached.length)})`,
                        zIndex: attached.length - index,
                      }}
                      className={`bf-tag bf-look-${tagLook}${tagAct.className}`}
                      {...tagAct.data}
                      {...tagAct.handlers}
                      aria-label={[
                        `${card.name}, attached to ${lead.faceDown && !lead.known ? "a face-down card" : lead.name}`,
                        sideOf(card.seat) === "viewer"
                          ? viewerName
                            ? `${viewerName}'s`
                            : "yours"
                          : viewerName
                            ? `${opponentName}'s`
                            : "opponent's",
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
        crop: card.crop ? artUrl(card.crop) : null,
        faceDown: false,
        side: "viewer",
        cost: now ?? card.manaCost ?? null,
        costChange: costChange(now, card.manaCost),
        costFirst: true,
      };
      const zoomed = pointed === card.id;
      const box = zoomed ? handZoomBox(rest, g) : rest;
      const handAct = act([card.id], true);
      const show = () => setPointed(card.id);
      const hide = () => setPointed((now) => (now === card.id ? null : now));
      out.push({
        id: card.id,
        ids: [card.id],
        box,
        origin: HAND_ORIGIN,
        drawn,
        content: (
          <>
            <button
              type="button"
              className={`bf-card bf-hand bf-look-${look}${handAct.className}`}
              aria-label={[
                `${card.name}, in your hand`,
                pt,
                card.seen ? `${opponentName} has seen it` : "",
                ...handAct.words,
              ]
                .filter(Boolean)
                .join(", ")}
              {...handAct.data}
              {...handAct.handlers}
              data-object-id={card.id}
              data-seen={card.seen ? "true" : undefined}
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
            {handAct.pay ? (
              <PaySign tone={handAct.pay.tone} corner="top-left" />
            ) : (
              // Amendment 1: the other player has seen this card -- the eye,
              // until it leaves your hand.
              card.seen && <PaySign tone="reveal" seen corner="top-left" />
            )}
          </>
        ),
      });
    }

    // Spec 0031 — the opponent's hand: backs, and any card shown to you.
    // Clicking it opens the shown cards, as the plate's Hand tile did.
    opponentHand.forEach((card, i) => {
      const rest = result.boxes.get(card.id);
      if (!rest) return;
      const shown = card.shown;
      // Spec 0071, item 2 -- a card you may see slides down fully into
      // view while pointed at, and back; a hidden back never moves.
      const slid = !!shown && pointed === card.id;
      const box = slid ? opponentRevealBox(rest, g) : rest;
      const show = () => setPointed(card.id);
      const hide = () => setPointed((now) => (now === card.id ? null : now));
      const drawn: Drawn = shown
        ? {
            name: shown.name,
            look: lookOf(shown.kind, shown.types),
            type: shortType(shown.types),
            pt: figure(shown),
            art: shown.art ? artUrl(shown.art) : null,
            crop: shown.crop ? artUrl(shown.crop) : null,
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
          <>
            <button
              type="button"
              className={`bf-card bf-opp-hand${shown ? ` bf-look-${drawn.look} bf-opp-hand-shown` : ""}`}
              aria-label={
                shown
                  ? `${shown.name}, in ${opponentName}'s hand, ${shown.seen ? "revealed to you" : "shown to you"}`
                  : `Card ${i + 1} of ${opponentHand.length} in ${opponentName}'s hand`
              }
              disabled={!onOpponentHand}
              onClick={onOpponentHand}
              data-object-id={card.id}
              data-zone="opponent:hand"
              data-controller="opponent"
              data-face={shown ? "up" : "down"}
              data-seen={shown?.seen ? "true" : undefined}
              data-zoomed={slid ? "true" : undefined}
              onPointerEnter={shown ? show : undefined}
              onPointerLeave={shown ? hide : undefined}
              onFocus={shown ? show : undefined}
              onBlur={shown ? hide : undefined}
            >
              {shown ? (
                <CardFace {...drawn} />
              ) : (
                // The Proxic card back (docs/assets/brand), owner 2026-10-28.
                <img className="bf-opp-back" src={cardBack} alt="" draggable={false} />
              )}
            </button>
            {/* Amendment 1: revealed to you -- it stays shown, with the eye,
              until it leaves their hand. */}
            {shown?.seen && <PaySign tone="reveal" seen corner="bottom-left" />}
          </>
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
    viewerName,
    onOpponentHand,
    viewerSeat,
    artUrl,
    pointed,
    act,
    handCosts,
    pinned,
    combat,
    aimed,
  ]);
  // A card selected to attack or block draws over its neighbours (Z_MARKED).
  const zOf = (item: Item) =>
    marked && item.ids.some((one) => marked.includes(one)) ? Z_MARKED : item.box.z;

  /** Where every object is drawn now: piles' members and hosts' tags
   * share their card's box. */
  const positions = useMemo(() => {
    const at = new Map<string, { box: Box; origin: { x: number; y: number }; item: string }>();
    for (const item of items) {
      for (const id of item.ids) at.set(id, { box: item.box, origin: item.origin, item: item.id });
    }
    return at;
  }, [items]);

  // Spec 0066, item 1 -- a stack card's arrows wait until it has arrived.
  // A card cast is hidden under its flight (`hiddenStack`, yours and the
  // other player's); a trigger or ability rises out of its card (RISE_MS);
  // anything else slides in (STACK_IN_MS). `arriving` says until when.
  const stackEls = useRef(new Map<string, HTMLDivElement>());
  const arriving = useRef(new Map<string, number>());
  const rose = useRef(new Set<string>());
  const [, setArrived] = useState(0);
  const seenStack = previous.current
    ? new Set(previous.current.stack.map((was) => was.s.id))
    : null;
  const freshOnStack = (s: StackView) =>
    seenStack !== null && !seenStack.has(s.id) && s.id !== hiddenStack && !quietStack?.has(s.id);
  for (const s of stack ?? []) {
    if (
      freshOnStack(s) &&
      (s.kind === "trigger" || s.kind === "ability") &&
      s.source &&
      positions.has(s.source) &&
      byId.has(s.source) &&
      !reducedMotion()
    )
      rose.current.add(s.id);
  }
  // A cast card that has just landed: its stack card fades in over the
  // flight's last moment (160 ms); its arrows wait for that too.
  const wasHidden = useRef<string | null>(null);
  const justLanded = wasHidden.current !== hiddenStack ? wasHidden.current : null;
  const stackWaiting = (s: StackView) =>
    s.id === hiddenStack ||
    s.id === justLanded ||
    freshOnStack(s) ||
    (arriving.current.get(s.id) ?? 0) > performance.now();
  useLayoutEffect(() => {
    const was = wasHidden.current;
    wasHidden.current = hiddenStack;
    if (!was || was === hiddenStack) return;
    const done = () => {
      arriving.current.set(was, 0);
      setArrived((n) => n + 1);
    };
    const el = stackEls.current.get(was);
    const fading =
      !reducedMotion() && el && typeof el.getAnimations === "function"
        ? el.getAnimations().find((a) => a instanceof CSSTransition)
        : undefined;
    arriving.current.set(was, Infinity);
    timers.current.push(window.setTimeout(done, fading ? 160 * 20 : 176));
    if (fading) void fading.finished.then(done, done);
  }, [hiddenStack]);
  useLayoutEffect(() => {
    const before = previous.current;
    if (!result || !before) return;
    const seen = new Set(before.stack.map((was) => was.s.id));
    const g = result.geometry;
    const spots = stackSpotBoxes(g, (stack ?? []).length, stackScale);
    const still = reducedMotion();
    (stack ?? []).slice(0, spots.length).forEach((s, i) => {
      if (seen.has(s.id) || s.id === hiddenStack || quietStack?.has(s.id)) return;
      const rises = rose.current.has(s.id);
      const ms = still ? 0 : rises ? RISE_MS : STACK_IN_MS;
      const el = stackEls.current.get(s.id);
      const from = s.source ? positions.get(s.source)?.box : undefined;
      const to = spots[i]!;
      // Arrived when its own animation ends (a click's hurry, or the jump
      // tool's slow motion, move that end too); a timer in case none runs.
      const arrived = () => {
        if (!arriving.current.has(s.id)) return;
        arriving.current.set(s.id, 0);
        setArrived((n) => n + 1);
      };
      const sliding =
        !still && !rises && el && typeof el.getAnimations === "function"
          ? el.getAnimations().find((a) => a instanceof CSSAnimation)
          : undefined;
      arriving.current.set(s.id, still ? 0 : Infinity);
      timers.current.push(
        window.setTimeout(arrived, sliding || (rises && el?.animate) ? ms * 20 : ms + 16),
      );
      if (sliding) void sliding.finished.then(arrived, arrived);
      if (!rises || !from || !el || typeof el.animate !== "function") return;
      // Out of its card, up off the table in a short arc, growing to the
      // stack card's size (the canvas: 520 ms, eased in and out).
      const k0 = from.h / g.cardH;
      const lift = g.cardH * 0.4;
      const at = (f: number) =>
        `translate3d(${from.x + (to.x - from.x) * f}px, ${
          from.y + (to.y - from.y) * f - Math.sin(Math.PI * f) * lift
        }px, 0) scale(${k0 + (to.scale - k0) * f})`;
      const rise = el.animate(
        [0, 0.15, 0.35, 0.5, 0.65, 0.85, 1].map((f) => ({
          offset: f,
          transform: at(f),
          opacity: f === 0 ? 0 : 1,
        })),
        { duration: RISE_MS, easing: "cubic-bezier(0.45, 0, 0.25, 1)" },
      );
      // (A test's stand-in animation may have no promise.)
      const done = rise.finished as Promise<Animation> | undefined;
      if (done !== undefined) void done.then(arrived, arrived);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per stack
  }, [stack]);

  // Damage, once per wave. Declared before the movement effect, so what
  // moves in the same update waits for the fights. Phase 10 A-13 (owner
  // 2026-11-06, Amendment 15): a combat damage step's damage plays one fight
  // at a time (fights.ts) -- the game says who fought whom; anything else
  // (a spell) is a burst and the amount where it landed.
  useLayoutEffect(() => {
    if (!result || !damage || damage.key === wave.current?.key) return;
    wave.current = { key: damage.key };
    const g = result.geometry;
    const where = anchors(g);
    const still = reducedMotion();
    const before = previous.current;
    // Where an object stood: as drawn before this update (so the dead too),
    // else as drawn now.
    const standOf = (id: string): Stand | null => {
      const was = before?.at.get(id);
      const item = before?.itemOf.get(id) ?? positions.get(id)?.item;
      const box = was?.box ?? positions.get(id)?.box;
      const card = before?.cards.get(id) ?? byId.get(id);
      if (!box || !item || !card) return null;
      return {
        box,
        item,
        name: card.faceDown && !card.known ? "face-down creature" : card.name,
        seat: card.seat,
        count: before?.members.get(item) ?? 1,
      };
    };
    const lifeOf = (seat: number) => playerPoint(seat, viewerSeat, where);
    const plan =
      still || !damage.combat
        ? null
        : planFights({
            wave: damage,
            at: standOf,
            life: lifeOf,
            lifeR: LIFE_R * g.height,
            viewerSeat,
            opponentName,
            viewerName,
          });
    const hold = holdLeft();
    if (plan && ref.current && typeof ref.current.animate === "function") {
      playFights(plan, hold, standOf, lifeOf, g);
      return;
    }
    // No fights to play after all: nothing is held.
    if (pins.current?.key === damage.key) setReleased(damage.key);
    // A spell's damage (or an older worker's combat): a burst and the
    // amount on everything hit, after any fights still playing.
    const pointOf = (ref: TargetRef): Point | null => {
      if ("player" in ref) return lifeOf(ref.player);
      const p = positions.get(ref.object) ?? before?.at.get(ref.object);
      return p ? centreOf(p.box, p.origin) : null;
    };
    const totals = new Map<string, { ref: TargetRef; amount: number }>();
    for (const hit of damage.hits) {
      const k = refKey(hit.target);
      totals.set(k, { ref: hit.target, amount: (totals.get(k)?.amount ?? 0) + hit.amount });
    }
    const added: Effect[] = [];
    for (const [k, { ref, amount }] of totals) {
      const point = pointOf(ref);
      if (!point) continue;
      if (!still)
        added.push({
          key: `${damage.key}:${k}:burst`,
          kind: "burst",
          target: k,
          at: point,
          amount,
          delay: hold,
        });
      added.push({
        key: `${damage.key}:${k}:number`,
        kind: "number",
        target: k,
        at: point,
        amount,
        delay: hold,
      });
    }
    setEffects((list) => [...list.filter((e) => !e.key.startsWith(`${damage.key}:`)), ...added]);
    timers.current.push(
      window.setTimeout(
        () => setEffects((list) => list.filter((e) => !added.includes(e))),
        hold + NUMBER_MS + 50,
      ),
    );
    spellHits.current = { ids: new Set(totals.keys()), delay: hold + SPELL_HIT_MS };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [damage, result, positions, viewerSeat]);

  /**
   * Phase 10 A-13 -- play a combat damage step's fights, after any still
   * playing (`hold`). Every part is an animation on the board's clock -- the
   * fighters' moves (on their cards, so their places can hold or Glide on
   * their own), the dimming, the caption, the slash marks and numbers -- so a
   * click hurries all of it together and nothing waits on a timer.
   */
  function playFights(
    plan: FightPlan,
    hold: number,
    standOf: (id: string) => Stand | null,
    lifeOf: (seat: number) => Point,
    g: Geometry,
  ) {
    const root = ref.current!;
    const total = hold + plan.total;
    // Any dead from an older wave have long been handed to their ghosts.
    fightGhosts.current.clear();
    // Spec 0067 -- what the older fights have still to land on a plate,
    // read before their clock goes.
    const carried = lifeStillPlaying();
    fightClock.current?.cancel();
    const clock = root.animate([{ opacity: 1 }, { opacity: 1 }], {
      duration: total,
      id: "fight-clock",
    });
    fightClock.current = clock;
    // Spec 0067, item 1 -- the plates step at each blow on this clock (a
    // hurry or a slowed clock keeps them with the slashes), and settle on
    // the board's life when it ends.
    startLifeSteps(
      () => Number(clock.currentTime ?? total),
      [...carried, ...lifeSteps(plan, hold)],
    );
    // The fights over (or hurried to their end): everyone goes home.
    clock.onfinish = () => {
      if (fightClock.current === clock) {
        endLifeSteps();
        setReleased(plan.key);
      }
    };
    clock.oncancel = () => {
      if (fightClock.current === clock) endLifeSteps();
    };
    const alive = new Set(items.map((item) => item.id));
    for (const [item] of plan.fighters) {
      const stand = standOf(item);
      if (!stand) continue;
      const frames = fighterFrames(plan, item, stand.box, !alive.has(item));
      if (!alive.has(item)) {
        // It died: its ghost fights, then shatters (A-04) after the beat.
        const fight = plan.fights[plan.fighters.get(item)!]!;
        fightGhosts.current.set(item, {
          frames,
          duration: plan.total,
          delay: hold,
          shatterAt: hold + fight.shatterAt,
        });
        continue;
      }
      const slot = elements.current.get(item);
      const card = slot?.querySelector<HTMLElement>(":scope > .bf-card");
      if (!slot || !card || typeof card.animate !== "function") continue;
      card.animate(frames, {
        duration: plan.total,
        delay: hold,
        easing: "linear",
        id: "fight",
      });
      // Above the dimming while the fights play.
      slot.animate([{ zIndex: Z_FIGHT }, { zIndex: Z_FIGHT }], {
        duration: plan.total,
        delay: hold,
        id: "fight",
      });
    }
    const k = plan.speed;
    const added: FightMark[] = [];
    const key = (what: string) => `${plan.key}:${what}`;
    const dimIn = (FIGHT_FOCUS_MS * k) / plan.total;
    const dimOut = 1 - (FIGHTS_FADE_MS * k) / plan.total;
    added.push({
      key: key("dim"),
      kind: "dim",
      style: { zIndex: Z_FIGHT_DIM },
      frames: [
        { offset: 0, opacity: 0 },
        { offset: Math.min(dimIn, 0.5), opacity: FIGHT_DIM },
        { offset: Math.max(dimOut, 0.5), opacity: FIGHT_DIM },
        { offset: 1, opacity: 0 },
      ],
      duration: plan.total,
      delay: hold,
    });
    const slashMs = SLASH_MS * k;
    const numberMs = SLASH_NUMBER_MS * k;
    plan.fights.forEach((fight, n) => {
      const length = Math.max(1, fight.end - fight.start);
      added.push({
        key: key(`caption:${n}`),
        kind: "caption",
        style: {
          left: g.play.x + g.inset * 4,
          top: g.height * 0.1 + g.inset,
          fontSize: Math.max(13, g.cardH * 0.13),
        },
        frames: [
          { offset: 0, opacity: 0 },
          { offset: Math.min(0.15, 200 / length), opacity: 1 },
          { offset: 0.88, opacity: 1 },
          { offset: 1, opacity: 0 },
        ],
        duration: length,
        delay: hold + fight.start,
        text: fight.caption,
        of: fight.attacker,
      });
      // Sparks where they meet.
      const spark = g.cardW * 0.8;
      added.push({
        key: key(`hit:${n}`),
        kind: "hit",
        style: {
          left: fight.contact.x - spark / 2,
          top: fight.contact.y - spark / 2,
          width: spark,
          height: spark,
        },
        frames: [
          { offset: 0, opacity: 0, transform: "scale(0.3)" },
          { offset: 0.3, opacity: 1, transform: "scale(1.1)" },
          { offset: 1, opacity: 0, transform: "scale(1.6)" },
        ],
        duration: 420 * k,
        delay: hold + fight.impact,
        of: fight.attacker,
      });
      for (const strike of fight.strikes) {
        const box = strike.box;
        if (box) {
          // Three glowing slash marks across the card it strikes.
          for (let i = 0; i < 3; i++) {
            added.push({
              key: key(`slash:${n}:${strike.target}:${i}`),
              kind: "slash",
              style: {
                left: box.x + (0.083 + i * 0.146) * box.w,
                top: box.y + (0.164 + i * 0.194) * box.h,
                width: box.w * 1.17,
                height: Math.max(3, box.h * 0.037),
              },
              frames: [
                { offset: 0, opacity: 1, transform: "rotate(32deg) scaleX(0)" },
                { offset: 0.35, opacity: 1, transform: "rotate(32deg) scaleX(1)" },
                { offset: 1, opacity: 0, transform: "rotate(32deg) scaleX(1)" },
              ],
              duration: slashMs,
              delay: hold + strike.at + i * SLASH_GAP_MS * k,
              of: strike.target,
              deathtouch: strike.deathtouch,
            });
          }
        }
        const at = box ? { x: box.x + box.w / 2, y: box.y + box.h * 0.12 } : strike.point!;
        if (!box && strike.point) {
          // At the player: a slash across the plate, and their hurt shown --
          // the screen's red edge for you, a red glow on their plate for them.
          const p = strike.point;
          added.push({
            key: key(`slash:${n}:${strike.target}`),
            kind: "slash",
            style: {
              left: p.x - g.cardW * 0.55,
              top: p.y - g.cardH * 0.12,
              width: g.cardW * 1.1,
              height: Math.max(3, g.cardH * 0.037),
            },
            frames: [
              { offset: 0, opacity: 1, transform: "rotate(20deg) scaleX(0)" },
              { offset: 0.35, opacity: 1, transform: "rotate(20deg) scaleX(1)" },
              { offset: 1, opacity: 0, transform: "rotate(20deg) scaleX(1)" },
            ],
            duration: slashMs,
            delay: hold + strike.at,
            of: strike.target,
          });
          // A spectator is nobody: every hurt player's plate glows.
          const you = !viewerName && strike.target === `player:${viewerSeat}`;
          const ring = LIFE_R * g.height * 3.2;
          added.push({
            key: key(`hurt:${n}:${strike.target}`),
            kind: you ? "edge" : "plate",
            style: you
              ? {}
              : { left: p.x - ring / 2, top: p.y - ring / 2, width: ring, height: ring },
            frames: [
              { offset: 0, opacity: 0 },
              { offset: 0.2, opacity: 0.9 },
              { offset: 1, opacity: 0 },
            ],
            duration: HURT_EDGE_MS * k,
            delay: hold + strike.at,
            of: strike.target,
          });
        }
        added.push({
          key: key(`number:${n}:${strike.target}`),
          kind: "number",
          style: { left: at.x, top: at.y, fontSize: g.cardH * 0.3 },
          frames: [
            {
              offset: 0,
              opacity: 0,
              transform: "translate(-50%, -50%) translateY(-30%) scale(2.2)",
            },
            { offset: 0.18, opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
            {
              offset: 0.8,
              opacity: 1,
              transform: "translate(-50%, -50%) translateY(-6%) scale(1)",
            },
            { offset: 1, opacity: 0, transform: "translate(-50%, -50%) translateY(-14%) scale(1)" },
          ],
          duration: numberMs,
          delay: hold + strike.at,
          text: `−${strike.amount}`,
          of: strike.target,
        });
      }
      // Lifelink: the life rises as the slash lands.
      [...fight.gains, ...(n === plan.fights.length - 1 ? plan.unsourced : [])].forEach(
        (gain, i) => {
          const p = lifeOf(gain.player);
          added.push({
            key: key(`gain:${n}:${gain.player}:${i}`),
            kind: "gain",
            style: { left: p.x, top: p.y, fontSize: g.cardH * 0.24 },
            frames: [
              { offset: 0, opacity: 0, transform: "translate(-50%, -20%) scale(0.8)" },
              { offset: 0.2, opacity: 1, transform: "translate(-50%, -50%) scale(1.1)" },
              { offset: 0.8, opacity: 1, transform: "translate(-50%, -90%) scale(1)" },
              { offset: 1, opacity: 0, transform: "translate(-50%, -120%) scale(1)" },
            ],
            duration: numberMs,
            delay: hold + gain.at,
            text: `+${gain.amount}`,
            of: `player:${gain.player}`,
          });
        },
      );
    });
    setMarks((list) => [...list, ...added]);
  }

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
    // Phase 10 A-17 -- every attached card's tab, now.
    const tabs = new Map<string, Tab>();
    for (const slot of result.slots) {
      slot.attached.forEach((id, i) => {
        const card = byId.get(id);
        if (!card) return;
        tabs.set(id, {
          box: tabBox(slot.box, i, slot.attached.length, g),
          host: slot.ids[0]!,
          drawn: {
            name: card.name,
            look: lookOf(card.kind, card.types),
            type: shortType(card.types),
            pt: "",
            art: card.art ? artUrl(card.art) : null,
            crop: card.crop ? artUrl(card.crop) : null,
            faceDown: card.faceDown,
            known: card.known,
            side: card.seat === viewerSeat ? "viewer" : "opponent",
            table: true,
          },
        });
      });
    }
    const centre = (box: Box) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
    const chains: { key: string; from: Point; to: Point }[] = [];
    const arriving: string[] = [];
    const before = previous.current;
    const resized =
      before !== null && (before.viewport.width !== g.width || before.viewport.height !== g.height);
    const still = reducedMotion();
    // Phase 10 A-13: while fights play, everything else that moves waits for
    // them (held where it was), then goes -- the survivors home with the rest.
    const hold = still ? 0 : holdLeft();
    // Phase 10 A-11/A-12: who attacks and who blocks, now.
    const roles = new Map<string, "attack" | "block">();
    for (const item of items) {
      const card = byId.get(item.id);
      if (card?.attacking) roles.set(item.id, "attack");
      else if (card?.blocking) roles.set(item.id, "block");
    }
    // An attacker steps forward, a blocker glides up to face it: a little
    // slower than a Glide, each a beat after the one before.
    let stepping = 0;
    let facing = 0;
    const pace = (id: string): { delay: number; duration: number } => {
      const role = roles.get(id);
      if (!role || before?.roles.get(id) === role) return { delay: hold, duration: MOVE_MS };
      return role === "attack"
        ? { delay: hold + ATTACK_BEAT_MS * stepping++, duration: ATTACK_MS }
        : { delay: hold + BLOCK_BEAT_MS * facing++, duration: BLOCK_MS };
    };

    if (resized && cardsRef.current) {
      // A new window size is not a move: everything goes straight there.
      // Forcing a style pass with transitions off makes it so.
      cardsRef.current.dataset.instant = "true";
      void cardsRef.current.offsetWidth;
      delete cardsRef.current.dataset.instant;
    }

    if (before && !resized && !still) {
      // Phase 10 A-14 (owner 2026-11-06, Amendment 17): back to a hand, onto
      // or into a library -- "D · Lift and glide". The tag at the
      // destination (and, shuffled in, the riffle) once it has landed: one
      // per destination, however many cards went there together.
      const returning: ReturnMark[] = [];
      const tagged = new Set<string>();
      const markReturn = (id: string, ret: Return, landing: Box, origin: Point, delay: number) => {
        const key = `${ret.zone}:${ret.side}:${ret.where ?? ""}`;
        if (tagged.has(key)) return;
        tagged.add(key);
        const stamp = `${key}:${id}:${performance.now()}`;
        let land = delay + RETURN_MS;
        if (ret.zone === "library") {
          const pile = where[`${ret.side}:library`];
          if (ret.where === "shuffled") {
            const w = g.cardW * AT_ZONE_SCALE;
            const h = g.cardH * AT_ZONE_SCALE;
            for (let i = 0; i < RIFFLE_CARDS; i++) {
              returning.push({
                key: `riffle:${stamp}:${i}`,
                kind: "riffle",
                style: { left: pile.x, top: pile.y, width: w, height: h },
                frames: riffleFrames(i, h / 56),
                duration: RIFFLE_MS,
                delay: land + i * RIFFLE_BEAT_MS,
                of: id,
              });
            }
            land += RIFFLE_MS + (RIFFLE_CARDS - 1) * RIFFLE_BEAT_MS;
          }
          returning.push({
            key: `tag:${stamp}`,
            kind: "tag",
            // To the left of the plate's library, as the canvas puts it.
            style: { left: g.rail.x - g.cardH * 0.06, top: pile.y },
            frames: returnTagFrames("translate(-100%, -50%)"),
            duration: RETURN_TAG_MS,
            delay: land,
            text: returnTag(ret, opponentName, viewerName),
            of: id,
          });
          return;
        }
        // Over the viewer's hand, under the other player's (it hangs from the top).
        const hand = where[`${ret.side}:hand`];
        const mine = ret.side === "viewer";
        returning.push({
          key: `tag:${stamp}`,
          kind: "tag",
          style: {
            left: centreOf(landing, origin).x,
            top: mine
              ? hand.y - g.cardH / 2 - g.cardH * 0.06
              : hand.y + g.cardH / 2 + g.cardH * 0.06,
          },
          frames: returnTagFrames(mine ? "translate(-50%, -100%)" : "translate(-50%, 0%)"),
          duration: RETURN_TAG_MS,
          delay: land,
          text: returnTag(ret, opponentName, viewerName),
          of: id,
        });
      };
      // A card going into the other player's hidden hand becomes the hand's
      // new card back on the way: the back flies the same path, fading in as
      // the card fades out, so it lands as a card of that hand (no pop).
      // Each such card, in the record's order, to each new back.
      const newBacks = items.filter(
        (item) => !before.mounted.has(item.id) && item.id.startsWith("hidden-hand:"),
      );
      const handOver = new Map<string, Item>();
      const flights = new Map<string, { from: Box; origin: Point; delay: number }>();
      for (const [id, ret] of returns ?? []) {
        if (ret.zone !== "hand" || !ret.hidden || newBacks.length === 0) continue;
        // On the table as itself, or in a pile (its look is the pile's).
        const look = before.drawn.get(before.itemOf.get(id) ?? id);
        const onTable = look?.table ? before.at.get(id) : undefined;
        const onStack = onTable ? undefined : before.stack.find((e) => e.s.card === id);
        if (!onTable && !onStack) continue;
        const back = newBacks.shift()!;
        const struck = spellHits.current?.ids.has(id) ? spellHits.current.delay : 0;
        handOver.set(id, back);
        flights.set(
          back.id,
          onTable
            ? { from: onTable.box, origin: onTable.origin, delay: Math.max(hold, struck) }
            : { from: onStack!.box, origin: { x: 0, y: 0 }, delay: hold },
        );
      }
      for (const item of items) {
        if (before.mounted.has(item.id)) continue; // the same element: CSS glides it
        // The cast card is flying onto it: it appears where that lands.
        if (item.id === flyingOnto && item.ids.length === 1) continue;
        const element = elements.current.get(item.id);
        if (!element || typeof element.animate !== "function") continue;
        // A-14: the other player's new card back, taking over a card going there.
        const flight = flights.get(item.id);
        if (flight) {
          glide(
            element,
            returnFrames(flight.from, item.box, g.cardW, g.cardH, flight.origin, item.origin, "in"),
            flight.delay,
            RETURN_MS,
          );
          continue;
        }
        // A new element: from wherever the object was drawn before (a
        // pile it left, the hand), or else from its zone in the rail.
        const was = before.at.get(item.id);
        const fromStack = was ? undefined : before.stack.find((e) => e.s.card === item.id);
        // A-17: off its tab (Equipment left behind by a host that went).
        const offTab = before.tabs.get(item.id);
        // Phase 10 A-00: Glide, from wherever it was drawn.
        const fromBox = offTab
          ? offTab.box
          : was
            ? was.box
            : fromStack
              ? fromStack.box
              : boxAt(where[arrivals?.get(item.id) ?? "stack"], g);
        const fromOrigin = was && !offTab ? was.origin : item.origin;
        // A-14: back to a hand it can be seen in, from the table (out of a
        // pile) or the stack (a spell returned): it lifts and glides there.
        const back = returns?.get(item.id);
        if (back?.zone === "hand" && (was || fromStack) && !offTab) {
          glide(
            element,
            returnFrames(fromBox, item.box, g.cardW, g.cardH, fromOrigin, item.origin),
            hold,
            RETURN_MS,
          );
          markReturn(item.id, back, item.box, item.origin, hold);
          continue;
        }
        const { delay, duration } = pace(item.id);
        glide(
          element,
          glideFrames(fromBox, item.box, g.cardW, g.cardH, fromOrigin, item.origin, {
            from: was ? 1 : 0.2,
            to: 1,
          }),
          delay,
          duration,
        );
      }
      const stackNow = new Set((stack ?? []).map((s) => s.id));
      const pulls: { key: string; from: Point; to: Point }[] = [];
      const flips: Ghost[] = [];
      // Phase 10 A-10 -- the cards merged into a permanent this update, each
      // played by its merge (not a Glide to exile, not a stack card resolving).
      const merged = new Set<string>();
      const fused: Fusion[] = [];
      // Phase 10 A-00 -- the same card, somewhere new (a tap, a row
      // re-centring, a stolen creature crossing the table): Glide there,
      // not the old straight CSS slide. A pointed-at hand card rising is
      // not a journey: its quick CSS settle stays.
      // Spec 0072, item 1 -- the other player cast from their hidden hand:
      // the back at `handLeft` rose to the middle (the casting card starts
      // there), so each back after it takes the place of the one after it
      // and the fan closes on the gap -- not its last back vanishing.
      const isBack = (id: string) => id.startsWith("hidden-hand:");
      const gap =
        handLeft !== null &&
        [...before.mounted].filter(isBack).length === items.filter((i) => isBack(i.id)).length + 1
          ? handLeft
          : null;
      const wasAt = (id: string) => {
        if (gap !== null && isBack(id)) {
          const [, seat, index] = id.split(":");
          if (Number(index) >= gap)
            return before.at.get(`hidden-hand:${seat}:${Number(index) + 1}`);
        }
        return before.at.get(id);
      };
      for (const item of items) {
        if (!before.mounted.has(item.id)) continue;
        const was = wasAt(item.id);
        if (!was) continue;
        // A-10 (owner 2026-11-06, Amendment 13): two cards become one -- the
        // table dims, both are pulled together and slam at the merged card's
        // spot, a flash with sparks and a ring, and the merged card rises
        // out of the light and settles. Its new face is NOT also flipped
        // (A-09), and its partner does not also Glide to exile or resolve.
        // Once per board: pointing at a card re-runs this, and must not merge again.
        const merge = merges !== playedMerges.current ? merges?.get(item.id) : undefined;
        const oldLook = before.drawn.get(item.id);
        const host = elements.current.get(item.id);
        if (merge && item.drawn.table && oldLook && host && typeof host.animate === "function") {
          const colour = MERGE_COLOUR[merge.kind];
          const moving = host.getAnimations?.().some((a) => a.playState === "running") ?? false;
          const start = moving ? placedNow(host) : null;
          if (moving) for (const a of host.getAnimations()) if (a.id !== "fight") a.cancel();
          // Above the dimmed table while it runs; its own place after.
          host.style.zIndex = String(Z_MERGE + 1);
          const run = host.animate(
            mergeFrames("new", was.box, item.box, g.cardW, g.cardH, item.origin, colour, start),
            { duration: MERGE_MS, easing: "linear" },
          );
          const settled = () => {
            host.style.zIndex = host.dataset["z"] ?? "";
          };
          run.onfinish = settled;
          run.oncancel = settled;
          // Its old face, pulled in from where it was, gone at the slam.
          flips.push({
            ...oldLook,
            id: `merge:${item.id}`,
            box: was.box,
            origin: item.origin,
            to: item.box,
            toOrigin: item.origin,
            fade: false,
            delay: 0,
            zIndex: Z_MERGE,
            merge: { part: "old", colour, start },
          });
          for (const partner of merge.partners) {
            const onTable = before.at.get(partner);
            const looks = before.drawn.get(partner);
            const onStack = before.stack.find((e) => e.s.card === partner);
            if (onTable && looks) {
              // A meld partner, from its place on the table.
              flips.push({
                ...looks,
                id: partner,
                ...onTable,
                to: item.box,
                toOrigin: onTable.origin,
                fade: false,
                delay: 0,
                zIndex: Z_MERGE - 1,
                merge: { part: "partner", colour, start: null },
              });
            } else if (onStack) {
              // A mutating spell, from its place on the stack, as it looked there.
              const s = onStack.s;
              const side = s.seat === undefined || s.seat === viewerSeat ? "viewer" : "opponent";
              const whole =
                onStack.box.scale >= STACK_READ_SCALE && !!s.art && s.name !== "Face-down";
              flips.push({
                name: s.name,
                look: "artifact",
                type: STACK_KIND[s.kind ?? "spell"] ?? "Spell",
                pt: "",
                art: s.art ? artUrl(s.art) : null,
                crop: s.crop ? artUrl(s.crop) : null,
                faceDown: s.name === "Face-down",
                known: false,
                cost: s.manaCost ?? null,
                side,
                id: s.id,
                box: onStack.box,
                origin: { x: 0, y: 0 },
                to: item.box,
                toOrigin: { x: 0, y: 0 },
                fade: false,
                delay: 0,
                stack: whole
                  ? {
                      low: artUrl(s.art!),
                      high: closeUpOf(artUrl(s.art!)),
                      kind: STACK_KIND[s.kind ?? "spell"] ?? "Spell",
                      does: s.does ?? null,
                      whose: side === "viewer" ? " bf-stack-mine" : " bf-stack-theirs",
                    }
                  : undefined,
                zIndex: Z_MERGE - 1,
                merge: { part: "partner", colour, start: null },
              });
            }
            merged.add(partner);
          }
          fused.push({
            key: `merge:${item.id}:${performance.now()}`,
            kind: merge.kind,
            at: centreOf(item.box, item.origin),
            size: g.cardW * item.box.scale,
          });
          continue;
        }
        // A-09: a card that changed form -- transformed, day or night, turned
        // face up -- lifts, flips over in the air and settles: its old face a
        // ghost turning away, the card itself turning round.
        const oldFace = before.drawn.get(item.id);
        if (
          item.drawn.table &&
          oldFace &&
          (oldFace.name !== item.drawn.name || oldFace.faceDown !== item.drawn.faceDown)
        ) {
          const card = elements.current
            .get(item.id)
            ?.querySelector<HTMLElement>(":scope > .bf-card");
          if (card && typeof card.animate === "function") {
            card.animate(flipFrames(g.cardH * item.box.scale, "in"), {
              duration: FLIP_MS,
              easing: "linear",
              fill: "backwards",
            });
            flips.push({
              ...oldFace,
              id: item.id,
              box: was.box,
              origin: was.origin,
              to: was.box,
              toOrigin: was.origin,
              fade: false,
              delay: 0,
              flip: true,
              zIndex: was.box.z + 1,
            });
          }
        }
        const same =
          Math.abs(was.box.x - item.box.x) < 0.5 &&
          Math.abs(was.box.y - item.box.y) < 0.5 &&
          Math.abs(was.box.scale - item.box.scale) < 0.001 &&
          was.box.rotation === item.box.rotation;
        if (same || item.id === pointed || before.pointed === item.id) continue;
        const element = elements.current.get(item.id);
        if (!element || typeof element.animate !== "function") continue;
        // Still gliding from the last board: set off from where it is now.
        const moving =
          element.getAnimations?.().some((a) => a.playState === "running" && a.id !== "fight") ??
          false;
        // Spec 0072: a back closing the gap sets off from the place of the
        // back after it (the CSS transition the new place just started says
        // nothing about that).
        // Spec 0072: a back closing the gap sets off from the place of the
        // back after it (the CSS transition the new place just started says
        // nothing about that).
        const start = moving && was === before.at.get(item.id) ? placedNow(element) : null;
        // A fight's moves are on its card, not its place: they play on.
        if (moving) for (const a of element.getAnimations()) if (a.id !== "fight") a.cancel();
        // A-14: off the table and back into a hand it can be seen in (yours,
        // or a card shown to you): the same card lifts and glides into its
        // place there -- a card of that hand, no pop.
        const goingBack = returns?.get(item.id);
        if (goingBack?.zone === "hand" && before.drawn.get(item.id)?.table && !item.drawn.table) {
          glide(
            element,
            returnFrames(
              was.box,
              item.box,
              g.cardW,
              g.cardH,
              was.origin,
              item.origin,
              "whole",
              start,
            ),
            hold,
            RETURN_MS,
          );
          markReturn(item.id, goingBack, item.box, item.origin, hold);
          continue;
        }
        // A-08: a permanent that changed sides is pulled across.
        const was_ = before.drawn.get(item.id);
        if (item.drawn.table && was_ && was_.side !== item.drawn.side) {
          const taker = before.stack.find(
            (entry) =>
              !stackNow.has(entry.s.id) &&
              entry.s.targets.some((t) => "object" in t && item.ids.includes(t.object)),
          );
          const from = taker
            ? { x: taker.box.x + taker.box.w / 2, y: taker.box.y + taker.box.h / 2 }
            : where[`${item.drawn.side}:life`];
          pulls.push({
            key: `${item.id}:${performance.now()}`,
            from,
            to: centreOf(was.box, was.origin),
          });
          glide(
            element,
            glideFrames(was.box, item.box, g.cardW, g.cardH, was.origin, item.origin, null, start, {
              arc: PULL_ARC,
              lean: PULL_LEAN,
            }),
            TETHER_MS + hold,
            PULL_MS,
          );
          element.classList.remove("bf-pulled");
          void element.offsetWidth;
          element.classList.add("bf-pulled");
          continue;
        }
        const { delay, duration } = pace(item.id);
        glide(
          element,
          glideFrames(was.box, item.box, g.cardW, g.cardH, was.origin, item.origin, null, start),
          delay,
          duration,
        );
      }
      if (flips.length > 0) setGhosts((list) => [...list, ...flips]);
      if (fused.length > 0) {
        setFusions((list) => [...list, ...fused]);
        timers.current.push(
          window.setTimeout(
            () => setFusions((list) => list.filter((f) => !fused.includes(f))),
            TETHERS_GONE_MS,
          ),
        );
      }
      if (pulls.length > 0) {
        setTethers((list) => [...list, ...pulls]);
        timers.current.push(
          window.setTimeout(
            () => setTethers((list) => list.filter((t) => !pulls.includes(t))),
            TETHERS_GONE_MS,
          ),
        );
      }
      // A card that no longer has an element of its own leaves as a ghost:
      // into the spot of the card it joined (a land into its pile), or,
      // gone from the board, toward its zone in the rail.
      const leaving: Ghost[] = [];
      const elementsNow = new Set(items.map((item) => item.id));
      // A-14: one card going back to a hidden hand or a library, as a ghost.
      const returnGhost = (
        id: string,
        ret: Return,
        d: Drawn,
        at: { box: Box; origin: Point },
        delay: number,
      ) => {
        const back = handOver.get(id);
        const to = back ? back.box : boxAt(where[`${ret.side}:${ret.zone}`], g);
        const toOrigin = back ? back.origin : at.origin;
        leaving.push({
          ...d,
          id,
          ...at,
          to,
          toOrigin,
          fade: false,
          delay,
          returning: { zone: ret.zone, seen: back ? "out" : "sink", back: !back && ret.hidden },
        });
        markReturn(id, ret, to, toOrigin, delay);
      };
      for (const [id, d] of before.drawn) {
        if (elementsNow.has(id) || merged.has(id)) continue;
        // Spec 0072: the back that rose to the middle is the casting card now
        // (the fan closed on it, above): no ghost of it leaves for a pile.
        if (gap !== null && isBack(id)) continue;
        const at = before.at.get(id);
        if (!at) continue;
        const joined = now.get(id);
        // Phase 10 A-13: killed in a fight -- it fights, then shatters after
        // the beat; anything else leaving waits for the fights to end.
        const fought = fightGhosts.current.get(id);
        fightGhosts.current.delete(id);
        const elapsed = Number(fightClock.current?.currentTime ?? 0);
        const struck = spellHits.current?.ids.has(id) ? spellHits.current.delay : 0;
        const delay = fought ? Math.max(0, fought.shatterAt - elapsed) : Math.max(hold, struck);
        const fight = fought
          ? { frames: fought.frames, duration: fought.duration, delay: fought.delay - elapsed }
          : undefined;
        const dest = departures?.get(id) ?? `${d.side}:graveyard`;
        // A-14: back into the other player's hidden hand, or onto or into a
        // library: it lifts and glides there, turning face down on the way
        // -- handing over to the hand's new card back, or sinking into the
        // library pile.
        const ret = returns?.get(id);
        if (ret && d.table && !joined) {
          returnGhost(id, ret, d, at, delay);
          continue;
        }
        // Phase 10 A-04/A-05 (owner 2026-11-06): a permanent leaving the
        // table for a graveyard was defeated (Shatter); for exile, banished.
        const fate: Fate | undefined =
          joined || !d.table
            ? undefined
            : dest.endsWith(":graveyard")
              ? "defeated"
              : dest.endsWith(":exile")
                ? "exiled"
                : undefined;
        // A-17: equipped -- chained into its tab on the host.
        const into = tabs.get(id);
        if (into && !before.tabs.has(id)) {
          chains.push({
            key: `chain:${id}:${performance.now()}`,
            from: centre(at.box),
            to: centre(into.box),
          });
          arriving.push(id);
          leaving.push({
            ...d,
            id,
            ...at,
            to: into.box,
            toOrigin: at.origin,
            fade: false,
            delay: TETHER_MS,
            chained: true,
          });
          continue;
        }
        leaving.push(
          joined
            ? { ...d, id, ...at, to: joined.box, toOrigin: joined.origin, fade: false, delay }
            : {
                ...d,
                id,
                ...at,
                to: boxAt(where[dest], g),
                toOrigin: at.origin,
                fade: true,
                delay,
                fate,
                ...(fight ? { fight, zIndex: Z_FIGHT + 1 } : {}),
              },
        );
      }
      // A-14: a card going back out of a pile (Hallowed Burial's Bears from
      // a pile of five) has no element of its own -- only the pile's count
      // changed. Each leaves as its own ghost from the pile, in its look.
      for (const [id, ret] of returns ?? []) {
        if (before.drawn.has(id) || now.has(id) || merged.has(id)) continue;
        const lead = before.itemOf.get(id);
        const look = lead ? before.drawn.get(lead) : undefined;
        const at = before.at.get(id);
        if (!look?.table || !at) continue;
        const struck = spellHits.current?.ids.has(id) ? spellHits.current.delay : 0;
        returnGhost(id, ret, look, at, Math.max(hold, struck));
      }
      // A-17: a tab that moved to another host (Equipment re-equipped) is
      // chained across; one whose card left the table (an Aura with its
      // creature) goes as any permanent leaving does, from its tab.
      for (const [id, was] of before.tabs) {
        const nowTab = tabs.get(id);
        if (nowTab && nowTab.host !== was.host) {
          chains.push({
            key: `chain:${id}:${performance.now()}`,
            from: centre(was.box),
            to: centre(nowTab.box),
          });
          arriving.push(id);
          leaving.push({
            ...was.drawn,
            id,
            box: was.box,
            origin: { x: 0.5, y: 0.5 },
            to: nowTab.box,
            toOrigin: { x: 0.5, y: 0.5 },
            fade: false,
            delay: TETHER_MS,
            chained: true,
          });
          continue;
        }
        if (nowTab || now.has(id)) continue;
        const dest = departures?.get(id) ?? `${was.drawn.side}:graveyard`;
        leaving.push({
          ...was.drawn,
          id,
          box: was.box,
          origin: { x: 0.5, y: 0.5 },
          to: boxAt(where[dest], g),
          toOrigin: { x: 0.5, y: 0.5 },
          fade: true,
          delay: 0,
          fate: dest.endsWith(":graveyard")
            ? "defeated"
            : dest.endsWith(":exile")
              ? "exiled"
              : undefined,
        });
      }
      // A-07: several leaving the table at once is a board wipe -- a pale
      // flash sweeps the table first, then they all go together.
      if (leaving.filter((ghost) => ghost.fate && !ghost.fight).length >= WIPE_AT) {
        setSweep(performance.now());
        for (const ghost of leaving) if (ghost.fate) ghost.delay = Math.max(ghost.delay, SWEEP_MS);
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
        if (stillThere.has(s.id) || (s.card && merged.has(s.card))) continue;
        // A-17: an Aura resolving onto its creature is chained into its tab.
        const ontoTab = s.card ? tabs.get(s.card) : undefined;
        if (s.card && ontoTab && !before.tabs.has(s.card)) {
          chains.push({
            key: `chain:${s.card}:${performance.now()}`,
            from: centre(box),
            to: centre(ontoTab.box),
          });
          arriving.push(s.card);
          gone.push({
            ...ontoTab.drawn,
            id: s.id,
            box,
            origin: { x: 0, y: 0 },
            to: ontoTab.box,
            toOrigin: { x: 0, y: 0 },
            fade: false,
            delay: TETHER_MS,
            chained: true,
            zIndex: Z_LINES - 50,
          });
          continue;
        }
        if (s.card && now.has(s.card)) continue;
        const side = s.seat === undefined || s.seat === viewerSeat ? "viewer" : "opponent";
        const centreBox = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
        // A-14: a spell sent back -- onto a library (Memory Lapse), into the
        // other player's hidden hand -- did not resolve: no spark, no glow
        // first; it lifts off the stack and glides there, turning face down.
        const ret = s.card ? returns?.get(s.card) : undefined;
        const handBack = s.card ? handOver.get(s.card) : undefined;
        const retTo = ret
          ? handBack
            ? handBack.box
            : boxAt(where[`${ret.side}:${ret.zone}`], g)
          : null;
        const retOrigin = handBack ? handBack.origin : { x: 0, y: 0 };
        if (ret && retTo) markReturn(s.card!, ret, retTo, retOrigin, hold);
        for (const t of ret ? [] : s.targets) {
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
        const whole = box.scale >= STACK_READ_SCALE && !!s.art && s.name !== "Face-down";
        gone.push({
          name: s.name,
          look: "artifact",
          type: STACK_KIND[s.kind ?? "spell"] ?? "Spell",
          pt: "",
          art: s.art ? artUrl(s.art) : null,
          crop: s.crop ? artUrl(s.crop) : null,
          faceDown: s.name === "Face-down",
          known: false,
          cost: s.manaCost ?? null,
          side,
          id: s.id,
          box,
          origin: { x: 0, y: 0 },
          to: retTo ?? (into ? into.box : boxAt(where[`${side}:graveyard`], g)),
          toOrigin: ret ? retOrigin : into ? into.origin : { x: 0, y: 0 },
          fade: !ret,
          delay: ret ? hold : RESOLVE_MS + hold,
          ...(ret
            ? {
                returning: {
                  zone: ret.zone,
                  seen: handBack ? ("out" as const) : ("sink" as const),
                  back: !handBack && ret.hidden,
                },
              }
            : {}),
          stack: whole
            ? {
                low: artUrl(s.art!),
                high: closeUpOf(artUrl(s.art!)),
                kind: STACK_KIND[s.kind ?? "spell"] ?? "Spell",
                does: s.does ?? null,
                whose: side === "viewer" ? " bf-stack-mine" : " bf-stack-theirs",
              }
            : undefined,
          zIndex: Z_LINES - 50,
        });
      }
      // Spec 0061, item 4 -- why each card went to a graveyard: a tag rides
      // above it there (the table's, the hand's and the stack's cards), stays
      // a moment by the pile, and goes.
      if (graves && graves.size > 0) {
        const tagGrave = (card: string, ghost: Ghost, lead: number, move: number, side: Side) => {
          const said = graves.get(card);
          if (!said) return;
          const top = centreOf(ghost.box, ghost.origin);
          const from = { x: top.x, y: top.y - (g.cardH * ghost.box.scale) / 2 - g.cardH * 0.04 };
          const pile = where[`${side}:graveyard`];
          const to = { x: g.rail.x - g.cardH * 0.06, y: pile.y };
          const { frames, duration } = graveTagFrames(to.x - from.x, to.y - from.y, lead, move);
          returning.push({
            key: `grave:${card}:${performance.now()}`,
            kind: "tag",
            style: { left: from.x, top: from.y },
            frames,
            duration,
            delay: ghost.delay,
            text: said,
            of: card,
            grave: true,
          });
        };
        for (const ghost of leaving) {
          if (!ghost.fade || ghost.returning || ghost.chained) continue;
          tagGrave(ghost.id, ghost, ghost.fate ? fateMs(ghost.fate) : 0, MOVE_MS, ghost.side);
        }
        for (const ghost of gone) {
          if (!ghost.fade || ghost.chained) continue;
          const card = before.stack.find((entry) => entry.s.id === ghost.id)?.s.card;
          if (card) tagGrave(card, ghost, 0, MOVE_MS, ghost.side);
        }
      }
      if (gone.length > 0) setGhosts((list) => [...list, ...gone]);
      if (returning.length > 0) setReturnMarks((list) => [...list, ...returning]);
      if (chains.length > 0) {
        setTethers((list) => [...list, ...chains]);
        timers.current.push(
          window.setTimeout(
            () => setTethers((list) => list.filter((t) => !chains.includes(t))),
            TETHERS_GONE_MS,
          ),
        );
      }
      // The tab shows as its card lands, with a glow; the host pulses.
      for (const id of arriving) {
        const tab = cardsRef.current?.querySelector<HTMLElement>(`.bf-tag[data-object-id="${id}"]`);
        if (tab) {
          tab.classList.remove("bf-tab-arrive");
          void tab.offsetWidth;
          tab.classList.add("bf-tab-arrive");
        }
        const host = tab?.closest<HTMLElement>(".bf-slot");
        if (host) {
          host.classList.remove("bf-clink");
          void host.offsetWidth;
          host.classList.add("bf-clink");
        }
      }
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

    const spots = stackSpotBoxes(g, (stack ?? []).length, stackScale);
    playedMerges.current = merges;
    const itemOf = new Map<string, string>();
    const members = new Map<string, number>();
    for (const item of items) {
      for (const id of item.ids) itemOf.set(id, item.id);
      members.set(
        item.id,
        item.ids.filter((id) => byId.has(id) && !byId.get(id)!.attachedTo).length || 1,
      );
    }
    previous.current = {
      pointed,
      tabs,
      itemOf,
      members,
      cards: new Map(battlefield.map((card) => [card.id, card])),
      roles,
      viewport: { width: g.width, height: g.height },
      at: now,
      drawn,
      mounted: new Set(items.map((item) => item.id)),
      stack: (stack ?? []).slice(0, spots.length).map((s, i) => ({ s, box: spots[i]! })),
    };
  }, [
    items,
    result,
    byId,
    arrivals,
    departures,
    merges,
    returns,
    graves,
    opponentName,
    viewerName,
    stack,
    viewerSeat,
    artUrl,
    flyingOnto,
    handLeft,
    stackScale,
    pointed,
    battlefield,
  ]);

  // Phase 10 A-00 (owner, at lock and on the canvas): the player acts while
  // cards move -- a click, a key -- and what is moving finishes in a tenth
  // of a second. Never a snap, never a wait.
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const now = () => hurry(root);
    document.addEventListener("pointerdown", now, true);
    document.addEventListener("keydown", now, true);
    return () => {
      document.removeEventListener("pointerdown", now, true);
      document.removeEventListener("keydown", now, true);
    };
  }, []);

  // Spec 0063 -- a line that goes (the pointer leaves an attacker, a spell
  // resolves) fades out over LINE_OUT_MS instead of vanishing: after each
  // drawing, a copy of every line drawn is kept; one no longer drawn is
  // put back, fading, outside React's lines (with reduced motion asked
  // for, it just goes).
  const linesRef = useRef<SVGSVGElement>(null);
  const leavingRef = useRef<SVGGElement>(null);
  const lastLines = useRef(new Map<string, SVGGElement>());
  useLayoutEffect(() => {
    const now = new Map<string, SVGGElement>();
    for (const line of linesRef.current?.querySelectorAll<SVGGElement>(
      ":scope > [data-line], :scope > [data-swords]",
    ) ?? []) {
      now.set(line.dataset.key ?? "", line.cloneNode(true) as SVGGElement);
    }
    const out = leavingRef.current;
    if (out && !reducedMotion()) {
      for (const [key, line] of lastLines.current) {
        if (now.has(key)) continue;
        const swordsKey = line.getAttribute("data-swords");
        line.removeAttribute("data-line");
        line.removeAttribute("data-swords");
        line.setAttribute(
          swordsKey !== null ? "data-swords-leaving" : "data-line-leaving",
          swordsKey ?? line.dataset.key ?? "",
        );
        line.classList.add("bf-line-out");
        out.appendChild(line);
        timers.current.push(window.setTimeout(() => line.remove(), LINE_OUT_MS));
      }
    }
    lastLines.current = now;
  });

  if (!result) return <div ref={ref} className="bf-board" data-testid="battlefield" />;
  const g = result.geometry;
  const where = anchors(g);
  const sizes = effectSizes(g);

  // The lines (AMENDMENT 7): every end is a drawn object or a rail point.
  // Spec 0066 (A · Soft arc, replacing spec 0063's ride along the middle):
  // every arrow is one smooth curve that rises off the table and comes
  // down onto the top of what it points at. An attack leaves its
  // attacker's edge facing the middle (on its frame, never inside its
  // picture); a stack card's arrow leaves its stud.
  const middle = g.height / 2;
  const gap = TIP_GAP * g.cardH;
  const facing = (id: string): Port | null => {
    const p = positions.get(id);
    return p ? facingPort(p.box, p.origin, middle, 0, shownShare(result.slots, p.item)) : null;
  };
  // A life circle: the arc stops a hair off its rim, never over the total.
  const lifeR = LIFE_R * g.height;
  // Spec 0066: never across a player's picture, name or tiles.
  const plates = plateRects(g);
  const onto = (
    from: Port | null,
    to: TargetRef,
    clear?: { top: number; bottom: number },
    fromCard?: Box,
  ): Route | null => {
    if (!from) return null;
    // Spec 0069, item 3 -- a spell at a player: the beam onto that player's
    // life shield, one gentle arc from the stack card's best edge.
    if ("player" in to && fromCard)
      return beamToBanner(fromCard, playerPoint(to.player, viewerSeat, where), lifeR + gap);
    if ("player" in to)
      return arcToRing(
        from,
        playerPoint(to.player, viewerSeat, where),
        lifeR + gap,
        g.cardH,
        clear,
        plates,
      );
    const p = positions.get(to.object);
    return p ? arc(from, topOf(p.box, p.origin, gap), g.cardH, undefined, clear) : null;
  };
  // Spec 0069, item 1 -- an attack at a permanent: from the attacker's edge
  // facing the middle to the target's edge facing it, a soft S; it never
  // runs across the attacked card's face.
  const attackOnto = (attacker: string, target: string): Route | null => {
    const from = facing(attacker);
    const p = positions.get(target);
    if (!from || !p) return null;
    const to = facingPort(p.box, p.origin, middle, gap, 1);
    const ap = positions.get(attacker)!;
    // Face to face across the middle (a planeswalker straight above its
    // attacker): too close for a blade between them, so it swings out
    // round the side and comes in at the attacked card's side edge.
    if (
      Math.abs(to.at.x - from.at.x) < g.cardW * 0.9 &&
      Math.hypot(to.at.x - from.at.x, to.at.y - from.at.y) < g.cardH * 0.7
    ) {
      const side = to.at.x < g.width * 0.42 ? 1 : -1;
      const fx = side > 0 ? 1 : 0;
      const up = from.out.y;
      // From its side edge near the corner: never across its own name.
      const s0 = pointOn(ap.box, ap.origin, side > 0 ? 1 : 0, up < 0 ? 0.14 : 0.86);
      const e0 = pointOn(p.box, p.origin, fx, 0.55);
      const e = { x: e0.x + side * gap, y: e0.y };
      const reach = g.cardW * 0.9;
      return [
        {
          start: s0,
          c1: { x: s0.x + side * reach, y: s0.y + up * g.cardH * 0.08 },
          c2: { x: e.x + side * reach, y: e.y },
          end: e,
        },
      ];
    }
    const s = from.at;
    const e = to.at;
    const d = Math.max(g.cardH * 0.12, Math.hypot(e.x - s.x, e.y - s.y) * 0.4);
    return [
      {
        start: s,
        c1: { x: s.x + from.out.x * d, y: s.y + from.out.y * d },
        c2: { x: e.x + to.out.x * d, y: e.y + to.out.y * d },
        end: e,
      },
    ];
  };
  // The stack, drawn as cards at the right edge of the play area.
  const spot = stackSpotBoxes(g, (stack ?? []).length, stackScale);
  const spotBox = new Map((stack ?? []).slice(0, spot.length).map((s, i) => [s.id, spot[i]!]));
  // Spec 0066, item 2 -- a stack card's arrows leave its stud: a small gold
  // diamond on its left edge, at the picture (an arrow at a player too).
  const studOf = (index: number): Port | null => {
    const box = spot[index];
    return box
      ? { at: { x: box.x - box.h * 0.02, y: studY(spot, index, g.cardH) }, out: { x: -1, y: 0 } }
      : null;
  };
  const spotIndex = (id: string) =>
    (stack ?? []).slice(0, spot.length).findIndex((s) => s.id === id);
  // One line per DRAWN thing, not per object: a pile of 300 Goblin tokens
  // attacking is one card on the table, so it is one fire line (owner
  // report 2026-10-23: 300 lines, each blurred and fanned into its own
  // lane, buried the screen and stalled the page).
  const drawn = (id: string) => positions.get(id)?.item ?? id;
  const byKey = new Map<string, Line>();
  const add = (
    kind: LineKind,
    from: string,
    to: string,
    route: Route | null,
    aim?: { at: Point; r: number },
  ) => {
    if (!route) return;
    const key = `${kind}:${drawn(from)}:${to.startsWith("player:") ? to : drawn(to)}`;
    const same = byKey.get(key);
    if (same) same.count += 1;
    else byKey.set(key, { key, kind, from, to, route, count: 1, ...(aim ? { aim } : {}) });
  };
  // Spec 0069 -- where a pointer's ripple is: round a player's life shield
  // (never over the number); on a card, on its picture.
  const aimOf = (to: TargetRef, route: Route | null): { at: Point; r: number } | undefined => {
    if (!route) return undefined;
    if ("player" in to) return { at: playerPoint(to.player, viewerSeat, where), r: lifeR + gap };
    // On the card's picture, clear of its name and its type line.
    const p = positions.get(to.object);
    if (!p) return undefined;
    return { at: pointOn(p.box, p.origin, 0.5, 0.42), r: g.cardH * 0.1 };
  };
  // Spec 0037 — a blocked attacker hits its blockers, not the player.
  // Phase 10 A-12: a blocker standing facing its attacker needs no block
  // line to it (one blocking several has lines to the others).
  const blockedIds = new Set((combat?.blocks ?? []).map((b) => b.attacker));
  const faced = new Map<string, string>();
  for (const slot of result?.slots ?? []) {
    if (slot.faces) for (const id of slot.ids) faced.set(id, slot.faces);
  }
  for (const a of combat?.attackers ?? []) {
    // Spec 0059 item 9: no attack lines at rest; the one pointed at
    // (focused, tapped) draws its line. Spec 0066, item 4: a blocked one
    // has no arrow -- its fights are crossed swords.
    // Spec 0069: an attack at a planeswalker or battle shows all the time --
    // it is the unusual one, and the count at the player does not cover it.
    if (blockedIds.has(a.id)) continue;
    if ("player" in a.target && (aimed === null || drawn(a.id) !== aimed)) continue;
    // Owner 2026-11-09: an attack at a planeswalker or battle stops at the
    // edge of it that faces the attacker -- never across its card.
    add(
      "attack",
      a.id,
      refKey(a.target),
      "object" in a.target ? attackOnto(a.id, a.target.object) : onto(facing(a.id), a.target),
    );
  }
  // Spec 0069, item 6 (after spec 0066, item 4) -- one mark for each
  // fighting pair; where each goes is settled below.
  const swordsR = 11 * (g.cardW / 62) * 0.9;
  const swords: {
    key: string;
    attacker: string;
    blocker: string;
    at: Point;
    r: number;
    /** Where a facing blocker meets its attacker, to order the marks (spec 0069). */
    faced?: number;
    /** Four or more blockers, drawn as one mark with the number (spec 0069). */
    count?: number;
  }[] = [];
  // The y of a card's edge facing the middle, at x (tilt included).
  const edgeYAt = (id: string, x: number) => {
    const p = positions.get(id)!;
    const below = centreOf(p.box, p.origin).y > middle;
    const a = pointOn(p.box, p.origin, 0, below ? 0 : 1);
    const b = pointOn(p.box, p.origin, 1, below ? 0 : 1);
    return a.y + ((b.y - a.y) * (x - a.x)) / Math.max(1e-6, b.x - a.x);
  };
  const bounds = (id: string) => {
    const p = positions.get(id)!;
    const xs = [0, 1].map((fx) => pointOn(p.box, p.origin, fx, 0.5).x);
    return { x0: Math.min(...xs), x1: Math.max(...xs) };
  };
  for (const b of combat?.blocks ?? []) {
    if (!positions.has(b.attacker) || !positions.has(b.blocker)) continue;
    const key = `${drawn(b.attacker)}:${drawn(b.blocker)}`;
    if (swords.some((m) => m.key === key)) continue;
    if (faced.get(b.blocker) === drawn(b.attacker)) {
      const a = bounds(b.attacker);
      const d = bounds(b.blocker);
      const lo = Math.max(a.x0, d.x0);
      const hi = Math.min(a.x1, d.x1);
      const x = hi > lo ? (lo + hi) / 2 : (a.x0 + a.x1 + d.x0 + d.x1) / 4;
      const ya = edgeYAt(b.attacker, x);
      const yd = edgeYAt(b.blocker, x);
      swords.push({
        key,
        attacker: b.attacker,
        blocker: b.blocker,
        at: { x, y: (ya + yd) / 2 },
        r: Math.max(5, Math.min(swordsR, Math.abs(yd - ya) / 2 + 2)),
        faced: x,
      });
      continue;
    }
    const route = onto(facing(b.blocker), { object: b.attacker });
    add("block", b.blocker, b.attacker, route);
    if (route)
      swords.push({
        key,
        attacker: b.attacker,
        blocker: b.blocker,
        at: routeAt(route, 0.5),
        r: swordsR,
      });
  }
  // Spec 0069, item 6 (B4): one mark size, whatever the gap or how many
  // block. The marks of the blockers facing an attacker sit ON the attacker's
  // picture, in the band between its name (or its power line) on the side
  // facing them and its ATTACKING tag: never over a name, power, type line or
  // tag. One in the middle; two or three side by side, in the blockers'
  // left-to-right order; four or more are one mark in the middle, with the
  // number. A blocker not facing its attacker has its mark on its dotted bar.
  {
    const fixedR = g.cardW * 0.13;
    const byAttacker = new Map<string, typeof swords>();
    for (const m of swords) {
      if (m.faced === undefined) {
        m.r = fixedR;
        continue;
      }
      const list = byAttacker.get(m.attacker) ?? [];
      list.push(m);
      byAttacker.set(m.attacker, list);
    }
    for (const [attacker, list] of byAttacker) {
      const p = positions.get(attacker)!;
      const near = centreOf(p.box, p.origin).y > middle ? 0.27 : 0.73;
      if (list.length >= 4) {
        const one = list[0]!;
        one.at = pointOn(p.box, p.origin, 0.5, near);
        one.r = fixedR;
        one.count = list.length;
        for (const m of list.slice(1)) swords.splice(swords.indexOf(m), 1);
        continue;
      }
      list.sort((u, v) => u.faced! - v.faced!);
      list.forEach((m, i) => {
        const fx = list.length === 1 ? 0.5 : 0.2 + (0.6 * i) / (list.length - 1);
        m.at = pointOn(p.box, p.origin, fx, near);
        m.r = fixedR;
      });
    }
  }
  // Spec 0043: every object, a "×9" card counting nine.
  const stackTotal = (stack ?? []).reduce((n, s) => n + (s.count ?? 1), 0);
  const focus = stackFocus(stack, pointedOnStack ?? pointedStack);
  const shown = (stack ?? []).filter((s) => s.id === focus);
  // Spec 0066, item 1 -- the stack card whose arrows show, once it has arrived.
  let studAt = -1;
  for (const s of shown) {
    if (stackWaiting(s)) continue;
    // From the spell's own card on the stack (the last drawn one, for an
    // object further down than the cards shown): its stud.
    const index = spotBox.has(s.id) ? spotIndex(s.id) : spot.length - 1;
    const start: Port = studOf(index) ?? { at: where.stack, out: { x: -1, y: 0 } };
    // Spec 0066 (owner, 2026-11-08): never behind a stack card -- an arc
    // to a life circle beyond the stack goes round its cards and caption.
    const clear = spot[0]
      ? {
          top: Math.min(...spot.map((b) => b.y)) - g.cardH * 0.05,
          bottom: stackCaptionBottom(spot[0], g),
          // The caption: wider than the card, its right edge on the card's.
          captionLeft: spot[0].x + spot[0].w - Math.max(spot[0].w, g.cardW * 2.6),
          captionTop: spot[0].y + spot[0].h,
          // Each card's number and face badges, beside its name bar.
          badges: stackBadgeRects(spot, g.cardH),
        }
      : undefined;
    for (const t of s.targets) {
      // Spec 0069, item 4 -- something on the stack (a counterspell's
      // target): the ripple beside that stack card's name, left of its
      // badges, and the beam from this card's stud to it.
      const onStack = "object" in t && !positions.has(t.object) ? spotIndex(t.object) : -1;
      if (onStack >= 0) {
        const r = g.cardH * 0.1;
        const badge = stackBadgeRects(spot, g.cardH)[onStack]!;
        const at = { x: badge.x0 - r - gap * 2, y: (badge.y0 + badge.y1) / 2 };
        const end = ringEdge(at, start.at, r + gap);
        const d = Math.hypot(end.x - start.at.x, end.y - start.at.y) * 0.5;
        add(
          "target",
          s.id,
          refKey(t),
          [
            {
              start: start.at,
              c1: { x: start.at.x - d, y: start.at.y },
              c2: { x: end.x - d * 0.35, y: end.y + (start.at.y - end.y) * 0.45 },
              end,
            },
          ],
          { at, r },
        );
        continue;
      }
      const route = onto(start, t, clear, spot[index]);
      add("target", s.id, refKey(t), route, aimOf(t, route));
    }
    if (s.targets.length > 0) studAt = index;
  }
  // Spec 0028 — an ability, faintly, back to the permanent it came from.
  // Spec 0066: a dotted thread from the permanent's side into the stack
  // card's left edge just under its badges -- never at the stud.
  for (const s of stack ?? []) {
    if (!s.source || !spotBox.has(s.id) || stackWaiting(s)) continue;
    const p = positions.get(s.source);
    const box = spotBox.get(s.id)!;
    if (!p) continue;
    const to = { x: box.x - gap, y: box.y + box.h * SOURCE_AT };
    const right = to.x >= centreOf(p.box, p.origin).x;
    const from: Port = {
      at: pointOn(p.box, p.origin, right ? 1 : 0, 0.35),
      out: { x: right ? 1 : -1, y: 0 },
    };
    add("source", s.source, s.id, arc(from, to, g.cardH, g.cardH * 0.19));
  }
  const lines = [...byKey.values()];
  // Spec 0063 (R2) -- each player attacked by unblocked attackers: how many.
  const underAttack: { seat: number; at: Point; count: number; hot: boolean }[] = [];
  for (const a of combat?.attackers ?? []) {
    if (blockedIds.has(a.id) || !("player" in a.target)) continue;
    const seat = a.target.player;
    let u = underAttack.find((x) => x.seat === seat);
    if (!u) {
      u = { seat, at: playerPoint(seat, viewerSeat, where), count: 0, hot: false };
      underAttack.push(u);
    }
    u.count += 1;
    if (aimed !== null && drawn(a.id) === aimed) u.hot = true;
  }

  return (
    <div ref={ref} className="bf-board" data-testid="battlefield">
      <div className="bf-felt-edge" style={{ width: g.play.w }} />
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
          // CSS settles only what is not a journey (a hand card rising);
          // journeys are Glide, run by glide().
          ["--move-ms" as string]: `${SETTLE_MS}ms`,
          ["--move-easing" as string]: SETTLE_EASING,
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
            data-z={zOf(item)}
            style={{
              width: g.cardW,
              height: g.cardH,
              ...placement(item.box, g.cardW, g.cardH, item.origin),
              zIndex: zOf(item),
              ...(item.id === flyingOnto && item.ids.length === 1
                ? // Not drawn, but still there to click (a target chosen while
                  // it lands); it goes straight to its place (no glide), so
                  // it is there when the card lands on it.
                  { opacity: 0, transition: "none" }
                : {}),
            }}
          >
            {item.content}
          </div>
        ))}
        {(stack ?? []).length === 0 &&
          stackPayLive &&
          stackPay &&
          stackPay.length > 0 &&
          (() => {
            // Spec 0062 -- an ability is on the stack only once it is paid:
            // its "Still to pay" stands where it will go.
            const box = stackSpotBoxes(g, 1, stackScale)[0]!;
            return (
              <div
                key="stack-spot:paying"
                className="bf-slot bf-stack-slot bf-stack-paying"
                style={{
                  width: g.cardW,
                  height: g.cardH,
                  transformOrigin: "0 0",
                  transform: `translate3d(${box.x}px, ${box.y}px, 0) scale(${box.scale})`,
                  zIndex: Z_LINES - 100,
                  pointerEvents: "none",
                  ["--stack-scale" as string]: String(box.scale),
                }}
              >
                <OwePill pips={stackPay} />
              </div>
            );
          })()}
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
          // W-20: the whole card, readable, when it has a picture this
          // viewer may see; a trigger or ability with its own words on it.
          const whole = box.scale >= STACK_READ_SCALE && !!s.art && s.name !== "Face-down";
          const kind = STACK_KIND[s.kind ?? "spell"] ?? "Spell";
          return (
            <div
              key={`stack-spot:${s.id}`}
              ref={(element) => {
                if (element) stackEls.current.set(s.id, element);
                else stackEls.current.delete(s.id);
              }}
              className={`bf-slot bf-stack-slot${faded ? " bf-stack-faded" : ""}`}
              data-rising={rose.current.has(s.id) ? "true" : undefined}
              style={{
                width: g.cardW,
                height: g.cardH,
                transformOrigin: "0 0",
                transform: `translate3d(${box.x}px, ${box.y}px, 0) scale(${box.scale})`,
                // Pointed at, a card lower in the stack comes to the front.
                zIndex: focus === s.id && i > 0 ? Z_LINES - 99 : Z_LINES - 100 - i,
                ["--stack-scale" as string]: String(box.scale),
                ...(hiddenStack === s.id ? { opacity: 0 } : {}),
                ...(quietStack?.has(s.id) || rose.current.has(s.id) ? { animation: "none" } : {}),
              }}
            >
              <button
                type="button"
                className={`bf-card bf-stack-card bf-look-artifact${i === 0 ? " bf-stack-top" : ""}${whose}${a.className}`}
                aria-label={[
                  `${s.name}${s.count ? ` ×${s.count}` : ""}, on the stack`,
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
                {whole ? (
                  <>
                    {/* The words the drawn card used to carry, for anything reading them. */}
                    <span className="pa-visually-hidden">
                      {s.name} {kind}
                    </span>
                    <SharpCard
                      low={artUrl(s.art!)}
                      high={closeUpOf(artUrl(s.art!))}
                      alt=""
                      className="bf-stack-whole"
                    />
                    {kind !== "Spell" && s.does && (
                      // Amendment 13 (item 12) -- one paragraph, symbols inline.
                      <span className="bf-stack-words">
                        <b>{kind}</b>
                        <span className="bf-stack-said">
                          <ManaText text={s.does} />
                        </span>
                      </span>
                    )}
                  </>
                ) : (
                  <CardFace
                    name={s.name}
                    look="artifact"
                    type={kind}
                    pt=""
                    art={s.art ? artUrl(s.art) : null}
                    crop={s.crop ? artUrl(s.crop) : null}
                    faceDown={s.name === "Face-down"}
                    known={false}
                    cost={s.manaCost ?? null}
                  />
                )}
              </button>
              {/* Amendment 13 (item 8) -- paying for this one: what's still due,
                  under its words, as on a card being cast. */}
              {i === 0 && stackPay && stackPay.length > 0 && <OwePill pips={stackPay} />}
              {i === 0 && !stackPay && stackOwing && stackOwing.length > 0 && (
                <span className="bf-stack-owe" aria-label={`Still to pay: ${stackOwing.join(" ")}`}>
                  {/* Spec 0057, item 4 -- bigger, and plainer. */}
                  <span className="bf-stack-owe-word">Still to pay</span>
                  <ManaText text={stackOwing.map((m) => `{${m}}`).join("")} />
                </span>
              )}
              {/* Spec 0066, item 2 -- where its arrows leave from. */}
              {i === studAt && (
                <span
                  className="bf-stack-stud"
                  data-stud="true"
                  aria-hidden="true"
                  style={{ top: `${((studY(spot, i, g.cardH) - box.y) / box.h) * 100}%` }}
                />
              )}
              {/* Beside the card's name bar, so neither covers the name. */}
              <span className="bf-stack-tag" aria-hidden="true">
                <span className="bf-stack-n">{i + 1}</span>
                {s.caster && <img className="bf-stack-by" src={s.caster} alt="" />}
                {s.count && <span className="bf-stack-many">×{s.count}</span>}
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
        {/* Spec 0066: not before its only card has landed. */}
        {stack &&
          stack.length > 0 &&
          spot[0] &&
          !(stack.length === 1 && stack[0]!.id === hiddenStack) && (
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
              {/* Amendment 13 (item 12) -- one line, one style: what resolves
                next, whose, and how many wait. The card's own plate says
                what it does, so pointing adds nothing here. */}
              <span className="bf-stack-next">
                {stackCaption(stack, viewerSeat, stackTotal, spot.length, viewerName)}
              </span>
            </div>
          )}
        {/* Spec 0063 (R2): an attacked player's life circle glows, with
            how many attack it; brighter while one of them is pointed at. */}
        {underAttack.map((u) => (
          <div
            key={u.seat}
            className={`bf-attacked-life${u.hot ? " bf-attacked-hot" : ""}`}
            data-attacked-player={u.seat}
            // The count sits on the side its arrows do not come from.
            data-count-side={u.at.y < middle ? "above" : "below"}
            aria-hidden="true"
            style={{
              left: u.at.x,
              top: u.at.y,
              width: (lifeR + gap) * 2,
              height: (lifeR + gap) * 2,
              zIndex: Z_LINES - 1,
            }}
          >
            <span className="bf-attacked-count">{u.count} attacking</span>
          </div>
        ))}
        <svg
          ref={linesRef}
          className="bf-lines"
          width={g.width}
          height={g.height}
          // Spec 0066, item 2 -- under the stack's cards, caption and
          // badges (Z_LINES - 100 and up), still over every card on the table.
          style={{ zIndex: Z_LINES - 200 }}
          aria-hidden="true"
        >
          <defs>
            <filter id="bf-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
            {/* Spec 0069: a soft bloom; the blade's heat haze; the block mark's steel. */}
            <filter id="bf-soft" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.6" />
            </filter>
            <filter id="bf-heat" x="-30%" y="-30%" width="160%" height="160%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.035 0.09"
                numOctaves={2}
                seed={3}
              />
              <feDisplacementMap in="SourceGraphic" scale={g.cardH * 0.09} />
              <feGaussianBlur stdDeviation="5" />
            </filter>
            <linearGradient id="bf-steel" x1="0" y1="-1" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.5" stopColor="#bfe6ff" />
              <stop offset="1" stopColor="#6c9cc4" />
            </linearGradient>
            <linearGradient id="bf-shield" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2b4a6a" />
              <stop offset="1" stopColor="#101a26" />
            </linearGradient>
            <filter id="bf-shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation={g.cardH * 0.03} />
            </filter>
          </defs>
          {lines.map((line) => {
            const still = reducedMotion();
            const route = line.route;
            const first = route[0]!;
            const tip = route[route.length - 1]!.end;
            const theme = LINE_THEME[line.kind];
            const w = sizes.line;
            const d = pathOf(route);
            const chip = line.count > 1 && line.kind === "attack" ? routeAt(route, 0.5) : null;
            // Spec 0066: a soft shadow on the felt under a lifted arc.
            const depth = Math.min(g.cardH * 0.33, arcHeight(route) * 0.4);
            return (
              <g
                key={line.key}
                className={`bf-line bf-line-${line.kind}`}
                data-key={line.key}
                data-line={line.kind}
                data-from={line.from}
                data-to={line.to}
                data-count={line.count > 1 ? line.count : undefined}
                data-start={`${first.start.x.toFixed(1)},${first.start.y.toFixed(1)}`}
                data-end={`${tip.x.toFixed(1)},${tip.y.toFixed(1)}`}
              >
                {line.kind === "attack" ? (
                  // Spec 0069, item 1 (A2 · Molten blade).
                  <AttackBlade
                    route={route}
                    w={w}
                    uid={lookId(line.key)}
                    reduced={still}
                    shadow={
                      depth > 1 && (
                        <path
                          d={arcShadow(route, depth)}
                          stroke="#000"
                          strokeWidth={w * 1.6}
                          className="bf-line-shadow"
                          filter="url(#bf-shadow)"
                          pathLength={1}
                        />
                      )
                    }
                  />
                ) : line.kind === "target" ? (
                  // Spec 0069, items 2-4 (T4 · Beam, L3 · Ripple and sparks):
                  // the beam stops at the card's top edge, never over its name.
                  <TargetBeam route={route} aim={line.aim} w={w} reduced={still} />
                ) : (
                  // Spec 0066 -- the thread back to an ability's source:
                  // faint and dotted, a dot where it meets the stack card.
                  // Spec 0069 -- the short bar of a blocker not facing its
                  // attacker: the same dots, no end.
                  <g className="bf-line-thread">
                    <path
                      d={d}
                      stroke={theme.aura}
                      strokeWidth={w * 1.4}
                      className="bf-line-thread-aura"
                      filter="url(#bf-glow)"
                    />
                    <path
                      d={d}
                      stroke={theme.body}
                      strokeWidth={w * 0.6}
                      strokeDasharray={`${w * 0.8} ${w * 1.7}`}
                    />
                    {line.kind === "source" && (
                      <circle
                        cx={tip.x}
                        cy={tip.y}
                        r={w * 1.1}
                        fill={theme.core}
                        stroke={theme.body}
                      />
                    )}
                  </g>
                )}
                {/* Spec 0063: a pile's one arrow says how many it stands for. */}
                {chip && (
                  <g className="bf-line-chip" data-chip={line.count}>
                    <circle
                      cx={chip.x}
                      cy={chip.y}
                      r={g.cardH * 0.085}
                      fill="#c2532f"
                      stroke={theme.core}
                      strokeWidth={w * 0.35}
                    />
                    <text
                      x={chip.x}
                      y={chip.y}
                      dy="0.35em"
                      textAnchor="middle"
                      fontSize={g.cardH * 0.085}
                      fontWeight={700}
                      fill="#fff"
                    >
                      ×{line.count}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
          {/* Spec 0066, item 4 (2 · Crossed swords): a mark between each
              fighting pair, all combat long; pointing at an attacker
              brightens its fights and dims the rest. */}
          {swords.map((m) => {
            const lead = drawn(m.attacker);
            const hot = aimed !== null && aimed === lead;
            const dim = aimed !== null && !hot;
            return (
              <g
                key={`swords:${m.key}`}
                className={`bf-swords${hot ? " bf-swords-hot" : ""}${dim ? " bf-swords-dim" : ""}`}
                data-key={`swords:${m.key}`}
                data-swords={m.key}
                data-attacker={m.attacker}
                data-blocker={m.blocker}
                transform={`translate(${m.at.x.toFixed(1)} ${m.at.y.toFixed(1)})`}
                style={{ ["--swords-delay" as string]: `${MOVE_MS}ms` }}
              >
                <g transform={`scale(${(m.r / 11).toFixed(3)})`} data-r={m.r.toFixed(1)}>
                  <SwordsMark count={m.count} />
                </g>
              </g>
            );
          })}
          {/* Spec 0063: a line that goes fades out here (never just vanishes). */}
          <g ref={leavingRef} className="bf-lines-leaving" />
        </svg>
        {/* A stack object is "where" its spot is: a spell cast flies there (spec 0044). */}
        {overlay?.((id) => positions.get(id)?.box ?? spotBox.get(id) ?? null, g)}
        {marks
          .filter((m) => m.kind === "dim")
          .map((m) => (
            <FightMarkView
              key={m.key}
              mark={m}
              done={() => setMarks((list) => list.filter((x) => x.key !== m.key))}
            />
          ))}
        <div className="bf-effects" style={{ zIndex: Z_EFFECTS }} aria-hidden="true">
          {marks
            .filter((m) => m.kind !== "dim")
            .map((m) => (
              <FightMarkView
                key={m.key}
                mark={m}
                done={() => setMarks((list) => list.filter((x) => x.key !== m.key))}
              />
            ))}
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
        {tethers.length > 0 && (
          // A-08: the gold line a stolen creature is pulled along.
          <svg
            className="bf-tethers"
            width={g.width}
            height={g.height}
            style={{
              ["--tether-ms" as string]: `${TETHER_MS}ms`,
              ["--pull-ms" as string]: `${PULL_MS}ms`,
            }}
            aria-hidden="true"
          >
            {tethers.map((t) => (
              <path
                key={t.key}
                // Gone when its own fade ends -- on the animation clock, so
                // a hurry or a slowed clock keeps the line and the card it
                // pulls together.
                onAnimationEnd={(event) => {
                  if (event.animationName === "bf-tether-fade")
                    setTethers((list) => list.filter((x) => x.key !== t.key));
                }}
                pathLength={1}
                d={`M${t.from.x} ${t.from.y} Q ${(t.from.x + t.to.x) / 2} ${Math.min(t.from.y, t.to.y) - g.cardH * 0.6} ${t.to.x} ${t.to.y}`}
              />
            ))}
          </svg>
        )}
        {sweep !== null && (
          // A-07: a board wipe's flash across the table.
          <div
            key={sweep}
            className="bf-sweep"
            style={{ ["--sweep-ms" as string]: `${SWEEP_MS}ms` }}
            onAnimationEnd={() => setSweep(null)}
          />
        )}
        {fusions.map((f) => (
          // A-10: the table dims; at the slam, a white flash with rays,
          // sparks and a ring in the merge's colour (CSS, delayed to the slam).
          <div
            key={f.key}
            className="bf-merge"
            data-merge={f.kind}
            aria-hidden="true"
            style={{
              ["--merge-ms" as string]: `${MERGE_MS}ms`,
              ["--merge-slam" as string]: `${MERGE_PULL_MS}ms`,
              ["--merge-flash-ms" as string]: `${MERGE_FLASH_MS}ms`,
              ["--merge-ring-ms" as string]: `${MERGE_RING_MS}ms`,
              ["--merge-dim" as string]: String(MERGE_DIM),
              ["--merge-colour" as string]: MERGE_COLOUR[f.kind],
              ["--merge-w" as string]: `${f.size}px`,
            }}
            // Gone when its flash, the last of it, ends -- on the animation
            // clock, so a hurry or a slowed clock keeps it all together.
            onAnimationEnd={(event) => {
              if (event.animationName === "bf-merge-flash")
                setFusions((list) => list.filter((x) => x.key !== f.key));
            }}
          >
            <span className="bf-merge-dim" style={{ zIndex: Z_MERGE_DIM }} />
            <span
              className="bf-merge-burst"
              style={{ left: f.at.x, top: f.at.y, zIndex: Z_MERGE_FX }}
            >
              <span className="bf-merge-flash" />
              <span className="bf-merge-ring" />
              {MERGE_SPARKS.map((s, i) => (
                <span
                  key={i}
                  className={`bf-merge-spark${s.white ? " bf-merge-spark-white" : ""}`}
                  style={{
                    ["--dx" as string]: `${s.dx * f.size}px`,
                    ["--dy" as string]: `${s.dy * f.size}px`,
                    ["--spark-ms" as string]: `${s.ms}ms`,
                  }}
                />
              ))}
            </span>
          </div>
        ))}
        {ghosts.map((ghost) => (
          <GhostCard
            key={`ghost:${ghost.id}`}
            ghost={ghost}
            cardW={g.cardW}
            cardH={g.cardH}
            done={() => setGhosts((list) => list.filter((x) => x !== ghost))}
          />
        ))}
        {returnMarks.map((m) => (
          <ReturnMarkView
            key={m.key}
            mark={m}
            done={() => setReturnMarks((list) => list.filter((x) => x.key !== m.key))}
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
    // A-09: the old face flips away where it is.
    if (ghost.flip) {
      const card = element.querySelector<HTMLElement>(":scope > .bf-card");
      if (!card) {
        done();
        return;
      }
      const turn = card.animate(flipFrames(cardH * ghost.box.scale, "out"), {
        duration: FLIP_MS,
        easing: "linear",
        fill: "both",
      });
      turn.onfinish = done;
      return () => {
        turn.onfinish = null;
        turn.cancel();
      };
    }
    // A-10: pulled into the merge, gone at the slam.
    if (ghost.merge) {
      const pulled = element.animate(
        mergeFrames(
          ghost.merge.part,
          ghost.box,
          ghost.to,
          cardW,
          cardH,
          ghost.origin,
          ghost.merge.colour,
          ghost.merge.start,
        ),
        { duration: MERGE_MS, easing: "linear", fill: "both" },
      );
      pulled.onfinish = done;
      return () => {
        pulled.onfinish = null;
        pulled.cancel();
      };
    }
    // Phase 10 A-00: Glide to where it went -- first showing it was
    // defeated or exiled (A-04, A-05), in the same animation.
    const fated = ghost.fate
      ? fateFrames(ghost.fate, ghost.box, ghost.to, cardW, cardH, ghost.origin, ghost.toOrigin)
      : null;
    // A-14: Lift and glide, back to a hand or a library.
    const returned = ghost.returning
      ? returnFrames(
          ghost.box,
          ghost.to,
          cardW,
          cardH,
          ghost.origin,
          ghost.toOrigin,
          ghost.returning.seen,
        )
      : null;
    const animation = element.animate(
      fated?.frames ??
        returned ??
        glideFrames(
          ghost.box,
          ghost.to,
          cardW,
          cardH,
          ghost.origin,
          ghost.toOrigin,
          { from: 1, to: ghost.fade ? 0.15 : 1 },
          null,
          // A-17: pulled along its chain.
          ghost.chained ? { arc: PULL_ARC } : {},
        ),
      {
        duration: fated?.duration ?? (returned ? RETURN_MS : ghost.chained ? PULL_MS : MOVE_MS),
        easing: "linear",
        delay: ghost.delay,
        fill: "both",
      },
    );
    element.classList.add("bf-moving");
    animation.onfinish = done;
    // A-13: killed in a fight -- its moves in the fight, on its card, first.
    const card = ghost.fight ? element.querySelector<HTMLElement>(":scope > .bf-card") : null;
    const fought =
      ghost.fight && card && typeof card.animate === "function"
        ? card.animate(ghost.fight.frames, {
            duration: ghost.fight.duration,
            delay: ghost.fight.delay,
            easing: "linear",
            id: "fight",
          })
        : null;
    // A-14: turning face down on the way, a card back over its face.
    const back = ghost.returning?.back
      ? element.querySelector<HTMLElement>(".bf-return-back")
      : null;
    const turned =
      back && typeof back.animate === "function"
        ? back.animate(returnBackFrames(), {
            duration: RETURN_MS,
            delay: ghost.delay,
            easing: "linear",
            fill: "both",
          })
        : null;
    // Unmounting (or StrictMode's rehearsal) stops it without finishing it.
    return () => {
      animation.onfinish = null;
      animation.cancel();
      fought?.cancel();
      turned?.cancel();
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
      data-fate={ghost.fate}
      data-chained={ghost.chained ? "true" : undefined}
      data-flip={ghost.flip ? "true" : undefined}
      data-merge={ghost.merge?.part}
      data-fought={ghost.fight ? "true" : undefined}
      data-return={ghost.returning?.zone}
      style={{
        width: cardW,
        height: cardH,
        ...from,
        zIndex: ghost.zIndex ?? ghost.box.z + 2000,
        ...(ghost.stack ? { ["--stack-scale" as string]: String(ghost.box.scale) } : {}),
        ...(ghost.fate ? { ["--fx-delay" as string]: `${ghost.delay}ms` } : {}),
      }}
    >
      {ghost.stack ? (
        // Amendment 13 (item 13) -- as it was on the stack.
        <div className={`bf-card bf-stack-card bf-look-artifact${ghost.stack.whose}`}>
          <SharpCard
            low={ghost.stack.low}
            high={ghost.stack.high}
            alt=""
            className="bf-stack-whole"
          />
          {ghost.returning?.back && <ReturnBack />}
          {ghost.stack.kind !== "Spell" && ghost.stack.does && (
            <span className="bf-stack-words">
              <b>{ghost.stack.kind}</b>
              <span className="bf-stack-said">
                <ManaText text={ghost.stack.does} />
              </span>
            </span>
          )}
        </div>
      ) : (
        <div className={`bf-card bf-look-${ghost.look}`}>
          <CardFace {...ghost} />
          {ghost.fate && <FateMarks fate={ghost.fate} />}
          {ghost.returning?.back && <ReturnBack />}
        </div>
      )}
      {ghost.fate === "exiled" && <Motes />}
    </div>
  );
}

/**
 * Phase 10 A-13 -- one mark of a fight: the dimming, a caption, sparks, a
 * slash mark, a number, the hurt. Its animation is on the board's clock
 * (a click hurries it); it is gone when its animation ends.
 */
function FightMarkView({ mark, done }: { mark: FightMark; done: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof element.animate !== "function") {
      done();
      return;
    }
    const animation = element.animate(mark.frames, {
      duration: mark.duration,
      delay: mark.delay,
      easing: "linear",
      fill: "both",
    });
    animation.onfinish = done;
    return () => {
      animation.onfinish = null;
      animation.cancel();
    };
    // Runs once: a mark plays what it was given when it appeared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      className={`bf-fight-${mark.kind}${mark.deathtouch ? " bf-fight-deathtouch" : ""}`}
      data-fight={mark.kind}
      data-of={mark.of}
      style={{ ...mark.style, opacity: 0 }}
    >
      {mark.text}
    </div>
  );
}

/** Phase 10 A-14 -- the card back that turns down over a returning card's face. */
function ReturnBack() {
  return <img className="bf-return-back" src={cardBack} alt="" draggable={false} />;
}

/**
 * Phase 10 A-14 -- a tag at a destination ("On top of Bob's library"), or one
 * back of a riffling library. Its animation is on the board's clock (a click
 * hurries it); it is gone when its animation ends.
 */
function ReturnMarkView({ mark, done }: { mark: ReturnMark; done: () => void }) {
  const ref = useRef<HTMLDivElement & HTMLImageElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof element.animate !== "function") {
      done();
      return;
    }
    const animation = element.animate(mark.frames, {
      duration: mark.duration,
      delay: mark.delay,
      easing: "linear",
      // Unseen (its own opacity 0) until it starts: "both" held a riffle's
      // backs at rest on the library through the card's whole flight (seen
      // in the film of the Lab's Chaos Warp).
      fill: "forwards",
    });
    animation.onfinish = done;
    return () => {
      animation.onfinish = null;
      animation.cancel();
    };
    // Runs once: a mark plays what it was given when it appeared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = { ...mark.style, opacity: 0, zIndex: Z_RETURN_MARK };
  return mark.kind === "tag" ? (
    <div
      ref={ref}
      className={`bf-return-tag${mark.grave ? " bf-grave-tag" : ""}`}
      data-return-tag={mark.grave ? undefined : mark.of}
      data-grave-tag={mark.grave ? mark.of : undefined}
      aria-hidden="true"
      style={style}
    >
      {mark.text}
    </div>
  ) : (
    <img
      ref={ref}
      className="bf-return-riffle"
      data-riffle={mark.of}
      src={cardBack}
      alt=""
      aria-hidden="true"
      draggable={false}
      style={style}
    />
  );
}

/**
 * Phase 10 A-04 -- Shatter's red flash and cracks, drawn on the card; its
 * shake, darkening and tilt are the ghost's own animation (fateFrames).
 * A-05's light is the ghost's filter; its rising motes are Motes.
 */
function FateMarks({ fate }: { fate: Fate }) {
  if (fate !== "defeated") return null;
  return (
    <>
      <span className="bf-fate-flash" />
      <svg className="bf-fate-cracks" viewBox="0 0 100 140" preserveAspectRatio="none">
        <path pathLength={1} d="M50 62 L31 31 L23 8" />
        <path pathLength={1} d="M50 62 L73 40 L92 31" />
        <path pathLength={1} d="M50 62 L42 96 L31 134" />
        <path pathLength={1} d="M50 62 L77 88 L83 124" />
        <path pathLength={1} d="M50 62 L12 73" />
      </svg>
    </>
  );
}

/** A-05 -- the pale light rising off an exiled card: fixed places, so a test can count them. */
const MOTES = Array.from({ length: 14 }, (_, i) => ({
  x: 8 + ((i * 37) % 84),
  y: 20 + ((i * 53) % 70),
  rise: 40 + ((i * 29) % 45),
  late: (i * 47) % 160,
}));
function Motes() {
  return (
    <span className="bf-motes" aria-hidden="true">
      {MOTES.map((m, i) => (
        <span
          key={i}
          className="bf-mote"
          style={{
            left: `${m.x}%`,
            top: `${m.y}%`,
            ["--rise" as string]: `${m.rise}%`,
            ["--late" as string]: `${m.late}ms`,
          }}
        />
      ))}
    </span>
  );
}
