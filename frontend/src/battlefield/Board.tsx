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

import { sameContent, sameProps } from "./sameProps";
import {
  memo,
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useFit } from "../FitName";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./battlefield.css";
import cardBack from "../assets/card-back.webp";
import {
  FAN_CLOSE_MS,
  FAN_FLOAT_MS,
  FAN_GLOW_MS,
  FAN_RISE_MS,
  FAN_SINK_MS,
  FAN_TICK_MS,
  FAN_WAIT,
  FanCardView,
  FAN_MORE_MS,
  FanMoreView,
  morePopFrames,
  TILE_PULSE_MS,
  closeFrames,
  fanWords,
  riseFrames,
  sinkFrames,
} from "./FanCards";
import { fanBoxes, fanMore, fanReach, type FanCard, type FanMore, type FanZone } from "./pileFan";
import { ManaCost, ManaText, costChange, symbolUrl } from "./ManaCost";
import { litShadow, owingWords, type PayPip } from "./manaBalls";
import { ASIDE_MS, castCoverBox, covers } from "./stepAside";
import { SharpCard, closeUpOf } from "../closeUp";
import {
  inCombat,
  HAND_ORIGIN,
  OPPONENT_HAND_ORIGIN,
  TAPPED_ORIGIN,
  geometry,
  layout,
  tabAt,
  TAB_W,
  type Box,
  type Geometry,
  type LayoutCard,
  type LandRow,
  type Layout,
  type Side,
  type Viewport,
} from "./layout";
import {
  paced,
  anchors,
  boxAt,
  handReadBox,
  handRiseBox,
  LIFE_R,
  plateRects,
  MOVE_MS,
  PACE,
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
  BANISH_MS,
  SWEEP_MS,
  WIPE_AT,
  SPENT_BEAT_MS,
  COIN_MS,
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
  RIFFLE_BEAT_MS,
  RIFFLE_CARDS,
  RIFFLE_MS,
  returnBackFrames,
  returnFrames,
  fateMs,
  riffleFrames,
  type Placed,
  placement,
  type AnchorId,
  type Point,
} from "./motion";
import { AttackBlade, SwordsMark, TargetBeam, type BeamTone } from "./Arrows";
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
  STUD_AT,
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
import {
  changeSteps,
  endLifeSteps,
  lifeSteps,
  lifeStillPlaying,
  planChanges,
  startLifeSteps,
} from "./lifeTicks";
import type { LifeChanges } from "../match";
import {
  badgeFrames,
  badgeSpells,
  boxOn,
  PEEL_MS,
  peelFrames,
  peelOffset,
  SPARK_LEAD_MS,
  SPARK_MS,
  sparkFrames,
  TOKEN_AFTER_MS,
  TOKEN_BEAT_ABILITY_MS,
  TOKEN_BEAT_MS,
  TOKEN_MS,
  tokenFrames,
  tokenStart,
  turnUp,
  WAVE_NUMBER_AT,
  WAVE_SPARK,
  waveSpread,
  waves,
  sparks as sparksFor,
  type BadgeChange,
} from "./piles";
import {
  COUNTER_MS,
  counterFrames,
  DISCARD_BEAT_MS,
  DISCARD_MS,
  discardFrames,
  MILL_BEAT_MS,
  MILL_MS,
  MILL_SCALE,
  MILL_SHOWN,
  millFrames,
  millOut,
  poseOf,
  SHOW_BEAT_MS,
  SHOW_HOLD_MS,
  SHOW_MS,
  SHOW_RISE_MS,
  SHOW_SCALE,
  besideTile,
  showAt,
  showFrames,
  STRIKE_FX_MS,
  STRIKE_MS,
  strikeBeamFrames,
  strikePulseFrames,
  strikeRingFrames,
  SWEPT_MS,
  sweptAt,
  sweptFrames,
  tileFrames,
  tileSpells,
  CANVAS_H,
  type Pose,
  type ShowTo,
  type TileChange,
} from "./graves";
import type {
  Moments,
  Opening,
  RestartSweep,
  ShowFrom,
  Survive,
  TileMove,
  TileZone,
} from "./fromSnapshot";
import { sweepBeat, sweepDone, sweepLanded } from "./restart";
import {
  DEAL_MS,
  DEAL_NUMBER_AT,
  PUT_BACK_MS,
  RIFFLE_AT as OPENING_RIFFLE_AT,
  dealAt,
  sweepAt,
  sweptAt as sweptInAt,
} from "./opening";
import {
  domeMarks,
  greyNumber,
  numberPoint,
  regenShieldMarks,
  shieldBreakMarks,
  silverShieldMarks,
  WARD_FLARE_MS,
  wardFlareFrames,
  wardMarks,
  wardRingMarks,
  type SurviveMark,
} from "./survive";
import { GHOST_AT as UMBRA_GHOST_AT, umbraGhostBox, umbraMarks, umbraTimes } from "./umbra";
import { payWords, type PayMark, type PayTone } from "./payPicks";
import { PaySign } from "./PaySign";
import {
  BADGE_FLOOR,
  CardBadges,
  MARK_H,
  REGEN_SHIELD,
  SEAL,
  STOPWATCH,
  TWIN,
  type GoneMark,
} from "./CardBadges";
import { cardMarks, HEX_MARK, MarkIcon, type CardMark } from "./marks";
import {
  FREED_WAIT_MS,
  HELD_ARC,
  HELD_IN_MS,
  MARK_LAND_MS,
  RISE_FROM,
  RISE_UP,
  RISE_UP_PX,
  RISER_APART,
  RISER_BEAT_MS,
  RISER_MS,
  RISER_START,
  RISER_TOP,
  TILE_GLOW_LEAD_MS,
  TILE_GLOW_MS,
  WHY_PULSE_MS,
  freedGlowFrames,
  heldFlyFrames,
  heldInFrames,
  markLandFrames,
  riserFrames,
  tileGlowFrames,
  whyPulseFrames,
  combatPopFrames,
  COMBAT_POP_MS,
} from "./markMotion";
import { RoomFace } from "./RoomDoors";
import { Breath } from "./Breath";
import {
  FLY_SYNC_AT,
  ZZ_ANIMATIONS,
  ZZ_GAP_MS,
  ZZ_SYNC_AT,
  bobInStep,
  followStarted,
  pauseFlyers,
} from "./breathMotion";
import { Sight, SIGHT_ARM, SIGHT_OUT } from "./Sight";
import { ModeLines, XMedallion } from "./SpellMarks";
import {
  ALIVE_BACK_MS,
  ALIVE_PULSE_MS,
  aliveTimes,
  breathFrames,
  moteMarks,
  numberInFrames,
  ptFloat,
  ringMark,
} from "./alive";
import {
  COPY_FLIP_AT,
  COPY_GHOST_MS,
  COPY_MARK_AT,
  FIZZLE_BEAM_OUT_AT,
  FIZZLE_GREY_AT,
  FIZZLE_HOLD_MS,
  FIZZLE_MS,
  FIZZLE_REACH_MS,
  FIZZLE_RING_MS,
  MARK_GROW_MS,
  NO_HELD,
  ORIGINAL_GLOW_MS,
  PEEL_BEAT_MS,
  PEEL_IN_MS,
  PEEL_MARK_AT,
  copyEndFrames,
  copyGhostFrames,
  fizzleFrames,
  glowFrames,
  heldBreakFrames,
  heldCard,
  heldId,
  holdThenFlip,
  markFrames,
  nextHeld,
  peelInFrames,
  waitingBoxes,
  type HeldMemory,
} from "./copies";
import { SizeFigure, shakeFrames, type Figure } from "./SizeFigure";
import {
  countSpan,
  endSizeSteps,
  sizeOf,
  sizesLength,
  sizesStillPlaying,
  startSizeSteps,
  SHAKE_MS,
  SHRINK_BEAT_MS,
  signed,
  type PlayedSize,
  type SizeChanges,
} from "./sizeTicks";

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
  /** Spec 0078 (Phase 9 W-19's): its power and toughness as printed. */
  basePower?: number | undefined;
  baseToughness?: number | undefined;
  /**
   * Spec 0079 -- a copy (a Clone, a token copy), public; `copyOf` the card it
   * copied, while this viewer may see it. The gold copy mark.
   */
  copy?: boolean | undefined;
  copyOf?: string | undefined;
  /**
   * Spec 0082 -- prepared: the spell waiting on it (the game's link), drawn
   * as a gold-rimmed square with the spell's picture.
   */
  prepared?: { id: string; name: string; art: string | null; crop: string | null } | undefined;
  /**
   * Spec 0080 -- phased out (see-through and grey in its place, its square
   * mark; can't be clicked), its regeneration shields (the shield mark), and
   * indestructible (the hexagon mark), as the game says.
   */
  phasedOut?: boolean | undefined;
  shields?: number | undefined;
  indestructible?: boolean | undefined;
  /** Spec 0101, row 7 -- "prevent the next N damage" waiting on it: the pale round shield square with N. */
  preventNext?: number | undefined;
  /** Spec 0101, row 7 -- used on this board: the count it had and has now (it ticks down; at 0 it goes). */
  preventUsed?: { from: number; to: number } | undefined;
  /** Spec 0101, item 3 -- in this combat (attacking, blocking, offered as a blocker): its printed combat squares show. */
  inCombat?: boolean | undefined;
  /**
   * Spec 0083 (15 A) -- a Room: its two doors (drawn as the card's top and
   * bottom halves), and the halves still locked -- each a closed door with
   * the gold keyhole square.
   */
  doors?: readonly [string, string] | undefined;
  lockedHalves?: readonly ("top" | "bottom")[] | undefined;
  /**
   * Spec 0085 (4 A) -- the exiled cards it holds (the game's link): each a
   * picture tab on its edge, its picture and name as this viewer may know
   * them -- a face-down one the other player may not see is a back with no
   * name.
   */
  holding?: readonly HeldCard[] | undefined;
}

/** Spec 0085 -- a card a permanent holds in exile, as this viewer may know it. */
export interface HeldCard {
  id: string;
  name: string;
  known: boolean;
  art: string | null;
  crop: string | null;
  /** Whose exile pile it is in: the tab flies there when its holder goes. */
  seat: number;
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
export function counterWords(
  card: {
    counters?: readonly { name: string; count: number }[];
    counterFrom?: readonly { counter: string; added: number; from: string }[] | undefined;
  },
  each = false,
): string[] {
  return (card.counters ?? []).map((c) => {
    const from = [...(card.counterFrom ?? [])].reverse().find((o) => o.counter === c.name);
    // Spec 0076: a pile's badges are per card ("on each").
    const what = `${c.count} ${counterName(c.name)} counter${c.count === 1 ? "" : "s"}${each ? " on each" : ""}`;
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
  /**
   * Spec 0084 -- an ability's or trigger's card that is no longer on the
   * battlefield (sacrificed to pay for it, Karn at 0 loyalty, a card cycled
   * from your hand): it lifts off where that card was drawn last.
   */
  leftFrom?: string | null;
  /**
   * Spec 0086, Amendment 1 -- a trigger from a picture in the rail: "monarch:1",
   * "initiative:2", or a dungeon's or emblem's card id; it rises from there.
   */
  riseFrom?: string | null;
  /**
   * Spec 0088 (Q1 A) -- a trigger whose card lies in a graveyard or exile
   * tile: the tile glows, the card rises and is shown (0074), and the trigger
   * lifts off it -- after the card has landed there, when it went there now.
   */
  showFrom?: ShowFrom;
  /** Spec 0088 (Q1 A) -- an ability of a card the other player cycled from their hidden hand: off the middle of their fan. */
  fromTheirHand?: number;
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
  /** Spec 0079 -- a copy of a spell: the gold copy mark; `copyOf` the entry it copies. */
  copy?: boolean;
  copyOf?: string | null;
  /** Spec 0079 (Q3 B) -- the entries drawn as this one card "xN", the one that resolves next first. */
  members?: readonly string[];
  /**
   * Spec 0082 -- a card of copies made together: its lasting key (batch and
   * aim; never its first member's id), and what each member is (a spell
   * copy's own card), the same on its way and on the stack.
   */
  key?: string;
  things?: readonly string[];
  /** Spec 0082 -- copies on their way onto the stack: drawn beside the entry they copy. */
  waiting?: boolean;
  /** Spec 0082 -- one of them is being asked "new target?" now. */
  aiming?: boolean;
  /** Spec 0083 (18 B) -- split second: the gold stopwatch square; the stack locks while it is there. */
  splitSecond?: boolean;
  /** Spec 0083 (18 B) -- can't be countered: the gold seal square. */
  cantBeCountered?: boolean;
  /** Spec 0101, row 6 -- a ward trigger: the warded creature (it flares and rings as this rises). */
  ward?: string;
  /** Spec 0100, item 1 -- the X its caster paid: the gold X medallion. */
  x?: number;
  /**
   * Spec 0105 -- resting before it resolves, nobody able to answer it: the
   * game waits `ms` from the board that said so (`arriveMs` of it allowed
   * for the card to reach the stack). The ring on its corner empties over it.
   */
  rest?: { ms: number; arriveMs: number };
  /** Spec 0100, item 2 -- every mode as printed, the chosen ones lit, the rest struck through. */
  modes?: readonly { text: string; chosen: boolean }[];
  /** Spec 0100, item 3 -- the extra costs paid: "kicked" (a doubled beam), "overloaded" (the fan to `hits`), "evoked" (a grey beam to its caster's graveyard). */
  extra?: readonly string[];
  /** Spec 0100, item 3 -- multikicker's count. */
  kicks?: number;
  /** Spec 0100, item 3 -- an overloaded spell: what it would hit now. */
  hits?: readonly string[];
  /** Spec 0100, item 4 -- each target's share of divided damage, by target key ("card:N", "player:N"). */
  shares?: Readonly<Record<string, number>>;
}

/** Damage just dealt, one wave (one combat damage step, or one spell):
 * what Forge actually dealt (§7.61 B13). A new `key` is a new wave. */
export interface DamageWave {
  key: string;
  hits: readonly {
    source: string;
    target: TargetRef;
    amount: number;
    deathtouch?: boolean;
    /** Spec 0077 -- an infect hit: poison counters, not life. */
    infect?: boolean;
    /** Spec 0080 -- stopped by a prevention: its would-be amount (`amount` 0). */
    prevented?: number;
    /** Spec 0101 -- what stopped it: a shield counter, "prevent the next N" (else a plain prevention). */
    by?: "shield" | "prevent-next";
  }[];
  /** Phase 10 A-13 -- a combat damage step's: which step, who fought whom, life gained. */
  combat?: "first-strike" | "regular";
  /** Spec 0084 -- a fight or bite spell's (Prey Upon, Ram Through): played as the combat fight. */
  fight?: boolean;
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
  /**
   * Spec 0106 -- clicking a fan's "+N": opens the pile viewer on that side's
   * pile (graveyard or exile) of the newest card the "+N" stands for.
   */
  onFanMore?: ((side: Side, zone: FanZone) => void) | undefined;
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
   * Spec 0074 -- the cards discarded, milled, or moved out of a graveyard or
   * exile this update, as the game moved them (fromSnapshot's tileMoves).
   */
  tileMoves?: readonly TileMove[];
  /** Spec 0074 -- the spells countered this update (each spell's own card). */
  countered?: ReadonlySet<string>;
  /** Spec 0101, item 2 -- each stack entry that left without resolving, and the card whose effect did it. */
  leftBy?: ReadonlyMap<string, string>;
  /** Spec 0079 -- the spells that fizzled this update (each spell's own card): their targets were gone. */
  fizzled?: ReadonlySet<string>;
  /** Spec 0080 -- this update's flickers, survivors and phase changes, as the game says. */
  survive?: Survive | null;
  /** Spec 0089 (Q2 A) -- before the first turn: each hand's deal, mulligan and put-back. */
  opening?: Opening | null;
  /** Spec 0089 (Q2 A) -- your hand is in the opening-hand window: the table's is not drawn. */
  veilHand?: boolean;
  /** Spec 0089 (Q2 A) -- the opening's movements wait this long (the loading screen still up). */
  openingDelay?: number;
  /**
   * Spec 0102, item 1 -- the game restarted: every card drawn on the last
   * board sweeps into its owner's library, the piles empty into theirs, and
   * both libraries riffle. `onRestartSwept` is told when it is over (the
   * deal may begin).
   */
  restart?: RestartSweep | null;
  onRestartSwept?: (key: string) => void;
  /** Spec 0084 -- this update's spent cards, library shuffles and crews, as the game says. */
  moments?: Moments | null;
  /**
   * Spec 0091 -- the casting card is up in the middle: a spent card under it
   * waits ASIDE_MS, while it steps aside, before it folds and goes.
   */
  castCover?: boolean;
  /**
   * Spec 0091 Amendment 1 -- the card just cast, held aside, flies to this
   * stack entry's spot as its spell leaves the stack: the stack card waits,
   * unseen, this long (until it has landed) before it plays its leaving.
   */
  landingOnStack?: { id: string; ms: number } | null;
  /** Combat, while there is one (fire and shield lines, AMENDMENT 7). */
  combat?: CombatView | null;
  /** The stack, the object that resolves next FIRST. */
  stack?: readonly StackView[];
  /** Spec 0082 -- copies on their way onto the stack, each card beside the entry it copies. */
  copying?: readonly StackView[];
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
  /** Spec 0077 -- the round's life and poison changes: played once per `key`. */
  life?: LifeChanges | null;
  /** Spec 0078 -- the round's changes to sizes and counters: played once per `key`. */
  sizeChanges?: SizeChanges | null;
  /** Spec 0083 (14 C) -- day or night (null before a daybound card made it one): a change washes the table. */
  dayTime?: string | null;
  /** Spec 0083 (17) -- permanents whose identical replacement effects just applied: pulsed gold once per `key`. */
  pulse?: { key: string; cards: readonly string[] } | null;
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
  /**
   * Spec 0093 -- whose turn it is and the step: a side's land row re-packs
   * once (the tidy-up) when that side's turn has begun -- past its untap
   * step -- and keeps its places otherwise. Absent: the row never tidies.
   */
  turnNow?: { turn: number; activeSeat: number; phase: string } | null | undefined;
  /** Phase 9 W-17 -- the cards in the sector or on the sprocket the
   * player is pointing at in the question: lit, and said ("pointed at"). */
  lit?: ReadonlySet<string>;
  /** Forge is asking for a CHOICE (a target, an attacker...), not just
   * what to do with priority: choosable objects then say "choose". */
  asking?: boolean;
  /**
   * Spec 0087 -- the cards some player may still use from a graveyard or an
   * exile (pileFan.ts): each stands in the fan beside its pile's plate.
   */
  fans?: readonly FanCard[];
  /** Spec 0087 -- every card now in a graveyard or an exile (one leaving a fan but staying there sinks into its tile). */
  pileCards?: ReadonlySet<string>;
  /**
   * Spec 0100, item 5 -- each card in a graveyard or an exile this viewer
   * may see, where it lies: a spell aiming at one draws its beam to the
   * tile, and the card peeks out of it.
   */
  piled?: ReadonlyMap<string, PiledCard>;
  /** Spec 0100, item 9 -- the stack entry whose beams show now (pointed at, else the front). */
  onStackFocus?: (id: string | null) => void;
  /**
   * Spec 0100, item 8 (owner 2026-11-18) -- a beam is swinging to a new
   * target (true), or has landed (false): the game screen holds the next
   * board until it has.
   */
  onSwinging?: (swinging: boolean) => void;
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

/** Spec 0100, item 5 -- a card lying in a pile, for its peek out of the tile. */
export interface PiledCard {
  id: string;
  seat: number;
  zone: "graveyard" | "exile";
  name: string;
  art: string | null;
  crop?: string | null;
  faceDown: boolean;
  look: string;
}

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

function CardFaceView({
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
  figure,
  fit = false,
}: {
  name: string;
  look: Look;
  type: string;
  pt: string;
  /** Spec 0078 -- a permanent's number, drawn so a change counts and tints. */
  figure?: Figure | undefined;
  art: string | null;
  crop?: string | null;
  faceDown: boolean;
  /** Whether this viewer may know what a face-down card is (§7.18). */
  known?: boolean;
  cost?: string | null;
  costChange?: "down" | "up" | null;
  costFirst?: boolean;
  /** Spec 0089 (Q6 A) -- a stack card's name: smaller until it fits its bar (FitName's rule), then cut. */
  fit?: boolean;
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
          {pt && (figure ? <SizeFigure figure={figure} /> : <span className="bf-pt">{pt}</span>)}
          <span className="bf-type">Face down</span>
        </span>
      </>
    );
  }
  return (
    <>
      <span className={`bf-bar bf-bar-top${cost && costFirst ? " bf-cost-first" : ""}`}>
        {cost && costFirst && <ManaCost cost={cost} change={costChange ?? null} />}
        {fit ? <BarName name={name} /> : <span className="bf-name">{name}</span>}
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
        {pt && (figure ? <SizeFigure figure={figure} /> : <span className="bf-pt">{pt}</span>)}
        <span className="bf-type">{type}</span>
      </span>
    </>
  );
}

export const CardFace = memo(CardFaceView, sameProps);

/** Spec 0094 -- how much higher 0061's discard pick lifts a hand card (game.css `.bf-picked`). */
const PICK_LIFT = 0.08;

/** Spec 0094 -- what the reading card shows: the card pointed at in a hand, and its marks. */
interface Reading {
  id: string;
  side: Side;
  box: Box;
  cardW: number;
  cardH: number;
  name: string;
  /** The whole scan's table copy; SharpCard swaps in the close-up once it is whole. */
  art: string | null;
  /** Spec 0058 -- the cost now, when Forge says it differs from the printed one. */
  cost: string | null;
  change: "down" | "up" | null;
  /** The hand card's marks (act()'s classes): playable, unpayable, picked, paying. */
  className: string;
  breathes: boolean;
  pay: PayTone | null;
  seen: boolean;
  /** No scan (a server without card pictures): the table face, enlarged. */
  face: Drawn;
}

/**
 * Spec 0094 (owner 2026-11-16, A) -- the reading card: the whole printed
 * card at HAND_READ times the card's size, clear of the fan, with the hand
 * card's marks. It can't be clicked or pointed at, and screen readers skip
 * it (the hand card keeps its own label). Drawn at its real size, not
 * scaled, so the scan is sharp; its marks size off its own height.
 */
function ReadingCardView({ reading: r }: { reading: Reading }) {
  return (
    <div
      className={`bf-read bf-read-${r.side}${r.className}`}
      aria-hidden="true"
      data-reading={r.id}
      data-read-side={r.side}
      style={{
        width: r.box.w,
        height: r.box.h,
        transform: `translate3d(${r.box.x}px, ${r.box.y}px, 0)`,
        zIndex: r.box.z,
        ["--card-h" as string]: `${r.box.h}px`,
      }}
    >
      {r.art ? (
        <SharpCard low={r.art} high={closeUpOf(r.art)} alt="" className="bf-read-scan" />
      ) : (
        <div
          className="bf-card bf-read-face"
          style={{
            width: r.cardW,
            height: r.cardH,
            transform: `scale(${r.box.scale})`,
            ["--card-h" as string]: `${r.cardH}px`,
          }}
        >
          <CardFace {...r.face} />
        </div>
      )}
      {r.cost && (
        <span className="bf-read-cost" data-read-cost={r.change ?? undefined}>
          <ManaCost cost={r.cost} change={r.change} />
        </span>
      )}
      {r.breathes && <Breath />}
      {r.pay ? (
        <PaySign tone={r.pay} corner="top-left" />
      ) : (
        r.seen && (
          <PaySign tone="reveal" seen corner={r.side === "viewer" ? "top-left" : "bottom-left"} />
        )
      )}
    </div>
  );
}
const ReadingCard = memo(ReadingCardView, sameProps);

/**
 * Spec 0089 (Q6 A) -- a stack card's name in its top bar: 5% smaller at a time
 * until it fits, never below 60% (spec 0041's FitName rule), and only then
 * cut with "…" by the bar's own CSS.
 */
function BarName({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useFit(ref, name);
  return (
    <span ref={ref} className="bf-name" data-fit="true">
      {name}
    </span>
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
  return { animationDelay: `-${hoverOffset(id)}ms` };
}
function hoverOffset(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 5000;
  return h;
}
/**
 * Spec 0090 (3) -- a flyer's hover: each its own point in the bob, or, with
 * more than FLY_SYNC_AT flyers on the table, all in step on one clock
 * (breathMotion.ts bobInStep), none offset.
 */
function hoverDelay(id: string, inStep: boolean): CSSProperties {
  return inStep ? { animationDelay: "0ms" } : motionDelay(id);
}
/**
 * Spec 0092 (3) -- the k-th z of a sick creature: its card's own point in
 * the loop (none when in step, above ZZ_SYNC_AT), and k thirds of the loop
 * on, so the three z's never meet.
 */
function zzDelay(id: string, k: number, inStep: boolean): CSSProperties {
  return { animationDelay: `-${(inStep ? 0 : hoverOffset(id)) + k * ZZ_GAP_MS}ms` };
}
/**
 * Spec 0090 (2) -- a card's glow layer: a flyer's hovers with it (the same
 * classes and clock), and breathes as the flyer's glow always did (offset
 * by its own point in the bob, as the card's one animation list had it).
 */
function breathStyle(id: string, flyer: boolean, inStep: boolean): CSSProperties | undefined {
  return flyer
    ? { ...hoverDelay(id, inStep), ["--breath-delay" as string]: `-${hoverOffset(id)}ms` }
    : undefined;
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
  /** Spec 0089 (Q6 A) -- a stack card's look: its name fits its bar (CardFace's `fit`). */
  fit?: boolean;
  side: "viewer" | "opponent";
  /** A permanent on the table (not a hand card): it can be defeated or exiled. */
  table?: boolean;
  /** Spec 0078 -- its number, counting and tinted (a permanent on the table). */
  figure?: Figure | undefined;
  /**
   * Spec 0083 (15 A) -- a Room on the table: unlocking a door renames it, and
   * only that half's door opens (RoomDoors) -- never A-09's whole-card flip.
   */
  room?: boolean;
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

/**
 * Spec 0073 -- a pile's number changing as its cards land and lift off: the
 * badge React drew says the newest number; until the last change it is
 * hidden, and each number before it is held over it, from `start` cards, as
 * a copy shown only for its own stretch of time (popping as it begins). All
 * of it is one length of time, on the board's animation clock, so a click
 * hurries it with the cards. The copies are the page's own, gone with
 * their animation.
 */
function tickBadge(slot: HTMLElement, start: number, changes: readonly BadgeChange[]) {
  const card = slot.querySelector<HTMLElement>(":scope > .bf-card");
  if (!card || typeof card.animate !== "function") return;
  for (const old of card.querySelectorAll(":scope > .bf-pile-was")) old.remove();
  const total = Math.max(...changes.map((c) => c.at));
  const spells = badgeSpells(start, changes);
  const badge = card.querySelector<HTMLElement>(":scope > .bf-pile:not(.bf-pile-was)");
  spells.forEach((spell, i) => {
    if (spell.n < 2) return;
    const frames = badgeFrames(spell, total, i === 0);
    if (i === spells.length - 1) {
      badge?.animate(frames, { duration: total, easing: "linear" });
      return;
    }
    const held = document.createElement("span");
    held.className = "bf-pile bf-pile-was";
    held.textContent = `×${spell.n}`;
    held.setAttribute("aria-hidden", "true");
    held.dataset["pileWas"] = String(spell.n);
    held.style.opacity = "0";
    card.appendChild(held);
    const run = held.animate(frames, { duration: total, easing: "linear" });
    const gone = () => held.remove();
    run.onfinish = gone;
    run.oncancel = gone;
  });
}

/**
 * Spec 0079 (Q3 B) -- a stack card's "xN" (a storm's copies) changing as
 * copies peel onto it and resolve off it: spec 0073's ticking badge, on the
 * stack card's own number. On the board's animation clock.
 */
function tickMany(slot: HTMLElement, start: number, changes: readonly BadgeChange[]) {
  const tag = slot.querySelector<HTMLElement>(":scope > .bf-stack-tag");
  if (!tag || typeof tag.animate !== "function") return;
  for (const old of tag.querySelectorAll(":scope > .bf-stack-many-was")) old.remove();
  const total = Math.max(...changes.map((c) => c.at));
  if (total <= 0) return;
  const spells = badgeSpells(start, changes);
  const badge = tag.querySelector<HTMLElement>(":scope > .bf-stack-many:not(.bf-stack-many-was)");
  spells.forEach((spell, i) => {
    const frames = badgeFrames(spell, total, i === 0);
    if (i === spells.length - 1) {
      badge?.animate(frames, { duration: total, easing: "linear" });
      return;
    }
    if (spell.n < 2) return;
    const held = document.createElement("span");
    held.className = "bf-stack-many bf-stack-many-was";
    held.textContent = `×${spell.n}`;
    held.setAttribute("aria-hidden", "true");
    held.dataset["manyWas"] = String(spell.n);
    held.style.opacity = "0";
    tag.appendChild(held);
    const run = held.animate(frames, { duration: total, easing: "linear" });
    const gone = () => held.remove();
    run.onfinish = gone;
    run.oncancel = gone;
  });
}

/**
 * Spec 0074 -- a plate tile's number (the library's, a graveyard's, exile's)
 * changing as its cards leave and land, as a pile's badge does (spec 0073):
 * the number drawn is the newest, hidden until the last change; each number
 * before it is held over it as the page's own copy, shown for its stretch,
 * popping as it starts. One length of time, on the board's animation clock.
 */
function tickTile(n: HTMLElement, changes: readonly TileChange[]): Animation | undefined {
  if (typeof n.animate !== "function") return undefined;
  const tile = n.parentElement;
  if (!tile) return undefined;
  for (const old of tile.querySelectorAll(":scope > .gs-zone-was")) old.remove();
  const now = Number(n.textContent);
  if (!Number.isFinite(now)) return undefined;
  const start = now - changes.reduce((sum, c) => sum + c.by, 0);
  const total = Math.max(...changes.map((c) => c.at));
  const spells = tileSpells(start, changes);
  /** The newest number's run: the tile's run (spec 0099 Amendment 1 carries it over). */
  let own: Animation | undefined;
  spells.forEach((spell, i) => {
    const frames = tileFrames(spell, total, i === 0);
    if (i === spells.length - 1) {
      own = n.animate(frames, { duration: total, easing: "linear" });
      return;
    }
    const held = document.createElement("span");
    held.className = "gs-zone-n gs-zone-was";
    held.textContent = String(spell.n);
    held.setAttribute("aria-hidden", "true");
    held.dataset["zoneWas"] = String(spell.n);
    held.style.opacity = "0";
    n.after(held);
    const run = held.animate(frames, { duration: total, easing: "linear" });
    const gone = () => held.remove();
    run.onfinish = gone;
    run.oncancel = gone;
  });
  return own;
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
  /**
   * Spec 0091 Amendment 1 -- not drawn at all for this long: a stack card
   * leaving while the casting card is still flying onto its spot.
   */
  unseen?: number;
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
  /**
   * Spec 0073 (D · Peel off): it lifts off the top of its pile by this much
   * (pixels) before its fate plays.
   */
  peel?: { dx: number; dy: number };
  /** Spec 0073: unseen until it starts -- its pile draws it until then. */
  waits?: boolean;
  /** Spec 0073: killed in a fight its pile fought (it is not a wipe). */
  inFight?: boolean;
  /** Spec 0073: a token made -- it grows out of its source (`box`), then Glides to its pile. */
  token?: boolean;
  /** Spec 0089 (Q5 B) -- a wave's token: how far it bows out mid-flight (piles.ts waveSpread). */
  spread?: { x: number; y: number };
  /** Spec 0073: joining from a zone tile (graveyard, exile...): it starts faint. */
  faint?: boolean;
  /**
   * Spec 0073: out of the other player's hidden hand, turning face up on the
   * way -- "back", the card back narrowing away; "face", the card widening in.
   */
  turn?: "back" | "face";
  /**
   * Spec 0074 -- its whole movement, worked out already (graves.ts): a
   * discard's lift and drop, a milled card's stream, a countered spell's
   * ash, a card rising out of a graveyard or exile, a graveyard swept.
   */
  own?: { frames: Keyframe[]; duration: number };
  /** Spec 0074 -- the top of a milled bundle: its number ("×9"). */
  badge?: number;
  /** Spec 0074 -- under the top of a milled bundle (one shadow for the bundle). */
  bundled?: boolean;
  /** Spec 0074 -- a countered spell: no resolve glow; grey ash rises off it. */
  ash?: boolean;
  /** Spec 0074 -- going into exile out of a graveyard: the pale light rises off it. */
  motes?: boolean;
  /**
   * Spec 0079 -- the card inside turns while it goes (`own`): Clone's old
   * face flipping away (A-09's "out") once the ghost of what it copied has
   * landed on it.
   */
  inner?: { frames: Keyframe[]; duration: number; delay: number };
  /** Spec 0079 -- a copy of a spell, done: gold motes rise off it (from `fxAt`) where it is. */
  gold?: boolean;
  /** Spec 0079 -- a spell that fizzled: smoke rises off it (from `fxAt`). */
  smoke?: boolean;
  /** Spec 0079 -- when its gold motes or smoke start, from when it appeared. */
  fxAt?: number;
  /** Spec 0079 -- it is a copy: the gold copy mark is on it. */
  mark?: boolean;
  /**
   * Spec 0099 Amendment 1 -- a stack object's ghost (its id the stack's):
   * the card it is, so its pile's number waits for it as for any card.
   */
  card?: string | undefined;
}

/**
 * Spec 0074 (F · Struck by the beam) -- the countering spell's beam flaring,
 * the pulse running down it, and the ripple on the countered spell bursting.
 */
interface Strike {
  key: string;
  /** The countered spell's card, for tests and the jump check. */
  of: string;
  d: string;
  points: Point[];
  ring: { at: Point; r: number };
  w: number;
  delay: number;
  /** Spec 0100 item 7 (owner 2026-11-18): the flare takes the striking beam's colour. */
  tone: "mine" | "theirs";
}

/**
 * Spec 0079 (Q4 A) -- a fizzled spell's beam reaching the place of what it
 * aimed at, and the dashed ring there that finds nothing and breaks up.
 */
interface Fizzle {
  key: string;
  /** The fizzled spell's card, for tests and the jump check. */
  of: string;
  d: string;
  ring: { x: number; y: number; r: number };
  w: number;
  delay: number;
}

/** Phase 10 A-14 -- a tag at a destination, or one back of a riffling library: gone when its animation ends. */
interface ReturnMark {
  key: string;
  /** Spec 0073 -- "spark": the flare a token grows out of. */
  kind: "tag" | "riffle" | "spark";
  style: CSSProperties;
  frames: Keyframe[];
  duration: number;
  delay: number;
  text?: string;
  /** The card it is about ("card:N"), for tests and the jump check. */
  of: string;
}

/** Phase 10 A-14 -- tags and riffles above everything on the table and the hand. */
const Z_RETURN_MARK = 9000;

/**
 * Phase 10 A-11, A-12 (owner 2026-11-06, Amendment 15): an attacker steps
 * forward to its side's front line, the next one a beat later; a blocker
 * glides up to stand facing its attacker.
 */
const ATTACK_MS = paced(600);
const ATTACK_BEAT_MS = paced(120);
const BLOCK_MS = paced(650);
const BLOCK_BEAT_MS = paced(160);

/** Spec 0077 -- how long a life change's number floats, its crack shows, its glow lasts. */
const LIFE_MARK_MS = 1000; // not paced: a wait (spec 0106)
const LIFE_CRACK_MS = paced(360);
const LIFE_GLOW_MS = paced(600);

/** Spec 0077 -- the crack across a struck shield (the canvas's), on the shield's 46 x 54. */
const CRACK = (
  <svg viewBox="0 0 46 54" aria-hidden="true">
    <path
      d="M23 6 L20 16 L26 22 L19 33 L24 41 M26 22 L35 27 M19 33 L10 37"
      fill="none"
      stroke="#ff3a24"
      strokeWidth="4"
      opacity=".45"
      strokeLinejoin="round"
    />
    <path
      d="M23 6 L20 16 L26 22 L19 33 L24 41 M26 22 L35 27 M19 33 L10 37"
      fill="none"
      stroke="#fff1e0"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

/** Spec 0083 (13 B) -- the same crack, drawn across a card (stretched to its box). */
const CRACK_CARD = (
  <svg viewBox="0 0 46 54" preserveAspectRatio="none" aria-hidden="true">
    <path
      d="M23 6 L20 16 L26 22 L19 33 L24 41 M26 22 L35 27 M19 33 L10 37"
      fill="none"
      stroke="#ff3a24"
      strokeWidth="4"
      opacity=".45"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
    <path
      d="M23 6 L20 16 L26 22 L19 33 L24 41 M26 22 L35 27 M19 33 L10 37"
      fill="none"
      stroke="#fff1e0"
      strokeWidth="1.6"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
  </svg>
);

/** Spec 0083 (13 B) -- the red flash under a crack: the canvas's, 1.6 of what was hit, over its first 60%. */
const HIT_FLASH_SPAN = 1.6;

/**
 * Spec 0083 (13 B, owner) -- a spell's or an ability's hit: 0077's crack
 * across what it hit (a card's box, or a shield's 46 x 54), with its red
 * flash, on 0077's clock (LIFE_CRACK_MS). The shake is the card's own.
 */
function hitMarks(
  key: string,
  at: Point,
  w: number,
  h: number,
  delay: number,
  of: string,
): FightMark[] {
  const span = w * HIT_FLASH_SPAN;
  return [
    {
      key: `${key}:hitflash`,
      kind: "hitflash",
      style: { left: at.x - span / 2, top: at.y - span / 2, width: span, height: span },
      frames: [
        { offset: 0, opacity: 0 },
        { offset: 0.3, opacity: 0.9 },
        { offset: 0.6, opacity: 0 },
        { offset: 1, opacity: 0 },
      ],
      duration: LIFE_CRACK_MS,
      delay,
      of,
    },
    {
      key: `${key}:crack`,
      kind: "crack",
      card: true,
      impact: of,
      style: { left: at.x - w / 2, top: at.y - h / 2, width: w, height: h },
      frames: [
        { offset: 0, opacity: 0 },
        { offset: 0.15, opacity: 1 },
        { offset: 1, opacity: 0 },
      ],
      duration: LIFE_CRACK_MS,
      delay,
      of,
    },
  ];
}

/**
 * Spec 0077 -- the poison badge's centre, from the life shield's centre: down
 * and to the left, touching the shield, clear of its number (game.css
 * .gs-poison: the same offset, in the rail's 900-pixel units).
 */
export const POISON_DX = -31;
export const POISON_DY = 22;
/** The badge's ring radius, in the rail's 900-pixel units. */
const POISON_R = 19;

/** Spec 0077 -- the poison drop (PoisonBadge's), the poison mark's picture. */
const POISON_DROP = (
  <svg viewBox="-8 -11 16 18" aria-hidden="true" data-drop="poison">
    <path d="M0 -10.2 C6 -1.8 7.8 2.4 6 6 A6.3 6.3 0 0 1 -6 6 C-7.8 2.4 -6 -1.8 0 -10.2Z" />
  </svg>
);

/**
 * Spec 0077 -- poison given: a dark pill in the badge's colours, the drop and
 * the number, rising a little off the badge. Never the gain's bare green
 * "+N" off the shield: a different picture in a different place.
 */
function poisonMark(
  key: string,
  badge: Point,
  amount: number,
  g: Geometry,
  duration: number,
  delay: number,
  of: string,
): FightMark {
  const unit = g.height / 900;
  return {
    key,
    kind: "poison",
    style: { left: badge.x, top: badge.y, fontSize: 15 * unit },
    frames: [
      { offset: 0, opacity: 0, transform: "translate(-50%, -50%) scale(0.6)" },
      { offset: 0.15, opacity: 1, transform: "translate(-50%, -110%) scale(1)" },
      { offset: 0.75, opacity: 1, transform: "translate(-50%, -150%) scale(1)" },
      { offset: 1, opacity: 0, transform: "translate(-50%, -170%) scale(1)" },
    ],
    duration,
    delay,
    text: `${amount}`,
    of,
  };
}
function poisonPoint(life: Point, g: Geometry): Point {
  const unit = g.height / 900;
  return { x: life.x + POISON_DX * unit, y: life.y + POISON_DY * unit };
}

/** Spec 0080 -- a fizzled spell's beam reaches a target still there (0079's beam, about). */
const FIZZLE_WARD_MS = paced(350);
/** Spec 0080 -- a phased-out permanent turning solid again as it phases in. */
export const PHASE_IN_MS = paced(500);

/** Spec 0083 (17) -- the sources' gold pulse (the canvas's 0.7 s). */
const PULSE_MS = paced(700);

/** Spec 0083 (14 C) -- the day/night wash: up 0.45 s, held 0.25 s, down 0.55 s (the canvas's C). */
export const WASH_MS = paced(1250);

/** Spec 0083 (18 B) -- a split-second spell's ring lifts over this long as it resolves (the canvas's). */
const SPLIT_LIFT_MS = paced(250);

/** A card a spell killed leaves once its crack has landed. */
const SPELL_HIT_MS = paced(150);

/**
 * Spec 0084 (5 A) -- a library shuffled after a card came out of it (Rampant
 * Growth's Forest): the riffle starts this long after, once the card has
 * landed (the canvas's 0.85 s from the card setting off).
 */
const SHUFFLE_AFTER_MS = paced(850);

/** Phase 10 A-13: the fights' dimming, above the table; the fighters above it. */
const Z_FIGHT_DIM = 4550;
const Z_FIGHT = 4600;

/** Phase 10 A-13 -- one mark of a fight (fights.ts): drawn, then gone when its animation ends. */
interface FightMark {
  key: string;
  kind:
    | "dim"
    | "caption"
    | "hit"
    | "slash"
    | "number"
    | "gain"
    | "edge"
    | "plate"
    // Spec 0077: a life shield's crack, a gain's green glow, poison's "+N".
    | "crack"
    | "glow"
    | "poison"
    // Spec 0080: the hex dome and its sparks, the prevention shield, a shield mark breaking.
    | "dome"
    | "spark"
    | "ward"
    | "shieldbreak"
    // Spec 0083: a spell's hit's red flash; a split-second spell's ring lifting.
    | "hitflash"
    | "splitring"
    // Spec 0084: a Treasure's coin spark; coming alive's ring, motes and rising P/T.
    | "coin"
    | "alivering"
    | "mote"
    | "ptfloat"
    // Spec 0085: a gained ability's icon rising and settling; a held card's tab flying to its pile.
    | "riser"
    | "heldtab"
    // Spec 0089 (Q4 B): an umbra's tab swinging out, its shield, the shield's pieces.
    | "umbratab"
    | "umbrashield"
    | "shard"
    // Spec 0101: regeneration's green shield, a shield counter's silver one, ward's ring.
    | "regenshield"
    | "silvershield"
    | "wardring";
  /** Spec 0083 (13 B) -- a crack drawn across a card's box (stretched), not a shield's. */
  card?: boolean;
  /** Spec 0083 -- what a spell's hit landed on, for the browser checks (as the burst's was). */
  impact?: string;
  /** Spec 0083 -- a spell's rising "−N": what it landed on (as the old number's attribute). */
  damageNumber?: string;
  style: CSSProperties;
  frames: Keyframe[];
  duration: number;
  delay: number;
  text?: string;
  /** What it marks: an object id or "player:N" (for tests and the jump check). */
  of?: string;
  deathtouch?: boolean;
  /** Spec 0077 -- a mark of poison, drawn in the badge's colours. */
  poison?: boolean;
  /** Spec 0080 -- a number's or spark's colour: grey (nothing dealt), gold, green. */
  tone?: "grey" | "gold" | "green" | "silver";
  /** Spec 0085 -- a riser's mark (its picture). */
  markOf?: CardMark;
  /** Spec 0085 -- a flying held tab: its card as the viewer may know it, and its picture's address. */
  heldTab?: { name: string; known: boolean; src: string | null };
  /** Spec 0089 -- an umbra's shield: the umbra's picture inside it. */
  src?: string | null;
  /** Spec 0089 -- the card this mark draws on its way (the jump check follows it). */
  ghostOf?: string;
}

/**
 * Spec 0084 -- the coin of a spent Treasure (the canvas's coinSet): it fades
 * in over the first 15%, rises a fifth of the card's height, flipping three
 * times, and fades out by the end.
 */
function coinFrames(h: number): Keyframe[] {
  const steps = 10;
  return Array.from({ length: steps + 1 }, (_, k) => {
    const q = k / steps;
    const up = (1 - (1 - q) ** 3) * h * 0.2;
    const flip = Math.abs(Math.cos(q * Math.PI * 3)) * 0.85 + 0.15;
    return {
      offset: q,
      opacity: q < 0.15 ? q / 0.15 : 1 - (q - 0.15) / 0.85,
      transform: `translateY(${-up}px) scaleX(${flip})`,
    };
  });
}

/** Spec 0080 -- survive.ts's marks, as the board draws its fights' marks. */
function asMarks(marks: readonly SurviveMark[]): FightMark[] {
  return marks.map((m) => ({ ...m }));
}

/** Spec 0080 (Q4b F1) -- the dome's hex grid (the canvas's), one pattern per dome. */
function HexDome({ id }: { id: string }) {
  const grid = `bf-hex-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  return (
    <svg viewBox="-60 -70 120 140" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id={grid} width="12" height="10.4" patternUnits="userSpaceOnUse">
          <path
            d="M3 0 H9 L12 5.2 L9 10.4 H3 L0 5.2 Z"
            fill="none"
            stroke="#ffe08a"
            strokeWidth=".9"
          />
        </pattern>
        <radialGradient id={`${grid}-g`}>
          <stop offset="55%" stopColor="#ffd77a" stopOpacity="0" />
          <stop offset="100%" stopColor="#ffd77a" stopOpacity=".55" />
        </radialGradient>
      </defs>
      <ellipse rx="58" ry="68" fill={`url(#${grid}-g)`} />
      <ellipse rx="58" ry="68" fill={`url(#${grid})`} opacity=".8" />
      <ellipse rx="58" ry="68" fill="none" stroke="#fff3c4" strokeWidth="1.6" />
    </svg>
  );
}

/**
 * Spec 0089 (Q4 B, variant b) -- the umbra's gold heater shield, the
 * canvas's shape (100 x 122), with the umbra's own picture inside (a gold
 * gradient when it has none), an inner rim, and the crack drawn across it at
 * the blow (CSS, delayed to --crack-at on the board's clock).
 */
function UmbraShield({
  id,
  src,
  tone = "gold",
}: {
  id: string;
  src: string | null;
  /** Spec 0101, row 3 -- "silver": a shield counter's steel-blue heater shield (the canvas's #b4c2d2). */
  tone?: "gold" | "silver";
}) {
  const clip = `bf-umbra-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const silver = tone === "silver";
  const heater = "M6 6 H94 V50 C94 84 72 104 50 116 C28 104 6 84 6 50 Z";
  return (
    <svg viewBox="0 0 100 122" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <clipPath id={clip}>
          <path d={heater} />
        </clipPath>
        <linearGradient id={`${clip}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={silver ? "#e4ebf3" : "#f2e6b0"} />
          <stop offset="1" stopColor={silver ? "#3c4856" : "#8a6a2a"} />
        </linearGradient>
      </defs>
      <path d={heater} fill={`url(#${clip}-g)`} fillOpacity=".82" />
      {src && (
        <image
          href={src}
          x="6"
          y="6"
          width="88"
          height="110"
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${clip})`}
          opacity=".9"
        />
      )}
      <path d={heater} fill="none" stroke={silver ? "#b4c2d2" : "#f2c46a"} strokeWidth="4" />
      <path
        d="M14 14 H86 V50 C86 78 68 95 50 105 C32 95 14 78 14 50 Z"
        fill="none"
        stroke="#fff3c8"
        strokeWidth="1.6"
        opacity=".8"
      />
      <g
        className="bf-umbra-crack"
        fill="none"
        stroke="#fffaf0"
        strokeWidth="2.2"
        strokeLinecap="round"
      >
        <path d="M50 50 L36 30 L30 14 M50 50 L66 34 L74 18 M50 50 L44 74 L50 100 M50 50 L72 62 M50 50 L24 60" />
      </g>
    </svg>
  );
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
const TETHERS_GONE_MS = 30_000; // not paced: a limit (spec 0106)

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
  kind: "number" | "spark";
  /** What was hit: an object id, or "player:N". */
  target: string;
  at: Point;
  amount: number;
  delay: number;
  /** A spark's end: where it travels to (spec 0028). */
  to?: Point;
}

/** Spec 0063 -- how long a line takes to fade out when it goes (battlefield.css bf-line-out). */
const LINE_OUT_MS = paced(160);

/** Spec 0100, item 8 (combat Q4 A) -- a beam's end swinging to its new target: 0.4 s. */
const SWING_MS = paced(400);
/** Spec 0100, item 3 -- an overloaded spell's fan: at most this many beams drawn (the canvas's 6); corners on all. */
const HITS_DRAWN = 6;

/** Spec 0100, item 5 -- the peek card's size, of a table card (the canvas's 0.8). */
export const PEEK_SCALE = 0.8;

/**
 * Spec 0100, item 5 (missed Q2 A) -- the card a spell aims at in a pile,
 * peeking out of its tile: 0.8 of a table card (the canvas's PEEK, owner
 * 2026-11-18: its name readable), face up, lifted up and out to
 * the table side of the tile (the canvas's PEEK: left of the tile, a little
 * above its middle). The tiles are in the rail, right of the table, so
 * it stands just left of the rail, wholly on the table.
 */
export function peekBox(tile: Point, g: Geometry): Box {
  const h = g.cardH * PEEK_SCALE;
  const w = g.cardW * PEEK_SCALE;
  return {
    x: g.rail.x - w - w * 0.25,
    y: tile.y - h * 0.62,
    w,
    h,
    scale: PEEK_SCALE,
    rotation: 0,
    z: 0,
  };
}

/**
 * Spec 0100, item 5 -- the peek card: it rises a little out of its tile
 * (from the tile's middle, small, to its place, 450 ms -- a Web Animation,
 * so a click hurries it), face up, wearing the four still corners while the
 * spell aims at it. With motion turned down it is simply there.
 */
function PeekCard({
  card,
  box,
  tile,
  theirs,
  artUrl,
  z,
}: {
  card: PiledCard;
  box: Box;
  tile: Point;
  theirs: boolean;
  artUrl: (art: string) => string;
  z: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function" || reducedMotion()) return undefined;
    const dx = tile.x - (box.x + box.w / 2);
    const dy = tile.y - (box.y + box.h / 2);
    const rise = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(0.45)`, opacity: 0.4 },
        {
          transform: `translate(${dx * 0.4}px, ${dy * 0.4 - box.h * 0.12}px) scale(0.8)`,
          opacity: 1,
          offset: 0.55,
        },
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
      ],
      { duration: paced(450), easing: "cubic-bezier(.3,.7,.3,1)" },
    );
    return () => rise.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as it comes out
  }, [card.id]);
  return (
    <div
      ref={ref}
      className="bf-peek"
      data-peek-of={card.id}
      data-peek-zone={card.zone}
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        zIndex: z,
        ["--card-h" as string]: `${box.h}px`,
      }}
      aria-hidden="true"
    >
      <Sight theirs={theirs} />
      <div className="bf-peek-card">
        <CardFace
          name={card.name}
          look={lookOf(card.look, "")}
          type=""
          pt=""
          art={card.art ? artUrl(card.art) : null}
          crop={card.crop ? artUrl(card.crop) : null}
          faceDown={false}
          known
          cost={null}
          fit
        />
      </div>
    </div>
  );
}

/** The four sight corners round a box, in the lines' own coordinates (Sight's numbers). */
function cornerPaths(box: Box): string {
  const out = box.h * SIGHT_OUT;
  const arm = box.h * SIGHT_ARM;
  const x0 = box.x - out;
  const y0 = box.y - out;
  const x1 = box.x + box.w + out;
  const y1 = box.y + box.h + out;
  return [
    `M${x0} ${y0 + arm}V${y0}H${x0 + arm}`,
    `M${x1 - arm} ${y0}H${x1}V${y0 + arm}`,
    `M${x1} ${y1 - arm}V${y1}H${x1 - arm}`,
    `M${x0 + arm} ${y1}H${x0}V${y1 - arm}`,
  ].join(" ");
}

/**
 * Spec 0100, item 8 (combat Q4 A) -- a beam whose spell changed target:
 * its end swings from where it pointed to the new target in one motion
 * (SWING_MS, lifted on the way as the canvas's), its corners riding with
 * it; then it is the beam at rest. The motion is a Web Animation's clock,
 * so a click hurries it (A-00); one element throughout.
 */
function SwingBeam({
  look,
  route,
  aim,
  routeTo,
  w,
  onDone,
}: {
  look: BeamLook & { swing: NonNullable<BeamLook["swing"]> };
  route: Route;
  aim: { at: Point; r: number } | undefined;
  routeTo: (end: Point) => Route;
  w: number;
  onDone: (id: string) => void;
}) {
  const ref = useRef<SVGGElement>(null);
  const [q, setQ] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;
  const id = look.swing.id;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") {
      setQ(1);
      done.current(id);
      return undefined;
    }
    const clock = el.animate([{ opacity: 1 }, { opacity: 1 }], { duration: SWING_MS });
    let frame = 0;
    const step = () => {
      const t = Number(clock.currentTime ?? SWING_MS) / SWING_MS;
      setQ(Math.min(1, t));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    clock.onfinish = () => {
      setQ(1);
      done.current(id);
    };
    return () => {
      cancelAnimationFrame(frame);
      clock.cancel();
    };
  }, [id]);
  const tip = route[route.length - 1]!.end;
  const from = look.swing.from;
  const e = q < 0.5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2;
  const lift =
    Math.min(110, 0.55 * Math.hypot(tip.x - from.x, tip.y - from.y)) * Math.sin(Math.PI * e);
  const end = { x: from.x + (tip.x - from.x) * e, y: from.y + (tip.y - from.y) * e - lift };
  const a = look.swing.box;
  const b = look.swing.to;
  const corners =
    q < 1 && a && b
      ? cornerPaths({
          ...b,
          x: a.x + (b.x - a.x) * e,
          y: a.y + (b.y - a.y) * e - lift,
          w: a.w + (b.w - a.w) * e,
          h: a.h + (b.h - a.h) * e,
        })
      : null;
  return (
    <g ref={ref} data-swing={id} data-swing-at={q.toFixed(2)}>
      <TargetBeam
        route={q >= 1 ? route : routeTo(end)}
        aim={q >= 1 ? aim : undefined}
        w={w}
        reduced={false}
        tone={look.tone}
        doubled={!!look.doubled}
        share={q >= 1 ? look.share : undefined}
      />
      {corners && (
        <g className="bf-swing-sight" data-sight-tone={look.tone === "theirs" ? "theirs" : "mine"}>
          <path
            d={corners}
            fill="none"
            stroke="#0b0f0d"
            strokeWidth={a!.h * SIGHT_ARM * (8 / 24)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={corners}
            fill="none"
            stroke={look.tone === "theirs" ? "#aeb8ff" : "#ffd98a"}
            strokeWidth={a!.h * SIGHT_ARM * (4 / 24)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
    </g>
  );
}

/** Spec 0028 — how long a resolving stack card glows, its spark travelling, before it leaves. */
const RESOLVE_MS = paced(380);

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
  /** Spec 0100 -- how a target beam looks: whose (item 7), kicked (item 3), its share (item 4). */
  look?: BeamLook;
}

/** Spec 0100 -- a target beam's look. */
interface BeamLook {
  tone: BeamTone;
  doubled?: boolean;
  share?: number;
  /** Item 8 -- its end swinging from where it pointed before (that end, and the card's box there). */
  swing?: { from: Point; box: Box | null; to: Box | null; id: string };
  /** Item 8 -- the beam from its stack card to any point (the swing's path on the way). */
  routeTo?: (end: Point) => Route;
}

const refKey = (ref: TargetRef) => ("player" in ref ? `player:${ref.player}` : ref.object);

/** Spec 0066, item 2 -- where a stack card's arrows leave: its stud, on its left edge. */
function studAtOf(spot: readonly Box[], index: number, cardH: number): Point | null {
  const box = spot[index];
  return box ? { x: box.x - box.h * 0.02, y: studY(spot, index, cardH) } : null;
}

/**
 * Spec 0069, item 4 -- a beam from a stack card's stud (`from`) to another
 * stack card (`to`, its place): the ripple beside that card's name, left of
 * its badges. Spec 0074: a countering spell's beam strikes along this.
 */
function stackBeam(
  spot: readonly Box[],
  from: Point,
  to: number,
  cardH: number,
  gap: number,
): { route: Route; aim: { at: Point; r: number } } {
  const r = cardH * 0.1;
  const badge = stackBadgeRects(spot, cardH)[to]!;
  const at = { x: badge.x0 - r - gap * 2, y: (badge.y0 + badge.y1) / 2 };
  const end = ringEdge(at, from, r + gap);
  const d = Math.hypot(end.x - from.x, end.y - from.y) * 0.5;
  return {
    route: [
      {
        start: from,
        c1: { x: from.x - d, y: from.y },
        c2: { x: end.x - d * 0.35, y: end.y + (from.y - end.y) * 0.45 },
        end,
      },
    ],
    aim: { at, r },
  };
}

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

/**
 * Spec 0096 -- what a click and a right-click on an object do: pick it (with
 * the whole pile, for "block with all of these"), or show it close up.
 */
function actHandlers(
  id: string,
  ids: readonly string[],
  onPick: ((objectId: string, members?: readonly string[]) => void) | undefined,
  onInspect: ((objectId: string) => void) | undefined,
) {
  return {
    // Spec 0037: and the whole stack, for "block with all of these".
    onClick: onPick ? () => onPick(id, ids) : undefined,
    onContextMenu: onInspect
      ? (event: { preventDefault: () => void }) => {
          event.preventDefault();
          onInspect(id);
        }
      : undefined,
  };
}

/** Spec 0096 -- an object's drawing as last made: its key, its maker, and the Item it was last in. */
interface Drawing {
  key: unknown;
  make: unknown;
  drawn: Drawn;
  content: ReactNode;
  item: Item | null;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** Spec 0096 -- an object's marks as act() gives them, without its handlers (made anew each time). */
function marksOnly<M extends { handlers: unknown }>(marks: M): Omit<M, "handlers"> {
  const { handlers, ...rest } = marks;
  void handlers;
  return rest;
}

/** Spec 0096 -- act()'s marks for one object (no handlers). */
interface Marks {
  pickId: string;
  className: string;
  words: string[];
  marks: number;
  chosen: boolean;
  targeted: boolean;
  /** Spec 0100, item 7 -- targeted by the other player's spell or ability. */
  theirs: boolean;
  pay: PayMark | undefined;
  breathing: boolean;
  still: boolean;
  data: Record<string, string | undefined>;
}

/**
 * Spec 0096 -- everything a permanent's drawing on the table is made from.
 * Its drawing is made from this alone (tableCard is outside the Board, so it
 * cannot read anything else), and a key the same as last update's keeps last
 * update's drawing: React skips a card nothing happened to.
 */
interface TableCardKey {
  lead: BoardCard;
  attached: readonly BoardCard[];
  row: string;
  /** Who it blocks: the attacker it stands facing, else Forge's. */
  blocks: string | undefined;
  count: number;
  shownCount: number;
  side: "viewer" | "opponent";
  label: string;
  /** The pile's members (a click picks with them all). */
  ids: readonly string[];
  act: Marks;
  tags: readonly Marks[];
  crowded: boolean;
  aims: string | undefined;
  aimedHere: boolean;
  attacked: "hot" | "true" | undefined;
  pointedBlocker: boolean;
  inStep: boolean;
  zzStep: boolean;
  gone: readonly GoneMark[] | undefined;
  onGone: (key: string) => void;
  artUrl: (art: string) => string;
  onPick: ((objectId: string, members?: readonly string[]) => void) | undefined;
  onInspect: ((objectId: string) => void) | undefined;
  setAimed: (next: string | null | ((now: string | null) => string | null)) => void;
  viewerSeat: number;
  viewerName: string | null;
  opponentName: string;
}

/** Spec 0096 -- a permanent's drawing on the table, from its key alone. */
function tableCard(k: TableCardKey): { drawn: Drawn; content: ReactNode } {
  const { lead, attached, count, shownCount, side, label } = k;
  const look = lookOf(lead.kind, lead.types);
  const pt = figure(lead);
  // Spec 0085 (4 A) -- the cards it holds in exile, each a picture tab.
  const holding = lead.holding ?? [];
  const handlers = actHandlers(k.act.pickId, [...k.ids], k.onPick, k.onInspect);
  // Spec 0090 (2): its glow, and (3) a flyer's hover classes, which the glow wears too.
  const breathes = k.act.breathing && !k.act.pay && (flies(lead) || !k.act.still);
  const flyClass = flies(lead) ? (k.crowded ? " bf-fly bf-fly-bob" : " bf-fly") : "";
  const drawn: Drawn = {
    name: lead.name,
    look,
    type: shortType(lead.types),
    pt,
    art: lead.art ? k.artUrl(lead.art) : null,
    crop: lead.crop ? k.artUrl(lead.crop) : null,
    faceDown: lead.faceDown,
    known: lead.known,
    side,
    table: true,
    ...(lead.doors ? { room: true } : {}),
    figure: {
      card: lead.id,
      size: sizeOf(lead),
      basePower: lead.basePower,
      baseToughness: lead.baseToughness,
      damage: lead.damage,
    },
  };
  return {
    drawn,
    content: (
      <>
        {/* Spec 0088 (Q5 C) -- targeted: four still gold corners just outside it. */}
        {k.act.targeted && <Sight theirs={k.act.theirs} />}
        {flies(lead) && (
          <span
            className={`bf-fly-shadow${k.crowded ? " bf-fly-bob" : ""}`}
            aria-hidden="true"
            style={hoverDelay(lead.id, k.inStep)}
          />
        )}
        <button
          type="button"
          className={`bf-card bf-look-${look}${lead.tapped ? " bf-dim" : ""}${lead.attacking ? " bf-attacking" : ""}${lead.blocking ? " bf-blocking" : ""}${k.act.className}${breathes ? " bf-breathes" : ""}${flyClass}`}
          style={flies(lead) ? hoverDelay(lead.id, k.inStep) : undefined}
          aria-label={label}
          {...k.act.data}
          {...handlers}
          data-object-id={lead.id}
          data-zone={k.row}
          data-controller={side}
          data-tapped={String(lead.tapped)}
          data-attacking={lead.attacking ? "true" : undefined}
          // Spec 0080 (Q2 A): a ghost in its place -- see-through and
          // grey, shimmering; never clicked or aimed at (battlefield.css).
          data-phased={lead.phasedOut ? "true" : undefined}
          {...(lead.phasedOut ? { tabIndex: -1, "aria-disabled": true } : {})}
          data-pt={pt || undefined}
          data-face={lead.faceDown ? "down" : "up"}
          data-pile={count > 1 ? count : undefined}
          // Spec 0103, items 1-2 -- every member's id: a report row lights the pile its card is in.
          data-members-ids={count > 1 ? k.ids.join(" ") : undefined}
          data-blocking={lead.blocking ? "true" : undefined}
          data-blocks={k.blocks}
          data-aims={k.aims}
          data-aimed={k.aimedHere ? "true" : undefined}
          data-attacked={k.attacked}
          data-pointed-blocker={k.pointedBlocker ? "true" : undefined}
          {...(k.aims !== undefined
            ? {
                // Spec 0059 item 9, spec 0063: pointing, keyboard focus,
                // or a tap on a touch screen (which has no pointing)
                // shows its line -- every attacker, blocked ones and
                // piles too.
                onPointerEnter: (event: { pointerType: string }) => {
                  if (event.pointerType !== "touch") k.setAimed(lead.id);
                },
                onPointerLeave: (event: { pointerType: string }) => {
                  if (event.pointerType !== "touch")
                    k.setAimed((now) => (now === lead.id ? null : now));
                },
                onPointerDown: (event: { pointerType: string }) => {
                  if (event.pointerType === "touch")
                    k.setAimed((now) => (now === lead.id ? null : lead.id));
                },
                // Spec 0063: only focus the keyboard gave (a click
                // focuses the card too, and must not leave it pointed at).
                onFocus: (event: { currentTarget: Element }) => {
                  if (keyboardFocus(event.currentTarget)) k.setAimed(lead.id);
                },
                onBlur: () => k.setAimed((now) => (now === lead.id ? null : now)),
              }
            : {})}
        >
          {/* Spec 0083 (15 A) -- a Room: its two doors, the locked ones
              closed with the gold keyhole square; one swings open as it
              unlocks, and the other half does not move. */}
          {lead.doors && !lead.faceDown ? (
            <RoomFace
              id={lead.id}
              doors={lead.doors}
              locked={lead.lockedHalves ?? []}
              art={drawn.art}
              crop={drawn.crop ?? null}
              look={look}
            />
          ) : (
            <CardFace {...drawn} />
          )}
          {/* Spec 0076 -- its counters and the Ring-bearer as badges, low
              on the left; pointing says spec 0045's words. They keep
              clear of everything else on the card (item 5): the state
              word, the x N, a land's mana symbols, the zZz. */}
          <CardBadges
            card={lead}
            artUrl={k.artUrl}
            gone={k.gone}
            onGone={k.onGone}
            pile={count > 1}
            room={{
              pile: count > 1,
              mana: Boolean(lead.makes && lead.makes.length > 0 && !lead.faceDown),
              state: Boolean(k.act.chosen || lead.blocking || lead.attacking || lead.tapped),
              zzz: sick(lead),
              zone: Boolean(lead.sector || lead.sprocket),
            }}
          />
          {k.act.chosen ? (
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
          {shownCount > 1 && <span className="bf-pile">×{shownCount}</span>}
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
          {/* Owner 2026-11-01 (item 3) -- came in this turn: drifting zZz. */}
          {sick(lead) && (
            // Spec 0092 (3) -- a third of a loop apart, so they never stack.
            <span className="bf-zz" aria-hidden="true" data-in-step={k.zzStep ? "true" : undefined}>
              <i style={zzDelay(lead.id, 0, k.zzStep)}>z</i>
              <i style={zzDelay(lead.id, 1, k.zzStep)}>z</i>
              <i style={zzDelay(lead.id, 2, k.zzStep)}>z</i>
            </span>
          )}
          {lead.sector && <span className="bf-zone">{lead.sector}</span>}
          {lead.sprocket && <span className="bf-zone">Sprocket {lead.sprocket}</span>}
        </button>
        {/* Spec 0090 (2): its glow, over its edge, as its shadow was. */}
        {breathes && (
          <Breath className={flyClass} style={breathStyle(lead.id, flies(lead), k.inStep)} />
        )}
        {k.act.pay && (
          // Spec 0070, Amendment 1: picked to pay -- the cost's sign on the
          // card's corner (beside the card, which clips its edge); no words.
          <PaySign tone={k.act.pay.tone} />
        )}
        {/* Amendment 13 (item 10): the seal hangs over the card's corner, so
            it sits beside the card, which clips what crosses its edge. */}
        {k.act.marks > 0 && (
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
            {count > 1 && <b>{k.act.marks}</b>}
          </span>
        )}
        {(attached.length > 0 || holding.length > 0) && (
          // Auras and Equipment as tabs on the host's right edge (Phase
          // 10 A-17, owner 2026-11-06; name tags across its picture
          // before, AMENDMENT 4), fanning past TAB_FAN. Each is its own
          // button, with its own id, so it can be targeted and inspected
          // like any permanent.
          <div className="bf-tags" data-tabs={attached.length + holding.length}>
            {attached.map((card, index) => {
              const tagLook = lookOf(card.kind, card.types);
              const tagAct = k.tags[index]!;
              // Spec 0090 (2): a tab's glow is its own soft layer, beside it.
              const tagPlace = {
                left: `calc(var(--card-h) * ${tabAt(index, attached.length + holding.length)})`,
                zIndex: attached.length + holding.length - index,
              };
              const tagBreathes = tagAct.breathing;
              return (
                <Fragment key={card.id}>
                  <button
                    type="button"
                    style={tagPlace}
                    className={`bf-tag bf-look-${tagLook}${tagAct.className}${tagBreathes ? " bf-breathes" : ""}`}
                    {...tagAct.data}
                    {...actHandlers(tagAct.pickId, [card.id], k.onPick, k.onInspect)}
                    aria-label={[
                      `${card.name}, attached to ${lead.faceDown && !lead.known ? "a face-down card" : lead.name}`,
                      (card.seat === k.viewerSeat ? "viewer" : "opponent") === "viewer"
                        ? k.viewerName
                          ? `${k.viewerName}'s`
                          : "yours"
                        : k.viewerName
                          ? `${k.opponentName}'s`
                          : "opponent's",
                      ...tagAct.words,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                    data-object-id={card.id}
                    data-zone={k.row}
                    data-controller={card.seat === k.viewerSeat ? "viewer" : "opponent"}
                    data-attached-to={lead.id}
                    data-tapped={String(card.tapped)}
                    data-face="up"
                  >
                    <Glyph look={tagLook} className="bf-tag-glyph" />
                    <span className="bf-tag-name">{card.name}</span>
                  </button>
                  {tagBreathes && <Breath className=" bf-breath-tag" style={tagPlace} />}
                </Fragment>
              );
            })}
            {/* Spec 0085 (4 A) -- each card it holds in exile: a picture
                tab after its Aura and Equipment tabs, the held card's
                picture and name (a face-down one the viewer may not see:
                a back, no name). */}
            {holding.map((held, j) => (
              <span
                key={held.id}
                className="bf-tag bf-tag-held"
                style={{
                  left: `calc(var(--card-h) * ${tabAt(attached.length + j, attached.length + holding.length)})`,
                  zIndex: holding.length - j,
                }}
                title={
                  held.known ? `Holding ${held.name} in exile` : "Holding a face-down card in exile"
                }
                data-held-card={held.id}
                data-held-by={lead.id}
                data-face={held.known ? "up" : "down"}
              >
                <HeldPicture held={held} artUrl={k.artUrl} />
                {held.known && <span className="bf-tag-name">{held.name}</span>}
              </span>
            ))}
          </div>
        )}
      </>
    ),
  };
}

/**
 * Spec 0096 -- one placed object's slot. Memoised: an object whose box,
 * size, z and drawing are the same as last time is skipped whole (its
 * drawing is the same element, kept by the Board's `drawings`).
 */
const SlotView = memo(function SlotView({
  id,
  box,
  origin,
  z,
  cardW,
  cardH,
  landing,
  register,
  children,
}: {
  id: string;
  box: Box;
  origin: { x: number; y: number };
  z: number;
  cardW: number;
  cardH: number;
  /** A card landing on its pile: not drawn, but still there to click. */
  landing: boolean;
  register: (id: string, element: HTMLDivElement | null) => void;
  children: ReactNode;
}) {
  const ref = useCallback(
    (element: HTMLDivElement | null) => register(id, element),
    [register, id],
  );
  return (
    <div
      ref={ref}
      className="bf-slot"
      data-z={z}
      style={{
        width: cardW,
        height: cardH,
        ...placement(box, cardW, cardH, origin),
        zIndex: z,
        ...(landing
          ? // Not drawn, but still there to click (a target chosen while
            // it lands); it goes straight to its place (no glide), so
            // it is there when the card lands on it.
            { opacity: 0, transition: "none" }
          : {}),
      }}
    >
      {children}
    </div>
  );
});

type SetPointed = (next: string | null | ((now: string | null) => string | null)) => void;

/** Spec 0096 -- everything a card in your hand is drawn from (see TableCardKey). */
interface HandCardKey {
  card: BoardHandCard;
  now: string | null;
  zoomed: boolean;
  act: Marks;
  opponentName: string;
  artUrl: (art: string) => string;
  onPick: ((objectId: string, members?: readonly string[]) => void) | undefined;
  onInspect: ((objectId: string) => void) | undefined;
  setPointed: SetPointed;
}

/** Spec 0096 -- a card in your hand, from its key alone. */
function handCard(k: HandCardKey): { drawn: Drawn; content: ReactNode } {
  const { card, now, zoomed } = k;
  const look = lookOf(card.kind, card.types);
  const pt = figure(card);
  const drawn: Drawn = {
    name: card.name,
    look,
    type: shortType(card.types),
    pt,
    art: card.art ? k.artUrl(card.art) : null,
    crop: card.crop ? k.artUrl(card.crop) : null,
    faceDown: false,
    side: "viewer",
    cost: now ?? card.manaCost ?? null,
    costChange: costChange(now, card.manaCost),
    costFirst: true,
  };
  const handBreathes = k.act.breathing && !k.act.pay && !k.act.still;
  const show = () => k.setPointed(card.id);
  const hide = () => k.setPointed((was) => (was === card.id ? null : was));
  return {
    drawn,
    content: (
      <>
        <button
          type="button"
          className={`bf-card bf-hand bf-look-${look}${k.act.className}${handBreathes ? " bf-breathes" : ""}`}
          aria-label={[
            `${card.name}, in your hand`,
            pt,
            card.seen ? `${k.opponentName} has seen it` : "",
            ...k.act.words,
          ]
            .filter(Boolean)
            .join(", ")}
          {...k.act.data}
          {...actHandlers(k.act.pickId, [card.id], k.onPick, k.onInspect)}
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
        {handBreathes && <Breath />}
        {k.act.pay ? (
          <PaySign tone={k.act.pay.tone} corner="top-left" />
        ) : (
          // Amendment 1: the other player has seen this card -- the eye,
          // until it leaves your hand.
          card.seen && <PaySign tone="reveal" seen corner="top-left" />
        )}
      </>
    ),
  };
}

/** Spec 0096 -- everything a card in the other player's hand is drawn from. */
interface TheirHandCardKey {
  card: OpponentHandCard;
  nth: number;
  of: number;
  slid: boolean;
  opponentName: string;
  artUrl: (art: string) => string;
  onOpponentHand: (() => void) | undefined;
  setPointed: SetPointed;
}

/** Spec 0096 -- a card in the other player's hand, from its key alone. */
function theirHandCard(k: TheirHandCardKey): { drawn: Drawn; content: ReactNode } {
  const { card, slid, opponentName } = k;
  const shown = card.shown;
  const show = () => k.setPointed(card.id);
  const hide = () => k.setPointed((was) => (was === card.id ? null : was));
  const drawn: Drawn = shown
    ? {
        name: shown.name,
        look: lookOf(shown.kind, shown.types),
        type: shortType(shown.types),
        pt: figure(shown),
        art: shown.art ? k.artUrl(shown.art) : null,
        crop: shown.crop ? k.artUrl(shown.crop) : null,
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
  return {
    drawn,
    content: (
      <>
        <button
          type="button"
          className={`bf-card bf-opp-hand${shown ? ` bf-look-${drawn.look} bf-opp-hand-shown` : ""}`}
          aria-label={
            shown
              ? `${shown.name}, in ${opponentName}'s hand, ${shown.seen ? "revealed to you" : "shown to you"}`
              : `Card ${k.nth + 1} of ${k.of} in ${opponentName}'s hand`
          }
          disabled={!k.onOpponentHand}
          onClick={k.onOpponentHand}
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
  };
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
const NO_STACK: readonly StackView[] = [];
const NO_FANS: readonly FanCard[] = [];

/**
 * Spec 0087 -- the fans as the board before drew them: the cards, where each
 * stood, its look (a copy of its element), the pile cards then, and where
 * each card that left a fan and no pile last stood (a card cast for free a
 * board later -- a suspended one at 0 -- still rises from there).
 */
interface FanBefore {
  fans: readonly FanCard[];
  boxes: Map<string, Box>;
  clones: Map<string, HTMLElement>;
  piles: ReadonlySet<string>;
  gone: Map<string, { box: Box; at: number }>;
  /** Spec 0106 -- the sides whose fan had a "+N". */
  more: ReadonlySet<Side>;
}
/** How long a card gone from a fan is still risen from there. */
const FAN_GONE_MS = 10_000; // not paced: a limit (spec 0106)
/** A card new to its pile waits for this after what the board brings there has landed. */
const FAN_AFTER_LAND_MS = 150; // not paced: a wait (spec 0106)

/**
 * Spec 0087 (the canvas's movements) -- once per board, on the board's clock
 * (a click hurries every part, A-00):
 *   - a card that may now be used rises out of its tile into its place in
 *     the fan (0.45 s), once what the board brings to that tile has landed
 *     (Stomp's card on its adventure, Think Twice into the graveyard), its
 *     glow swelling as it lands and the tile pulsing as it leaves;
 *   - one that no longer may, and is still in its pile, sinks back into its
 *     tile (its look as it was, shrinking and fading there);
 *   - the others glide to their new places: the fan closes the gap;
 *   - a suspended card's time badge pops to its new number as its upkeep
 *     trigger resolves, a rising -N above it.
 * Under reduced motion none of this runs (the effect's caller skips it).
 */
function playFans({
  fans,
  more = [],
  was,
  boxes,
  piles,
  cards,
  rail,
  where,
  g,
  hold,
  resolved,
  landed,
}: {
  fans: readonly FanCard[];
  /** Spec 0106 -- each side's "+N" now. */
  more?: readonly FanMore[];
  was: FanBefore;
  boxes: ReadonlyMap<string, Box>;
  piles: ReadonlySet<string> | undefined;
  cards: HTMLElement | null;
  rail: HTMLElement | null;
  where: Record<AnchorId, Point>;
  g: Geometry;
  hold: number;
  resolved: boolean;
  landed: (tile: string) => number;
}) {
  if (!cards) return;
  const k = g.height / 1080;
  const wasCards = new Map(was.fans.map((c) => [c.id, c]));
  const tileScale = (box: Box) => (g.cardH * AT_ZONE_SCALE) / Math.max(1, box.h);
  const settle = hold + (resolved ? RESOLVE_MS : 0);
  // Spec 0087 -- when each tile's first card rises out of it (its glow waits for that).
  const firstRise = new Map<string, number>();
  // Spec 0106 -- when each side's last new card has risen (a new "+N" pops in then).
  const risen = new Map<Side, number>();
  for (const card of fans) {
    const el = cards.querySelector<HTMLElement>(`:scope > [data-fan-card="${card.id}"]`);
    const box = boxes.get(card.id);
    if (!el || !box || typeof el.animate !== "function") continue;
    const tile = `${card.side}:${card.zone}` as AnchorId;
    const old = was.boxes.get(card.id);
    const prior = wasCards.get(card.id);
    if (!old) {
      // New to its pile this board: once it has landed there.
      const fresh = !was.piles.has(card.id);
      const delay = Math.max(
        hold,
        landed(tile) + (landed(tile) > 0 ? FAN_AFTER_LAND_MS : 0),
        fresh ? settle + MOVE_MS + FAN_AFTER_LAND_MS : 0,
      );
      if (card.how !== "suspended")
        firstRise.set(tile, Math.min(firstRise.get(tile) ?? Infinity, delay));
      risen.set(card.side, Math.max(risen.get(card.side) ?? 0, delay + FAN_RISE_MS));
      el.animate(riseFrames(where[tile], box, tileScale(box)), {
        duration: FAN_RISE_MS,
        delay,
        easing: "ease-in-out",
        fill: "backwards",
      });
      // Spec 0099 (Q2b) -- not drawn until it rises (after the rise, so it wins).
      if (delay > 0) el.animate(FAN_WAIT, { duration: delay, easing: "linear" });
      const face = el.querySelector<HTMLElement>(":scope > .bf-fan-face");
      if (face && card.how !== "suspended" && typeof face.animate === "function")
        face.animate(FAN_SWELL, {
          duration: FAN_GLOW_MS,
          delay: delay + FAN_RISE_MS * 0.6,
          easing: "ease-in-out",
        });
      const plate = rail?.querySelector<HTMLElement>(`[data-zone-tile="${tile}"]`);
      if (plate && card.how !== "suspended" && typeof plate.animate === "function")
        plate.animate(TILE_PULSE, { duration: TILE_PULSE_MS, delay, easing: "ease-in-out" });
    } else if (Math.abs(old.x - box.x) > 0.5 || Math.abs(old.y - box.y) > 0.5) {
      el.animate(closeFrames(old, box), {
        duration: FAN_CLOSE_MS,
        delay: hold,
        easing: "ease-in-out",
        fill: "backwards",
      });
    }
    // Spec 0087 (3) -- the time badge ticks as its upkeep trigger resolves.
    if (prior && prior.time !== null && card.time !== null && card.time !== prior.time) {
      const badge = el.querySelector<HTMLElement>(":scope > .bf-fan-time");
      const n = badge?.querySelector<HTMLElement>(":scope > .bf-fan-time-n");
      if (badge && n && typeof badge.animate === "function") {
        const held = document.createElement("span");
        held.className = "bf-fan-time-n bf-fan-time-was";
        held.textContent = String(prior.time);
        held.setAttribute("aria-hidden", "true");
        held.dataset["timeWas"] = String(prior.time);
        badge.appendChild(held);
        const keep = held.animate([{ opacity: 1 }, { opacity: 1 }], {
          duration: Math.max(1, settle),
        });
        const drop = () => held.remove();
        keep.onfinish = drop;
        keep.oncancel = drop;
        n.animate([{ opacity: 0 }, { opacity: 0 }], { duration: Math.max(1, settle) });
        badge.animate(TIME_POP, { duration: FAN_TICK_MS, delay: settle, easing: "ease-out" });
        const by = card.time - prior.time;
        const float = document.createElement("span");
        float.className = `bf-fan-float ${by < 0 ? "bf-fan-float-down" : "bf-fan-float-up"}`;
        float.textContent = by < 0 ? `\u2212${-by}` : `+${by}`;
        float.setAttribute("aria-hidden", "true");
        float.dataset["fanFloat"] = card.id;
        const b = badge.getBoundingClientRect();
        const root = cards.getBoundingClientRect();
        const scale = cards.offsetWidth > 0 ? root.width / cards.offsetWidth || 1 : 1;
        float.style.left = `${(b.left + b.width / 2 - root.left) / scale}px`;
        float.style.top = `${(b.top - root.top) / scale}px`;
        float.style.fontSize = `${Math.round(30 * k)}px`;
        float.style.opacity = "0";
        cards.appendChild(float);
        const run = float.animate(floatFrames(34 * k), {
          duration: FAN_FLOAT_MS,
          delay: settle,
          easing: "ease-out",
        });
        const gone = () => float.remove();
        run.onfinish = gone;
        run.oncancel = gone;
      }
    }
  }
  // The tiles' glow follows the cards: a tile that starts glowing stays dark
  // until its first card rises out of it (not while the spell that did it
  // is still on the stack); one that stops stays lit until its last card has
  // sunk back in.
  const lit = (list: readonly FanCard[]) =>
    new Set(list.filter((c) => c.how !== "suspended").map((c) => `${c.side}:${c.zone}`));
  const litNow = lit(fans);
  const litWas = lit(was.fans);
  for (const tile of new Set([...litNow, ...litWas])) {
    if (litNow.has(tile) === litWas.has(tile)) continue;
    const plate = rail?.querySelector<HTMLElement>(`[data-zone-tile="${tile}"]`);
    if (!plate || typeof plate.animate !== "function") continue;
    const until = litNow.has(tile) ? (firstRise.get(tile) ?? hold) : hold + FAN_SINK_MS;
    if (until <= 0) continue;
    const look = litNow.has(tile) ? TILE_DARK : TILE_LIT;
    plate.animate([look, look], { duration: until });
  }
  // Back into its tile: no longer usable, still in its pile.
  const nowIds = new Set(fans.map((c) => c.id));
  for (const prior of was.fans) {
    if (nowIds.has(prior.id) || !piles?.has(prior.id)) continue;
    const box = was.boxes.get(prior.id);
    const clone = was.clones.get(prior.id);
    if (!box || !clone) continue;
    const ghost = clone.cloneNode(true) as HTMLElement;
    ghost.classList.add("bf-fan-leaving");
    ghost.removeAttribute("data-fan-card");
    ghost.removeAttribute("data-rise-from");
    ghost.dataset["fanLeaving"] = prior.id;
    for (const b of ghost.querySelectorAll<HTMLElement>("[data-object-id]")) {
      b.dataset["ghostOf"] = b.dataset["objectId"] ?? "";
      b.removeAttribute("data-object-id");
      b.setAttribute("tabindex", "-1");
    }
    ghost.setAttribute("aria-hidden", "true");
    cards.appendChild(ghost);
    if (typeof ghost.animate !== "function") {
      ghost.remove();
      continue;
    }
    const run = ghost.animate(
      sinkFrames(box, where[`${prior.side}:${prior.zone}` as AnchorId], tileScale(box)),
      { duration: FAN_SINK_MS, delay: hold, easing: "ease-in", fill: "both" },
    );
    const gone = () => ghost.remove();
    run.onfinish = gone;
    run.oncancel = gone;
  }
  // Spec 0106 -- a fan that has just gone past its places: its "+N" pops in
  // once the side's new cards have risen (the canvas: a 0.35 s pop after
  // the fan), never ahead of them; a "+N" that was there stays as it is.
  for (const m of more) {
    if (was.more.has(m.side)) continue;
    const el = cards.querySelector<HTMLElement>(`:scope > [data-fan-more="${m.side}"]`);
    if (!el || typeof el.animate !== "function") continue;
    const delay = Math.max(hold, risen.get(m.side) ?? 0);
    el.animate(morePopFrames(m.box), {
      duration: FAN_MORE_MS,
      delay,
      easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      fill: "backwards",
    });
  }
}

/** The glow swelling as a card lands in the fan (the canvas: 0.42, up to 0.92, back). */
const FAN_SWELL: Keyframe[] = [
  { boxShadow: "0 0 0 1px rgb(242 196 106 / 38%), 0 0 7px rgb(242 196 106 / 30%)" },
  { boxShadow: "0 0 0 2px rgb(242 196 106 / 83%), 0 0 15px rgb(242 196 106 / 64%)" },
  { boxShadow: "0 0 0 1px rgb(242 196 106 / 38%), 0 0 7px rgb(242 196 106 / 30%)" },
];
/** A tile's look while its glow waits for its card to rise (game.css .gs-zone), and while it waits for one to sink. */
const TILE_DARK: Keyframe = { boxShadow: "none", borderColor: "#2a323c" };
const TILE_LIT: Keyframe = {
  boxShadow:
    "0 0 0 1.75px #f2c46a, 0 0 16.8px rgb(242 196 106 / 56%), inset 0 0 11.2px rgb(240 190 90 / 25%)",
  borderColor: "#e9c46a",
};
/** A tile pulsing as a card rises out of it. */
const TILE_PULSE: Keyframe[] = [
  { boxShadow: "0 0 0 2px #f2c46a, 0 0 18px rgb(242 196 106 / 60%)" },
  { boxShadow: "0 0 0 3px #f2c46a, 0 0 34px rgb(242 196 106 / 95%)" },
  { boxShadow: "0 0 0 2px #f2c46a, 0 0 18px rgb(242 196 106 / 60%)" },
];
/** The time badge's pop (the canvas: up to 1.45, 0.3 s). */
const TIME_POP: Keyframe[] = [
  { transform: "scale(1)" },
  { transform: "scale(1.45)", offset: 0.4 },
  { transform: "scale(1)" },
];
/** A rising -N: in, up, out. */
function floatFrames(rise: number): Keyframe[] {
  return [
    { opacity: 0, transform: "translate(-50%, -50%) translateY(0)" },
    { opacity: 1, transform: `translate(-50%, -50%) translateY(${-rise * 0.35}px)`, offset: 0.2 },
    { opacity: 1, transform: `translate(-50%, -50%) translateY(${-rise * 0.8}px)`, offset: 0.7 },
    { opacity: 0, transform: `translate(-50%, -50%) translateY(${-rise}px)` },
  ];
}

/**
 * Spec 0066, item 1 -- a trigger or ability rises out of its card to the
 * stack in this long (the canvas's 520 ms); a stack card that has no card
 * to rise from slides in (`bf-stack-in`, 260 ms). Its arrows wait for it.
 */
export const RISE_MS = paced(520);
/**
 * Spec 0088 (Q1 A) -- a trigger of a card in a graveyard or exile tile lifts
 * off it this long after the card has risen there to be shown (the canvas:
 * shown from 1.5 s, the lift at 2.1 s; 0074's hold is 0.6 s).
 */
export const SHOW_LIFT_AT = paced(400);
/** Spec 0088 (Q1 A) -- a cascade trigger rises out of its spell's middle from this size (of a table card). */
export const CASCADE_FROM = 0.42;
/**
 * Spec 0088 (Q1 A) -- a cascade trigger waits, unseen, at most this long for
 * its spell to land. Spec 0105: longer than the longest stack rest a board
 * may say (an unanswered spell's 2000 + 2500 ms), so a safety limit never
 * cuts a rest short.
 */
export const SPELL_WAIT_MS = 6000; // not paced: a limit (spec 0106)
export const STACK_IN_MS = paced(260);
/**
 * A cast card that has just landed: its stack card fades in over the
 * flight's last moment, and counts as arrived this long after (spec 0105
 * counts it in the worker's ARRIVE_SPELL_MS).
 */
export const LANDED_FADE_MS = paced(176);
/**
 * Spec 0105 (canvas feedback-1119 "Q2") -- the resting ring: 54 px on the
 * canvas's 293 x 410 stack card, its centre 36 px in from the right edge and
 * 29 px up from the bottom; as fractions of the card.
 */
export const REST_RING = 54 / 293;
export const REST_RING_X = (293 - 36) / 293;
export const REST_RING_Y = (410 - 29) / 410;

/** Spec 0105 -- one resting stack card as this page drew it (performance.now() times). */
export interface StackRestSeen {
  id: string;
  name: string;
  /** The rest the board said. */
  ms: number;
  /** First drawn with its rest; landed on the stack here; its ring's length. */
  seen: number;
  landed: number;
  ring: number;
  /** When a board no longer had it (it resolved), or null while it is there. */
  left: number | null;
}

/**
 * Spec 0105 -- the page's own record of the resting stack cards it drew, on
 * the window (`__proxicStackRests`), for the real-click game to read at its
 * end (F-0105-I): presentation only, the last 50.
 */
export function stackRestRecord(): StackRestSeen[] {
  if (typeof window === "undefined") return [];
  const holder = window as unknown as { __proxicStackRests?: StackRestSeen[] };
  const list = (holder.__proxicStackRests ??= []);
  if (list.length > 50) list.splice(0, list.length - 50);
  return list;
}

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

/**
 * Spec 0102, item 1 (canvas deep3-missed-1117 "Q6" A) -- the restart's sweep,
 * from what the last board drew: every card on the table and in both hands
 * glides home into its OWNER's library tile, one after another (SWEEP_BEAT_MS,
 * the whole within SWEEP_SPAN_MS), turning face down (A-14's Lift and glide;
 * the other player's hidden cards are backs all the way, HID-005); a token
 * fades where it stood; each graveyard and exile pile empties into its
 * library; each library's number rises as they land (the game's counts); then
 * both libraries riffle. `done`: when the deal may begin.
 */
function restartSweep({
  restart,
  before,
  where,
  g,
}: {
  restart: RestartSweep;
  before: {
    at: Map<string, { box: Box; origin: { x: number; y: number } }>;
    drawn: Map<string, Drawn>;
    mounted: Set<string>;
    itemOf: Map<string, string>;
    members: Map<string, number>;
    stack: { s: StackView; box: Box }[];
  };
  where: Record<AnchorId, Point>;
  g: Geometry;
}): { ghosts: Ghost[]; marks: ReturnMark[]; ticks: Map<string, TileChange[]>; done: number } {
  const idsOf = new Map<string, string[]>();
  for (const [card, item] of before.itemOf) idsOf.set(item, [...(idsOf.get(item) ?? []), card]);
  const back: Drawn = {
    name: "",
    look: "artifact",
    type: "",
    pt: "",
    art: null,
    faceDown: true,
    side: "opponent",
  };
  type Leg = {
    id: string;
    look: Drawn;
    from: { box: Box; origin: { x: number; y: number } };
    side: Side;
    n: number;
    token: boolean;
    hidden: boolean;
    pile?: string;
  };
  const table: Leg[] = [];
  const hands: Leg[] = [];
  for (const item of before.mounted) {
    if (item.startsWith("held:")) continue;
    const look = before.drawn.get(item);
    const ids = idsOf.get(item) ?? [item];
    const at = before.at.get(item) ?? before.at.get(ids[0]!);
    if (!look || !at) continue;
    const hidden = item.startsWith("hidden-hand:");
    // Each card its own glide home (a pile of lands, one after another), by
    // its own id, to its own owner's library.
    for (const id of hidden ? [item] : ids) {
      (look.table ? table : hands).push({
        id,
        look: hidden ? back : look,
        from: at,
        side: hidden ? "opponent" : (restart.owners.get(id) ?? look.side),
        n: 1,
        token: restart.tokens.has(id),
        hidden,
      });
    }
  }
  // The table from the top of the screen down (the other player's side
  // first, as the canvas), then the hands.
  table.sort((a, b) => a.from.box.y - b.from.box.y || a.from.box.x - b.from.box.x);
  const legs = [...table, ...hands];
  for (const pile of restart.piles) {
    const at = {
      box: boxAt(where[`${pile.side}:${pile.zone}` as AnchorId], g),
      origin: { x: 0.5, y: 0.5 },
    };
    // Each card of the pile by its id (public there), as a back; any the
    // board did not list (the count says more) go with the last.
    const ids = pile.ids.length > 0 ? pile.ids : [`${pile.side}:${pile.zone}`];
    ids.forEach((id, i) =>
      legs.push({
        id,
        look: back,
        from: at,
        side: pile.side,
        n: i === ids.length - 1 ? Math.max(1, pile.n - (ids.length - 1)) : 1,
        token: false,
        hidden: true,
        pile: `${pile.side}:${pile.zone}`,
      }),
    );
  }
  // What was on the stack (the ability that restarted it, for whoever did)
  // fades where it stood: it resolved, and goes nowhere.
  const stackGhosts: Ghost[] = before.stack.map(({ s: e, box }) => ({
    ...back,
    name: e.name,
    faceDown: false,
    look: "artifact" as const,
    side: "viewer" as const,
    id: e.id,
    box,
    origin: { x: 0, y: 0 },
    to: box,
    toOrigin: { x: 0, y: 0 },
    fade: true,
    delay: 0,
  }));
  const beat = sweepBeat(legs.length);
  const ghosts: Ghost[] = [...stackGhosts];
  const ticks = new Map<string, TileChange[]>();
  const tick = (tile: string, at: number, by: number) =>
    ticks.set(tile, [...(ticks.get(tile) ?? []), { at, by }]);
  const landed = new Map<Side, number>();
  legs.forEach((leg, i) => {
    const delay = i * beat;
    if (leg.token) {
      ghosts.push({
        ...leg.look,
        id: leg.id,
        box: leg.from.box,
        origin: leg.from.origin,
        to: leg.from.box,
        toOrigin: leg.from.origin,
        fade: true,
        delay,
      });
      return;
    }
    ghosts.push({
      ...leg.look,
      id: leg.id,
      box: leg.from.box,
      origin: leg.from.origin,
      to: boxAt(where[`${leg.side}:library`], g),
      toOrigin: { x: 0.5, y: 0.5 },
      fade: true,
      delay,
      returning: { zone: "library", seen: "sink", back: !leg.hidden && !leg.look.faceDown },
      ...(leg.hidden && !leg.pile ? { turn: "back" as const } : {}),
      ...(leg.pile ? { faint: true } : {}),
    });
    if (leg.pile) tick(leg.pile, delay, -leg.n);
    tick(`${leg.side}:library`, delay + RETURN_MS, leg.n);
    landed.set(leg.side, (landed.get(leg.side) ?? 0) + leg.n);
  });
  // The game's counts: what lands is what the library gained.
  const end = sweepLanded(legs.length);
  for (const [side, n] of restart.landing) {
    const off = n - (landed.get(side) ?? 0);
    if (off !== 0) tick(`${side}:library`, end, off);
  }
  const marks: ReturnMark[] = [];
  const w = g.cardW * AT_ZONE_SCALE;
  const h = g.cardH * AT_ZONE_SCALE;
  for (const side of ["opponent", "viewer"] as const) {
    if ((restart.landing.get(side) ?? 0) === 0 && !legs.some((leg) => leg.side === side)) continue;
    const pile = where[`${side}:library`];
    for (let i = 0; i < RIFFLE_CARDS; i++)
      marks.push({
        key: `riffle:${restart.key}:${side}:${i}`,
        kind: "riffle",
        style: { left: pile.x, top: pile.y, width: w, height: h },
        frames: riffleFrames(i, h / 56, side === "opponent"),
        duration: RIFFLE_MS,
        delay: end + i * RIFFLE_BEAT_MS,
        of: `library:${side}`,
      });
  }
  return { ghosts, marks, ticks, done: sweepDone(legs.length) };
}

export function Board({
  battlefield,
  hand,
  opponentHand = NO_CARDS,
  opponentName = "Your opponent",
  viewerName = null,
  onOpponentHand,
  onFanMore,
  viewerSeat,
  artUrl,
  arrivals,
  departures,
  merges,
  returns,
  tileMoves,
  countered,
  leftBy,
  fizzled,
  survive = null,
  opening = null,
  veilHand = false,
  openingDelay = 0,
  restart = null,
  onRestartSwept,
  moments = null,
  flyingOnto = null,
  handLeft = null,
  hiddenStack = null,
  quietStack,
  stackOwing = null,
  stackPay = null,
  stackPayLive = false,
  combat,
  stack,
  copying = NO_STACK,
  pointedStack,
  clock,
  clockMs,
  handCosts,
  damage,
  life,
  sizeChanges: sizes0078,
  dayTime = null,
  pulse = null,
  onPick,
  onInspect,
  choosable,
  unpayable,
  selected,
  marked,
  picked,
  chosenTargets,
  payPicks,
  turnNow = null,
  lit,
  asking,
  fans = NO_FANS,
  pileCards,
  piled,
  onStackFocus,
  onSwinging,
  rail,
  top,
  overlay,
  castCover = false,
  landingOnStack = null,
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
  // Spec 0100, item 8 -- a beam swinging to a new target: that target's
  // corners wait until it lands (they ride the beam's end meanwhile).
  const [swinging, setSwinging] = useState<{ id: string; to: string } | null>(null);
  /** What each stack entry aimed at, and where each target beam ended, on the last board. */
  const aimsBefore = useRef(new Map<string, string[]>());
  const tipsBefore = useRef(new Map<string, Point>());
  const linesSeen = useRef<{ aims: Map<string, string[]>; tips: Map<string, Point> }>({
    aims: new Map(),
    tips: new Map(),
  });
  /** A beam that swung keeps its first key: its new key -> that key. */
  const swungKeys = useRef(new Map<string, string>());
  /** The swings under way (and done), by stack entry and new target. */
  const swings = useRef(new Map<string, NonNullable<BeamLook["swing"]> & { done: boolean }>());
  // Phase 9 W-20 -- the stack readable (the whole card, close-up size),
  // except while something is to be chosen on the table under it -- and
  // (spec 0066, item 5) while "Still to pay" is shown, held a moment after
  // the payment question for its last ball: it keeps its size till it goes.
  const stackScale = asking || (stackPay && stackPay.length > 0) ? STACK_SCALE : STACK_READ_SCALE;
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  /** Phase 10 A-07: the board wipe's flash, keyed by when it began. */
  const [sweep, setSweep] = useState<number | null>(null);
  /** Spec 0089 (Q2 A) -- the opening update last played. */
  const playedOpening = useRef<string | null>(null);
  /** Spec 0102, item 1 -- the restart last swept. */
  const playedRestart = useRef<string | null>(null);
  /** Phase 10 A-08: the gold lines pulling stolen creatures across. */
  const [tethers, setTethers] = useState<{ key: string; from: Point; to: Point }[]>([]);
  /** Phase 10 A-10: the merges' bursts. */
  const [fusions, setFusions] = useState<Fusion[]>([]);
  /** Phase 10 A-14: the tags at destinations and the riffling libraries. */
  const [returnMarks, setReturnMarks] = useState<ReturnMark[]>([]);
  /** Spec 0074: the countering spells' beams striking. */
  const [strikes, setStrikes] = useState<Strike[]>([]);
  /** Spec 0079: the fizzled spells' beams finding nothing. */
  const [fizzles, setFizzles] = useState<Fizzle[]>([]);
  const [effects, setEffects] = useState<Effect[]>([]);
  const wave = useRef<{ key: string } | null>(null);
  /** Spec 0080 -- the last update whose flickers, and whose survivors, were played. */
  const playedFlickers = useRef<string | null>(null);
  const playedSurvive = useRef<string | null>(null);
  /** Spec 0080 -- survivors already shown in a fight (their dome played with the blow). */
  const fightSurvivors = useRef(new Set<string>());
  /** Phase 10 A-13: the fights' marks, the clock they all run on, and the dead's part in them. */
  const [marks, setMarks] = useState<FightMark[]>([]);
  /** Spec 0085 -- each card's marks just ended, shrinking away. */
  const [goneMarks, setGoneMarks] = useState<ReadonlyMap<string, readonly GoneMark[]>>(
    () => new Map(),
  );
  const dropGoneMark = useCallback((key: string) => {
    setGoneMarks((now) => {
      let changed = false;
      const next = new Map<string, readonly GoneMark[]>();
      for (const [card, list] of now) {
        const kept = list.filter((g) => g.key !== key);
        if (kept.length !== list.length) changed = true;
        if (kept.length > 0) next.set(card, kept);
      }
      return changed ? next : now;
    });
  }, []);
  const fightClock = useRef<Animation | null>(null);
  /** Spec 0078 -- the clock a creature shrunk to death counts down on before it breaks. */
  const deathClock = useRef<Animation | null>(null);
  // Spec 0067 -- a board that goes takes its fights' life steps with it.
  useEffect(() => () => endLifeSteps(), []);
  /** A spell's damage: what it hit waits for its burst before it leaves. */
  /** Spec 0084 -- the update whose library shuffles have riffled. */
  const shuffledKey = useRef<string | null>(null);
  /** Spec 0084 -- the board whose comings alive have played (each once). */
  const aliveSeen = useRef<unknown>(null);
  const spellHits = useRef<{
    ids: Set<string>;
    delay: number;
    /** Spec 0083 -- when each hit lands (its crack and number). */
    landed: Map<string, number>;
  } | null>(null);
  const fightGhosts = useRef(
    new Map<string, { frames: Keyframe[]; duration: number; delay: number; shatterAt: number }>(),
  );
  /** Spec 0073 -- when each drawn card's fight ends (its dead shatter), on the fights' clock. */
  const fightEnds = useRef(new Map<string, number>());
  /**
   * Spec 0084 -- a fight or bite spell's blows: when each card was struck, on
   * the fight clock, so its power/toughness changes with its slashes and
   * number (never at the fight's end).
   */
  const strikeAt = useRef(new Map<string, number>());
  /** Spec 0084 -- the fight clock of a fight or bite spell (its spell need not wait for it). */
  const spellFight = useRef<Animation | null>(null);
  const timers = useRef<number[]>([]);
  useLayoutEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );
  const elements = useRef(new Map<string, HTMLDivElement>());
  // Spec 0096 -- one callback for every slot, so a slot kept as it was is not redrawn for it.
  const registerSlot = useCallback((id: string, element: HTMLDivElement | null) => {
    if (element) elements.current.set(id, element);
    else elements.current.delete(id);
  }, []);
  /** Phase 10 A-10: the merges already played (each board's are played once). */
  const playedMerges = useRef<ReadonlyMap<string, Merge> | undefined>(undefined);
  /** Spec 0074: the tile moves already played (each board's are played once). */
  const playedTiles = useRef<readonly TileMove[] | undefined>(undefined);
  /**
   * Spec 0099 Amendment 1 (3) -- each plate tile's last number run: its
   * changes, its newest number's animation (the clock it runs on) and the
   * number it ends on, so the next board carries what it has not reached.
   */
  const tileRuns = useRef(
    new Map<string, { run: Animation; changes: readonly TileChange[]; end: number }>(),
  );
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
    /** Spec 0073 -- each pile then, by its card: its members, oldest first. */
    piles: Map<string, string[]>;
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
    (damage?.combat || damage?.fight) &&
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
  // Spec 0079 (owner) -- the HELD SPOT: a permanent gone while a spell on
  // the stack still aims at it keeps its place, a dashed outline with its
  // name faint inside, until every spell aimed at it is done (a spell that
  // fizzled at it: until its fizzle has played). Remembered between boards,
  // as the pins are; worked out as the board is drawn.
  const heldMemory = useRef<HeldMemory>(NO_HELD);
  const heldFor = useRef<{
    battlefield: readonly BoardCard[];
    stack: readonly StackView[] | undefined;
    tick: number;
  } | null>(null);
  const [heldTick, setHeldTick] = useState(0);
  if (
    heldFor.current?.battlefield !== battlefield ||
    heldFor.current.stack !== stack ||
    heldFor.current.tick !== heldTick
  ) {
    const was = heldFor.current?.stack ?? [];
    const gone = new Set(
      was
        .filter((s) => s.card && fizzled?.has(s.card))
        .flatMap((s) => [s.id, ...(s.members ?? [])]),
    );
    heldMemory.current = nextHeld(
      heldMemory.current,
      battlefield,
      stack ?? [],
      performance.now(),
      heldFor.current?.stack !== stack ? gone : new Set(),
      // On the board's clock: the spot goes when its outline has broken up
      // (releaseHeld, so a click or slow motion moves it too); this is only
      // the latest it can stay, should that never run.
      reducedMotion() ? 0 : FIZZLE_HOLD_MS * 20,
    );
    heldFor.current = { battlefield, stack, tick: heldTick };
  }
  const heldNow = heldMemory.current.held;
  const table = useMemo(
    () =>
      heldNow.size === 0
        ? battlefield
        : [...battlefield, ...[...heldNow].map(([card, spot]) => heldCard(spot, card))],
    [battlefield, heldNow],
  );
  // A spot kept for a fizzle goes when the fizzle has played (sooner when a
  // click hurried it: releaseHeld), at the latest when its time is up.
  useEffect(() => {
    const ends = [...heldNow.values()].flatMap((spot) => (spot.until ? [spot.until] : []));
    if (ends.length === 0) return undefined;
    const t = window.setTimeout(
      () => setHeldTick((n) => n + 1),
      Math.max(0, Math.min(...ends) - performance.now()) + 16,
    );
    return () => window.clearTimeout(t);
  }, [heldNow]);
  /** Spec 0079 -- the held spots whose outline is breaking up now (the fizzle playing). */
  const breaking = useRef(new Set<string>());
  const releaseHeld = (card: string) => {
    const spot = heldMemory.current.held.get(card);
    if (!spot || spot.until === undefined) return;
    const held = new Map(heldMemory.current.held);
    held.delete(card);
    heldMemory.current = { ...heldMemory.current, held };
    setHeldTick((n) => n + 1);
  };
  const laidOut = useMemo(() => {
    const fighting = combat ? inCombat(table, combat) : table;
    // Spec 0070: a card picked to pay stands apart from its pile, and a
    // card picked to tap leans (layout's TAPPED_TILT); paid, it is tapped.
    if (!payPicks || payPicks.size === 0) return fighting;
    return fighting.map((card) => {
      const mark = payPicks.get(card.id);
      return mark ? { ...card, paying: mark.lean ? ("lean" as const) : ("mark" as const) } : card;
    });
  }, [table, combat, payPicks]);
  // Spec 0040 — each side's card size last time, so a side grows back only
  // with room to spare. Kept in state, so layout() itself stays pure.
  const [sideSizes, setSideSizes] = useState<Partial<Record<Side, number>>>({});
  // Spec 0087 -- each side's hand keeps clear of the fan beside its plate.
  const fanViewer = fans.filter((card) => card.side === "viewer").length;
  const fanOpponent = fans.length - fanViewer;
  const keepRight = useMemo(
    () =>
      viewport
        ? fanReach({ viewer: fanViewer, opponent: fanOpponent }, geometry(viewport))
        : undefined,
    [fanViewer, fanOpponent, viewport],
  );
  // Spec 0093 -- each side's land row last time, so a land that taps (or is
  // picked to pay) leaves every other pile in its place; it re-packs once at
  // that side's untap step. Kept here, so layout() itself stays pure.
  const landRows = useRef<Partial<Record<Side, LandRow>>>({});
  const laidBefore = useRef<Layout | null>(null);
  const turnNumber = turnNow?.turn ?? 0;
  const turnSeat = turnNow?.activeSeat ?? 0;
  const turnPhase = turnNow?.phase ?? "";
  const landTurns = useMemo(() => {
    if (turnNumber <= 0 || turnPhase === "UNTAP") return undefined;
    const side: Side = turnSeat === viewerSeat ? "viewer" : "opponent";
    return { [side]: turnNumber };
  }, [turnNumber, turnSeat, turnPhase, viewerSeat]);
  const result = useMemo(() => {
    if (!viewport) return null;
    const out = layout(
      {
        battlefield: laidOut,
        hand,
        opponentHand,
        viewerSeat,
        previousScale: sideSizes,
        keepRight,
        previousLands: landRows.current,
        landTurns,
        // Spec 0096 -- places, boxes and lines unchanged keep their objects.
        previousLayout: laidBefore.current,
      },
      viewport,
    );
    landRows.current = out.lands;
    laidBefore.current = out;
    return out;
  }, [laidOut, hand, opponentHand, viewerSeat, viewport, sideSizes, keepRight, landTurns]);
  // Spec 0087 -- where each fan card stands now, and where each stood on the
  // board before (kept until the next board: a card cast from the fan rises
  // from there, a trigger or ability of it lifts off there).
  const fanBoxesNow = useMemo(
    () => (result ? fanBoxes(fans, result.geometry) : new Map<string, Box>()),
    [fans, result],
  );
  // Spec 0106 -- each side's "+N", past its fan's places.
  const fanMoreNow = useMemo(() => (result ? fanMore(fans, result.geometry) : []), [fans, result]);
  const fanWas = useRef<FanBefore>({
    fans: NO_FANS,
    boxes: new Map(),
    clones: new Map(),
    piles: new Set(),
    gone: new Map(),
    more: new Set(),
  });
  const fanBox = (id: string): Box | undefined =>
    fanBoxesNow.get(id) ?? fanWas.current.boxes.get(id) ?? fanWas.current.gone.get(id)?.box;
  const scales = result?.scales;
  useEffect(() => {
    if (scales && (scales.viewer !== sideSizes.viewer || scales.opponent !== sideSizes.opponent)) {
      setSideSizes(scales);
    }
  }, [scales, sideSizes]);
  const byId = useMemo(() => new Map(table.map((card) => [card.id, card])), [table]);

  /**
   * What one object's button does and says (§7.24-§7.30). A pile answers
   * as its first choosable member (tapping "a Forest" is choosing one of
   * them, §7.58), else as its lead.
   */
  // What the stack's shown objects target glows (owner 2026-10-21).
  // Spec 0100, item 3 -- an overloaded spell's corners go on all it would hit.
  // Item 8 -- a target the beam is still swinging to gets its corners when it lands.
  const targeted = useMemo(
    () =>
      new Set(
        (stack ?? [])
          .filter((s) => s.id === stackFocus(stack, pointedOnStack ?? pointedStack))
          .flatMap((s) => [
            ...s.targets.flatMap((t) => ("object" in t ? [t.object] : [])),
            ...(s.hits ?? []),
          ])
          .filter((id) => id !== swinging?.to),
      ),
    [stack, pointedStack, pointedOnStack, swinging],
  );
  // Spec 0100, item 7 -- whose the focused entry is: the corners on its
  // targets are the other player's blue-violet, or your gold.
  const focusTheirs = useMemo(() => {
    const s = (stack ?? []).find((e) => e.id === stackFocus(stack, pointedOnStack ?? pointedStack));
    return s?.seat !== undefined && s.seat !== viewerSeat;
  }, [stack, pointedStack, pointedOnStack, viewerSeat]);
  // Spec 0100, item 9 -- the game screen's life shields follow the entry in focus.
  const focusNow = stackFocus(stack, pointedOnStack ?? pointedStack);
  useEffect(() => {
    onStackFocus?.(focusNow);
  }, [focusNow, onStackFocus]);
  // Spec 0100, item 9 (combat Q3 C) -- pointing at a stack card lifts its
  // source and its targets a little, glowing gold; nothing dims.
  const lifted = useMemo(() => {
    if (pointedOnStack === null) return new Set<string>();
    const s = (stack ?? []).find((e) => e.id === pointedOnStack);
    if (!s) return new Set<string>();
    return new Set([
      ...(s.source ? [s.source] : []),
      ...s.targets.flatMap((t) => ("object" in t ? [t.object] : [])),
    ]);
  }, [stack, pointedOnStack]);
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
      const isLifted = ids.some((one) => lifted.has(one));
      const isChosen = ids.some((one) => chosenTargets?.has(one));
      const isLit = ids.some((one) => lit?.has(one));
      // W-14: how many of these are selected for the attack or block.
      const marks = marked ? ids.filter((one) => marked.includes(one)).length : 0;
      const isPicked = ids.some((one) => picked?.has(one));
      const pay = ids.map((one) => payPicks?.get(one)).find((mark) => mark !== undefined);
      return {
        className: `${canChoose && !dim ? " bf-choosable" : ""}${isSelected ? " bf-selected" : ""}${dim ? " bf-unpayable" : ""}${isTargeted ? " bf-targeted" : ""}${isLifted ? " bf-lifted" : ""}${isChosen ? " bf-chosen-target" : ""}${marks ? " bf-marked" : ""}${isLit ? " bf-lit" : ""}${isPicked ? " bf-picked" : ""}${pay ? ` bf-pay-picked bf-pay-${pay.tone}` : ""}`,
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
        // Spec 0088 (Q5 C) -- the sight corners go on it.
        targeted: isTargeted,
        // Spec 0100, item 7 -- in the other player's blue-violet.
        theirs: isTargeted && focusTheirs,
        pay,
        // Spec 0090 (2) -- it breathes "you can pick this" (the soft layer,
        // Breath): choosable and not dimmed (a tab, always then). A card
        // picked to pay holds still, and one picked or marked -- except a
        // flyer, whose hover and breath went on: as the CSS before 0090 had it.
        breathing: canChoose && !dim,
        still: marks > 0 || isPicked,
        data: {
          "data-choosable": canChoose ? "true" : undefined,
          "data-selected": isSelected ? "true" : undefined,
          "data-marked": marks ? String(marks) : undefined,
          "data-unpayable": dim ? "true" : undefined,
          "data-chosen-target": isChosen ? "true" : undefined,
          "data-lit": isLit ? "true" : undefined,
          "data-picked": isPicked ? "true" : undefined,
          "data-pay-picked": pay ? pay.word : undefined,
          "data-lifted": isLifted ? "true" : undefined,
        },
        /** Spec 0096 -- the one a click picks (a pile's first choosable member, else its lead). */
        pickId: id,
        handlers: actHandlers(id, ids, onPick, onInspect),
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
    focusTheirs,
    lifted,
    onPick,
    onInspect,
  ]);

  // Spec 0090 (3) -- more than FLY_SYNC_AT flyers on the table bob in step,
  // and stay in step until none is left (going out of step would jump them).
  const flyingNow = battlefield.filter(flies).length;
  const inStepRef = useRef(false);
  const inStep = flyingNow > FLY_SYNC_AT || (inStepRef.current && flyingNow > 0);
  inStepRef.current = inStep;
  // Spec 0092 (3) -- and more than ZZ_SYNC_AT sick creatures drift their z's in step.
  const sickNow = battlefield.filter(sick).length;
  const zzStepRef = useRef(false);
  const zzStep = sickNow > ZZ_SYNC_AT || (zzStepRef.current && sickNow > 0);
  zzStepRef.current = zzStep;

  // Spec 0096 -- each object's drawing as last made, by its key: an object
  // nothing happened to keeps its drawing and its Item, so the board's own
  // drawing skips it (SlotView) and React never walks into it.
  const drawings = useRef(new Map<string, Drawing>());
  // The game screen's pick and inspect change with every board; a kept
  // drawing calls the latest through these (stable) ones.
  const onPickNow = useRef(onPick);
  onPickNow.current = onPick;
  const onInspectNow = useRef(onInspect);
  onInspectNow.current = onInspect;
  const pickNow = useCallback(
    (objectId: string, members?: readonly string[]) => onPickNow.current?.(objectId, members),
    [],
  );
  const inspectNow = useCallback((objectId: string) => onInspectNow.current?.(objectId), []);
  const items = useMemo<Item[]>(() => {
    if (!result) return [];
    const g = result.geometry;
    const sideOf = (seat: number) => (seat === viewerSeat ? "viewer" : "opponent");
    const out: Item[] = [];
    const was = drawings.current;
    const now = new Map<string, Drawing>();
    drawings.current = now;
    const kept = <K,>(
      name: string,
      key: K,
      make: (key: K) => { drawn: Drawn; content: ReactNode },
      id: string,
      ids: string[],
      box: Box,
      origin: { x: number; y: number },
    ): Item => {
      const before = was.get(name);
      const made: Drawing =
        before && before.make === make && sameContent(before.key, key)
          ? before
          : { key, make, ...make(key), item: null };
      now.set(name, made);
      const item = made.item;
      if (item && item.box === box && item.origin === origin && sameIds(item.ids, ids)) return item;
      made.item = { id, ids, box, origin, drawn: made.drawn, content: made.content };
      return made.item;
    };

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
      // Spec 0079 (owner) -- a held spot: the place of a permanent gone while
      // a spell still aims at it. A dashed outline with its name faint inside;
      // nothing to click, nothing slides into it.
      if (lead.held) {
        const of = lead.id.slice("held:".length);
        const name = lead.known && !lead.faceDown ? lead.name : "";
        out.push({
          id: lead.id,
          ids: [lead.id],
          box: slot.box,
          origin: TAPPED_ORIGIN,
          drawn: {
            name,
            look: lookOf(lead.kind, lead.types),
            type: "",
            pt: "",
            art: null,
            faceDown: false,
            known: false,
            side: slot.row.startsWith("viewer") ? "viewer" : sideOf(lead.seat),
          },
          content: (
            <div className="bf-held" data-held={of} aria-hidden="true">
              {name && <span className="bf-held-name">{name}</span>}
            </div>
          ),
        });
        continue;
      }
      const count = slot.ids.length;
      const side = slot.row.startsWith("viewer") ? "viewer" : sideOf(lead.seat);
      const pt = figure(lead);
      const attached = slot.attached.map((id) => byId.get(id)!);
      const aim = slot.ids.map((id) => aims.get(id)).find((t) => t !== undefined);
      const attacker = slot.ids.map((id) => attacks.get(id)).find((t) => t !== undefined);
      const glows = slot.ids.some((id) => attacked.has(id));
      const leadAct = act(slot.ids);
      const label = [
        lead.faceDown && !lead.known
          ? "Face-down card"
          : lead.faceDown
            ? `${lead.name}, face down`
            : lead.name,
        count > 1 ? `${count} of them` : "",
        pt,
        // Spec 0078 (6 A): the damage it has taken, said as the close-up says it.
        lead.damage ? `${lead.damage} damage` : "",
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
        ...leadAct.words,
      ]
        .filter(Boolean)
        .join(", ");
      // Spec 0096 -- everything this card's drawing is made from; the same as
      // last update, it is the same drawing (and React skips it).
      const key: TableCardKey = {
        lead,
        attached,
        row: slot.row,
        blocks: slot.faces ?? lead.blocks,
        // Spec 0073 -- a card cast onto its twins counts once its flight has
        // landed on the pile, never before.
        count,
        shownCount:
          flyingOnto !== null && flyingOnto !== lead.id && slot.ids.includes(flyingOnto)
            ? count - 1
            : count,
        side,
        label,
        ids: slot.ids,
        act: marksOnly(leadAct),
        tags: attached.map((card) => marksOnly(act([card.id]))),
        crowded: crowded.has(slot.row),
        aims: attacker ? refKey(attacker) : undefined,
        aimedHere: attacker !== undefined && aimed === lead.id,
        attacked: glows ? (slot.ids.some((id) => hot.has(id)) ? "hot" : "true") : undefined,
        pointedBlocker: slot.ids.some((id) => litBlockers.has(id)),
        inStep,
        zzStep,
        gone: goneMarks.get(lead.id),
        onGone: dropGoneMark,
        artUrl,
        onPick: onPick ? pickNow : undefined,
        onInspect: onInspect ? inspectNow : undefined,
        setAimed,
        viewerSeat,
        viewerName,
        opponentName,
      };
      out.push(
        kept(
          `t:${lead.id}`,
          key,
          tableCard,
          lead.id,
          [...slot.ids, ...slot.attached],
          pinned?.get(lead.id) ?? slot.box,
          TAPPED_ORIGIN,
        ),
      );
    }

    for (const card of hand) {
      const rest = result.boxes.get(card.id);
      if (!rest) continue;
      // Spec 0094 -- pointed at, it only rises a little; the reading card
      // above the fan shows the whole card (ReadingCard, below).
      const zoomed = pointed === card.id;
      const key: HandCardKey = {
        card,
        // Owner 2026-10-21: the cost the cast would take right now when
        // Forge has said (you hold priority), the printed cost otherwise.
        now: handCosts?.get(card.id) ?? null,
        zoomed,
        act: marksOnly(act([card.id], true)),
        opponentName,
        artUrl,
        onPick: onPick ? pickNow : undefined,
        onInspect: onInspect ? inspectNow : undefined,
        setPointed,
      };
      out.push(
        kept(
          `h:${card.id}`,
          key,
          handCard,
          card.id,
          [card.id],
          zoomed ? handRiseBox(rest, g) : rest,
          HAND_ORIGIN,
        ),
      );
    }

    // Spec 0031 — the opponent's hand: backs, and any card shown to you.
    // Clicking it opens the shown cards, as the plate's Hand tile did.
    opponentHand.forEach((card, i) => {
      const rest = result.boxes.get(card.id);
      if (!rest) return;
      // Spec 0071, item 2, as spec 0094 has it -- a card you may see comes
      // down a little while pointed at, and the reading card under their
      // hand shows the whole card; a hidden back never moves.
      const slid = !!card.shown && pointed === card.id;
      const key: TheirHandCardKey = {
        card,
        nth: i,
        of: opponentHand.length,
        slid,
        opponentName,
        artUrl,
        onOpponentHand,
        setPointed,
      };
      out.push(
        kept(
          `o:${card.id}`,
          key,
          theirHandCard,
          card.id,
          [card.id],
          slid ? handRiseBox(rest, g, "opponent") : rest,
          OPPONENT_HAND_ORIGIN,
        ),
      );
    });
    return out;
  }, [
    result,
    byId,
    onPick,
    onInspect,
    pickNow,
    inspectNow,
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
    flyingOnto,
    goneMarks,
    dropGoneMark,
    inStep,
    zzStep,
  ]);
  // Spec 0094 -- the reading card of the hand card pointed at (or focused):
  // yours above your hand, a card of theirs you may see below theirs.
  const reading = useMemo((): Reading | null => {
    if (!result || !pointed) return null;
    const g = result.geometry;
    const mine = hand.find((card) => card.id === pointed);
    if (mine) {
      const rest = result.boxes.get(mine.id);
      if (!rest) return null;
      const a = act([mine.id], true);
      const now = handCosts?.get(mine.id) ?? null;
      const change = costChange(now, mine.manaCost);
      return {
        id: mine.id,
        side: "viewer",
        box: handReadBox(
          rest,
          g,
          "viewer",
          keepRight?.viewer ?? 0,
          a.data["data-picked"] ? PICK_LIFT : 0,
        ),
        cardH: g.cardH,
        cardW: g.cardW,
        name: mine.name,
        art: mine.art ? artUrl(mine.art) : null,
        cost: change && now ? now : null,
        change,
        className: a.className,
        breathes: a.breathing && !a.pay && !a.still,
        pay: a.pay ? a.pay.tone : null,
        seen: !!mine.seen,
        face: {
          name: mine.name,
          look: lookOf(mine.kind, mine.types),
          type: shortType(mine.types),
          pt: figure(mine),
          art: mine.art ? artUrl(mine.art) : null,
          crop: mine.crop ? artUrl(mine.crop) : null,
          faceDown: false,
          side: "viewer",
          cost: now ?? mine.manaCost ?? null,
          costChange: change,
          costFirst: true,
        },
      };
    }
    const theirs = opponentHand.find((card) => card.id === pointed && card.shown);
    const shown = theirs?.shown;
    const rest = theirs && result.boxes.get(theirs.id);
    if (!theirs || !shown || !rest) return null;
    return {
      id: theirs.id,
      side: "opponent",
      box: handReadBox(rest, g, "opponent", keepRight?.opponent ?? 0),
      cardH: g.cardH,
      cardW: g.cardW,
      name: shown.name,
      art: shown.art ? artUrl(shown.art) : null,
      cost: null,
      change: null,
      className: "",
      breathes: false,
      pay: null,
      seen: !!shown.seen,
      face: {
        name: shown.name,
        look: lookOf(shown.kind, shown.types),
        type: shortType(shown.types),
        pt: figure(shown),
        art: shown.art ? artUrl(shown.art) : null,
        crop: shown.crop ? artUrl(shown.crop) : null,
        faceDown: false,
        side: "opponent",
        cost: shown.manaCost ?? null,
      },
    };
  }, [result, pointed, hand, opponentHand, act, handCosts, artUrl, keepRight]);
  // A card pointed at that has left the hand (cast, discarded) is no longer
  // pointed at: back in the hand, it waits for the pointer again.
  useEffect(() => {
    if (!pointed) return;
    if (hand.some((card) => card.id === pointed)) return;
    if (opponentHand.some((card) => card.id === pointed && card.shown)) return;
    setPointed(null);
  }, [pointed, hand, opponentHand]);
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
  // Spec 0088 (Q1 A) -- triggers waiting for their spell to land (cascade), by the spell's stack id.
  const afterLanding = useRef(new Map<string, () => void>());
  const [, setArrived] = useState(0);
  // Spec 0082 -- each card of copies made together is ONE element while it
  // lasts: on its way (beside the entry it copies), landing on the stack and
  // ticking down. Its React key is its lasting key -- or, when that key is
  // new and a copy on it was drawn just before on a card now gone (the one
  // being aimed picked its target; the cards landed), that card's key.
  // `copyCards` is what each was last drawn as: its key, count, box, things.
  const copyCards = useRef(new Map<string, { n: number; box: Box; things: readonly string[] }>());
  // Spec 0083 (L2) -- the element each stack entry was last drawn on, by
  // entry id (every member of an "xN" card too): when the entry leading a
  // card of identical triggers resolves, the next one takes the card over
  // -- the same element, never a new card popping in at full strength.
  const drawnOn = useRef(new Map<string, string>());
  const renderKeys = useMemo(() => {
    const out = new Map<string, string>();
    const all = [...(stack ?? []), ...copying];
    const present = new Set(all.map((s) => s.key ?? s.id));
    const taken = new Set<string>();
    const lastDrawn = drawnOn.current;
    const next = new Map<string, string>();
    for (const s of all) {
      let k = s.key ?? s.id;
      if (!s.key) {
        // Was it (or one of its members) drawn on a card whose own lead has
        // gone? That card is this one.
        const inherited = [s.id, ...(s.members ?? [])]
          .map((id) => lastDrawn.get(id))
          .find(
            (old) =>
              old !== undefined && (old === s.id || !all.some((o) => o !== s && o.id === old)),
          );
        if (inherited) k = inherited;
      }
      if (s.key && !copyCards.current.has(k)) {
        for (const [old, was] of copyCards.current) {
          if (present.has(old) || taken.has(old)) continue;
          if ((s.things ?? []).some((t) => was.things.includes(t))) {
            k = old;
            break;
          }
        }
      }
      while (taken.has(k)) k += "+";
      taken.add(k);
      out.set(s.id, k);
      for (const id of [s.id, ...(s.members ?? [])]) next.set(id, k);
    }
    drawnOn.current = next;
    return out;
  }, [stack, copying]);
  const keyOf = (s: StackView) => renderKeys.get(s.id) ?? s.key ?? s.id;
  // Spec 0082 -- copies still peeling onto their card: not drawn on it yet.
  const peeling = useRef(new Set<string>());
  // Spec 0079 (Q3 B): every entry an "xN" card stood for was seen -- the
  // next of a storm's copies leading the card is no new card.
  const seenStack = previous.current
    ? new Set(previous.current.stack.flatMap((was) => [was.s.id, ...(was.s.members ?? [])]))
    : null;
  const freshOnStack = (s: StackView) =>
    seenStack !== null && !seenStack.has(s.id) && s.id !== hiddenStack && !quietStack?.has(s.id);
  // Spec 0084 -- an ability whose card left the table as it was played (a
  // Treasure, a Clue, a fetch land sacrificed to pay for it; Karn going to
  // 0 loyalty) lifts off where that card was, as it goes: never fades in at
  // the stack spot.
  // Spec 0086, Amendment 1 -- a trigger whose card is not on the table but
  // drawn in the rail rises from its picture there: the monarch's draw from
  // the crown, the initiative's venture from its token, a dungeon room's from
  // the map card, an emblem's from its tile (each marked data-rise-from).
  const railBox = (s: StackView): Box | undefined => {
    // Spec 0087 -- and an ability or trigger of a card in a pile: from the
    // card in its fan, else from its pile's tile (riseFrom "pile:...").
    if (
      (s.kind !== "trigger" && s.kind !== "ability") ||
      !s.riseFrom ||
      typeof document === "undefined"
    )
      return undefined;
    const el = document.querySelector(`[data-rise-from="${s.riseFrom}"]`);
    const root = ref.current;
    if (!el || !root) return undefined;
    const drawn = el.getBoundingClientRect();
    const rb = root.getBoundingClientRect();
    const k = root.offsetWidth > 0 ? rb.width / root.offsetWidth || 1 : 1;
    // Growing in from nothing as it arrives with this board (scale 0): its
    // place on the screen is its centre, its size its layout's (in its
    // parent's scale).
    let r = { left: drawn.left, top: drawn.top, width: drawn.width, height: drawn.height };
    if (r.width === 0 && r.height === 0) {
      const own = el as HTMLElement;
      const parent = own.parentElement;
      const p = parent?.getBoundingClientRect();
      const ps = parent && p && parent.offsetWidth > 0 ? p.width / parent.offsetWidth || k : k;
      const w = (own.offsetWidth || 0) * ps;
      const h = (own.offsetHeight || 0) * ps;
      if (w === 0 && h === 0) return undefined;
      r = { left: drawn.left - w / 2, top: drawn.top - h / 2, width: w, height: h };
    }
    return {
      x: (r.left - rb.left) / k,
      y: (r.top - rb.top) / k,
      w: r.width / k,
      h: r.height / k,
      scale: 1,
      rotation: 0,
      z: 0,
    };
  };
  // Spec 0087 -- and a card standing in a fan (now, or on the board before).
  const sourceBox = (id: string): Box | undefined =>
    positions.get(id)?.box ?? previous.current?.at.get(id)?.box ?? fanBox(id);
  for (const s of stack ?? []) {
    if (
      freshOnStack(s) &&
      !s.copy &&
      (s.kind === "trigger" || s.kind === "ability") &&
      ((!!s.source && positions.has(s.source) && byId.has(s.source)) ||
        (!!s.leftFrom && (!!previous.current?.at.get(s.leftFrom) || !!fanBox(s.leftFrom))) ||
        railBox(s) !== undefined) &&
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
  // Spec 0105 -- the top of the stack resting (nobody can answer it): the
  // ring on its corner empties from the moment its card has landed on this
  // screen until `rest.ms` after the board that said so arrived -- one CSS
  // animation of that length. The card itself leaves with the next board
  // (the resolution), never on a page timer: the screen cannot run ahead of
  // the game (ARCH-003). `restSeen`: when each resting entry was first drawn
  // with its rest; `restLanded`: when it had landed.
  const restSeen = useRef(new Map<string, number>());
  const restLanded = useRef(new Map<string, number>());
  const restRing = (s: StackView, i: number): number | null => {
    if (!s.rest || i !== 0 || s.waiting) return null;
    const now = performance.now();
    const seen = restSeen.current.get(s.id) ?? now;
    restSeen.current.set(s.id, seen);
    if (stackWaiting(s)) return null;
    let landed = restLanded.current.get(s.id);
    if (landed === undefined) {
      landed = now;
      restLanded.current.set(s.id, landed);
      stackRestRecord().push({
        id: s.id,
        name: s.name,
        ms: s.rest.ms,
        seen,
        landed,
        ring: Math.max(0, s.rest.ms - (landed - seen)),
        left: null,
      });
    }
    return Math.max(0, s.rest.ms - (landed - seen));
  };
  useLayoutEffect(() => {
    const here = new Set((stack ?? []).map((s) => s.id));
    const now = performance.now();
    for (const r of stackRestRecord()) if (r.left === null && !here.has(r.id)) r.left = now;
    for (const id of [...restSeen.current.keys()]) {
      if (here.has(id)) continue;
      restSeen.current.delete(id);
      restLanded.current.delete(id);
    }
  }, [stack]);
  useLayoutEffect(() => {
    const was = wasHidden.current;
    wasHidden.current = hiddenStack;
    if (!was || was === hiddenStack) return;
    // Spec 0088 (Q1 A) -- the spell landed: its cascade trigger lifts off it now.
    const lift = afterLanding.current.get(was);
    if (lift) {
      afterLanding.current.delete(was);
      lift();
    }
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
    timers.current.push(window.setTimeout(done, fading ? 160 * 20 : LANDED_FADE_MS));
    if (fading) void fading.finished.then(done, done);
  }, [hiddenStack]);
  // Damage, once per wave. Declared before the stack's and the movement
  // effects, so what arrives in the same update waits for the fights (spec
  // 0086: a trigger the hit caused -- the monarch's, a "deals combat damage"
  // trigger -- rises only once that hit has landed).
  // Phase 10 A-13 (owner
  // 2026-11-06, Amendment 15): a combat damage step's damage plays one fight
  // at a time (fights.ts) -- the game says who fought whom; anything else
  // (a spell) cracks what it hit (spec 0083) and the amount rises there.
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
      still || !(damage.combat || damage.fight)
        ? null
        : planFights({
            wave: damage,
            at: standOf,
            life: lifeOf,
            lifeR: LIFE_R * g.height,
            // Spec 0077: an infect hit lands on the poison badge.
            poison: (seat) => poisonPoint(lifeOf(seat), g),
            poisonR: (POISON_R * g.height) / 900,
            viewerSeat,
            opponentName,
            viewerName,
          });
    // Spec 0084: a fight or bite spell's fight starts once the spell's
    // spark has reached the fighters (it resolved on this board).
    const hold = damage.fight ? Math.max(holdLeft(), RESOLVE_MS) : holdLeft();
    if (plan && ref.current && typeof ref.current.animate === "function") {
      // Spec 0080 (Q4b F1): the blow bounces off an indestructible card's
      // dome -- it is knocked, but never flashes red as if it were hurt.
      for (const [id, how] of survive?.survived ?? [])
        if (how === "indestructible")
          for (const fight of plan.fights) {
            const poses = fight.moves.get(standOf(id)?.item ?? id);
            if (poses) for (const pose of poses) pose.red = 0;
          }
      playFights(plan, hold, standOf, lifeOf, g, !damage.fight);
      if (damage.combat) popCombatSquares(plan, hold, standOf);
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
    // Spec 0077: a player's damage is shown on their shield by the life
    // changes (the Impact look, on its own clock), not as a burst.
    const told = new Set(
      (life?.changes ?? [])
        .filter((c) => !c.combat && (c.kind === "damage" || c.kind === "poison"))
        .map((c) => c.player),
    );
    const totals = new Map<string, { ref: TargetRef; amount: number }>();
    for (const hit of damage.hits) {
      if (hit.prevented && hit.amount === 0) continue;
      if ("player" in hit.target && told.has(hit.target.player)) continue;
      const k = refKey(hit.target);
      totals.set(k, { ref: hit.target, amount: (totals.get(k)?.amount ?? 0) + hit.amount });
    }
    const added: Effect[] = [];
    const cracks: FightMark[] = [];
    // Spec 0083 (13 B) -- 0077's timing: a hit lands when the resolving
    // spell's spark reaches it (RESOLVE_MS after it starts), as the life
    // shield's crack does; at once with no spark, and after any fights.
    const stackNow = new Set((stack ?? []).map((s) => s.id));
    const sparked = new Set<string>();
    for (const { s } of before?.stack ?? []) {
      if (stackNow.has(s.id)) continue;
      for (const t of s.targets) sparked.add(refKey(t));
    }
    const landsAt = (k: string) => Math.max(hold, sparked.has(k) ? RESOLVE_MS : 0);
    // Spec 0080 (Q5 A) -- damage a prevention stopped (Pyroclasm on a
    // creature with protection from red): the pale shield, a grey "0".
    // Spec 0101 -- fully up 0.15 s before the blow, which is when the
    // spell's spark lands; a shield counter's hit is the silver shield
    // (row 3); protection's squares pulse (row 5); "prevent the next N"
    // ticks its square down (row 7, CardBadges).
    const wards: FightMark[] = [];
    for (const hit of damage.hits) {
      if (!hit.prevented || hit.amount > 0) continue;
      const k = refKey(hit.target);
      const point = pointOf(hit.target);
      if (!point || still) continue;
      const blow = landsAt(k);
      const at = "object" in hit.target ? positions.get(hit.target.object) : undefined;
      const box = at?.box;
      if (box && at && hit.by === "shield") {
        wards.push(...asMarks(silverShieldMarks(`${damage.key}:${k}:shield`, box, blow, k)));
        wards.push(
          ...asMarks([
            greyNumber(
              `${damage.key}:${k}:shield`,
              numberPoint(box),
              "0",
              blow + paced(50),
              g.cardH * 0.3,
              k,
            ),
          ]),
        );
        pulseSquare(at.item, '.bf-badge[data-counter="SHIELD"]', blow + paced(100));
        continue;
      }
      if (at && !hit.by) pulseSquare(at.item, ".bf-mark-kw:not([data-folds])", blow);
      wards.push(
        ...asMarks(
          wardMarks(
            `${damage.key}:${k}:prevented`,
            point,
            box ? box.h * 0.5 : LIFE_R * g.height * 1.9,
            blow,
            k,
            true,
            g.cardH * 0.3,
            box
              ? numberPoint(box)
              : { x: point.x - (52 * g.height) / 900, y: point.y - (4 * g.height) / 900 },
          ),
        ),
      );
    }
    if (wards.length > 0) setMarks((list) => [...list, ...wards]);
    // Spec 0101, rows 1-2 -- a card that lived through the hit
    // (regenerated, indestructible) shows its shield and a grey number (the
    // survive effect), never the red "−N" and crack of a wound.
    const lived = (k: string) => {
      const how = survive?.survived.get(k);
      return how === "regenerated" || how === "indestructible";
    };
    let lastLanding = hold;
    const landed = new Map<string, number>();
    for (const [k, { ref, amount }] of totals) {
      const point = pointOf(ref);
      if (!point) continue;
      const lands = landsAt(k);
      lastLanding = Math.max(lastLanding, lands);
      landed.set(k, lands);
      if (lived(k)) continue;
      // Spec 0083 (13 B, owner) -- one hit look: a spell or ability hitting
      // anything cracks it -- on a creature exactly as on a life shield
      // (0077's crack, its red flash and shake, its timing). Combat still
      // slashes (A-13, above). The old orange starburst is gone.
      if (!still) {
        const box =
          "object" in ref
            ? (positions.get(ref.object)?.box ?? before?.at.get(ref.object)?.box)
            : undefined;
        const unit = g.height / 900;
        cracks.push(
          ...hitMarks(
            `${damage.key}:${k}`,
            point,
            box ? box.w : 46 * unit,
            box ? box.h : 54 * unit,
            lands,
            k,
          ),
        );
        if (box && "object" in ref) {
          const item = positions.get(ref.object)?.item;
          const card = item
            ? elements.current.get(item)?.querySelector<HTMLElement>(":scope > .bf-card")
            : null;
          if (card && typeof card.animate === "function")
            card.animate(shakeFrames(box.h), {
              duration: SHAKE_MS,
              delay: lands,
              easing: "linear",
              composite: "add",
            });
        }
        // The red "−N" rises off what was hit with the crack (the canvas's
        // B: off the card's right, as 0077's rises off a shield's left), on
        // the board's clock, so a slowed or hurried clock keeps it with the
        // crack (a page timer cut it short on a slowed clock).
        const w = box ? box.w : 46 * unit;
        const h = box ? box.h : 54 * unit;
        cracks.push({
          key: `${damage.key}:${k}:number`,
          kind: "number",
          damageNumber: k,
          style: {
            left: box ? point.x + w * 0.34 : point.x - 52 * unit,
            top: box ? point.y - h * 0.1 : point.y - 4 * unit,
            fontSize: box ? h * 0.24 : 34 * unit,
          },
          frames: [
            { offset: 0, opacity: 0, transform: "translate(-50%, -50%) translateY(-30%)" },
            { offset: 0.12, opacity: 1 },
            { offset: 0.7, opacity: 1 },
            { offset: 1, opacity: 0, transform: "translate(-50%, -50%) translateY(-130%)" },
          ],
          duration: LIFE_MARK_MS,
          delay: lands,
          text: `−${amount}`,
          of: k,
        });
        continue;
      }
      // Reduce motion: the number alone, still (bf-number-still).
      added.push({
        key: `${damage.key}:${k}:number`,
        kind: "number",
        target: k,
        at: point,
        amount,
        delay: lands,
      });
    }
    setEffects((list) => [...list.filter((e) => !e.key.startsWith(`${damage.key}:`)), ...added]);
    if (cracks.length > 0) setMarks((list) => [...list, ...cracks]);
    timers.current.push(
      window.setTimeout(
        () => setEffects((list) => list.filter((e) => !added.includes(e))),
        lastLanding + NUMBER_MS + paced(50),
      ),
    );
    spellHits.current = {
      ids: new Set(totals.keys()),
      delay: lastLanding + SPELL_HIT_MS,
      landed,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [damage, result, positions, viewerSeat]);

  useLayoutEffect(() => {
    const before = previous.current;
    const then = copyCards.current;
    const g = result?.geometry;
    const spotsNow = g ? stackSpotBoxes(g, (stack ?? []).length, stackScale) : [];
    const waitAt = waitingBoxes(copying, stack ?? [], spotsNow);
    // What each card of copies is drawn as now, for the next update.
    const remember = () => {
      const next = new Map<string, { n: number; box: Box; things: readonly string[] }>();
      (stack ?? []).slice(0, spotsNow.length).forEach((s, i) => {
        if (s.key)
          next.set(keyOf(s), { n: s.count ?? 1, box: spotsNow[i]!, things: s.things ?? [] });
      });
      for (const w of copying) {
        const box = waitAt.get(w.id);
        if (w.key && box) next.set(keyOf(w), { n: w.count ?? 1, box, things: w.things ?? [] });
      }
      copyCards.current = next;
    };
    if (!result || !before || !g) {
      remember();
      return;
    }
    const still0 = reducedMotion();
    // Spec 0082 (owner C) -- copies put straight onto the stack: each card
    // of them peels off the entry it copies (0079's peel, gold mark) and
    // waits beside it while targets are picked, its "xN" counting up as each
    // copy peels on; landing, it glides to its place on the stack (the same
    // element: its box changes); it ticks down as each resolves. A copy that
    // picked another target peels off the card it was on to a card of its
    // own. The maker (the storm trigger, Fork, the Resonator's ability, and
    // the permanent it came from) pulses gold as each copy is made.
    const keyed = [
      ...(stack ?? []).slice(0, spotsNow.length).map((s, i) => ({ s, box: spotsNow[i]! })),
      ...copying.flatMap((s) => {
        const box = waitAt.get(s.id);
        return box ? [{ s, box }] : [];
      }),
    ].filter(({ s }) => s.copy && s.key);
    const handledKeys = new Set<string>();
    const peelGhosts: Ghost[] = [];
    const maker = (stack ?? [])[0];
    const pulseMaker = (delay: number, copyOf: string | null | undefined) => {
      if (!maker || maker.copy || maker.id === copyOf || maker.members?.includes(copyOf ?? ""))
        return;
      stackEls.current
        .get(keyOf(maker))
        ?.querySelector<HTMLElement>(":scope > .bf-stack-card")
        ?.animate(glowFrames(), { duration: ORIGINAL_GLOW_MS, delay, easing: "linear" });
      const item = maker.source ? positions.get(maker.source)?.item : undefined;
      if (item)
        elements.current
          .get(item)
          ?.querySelector<HTMLElement>(":scope > .bf-card")
          ?.animate(glowFrames(), { duration: ORIGINAL_GLOW_MS, delay, easing: "linear" });
    };
    for (const { s, box: to } of keyed) {
      const k = keyOf(s);
      handledKeys.add(s.id);
      const el0 = stackEls.current.get(k);
      const was = then.get(k);
      const had = was?.n ?? 0;
      const n = s.count ?? 1;
      const things = s.things ?? [];
      if (n > had && !still0 && el0) {
        const j = s.copyOf
          ? (stack ?? [])
              .slice(0, spotsNow.length)
              .findIndex((e) => e.id === s.copyOf || e.members?.includes(s.copyOf!))
          : -1;
        const original = j >= 0 ? spotsNow[j]! : null;
        // A copy drawn on another card just before (it picked another target).
        const moved = [...then].find(
          ([other, v]) => other !== k && things.some((t) => v.things.includes(t)),
        );
        const from = had === 0 && moved ? moved[1].box : original;
        if (!from) continue;
        const side = s.seat === undefined || s.seat === viewerSeat ? "viewer" : "opponent";
        const whole = to.scale >= STACK_READ_SCALE && !!s.art && s.name !== "Face-down";
        const fresh = had === 0;
        if (fresh && typeof el0.animate === "function") {
          arriving.current.set(s.id, Infinity);
          const run = el0.animate(peelInFrames(from, to, g.cardW, g.cardH), {
            duration: PEEL_IN_MS,
            easing: "linear",
            fill: "backwards",
          });
          const landed = () => {
            arriving.current.set(s.id, 0);
            setArrived((m) => m + 1);
          };
          const done = run.finished as Promise<Animation> | undefined;
          if (done !== undefined) void done.then(landed, landed);
          timers.current.push(window.setTimeout(landed, PEEL_IN_MS * 20));
          const mark = el0.querySelector<HTMLElement>(".bf-mark-copy");
          if (mark && typeof mark.animate === "function")
            mark.animate(markFrames(), {
              duration: MARK_GROW_MS,
              delay: PEEL_MARK_AT,
              easing: "linear",
              fill: "backwards",
            });
          if (!moved) pulseMaker(0, s.copyOf);
        }
        // Each other new copy: its own see-through card peeling onto it.
        const fresher = things.filter((t) => !(was?.things ?? []).includes(t));
        const peelers = fresh ? fresher.slice(1) : fresher;
        const changes: BadgeChange[] = [];
        peelers.forEach((t, c) => {
          const delay = (c + (fresh ? 1 : 0)) * PEEL_BEAT_MS;
          const elsewhere = [...then].find(([other, v]) => other !== k && v.things.includes(t));
          const fromHere = elsewhere?.[1].box ?? original ?? from;
          peeling.current.add(t);
          timers.current.push(
            window.setTimeout(() => {
              peeling.current.delete(t);
              setArrived((m) => m + 1);
            }, delay + PEEL_IN_MS),
          );
          peelGhosts.push({
            name: s.name,
            look: "artifact",
            type: STACK_KIND[s.kind ?? "spell"] ?? "Spell",
            fit: true,
            pt: "",
            art: s.art ? artUrl(s.art) : null,
            crop: s.crop ? artUrl(s.crop) : null,
            faceDown: false,
            known: false,
            cost: s.manaCost ?? null,
            side,
            // The copy itself, peeling on: the jump check follows it here.
            id: t,
            box: fromHere,
            origin: { x: 0, y: 0 },
            to,
            toOrigin: { x: 0, y: 0 },
            fade: false,
            delay,
            own: { frames: peelInFrames(fromHere, to, g.cardW, g.cardH), duration: PEEL_IN_MS },
            waits: true,
            mark: true,
            zIndex: Z_LINES - 97,
            stack: whole
              ? {
                  low: artUrl(s.art!),
                  high: closeUpOf(artUrl(s.art!)),
                  kind: STACK_KIND[s.kind ?? "spell"] ?? "Spell",
                  does: s.does ?? null,
                  whose: side === "viewer" ? " bf-stack-mine" : " bf-stack-theirs",
                }
              : undefined,
          });
          changes.push({ at: delay + PEEL_IN_MS, by: 1 });
          if (!elsewhere) pulseMaker(delay, s.copyOf);
        });
        if (changes.length > 0) tickMany(el0, fresh ? 1 : had, changes);
        continue;
      }
      // One resolved, or went to a card of its own: the number drops as it
      // breaks off (after the resolve glow, for one that resolved).
      if (had > n && !still0 && el0) {
        const resolvedOff = (was?.things ?? []).some(
          (t) => !things.includes(t) && !keyed.some(({ s: o }) => o.things?.includes(t)),
        );
        tickMany(el0, had, [{ at: resolvedOff ? RESOLVE_MS : 0, by: n - had }]);
      }
    }
    if (peelGhosts.length > 0) setGhosts((list) => [...list, ...peelGhosts]);
    remember();
    const seen = new Set(before.stack.flatMap((was) => [was.s.id, ...(was.s.members ?? [])]));
    // Spec 0079 (Q3 B) -- an "xN" copy card's number: up as more copies peel
    // onto it, down as each resolves (the one resolving breaks off it).
    const wasCount = new Map<string, number>();
    for (const was of before.stack) {
      const n = was.s.count ?? 1;
      for (const id of [was.s.id, ...(was.s.members ?? [])]) wasCount.set(id, n);
    }
    const peels: Ghost[] = [];
    const spots = spotsNow;
    const still = reducedMotion();
    /** Out of its card, up off the table in a short arc, growing to the stack card's size (520 ms). */
    const riseOff = (el: HTMLElement, from: Box, to: Box, delay: number, arrived: () => void) => {
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
        {
          duration: RISE_MS,
          delay,
          easing: "cubic-bezier(0.45, 0, 0.25, 1)",
          fill: "backwards",
        },
      );
      // (A test's stand-in animation may have no promise.)
      const done = rise.finished as Promise<Animation> | undefined;
      if (done !== undefined) void done.then(arrived, arrived);
    };
    /**
     * Spec 0088 (Q1 A) -- where the middle back of the other player's fan
     * was drawn (the card they cycled left from there: spec 0072's rule, by
     * place only, never an id).
     */
    const middleBack = (seat: number): Box | undefined => {
      const backs = [...before.at.keys()].filter((k) => k.startsWith(`hidden-hand:${seat}:`));
      if (backs.length === 0) return undefined;
      return before.at.get(`hidden-hand:${seat}:${Math.floor((backs.length - 1) / 2)}`)?.box;
    };
    const resolvedNow = before.stack.some((e) => !(stack ?? []).some((x) => x.id === e.s.id));
    /**
     * Spec 0088 (Q1 A) -- a trigger whose card is in a graveyard or exile
     * tile: once the card has landed there (its fate off the table, or its
     * drop out of a hand, when it went there now), the tile glows and the
     * card rises out of it and is shown (0074's rise and show); the trigger
     * lifts off it while it is shown; the card sinks back. The shown card is
     * a ghost of the board (a click hurries it). Returns the shown card's
     * box, and when the trigger lifts (after the board's own hold).
     */
    // Two triggers of one card (both of a creature's "dies" triggers): one
    // card shown, both lift off it.
    const shownNow = new Map<string, { box: Box; lift: number }>();
    const showTrigger = (s: StackView, ghosts: Ghost[]): { box: Box; lift: number } | undefined => {
      const sf = s.showFrom;
      if (!sf) return undefined;
      const already = shownNow.get(sf.card);
      if (already) return already;
      const anchor = anchors(g)[`${sf.side}:${sf.zone}` as AnchorId];
      const lead = resolvedNow ? RESOLVE_MS : 0;
      const land =
        sf.came === null
          ? 0
          : sf.came === "hand"
            ? lead + DISCARD_MS
            : lead + fateMs(sf.came) + MOVE_MS;
      const wait = holdLeft() + land;
      const centred = { x: 0.5, y: 0.5 };
      const tile: Pose = { x: anchor.x, y: anchor.y, r: 0, s: AT_ZONE_SCALE, o: 1 };
      const spot = besideTile(g.rail.x, g.height, anchor.y);
      const at = boxAt(anchor, g);
      ghosts.push({
        name: sf.face.name,
        look: lookOf(sf.face.kind, sf.face.types),
        type: shortType(sf.face.types),
        pt: figure(sf.face),
        art: sf.face.art ? artUrl(sf.face.art) : null,
        crop: sf.face.crop ? artUrl(sf.face.crop) : null,
        faceDown: sf.face.faceDown,
        known: sf.face.known,
        side: sf.side,
        id: `show:${sf.card}`,
        box: at,
        origin: centred,
        to: at,
        toOrigin: centred,
        fade: false,
        delay: wait,
        own: {
          frames: showFrames(tile, spot, tile, g.cardW, g.cardH, centred, sf.zone, null),
          duration: SHOW_MS,
        },
        waits: true,
        zIndex: Z_RETURN_MARK - 10,
      });
      // The tile glows while its card is shown (the canvas: up 0.2 s, held, down 0.3 s).
      const tileEl =
        typeof document === "undefined"
          ? null
          : document.querySelector<HTMLElement>(`[data-rise-from="${s.riseFrom}"]`);
      if (tileEl && typeof tileEl.animate === "function") {
        const lit =
          "0 0 0 2px #f2c46a, 0 0 20px rgb(242 196 106 / 80%), inset 0 0 14px rgb(240 190 90 / 35%)";
        const dark =
          "0 0 0 0 rgb(242 196 106 / 0%), 0 0 0 rgb(242 196 106 / 0%), inset 0 0 0 rgb(240 190 90 / 0%)";
        const total = SHOW_MS + paced(300);
        tileEl.animate(
          [
            { offset: 0, boxShadow: dark },
            { offset: 200 / total, boxShadow: lit },
            { offset: (SHOW_MS - paced(120)) / total, boxShadow: lit },
            { offset: 1, boxShadow: dark },
          ],
          { duration: total, delay: wait, easing: "linear" },
        );
      }
      const w = g.cardW * SHOW_SCALE;
      const h = g.cardH * SHOW_SCALE;
      const shown = {
        box: { x: spot.x - w / 2, y: spot.y - h / 2, w, h, scale: 1, rotation: 0, z: 0 },
        lift: land + SHOW_RISE_MS + SHOW_LIFT_AT,
      };
      shownNow.set(sf.card, shown);
      return shown;
    };
    (stack ?? []).slice(0, spots.length).forEach((s, i) => {
      if (handledKeys.has(s.id)) return;
      const el0 = stackEls.current.get(s.id);
      // Spec 0079 (Q2 A, Q3 B) -- a copied spell peels off the original
      // stack card, see-through, and settles in front of it, solid, its
      // gold mark growing in; more copies of a storm peel onto the same
      // card one after another, its "xN" counting up as each lands.
      const copyOf = s.copy && s.copyOf ? s.copyOf : null;
      const j = copyOf
        ? (stack ?? []).findIndex((e) => e.id === copyOf || e.members?.includes(copyOf))
        : -1;
      const before0 = [s.id, ...(s.members ?? [])].map((id) => wasCount.get(id) ?? 0);
      const had =
        seen.has(s.id) || (s.members ?? []).some((id) => seen.has(id)) ? Math.max(...before0) : 0;
      const n = s.count ?? 1;
      if (copyOf && j >= 0 && j < spots.length && n > had && !still && el0) {
        const from = spots[j]!;
        const to = spots[i]!;
        const fresh = had === 0;
        const side = s.seat === undefined || s.seat === viewerSeat ? "viewer" : "opponent";
        const whole = to.scale >= STACK_READ_SCALE && !!s.art && s.name !== "Face-down";
        if (fresh && typeof el0.animate === "function") {
          arriving.current.set(s.id, Infinity);
          const run = el0.animate(peelInFrames(from, to, g.cardW, g.cardH), {
            duration: PEEL_IN_MS,
            easing: "linear",
            fill: "backwards",
          });
          const landed = () => {
            arriving.current.set(s.id, 0);
            setArrived((k) => k + 1);
          };
          const done = run.finished as Promise<Animation> | undefined;
          if (done !== undefined) void done.then(landed, landed);
          timers.current.push(window.setTimeout(landed, PEEL_IN_MS * 20));
          const mark = el0.querySelector<HTMLElement>(".bf-mark-copy");
          if (mark && typeof mark.animate === "function")
            mark.animate(markFrames(), {
              duration: MARK_GROW_MS,
              delay: PEEL_MARK_AT,
              easing: "linear",
              fill: "backwards",
            });
        }
        // The rest, each its own see-through card peeling onto it.
        const first = fresh ? 1 : had;
        const changes: BadgeChange[] = [];
        for (let c = first; c < n; c++) {
          const delay = (c - first + (fresh ? 1 : 0)) * PEEL_BEAT_MS;
          peels.push({
            name: s.name,
            look: "artifact",
            type: STACK_KIND[s.kind ?? "spell"] ?? "Spell",
            fit: true,
            pt: "",
            art: s.art ? artUrl(s.art) : null,
            crop: s.crop ? artUrl(s.crop) : null,
            faceDown: false,
            known: false,
            cost: s.manaCost ?? null,
            side,
            id: `peel:${s.id}:${c}`,
            box: from,
            origin: { x: 0, y: 0 },
            to,
            toOrigin: { x: 0, y: 0 },
            fade: false,
            delay,
            own: { frames: peelInFrames(from, to, g.cardW, g.cardH), duration: PEEL_IN_MS },
            waits: true,
            mark: true,
            zIndex: Z_LINES - 98,
            stack: whole
              ? {
                  low: artUrl(s.art!),
                  high: closeUpOf(artUrl(s.art!)),
                  kind: STACK_KIND[s.kind ?? "spell"] ?? "Spell",
                  does: s.does ?? null,
                  whose: side === "viewer" ? " bf-stack-mine" : " bf-stack-theirs",
                }
              : undefined,
          });
          changes.push({ at: delay + PEEL_IN_MS, by: 1 });
        }
        if (changes.length > 0) tickMany(el0, fresh ? 1 : had, changes);
        return;
      }
      // Spec 0079 (Q3 B) -- one of an "xN" copy card resolved: the number
      // drops as it breaks off (the resolve glow, then its motes).
      if (s.copy && had > n && !still && el0) {
        tickMany(el0, had, [{ at: RESOLVE_MS, by: n - had }]);
        return;
      }
      if (seen.has(s.id) || s.id === hiddenStack || quietStack?.has(s.id)) return;
      const el = stackEls.current.get(s.id);
      // Spec 0086, Amendment 1 -- its picture in the rail came with this
      // very board (the initiative taken and its venture at once, the
      // dungeon entered with its first room): it is there now, so the
      // trigger rises from it instead of sliding in.
      if (
        !still &&
        !rose.current.has(s.id) &&
        !s.copy &&
        (s.kind === "trigger" || s.kind === "ability") &&
        !!s.riseFrom &&
        !reducedMotion() &&
        el &&
        railBox(s) !== undefined
      ) {
        rose.current.add(s.id);
        el.style.animation = "none";
        if (typeof el.getAnimations === "function")
          for (const a of el.getAnimations())
            if (typeof CSSAnimation !== "undefined" && a instanceof CSSAnimation) a.cancel();
      }
      const rises = rose.current.has(s.id);
      const ms = still ? 0 : rises ? RISE_MS : STACK_IN_MS;
      // Spec 0088 (owner Q1 A) -- a trigger of a card in a graveyard or exile
      // tile lifts off it once it has risen and been shown; an ability of a
      // card the other player cycled lifts off the middle of their fan.
      const shown = rises && !still && s.showFrom ? showTrigger(s, peels) : undefined;
      const theirBack =
        rises && s.fromTheirHand !== undefined ? middleBack(s.fromTheirHand) : undefined;
      const from =
        shown?.box ??
        theirBack ??
        (s.source ? sourceBox(s.source) : s.leftFrom ? sourceBox(s.leftFrom) : undefined) ??
        railBox(s);
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
      // Spec 0086 -- fights still to play (this update's own, started just
      // above, or an older wave's): a card that arrives with them waits until
      // their blows have landed. A trigger the hit caused (the monarch's, a
      // "deals combat damage" trigger) never rises before the hit.
      const hold = (still ? 0 : holdLeft()) + (shown?.lift ?? 0);
      if (sliding && hold > 0) sliding.effect?.updateTiming({ delay: hold, fill: "backwards" });
      arriving.current.set(s.id, still ? 0 : Infinity);
      timers.current.push(
        window.setTimeout(arrived, hold + (sliding || (rises && el?.animate) ? ms * 20 : ms + 16)),
      );
      if (sliding) void sliding.finished.then(arrived, arrived);
      if (!rises || !from || !el || typeof el.animate !== "function") return;
      // Spec 0088 (Q1 A) -- a trigger of the spell being cast (cascade) lifts
      // off that spell: when the spell is still flying onto the stack (it
      // arrived with this very board), the trigger waits, unseen, until the
      // spell has landed, then lifts off it there.
      const spellOf = s.riseFrom?.startsWith("spell:")
        ? (stack ?? []).find((e) => e.kind === "spell" && e.card === s.riseFrom!.slice(6))
        : undefined;
      // Out of the spell's own card: from its middle, small (the canvas: a
      // box 0.42 of a table card at the spell's centre), growing to its place.
      const outOf = (spell: Box): Box => {
        const w = g.cardW * CASCADE_FROM;
        const h = g.cardH * CASCADE_FROM;
        return {
          x: spell.x + spell.w / 2 - w / 2,
          y: spell.y + spell.h / 2 - h / 2,
          w,
          h,
          scale: 1,
          rotation: 0,
          z: 0,
        };
      };
      if (spellOf && spellOf.id === hiddenStack) {
        const unseen = el.animate([{ opacity: 0 }, { opacity: 0, offset: 0.9 }, { opacity: 1 }], {
          duration: SPELL_WAIT_MS,
          id: "await-spell",
        });
        afterLanding.current.set(spellOf.id, () => {
          if (unseen.playState !== "running") return;
          unseen.cancel();
          const off = railBox(s);
          if (off) riseOff(el, outOf(off), to, 0, arrived);
          else arrived();
        });
        return;
      }
      riseOff(el, spellOf ? outOf(from) : from, to, hold, arrived);
    });
    if (peels.length > 0) setGhosts((list) => [...list, ...peels]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per stack
  }, [stack, copying]);

  // Spec 0082 (owner C) -- a creature that enters prepared (or becomes
  // prepared): it pulses gold and the gold square with its spell's picture
  // settles on it (0076's grow), once it has arrived. Nothing goes to the
  // exile pile. Reduce motion: the square is simply there.
  const preparedThen = useRef<Map<string, string> | null>(null);
  useLayoutEffect(() => {
    const was = preparedThen.current;
    const now = new Map(
      battlefield.flatMap((c) => (c.prepared ? [[c.id, c.prepared.id] as const] : [])),
    );
    preparedThen.current = now;
    if (!was || reducedMotion()) return;
    for (const [card, spell] of now) {
      if (was.get(card) === spell) continue;
      const item = positions.get(card)?.item;
      const element = item ? elements.current.get(item) : undefined;
      if (!element) continue;
      const delay = previous.current?.cards.has(card) ? 0 : MOVE_MS + paced(120);
      element
        .querySelector<HTMLElement>(":scope > .bf-card")
        ?.animate(glowFrames(), { duration: ORIGINAL_GLOW_MS, delay, easing: "linear" });
      const mark = element.querySelector<HTMLElement>(".bf-mark-prepared");
      if (mark && typeof mark.animate === "function")
        mark.animate(markFrames(), {
          duration: MARK_GROW_MS,
          delay: delay + paced(200),
          easing: "linear",
          fill: "backwards",
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per board
  }, [battlefield]);

  // Spec 0077 (owner 2026-11-12, canvas life-1112) -- every life change
  // that is not combat's (combat's play with the fights above), once per
  // round: damage and loss look alike (A · Impact: the shield shakes, a
  // crack flashes, a red "−N" rises), a gain rises green with a soft glow,
  // poison counts up on the badge with a green "+N"; each steps point by
  // point. It lands when the resolving spell's beam does (its spark reaches
  // the shield), at once with no beam, and after any fights still playing.
  // All on one clock on the board, so a click hurries it (A-00).
  const lifeRound = useRef<string | null>(null);
  const lifeClock = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    if (!result || !life || life.key === lifeRound.current) return;
    lifeRound.current = life.key;
    const root = ref.current;
    const changes = life.changes.filter((c) => !c.combat);
    if (changes.length === 0 || reducedMotion() || !root || typeof root.animate !== "function")
      return;
    const g = result.geometry;
    const where = anchors(g);
    const lifeOf = (seat: number) => playerPoint(seat, viewerSeat, where);
    // A stack object that resolved in this update and targeted a player: its
    // spark (spec 0028) is travelling to that shield now.
    const stackNow = new Set((stack ?? []).map((s) => s.id));
    const beamed = new Set<number>();
    for (const { s } of previous.current?.stack ?? []) {
      if (stackNow.has(s.id)) continue;
      for (const t of s.targets) if ("player" in t) beamed.add(t.player);
    }
    const first = changes[0]!;
    const start = Math.max(holdLeft(), beamed.has(first.player) ? RESOLVE_MS : 0);
    const played = planChanges(changes, start);
    const carried = lifeStillPlaying("life");
    const steps = [...carried, ...changeSteps(played)];
    const total =
      Math.max(...steps.map((s) => s.at), ...played.map((p) => p.at + p.span)) + LIFE_MARK_MS;
    lifeClock.current?.cancel();
    const clock = root.animate([{ opacity: 1 }, { opacity: 1 }], {
      duration: total,
      id: "life-clock",
    });
    lifeClock.current = clock;
    startLifeSteps(() => Number(clock.currentTime ?? total), steps, "life");
    clock.onfinish = () => {
      if (lifeClock.current === clock) endLifeSteps("life");
    };
    clock.oncancel = () => {
      if (lifeClock.current === clock) endLifeSteps("life");
    };
    const unit = g.height / 900;
    const added: FightMark[] = [];
    played.forEach(({ change, at }, i) => {
      const p = lifeOf(change.player);
      const key = `${life.key}:${i}:${change.player}`;
      const of = `player:${change.player}`;
      const rise = (lift: number): Keyframe[] => [
        { offset: 0, opacity: 0, transform: "translate(-50%, -50%) translateY(-30%)" },
        { offset: 0.12, opacity: 1 },
        { offset: 0.7, opacity: 1 },
        {
          offset: 1,
          opacity: 0,
          transform: `translate(-50%, -50%) translateY(-${lift}%)`,
        },
      ];
      if (change.kind === "poison") {
        added.push(
          poisonMark(`${key}:poison`, poisonPoint(p, g), change.amount, g, LIFE_MARK_MS, at, of),
        );
        return;
      }
      if (change.kind === "gain") {
        added.push({
          key: `${key}:glow`,
          kind: "glow",
          style: {
            left: p.x - 40 * unit,
            top: p.y - 40 * unit,
            width: 80 * unit,
            height: 80 * unit,
          },
          frames: [
            { offset: 0, opacity: 0 },
            { offset: 0.2, opacity: 0.9 },
            { offset: 1, opacity: 0 },
          ],
          duration: LIFE_GLOW_MS,
          delay: at,
          of,
        });
      } else {
        // Damage and loss: one look. The crack, over the shield.
        added.push({
          key: `${key}:crack`,
          kind: "crack",
          style: {
            left: p.x - 23 * unit,
            top: p.y - 27 * unit,
            width: 46 * unit,
            height: 54 * unit,
          },
          frames: [
            { offset: 0, opacity: 0 },
            { offset: 0.15, opacity: 1 },
            { offset: 1, opacity: 0 },
          ],
          duration: LIFE_CRACK_MS,
          delay: at,
          of,
        });
      }
      // The amount rises off the shield, to its left (the canvas's).
      added.push({
        key: `${key}:number`,
        kind: change.kind === "gain" ? "gain" : "number",
        style: { left: p.x - 52 * unit, top: p.y - 4 * unit, fontSize: 34 * unit },
        frames: rise(130),
        duration: LIFE_MARK_MS,
        delay: at,
        text: `${change.kind === "gain" ? "+" : "−"}${change.amount}`,
        of,
      });
    });
    setMarks((list) => [...list, ...added]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per round
  }, [life, result]);
  useEffect(() => () => lifeClock.current?.cancel(), []);

  // Spec 0083 (14 C, owner) -- day becoming night (or back): a short, light
  // wash crosses the table -- blue dusk for night, gold dawn for day -- and
  // fades (the turn ladder's medallion says which it is now). Not the first
  // day or night a daybound card makes: only a change.
  const dayWas = useRef(dayTime);
  const [wash, setWash] = useState<{ key: number; to: "day" | "night" } | null>(null);
  useLayoutEffect(() => {
    const was = dayWas.current;
    dayWas.current = dayTime;
    if (!was || !dayTime || was === dayTime || reducedMotion()) return;
    setWash({ key: performance.now(), to: dayTime === "night" ? "night" : "day" });
  }, [dayTime]);

  // Spec 0083 (17, owner) -- identical replacement effects applied without a
  // question (two Leylines of the Void exiling a card): no words; their
  // permanents pulse gold as the card moves.
  const pulseSeen = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!pulse || pulse.key === pulseSeen.current || !result) return;
    const first = pulseSeen.current === null && previous.current === null;
    pulseSeen.current = pulse.key;
    if (first || reducedMotion()) return;
    // A pile of them (two Leylines side by side are one pile) pulses once.
    const items = new Set(pulse.cards.map((id) => positions.get(id)?.item));
    for (const item of items) {
      const card = item
        ? elements.current.get(item)?.querySelector<HTMLElement>(":scope > .bf-card")
        : null;
      if (card && typeof card.animate === "function")
        card.animate(glowFrames(), { duration: PULSE_MS, easing: "linear" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per pulse
  }, [pulse, result]);

  // Spec 0083 (18 B) -- a split-second spell leaving the stack (it
  // resolved): its gold ring lifts, fading where it was, as the card glows
  // and goes; the dimmed hand brightens with it (CSS, the board's
  // data-split-second).
  useLayoutEffect(() => {
    const was = previous.current?.stack ?? [];
    if (!result || reducedMotion()) return;
    const now = new Set((stack ?? []).map((s) => s.id));
    const lifted: FightMark[] = [];
    for (const { s, box } of was) {
      if (!s.splitSecond || now.has(s.id)) continue;
      const out = 4 * box.scale;
      lifted.push({
        key: `split:${s.id}:${performance.now()}`,
        kind: "splitring",
        style: {
          left: box.x - out,
          top: box.y - out,
          width: box.w + 2 * out,
          height: box.h + 2 * out,
        },
        frames: [
          { offset: 0, opacity: 1 },
          { offset: 1, opacity: 0 },
        ],
        duration: SPLIT_LIFT_MS,
        delay: 0,
        of: s.id,
      });
    }
    if (lifted.length > 0) setMarks((list) => [...list, ...lifted]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per stack
  }, [stack]);

  // Spec 0078 (owner 2026-11-12, canvas pt-1112) -- a permanent's number
  // and badges changing (sizeTicks.ts), once per round, all on one clock on
  // the board so a click hurries it (A-00): together (an Anthem's creatures
  // all at once, 4 A), when the resolving spell's beam lands on it (a
  // permanent spell: when it has flown onto the table; a trigger: when it
  // has gone back into its card), after any fights still playing. Damage
  // left by a fight shows as its fight ends (6 A): the fight keeps its own
  // red number (A-13).
  const sizeRound = useRef<string | null>(null);
  const sizeClock = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    if (!result || !sizes0078 || sizes0078.key === sizeRound.current) return;
    sizeRound.current = sizes0078.key;
    const root = ref.current;
    if (
      sizes0078.changes.length === 0 ||
      reducedMotion() ||
      !root ||
      typeof root.animate !== "function"
    )
      return;
    const stackNow = new Set((stack ?? []).map((s) => s.id));
    const onTable = new Set(battlefield.map((c) => c.id));
    let lead = 0;
    for (const { s } of previous.current?.stack ?? []) {
      if (stackNow.has(s.id)) continue;
      if (s.card && onTable.has(s.card)) lead = Math.max(lead, MOVE_MS);
      else if (s.source && onTable.has(s.source)) lead = Math.max(lead, RESOLVE_MS + MOVE_MS);
      else lead = Math.max(lead, RESOLVE_MS);
    }
    const hold = holdLeft();
    const start = hold + lead;
    const fightNow = Number(fightClock.current?.currentTime ?? 0);
    const hitAt = (card: string) => {
      const item = positions.get(card)?.item;
      const end = item !== undefined ? fightEnds.current.get(item) : undefined;
      // Spec 0084: a fight or bite spell's blow -- as it lands.
      const blow = item !== undefined ? strikeAt.current.get(item) : undefined;
      if (blow !== undefined && hold > 0) return Math.max(0, blow - fightNow);
      if (end !== undefined && hold > 0) return Math.max(0, end - fightNow - 150);
      // Spec 0083 (13 B): a spell's damage shows on the card's number as its
      // crack and rising "−N" land (the spark arriving), not after.
      if (spellHits.current?.ids.has(card))
        return Math.max(
          0,
          spellHits.current.landed.get(card) ?? spellHits.current.delay - SPELL_HIT_MS,
        );
      return Math.max(0, hold - 150);
    };
    const played: PlayedSize[] = sizes0078.changes.map((change) => ({
      key: `${sizes0078.key}:${change.card}`,
      change,
      at: change.look === "hit" ? hitAt(change.card) : start,
    }));
    const carried = sizesStillPlaying("sizes");
    const total =
      Math.max(sizesLength(played), ...carried.map((s) => s.at + paced(200))) + paced(50);
    sizeClock.current?.cancel();
    const clock = root.animate([{ opacity: 1 }, { opacity: 1 }], {
      duration: total,
      id: "size-clock",
    });
    sizeClock.current = clock;
    startSizeSteps("sizes", () => Number(clock.currentTime ?? total), played, carried);
    clock.onfinish = () => {
      if (sizeClock.current === clock) endSizeSteps("sizes");
    };
    clock.oncancel = () => {
      if (sizeClock.current === clock) endSizeSteps("sizes");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per round
  }, [sizes0078, result]);

  // Spec 0085 (owner 2026-11-13, canvas gaps-marks-1113) -- marks and held
  // cards changing, once per board, on the board's clock (a click hurries
  // them, A-00). 2 B: a mark a permanent did not have rises off it like a
  // +N, holds, then drops into its square (which pops as it lands): all its
  // new marks together, several cards a beat apart (Heroic Intervention's
  // three at once). It starts with the round's number changes: when the
  // resolving spell's beam lands (after any fights). A mark that ends shrinks
  // away then. 4 A: a card it now holds shows its tab once that card has
  // gone into exile, with a glow, and the holder glows. A card new to the
  // table simply wears its marks. Reduce motion: they are simply there.
  const marksThen = useRef<Map<string, { marks: CardMark[]; holding: string[] }> | null>(null);
  /** Spec 0085 -- cards whose holder has gone, still in exile: they glow when they come out. */
  const freed = useRef(new Set<string>());
  useLayoutEffect(() => {
    const was = marksThen.current;
    const nowMarks = new Map(
      battlefield.map((c) => [
        c.id,
        {
          // 0080's hexagon rises and shrinks away as the others do.
          marks: [...cardMarks(c), ...(c.indestructible ? [HEX_MARK] : [])],
          holding: (c.holding ?? []).map((h) => h.id),
        },
      ]),
    );
    marksThen.current = nowMarks;
    const root = ref.current;
    if (!was || !result || !root || reducedMotion()) return;
    const stackNow = new Set((stack ?? []).map((s) => s.id));
    const onTable = new Set(battlefield.map((c) => c.id));
    let lead = 0;
    for (const { s } of previous.current?.stack ?? []) {
      if (stackNow.has(s.id)) continue;
      if (s.card && onTable.has(s.card)) lead = Math.max(lead, MOVE_MS);
      else if (s.source && onTable.has(s.source)) lead = Math.max(lead, RESOLVE_MS + MOVE_MS);
      else lead = Math.max(lead, RESOLVE_MS);
    }
    const start = holdLeft() + lead;
    // Spec 0095: the board is measured only when a mark rises (not on every board).
    let scale: number | null = null;
    const kOf = () => {
      if (scale === null) {
        const rootBox = root.getBoundingClientRect();
        scale = root.offsetWidth > 0 ? rootBox.width / root.offsetWidth || 1 : 1;
      }
      return scale;
    };
    const risers: FightMark[] = [];
    const gone = new Map<string, GoneMark[]>();
    const drawnFor = new Set<string>();
    let beat = 0;
    for (const card of battlefield) {
      const then = was.get(card.id);
      const at = positions.get(card.id);
      if (!then || !at || drawnFor.has(at.item)) continue;
      drawnFor.add(at.item);
      const marksNow = nowMarks.get(card.id)!.marks;
      const added = marksNow.filter((m) => !then.marks.some((b) => b.key === m.key));
      const ended = then.marks.filter((b) => !marksNow.some((m) => m.key === b.key));
      if (ended.length > 0)
        gone.set(
          card.id,
          ended.map((m) => ({
            key: `${m.key}:${card.id}:${performance.now()}`,
            mark: m,
            delay: start,
          })),
        );
      const element = elements.current.get(at.item);
      if (added.length === 0 || !element) continue;
      const box = at.box;
      const h = box.h;
      const k = kOf();
      const itemBox = element.getBoundingClientRect();
      const delay = start + beat * RISER_BEAT_MS;
      beat++;
      added.forEach((m, i) => {
        // Spec 0101, item 3 -- a printed combat square pops on in place (the
        // canvas's markIn) as the attack is declared: no riser.
        if (m.combat) {
          const sq = element.querySelector<HTMLElement>(`.bf-mark[data-mark="${m.key}"]`);
          if (sq && typeof sq.animate === "function")
            sq.animate(combatPopFrames(), {
              duration: COMBAT_POP_MS,
              delay: start,
              easing: "linear",
              fill: "backwards",
            });
          return;
        }
        // Folded (no room): it drops into the "··· N".
        const square =
          element.querySelector<HTMLElement>(`.bf-mark[data-mark="${m.key}"]`) ??
          element.querySelector<HTMLElement>('.bf-badge[data-counter="more"]');
        // Where its square is, on the table (measured in the card, which is
        // where it is now; else 0076's first place at the lower left).
        let to = {
          x: box.x + h * (0.03 + MARK_H / 2),
          y: box.y + h * (1 - BADGE_FLOOR - MARK_H / 2),
        };
        if (square) {
          const r = square.getBoundingClientRect();
          if (r.width > 0)
            to = {
              x: box.x + (r.left + r.width / 2 - itemBox.left) / k,
              y: box.y + (r.top + r.height / 2 - itemBox.top) / k,
            };
          if (typeof square.animate === "function" && square.classList.contains("bf-mark"))
            square.animate(markLandFrames(), {
              duration: MARK_LAND_MS,
              delay,
              easing: "linear",
              fill: "backwards",
            });
        }
        const from = {
          x: box.x + box.w / 2 + (i - (added.length - 1) / 2) * RISER_APART * h,
          y: box.y + h / 2 - RISE_FROM * h,
        };
        const top = RISER_TOP * h;
        risers.push({
          key: `riser:${card.id}:${m.key}:${performance.now()}`,
          kind: "riser",
          style: { left: 0, top: 0, width: top, height: top },
          frames: riserFrames(
            from,
            RISE_UP * h + RISE_UP_PX * (h / 92),
            to,
            RISER_START * h,
            top,
            MARK_H * h,
          ),
          duration: RISER_MS,
          delay,
          of: card.id,
          markOf: m,
        });
      });
    }
    // 4 A -- a newly held card's tab, once the card is in exile.
    const exiled = holdLeft() + lead + BANISH_MS + MOVE_MS;
    for (const card of battlefield) {
      const then = was.get(card.id);
      const fresh = nowMarks.get(card.id)!.holding.filter((id) => !then?.holding.includes(id));
      if (!then || fresh.length === 0) continue;
      const at = positions.get(card.id);
      const element = at ? elements.current.get(at.item) : undefined;
      if (!element) continue;
      for (const id of fresh) {
        const tab = element.querySelector<HTMLElement>(`.bf-tag-held[data-held-card="${id}"]`);
        if (tab && typeof tab.animate === "function")
          tab.animate(heldInFrames(), {
            duration: HELD_IN_MS,
            delay: exiled,
            easing: "linear",
            fill: "backwards",
          });
      }
      element
        .querySelector<HTMLElement>(":scope > .bf-card")
        ?.animate(glowFrames(), { duration: ORIGINAL_GLOW_MS, delay: exiled, easing: "linear" });
    }
    if (risers.length > 0) setMarks((list) => [...list, ...risers]);
    if (gone.size > 0)
      setGoneMarks((now) => {
        const next = new Map(now);
        for (const [card, list] of gone) next.set(card, [...(next.get(card) ?? []), ...list]);
        return next;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per board
  }, [battlefield]);
  useEffect(
    () => () => {
      sizeClock.current?.cancel();
      deathClock.current?.cancel();
      endSizeSteps();
    },
    [],
  );

  /**
   * Phase 10 A-13 -- play a combat damage step's fights, after any still
   * playing (`hold`). Every part is an animation on the board's clock -- the
   * fighters' moves (on their cards, so their places can hold or Glide on
   * their own), the dimming, the caption, the slash marks and numbers -- so a
   * click hurries all of it together and nothing waits on a timer.
   */
  /** Spec 0101 -- a square on a drawn card ([selector] inside it) pulses once at [delay] (0085's why-pulse). */
  function pulseSquare(
    item: string,
    selector: string,
    delay: number,
    frames = whyPulseFrames(),
    duration = WHY_PULSE_MS,
  ) {
    for (const square of elements.current.get(item)?.querySelectorAll<HTMLElement>(selector) ?? [])
      if (typeof square.animate === "function")
        square.animate(frames, { duration, delay, easing: "ease-in-out" });
  }

  /**
   * Spec 0101, item 3 (combat Q1 A) -- each combat square pops as it works:
   * first strike (and double strike) as the first-strike damage lands,
   * deathtouch with its deathtouch hit, lifelink as the life rises, trample
   * as a blocked attacker's damage reaches the player. Read from the damage
   * wave the game sent (who fought whom, which hit was deathtouch, the
   * gains), never worked out. Only a square drawn pops (a gained one too).
   */
  function popCombatSquares(plan: FightPlan, hold: number, standOf: (id: string) => Stand | null) {
    const pop = (card: string, key: string, at: number) => {
      const el = elements.current.get(standOf(card)?.item ?? card);
      const square = el?.querySelector<HTMLElement>(`.bf-mark[data-mark="kw:${key}"]`);
      if (square && typeof square.animate === "function")
        square.animate(whyPulseFrames(), {
          duration: WHY_PULSE_MS,
          delay: hold + at,
          easing: "ease-in-out",
        });
    };
    for (const fight of plan.fights) {
      const first = fight.strikes.reduce((t, s) => Math.min(t, s.at), Infinity);
      const fighters = [fight.attacker, ...fight.blockers];
      if (plan.firstStrike && Number.isFinite(first))
        for (const id of fighters) {
          pop(id, "first strike", first);
          pop(id, "double strike", first);
        }
      for (const strike of fight.strikes) {
        if (strike.deathtouch) {
          const from = strike.target === fight.attacker ? fight.blockers : [fight.attacker];
          for (const id of from) pop(id, "deathtouch", strike.at);
        }
        if (strike.target.startsWith("player:") && fight.blockers.length > 0 && strike.amount > 0)
          pop(fight.attacker, "trample", strike.at);
      }
      for (const gain of fight.gains) for (const id of fighters) pop(id, "lifelink", gain.at);
    }
  }

  function playFights(
    plan: FightPlan,
    hold: number,
    standOf: (id: string) => Stand | null,
    lifeOf: (seat: number) => Point,
    g: Geometry,
    /**
     * Spec 0084: false for a fight or bite spell -- no caption (nothing on
     * the table is words; the canvas's), and each card's power/toughness
     * changes as its blow lands.
     */
    combatStep = true,
  ) {
    const root = ref.current!;
    const total = hold + plan.total;
    strikeAt.current.clear();
    if (!combatStep)
      for (const fight of plan.fights)
        for (const strike of fight.strikes)
          if (strike.box) strikeAt.current.set(strike.target, hold + strike.at);
    // Any dead from an older wave have long been handed to their ghosts.
    fightGhosts.current.clear();
    // Spec 0073 -- a pile's member that dies peels off it as its fight ends.
    fightEnds.current.clear();
    for (const [item, n] of plan.fighters) {
      fightEnds.current.set(item, hold + plan.fights[n]!.shatterAt);
    }
    // Spec 0067 -- what the older fights have still to land on a plate,
    // read before their clock goes.
    const carried = lifeStillPlaying();
    fightClock.current?.cancel();
    const clock = root.animate([{ opacity: 1 }, { opacity: 1 }], {
      duration: total,
      id: "fight-clock",
    });
    fightClock.current = clock;
    spellFight.current = combatStep ? null : clock;
    // Spec 0067, item 1 -- the plates step at each blow on this clock (a
    // hurry or a slowed clock keeps them with the slashes), and settle on
    // the board's life when it ends.
    startLifeSteps(
      () => Number(clock.currentTime ?? total),
      [...carried, ...lifeSteps(plan, hold, life?.changes)],
    );
    // The fights over (or hurried to their end): everyone goes home.
    clock.onfinish = () => {
      if (fightClock.current === clock) {
        endLifeSteps("fights");
        setReleased(plan.key);
      }
    };
    clock.oncancel = () => {
      if (fightClock.current === clock) endLifeSteps("fights");
    };
    const alive = new Set(items.map((item) => item.id));
    for (const [item] of plan.fighters) {
      const stand = standOf(item);
      if (!stand) continue;
      // Spec 0073: a pile whose own card died but whose others live on
      // fights as the pile it was -- drawn now by the next of them -- and
      // the dead peel off it as the fight ends.
      const heir = alive.has(item)
        ? undefined
        : previous.current?.piles
            .get(item)
            ?.map((id) => positions.get(id)?.item)
            .find((x) => x !== undefined && alive.has(x));
      const frames = fighterFrames(plan, item, stand.box, !alive.has(item) && !heir);
      if (!alive.has(item) && !heir) {
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
      const slot = elements.current.get(heir ?? item);
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
      if (combatStep)
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
        duration: paced(420) * k,
        delay: hold + fight.impact,
        of: fight.attacker,
      });
      for (const strike of fight.strikes) {
        const box = strike.box;
        // Spec 0080 (Q5 A) -- all of it prevented (Holy Day, protection): the
        // blow lands on a pale shield in front of what it hit, which soaks
        // it up, and a grey "0" rises. No slash, no red, no hurt.
        if (strike.prevented && strike.amount === 0) {
          // Spec 0101 -- what stopped it: a shield counter is the silver
          // shield (row 3); a plain prevention pulses protection (row 5).
          const stoppedBy = damage?.hits.find(
            (h) => "object" in h.target && h.target.object === strike.target && h.by,
          )?.by;
          const item = standOf(strike.target)?.item ?? strike.target;
          if (box && stoppedBy === "shield") {
            added.push(
              ...asMarks(
                silverShieldMarks(key(`silver:${n}:${strike.target}`), box, hold + strike.at, item),
              ),
              ...asMarks([
                greyNumber(
                  key(`silver:${n}:${strike.target}`),
                  numberPoint(box),
                  "0",
                  hold + strike.at + paced(50),
                  g.cardH * 0.3,
                  strike.target,
                ),
              ]),
            );
            pulseSquare(item, '.bf-badge[data-counter="SHIELD"]', hold + strike.at + paced(100));
            continue;
          }
          if (box && !stoppedBy)
            pulseSquare(item, ".bf-mark-kw:not([data-folds])", hold + strike.at);
          const at = box ? centreOf(box, { x: 0.5, y: 0.5 }) : strike.point!;
          const r = box ? box.h * 0.5 : LIFE_R * g.height * 1.9;
          added.push(
            ...asMarks(
              wardMarks(
                key(`ward:${n}:${strike.target}`),
                at,
                r,
                hold + strike.at,
                strike.target,
                true,
                box ? g.cardH * 0.3 : (34 * g.height) / 900,
                // The "0" never over the life total: to the shield's left, as 0077's numbers.
                box
                  ? { x: at.x, y: box.y + box.h * 0.12 }
                  : { x: at.x - (52 * g.height) / 900, y: at.y - (4 * g.height) / 900 },
              ),
            ),
          );
          continue;
        }
        // Spec 0080 (Q4b F1) -- a lethal blow on an indestructible card: the
        // gold hex dome flickers up as it lands; the number is gold.
        const held = box && survive?.survived.get(strike.target) === "indestructible";
        const lives = held || survive?.survived.get(strike.target) === "regenerated";
        if (held)
          pulseSquare(
            standOf(strike.target)?.item ?? strike.target,
            '.bf-mark[data-mark="indestructible"]',
            hold + strike.at,
          );
        if (held && box) {
          fightSurvivors.current.add(strike.target);
          added.push(
            ...asMarks(
              domeMarks(key(`dome:${n}:${strike.target}`), box, hold + strike.at, strike.target),
            ),
          );
        }
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
        if (!box && strike.point && strike.poison) {
          // Spec 0077: poison is not life -- the blow lands on the poison
          // badge (strike.point is the badge): a short green slash across it,
          // and no hurt on the shield or the screen's edge.
          const p = strike.point;
          const w = (POISON_R * 2.6 * g.height) / 900;
          added.push({
            key: key(`slash:${n}:${strike.target}`),
            kind: "slash",
            style: {
              left: p.x - w / 2,
              top: p.y,
              width: w,
              height: Math.max(3, g.cardH * 0.03),
            },
            frames: [
              { offset: 0, opacity: 1, transform: "rotate(20deg) scaleX(0)" },
              { offset: 0.35, opacity: 1, transform: "rotate(20deg) scaleX(1)" },
              { offset: 1, opacity: 0, transform: "rotate(20deg) scaleX(1)" },
            ],
            duration: slashMs,
            delay: hold + strike.at,
            of: strike.target,
            poison: true,
          });
        } else if (!box && strike.point) {
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
        // Spec 0077: an infect hit gives poison -- the poison mark at the badge.
        if (strike.poison && strike.point) {
          added.push(
            poisonMark(
              key(`number:${n}:${strike.target}`),
              strike.point,
              strike.amount,
              g,
              numberMs,
              hold + strike.at,
              strike.target,
            ),
          );
          continue;
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
          // Spec 0101 (rows 1-2) -- lived through it: a grey number (was gold).
          text: lives ? `${strike.amount}` : `−${strike.amount}`,
          of: strike.target,
          ...(lives ? { tone: "grey" as const } : {}),
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

  // Spec 0101, row 6 (combat Q6 v3; Decided 2) -- ward. As a ward trigger
  // rises onto the stack (`ward`: the game's keyword origin), its creature's
  // ward square flares and a ring pulses out from it; as the trigger leaves,
  // the square flares again, and when it countered the spell (`left`, by the
  // warded creature) a second ring and a grey 0. Paid: the flare only.
  // Reduce motion: none of it.
  const wardsThen = useRef<ReadonlyMap<string, string> | null>(null);
  useLayoutEffect(() => {
    const now = new Map<string, string>();
    for (const e of stack ?? []) if (e.ward) now.set(e.id, e.ward);
    const was = wardsThen.current;
    wardsThen.current = now;
    if (!was || !result || reducedMotion()) return;
    const at = holdLeft();
    const added: FightMark[] = [];
    const play = (id: string, creature: string, ring: boolean, zero: boolean) => {
      const p = positions.get(creature);
      if (!p) return;
      pulseSquare(p.item, '.bf-mark[data-mark^="kw:ward"]', at, wardFlareFrames(), WARD_FLARE_MS);
      const key = `ward:${id}:${creature}:${ring ? "ring" : "flare"}:${zero ? "zero" : ""}`;
      if (ring) added.push(...asMarks(wardRingMarks(key, p.box, at, p.item)));
      if (zero)
        added.push(
          ...asMarks([
            greyNumber(key, numberPoint(p.box), "0", at + 450, result.geometry.cardH * 0.3, p.item),
          ]),
        );
    };
    for (const [id, creature] of now) if (!was.has(id)) play(id, creature, true, false);
    for (const [id, creature] of was) {
      if (now.has(id)) continue;
      const countered = [...(leftBy ?? new Map<string, string>()).values()].includes(creature);
      play(id, creature, countered, countered);
    }
    if (added.length > 0) setMarks((list) => [...list, ...added]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per board
  }, [stack, result]);

  // Spec 0080 (owner 2026-11-12, canvas survive-1112) -- once per update:
  // a regeneration shield breaking instead of its card (Q3 B), the hex dome
  // round an indestructible card something tried to destroy (Q4b F1: a
  // Wrath, a Murder; a lethal fight plays its dome with the blow, above),
  // and a permanent turning solid again as it phases in (Q2 A). When the
  // blow lands: after any fights, after the resolving spell's beam, after a
  // wipe's flash. Declared before the movement effect: the board drawn
  // before is still `previous`. Reduce motion: none of it (the marks show).
  useLayoutEffect(() => {
    if (!result || !survive || survive.key === playedSurvive.current) return;
    playedSurvive.current = survive.key;
    const handled = fightSurvivors.current;
    fightSurvivors.current = new Set();
    if (reducedMotion()) return;
    const before = previous.current;
    const stackNow = new Set((stack ?? []).map((x) => x.id));
    const resolved = (before?.stack ?? []).some((e) => !stackNow.has(e.s.id));
    const onTable = new Set(battlefield.map((c) => c.id));
    const leaving = before ? [...before.cards.keys()].filter((id) => !onTable.has(id)).length : 0;
    const blow = holdLeft() + (resolved ? RESOLVE_MS : 0) + (leaving >= WIPE_AT ? SWEEP_MS : 0);
    const added: FightMark[] = [];
    // Spec 0101 -- the damage each card lived through on this board (a
    // Bolt's 3): its grey number; 0 when nothing was dealt (a Murder).
    const dealt = (id: string) =>
      (damage?.hits ?? [])
        .filter((h) => "object" in h.target && h.target.object === id)
        .reduce((n, h) => n + h.amount, 0);
    for (const [id, how] of survive.survived) {
      const item = positions.get(id)?.item ?? id;
      const box = positions.get(id)?.box ?? before?.at.get(id)?.box;
      if (!box) continue;
      const key = `survive:${survive.key}:${id}`;
      const size = g ? g.cardH * 0.3 : box.h * 0.3;
      // Spec 0089 -- an umbra's save is its shield (the movement effect);
      // spec 0101 -- with a grey 0 rising as it shatters.
      if (how === "umbra") {
        added.push(
          ...asMarks([
            greyNumber(key, numberPoint(box), "0", umbraTimes(blow).blow + paced(50), size, item),
          ]),
        );
        continue;
      }
      if (handled.has(id)) continue;
      if (how === "indestructible") {
        added.push(...asMarks(domeMarks(key, box, blow, item)));
        // Spec 0101, row 2 -- the hexagon pulses and stays; a grey number.
        pulseSquare(item, '.bf-mark[data-mark="indestructible"]', blow);
        added.push(
          ...asMarks([
            greyNumber(key, numberPoint(box), `${dealt(id)}`, blow + paced(50), size, item),
          ]),
        );
      } else if (how === "shield") {
        // Spec 0101, row 3 (missed Q3 A) -- a destroy stopped by a shield
        // counter: the silver shield cracks and shatters; the badge pops as
        // its count ticks (0078's tick). No number on the destroy path.
        added.push(...asMarks(silverShieldMarks(key, box, blow, item)));
        pulseSquare(item, '.bf-badge[data-counter="SHIELD"]', blow + paced(100));
      } else {
        // Spec 0101, row 1 -- regenerated: the green shield over the card
        // takes the hit and bursts; the badge bursts and goes (0080); a grey number.
        added.push(...asMarks(regenShieldMarks(key, box, blow, item)));
        added.push(...asMarks(shieldBreakMarks(key, box, MARK_H, BADGE_FLOOR, blow, item)));
        added.push(
          ...asMarks([
            greyNumber(key, numberPoint(box), `${dealt(id)}`, blow + paced(50), size, item),
          ]),
        );
      }
    }
    if (added.length > 0) setMarks((list) => [...list, ...added]);
    for (const [id, out] of survive.phased) {
      if (out) continue;
      const card = elements.current
        .get(positions.get(id)?.item ?? id)
        ?.querySelector<HTMLElement>(":scope > .bf-card");
      if (!card || typeof card.animate !== "function") continue;
      card.animate(
        [
          {
            offset: 0,
            opacity: 0.34,
            filter: "grayscale(0.7) brightness(1.15)",
            boxShadow: "0 0 0 1px rgb(207 230 255 / 55%), 0 0 12px rgb(207 230 255 / 45%)",
          },
          {
            offset: 0.5,
            opacity: 0.8,
            filter: "grayscale(0.2) brightness(1.3)",
            boxShadow: "0 0 0 2px rgb(207 230 255 / 80%), 0 0 20px rgb(207 230 255 / 70%)",
          },
          { offset: 1, opacity: 1, filter: "grayscale(0) brightness(1)" },
        ],
        { duration: PHASE_IN_MS, delay: holdLeft(), easing: "ease-in-out", fill: "backwards" },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per update
  }, [survive, result]);

  // Spec 0091 -- read as each update's movements start.
  const castCoverRef = useRef(castCover);
  castCoverRef.current = castCover;
  const landingRef = useRef(landingOnStack);
  landingRef.current = landingOnStack;
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
    let hold = still ? 0 : holdLeft();
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
    // Spec 0084 (6 B, "Power flows in") -- a permanent that became a
    // creature (a vehicle crewed, Mutavault animated), or stopped being one
    // at the turn's end: the game's kind says so. Gold motes run from what
    // made it alive (the creatures that crewed it, or its own ability's stack
    // spot) into it, a gold ring breathes, and only then does it slide to the
    // creature line, its power/toughness rising in; at the turn's end a grey
    // ring closes in, a grey number rises off, and it slides back.
    const living: {
      id: string;
      item: string;
      up: boolean;
      from: Point[];
      times: ReturnType<typeof aliveTimes>;
      pt: string;
    }[] = [];
    const slideAt = new Map<string, number>();
    if (before && !still && !resized && aliveSeen.current !== before) {
      const stackNow = new Set((stack ?? []).map((s) => s.id));
      for (const card of battlefield) {
        const was = before.cards.get(card.id);
        const item = positions.get(card.id)?.item;
        if (!was || !item || was.name !== card.name || was.faceDown !== card.faceDown) continue;
        const up = was.kind !== "creature" && card.kind === "creature";
        const down = was.kind === "creature" && card.kind !== "creature";
        if (!up && !down) continue;
        const from: Point[] = [];
        if (up) {
          for (const by of moments?.crewed.get(card.id) ?? []) {
            const box = positions.get(by)?.box ?? before.at.get(by)?.box;
            if (box) from.push(centre(box));
          }
          if (from.length === 0) {
            const ability = before.stack.find(
              (e) => e.s.source === card.id && !stackNow.has(e.s.id),
            );
            if (ability) from.push(centre(ability.box));
          }
        }
        const times = up
          ? aliveTimes(hold, from.length > 0, MOVE_MS)
          : { motes: hold, pulse: hold, slide: hold + ALIVE_BACK_MS, number: hold };
        const shown = up ? card : was;
        living.push({
          id: card.id,
          item,
          up,
          from,
          times,
          pt:
            shown.power !== null && shown.toughness !== null
              ? `${shown.power}/${shown.toughness}`
              : "",
        });
        slideAt.set(item, times.slide);
      }
    }
    const pace = (id: string): { delay: number; duration: number } => {
      const sliding = slideAt.get(id);
      if (sliding !== undefined) return { delay: sliding, duration: MOVE_MS };
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

    // Spec 0102, item 1 -- the game restarted: the sweep alone. The table now
    // drawn is the empty one between the games; nothing on it is compared
    // with game 1's (ids are kept across a restart).
    const restartNow = restart !== null && playedRestart.current !== restart.key;
    if (restartNow) playedRestart.current = restart.key;
    if (restartNow && before && !resized && !still) {
      const swept = restartSweep({ restart, before, where, g });
      if (swept.ghosts.length > 0) setGhosts((list) => [...list, ...swept.ghosts]);
      if (swept.marks.length > 0) setReturnMarks((list) => [...list, ...swept.marks]);
      for (const [tile, changes] of swept.ticks) {
        const n = ref.current?.querySelector<HTMLElement>(
          `[data-zone-tile="${tile}"] .gs-zone-n:not(.gs-zone-was)`,
        );
        if (!n) continue;
        tileRuns.current.get(tile)?.run.cancel();
        const run = tickTile(n, changes);
        if (run) tileRuns.current.set(tile, { run, changes, end: Number(n.textContent) });
      }
      const key = restart.key;
      timers.current.push(window.setTimeout(() => onRestartSwept?.(key), swept.done));
    } else if (restartNow) {
      const key = restart.key;
      timers.current.push(window.setTimeout(() => onRestartSwept?.(key), 0));
    } else if (before && !resized && !still) {
      // Phase 10 A-14 (owner 2026-11-06, Amendment 17): back to a hand, onto
      // or into a library -- "D · Lift and glide". Shuffled in, the riffle
      // once it has landed: one per destination, however many cards went
      // there together. Spec 0075 (owner 2026-11-12): no word pill ("Back to
      // your hand", "On top of Bob's library") -- the report window explains
      // it, to the player it happened to.
      const returning: ReturnMark[] = [];
      const tagged = new Set<string>();
      const markReturn = (
        id: string,
        ret: Return,
        delay: number,
        // Spec 0074: out of a graveyard, it lands after rising and being shown.
        ms = RETURN_MS,
      ) => {
        if (ret.zone !== "library" || ret.where !== "shuffled") return;
        const key = `${ret.zone}:${ret.side}:${ret.where}`;
        if (tagged.has(key)) return;
        tagged.add(key);
        const stamp = `${key}:${id}:${performance.now()}`;
        const land = delay + ms;
        const pile = where[`${ret.side}:library`];
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
      // Spec 0073 -- when each card joining a pile lands on it, and when each
      // one leaving lifts off it: the pile's number changes then, never before.
      const landAt = new Map<string, number>();
      const leaveAt = new Map<string, number>();
      // Spec 0072 -- the backs of the other player's hidden hand. Spec 0073:
      // their land played from it leaves from the middle of the fan, as their
      // casts do (theirCast.ts) -- which hidden card it was is never known.
      const isBack = (id: string) => id.startsWith("hidden-hand:");
      const backsBefore = [...before.mounted].filter(isBack);
      const backsNow = items.filter((i) => isBack(i.id)).length;
      const theirLand = battlefield.filter(
        (c) => !before.cards.has(c.id) && arrivals?.get(c.id) === "opponent:hand" && now.has(c.id),
      );
      const lost = backsBefore.length === backsNow + 1;
      const landGap =
        handLeft === null && lost && theirLand.length === 1
          ? Math.floor((backsBefore.length - 1) / 2)
          : null;
      const gap = handLeft !== null && lost ? handLeft : landGap;
      const leftBack =
        landGap !== null
          ? before.at.get(`hidden-hand:${backsBefore[0]!.split(":")[1]}:${landGap}`)
          : undefined;
      const fromTheirHand = (id: string) =>
        leftBack !== undefined && theirLand.some((c) => c.id === id);
      const backGhost = (id: string, to: Box, toOrigin: Point): Ghost => ({
        name: "",
        look: "artifact",
        type: "",
        pt: "",
        art: null,
        faceDown: true,
        side: "opponent",
        id,
        box: leftBack!.box,
        origin: leftBack!.origin,
        to,
        toOrigin,
        fade: false,
        delay: hold,
        turn: "back",
      });

      // Spec 0074 (owner 2026-11-12, canvas "grave-1112") -- discards, mills,
      // and cards out of a graveyard or exile, each from where the game moved
      // it; after the spell that did it has glowed (it leaves at RESOLVE_MS).
      const graveGhosts: Ghost[] = [];
      /** Each plate tile's number changes as its cards leave and land (e.g. "viewer:graveyard"). */
      const ticks = new Map<string, TileChange[]>();
      const tick = (tile: string, at: number, by: number) =>
        ticks.set(tile, [...(ticks.get(tile) ?? []), { at, by }]);
      // Once per board: pointing at a card re-runs this, and must not play them again.
      const tm = tileMoves !== playedTiles.current ? (tileMoves ?? []) : [];
      const spellLeft = before.stack.some((e) => !(stack ?? []).some((s) => s.id === e.s.id));
      const T = hold + (spellLeft && tm.length > 0 ? RESOLVE_MS : 0);
      const centred = { x: 0.5, y: 0.5 };
      const tileAt = (side: Side, zone: string): Pose => ({
        ...where[`${side}:${zone}` as AnchorId],
        r: 0,
        s: AT_ZONE_SCALE,
        o: 1,
      });
      const faceLook = (m: TileMove): Drawn => ({
        name: m.face.name,
        look: lookOf(m.face.kind, m.face.types),
        type: shortType(m.face.types),
        pt: figure(m.face),
        art: m.face.art ? artUrl(m.face.art) : null,
        crop: m.face.crop ? artUrl(m.face.crop) : null,
        faceDown: m.face.faceDown,
        known: m.face.known,
        side: m.to.side,
      });
      const backLook: Drawn = {
        name: "",
        look: "artifact",
        type: "",
        pt: "",
        art: null,
        faceDown: true,
        side: "opponent",
      };
      const ghostAt = (
        look: Drawn,
        id: string,
        at: { box: Box; origin: Point },
        frames: Keyframe[],
        duration: number,
        delay: number,
        extra: Partial<Ghost> = {},
      ): Ghost => ({
        ...look,
        id,
        box: at.box,
        origin: at.origin,
        to: at.box,
        toOrigin: at.origin,
        fade: false,
        delay,
        own: { frames, duration },
        waits: true,
        ...extra,
      });
      const tileBox = (side: Side, zone: string) => ({
        box: boxAt(where[`${side}:${zone}` as AnchorId], g),
        origin: centred,
      });

      // A · Lift and drop: discarded, one after another. Spec 0081 -- a card
      // exiled straight from a hand (Force of Will's cost, Karn) lifts and
      // drops the same way, into its owner's exile pile.
      const discards = tm.filter(
        (m) => m.from.zone === "hand" && (m.to.zone === "graveyard" || m.to.zone === "exile"),
      );
      /** Your hand's cards (and theirs shown to you) leaving for a graveyard: their order. */
      const discardOrder = new Map<string, number>();
      discards.forEach((m, i) => discardOrder.set(m.card, i));
      // Their hidden cards: which back is which is never known -- they leave
      // the middle of the fan (spec 0072), the fan closing on the gap.
      const hiddenDiscards = discards.filter(
        (m) => m.from.side === "opponent" && !before.drawn.has(m.card),
      );
      const lostBacks = backsBefore.length - backsNow;
      /** Each hand that lost cards to a graveyard closes when they lift. */
      const closeAt = new Map<Side, number>();
      for (const m of discards) closeAt.set(m.from.side, T);
      const discardGap =
        gap === null && hiddenDiscards.length > 0 && lostBacks === hiddenDiscards.length
          ? Math.floor((backsBefore.length - 1) / 2) - Math.floor((hiddenDiscards.length - 1) / 2)
          : null;
      if (discardGap !== null) {
        const seat = backsBefore[0]!.split(":")[1];
        hiddenDiscards.forEach((m, j) => {
          const at = before.at.get(`hidden-hand:${seat}:${discardGap + j}`);
          if (!at) return;
          const delay = T + (discardOrder.get(m.card) ?? j) * DISCARD_BEAT_MS;
          const from = poseOf(at.box, at.origin);
          const pile = m.to.zone as TileZone;
          const to = tileAt(m.to.side, pile);
          const frames = (half?: "before" | "after") =>
            discardFrames(from, to, g.cardW, g.cardH, at.origin, true, half);
          // Spec 0081 -- exiled face down: a back the whole way, never turned.
          if (m.face.faceDown && !m.face.known) {
            graveGhosts.push(
              ghostAt(backLook, m.card, at, frames(), DISCARD_MS, delay, {
                turn: "back",
                waits: false,
              }),
            );
            tick(`${m.to.side}:${pile}`, delay + DISCARD_MS, 1);
            return;
          }
          graveGhosts.push(
            // Held in the fan until each lifts (no gap in it before then).
            ghostAt(backLook, m.card, at, frames("before"), DISCARD_MS, delay, {
              turn: "back",
              waits: false,
            }),
            ghostAt(faceLook(m), m.card, at, frames("after"), DISCARD_MS, delay, {
              fade: true,
              waits: false,
            }),
          );
          tick(`${m.to.side}:${pile}`, delay + DISCARD_MS, 1);
        });
      }

      // C · Stream: milled, one after another; past ten, the rest as one bundle.
      // Spec 0081 -- cards exiled straight from a library (cascade, Karn)
      // stream the same way, to the exile pile.
      for (const side of ["viewer", "opponent"] as const) {
        for (const pileZone of ["graveyard", "exile"] as const) {
          const milled = tm.filter(
            (m) => m.from.zone === "library" && m.to.zone === pileZone && m.to.side === side,
          );
          if (milled.length === 0) continue;
          const library = tileAt(side, "library");
          const graveyard = tileAt(side, pileZone);
          const lib = tileBox(side, "library");
          const shown = milled.slice(0, MILL_SHOWN);
          const rest = milled.slice(MILL_SHOWN);
          const one = (m: TileMove, i: number, n: number, top: boolean) => {
            const o = millOut(i, g.rail.x, g.height, side === "opponent");
            const out: Pose = { ...o, r: 0, s: MILL_SCALE, o: 1 };
            const delay = T + i * MILL_BEAT_MS;
            const frames = (half: "before" | "after" | null) =>
              millFrames(library, out, graveyard, g.cardW, g.cardH, centred, half);
            // Spec 0081 -- exiled face down: a back the whole way, never turned.
            const down = m.face.faceDown && !m.face.known;
            if (top && !down)
              graveGhosts.push(
                ghostAt(backLook, m.card, lib, frames("before"), MILL_MS, delay, { turn: "back" }),
              );
            graveGhosts.push(
              ghostAt(
                down ? backLook : faceLook(m),
                m.card,
                lib,
                frames(down ? null : "after"),
                MILL_MS,
                delay,
                {
                  ...(down ? { turn: "back" as const } : {}),
                  ...(n > 1 && top ? { badge: n } : {}),
                  ...(n > 1 && !top ? { bundled: true } : {}),
                },
              ),
            );
            return delay;
          };
          shown.forEach((m, i) => {
            const delay = one(m, i, 1, true);
            tick(`${side}:library`, delay, -1);
            tick(`${side}:${pileZone}`, delay + MILL_MS, 1);
          });
          if (rest.length > 0) {
            // Every card of the bundle is drawn going, on one path; the top shows how many.
            let delay = 0;
            rest.forEach((m, j) => {
              delay = one(m, MILL_SHOWN, rest.length, j === rest.length - 1);
            });
            tick(`${side}:library`, delay, -rest.length);
            tick(`${side}:${pileZone}`, delay + MILL_MS, rest.length);
          }
        }
      }

      // Spec 0085 (4 A) -- the cards held by a permanent that has left the
      // table: its tab flies to their exile pile (below), and a card that
      // comes out of exile now rises FREED_WAIT_MS later, once the tab has
      // got there, the pile glowing, the card glowing gold. One that comes
      // out later (Oblivion Ring's trigger) glows the same then.
      const freedNow = new Set<string>();
      for (const [id, card] of before.cards)
        if (!now.has(id) && !battlefield.some((c) => c.id === id))
          for (const h of card.holding ?? []) freedNow.add(h.id);
      for (const id of freedNow) freed.current.add(id);
      const freedGlow = (m: TileMove, start: number) => {
        if (m.from.zone !== "exile" || !freed.current.has(m.card)) return;
        freed.current.delete(m.card);
        const tile = ref.current?.querySelector<HTMLElement>(
          `[data-zone-tile="${m.from.side}:exile"]`,
        );
        if (tile && typeof tile.animate === "function")
          tile.animate(tileGlowFrames(), {
            duration: TILE_GLOW_MS,
            delay: Math.max(0, start - TILE_GLOW_LEAD_MS),
            easing: "linear",
          });
        freedRise.set(m.card, start);
      };
      /** Freed cards rising now: when each starts (its own element glows gold). */
      const freedRise = new Map<string, number>();

      // H · Rise and show: out of a graveyard or exile -- risen, shown, then
      // where it goes. A whole graveyard exiled at once is swept as one.
      const outOf = tm.filter((m) => m.from.zone === "graveyard" || m.from.zone === "exile");
      const sweeps = new Map<string, TileMove[]>();
      for (const m of outOf) {
        if (m.from.zone !== "graveyard" || m.to.zone !== "exile") continue;
        const key = m.from.side;
        sweeps.set(key, [...(sweeps.get(key) ?? []), m]);
      }
      for (const [key, list] of sweeps) if (list.length < 2) sweeps.delete(key);
      for (const [side, list] of sweeps) {
        const from = tileAt(side as Side, "graveyard");
        const to = tileAt(side as Side, "exile");
        list.forEach((m, i) => {
          const held = sweptAt(i, list.length, g.rail.x, g.height, side === "opponent");
          graveGhosts.push(
            ghostAt(
              faceLook(m),
              m.card,
              tileBox(side as Side, "graveyard"),
              sweptFrames(from, held, to, g.cardW, g.cardH, centred),
              SWEPT_MS,
              T,
              { motes: true, zIndex: Z_RETURN_MARK - 10 + i },
            ),
          );
        });
        tick(`${side}:graveyard`, T, -list.length);
        tick(`${side}:exile`, T + SWEPT_MS, list.length);
      }
      /** A card risen out of a tile onto the table or into a hand: when it starts, from where. */
      // Spec 0087 -- a card that stood in a fan leaves from there (Unearth's
      // creature, a land Light Up the Stage let her play), not from its tile.
      const fanStood = (m: TileMove) => (m.card ? fanWas.current.boxes.get(m.card) : undefined);
      const outPose = (m: TileMove): Pose => {
        const stood = fanStood(m);
        return stood ? poseOf(stood, centred) : tileAt(m.from.side, m.from.zone);
      };
      const riseOf = new Map<string, { start: number; move: TileMove }>();
      /** The other player's new back taking over a card risen into his hidden hand. */
      const riseInto = new Map<string, { start: number; move: TileMove }>();
      const shows = outOf.filter((m) => !sweeps.get(m.from.side)?.includes(m));
      shows.forEach((m, i) => {
        const start =
          T +
          i * SHOW_BEAT_MS +
          (m.from.zone === "exile" && freedNow.has(m.card) ? FREED_WAIT_MS : 0);
        freedGlow(m, start);
        const fromPose = outPose(m);
        const show = showAt(g.rail.x, g.height, m.from.side === "opponent");
        const stood = fanStood(m);
        const fromTile = stood
          ? { box: stood, origin: centred }
          : tileBox(m.from.side, m.from.zone);
        tick(`${m.from.side}:${m.from.zone}`, start, -1);
        // A hand makes room for it as it sets off from being shown.
        if (m.to.zone === "hand")
          closeAt.set(
            m.to.side,
            Math.max(closeAt.get(m.to.side) ?? 0, start + SHOW_RISE_MS + SHOW_HOLD_MS),
          );
        if (m.to.zone === "battlefield" || (m.to.zone === "hand" && !m.hidden)) {
          riseOf.set(m.card, { start, move: m });
          return;
        }
        if (m.to.zone === "hand") {
          // Into the other player's hidden hand: it turns face down near his
          // fan, his newest back taking over on the same path.
          const back = newBacks.shift();
          const to = back
            ? poseOf(back.box, back.origin)
            : { ...where[`${m.to.side}:hand`], r: 0, s: 1, o: 1 };
          if (back) riseInto.set(back.id, { start, move: m });
          graveGhosts.push(
            ghostAt(
              faceLook(m),
              m.card,
              fromTile,
              showFrames(fromPose, show, to, g.cardW, g.cardH, centred, "theirHand", "before"),
              SHOW_MS,
              start,
            ),
          );
          if (back)
            markReturn(
              m.card,
              { zone: "hand", side: m.to.side, where: null, hidden: true },
              start,
              SHOW_MS,
            );
          return;
        }
        const where_ = m.to.zone as ShowTo;
        const to = tileAt(m.to.side, m.to.zone);
        const hidden = m.to.zone === "library";
        graveGhosts.push(
          ghostAt(
            faceLook(m),
            m.card,
            fromTile,
            showFrames(
              fromPose,
              show,
              to,
              g.cardW,
              g.cardH,
              centred,
              where_,
              hidden ? "before" : null,
            ),
            SHOW_MS,
            start,
            m.to.zone === "exile" ? { motes: true } : {},
          ),
        );
        if (hidden) {
          graveGhosts.push(
            ghostAt(
              backLook,
              m.card,
              fromTile,
              showFrames(fromPose, show, to, g.cardW, g.cardH, centred, "library", "after"),
              SHOW_MS,
              start,
              { turn: "back" },
            ),
          );
          markReturn(
            m.card,
            { zone: "library", side: m.to.side, where: m.where, hidden: true },
            start,
            SHOW_MS,
          );
        }
        tick(`${m.to.side}:${m.to.zone}`, start + SHOW_MS, 1);
      });
      /** A risen card's frames onto its place (the table, a hand), landing exactly. */
      const risen = (
        r: { start: number; move: TileMove },
        box: Box,
        origin: Point,
        half: "after" | null,
      ) =>
        showFrames(
          outPose(r.move),
          showAt(g.rail.x, g.height, r.move.from.side === "opponent"),
          poseOf(box, origin),
          g.cardW,
          g.cardH,
          origin,
          half ? "theirHand" : r.move.to.zone === "battlefield" ? "table" : "hand",
          half,
          box,
        );

      // Spec 0073 -- tokens made this update spark out of what made them:
      // the stack object that resolved (the permanent whose ability it was,
      // for an ability: Krenko), one after another. Two resolving at once,
      // or none seen: the stack.
      const stackAfter = new Set((stack ?? []).map((s) => s.id));
      const resolved = before.stack.filter((e) => !stackAfter.has(e.s.id));
      const maker = resolved.length === 1 ? resolved[0]! : undefined;
      const makerCard =
        maker && maker.s.kind !== "spell" && maker.s.source ? now.get(maker.s.source) : undefined;
      const sparkAt: Point = makerCard
        ? centreOf(makerCard.box, makerCard.origin)
        : maker
          ? centreOf(maker.box, { x: 0, y: 0 })
          : where.stack;
      const made = battlefield
        .filter((c) => c.token === true && !before.cards.has(c.id) && now.has(c.id))
        .map((c) => c.id)
        .sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")));
      const tokenIndex = new Map(made.map((id, i) => [id, i]));
      // Spec 0089 (Q5 B) -- more than 8 at once (Krenko, Avenger): waves of 8.
      const madeAt = (i: number) =>
        (maker ? hold + TOKEN_AFTER_MS : hold) +
        tokenStart(i, made.length, makerCard ? TOKEN_BEAT_ABILITY_MS : TOKEN_BEAT_MS);
      const spreadOf = (id: string) => waveSpread(tokenIndex.get(id) ?? 0, made.length, g.cardH);
      // Spec 0079 (Q1 A) -- a token copy sparks out of the creature it
      // copies (the game names it, while this viewer may see it), which glows.
      const copySource = (id: string): Point | null => {
        const of = byId.get(id)?.copyOf;
        const at = of ? (now.get(of) ?? before.at.get(of)) : undefined;
        return at ? centreOf(at.box, at.origin) : null;
      };
      const glowing = new Set<string>();
      const glowOriginal = (id: string, delay: number) => {
        const of = byId.get(id)?.copyOf;
        const item = of ? items.find((one) => one.ids.includes(of))?.id : undefined;
        if (!item || glowing.has(item)) return;
        glowing.add(item);
        elements.current
          .get(item)
          ?.querySelector<HTMLElement>(":scope > .bf-card")
          ?.animate(glowFrames(), {
            duration: ORIGINAL_GLOW_MS,
            delay: Math.max(0, delay - paced(80)),
            easing: "linear",
          });
      };
      /** Spec 0079 -- a copy's gold mark grows in, on its card, at `delay`. */
      const markIn = (element: HTMLElement | undefined, delay: number) => {
        const mark = element?.querySelector<HTMLElement>(".bf-mark-copy");
        if (mark && typeof mark.animate === "function")
          mark.animate(markFrames(), {
            duration: MARK_GROW_MS,
            delay,
            easing: "linear",
            fill: "backwards",
          });
      };
      const spark = (id: string, delay: number) => {
        // Spec 0089 (Q5 B) -- in waves, one bigger spark a wave.
        const nth = tokenIndex.get(id) ?? 0;
        if (!sparksFor(nth, made.length)) return;
        const at = copySource(id) ?? sparkAt;
        returning.push({
          key: `spark:${id}:${performance.now()}`,
          kind: "spark",
          style: { left: at.x, top: at.y },
          frames: sparkFrames(made.length > 8 ? WAVE_SPARK : 1),
          duration: SPARK_MS,
          delay: Math.max(0, delay - SPARK_LEAD_MS),
          of: id,
        });
      };
      const joins: Ghost[] = [];
      for (const item of items) {
        if (before.mounted.has(item.id)) continue; // the same element: CSS glides it
        // Spec 0079: a held spot is drawn where its card stood, from the first frame.
        if (item.id.startsWith("held:")) continue;
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
        // Spec 0073: a token grows out of what made it, then Glides here.
        const nth = tokenIndex.get(item.id);
        if (nth !== undefined) {
          const delay = madeAt(nth);
          glide(
            element,
            tokenFrames(
              boxOn(copySource(item.id) ?? sparkAt, item.box),
              item.box,
              g.cardW,
              g.cardH,
              item.origin,
              spreadOf(item.id),
            ),
            delay,
            TOKEN_MS,
          );
          spark(item.id, delay);
          if (byId.get(item.id)?.copy) {
            glowOriginal(item.id, delay);
            markIn(element, delay + TOKEN_MS);
          }
          landAt.set(item.id, delay + TOKEN_MS);
          continue;
        }
        // Spec 0074 (H · Rise and show): out of a graveyard or exile onto the
        // table or into a hand you can see -- the same element all the way,
        // landing as that card; or the other player's new back, taking over
        // a card risen into his hidden hand (it turns face down near his fan).
        const rise = riseOf.get(item.id);
        const into = rise ? undefined : riseInto.get(item.id);
        if (rise || into) {
          const r = (rise ?? into)!;
          glide(element, risen(r, item.box, item.origin, into ? "after" : null), r.start, SHOW_MS);
          landAt.set(item.id, r.start + SHOW_MS);
          // Spec 0085 -- freed from its holder: it glows gold as it rises.
          const freedAt = freedRise.get(item.id);
          const face = element.querySelector<HTMLElement>(":scope > .bf-card");
          if (freedAt !== undefined && face && typeof face.animate === "function")
            face.animate(freedGlowFrames(SHOW_MS), {
              duration: SHOW_MS,
              delay: freedAt,
              easing: "linear",
              fill: "backwards",
            });
          if (rise && r.move.to.zone === "hand")
            markReturn(
              item.id,
              { zone: "hand", side: r.move.to.side, where: null, hidden: false },
              r.start,
              SHOW_MS,
            );
          continue;
        }
        // Spec 0073: out of the other player's hidden hand, from the back
        // that left, turning face up on the way (the back narrows away).
        if (fromTheirHand(item.id)) {
          glide(
            element,
            turnUp(
              glideFrames(leftBack!.box, item.box, g.cardW, g.cardH, leftBack!.origin, item.origin),
              "face",
            ),
            hold,
            MOVE_MS,
          );
          joins.push(backGhost(item.id, item.box, item.origin));
          landAt.set(item.id, hold + MOVE_MS);
          continue;
        }
        // Spec 0079 (Q1 A) -- a permanent spell that enters as a copy (Clone):
        // it glides to its place as it was on the stack; a see-through copy
        // of what it copied lifts off that creature and glides onto it; then
        // it lifts, flips (A-09) and settles as the copied face, and the gold
        // copy mark grows in. Nothing to point at (the original out of
        // sight): it lands, then flips.
        const copied = byId.get(item.id);
        const cast =
          copied?.copy && !copied.token
            ? before.stack.find((e) => e.s.card === item.id)
            : undefined;
        if (cast && !before.at.has(item.id)) {
          const s = cast.s;
          const { delay } = pace(item.id);
          const of = copied!.copyOf;
          const original = of ? (before.at.get(of) ?? now.get(of)) : undefined;
          const flipAt = delay + (original ? COPY_FLIP_AT : MOVE_MS);
          const side = s.seat === undefined || s.seat === viewerSeat ? "viewer" : "opponent";
          const whole = cast.box.scale >= STACK_READ_SCALE && !!s.art && s.name !== "Face-down";
          const run = holdThenFlip(
            glideFrames(cast.box, item.box, g.cardW, g.cardH, { x: 0, y: 0 }, item.origin),
            flipAt - delay,
          );
          joins.push({
            name: s.name,
            look: "artifact",
            type: STACK_KIND[s.kind ?? "spell"] ?? "Spell",
            fit: true,
            pt: "",
            art: s.art ? artUrl(s.art) : null,
            crop: s.crop ? artUrl(s.crop) : null,
            faceDown: s.name === "Face-down",
            known: false,
            cost: s.manaCost ?? null,
            side,
            id: item.id,
            box: cast.box,
            origin: { x: 0, y: 0 },
            to: item.box,
            toOrigin: item.origin,
            fade: false,
            delay,
            own: { frames: run.frames, duration: run.ms },
            waits: false,
            inner: {
              frames: flipFrames(g.cardH * item.box.scale, "out"),
              duration: FLIP_MS,
              delay: flipAt,
            },
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
          // The card itself: unseen until the flip turns its new face round.
          element.animate(
            [
              { offset: 0, opacity: 0 },
              { offset: 0.47, opacity: 0 },
              { offset: 0.48, opacity: 1 },
              { offset: 1, opacity: 1 },
            ],
            { duration: FLIP_MS, delay: flipAt, easing: "linear", fill: "backwards" },
          );
          element
            .querySelector<HTMLElement>(":scope > .bf-card")
            ?.animate(flipFrames(g.cardH * item.box.scale, "in"), {
              duration: FLIP_MS,
              delay: flipAt,
              easing: "linear",
              fill: "backwards",
            });
          if (original && of) {
            const lookOfOriginal =
              before.drawn.get(before.itemOf.get(of) ?? of) ??
              drawn.get(items.find((one) => one.ids.includes(of))?.id ?? of);
            if (lookOfOriginal)
              joins.push({
                ...lookOfOriginal,
                id: `copy:${item.id}`,
                box: original.box,
                origin: original.origin,
                to: item.box,
                toOrigin: item.origin,
                fade: false,
                delay,
                own: {
                  frames: copyGhostFrames(
                    original.box,
                    original.origin,
                    item.box,
                    item.origin,
                    g.cardW,
                    g.cardH,
                  ),
                  duration: COPY_GHOST_MS,
                },
                waits: true,
                zIndex: Z_LINES - 49,
              });
            glowOriginal(item.id, delay + paced(80));
          }
          markIn(element, flipAt + (COPY_MARK_AT - COPY_FLIP_AT));
          landAt.set(item.id, flipAt + FLIP_MS);
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
          markReturn(item.id, back, hold);
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
        landAt.set(item.id, delay + duration);
      }
      // Spec 0073 (A · Glide onto the pile) -- a card joining a pile it was
      // not drawn in before has no element of its own: only the count
      // changed. Each comes as its own card, from where it came from, and
      // lands on the pile. (One drawn before -- your hand card -- leaves as
      // a ghost into the pile, below; your cast card's flight lands on it.)
      for (const slot of result.slots) {
        const lead = slot.ids[0]!;
        const look = drawn.get(lead);
        const at = now.get(lead);
        if (!look?.table || !at) continue;
        slot.ids.forEach((id, n) => {
          if (n === 0 || before.at.has(id) || before.cards.has(id) || id === flyingOnto) return;
          const nth = tokenIndex.get(id);
          if (nth !== undefined) {
            const delay = madeAt(nth);
            if (byId.get(id)?.copy) glowOriginal(id, delay);
            joins.push({
              ...look,
              id,
              box: boxOn(copySource(id) ?? sparkAt, at.box),
              origin: at.origin,
              to: at.box,
              toOrigin: at.origin,
              fade: false,
              delay,
              token: true,
              spread: spreadOf(id),
            });
            spark(id, delay);
            landAt.set(id, delay + TOKEN_MS);
            return;
          }
          if (fromTheirHand(id)) {
            joins.push({
              ...look,
              id,
              box: leftBack!.box,
              origin: leftBack!.origin,
              to: at.box,
              toOrigin: at.origin,
              fade: false,
              delay: hold,
              turn: "face",
            });
            joins.push(backGhost(id, at.box, at.origin));
            landAt.set(id, hold + MOVE_MS);
            return;
          }
          // Spec 0074: out of a graveyard or exile, risen and shown first.
          const rise = riseOf.get(id);
          if (rise) {
            joins.push(
              ghostAt(look, id, at, risen(rise, at.box, at.origin, null), SHOW_MS, rise.start),
            );
            landAt.set(id, rise.start + SHOW_MS);
            return;
          }
          const fromStack = before.stack.find((e) => e.s.card === id);
          joins.push({
            ...look,
            id,
            box: fromStack ? fromStack.box : boxAt(where[arrivals?.get(id) ?? "stack"], g),
            origin: at.origin,
            to: at.box,
            toOrigin: at.origin,
            fade: false,
            delay: hold,
            faint: !fromStack,
          });
          landAt.set(id, hold + MOVE_MS);
        });
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
      const wasAt = (id: string) => {
        if (gap !== null && isBack(id)) {
          const [, seat, index] = id.split(":");
          if (Number(index) >= gap)
            return before.at.get(`hidden-hand:${seat}:${Number(index) + 1}`);
        }
        // Spec 0074: their discards left the middle of the fan; it closes.
        if (discardGap !== null && isBack(id)) {
          const [, seat, index] = id.split(":");
          if (Number(index) >= discardGap)
            return before.at.get(`hidden-hand:${seat}:${Number(index) + hiddenDiscards.length}`);
        }
        return before.at.get(id);
      };
      // Spec 0080 (Q1 A) -- flickered (Ephemerate): Banished (A-05) to its
      // exile, then risen and shown (0074) straight back to its place. Once
      // per board: pointing at a card re-runs this.
      const flickering =
        survive && survive.key !== playedFlickers.current ? survive.flickers : undefined;
      // Spec 0095 -- what each card is playing, read once for the whole
      // table (the first time a card has to glide) instead of once per card
      // between the animations this loop starts: asking each card in turn
      // made the browser work out every style again for each.
      let playing: Map<Element, Animation[]> | null = null;
      const animationsOf = (element: HTMLElement): Animation[] => {
        if (playing === null) {
          playing = new Map();
          const root = ref.current;
          if (root && typeof root.getAnimations === "function")
            for (const a of root.getAnimations({ subtree: true })) {
              const effect = a.effect as KeyframeEffect | null;
              const target = effect?.target;
              if (!target || effect.pseudoElement) continue;
              const list = playing.get(target);
              if (list) list.push(a);
              else playing.set(target, [a]);
            }
          else return element.getAnimations?.() ?? [];
        }
        return playing.get(element) ?? [];
      };
      for (const item of items) {
        if (!before.mounted.has(item.id)) continue;
        const was = wasAt(item.id);
        if (!was) continue;
        const via = flickering?.get(item.id);
        const flickHost = via ? elements.current.get(item.id) : undefined;
        const flickLook = via ? before.drawn.get(item.id) : undefined;
        if (via && flickHost && flickLook?.table && typeof flickHost.animate === "function") {
          const exile = tileBox(via, "exile");
          const out = fateFrames(
            "exiled",
            was.box,
            exile.box,
            g.cardW,
            g.cardH,
            was.origin,
            exile.origin,
          );
          graveGhosts.push(
            ghostAt(flickLook, `flicker:${item.id}`, was, out.frames, out.duration, hold, {
              motes: true,
              zIndex: Z_RETURN_MARK - 10,
            }),
          );
          const start = hold + out.duration;
          glide(
            flickHost,
            showFrames(
              tileAt(via, "exile"),
              showAt(g.rail.x, g.height, via === "opponent"),
              poseOf(item.box, item.origin),
              g.cardW,
              g.cardH,
              item.origin,
              "table",
              null,
              item.box,
            ),
            start,
            SHOW_MS,
          );
          // Not drawn in its place while its ghost goes.
          flickHost.animate([{ opacity: 0 }, { opacity: 0 }], {
            duration: start,
            id: "flicker-away",
          });
          tick(`${via}:exile`, start, 1);
          tick(`${via}:exile`, start + paced(120), -1);
          landAt.set(item.id, start + SHOW_MS);
          continue;
        }
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
                fit: true,
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
          (oldFace.faceDown !== item.drawn.faceDown ||
            // Spec 0083 (15 A): a Room's door unlocking renames it; only that
            // door opens (RoomDoors), the card does not turn over.
            (oldFace.name !== item.drawn.name && !(oldFace.room && item.drawn.room)))
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
        const moving = animationsOf(element).some(
          (a) => a.playState === "running" && a.id !== "fight",
        );
        // Spec 0072: a back closing the gap sets off from the place of the
        // back after it (the CSS transition the new place just started says
        // nothing about that).
        // Spec 0072: a back closing the gap sets off from the place of the
        // back after it (the CSS transition the new place just started says
        // nothing about that).
        const start = moving && was === before.at.get(item.id) ? placedNow(element) : null;
        // A fight's moves are on its card, not its place: they play on.
        if (moving) for (const a of animationsOf(element)) if (a.id !== "fight") a.cancel();
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
          markReturn(item.id, goingBack, hold);
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
        // Spec 0074: a hand closes on its discards as they lift, not before.
        const closing =
          item.origin === HAND_ORIGIN
            ? closeAt.get("viewer")
            : item.origin === OPPONENT_HAND_ORIGIN
              ? closeAt.get("opponent")
              : undefined;
        glide(
          element,
          glideFrames(was.box, item.box, g.cardW, g.cardH, was.origin, item.origin, null, start),
          Math.max(delay, closing ?? 0),
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
      // Spec 0078, item 4 -- a creature killed by shrinking (Grasp of
      // Darkness on a 4/4): the game says the size it last stood at, so it
      // visibly shrinks to it (0/0, the red float) and THEN breaks (A-04).
      // Not one killed in a fight: the fight shows its own number (A-13).
      const shrinks: PlayedSize[] = [];
      const shrinkFirst = (id: string, look: Drawn, delay: number): [Drawn, number] => {
        const was = before.cards.get(id);
        const last = sizes0078?.last.get(id);
        if (!was || !last || was.power === null || was.toughness === null || reducedMotion())
          return [look, delay];
        const from = sizeOf(was);
        const damage = Math.max(0, was.damage ?? 0);
        const to = { power: last.power, toughness: last.toughness - damage, loyalty: null };
        const dP = last.power - was.power;
        const dT = last.toughness - was.toughness;
        if (dP === 0 && dT === 0) return [look, delay];
        const change = {
          card: id,
          from,
          to,
          look: dP + dT > 0 ? ("up" as const) : ("down" as const),
          float: `${signed(dP)}/${signed(dT)}`,
          badges: [],
          fromBadge: false,
        };
        // It shrinks when the spell's beam lands on it (Grasp's), as a creature that lives does.
        const stackNow = new Set((stack ?? []).map((s) => s.id));
        const beamed = before.stack.some(
          (e) => !stackNow.has(e.s.id) && e.s.targets.some((t) => "object" in t && t.object === id),
        );
        const from0 = beamed ? Math.max(delay, hold + RESOLVE_MS) : delay;
        shrinks.push({ key: `death:${sizes0078!.key}:${id}`, change, at: from0 });
        return [
          {
            ...look,
            figure: {
              card: id,
              size: to,
              basePower: was.basePower,
              baseToughness: was.baseToughness,
              damage,
            },
          },
          from0 + countSpan(change) + SHRINK_BEAT_MS,
        ];
      };
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
        markReturn(id, ret, delay);
      };
      // Spec 0073 (D · Peel off) -- a card leaving a pile lifts off its top
      // as the number drops, then plays its fate; several from one pile
      // fan off together. When the whole pile goes, its own card stays put
      // (its ghost is the pile until then) and the rest peel off it.
      const peelOf = new Map<string, { dx: number; dy: number }>();
      const waitsOf = new Set<string>();
      // Spec 0084 -- how many spent cards have been sent off so far this update.
      let spentN = 0;
      // Spec 0091 -- the casting card covers it: it waits for the step aside.
      const cover = castCoverRef.current && !reducedMotion() ? castCoverBox(g) : null;
      const asideWait = (box: Box) => (cover && covers(cover, box) ? ASIDE_MS : 0);
      for (const [lead, ids] of before.piles) {
        if (ids.length < 2) continue;
        const left = ids.filter((id) => !now.has(id) && !merged.has(id) && !returns?.has(id));
        const box = before.at.get(lead)?.box;
        if (left.length === 0 || !box) continue;
        const survives = ids.some((id) => now.has(id));
        const peeling = survives ? left : left.slice(1);
        peeling.forEach((id, i) => {
          const o = peelOffset(i, peeling.length);
          peelOf.set(id, { dx: o.x * box.w, dy: o.y * box.h });
        });
        // Until it lifts off, the pile (or its own card's ghost) draws it.
        for (const id of left) if (survives || id !== left[0]) waitsOf.add(id);
      }
      // A pile's other members have no element of their own: each leaving
      // goes as its own ghost from the pile, in the pile's look. Killed in a
      // fight the pile fought, it lifts off as that fight ends.
      for (const [lead, ids] of before.piles) {
        const look = before.drawn.get(lead);
        if (!look?.table) continue;
        ids.forEach((id, n) => {
          if (n === 0 || now.has(id) || merged.has(id) || returns?.has(id)) return;
          const at = before.at.get(id);
          if (!at) return;
          const dest = departures?.get(id) ?? `${look.side}:graveyard`;
          const fate: Fate | undefined = dest.endsWith(":graveyard")
            ? moments?.spent.has(id)
              ? "spent"
              : "defeated"
            : dest.endsWith(":exile")
              ? "exiled"
              : undefined;
          const end = fightEnds.current.get(lead);
          const fighting = hold > 0 && end !== undefined;
          const elapsed = Number(fightClock.current?.currentTime ?? 0);
          const struck = spellHits.current?.ids.has(id) ? spellHits.current.delay : 0;
          const [shown, delay0] =
            fate === "defeated" && !fighting
              ? shrinkFirst(id, look, Math.max(hold, struck))
              : [look, fighting ? Math.max(0, end - elapsed) : Math.max(hold, struck)];
          // Spec 0084: spent ones go one after another (one per mana).
          // Spec 0091: under the casting card, after it has stepped aside.
          const delay =
            fate === "spent" ? delay0 + SPENT_BEAT_MS * spentN++ + asideWait(at.box) : delay0;
          const peel = peelOf.get(id);
          leaving.push({
            ...shown,
            id,
            ...at,
            to: boxAt(where[dest], g),
            toOrigin: at.origin,
            fade: true,
            delay,
            fate,
            waits: true,
            ...(peel ? { peel } : {}),
            // Above the fights' dimming and fighters, as its pile's own card.
            ...(fighting ? { inFight: true, zIndex: Z_FIGHT + 1 } : {}),
          });
          leaveAt.set(id, delay);
        });
      }
      for (const [id, d] of before.drawn) {
        if (elementsNow.has(id) || merged.has(id)) continue;
        // Spec 0079: a held spot let go -- its outline is already gone; the gap closes.
        if (id.startsWith("held:")) continue;
        // Spec 0072: the back that rose to the middle is the casting card now
        // (the fan closed on it, above): no ghost of it leaves for a pile.
        if (gap !== null && isBack(id)) continue;
        // Spec 0074: nor do the backs their discards left (the fan closed on them).
        if (discardGap !== null && isBack(id)) continue;
        const at = before.at.get(id);
        if (!at) continue;
        // Spec 0074 (A · Lift and drop): a hand card discarded -- yours, or
        // theirs shown to you -- lifts out of the hand and drops, face up,
        // into its owner's graveyard; several, one after another.
        const nth = d.table ? undefined : discardOrder.get(id);
        if (nth !== undefined && !now.has(id)) {
          const m = discards[nth]!;
          const delay = T + nth * DISCARD_BEAT_MS;
          const theirs = d.side === "opponent";
          const from = poseOf(at.box, at.origin);
          graveGhosts.push(
            ghostAt(
              d,
              id,
              at,
              discardFrames(
                from,
                tileAt(m.to.side, m.to.zone),
                g.cardW,
                g.cardH,
                at.origin,
                theirs,
              ),
              DISCARD_MS,
              delay,
              { fade: true, waits: false, zIndex: Z_RETURN_MARK - 20 },
            ),
          );
          tick(`${m.to.side}:${m.to.zone}`, delay + DISCARD_MS, 1);
          continue;
        }
        const joined = now.get(id);
        // Phase 10 A-13: killed in a fight -- it fights, then shatters after
        // the beat; anything else leaving waits for the fights to end.
        const fought = fightGhosts.current.get(id);
        fightGhosts.current.delete(id);
        const elapsed = Number(fightClock.current?.currentTime ?? 0);
        const struck = spellHits.current?.ids.has(id) ? spellHits.current.delay : 0;
        // Spec 0073: its pile fought on (the next of it drew the fight): it
        // peels off as that fight ends.
        const fightEnd = hold > 0 && !fought ? fightEnds.current.get(id) : undefined;
        const delay = fought
          ? Math.max(0, fought.shatterAt - elapsed)
          : fightEnd !== undefined
            ? Math.max(0, fightEnd - elapsed)
            : Math.max(hold, struck);
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
        // Spec 0084 (1 A): spent -- sacrificed as a cost, by its own ability
        // or a Saga's end -- folds and goes; never the defeated look.
        const fate: Fate | undefined =
          joined || !d.table
            ? undefined
            : dest.endsWith(":graveyard")
              ? moments?.spent.has(id)
                ? "spent"
                : "defeated"
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
        // Spec 0078, item 4: shrunk to death -- it shrinks, then breaks.
        const [shown, breaks0] =
          fate === "defeated" && !fought && fightEnd === undefined
            ? shrinkFirst(id, d, delay)
            : [d, delay];
        const breaks =
          fate === "spent" ? breaks0 + SPENT_BEAT_MS * spentN++ + asideWait(at.box) : breaks0;
        // Spec 0073: into a pile, the number ticks as it lands; out of one,
        // as it lifts off (peeling, D, when it was defeated or exiled).
        if (joined) landAt.set(id, delay + MOVE_MS);
        else leaveAt.set(id, breaks);
        const peel = fate ? peelOf.get(id) : undefined;
        leaving.push(
          joined
            ? { ...d, id, ...at, to: joined.box, toOrigin: joined.origin, fade: false, delay }
            : {
                ...shown,
                id,
                ...at,
                to: boxAt(where[dest], g),
                toOrigin: at.origin,
                fade: true,
                delay: breaks,
                fate,
                ...(fight ? { fight, zIndex: Z_FIGHT + 1 } : {}),
                ...(peel ? { peel } : {}),
                // A fighting card shows its fight, over the pile it leaves.
                ...(waitsOf.has(id) && !fight ? { waits: true } : {}),
                ...(fightEnd !== undefined ? { inFight: true, zIndex: Z_FIGHT + 1 } : {}),
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
      const umbrasGoing: { id: string; was: Tab; host: string }[] = [];
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
        // Spec 0089 (Q4 B, b) -- an umbra destroyed instead of its creature:
        // its tab unfolds into a shield over the creature, which the blow
        // shatters (below, once the wipe's flash is known).
        const saved = survive?.umbras?.get(id);
        if (saved && now.has(saved)) {
          umbrasGoing.push({ id, was, host: saved });
          continue;
        }
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
            ? moments?.spent.has(id)
              ? "spent"
              : "defeated"
            : dest.endsWith(":exile")
              ? "exiled"
              : undefined,
        });
      }
      // A-07: several leaving the table at once is a board wipe -- a pale
      // flash sweeps the table first, then they all go together.
      // Spec 0084: spent cards never count toward a wipe, and never wait for its flash.
      const killed = (ghost: Ghost) => !!ghost.fate && ghost.fate !== "spent";
      // Spec 0089: an umbra destroyed instead is destroyed too (it counts).
      const wiped =
        leaving.filter((ghost) => killed(ghost) && !ghost.fight && !ghost.inFight).length +
          umbrasGoing.length >=
        WIPE_AT;
      if (wiped) {
        setSweep(performance.now());
        for (const ghost of leaving)
          if (killed(ghost)) ghost.delay = Math.max(ghost.delay, SWEEP_MS);
      }
      // Spec 0089 (Q4 B, variant b) -- when the blow lands (the survivors'
      // moment, spec 0080: after any fights, the resolving spell's beam, a
      // wipe's flash), the umbra's shield takes it: the tab swings out and
      // unfolds into the shield before it, the shield cracks and shatters, and
      // a small ghost of the umbra goes to its owner's graveyard (the pile's
      // number ticks as it lands). The creature stays, glowing softly.
      if (umbrasGoing.length > 0) {
        const resolvedNow = before.stack.some((e) => !(stack ?? []).some((x) => x.id === e.s.id));
        const times = umbraTimes(hold + (resolvedNow ? RESOLVE_MS : 0) + (wiped ? SWEEP_MS : 0));
        const added: FightMark[] = [];
        for (const { id, was, host } of umbrasGoing) {
          const at = now.get(host);
          const hostBefore = before.at.get(host)?.box ?? at?.box;
          if (!at || !hostBefore) continue;
          const tw = TAB_W * hostBefore.h;
          const tab: Box = {
            ...was.box,
            x: was.box.x + was.box.w / 2 - tw / 2,
            y: hostBefore.y + hostBefore.h * 0.015,
            w: tw,
            h: hostBefore.h * 0.97,
          };
          const toMiddle = was.drawn.side === "viewer" ? -1 : 1;
          for (const mark of umbraMarks(
            `umbra:${id}:${performance.now()}`,
            id,
            at.box,
            tab,
            times.start,
            times.blow,
            toMiddle,
          ))
            added.push({
              ...mark,
              ...(mark.kind === "umbratab"
                ? { heldTab: { name: was.drawn.name, known: true, src: null } }
                : mark.kind === "umbrashield"
                  ? { src: was.drawn.crop ?? was.drawn.art ?? null }
                  : {}),
              style: { ...mark.style, zIndex: Z_LINES + 4 },
            });
          const dest = departures?.get(id) ?? `${was.drawn.side}:graveyard`;
          leaving.push({
            ...was.drawn,
            id,
            box: umbraGhostBox(at.box, g.cardW, g.cardH),
            origin: { x: 0.5, y: 0.5 },
            to: boxAt(where[dest], g),
            toOrigin: { x: 0.5, y: 0.5 },
            fade: true,
            delay: times.blow + UMBRA_GHOST_AT,
            waits: true,
          });
          // The creature it saved: a soft pale-gold glow as the blow meets the shield.
          elements.current
            .get(result.slots.find((x) => x.ids.includes(host))?.ids[0] ?? host)
            ?.querySelector<HTMLElement>(":scope > .bf-card")
            ?.animate(
              [
                { offset: 0, boxShadow: "0 0 0 0 rgb(255 236 180 / 0%)" },
                {
                  offset: 0.5,
                  boxShadow: "0 0 0 2px rgb(255 236 180 / 70%), 0 0 18px rgb(255 236 180 / 55%)",
                },
                { offset: 1, boxShadow: "0 0 0 0 rgb(255 236 180 / 0%)" },
              ],
              { duration: paced(500), delay: times.blow, easing: "ease-in-out" },
            );
        }
        if (added.length > 0) setMarks((list) => [...list, ...added]);
      }
      // Spec 0084 (1 A) -- a spent Treasure gives a small coin spark as its
      // mana flies: a coin flips up off it, a spark swelling behind it.
      const coins: FightMark[] = [];
      for (const ghost of leaving) {
        // A Treasure by its type line, as the game sent it (never its name).
        const types = before.cards.get(ghost.id)?.types ?? "";
        if (ghost.fate !== "spent" || !/\bTreasure\b/.test(types)) continue;
        const size = ghost.box.h * 0.2;
        coins.push({
          key: `coin:${ghost.id}:${performance.now()}`,
          kind: "coin",
          style: {
            left: ghost.box.x + ghost.box.w / 2 - size / 2,
            top: ghost.box.y + ghost.box.h * 0.2 - size / 2,
            width: size,
            height: size,
          },
          frames: coinFrames(ghost.box.h),
          duration: COIN_MS,
          delay: ghost.delay + (ghost.peel ? PEEL_MS : 0),
          of: ghost.id,
        });
      }
      if (coins.length > 0) setMarks((list) => [...list, ...coins]);
      if (leaving.length + joins.length > 0) setGhosts((list) => [...list, ...joins, ...leaving]);
      // Spec 0078, item 4 -- the shrinking dead count down on a clock of
      // their own on the board (a click hurries it with their shatter).
      if (shrinks.length > 0 && ref.current && typeof ref.current.animate === "function") {
        const length = sizesLength(shrinks) + 50;
        deathClock.current?.cancel();
        const clock = ref.current.animate([{ opacity: 1 }, { opacity: 1 }], {
          duration: length,
          id: "death-size-clock",
        });
        deathClock.current = clock;
        startSizeSteps("deaths", () => Number(clock.currentTime ?? length), shrinks);
        const over = () => {
          if (deathClock.current === clock) endSizeSteps("deaths");
        };
        clock.onfinish = over;
        clock.oncancel = over;
      }
      // Spec 0073 -- each pile's number, as the cards joining it land and the
      // cards leaving it lift off: the number it showed, then each change at
      // its moment (popping), on the board's animation clock (a click hurries
      // it with the cards).
      for (const slot of result.slots) {
        const lead = slot.ids[0]!;
        const was = slot.ids
          .map((id) => (before.cards.has(id) ? before.itemOf.get(id) : undefined))
          .find((x) => x !== undefined);
        const then = was ? (before.piles.get(was) ?? []) : [];
        const changes: BadgeChange[] = [];
        for (const id of slot.ids) {
          if (!then.includes(id) && id !== flyingOnto)
            changes.push({ at: landAt.get(id) ?? 0, by: 1 });
        }
        for (const id of then) {
          if (!slot.ids.includes(id)) changes.push({ at: leaveAt.get(id) ?? 0, by: -1 });
        }
        const element = elements.current.get(lead);
        if (element && changes.some((c) => c.at > 0)) tickBadge(element, then.length, changes);
      }
      // Spec 0089 (Q5 B) -- each wave of tokens lands with its own rising
      // "+8" (or the rest) beside the pile it joins.
      const waveNumbers: FightMark[] = [];
      waves(made.length).forEach((size, w) => {
        const first = made[w * 8]!;
        const slot = result.slots.find((x) => x.ids.includes(first));
        const at = slot ? now.get(slot.ids[0]!) : undefined;
        if (!at) return;
        const k = g.cardH / 135;
        waveNumbers.push({
          key: `wave:${first}:${performance.now()}`,
          kind: "number",
          tone: "green",
          style: {
            left: at.box.x + at.box.w + 30 * k,
            top: at.box.y + 10 * k,
            fontSize: 32 * k,
            zIndex: Z_LINES + 5,
          },
          frames: [
            { offset: 0, opacity: 0, transform: "translate(-50%, -50%)" },
            { offset: 0.12, opacity: 1, transform: `translate(-50%, calc(-50% - ${4 * k}px))` },
            { offset: 0.7, opacity: 1, transform: `translate(-50%, calc(-50% - ${21 * k}px))` },
            { offset: 1, opacity: 0, transform: `translate(-50%, calc(-50% - ${30 * k}px))` },
          ],
          duration: 1100, // not paced: a number to read (spec 0106)
          delay: madeAt(w * 8) + TOKEN_MS + WAVE_NUMBER_AT,
          text: `+${size}`,
          of: first,
        });
      });
      if (waveNumbers.length > 0) setMarks((list) => [...list, ...waveNumbers]);

      // Spec 0028 — a stack object that resolved (or was countered) glows,
      // its spark runs to what it targeted, then it leaves: a spell to its
      // owner's graveyard, an ability into the permanent it came from. A
      // permanent spell flies onto the table instead (the arrivals above).
      const stillThere = new Set((stack ?? []).map((s) => s.id));
      const sparks: Effect[] = [];
      const gone: Ghost[] = [];
      const struck: Strike[] = [];
      /** Spec 0079: the fizzled spells' beams finding nothing. */
      const fizzles: Fizzle[] = [];
      /** Spec 0080: the pale shield in front of a target that could no longer be chosen. */
      const fizzleWards: FightMark[] = [];
      // Spec 0084: a fight or bite spell resolves and goes to its graveyard
      // before its fight plays (the canvas's), never held on the stack
      // through it; everything else still waits for the fights.
      const fightsHold = hold;
      if (spellFight.current && spellFight.current === fightClock.current) hold = 0;
      // Spec 0091 Amendment 1 -- the held casting card is flying onto it.
      const landing = landingRef.current;
      if (landing && before.stack.some((e) => e.s.id === landing.id)) {
        hold = Math.max(hold, landing.ms);
      }
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
        if (ret && retTo) markReturn(s.card!, ret, hold);
        // Spec 0099 Amendment 1 -- the pile the game sent the spell card to
        // (exile for flashback, an Adventure, rebound), its graveyard if not said.
        const sentTo = s.card ? departures?.get(s.card) : undefined;
        const pile: AnchorId =
          sentTo && (sentTo.endsWith(":graveyard") || sentTo.endsWith(":exile"))
            ? sentTo
            : `${side}:graveyard`;
        const [pileSide, pileZone] = pile.split(":") as [Side, TileZone];
        // Spec 0074 (F · Struck by the beam): a countered spell never shows a
        // resolve glow or spark; the countering spell's beam strikes it, and
        // it crumbles to grey ash where it is, then goes to its graveyard.
        // Spec 0101, item 2 -- and so does any entry the game says left
        // without resolving (`left`, by its stack id): a countered ability
        // (Stifle), a spell Time Stop exiled, one ward countered.
        const struckDown =
          !ret && ((!!s.card && !!countered?.has(s.card)) || !!countered?.has(s.id));
        if (struckDown) {
          const spots = before.stack.map((e) => e.box);
          // What struck it: the entry that left aiming at it, or the ward
          // trigger of the creature that countered it (ward aims at nothing).
          const wardBy = leftBy?.get(s.id);
          const by = before.stack.findIndex(
            (e) =>
              !stillThere.has(e.s.id) &&
              (e.s.targets.some((t) => "object" in t && t.object === s.id) ||
                (!!wardBy && e.s.ward === wardBy)),
          );
          const from = by >= 0 ? studAtOf(spots, by, g.cardH) : null;
          const to = before.stack.findIndex((e) => e.s.id === s.id);
          if (from && to >= 0) {
            const beam = stackBeam(spots, from, to, g.cardH, TIP_GAP * g.cardH);
            struck.push({
              key: `strike:${s.id}:${performance.now()}`,
              of: s.card ?? s.id,
              d: pathOf(beam.route),
              points: Array.from({ length: 13 }, (_, i) => routeAt(beam.route, i / 12)),
              ring: beam.aim,
              w: effectSizes(g).line,
              delay: hold,
              tone:
                before.stack[by]!.s.seat !== undefined && before.stack[by]!.s.seat !== viewerSeat
                  ? "theirs"
                  : "mine",
            });
          }
          const at = { box, origin: { x: 0, y: 0 } };
          const whole = box.scale >= STACK_READ_SCALE && !!s.art && s.name !== "Face-down";
          gone.push(
            ghostAt(
              {
                name: s.name,
                look: "artifact",
                type: STACK_KIND[s.kind ?? "spell"] ?? "Spell",
                fit: true,
                pt: "",
                art: s.art ? artUrl(s.art) : null,
                crop: s.crop ? artUrl(s.crop) : null,
                faceDown: s.name === "Face-down",
                known: false,
                cost: s.manaCost ?? null,
                side,
              },
              s.id,
              at,
              counterFrames(
                poseOf(box, at.origin),
                tileAt(pileSide, pileZone),
                g.cardW,
                g.cardH,
                at.origin,
              ),
              COUNTER_MS,
              hold,
              {
                waits: false,
                ash: true,
                // Under the stack cards above it, as on the stack (the countering
                // spell, resolving, in front of it).
                zIndex: Z_LINES - 51 - Math.max(0, to),
                stack: whole
                  ? {
                      low: artUrl(s.art!),
                      high: closeUpOf(artUrl(s.art!)),
                      kind: STACK_KIND[s.kind ?? "spell"] ?? "Spell",
                      does: s.does ?? null,
                      whose: side === "viewer" ? " bf-stack-mine" : " bf-stack-theirs",
                    }
                  : undefined,
              },
            ),
          );
          // An ability goes nowhere (Forge moves nothing for it).
          if (s.card) tick(pile, hold + COUNTER_MS, 1);
          continue;
        }
        const stackLook = (): Ghost["stack"] =>
          box.scale >= STACK_READ_SCALE && !!s.art && s.name !== "Face-down"
            ? {
                low: artUrl(s.art),
                high: closeUpOf(artUrl(s.art)),
                kind: STACK_KIND[s.kind ?? "spell"] ?? "Spell",
                does: s.does ?? null,
                whose: side === "viewer" ? " bf-stack-mine" : " bf-stack-theirs",
              }
            : undefined;
        const lookOfSpell: Drawn = {
          name: s.name,
          look: "artifact",
          type: STACK_KIND[s.kind ?? "spell"] ?? "Spell",
          fit: true,
          pt: "",
          art: s.art ? artUrl(s.art) : null,
          crop: s.crop ? artUrl(s.crop) : null,
          faceDown: s.name === "Face-down",
          known: false,
          cost: s.manaCost ?? null,
          side,
        };
        const spotOf = before.stack.findIndex((e) => e.s.id === s.id);
        // Spec 0079 (Q4 A) -- a spell that did nothing: its beam reaches the
        // place of what it aimed at (held, an outline) and finds nothing; the
        // ring and the outline break up; it goes grey and see-through as
        // smoke rises, then drifts to its graveyard (a copy just fades away).
        if (!ret && !!s.card && !!fizzled?.has(s.card)) {
          const entries = [s.id, ...(s.members ?? [])];
          const spots = [...heldMemory.current.held]
            .filter(([, spot]) => entries.some((e) => spot.by.has(e)))
            .map(([card]) => card);
          const aims = (
            spots.length > 0
              ? spots.map((card) => now.get(heldId(card)))
              : s.targets.map((t) => ("object" in t ? now.get(t.object) : undefined))
          ).filter((at): at is { box: Box; origin: Point } => at !== undefined);
          const from = studAtOf(
            before.stack.map((e) => e.box),
            Math.max(0, spotOf),
            g.cardH,
          );
          // Spec 0080 (Q5 A) -- its target is still on the table, no longer
          // allowed (protection from red): the pale shield flares in front of
          // it as the beam reaches it (no number: nothing was dealt).
          // Spec 0085 -- and its protection marks pulse once: that is why.
          if (spots.length === 0)
            for (const t of s.targets) {
              if (!("object" in t)) continue;
              const item = positions.get(t.object)?.item;
              const el = item ? elements.current.get(item) : undefined;
              for (const square of el?.querySelectorAll<HTMLElement>(
                ".bf-mark-kw:not([data-folds])",
              ) ?? [])
                if (typeof square.animate === "function")
                  square.animate(whyPulseFrames(), {
                    duration: WHY_PULSE_MS,
                    delay: hold + FIZZLE_WARD_MS,
                    easing: "ease-in-out",
                  });
            }
          if (spots.length === 0)
            for (const at of aims)
              fizzleWards.push(
                ...asMarks(
                  wardMarks(
                    `fizzle-ward:${s.id}:${fizzleWards.length}`,
                    centreOf(at.box, at.origin),
                    at.box.h * 0.5,
                    hold + FIZZLE_WARD_MS,
                    s.card,
                    false,
                    g.cardH * 0.3,
                  ),
                ),
              );
          for (const at of aims) {
            if (!from) break;
            const c = centreOf(at.box, at.origin);
            const end = { x: c.x, y: c.y - (g.cardH * at.box.scale) / 2 - 3 };
            const lift = Math.min(from.y, end.y) - g.cardH * 0.4;
            fizzles.push({
              key: `fizzle:${s.id}:${fizzles.length}:${performance.now()}`,
              of: s.card,
              d: `M${from.x} ${from.y} Q ${(from.x + end.x) / 2} ${lift} ${end.x} ${end.y}`,
              ring: {
                x: c.x,
                y: c.y - g.cardH * at.box.scale * 0.08,
                r: g.cardH * at.box.scale * 0.22,
              },
              w: effectSizes(g).line,
              delay: hold,
            });
          }
          for (const card of spots) {
            const outline = elements.current
              .get(heldId(card))
              ?.querySelector<HTMLElement>(".bf-held");
            if (outline && typeof outline.animate === "function") {
              const breaks = outline.animate(heldBreakFrames(), {
                duration: FIZZLE_HOLD_MS,
                delay: hold,
                easing: "linear",
                fill: "forwards",
              });
              breaking.current.add(card);
              const letGo = () => {
                breaking.current.delete(card);
                releaseHeld(card);
              };
              breaks.onfinish = letGo;
              breaks.oncancel = letGo;
            }
          }
          const copy = s.copy === true;
          const at = { box, origin: { x: 0, y: 0 } };
          gone.push(
            ghostAt(
              lookOfSpell,
              s.id,
              at,
              fizzleFrames(
                poseOf(box, at.origin),
                copy ? null : tileAt(pileSide, pileZone),
                g.cardW,
                g.cardH,
                at.origin,
              ),
              FIZZLE_MS,
              hold,
              {
                waits: false,
                smoke: true,
                fxAt: FIZZLE_GREY_AT,
                mark: copy,
                zIndex: Z_LINES - 51 - Math.max(0, spotOf),
                stack: stackLook(),
              },
            ),
          );
          if (!copy) tick(pile, hold + FIZZLE_MS, 1);
          continue;
        }
        // Spec 0079 (Q2 A) -- a copy of a spell resolved: it glows, its spark
        // runs to what it aimed at, and it breaks into gold motes where it is
        // -- off the "xN" card it was part of, a little up and left -- never
        // to a graveyard.
        if (!ret && s.copy) {
          for (const t of s.targets) {
            const at =
              "player" in t
                ? where[`${t.player === viewerSeat ? "viewer" : "opponent"}:life`]
                : (() => {
                    const p = before.at.get(t.object);
                    return p ? centreOf(p.box, p.origin) : null;
                  })();
            if (at)
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
          const k = box.h / 134;
          const apart = (s.count ?? 1) > 1 ? { x: -8 * k, y: -6 * k } : { x: 0, y: 0 };
          const end = copyEndFrames(box, g.cardW, g.cardH, RESOLVE_MS, apart);
          gone.push(
            // Spec 0082 -- an ability copy's ghost is the copy it was on its
            // card (its host is the original's too), for the jump check.
            ghostAt(
              lookOfSpell,
              s.kind && s.kind !== "spell" && s.things?.[0] ? s.things[0] : s.id,
              { box, origin: { x: 0, y: 0 } },
              end.frames,
              end.ms,
              hold,
              {
                waits: false,
                gold: true,
                fxAt: RESOLVE_MS,
                mark: true,
                zIndex: Z_LINES - 50,
                stack: stackLook(),
              },
            ),
          );
          continue;
        }
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
          fit: true,
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
          to: retTo ?? (into ? into.box : boxAt(where[pile], g)),
          card: s.card ?? undefined,
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
      // Spec 0085 (4 A) -- a holder leaving: each held card's tab flies from
      // its edge to that card's exile pile as the holder's fate starts; a
      // card that stays in exile (an imprint, a Hideaway card) sinks there
      // with its tab, and never rises.
      const heldFlights: FightMark[] = [];
      for (const ghost of leaving) {
        const card = before.cards.get(ghost.id);
        const holding = card?.holding ?? [];
        if (holding.length === 0) continue;
        const attachedN = before.cards.size
          ? [...before.cards.values()].filter((c) => c.attachedTo === ghost.id).length
          : 0;
        const total = attachedN + holding.length;
        const h = ghost.box.h;
        holding.forEach((held, j) => {
          const fromX = ghost.box.x + ghost.box.w + (tabAt(attachedN + j, total) + TAB_W / 2) * h;
          const fromY = ghost.box.y + h / 2;
          const side: Side = held.seat === viewerSeat ? "viewer" : "opponent";
          const pile = where[`${side}:exile`];
          const stays = !tm.some((m) => m.card === held.id && m.from.zone === "exile");
          const tw = TAB_W * h;
          const th = 0.97 * h;
          const flight = heldFlyFrames(
            pile.x - fromX,
            pile.y - fromY,
            HELD_ARC * h,
            stays,
            Math.max(0, ghost.delay - paced(50)),
          );
          heldFlights.push({
            key: `heldtab:${ghost.id}:${held.id}:${performance.now()}`,
            kind: "heldtab",
            style: {
              left: fromX - tw / 2,
              top: fromY - th / 2,
              width: tw,
              height: th,
              ["--card-h" as string]: `${h}px`,
            },
            frames: flight.frames,
            duration: flight.duration,
            delay: 0,
            of: held.id,
            heldTab: {
              name: held.name,
              known: held.known,
              src: held.known && (held.crop ?? held.art) ? artUrl((held.crop ?? held.art)!) : null,
            },
          });
        });
      }
      if (heldFlights.length > 0) setMarks((list) => [...list, ...heldFlights]);
      if (graveGhosts.length > 0) setGhosts((list) => [...list, ...graveGhosts]);
      if (struck.length > 0) setStrikes((list) => [...list, ...struck]);
      if (fizzles.length > 0) setFizzles((list) => [...list, ...fizzles]);
      if (fizzleWards.length > 0) setMarks((list) => [...list, ...fizzleWards]);
      // A spot kept for a fizzle that is not playing here (no outline to
      // break): let go now.
      for (const [card, spot] of heldMemory.current.held)
        if (spot.until !== undefined && !breaking.current.has(card)) releaseHeld(card);
      // Spec 0074 -- each tile's number as its cards leave and land: the
      // number it showed, then each change at its moment (popping), on the
      // board's animation clock (a click hurries it with the cards).
      // Spec 0089 (Q2 A) -- before the first turn: the libraries count the
      // deal down and a mulligan's seven (or a put-back) up, card by card, with
      // a rising "−7" / "+7" / "+1" by the tile; the other player's backs go
      // into their library and come back (by place: which back is which is
      // never known); the riffle waits for the seven (below).
      if (opening && opening.key !== playedOpening.current) {
        playedOpening.current = opening.key;
        const numbers: FightMark[] = [];
        const say = (side: Side, n: number, at: number) => {
          const pile = where[`${side}:library`];
          const k = g.height / 1080;
          numbers.push({
            key: `opening:${opening.key}:${side}:${n}:${at}`,
            kind: "number",
            ...(n > 0 ? { tone: "green" as const } : {}),
            // The canvas's: just right of the tile's count, rising.
            style: {
              left: pile.x - 38 * k,
              top: pile.y,
              fontSize: 36 * k,
              zIndex: Z_LINES + 6,
            },
            frames: [
              { offset: 0, opacity: 0, transform: "translate(-50%, -50%)" },
              { offset: 0.12, opacity: 1, transform: `translate(-50%, calc(-50% - ${4 * k}px))` },
              { offset: 0.7, opacity: 1, transform: `translate(-50%, calc(-50% - ${21 * k}px))` },
              { offset: 1, opacity: 0, transform: `translate(-50%, calc(-50% - ${30 * k}px))` },
            ],
            duration: 1100, // not paced: a number to read (spec 0106)
            delay: at + openingDelay,
            text: `${n > 0 ? "+" : "−"}${Math.abs(n)}`,
            of: `library:${side}`,
          });
        };
        for (const [side, o] of opening.sides) {
          const tile = `${side}:library`;
          const swept = o.out > 0 && o.where === "shuffled";
          for (let j = 0; j < o.out; j++)
            tick(tile, openingDelay + (swept ? sweptInAt(j) : PUT_BACK_MS + j * 60), 1);
          if (o.out > 0) say(side, o.out, swept ? sweptInAt(o.out - 1) : PUT_BACK_MS);
          for (let i = 0; i < o.dealt; i++) tick(tile, openingDelay + dealAt(i, swept) + 1, -1);
          if (o.dealt > 0) say(side, -o.dealt, dealAt(0, swept) + DEAL_NUMBER_AT);
          if (side !== "opponent") continue;
          // Their backs: those that go leave their fan -- all of them for a
          // mulligan, the middle ones for a put-back -- for their library.
          const backs = [...before.at.keys()]
            .filter((k) => k.startsWith("hidden-hand:"))
            .sort((a, b) => Number(a.split(":")[2]) - Number(b.split(":")[2]));
          const from =
            o.out >= backs.length
              ? 0
              : Math.max(0, Math.floor((backs.length - 1) / 2) - Math.floor((o.out - 1) / 2));
          backs.slice(from, from + o.out).forEach((key, j) => {
            const at = before.at.get(key);
            if (!at) return;
            gone.push({
              ...backLook,
              id: `${key}:opening:${opening.key}`,
              box: at.box,
              origin: at.origin,
              to: boxAt(where["opponent:library"], g),
              toOrigin: { x: 0.5, y: 0.5 },
              fade: true,
              delay: openingDelay + (swept ? sweepAt(j) : j * 60),
              waits: true,
            });
          });
          // Dealt again after a mulligan: the fan's backs are the same places,
          // so each flies in from the library on its own (hidden until it goes).
          if (swept && o.dealt > 0) {
            const lib = boxAt(where["opponent:library"], g);
            items
              .filter((item) => item.id.startsWith("hidden-hand:"))
              .slice(-o.dealt)
              .forEach((item, i) => {
                const element = elements.current.get(item.id);
                if (!element || typeof element.animate !== "function") return;
                const frames = glideFrames(
                  {
                    ...lib,
                    x: lib.x + lib.w / 2 - item.box.w / 2,
                    y: lib.y + lib.h / 2 - item.box.h / 2,
                  },
                  item.box,
                  g.cardW,
                  g.cardH,
                  item.origin,
                  item.origin,
                );
                frames[0] = { ...frames[0], opacity: 0 };
                for (let f = 1; f < frames.length; f++) frames[f] = { ...frames[f], opacity: 1 };
                glide(element, frames, openingDelay + dealAt(i, true), DEAL_MS);
              });
          }
        }
        if (numbers.length > 0) setMarks((list) => [...list, ...numbers]);
      }
      // A tile already ticking counts the other cards landing in it this
      // update too (the spell that did it, a creature that died), as each
      // lands -- never one number early.
      for (const ghost of [...leaving, ...gone]) {
        if (!ghost.fade || ghost.returning || ghost.chained || ghost.own) continue;
        const tile = Object.entries(where).find(
          ([key, at]) =>
            (key.endsWith(":graveyard") || key.endsWith(":exile")) &&
            Math.abs(at.x - (ghost.to.x + ghost.to.w / 2)) < 1 &&
            Math.abs(at.y - (ghost.to.y + ghost.to.h / 2)) < 1,
        )?.[0];
        if (!tile) continue;
        // Spec 0099 (Q2a, Q2c) -- a card now in that pile (a creature that
        // died, one paid as a cost) is counted as it lands even when nothing
        // else lands there: the number waits for it, and the fan's card
        // rises after it (`landed` below). A token is gone, never counted.
        if (before.cards.get(ghost.id)?.token === true) continue;
        // Spec 0099 Amendment 1 -- a spell's ghost carries the stack's id;
        // it is counted by its card.
        if (!ticks.has(tile) && !pileCards?.has(ghost.card ?? ghost.id)) continue;
        const lead = ghost.fate ? fateMs(ghost.fate) + (ghost.peel ? PEEL_MS : 0) : 0;
        tick(tile, ghost.delay + lead + MOVE_MS, 1);
      }
      for (const [tile, changes] of ticks) {
        const n = ref.current?.querySelector<HTMLElement>(
          `[data-zone-tile="${tile}"] .gs-zone-n:not(.gs-zone-was)`,
        );
        if (!n || !changes.some((c) => c.at > 0)) continue;
        // Spec 0099 Amendment 1 (3) -- the last board's changes to this tile
        // not yet reached (a card still flying to it) come first, at their
        // remaining times on the animation clock; only when the numbers agree
        // (the last run's number plus this board's changes is the number now).
        const was = tileRuns.current.get(tile);
        const shown = Number(n.textContent);
        const mine = changes.reduce((sum, c) => sum + c.by, 0);
        const elapsed = Number(was?.run.currentTime ?? 0);
        const carried =
          was && was.run.playState === "running" && was.end + mine === shown
            ? was.changes
                .filter((c) => c.at > elapsed)
                .map((c) => ({ at: c.at - elapsed, by: c.by }))
            : [];
        const all = [...carried, ...changes];
        was?.run.cancel();
        const run = tickTile(n, all);
        if (run) tileRuns.current.set(tile, { run, changes: all, end: shown });
        else tileRuns.current.delete(tile);
      }
      // Spec 0106 Amendment 1 (owner 2026-11-19) -- what an EARLIER board is
      // still bringing to a tile (Glimpse's ten-card mill, its cards still
      // flying when the board that makes them usable arrives): how long
      // until its last card lands there, on the tile's own count-up run.
      const coming = (tile: string) => {
        const run = tileRuns.current.get(tile);
        if (!run || run.run.playState !== "running") return 0;
        const last = Math.max(0, ...run.changes.map((c) => c.at));
        return Math.max(0, last - Number(run.run.currentTime ?? 0));
      };
      // Spec 0087 -- the fans, once per board: what this board brings
      // (pileFan.ts says which cards, Board draws them at rest).
      if (fanWas.current.fans !== fans)
        playFans({
          fans,
          more: fanMoreNow,
          was: fanWas.current,
          boxes: fanBoxesNow,
          piles: pileCards,
          cards: cardsRef.current,
          rail: ref.current,
          where,
          g,
          hold,
          resolved: before.stack.some((e) => !(stack ?? []).some((s) => s.id === e.s.id)),
          landed: (tile) => Math.max(0, ...(ticks.get(tile) ?? []).map((c) => c.at), coming(tile)),
        });
      hold = fightsHold;
      if (landing) {
        for (const ghost of gone) if (ghost.id === landing.id) ghost.unseen = landing.ms;
      }
      if (gone.length > 0) setGhosts((list) => [...list, ...gone]);
      // Spec 0084 (6 B) -- coming alive, and back: the marks, the breath, the number.
      if (living.length > 0) {
        aliveSeen.current = before;
        const marks: FightMark[] = [];
        for (const l of living) {
          const home = before.at.get(l.id)?.box;
          const now = positions.get(l.id)?.box;
          if (!home || !now) continue;
          const key = `alive:${l.id}:${performance.now()}`;
          const card = elements.current
            .get(l.item)
            ?.querySelector<HTMLElement>(":scope > .bf-card");
          if (l.up) {
            marks.push(...moteMarks(key, l.from, home, l.times.motes, l.id));
            marks.push(ringMark(key, home, l.times.pulse, l.id, false));
            if (l.pt) marks.push(ptFloat(key, now, l.pt, l.times.number, l.id, false));
            if (card && typeof card.animate === "function") {
              card.animate(breathFrames(), {
                duration: ALIVE_PULSE_MS,
                delay: l.times.pulse,
                easing: "ease-in-out",
                composite: "add",
              });
              const pt = card.querySelector<HTMLElement>(".bf-pt");
              if (pt && typeof pt.animate === "function") {
                const pop = numberInFrames(l.times.number);
                pt.animate(pop.frames, { duration: pop.duration, easing: "linear", fill: "both" });
              }
            }
          } else {
            marks.push(ringMark(key, home, l.times.pulse, l.id, true));
            if (l.pt) marks.push(ptFloat(key, home, l.pt, l.times.number, l.id, true));
          }
        }
        if (marks.length > 0) setMarks((list) => [...list, ...marks]);
      }
      // Spec 0084 (5 A) -- a library shuffled on its own (a fetch land, a
      // tutor, Rampant Growth): the same riffle on that player's library
      // pile, for both seats; once the card that came out of it has landed.
      // On the pile at the top of the screen the backs fan downward, so they
      // stay on screen. A card shuffled in already riffles it (A-14, above).
      if (moments && moments.shuffles.length > 0 && shuffledKey.current !== moments.key) {
        shuffledKey.current = moments.key;
        for (const side of moments.shuffles) {
          const key = `library:${side}:shuffled`;
          if (tagged.has(key)) continue;
          tagged.add(key);
          const fetched = battlefield.some(
            (c) => !before.cards.has(c.id) && arrivals?.get(c.id) === `${side}:library`,
          );
          const pile = where[`${side}:library`];
          const w = g.cardW * AT_ZONE_SCALE;
          const h = g.cardH * AT_ZONE_SCALE;
          // Spec 0089 (Q2 A) -- a mulligan's riffle waits for its seven to be in.
          const start =
            hold +
            (fetched ? SHUFFLE_AFTER_MS : 0) +
            (opening?.sides.get(side)?.where === "shuffled" ? openingDelay + OPENING_RIFFLE_AT : 0);
          for (let i = 0; i < RIFFLE_CARDS; i++) {
            returning.push({
              key: `riffle:shuffle:${moments.key}:${side}:${i}`,
              kind: "riffle",
              style: { left: pile.x, top: pile.y, width: w, height: h },
              frames: riffleFrames(i, h / 56, side === "opponent"),
              duration: RIFFLE_MS,
              delay: start + i * RIFFLE_BEAT_MS,
              of: `library:${side}`,
            });
          }
        }
      }
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
            RESOLVE_MS + paced(200),
          ),
        );
      }
    }

    if (fanWas.current.fans !== fans) {
      // Spec 0087 -- what each fan card looked like and where it stood, for
      // the next board: a card that leaves the fan into its tile is that
      // look, sinking; one cast from it rises from that place.
      const clones = new Map<string, HTMLElement>();
      for (const el of cardsRef.current?.querySelectorAll<HTMLElement>(
        ":scope > [data-fan-card]",
      ) ?? [])
        if (el.dataset.fanCard) clones.set(el.dataset.fanCard, el.cloneNode(true) as HTMLElement);
      const gone = new Map(fanWas.current.gone);
      const nowIds = new Set(fans.map((c) => c.id));
      for (const [id, box] of fanWas.current.boxes)
        if (!nowIds.has(id) && !pileCards?.has(id)) gone.set(id, { box, at: performance.now() });
      for (const [id, was] of gone)
        if (nowIds.has(id) || performance.now() - was.at > FAN_GONE_MS) gone.delete(id);
      fanWas.current = {
        fans,
        boxes: fanBoxesNow,
        clones,
        piles: pileCards ?? new Set(),
        gone,
        more: new Set(fanMoreNow.map((m) => m.side)),
      };
    }
    const spots = stackSpotBoxes(g, (stack ?? []).length, stackScale);
    playedMerges.current = merges;
    playedTiles.current = tileMoves;
    if (survive) playedFlickers.current = survive.key;
    const itemOf = new Map<string, string>();
    const members = new Map<string, number>();
    for (const item of items) {
      for (const id of item.ids) itemOf.set(id, item.id);
      members.set(
        item.id,
        item.ids.filter((id) => byId.has(id) && !byId.get(id)!.attachedTo).length || 1,
      );
    }
    const piles = new Map(result.slots.map((slot) => [slot.ids[0]!, slot.ids]));
    previous.current = {
      pointed,
      tabs,
      itemOf,
      members,
      piles,
      cards: new Map(battlefield.map((card) => [card.id, card])),
      roles,
      viewport: { width: g.width, height: g.height },
      at: now,
      drawn,
      mounted: new Set(items.map((item) => item.id)),
      stack: (stack ?? []).slice(0, spots.length).map((s, i) => ({ s, box: spots[i]! })),
    };
  }, [
    opening,
    openingDelay,
    restart,
    onRestartSwept,
    fans,
    fanBoxesNow,
    fanMoreNow,
    pileCards,
    items,
    result,
    positions,
    byId,
    arrivals,
    departures,
    merges,
    returns,
    tileMoves,
    countered,
    leftBy,
    fizzled,
    survive,
    moments,
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
    sizes0078,
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

  // Spec 0100, item 8 -- after each drawing: what the stack aimed at and
  // where its beams ended, for the next board; a swing starting withholds
  // its new target's corners (they ride the beam's end) until it lands.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- after every drawing, on purpose; it sets state only when the swing changes
  useLayoutEffect(() => {
    const seen = linesSeen.current;
    aimsBefore.current = seen.aims;
    tipsBefore.current = seen.tips;
    for (const [id] of swings.current) {
      if (!seen.aims.has(id.split(":").slice(0, 2).join(":"))) swings.current.delete(id);
    }
    for (const [own, first] of swungKeys.current) {
      if (!seen.tips.has(first)) swungKeys.current.delete(own);
    }
    const active = [...swings.current.values()].find((s) => !s.done);
    const want = active ? { id: active.id, to: active.id.split(":").slice(2).join(":") } : null;
    if ((want?.id ?? null) !== (swinging?.id ?? null)) setSwinging(want);
  });
  // Spec 0100, item 8 -- the game screen holds the next board while it swings.
  const swingingNow = swinging !== null;
  useEffect(() => {
    onSwinging?.(swingingNow);
  }, [swingingNow, onSwinging]);
  const swingDone = useCallback((id: string) => {
    const swing = swings.current.get(id);
    if (swing) swing.done = true;
    setSwinging((now) => (now?.id === id ? null : now));
  }, []);

  // Spec 0090 (2, 3) -- after every drawing, and after every other effect has
  // started its animations: each glow layer plays its card's movements; the
  // flyers bob in step (more than FLY_SYNC_AT), or not at all while the tab
  // is hidden. Once more on the next frame, for anything started late.
  // Spec 0095: only the cards that started moving (followStarted); the
  // next frame's look does nothing when nothing started since.
  useLayoutEffect(() => {
    const root = ref.current;
    followStarted(root);
    if (typeof document !== "undefined" && document.hidden) pauseFlyers(root, true);
    else {
      if (inStep) bobInStep(root);
      if (zzStep) bobInStep(root, ZZ_ANIMATIONS);
    }
    if (typeof requestAnimationFrame !== "function") return undefined;
    const frame = requestAnimationFrame(() => followStarted(ref.current));
    return () => cancelAnimationFrame(frame);
  });
  useEffect(() => {
    const seen = () => {
      pauseFlyers(ref.current, document.hidden);
      if (!document.hidden && inStepRef.current) bobInStep(ref.current);
      if (!document.hidden && zzStepRef.current) bobInStep(ref.current, ZZ_ANIMATIONS);
    };
    document.addEventListener("visibilitychange", seen);
    return () => document.removeEventListener("visibilitychange", seen);
  }, []);

  if (!result) return <div ref={ref} className="bf-board" data-testid="battlefield" />;
  const g = result.geometry;
  // Spec 0083 (18 B) -- whose hand a split-second spell locks: the side that
  // did not cast it.
  const splitEntry = (stack ?? []).find((s) => s.splitSecond);
  const splitLock = splitEntry ? (splitEntry.seat === viewerSeat ? "opponent" : "viewer") : null;
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
  // Spec 0082 -- the copies on their way, each card beside the entry it
  // copies; every copy on it (and the card) answers to "where is it".
  const waitingAt = waitingBoxes(copying, stack ?? [], spot);
  const waitingBox = new Map<string, Box>();
  for (const w of copying) {
    const box = waitingAt.get(w.id);
    if (!box) continue;
    for (const id of [w.id, ...(w.members ?? [])]) waitingBox.set(id, box);
  }
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
    look?: BeamLook,
  ) => {
    if (!route) return;
    const own = `${kind}:${drawn(from)}:${to.startsWith("player:") || to.startsWith("pile:") ? to : drawn(to)}`;
    // Spec 0100, item 8 -- a beam that swung to a new target keeps its
    // element (its first key) for as long as it points there.
    const key = swungKeys.current.get(own) ?? own;
    const same = byKey.get(key);
    if (same) same.count += 1;
    else
      byKey.set(key, {
        key,
        kind,
        from,
        to,
        route,
        count: 1,
        ...(aim ? { aim } : {}),
        ...(look ? { look } : {}),
      });
  };
  // Spec 0100, item 5 (missed Q2 A) -- a target lying in a graveyard or an
  // exile: its tile, and the card peeking out of it face up (none for a
  // face-down exiled card: the beam ends on the tile).
  const peekOf = (id: string): { tile: Point; box: Box | null } | null => {
    const card = piled?.get(id);
    if (!card) return null;
    const tile = where[`${card.seat === viewerSeat ? "viewer" : "opponent"}:${card.zone}`];
    if (!tile) return null;
    return { tile, box: card.faceDown ? null : peekBox(tile, g) };
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
  // Spec 0086, Amendment 3 (owner 2026-11-14) -- the line under the stack
  // tells only the cards that have landed there: one still held for the
  // fights, rising out of its card or sliding in is not "next" yet. Its
  // words come when it lands (a click hurries its arrival, and so them).
  const landed = (stack ?? []).filter((s) => !stackWaiting(s));
  const landedTotal = landed.reduce((n, s) => n + (s.count ?? 1), 0);
  const focus = stackFocus(stack, pointedOnStack ?? pointedStack);
  const shown = (stack ?? []).filter((s) => s.id === focus);
  // Spec 0100, item 5 -- the cards the focused entry aims at in a pile,
  // peeking out of their tiles (face up only), with their corners.
  const peeks = shown
    .filter((s) => !stackWaiting(s))
    .flatMap((s) =>
      s.targets.flatMap((t) => {
        if (!("object" in t) || positions.has(t.object) || fanBoxesNow.has(t.object)) return [];
        const pile = peekOf(t.object);
        const card = piled?.get(t.object);
        return pile?.box && card
          ? [
              {
                card,
                box: pile.box,
                tile: pile.tile,
                theirs: s.seat !== undefined && s.seat !== viewerSeat,
              },
            ]
          : [];
      }),
    );
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
    // Spec 0100, item 7 -- whose it is, by its beam: yours gold, theirs blue-violet.
    const tone: BeamTone = s.seat !== undefined && s.seat !== viewerSeat ? "theirs" : "mine";
    // Item 3 -- kicked: a doubled beam.
    const doubled = !!s.extra?.includes("kicked");
    // Item 8 -- the one target that changed since the last board: its end swings.
    const before = aimsBefore.current.get(s.id);
    const nowKeys = s.targets.map(refKey);
    const changed =
      before && before.length === nowKeys.length && !reducedMotion()
        ? nowKeys.filter((k, i) => k !== before[i])
        : [];
    for (const t of s.targets) {
      // Spec 0069, item 4 -- something on the stack (a counterspell's
      // target): the ripple beside that stack card's name, left of its
      // badges, and the beam from this card's stud to it.
      const onStack = "object" in t && !positions.has(t.object) ? spotIndex(t.object) : -1;
      if (onStack >= 0) {
        const beam = stackBeam(spot, start.at, onStack, g.cardH, gap);
        add("target", s.id, refKey(t), beam.route, beam.aim, { tone });
        continue;
      }
      const share = s.shares?.[refKey(t)];
      const look: BeamLook = {
        tone,
        ...(doubled ? { doubled } : {}),
        ...(share !== undefined ? { share } : {}),
      };
      // Spec 0100, item 5 -- a card in a graveyard or a face-up exile: the
      // beam runs to its tile, to the card peeking out of it.
      // A card standing in its pile's fan (0087): the beam runs to it there.
      const fanBox =
        "object" in t && !positions.has(t.object) ? fanBoxesNow.get(t.object) : undefined;
      if (fanBox) {
        const route = arc(
          start,
          { x: fanBox.x + fanBox.w / 2, y: fanBox.y - gap },
          g.cardH,
          undefined,
          clear,
        );
        add(
          "target",
          s.id,
          refKey(t),
          route,
          {
            at: { x: fanBox.x + fanBox.w / 2, y: fanBox.y + fanBox.h * 0.42 },
            r: fanBox.h * 0.1,
          },
          look,
        );
        continue;
      }
      const pile = "object" in t && !positions.has(t.object) ? peekOf(t.object) : null;
      if (pile) {
        const box = pile.box;
        const route = box
          ? arc(start, { x: box.x + box.w / 2, y: box.y - gap }, g.cardH, undefined, clear)
          : arcToRing(start, pile.tile, g.cardH * 0.12, g.cardH, clear, plates);
        const aim = box
          ? { at: { x: box.x + box.w / 2, y: box.y + box.h * 0.42 }, r: box.h * 0.18 }
          : { at: pile.tile, r: g.cardH * 0.12 };
        add("target", s.id, refKey(t), route, aim, look);
        continue;
      }
      const route = onto(start, t, clear, spot[index]);
      // Item 8 -- swung: the line keeps the element it had, its end moving.
      const k = refKey(t);
      const swingId = `${s.id}:${k}`;
      if (changed.length === 1 && changed[0] === k && route && !swings.current.has(swingId)) {
        const from = before![nowKeys.indexOf(k)]!;
        const fromKey = `target:${drawn(s.id)}:${from.startsWith("player:") ? from : drawn(from)}`;
        const oldKey = swungKeys.current.get(fromKey) ?? fromKey;
        // Where its beam ended last board; or, when it was not shown then
        // (another entry was in front: Spellskite's ability, waiting above
        // it), where it would have ended -- the old target's top edge.
        const old = positions.get(from);
        const fromTip =
          tipsBefore.current.get(oldKey) ??
          (old
            ? topOf(old.box, old.origin, gap)
            : from.startsWith("player:")
              ? playerPoint(Number(from.slice(7)), viewerSeat, where)
              : undefined);
        if (fromTip) {
          swungKeys.current.set(
            `target:${drawn(s.id)}:${k.startsWith("player:") ? k : drawn(k)}`,
            oldKey,
          );
          const was = positions.get(from);
          const now = "object" in t ? positions.get(t.object) : undefined;
          swings.current.set(swingId, {
            from: fromTip,
            box: was ? was.box : null,
            to: now ? now.box : null,
            id: swingId,
            done: false,
          });
        }
      }
      const swing = swings.current.get(swingId);
      if (swing && !swing.done) {
        look.swing = swing;
        look.routeTo = (end: Point) => arc(start, end, g.cardH, undefined, clear);
      }
      add("target", s.id, k, route, aimOf(t, route), look);
    }
    // Spec 0100, item 3 -- overloaded (it targets nothing): a beam fanned to
    // every card it would hit now; at most HITS_DRAWN beams, corners on all.
    if (s.extra?.includes("overloaded"))
      for (const id of (s.hits ?? []).filter((h) => positions.has(h)).slice(0, HITS_DRAWN)) {
        const t = { object: id };
        const route = onto(start, t, clear, spot[index]);
        add("target", s.id, id, route, aimOf(t, route), { tone });
      }
    // Item 3 -- evoked: a grey beam to its caster's own graveyard tile.
    if (s.extra?.includes("evoked") && s.seat !== undefined) {
      const tile = where[`${s.seat === viewerSeat ? "viewer" : "opponent"}:graveyard`];
      if (tile) {
        const route = arcToRing(start, tile, g.cardH * 0.12, g.cardH, clear, plates);
        add(
          "target",
          s.id,
          `pile:${s.seat}:graveyard`,
          route,
          { at: tile, r: g.cardH * 0.12 },
          {
            tone: "grey",
          },
        );
      }
    }
    if (s.targets.length > 0 || s.hits?.length || s.extra?.includes("evoked")) studAt = index;
  }
  // Spec 0082 -- a card of copies on its way aims from where it waits,
  // once it has peeled on (the target being picked shows no line yet).
  for (const w of copying) {
    const box = waitingAt.get(w.id);
    if (!box || w.targets.length === 0 || (arriving.current.get(w.id) ?? 0) > performance.now())
      continue;
    const start: Port = {
      at: { x: box.x - box.h * 0.02, y: box.y + box.h * STUD_AT },
      out: { x: -1, y: 0 },
    };
    for (const t of w.targets) {
      const route = onto(start, t, undefined, box);
      add("target", w.id, refKey(t), route, aimOf(t, route));
    }
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
  // Spec 0100, item 8 -- what each stack entry aimed at and where each beam
  // ended, for the next board to see what changed.
  // An entry whose beams were not drawn this board (another one in front:
  // Spellskite's ability above the Bolt, then resolving) keeps what it aimed
  // at when they last were, so its beam swings once it is drawn again.
  const beamsDrawn = new Set(lines.filter((l) => l.kind === "target").map((l) => l.from));
  linesSeen.current = {
    aims: new Map(
      (stack ?? []).map((s) => [
        s.id,
        beamsDrawn.has(s.id)
          ? s.targets.map(refKey)
          : (aimsBefore.current.get(s.id) ?? s.targets.map(refKey)),
      ]),
    ),
    tips: new Map(
      lines
        .filter((l) => l.kind === "target")
        .map((l) => [l.key, l.route[l.route.length - 1]!.end]),
    ),
  };
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
    <div
      ref={ref}
      className={`bf-board${veilHand ? " bf-veil-hand" : ""}`}
      data-testid="battlefield"
      // Spec 0083 (18 B) -- a split-second spell on the stack: the other
      // player's hand dims (battlefield.css) until it resolves.
      data-split-second={splitLock ?? undefined}
    >
      <div className="bf-felt-edge" style={{ width: g.play.w }} />
      {wash && (
        // Spec 0083 (14 C) -- the dusk or dawn wash, across the table.
        <div
          key={wash.key}
          className={`bf-wash bf-wash-${wash.to}`}
          data-wash={wash.to}
          aria-hidden="true"
          onAnimationEnd={(event) => {
            if ((event.target as HTMLElement).classList.contains("bf-wash-tint")) setWash(null);
          }}
        >
          {wash.to === "night" && <span className="bf-wash-dark" />}
          <span className="bf-wash-tint" />
        </div>
      )}
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
          // Spec 0106 -- the canvas's time: the sheet paces it (--pa-pace), so
          // reduce motion's pace of 1 (game.css) reaches it too.
          ["--move-ms" as string]: `${Math.round(SETTLE_MS / PACE)}ms`,
          ["--move-easing" as string]: SETTLE_EASING,
        }}
      >
        {items.map((item) => (
          <SlotView
            key={item.id}
            id={item.id}
            box={item.box}
            origin={item.origin}
            z={zOf(item)}
            cardW={g.cardW}
            cardH={g.cardH}
            landing={item.id === flyingOnto && item.ids.length === 1}
            register={registerSlot}
          >
            {item.content}
          </SlotView>
        ))}
        {reading && <ReadingCard reading={reading} />}
        {/* Spec 0087 -- the cards you (or they) may still use from a pile, in
            the fan beside that pile's plate. */}
        {fans.map((card) => {
          const box = fanBoxesNow.get(card.id);
          if (!box) return null;
          const a = act([card.id], true);
          const whose =
            card.side === "viewer"
              ? viewerName
                ? `${viewerName}'s`
                : "your"
              : `${opponentName}'s`;
          return (
            <FanCardView
              key={`fan:${card.id}`}
              card={card}
              box={box}
              className={a.className}
              breathes={a.breathing && !a.pay && !a.still}
              sight={a.targeted ? (a.theirs ? "theirs" : "mine") : null}
              label={[fanWords(card, whose), ...a.words].filter(Boolean).join(", ")}
              data={a.data}
              handlers={a.handlers}
              face={
                <CardFace
                  name={card.name}
                  look={lookOf(card.kind, card.types)}
                  type={shortType(card.types)}
                  pt={card.known ? figure(card) : ""}
                  art={card.art ? artUrl(card.art) : null}
                  crop={card.crop ? artUrl(card.crop) : null}
                  faceDown={card.faceDown}
                  known={card.known}
                  // Spec 0106 Amendment 1 (owner 2026-11-19, "drop the cost"):
                  // the whole name, no mana cost (the close-up and the cast
                  // show it); smaller until it fits, as a stack card's.
                  fit
                />
              }
            />
          );
        })}
        {fanMoreNow.map((more) => (
          <FanMoreView
            key={`fan-more:${more.side}`}
            more={more}
            who={more.side === "viewer" ? (viewerName ?? "you") : opponentName}
            onOpen={onFanMore ? (m) => onFanMore(m.side, m.zone) : undefined}
          />
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
        {[
          ...(stack ?? []).slice(0, spot.length).map((s, i) => ({ s, i, box: spot[i]! })),
          ...copying.flatMap((s) => {
            const box = waitingAt.get(s.id);
            return box ? [{ s, i: -1, box }] : [];
          }),
        ].map(({ s, i, box }) => {
          const a = act([s.id]);
          // Spec 0082 -- a card of copies on its way: not on the stack yet.
          const waiting = i < 0;
          const rk = keyOf(s);
          // Spec 0028: whose (gold yours, red theirs), its place in the
          // order (1 resolves next), its caster's picture; pointing at it
          // shows its line and fades the rest.
          const whose =
            s.seat === undefined
              ? ""
              : s.seat === viewerSeat
                ? " bf-stack-mine"
                : " bf-stack-theirs";
          // Spec 0100, item 9 (combat Q3 C) -- pointing at one no longer fades
          // the others: nothing dims; its source and targets lift instead.
          // W-20: the whole card, readable, when it has a picture this
          // viewer may see; a trigger or ability with its own words on it.
          const whole = box.scale >= STACK_READ_SCALE && !!s.art && s.name !== "Face-down";
          const kind = STACK_KIND[s.kind ?? "spell"] ?? "Spell";
          // Spec 0105 -- resting, nobody able to answer: how long its ring runs here.
          const ringMs = restRing(s, i);
          return (
            <div
              key={`stack-spot:${rk}`}
              ref={(element) => {
                if (element) {
                  stackEls.current.set(s.id, element);
                  stackEls.current.set(rk, element);
                } else {
                  stackEls.current.delete(s.id);
                  stackEls.current.delete(rk);
                }
              }}
              className={`bf-slot bf-stack-slot${waiting ? " bf-stack-waiting" : ""}`}
              data-waiting={waiting ? "true" : undefined}
              data-rising={rose.current.has(s.id) ? "true" : undefined}
              style={{
                width: g.cardW,
                height: g.cardH,
                transformOrigin: "0 0",
                transform: `translate3d(${box.x}px, ${box.y}px, 0) scale(${box.scale})`,
                // Pointed at, a card lower in the stack comes to the front.
                // Spec 0082: copies on their way are in front of it all.
                zIndex: waiting
                  ? Z_LINES - 98
                  : focus === s.id && i > 0
                    ? Z_LINES - 99
                    : Z_LINES - 100 - i,
                ["--stack-scale" as string]: String(box.scale),
                ...(hiddenStack === s.id ? { opacity: 0 } : {}),
                ...(quietStack?.has(s.id) ||
                rose.current.has(s.id) ||
                (s.copy && s.copyOf) ||
                (seenStack !== null && (s.members ?? []).some((id) => seenStack.has(id)))
                  ? { animation: "none" }
                  : {}),
              }}
            >
              {/* Spec 0088 (Q5 C) -- a spell a spell targets (Counterspell's) wears the corners too. */}
              {a.targeted && <Sight theirs={a.theirs} />}
              <button
                type="button"
                className={`bf-card bf-stack-card bf-look-artifact${i === 0 ? " bf-stack-top" : ""}${whose}${a.className}${a.breathing && !a.pay && !a.still ? " bf-breathes" : ""}`}
                aria-label={[
                  `${s.copy ? "a copy of " : ""}${s.name}${s.count ? ` ×${s.count}` : ""}, ${waiting ? "on its way to the stack" : "on the stack"}`,
                  s.splitSecond ? "split second" : "",
                  s.cantBeCountered ? "can't be countered" : "",
                  waiting ? "" : `${ordinal(i + 1)} to resolve`,
                  s.by ? `from ${s.by}` : "",
                  ...a.words,
                ]
                  .filter(Boolean)
                  .join(", ")}
                data-object-id={s.id}
                data-zone="stack"
                // Spec 0088 (Q1 A) -- a spell's own triggers (cascade) lift off it.
                data-rise-from={s.kind === "spell" && s.card ? `spell:${s.card}` : undefined}
                data-order={i + 1}
                data-copy={s.copy ? "true" : undefined}
                data-count={s.count}
                // Spec 0082 -- the copies this card draws, for the jump check
                // (one still peeling onto it is drawn by its own peel).
                data-members={
                  s.things
                    ? s.things.filter((t) => !peeling.current.has(t)).join(" ") || undefined
                    : // Spec 0083 (L2) -- an "xN" card of identical triggers draws
                      // each of them: the next takes over as the one leading resolves.
                      s.members && s.members.length > 1
                      ? s.members.join(" ")
                      : undefined
                }
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
                    fit
                  />
                )}
                {/* Spec 0100, item 2 (round 2 Q2 B) -- a modal spell's body: every
                    mode as printed, the chosen lit gold, the rest struck through. */}
                {s.modes && s.modes.length > 0 && <ModeLines modes={s.modes} />}
                {s.copy && <CopyMark />}
                {/* Spec 0083 (18 B) -- what the spell is: split second's
                    stopwatch, can't be countered's seal. */}
                {(s.splitSecond || s.cantBeCountered) && (
                  <SpellMark splitSecond={!!s.splitSecond} above={!!s.copy} />
                )}
              </button>
              {a.breathing && !a.pay && !a.still && <Breath />}
              {/* Spec 0100, item 1 (round 2 Q1 B) -- the X its caster paid, a gold
                  medallion on the card's top-right corner while it is on the stack. */}
              {s.x !== undefined && <XMedallion x={s.x} />}
              {/* Spec 0083 (18 B) -- split second: a gold ring closes round
                  the card while it is on the stack (nobody may answer). */}
              {s.splitSecond && !waiting && (
                <span className="bf-split-ring" data-split-ring={s.id} aria-hidden="true" />
              )}
              {/* Spec 0105 (owner Q2 B) -- the act button's "Resolves in" coin
                  on the card's corner, no words and nothing to click: its gold
                  ring empties until the game resolves it. */}
              {ringMs !== null && (
                <span
                  className="bf-stack-rest gs-coin-timer"
                  data-rest-ring={s.id}
                  data-rest-ms={Math.round(ringMs)}
                  aria-hidden="true"
                  style={{
                    width: g.cardW * REST_RING,
                    height: g.cardW * REST_RING,
                    left: g.cardW * (REST_RING_X - REST_RING / 2),
                    top: g.cardH * REST_RING_Y - (g.cardW * REST_RING) / 2,
                  }}
                >
                  <svg className="gs-coin-dial" viewBox="0 0 46 46">
                    <circle
                      className="gs-coin-ring"
                      cx="23"
                      cy="23"
                      r="20"
                      pathLength={100}
                      style={{ animationDuration: `${Math.round(ringMs)}ms` }}
                    />
                  </svg>
                  <i className="bf-stack-rest-dot" />
                </span>
              )}
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
              {!waiting && i === studAt && (
                <span
                  className="bf-stack-stud"
                  data-stud="true"
                  aria-hidden="true"
                  style={{ top: `${((studY(spot, i, g.cardH) - box.y) / box.h) * 100}%` }}
                />
              )}
              {/* Beside the card's name bar, so neither covers the name. */}
              <span className="bf-stack-tag" aria-hidden="true">
                {!waiting && <span className="bf-stack-n">{i + 1}</span>}
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
        {/* Spec 0066: not before its only card has landed. Spec 0086,
            Amendment 3: not before ANY card it tells has landed. */}
        {landed.length > 0 && spot[0] && (
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
              {stackCaption(landed, viewerSeat, landedTotal, spot.length, viewerName)}
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
        {peeks.map((p) => (
          <PeekCard
            key={`peek:${p.card.id}`}
            card={p.card}
            box={p.box}
            tile={p.tile}
            theirs={p.theirs}
            artUrl={artUrl}
            z={Z_LINES - 201}
          />
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
                  line.look?.swing && line.look.routeTo ? (
                    // Spec 0100, item 8 -- its end swinging to the new target.
                    <SwingBeam
                      look={{ ...line.look, swing: line.look.swing }}
                      route={route}
                      aim={line.aim}
                      routeTo={line.look.routeTo}
                      w={w}
                      onDone={swingDone}
                    />
                  ) : (
                    <TargetBeam
                      route={route}
                      aim={line.aim}
                      w={w}
                      reduced={still}
                      tone={line.look?.tone ?? "mine"}
                      doubled={!!line.look?.doubled}
                      share={line.look?.share}
                    />
                  )
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
        {overlay?.(
          // Spec 0094 -- a hand card pointed at is "where" its reading card
          // is: a card cast from there rises from it.
          (id) =>
            (reading?.id === id ? reading.box : null) ??
            positions.get(id)?.box ??
            spotBox.get(id) ??
            waitingBox.get(id) ??
            fanBox(id) ??
            null,
          g,
        )}
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
            key={`ghost:${ghost.id}${ghost.turn === "back" ? ":back" : ""}`}
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
        {fizzles.map((f) => (
          <FizzleView
            key={f.key}
            fizzle={f}
            width={g.width}
            height={g.height}
            done={() => setFizzles((list) => list.filter((x) => x.key !== f.key))}
          />
        ))}
        {strikes.map((s) => (
          <StrikeView
            key={s.key}
            strike={s}
            width={g.width}
            height={g.height}
            k={g.height / CANVAS_H}
            done={() => setStrikes((list) => list.filter((x) => x.key !== s.key))}
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
    // Spec 0074: its whole movement, worked out already (graves.ts).
    if (ghost.own) {
      const run = element.animate(ghost.own.frames, {
        duration: ghost.own.duration,
        easing: "linear",
        delay: ghost.delay,
        fill: ghost.waits ? "forwards" : "both",
      });
      element.classList.add("bf-moving");
      run.onfinish = done;
      // Spec 0079: and the card inside it turning (Clone's old face, flipping away).
      const card = ghost.inner ? element.querySelector<HTMLElement>(":scope > .bf-card") : null;
      const turn =
        ghost.inner && card && typeof card.animate === "function"
          ? card.animate(ghost.inner.frames, {
              duration: ghost.inner.duration,
              delay: ghost.inner.delay,
              easing: "linear",
              fill: "both",
            })
          : null;
      return () => {
        run.onfinish = null;
        run.cancel();
        turn?.cancel();
      };
    }
    // Phase 10 A-00: Glide to where it went -- first showing it was
    // defeated or exiled (A-04, A-05), in the same animation. Spec 0073:
    // out of a pile, it peels off the top first.
    const fated = ghost.fate
      ? ghost.peel
        ? peelFrames(
            ghost.fate,
            ghost.box,
            ghost.to,
            cardW,
            cardH,
            ghost.origin,
            ghost.toOrigin,
            ghost.peel.dx,
            ghost.peel.dy,
          )
        : fateFrames(ghost.fate, ghost.box, ghost.to, cardW, cardH, ghost.origin, ghost.toOrigin)
      : null;
    // Spec 0073: a token grows out of its source, then Glides to its pile;
    // a card out of the other player's hidden hand turns face up on the way.
    const made = ghost.token
      ? tokenFrames(ghost.box, ghost.to, cardW, cardH, ghost.toOrigin, ghost.spread)
      : null;
    const turned = ghost.turn
      ? turnUp(
          glideFrames(ghost.box, ghost.to, cardW, cardH, ghost.origin, ghost.toOrigin),
          ghost.turn,
        )
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
        made ??
        turned ??
        glideFrames(
          ghost.box,
          ghost.to,
          cardW,
          cardH,
          ghost.origin,
          ghost.toOrigin,
          { from: ghost.faint ? 0.2 : 1, to: ghost.fade ? 0.15 : 1 },
          null,
          // A-17: pulled along its chain.
          ghost.chained ? { arc: PULL_ARC } : {},
        ),
      {
        duration:
          fated?.duration ??
          (returned ? RETURN_MS : made ? TOKEN_MS : ghost.chained ? PULL_MS : MOVE_MS),
        easing: "linear",
        delay: ghost.delay,
        // Spec 0073: one waiting under its pile is unseen until it starts.
        fill: ghost.waits ? "forwards" : "both",
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
    const turnedDown =
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
      turnedDown?.cancel();
    };
    // Runs once: a ghost goes where it was sent when it appeared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Spec 0091 Amendment 1 -- unseen until the casting card flying onto its
  // spot has landed (made after its own movement, so it wins until then).
  useLayoutEffect(() => {
    const element = ref.current;
    if (!ghost.unseen || !element || typeof element.animate !== "function") return undefined;
    const unseen = element.animate([{ opacity: 0 }, { opacity: 0 }], {
      duration: ghost.unseen,
      id: "unseen-landing",
    });
    return () => unseen.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once
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
        ...(ghost.waits ? { opacity: 0 } : {}),
        ...(ghost.stack ? { ["--stack-scale" as string]: String(ghost.box.scale) } : {}),
        ...(ghost.fate
          ? { ["--fx-delay" as string]: `${ghost.delay + (ghost.peel ? PEEL_MS : 0)}ms` }
          : {}),
        // Spec 0074: a countered spell's ash rises as the beam strikes it;
        // an exiled card's light as it rises.
        ...(ghost.ash ? { ["--fx-delay" as string]: `${ghost.delay + STRIKE_MS}ms` } : {}),
        ...(ghost.motes ? { ["--fx-delay" as string]: `${ghost.delay}ms` } : {}),
        // Spec 0079: a copy's gold motes as it ends; a fizzled spell's smoke.
        ...(ghost.gold || ghost.smoke
          ? { ["--fx-delay" as string]: `${ghost.delay + (ghost.fxAt ?? 0)}ms` }
          : {}),
      }}
      data-peel={ghost.peel ? "true" : undefined}
      data-token={ghost.token ? "true" : undefined}
      data-turn={ghost.turn}
      data-countered={ghost.ash ? "true" : undefined}
      data-copy-end={ghost.gold ? "true" : undefined}
      data-fizzled={ghost.smoke ? "true" : undefined}
      data-bundle={ghost.badge}
      data-bundled={ghost.bundled ? "true" : undefined}
    >
      {ghost.turn === "back" ? (
        // Spec 0073 -- the other player's card back, as their fan draws it.
        <div className="bf-card bf-opp-hand">
          <img className="bf-opp-back" src={cardBack} alt="" draggable={false} />
        </div>
      ) : ghost.stack ? (
        // Amendment 13 (item 13) -- as it was on the stack.
        <div className={`bf-card bf-stack-card bf-look-artifact${ghost.stack.whose}`}>
          <SharpCard
            low={ghost.stack.low}
            high={ghost.stack.high}
            alt=""
            className="bf-stack-whole"
          />
          {ghost.returning?.back && <ReturnBack />}
          {ghost.mark && <CopyMark />}
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
          {ghost.mark && <CopyMark />}
          {ghost.fate && <FateMarks fate={ghost.fate} />}
          {ghost.returning?.back && <ReturnBack />}
          {ghost.badge !== undefined && <span className="bf-pile">×{ghost.badge}</span>}
        </div>
      )}
      {(ghost.fate === "exiled" || ghost.motes) && <Motes />}
      {ghost.ash && <Motes ash />}
      {ghost.gold && <Motes kind="gold" />}
      {ghost.smoke && <Motes kind="smoke" />}
    </div>
  );
}

/**
 * Phase 10 A-13 -- one mark of a fight: the dimming, a caption, sparks, a
 * slash mark, a number, the hurt. Its animation is on the board's clock
 * (a click hurries it); it is gone when its animation ends.
 */
/**
 * Spec 0085 (4 A) -- a held card's picture on its tab: its art crop (else the
 * card), in a small gold-rimmed square; a back for a card the viewer may not
 * see; a plain square with no picture (a token, a deck without art).
 */
function HeldPicture({ held, artUrl }: { held: HeldCard; artUrl: (art: string) => string }) {
  const art = held.known ? (held.crop ?? held.art) : null;
  return (
    <span className={`bf-tag-pic${held.known ? "" : " bf-tag-pic-back"}`} aria-hidden="true">
      {art && <img src={artUrl(art)} alt="" />}
    </span>
  );
}

function FightMarkDrawn({ mark, done }: { mark: FightMark; done: () => void }) {
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
      className={`bf-fight-${mark.kind}${mark.kind === "riser" && mark.markOf?.icon === "lost" ? " bf-fight-riser-lost" : ""}${mark.deathtouch ? " bf-fight-deathtouch" : ""}${mark.poison ? " bf-fight-poisoned" : ""}${mark.tone ? ` bf-fight-${mark.tone}` : ""}`}
      data-fight={mark.kind}
      data-of={mark.of}
      data-ghost-of={mark.ghostOf}
      data-impact={mark.impact}
      data-damage-number={mark.damageNumber}
      style={{ ...mark.style, opacity: 0 }}
    >
      {mark.kind === "crack" ? (
        mark.card ? (
          CRACK_CARD
        ) : (
          CRACK
        )
      ) : mark.kind === "dome" ? (
        <HexDome id={mark.key} />
      ) : mark.kind === "shieldbreak" ? (
        REGEN_SHIELD
      ) : mark.kind === "poison" ? (
        <>
          {POISON_DROP}
          <span>{mark.text}</span>
        </>
      ) : mark.kind === "riser" && mark.markOf ? (
        <MarkIcon mark={mark.markOf} />
      ) : mark.kind === "umbrashield" ? (
        <UmbraShield id={mark.key} src={mark.src ?? null} />
      ) : mark.kind === "silvershield" ? (
        <UmbraShield id={mark.key} src={null} tone="silver" />
      ) : mark.kind === "regenshield" ? (
        REGEN_SHIELD
      ) : mark.kind === "umbratab" && mark.heldTab ? (
        <>
          <span className="bf-tag-glyph" aria-hidden="true" />
          <span className="bf-tag-name">{mark.heldTab.name}</span>
        </>
      ) : mark.kind === "heldtab" && mark.heldTab ? (
        <>
          <span
            className={`bf-tag-pic${mark.heldTab.known ? "" : " bf-tag-pic-back"}`}
            aria-hidden="true"
          >
            {mark.heldTab.src && <img src={mark.heldTab.src} alt="" />}
          </span>
          {mark.heldTab.known && <span className="bf-tag-name">{mark.heldTab.name}</span>}
        </>
      ) : (
        mark.text
      )}
    </div>
  );
}

const FightMarkView = memo(FightMarkDrawn, (a, b) => a.mark === b.mark);

/**
 * Spec 0074 (F · Struck by the beam) -- the countering spell's gold beam
 * (spec 0069's, from its stud to the countered spell's ripple) flares, a
 * pulse runs down it, and the ripple bursts. Each part is an animation on
 * the board's clock (a click hurries it); gone when the beam has faded.
 */
function StrikeView({
  strike,
  width,
  height,
  k,
  done,
}: {
  strike: Strike;
  width: number;
  height: number;
  k: number;
  done: () => void;
}) {
  const beam = useRef<SVGPathElement>(null);
  const pulse = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const b = beam.current;
    if (!b || typeof b.animate !== "function" || reducedMotion()) {
      done();
      return;
    }
    const timing = {
      duration: STRIKE_FX_MS,
      delay: strike.delay,
      easing: "linear",
      fill: "both" as const,
    };
    const runs = [
      b.animate(strikeBeamFrames(strike.w), timing),
      pulse.current?.animate(strikePulseFrames(strike.points), timing),
      ring.current?.animate(strikeRingFrames(strike.ring.r, k), timing),
    ];
    runs[0]!.onfinish = done;
    return () => {
      runs[0]!.onfinish = null;
      for (const run of runs) run?.cancel();
    };
    // Runs once: a strike plays what it was given when it appeared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      className="bf-strike"
      data-strike={strike.of}
      data-tone={strike.tone}
      aria-hidden="true"
      style={{ zIndex: Z_LINES - 40 }}
    >
      <svg width={width} height={height}>
        <path
          ref={beam}
          d={strike.d}
          fill="none"
          stroke={strike.tone === "theirs" ? "#8f9cff" : "#f1c36a"}
          strokeWidth={strike.w}
          strokeLinecap="round"
          style={{ opacity: 0 }}
        />
      </svg>
      <div ref={pulse} className="bf-strike-pulse" style={{ opacity: 0 }} />
      <div
        ref={ring}
        className="bf-strike-ring"
        style={{
          left: strike.ring.at.x,
          top: strike.ring.at.y,
          width: strike.ring.r * 2,
          height: strike.ring.r * 2,
          opacity: 0,
        }}
      />
    </div>
  );
}

/**
 * Spec 0079 (Q4 A) -- the beam draws to the held spot (FIZZLE_REACH_MS) and
 * fades; a dashed ring there grows, turns and breaks up. On the board's
 * clock (a click hurries it); gone when it ends.
 */
function FizzleView({
  fizzle,
  width,
  height,
  done,
}: {
  fizzle: Fizzle;
  width: number;
  height: number;
  done: () => void;
}) {
  const beam = useRef<SVGPathElement>(null);
  const glow = useRef<SVGPathElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  useLayoutEffect(() => {
    const b = beam.current;
    const r = ring.current;
    if (!b || !r || typeof b.animate !== "function" || reducedMotion()) {
      done();
      return;
    }
    const total = FIZZLE_BEAM_OUT_AT + paced(300);
    const at = (ms: number) => ms / total;
    const draw: Keyframe[] = [
      { offset: 0, strokeDashoffset: 1, opacity: 1 },
      { offset: at(FIZZLE_REACH_MS), strokeDashoffset: 0, opacity: 1 },
      { offset: at(FIZZLE_BEAM_OUT_AT), strokeDashoffset: 0, opacity: 1 },
      { offset: 1, strokeDashoffset: 0, opacity: 0 },
    ];
    const opts = { duration: total, delay: fizzle.delay, easing: "linear", fill: "both" as const };
    const runs = [b.animate(draw, opts)];
    if (glow.current) runs.push(glow.current.animate(draw, opts));
    runs.push(
      r.animate(
        [
          { offset: 0, opacity: 1, transform: "scale(0.35)", strokeDashoffset: 0 },
          { offset: 1, opacity: 0, transform: "scale(1)", strokeDashoffset: -20 },
        ],
        {
          duration: FIZZLE_RING_MS,
          delay: fizzle.delay + FIZZLE_REACH_MS,
          easing: "linear",
          fill: "forwards",
        },
      ),
    );
    const finish = () => {
      if (runs.every((run) => run.playState === "finished")) done();
    };
    for (const run of runs) run.onfinish = finish;
    return () => {
      for (const run of runs) {
        run.onfinish = null;
        run.cancel();
      }
    };
    // Runs once: it plays what it was given when it appeared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <svg
      className="bf-fizzle"
      data-fizzle-of={fizzle.of}
      width={width}
      height={height}
      aria-hidden="true"
      style={{ zIndex: Z_EFFECTS + 5 }}
    >
      <path
        ref={glow}
        d={fizzle.d}
        pathLength={1}
        className="bf-fizzle-glow"
        strokeWidth={fizzle.w * 2.6}
        style={{ opacity: 0 }}
      />
      <path
        ref={beam}
        d={fizzle.d}
        pathLength={1}
        className="bf-fizzle-beam"
        strokeWidth={fizzle.w}
        style={{ opacity: 0 }}
      />
      <circle
        ref={ring}
        className="bf-fizzle-ring"
        cx={fizzle.ring.x}
        cy={fizzle.ring.y}
        r={fizzle.ring.r}
        style={{ opacity: 0, transformOrigin: `${fizzle.ring.x}px ${fizzle.ring.y}px` }}
      />
    </svg>
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
  if (mark.kind === "spark")
    // Spec 0073 -- the flare a token grows out of, with its rays.
    return (
      <div
        ref={ref}
        className="bf-token-spark"
        data-spark={mark.of}
        aria-hidden="true"
        style={style}
      >
        {Array.from({ length: 8 }, (_, i) => (
          <span
            key={i}
            className="bf-token-ray"
            style={{ transform: `rotate(${i * 45}deg) translateY(calc(var(--card-h) * -0.2))` }}
          />
        ))}
      </div>
    );
  return mark.kind === "tag" ? (
    <div
      ref={ref}
      className="bf-return-tag"
      data-return-tag={mark.of}
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

/**
 * Spec 0079 -- the gold copy mark: 0076's "gold-rimmed square = something
 * the card is", two overlapping cards in it. On a copied spell's stack card.
 */
function CopyMark() {
  return (
    <span
      className="bf-mark bf-mark-copy bf-copy-on-stack"
      data-copy-mark="true"
      aria-hidden="true"
    >
      {TWIN}
    </span>
  );
}

/**
 * Spec 0083 (18 B) -- 0076's gold-rimmed square on a spell's stack card:
 * split second (a stopwatch) or can't be countered (a seal), low on the left
 * where a copy's mark goes (above it, on a copy). It pops in as the card
 * lands on the stack.
 */
function SpellMark({ splitSecond, above }: { splitSecond: boolean; above: boolean }) {
  return (
    <span
      className={`bf-mark bf-spell-mark${above ? " bf-spell-mark-above" : ""}`}
      data-spell-mark={splitSecond ? "split-second" : "cant-be-countered"}
      aria-hidden="true"
    >
      {splitSecond ? STOPWATCH : SEAL}
    </span>
  );
}

/** A-05 -- the pale light rising off an exiled card: fixed places, so a test can count them. */
const MOTES = Array.from({ length: 14 }, (_, i) => ({
  x: 8 + ((i * 37) % 84),
  y: 20 + ((i * 53) % 70),
  rise: 40 + ((i * 29) % 45),
  late: (i * 47) % 160,
}));
function Motes({ ash = false, kind }: { ash?: boolean; kind?: "gold" | "smoke" }) {
  return (
    <span className="bf-motes" aria-hidden="true">
      {MOTES.map((m, i) => (
        <span
          key={i}
          // Spec 0074 -- a countered spell crumbles to grey ash. Spec 0079 --
          // a copy ends in gold motes; a fizzled spell goes up in smoke.
          className={ash ? "bf-mote bf-mote-ash" : kind ? `bf-mote bf-mote-${kind}` : "bf-mote"}
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
